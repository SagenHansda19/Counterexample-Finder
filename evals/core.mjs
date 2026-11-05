// Verification core shared by the eval. Mirrors app/src/worker/runner.worker.ts.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deepEqual(a, b) {
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

export function buildHarness(userCode, artifact) {
  const userFn = new Function(`"use strict"; ${userCode}\n; return ${artifact.entryName};`)();
  const makeInput = new Function(`"use strict"; ${artifact.generatorCode}\n; return makeInput;`)();
  const bruteFn = new Function(`"use strict"; ${artifact.bruteForceCode}\n; return bruteForce;`)();
  const run = (args) => {
    let userOut, userErr, bruteOut, bruteErr;
    try { userOut = userFn(...args); } catch (e) { userErr = e.message; }
    try { bruteOut = bruteFn(...args); } catch (e) { bruteErr = e.message; }
    return { userOut, bruteOut, userErr, bruteErr };
  };
  return { makeInput, run };
}

export function classify(e, args) {
  if (!e.userErr && !e.bruteErr) {
    if (!deepEqual(e.userOut, e.bruteOut)) return { ok: true, kind: 'mismatch', input: args, userOutput: e.userOut, expected: e.bruteOut };
    return null;
  }
  if (e.userErr && !e.bruteErr) return { ok: true, kind: 'crash', input: args, userError: e.userErr, expected: e.bruteOut };
  return null;
}

// Returns true if a counterexample is found. `expectedBug` (true) => should find one,
// `expectedBug` (false) => "clean" => should NOT be flagged.
export function catchesBug(userCode, artifact, expectedBug = true) {
  const testsRun = artifact.testCount;
  const rng = mulberry32(7);
  const { makeInput, run } = buildHarness(userCode, artifact);
  const failures = [];
  for (let i = 1; i <= testsRun; i++) {
    const size = Math.max(1, artifact.maxInputSize - Math.floor(rng() * 4));
    const args = makeInput(rng, size);
    const f = classify(run(args), args);
    if (f) failures.push(f);
  }
  return failures.length > 0;
}
