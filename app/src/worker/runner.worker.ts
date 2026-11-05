/// <reference lib="webworker" />
import type { Artifact, Finding, WorkerMessage, WorkerRequest, WorkerResult, Evals } from './protocol';

const ctx = self as unknown as Worker;
const post = (m: WorkerMessage) => (ctx.postMessage as (msg: WorkerMessage) => void)(m);

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  }
  return false;
}

function sizeMetric(args: unknown[]): number {
  let total = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      total += v.length;
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v as object).forEach(walk);
    } else if (typeof v === 'number') {
      total += Math.abs(v);
    } else {
      total += 1;
    }
  };
  args.forEach(walk);
  return total;
}

interface Harness {
  run: (args: unknown[]) => Evals;
  makeInput: (rng: () => number, size: number) => unknown[];
}

function buildHarness(userCode: string, artifact: Artifact): Harness {
  const userFn = new Function(
    `"use strict"; ${userCode}\n; return ${artifact.entryName};`,
  )();
  const makeInput = new Function(
    `"use strict"; ${artifact.generatorCode}\n; return makeInput;`,
  )();
  const bruteFn = new Function(
    `"use strict"; ${artifact.bruteForceCode}\n; return bruteForce;`,
  )();
  if (typeof userFn !== 'function' || typeof bruteFn !== 'function' || typeof makeInput !== 'function') {
    throw new Error('entry point or harness function could not be built');
  }
  const run = (args: unknown[]): Evals => {
    let userOut: unknown;
    let userErr: string | undefined;
    let bruteOut: unknown;
    let bruteErr: string | undefined;
    const t0 = performance.now();
    try {
      userOut = (userFn as (...a: unknown[]) => unknown)(...args);
    } catch (e) {
      userErr = e instanceof Error ? e.message : String(e);
    }
    const t1 = performance.now();
    try {
      bruteOut = (bruteFn as (...a: unknown[]) => unknown)(...args);
    } catch (e) {
      bruteErr = e instanceof Error ? e.message : String(e);
    }
    const t2 = performance.now();
    return { userOut, bruteOut, userErr, bruteErr, userMs: t1 - t0, bruteMs: t2 - t1 };
  };
  return { run, makeInput };
}

function classify(e: Evals, args: unknown[]): Finding | null {
  if (!e.userErr && !e.bruteErr) {
    if (!deepEqual(e.userOut, e.bruteOut)) {
      return { kind: 'mismatch', input: args, userOutput: e.userOut, expected: e.bruteOut, sizeMetric: sizeMetric(args) };
    }
    return null;
  }
  if (e.userErr && !e.bruteErr) {
    return { kind: 'crash', input: args, userError: e.userErr, expected: e.bruteOut, sizeMetric: sizeMetric(args) };
  }
  return null;
}

function pickBest(found: Finding[]): Finding | null {
  let best: Finding | null = null;
  for (const f of found) if (!best || f.sizeMetric < best.sizeMetric) best = f;
  return best;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { userCode, artifact, seed } = e.data;
  try {
    const harness = buildHarness(userCode, artifact);
    const rng = mulberry32(seed);
    const findings: Finding[] = [];
    const timing: WorkerResult['timing'] = [];
    const total = Math.max(1, artifact.testCount);
    let bothFailed = false;

    for (let i = 1; i <= total; i++) {
      const size = Math.max(1, artifact.maxInputSize - Math.floor(rng() * 4));
      const args = harness.makeInput(rng, size);
      const res = harness.run(args);
      if (res.userErr && res.bruteErr) bothFailed = true;
      const f = classify(res, args);
      if (f) findings.push(f);
      timing.push({ test: i, userMs: res.userMs, bruteMs: res.bruteMs });
      if (i % 5 === 0 || i === total) post({ type: 'progress', done: i, total });
    }

    let best = pickBest(findings);
    if (best) best = shrinkSearch(best, harness.run);

    const result: WorkerResult = { seed, testsRun: total, findings, best, bothFailed, timing };
    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};

// Trim the smallest failing input while it still fails, so we return the SMALLEST.
function shrinkSearch(best: Finding, run: Harness['run']): Finding {
  let cur = best;
  let budget = 90;
  let improved = true;
  while (improved && budget > 0) {
    improved = false;
    for (let idx = 0; idx < cur.input.length && budget > 0; idx++) {
      const item = cur.input[idx];
      if (!Array.isArray(item)) continue;
      for (let len = item.length - 1; len >= 0 && budget > 0; len--) {
        budget--;
        const candidate = cur.input.slice();
        candidate[idx] = item.slice(0, len);
        const f = classify(run(candidate), candidate);
        if (f && f.sizeMetric < cur.sizeMetric) {
          cur = f;
          improved = true;
          break;
        }
      }
    }
  }
  return cur;
}

