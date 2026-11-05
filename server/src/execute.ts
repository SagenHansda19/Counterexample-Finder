/**
 * Runs the AI-generated reference + (transcribed) user solution on a seeded set
 * of random inputs and finds the SMALLEST failing input. Runs in Node's `vm`
 * module (the extension cannot, so this happens server-side). A per-run timeout
 * stops runaway model code.
 */
import vm from 'node:vm';

export interface Artifact {
  entryName: string;
  bruteForceCode: string;
  generatorCode: string;
  userJs: string;
  normalizeCode?: string;
  maxInputSize: number;
  testCount: number;
}

export interface Finding {
  kind: 'mismatch' | 'crash';
  input: unknown;
  userOutput?: unknown;
  userError?: string;
  expected: unknown;
}

export interface RunResult {
  testsRun: number;
  best: Finding | null;
  bothFailed: boolean;
  genFailures: number;
  testCases: { input: unknown; expected: unknown }[];
}

const HARNESS_HEAD = `
(function () {
  function mulberry32(sd){let s=sd>>>0;return function(){s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
  function deepEqual(a,b){if(Object.is(a,b))return true;if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!deepEqual(a[i],b[i]))return false;return true;}if(a&&b&&typeof a==="object"&&typeof b==="object"){const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;for(const k of ka)if(!Object.prototype.hasOwnProperty.call(b,k)||!deepEqual(a[k],b[k]))return false;return true;}return false;}
  function sizeMetric(args){let tot=0;const w=v=>{if(Array.isArray(v)){tot+=v.length;v.forEach(w);}else if(v&&typeof v==="object")Object.values(v).forEach(w);else if(typeof v==="number")tot+=Math.abs(v);else tot+=1;};args.forEach(w);return tot;}
  function classify(res,args){ if(!res.userErr&&!res.bruteErr){ if(!deepEqual(__canon(res.userOut,args), __canon(res.bruteOut,args))) return{kind:"mismatch",input:args,userOutput:res.userOut,expected:res.bruteOut,sizeMetric:sizeMetric(args)};return null;}if(res.userErr&&!res.bruteErr)return{kind:"crash",input:args,userError:res.userErr,expected:res.bruteOut,sizeMetric:sizeMetric(args)};return null;}
  function pickBest(f){let b=null;for(const x of f)if(!b||x.sizeMetric<b.sizeMetric)b=x;return b;}
  function shrinkSearch(best,run){let cur=best;let budget=90;let improved=true;while(improved&&budget>0){improved=false;for(let idx=0;idx<cur.input.length&&budget>0;idx++){const item=cur.input[idx];if(!Array.isArray(item))continue;for(let len=item.length-1;len>=0&&budget>0;len--){budget--;const c=cur.input.slice();c[idx]=item.slice(0,len);const f=classify(run(c),c);if(f&&f.sizeMetric<cur.sizeMetric){cur=f;improved=true;break;}}}}return cur;}
  `;

const HARNESS_TAIL = `
  const __canon = (typeof canon === 'function') ? function (x, i) { try { return canon(x, i); } catch (e) { return x; } } : function (x) { return x; };
  const __user = __ENTRY__;
  const __brute = bruteForce;
  const __make = makeInput;
  if (typeof __user !== "function" || typeof __brute !== "function" || typeof __make !== "function") {
    throw new Error("could not build runnable functions (entry: " + __ENTRY_NAME__ + ")");
  }
  const seed = __SEED__ >>> 0;
  const rng = mulberry32(seed);
  function run(args) { let uo, bu, ue, be; try { uo = __user(...args); } catch (e) { ue = String(e); } try { bu = __brute(...args); } catch (e) { be = String(e); } return { userOut: uo, bruteOut: bu, userErr: ue, bruteErr: be }; }
  const total = __TOTAL__; const maxN = __MAXN__;
  const findings = []; let bothFailed = false; let genFailures = 0;
  function gen() { for (let t = 0; t < 5; t++) { try { const size = Math.max(1, maxN - Math.floor(rng() * 4)); return __make(rng, size); } catch (e) { genFailures++; } } return null; }
  for (let i = 1; i <= total; i++) { const args = gen(); if (!args) continue; const res = run(args); if (res.userErr && res.bruteErr) bothFailed = true; const f = classify(res, args); if (f) findings.push(f); }
  let best = pickBest(findings); if (best) best = shrinkSearch(best, run);
  const tcs = []; const rng2 = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  function gen2() { for (let t = 0; t < 5; t++) { try { const size = Math.max(1, maxN - Math.floor(rng2() * 4)); return __make(rng2, size); } catch (e) {} } return null; }
  for (let k = 0; k < 5; k++) { const args = gen2(); if (!args) continue; let exp, er; try { exp = __brute(...args); } catch (x) { er = String(x); } tcs.push({ input: args, expected: er ? { error: er } : exp }); }
  return { testsRun: total, best: best || null, bothFailed, genFailures, testCases: tcs };
})();
`;

export function runArtifact(artifact: Artifact, seed: number, timeoutMs = 5000): RunResult {
  const total = Math.max(1, Math.min(500, artifact.testCount || 60));
  const maxN = Math.max(1, Math.min(12, artifact.maxInputSize || 10));
  const src =
    HARNESS_HEAD +
    '\n' +
    artifact.userJs +
    '\n' +
    artifact.bruteForceCode +
    '\n' +
    artifact.generatorCode +
    (artifact.normalizeCode ? '\n' + artifact.normalizeCode : '') +
    '\n' +
    HARNESS_TAIL
      .replace(/__ENTRY__/g, artifact.entryName)
      .replace(/__ENTRY_NAME__/g, JSON.stringify(artifact.entryName))
      .replace('__SEED__', String(seed >>> 0))
      .replace('__TOTAL__', String(total))
      .replace('__MAXN__', String(maxN));

  const result = vm.runInNewContext(src, {}, { timeout: timeoutMs }) as RunResult;
  return {
    testsRun: result.testsRun ?? 0,
    best: result.best ?? null,
    bothFailed: !!result.bothFailed,
    genFailures: result.genFailures ?? 0,
    testCases: result.testCases ?? [],
  };
}