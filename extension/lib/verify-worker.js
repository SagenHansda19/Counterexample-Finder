// verify-worker.js — runs the brute-force vs. the user's solution on seeded
// random tests and finds the SMALLEST failing input. Runs in a Web Worker.
'use strict';

self.onmessage = (e) => {
  const { userCode, artifact, seed } = e.data;
  try {
    const rng = mulberry32(seed >>> 0);

    const userFn = new Function('"use strict"; ' + userCode + '\n; return ' + artifact.entryName + ';')();
    const makeInput = new Function('"use strict"; ' + artifact.generatorCode + '\n; return makeInput;')();
    const bruteFn = new Function('"use strict"; ' + artifact.bruteForceCode + '\n; return bruteForce;')();
    if (typeof userFn !== 'function' || typeof bruteFn !== 'function' || typeof makeInput !== 'function') {
      throw new Error('entry point or harness function could not be built');
    }
    const run = (args) => {
      let userOut, userErr, bruteOut, bruteErr;
      try { userOut = userFn(...args); } catch (err) { userErr = String(err); }
      try { bruteOut = bruteFn(...args); } catch (err) { bruteErr = String(err); }
      return { userOut, bruteOut, userErr, bruteErr };
    };

    const findings = [];
    const timing = [];
    let bothFailed = false;
    const total = Math.max(1, artifact.testCount || 60);

    for (let i = 1; i <= total; i++) {
      const size = Math.max(1, (artifact.maxInputSize || 10) - Math.floor(rng() * 4));
      const args = makeInput(rng, size);
      const res = run(args);
      if (res.userErr && res.bruteErr) bothFailed = true;
      const f = classify(res, args);
      if (f) findings.push(f);
      timing.push({ test: i });
      if (i % 5 === 0 || i === total) post({ type: 'progress', done: i, total });
    }

    let best = pickBest(findings);
    if (best) best = shrinkSearch(best, run);

    // Also produce a handful of test cases (input + expected) for the Test Cases tab.
    const testCases = [];
    const rng2 = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    for (let k = 0; k < 5; k++) {
      const size = Math.max(1, (artifact.maxInputSize || 10) - Math.floor(rng2() * 4));
      const args = makeInput(rng2, size);
      testCases.push({ input: args, expected: bruteFn(...args) });
    }

    post({ type: 'done', result: { seed, testsRun: total, findings, best, bothFailed, testCases } });
  } catch (err) {
    post({ type: 'error', error: err.message || String(err) });
  }
};

function post(m) {
  self.postMessage(m);
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function sizeMetric(args) {
  let total = 0;
  const walk = (v) => {
    if (Array.isArray(v)) { total += v.length; v.forEach(walk); }
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    else if (typeof v === 'number') total += Math.abs(v);
    else total += 1;
  };
  args.forEach(walk);
  return total;
}

function classify(res, args) {
  if (!res.userErr && !res.bruteErr) {
    if (!deepEqual(res.userOut, res.bruteOut)) {
      return { kind: 'mismatch', input: args, userOutput: res.userOut, expected: res.bruteOut, sizeMetric: sizeMetric(args) };
    }
    return null;
  }
  if (res.userErr && !res.bruteErr) {
    return { kind: 'crash', input: args, userError: res.userErr, expected: res.bruteOut, sizeMetric: sizeMetric(args) };
  }
  return null;
}

function pickBest(found) {
  let best = null;
  for (const f of found) if (!best || f.sizeMetric < best.sizeMetric) best = f;
  return best;
}

function shrinkSearch(best, run) {
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
