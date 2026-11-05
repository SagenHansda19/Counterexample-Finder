import { callOp, getConfig, saveConfig } from './lib/api.js';

const $ = (id) => document.getElementById(id);
let pageData = { title: '', statement: '', code: '', lang: 'javascript' };

async function extractFromPage() {
  $('extract-status').textContent = 'Reading page…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'cxf:extract' });
    if (res && res.code) {
      pageData = res;
      $('title').textContent = res.title || 'Untitled problem';
      $('code').textContent = res.code;
      $('extract-status').textContent = '✓ Read ' + (res.code.length || 0) + ' chars of code';
    } else {
      $('extract-status').textContent = 'No code found — open a LeetCode problem with your code in the editor.';
    }
  } catch (e) {
    $('extract-status').textContent = 'Could not read page: ' + e.message;
  }
}

function effProblem() {
  const m = $('manual-problem').value.trim();
  return m || pageData.statement || pageData.title || '';
}
function effCode() {
  const m = $('manual-code').value.trim();
  return m || pageData.code || '';
}
function needCode() {
  if (!effCode()) {
    alert('No code detected. Re-read the page, or click "Paste manually" and paste your JavaScript solution.');
    return false;
  }
  return true;
}
// Your code runs as JavaScript on the Worker. If it wasn't already JS, the
// model transcribes it (bug preserved) — tell the user that's what was tested.
function transcriptionNote() {
  const raw = effCode();
  if (/function\s*\w*\s*\(|=>/.test(raw)) return '';
  return '<p class="muted note">⚠️ Your solution was auto-transcribed to JavaScript for this check (the AI keeps the same logic &amp; bug). Hints use your original code.</p>';
}

function seed() {
  return (Date.now() % 999983 + Math.floor(Math.random() * 1000)) >>> 0;
}

function setBusy(btn, on, text) {
  btn.disabled = on;
  if (on && text) btn.textContent = text;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// Run the generated reference + user solution LOCALLY in a Blob-URL Web Worker.
// The generated code is the worker's entry script (normal script load — no
// new Function / eval), so it works under the MV3 extension CSP (worker-src blob:).
function buildRunBlob(artifact, seed) {
  const total = Math.max(1, artifact.testCount || 60);
  const maxN = artifact.maxInputSize || 10;
  const src =
    '(function(){\n' +
    'function mulberry32(sd){let s=sd>>>0;return function(){s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}\n' +
    'function deepEqual(a,b){if(Object.is(a,b))return true;if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!deepEqual(a[i],b[i]))return false;return true;}if(a&&b&&typeof a==="object"&&typeof b==="object"){const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;for(const k of ka)if(!Object.prototype.hasOwnProperty.call(b,k)||!deepEqual(a[k],b[k]))return false;return true;}return false;}\n' +
    'function sizeMetric(args){let tot=0;const w=v=>{if(Array.isArray(v)){tot+=v.length;v.forEach(w);}else if(v&&typeof v==="object")Object.values(v).forEach(w);else if(typeof v==="number")tot+=Math.abs(v);else tot+=1;};args.forEach(w);return tot;}\n' +
    'function classify(res,args){if(!res.userErr&&!res.bruteErr){if(!deepEqual(res.userOut,res.bruteOut))return{kind:"mismatch",input:args,userOutput:res.userOut,expected:res.bruteOut,sizeMetric:sizeMetric(args)};return null;}if(res.userErr&&!res.bruteErr)return{kind:"crash",input:args,userError:res.userErr,expected:res.bruteOut,sizeMetric:sizeMetric(args)};return null;}\n' +
    'function pickBest(f){let b=null;for(const x of f)if(!b||x.sizeMetric<b.sizeMetric)b=x;return b;}\n' +
    'function shrinkSearch(best,run){let cur=best;let budget=90;let improved=true;while(improved&&budget>0){improved=false;for(let idx=0;idx<cur.input.length&&budget>0;idx++){const item=cur.input[idx];if(!Array.isArray(item))continue;for(let len=item.length-1;len>=0&&budget>0;len--){budget--;const c=cur.input.slice();c[idx]=item.slice(0,len);const f=classify(run(c),c);if(f&&f.sizeMetric<cur.sizeMetric){cur=f;improved=true;break;}}}}return cur;}\n' +
    artifact.userJs + '\n' +
    artifact.bruteForceCode + '\n' +
    artifact.generatorCode + '\n' +
    'const __user = ' + artifact.entryName + ';\n' +
    'const __brute = bruteForce;\n' +
    'const __make = makeInput;\n' +
    'if(typeof __user!=="function"||typeof __brute!=="function"||typeof __make!=="function"){postMessage({type:"error",error:"could not build runnable functions (entry: ' + artifact.entryName + ')"});return;}\n' +
    'const seed=' + seed + '>>>0;const rng=mulberry32(seed);\n' +
    'function run(args){let uo,bu,ue,be;try{uo=__user(...args);}catch(e){ue=String(e);}try{bu=__brute(...args);}catch(e){be=String(e);}return{userOut:uo,bruteOut:bu,userErr:ue,bruteErr:be};}\n' +
    'const total=' + total + ';const maxN=' + maxN + ';\n' +
    'const findings=[];let bothFailed=false;\n' +
    'for(let i=1;i<=total;i++){const size=Math.max(1,maxN-Math.floor(rng()*4));const args=__make(rng,size);const res=run(args);if(res.userErr&&res.bruteErr)bothFailed=true;const f=classify(res,args);if(f)findings.push(f);}\n' +
    'let best=pickBest(findings);if(best)best=shrinkSearch(best,run);\n' +
    'const tcs=[];const rng2=mulberry32((seed^0x9e3779b9)>>>0);\n' +
    'for(let k=0;k<5;k++){const size=Math.max(1,maxN-Math.floor(rng2()*4));const args=__make(rng2,size);let exp,er;try{exp=__brute(...args);}catch(x){er=String(x);}tcs.push({input:args,expected:er?{error:er}:exp});}\n' +
    'postMessage({type:"done",result:{testsRun:total,best:best||null,bothFailed,testCases:tcs}});\n' +
    '})();\n';
  return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
}

function runLocalVerification(artifact) {
  const s = seed();
  const url = buildRunBlob(artifact, s);
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); reject(new Error('worker create: ' + e.message)); return; }
    const to = setTimeout(() => { try { w.terminate(); } catch (_) {} URL.revokeObjectURL(url); reject(new Error('verification timed out')); }, 15000);
    const done = () => { clearTimeout(to); try { w.terminate(); } catch (_) {} URL.revokeObjectURL(url); };
    w.onmessage = (e) => { done(); if (e.data && e.data.type === 'done') resolve(e.data.result); else reject(new Error((e.data && e.data.error) || 'worker error')); };
    w.onerror = (e) => { done(); reject(new Error('worker error: ' + ((e && e.message) || 'unknown'))); };
  });
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.pane, #settings').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

$('btn-settings').addEventListener('click', async () => {
  const active = $('settings').classList.contains('active');
  document.querySelectorAll('.pane, #settings').forEach((p) => p.classList.remove('active'));
  if (!active) {
    const cfg = await getConfig();
    $('cfg-base').value = cfg.workerUrl;
    $('cfg-token').value = cfg.token;
    $('settings').classList.add('active');
  }
});

$('btn-save-cfg').addEventListener('click', async () => {
  await saveConfig({ workerUrl: $('cfg-base').value.trim(), token: $('cfg-token').value.trim() });
  $('cfg-status').textContent = 'Saved.';
  setTimeout(() => ($('cfg-status').textContent = ''), 2000);
});

$('btn-hint').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('hint-result');
  const level = $('hint-level').value;
  setBusy($('btn-hint'), true, 'Thinking…');
  out.innerHTML = '<div class="muted">Asking the tutor…</div>';
  try {
    const { hint: text } = await callOp({ op: 'hint', problem: effProblem(), code: effCode(), level });
    out.innerHTML = `<div class="card"><p class="hint">${esc(text)}</p></div>`;
  } catch (e) {
    out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div></div>`;
  } finally {
    setBusy($('btn-hint'), false, 'Get hint');
  }
});


// Verify: (1) Worker generates the reference/generator + transcribed user JS,
// (2) the browser Blob worker runs them & finds the smallest failing input,
// (3) Worker explains the root cause (only if a failing input was found).
$('btn-verify').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('verify-result');
  setBusy($('btn-verify'), true, 'Working…');
  out.innerHTML = '<div class="muted">Writing a brute force…</div>';
  try {
    const { artifact } = await callOp({ op: 'generate', problem: effProblem(), code: effCode() });
    out.innerHTML = '<div class="muted">Running random tests in your browser…</div>';
    const r = await runLocalVerification(artifact);
    let explanation = '';
    if (r.best) {
      out.innerHTML = '<div class="muted">Found it — asking for the root cause…</div>';
      const ex = await callOp({
        op: 'explain',
        problem: effProblem(),
        code: effCode(),
        input: r.best.input,
        userOutput: r.best.userOutput,
        userError: r.best.userError,
        expected: r.best.expected,
      });
      explanation = ex.explanation || '';
    }
    if (r.best) {
      const b = r.best;
      out.innerHTML = `
        <div class="card bug">
          <div class="verdict-title">🐞 Smallest failing input</div>
          <pre class="codeblock">input:   ${esc(JSON.stringify(b.input))}</pre>
          <pre class="codeblock bad">yours:   ${esc(b.kind === 'crash' ? 'throws: ' + b.userError : JSON.stringify(b.userOutput))}</pre>
          <pre class="codeblock good">expected: ${esc(JSON.stringify(b.expected))}</pre>
          <p class="explain">${esc(explanation)}</p>
          ${transcriptionNote()}
        </div>`;
    } else {
      out.innerHTML = `<div class="card ok"><div class="verdict-title">✅ No counterexample found</div><p class="muted">Matched the brute force on ${r.testsRun} random tests.</p>${transcriptionNote()}</div>`;
    }
    if (r.bothFailed) out.innerHTML += '<div class="muted note">Note: the reference and your solution both threw on some inputs — results may be inconclusive.</div>';
  } catch (e) {
    out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div></div>`;
  } finally {
    setBusy($('btn-verify'), false, 'Find counterexample');
  }
});

$('btn-cases').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('cases-result');
  setBusy($('btn-cases'), true, 'Generating…');
  out.innerHTML = '<div class="muted">Writing a generator + reference…</div>';
  try {
    const { artifact } = await callOp({ op: 'generate', problem: effProblem(), code: effCode() });
    out.innerHTML = '<div class="muted">Running in your browser…</div>';
    const r = await runLocalVerification(artifact);
    if (!r.testCases.length) { out.innerHTML = '<div class="muted">No test cases produced.</div>'; return; }
    const items = r.testCases.map((tc, i) => `
      <div class="case-item">
        <div class="muted">#${i + 1} input</div>
        <pre class="codeblock">${esc(JSON.stringify(tc.input))}</pre>
        <div class="muted">expected</div>
        <pre class="codeblock good">${esc(JSON.stringify(tc.expected))}</pre>
      </div>`).join('');
    out.innerHTML = `<div class="card"><div class="verdict-title">🧪 Test cases (copy & run locally)</div>${items}${transcriptionNote()}</div>`;
  } catch (e) {
    out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div></div>`;
  } finally {
    setBusy($('btn-cases'), false, 'Generate test cases');
  }
});

$('btn-extract').addEventListener('click', extractFromPage);
$('btn-manual').addEventListener('click', () => {
  $('manual-wrap').hidden = !$('manual-wrap').hidden;
});
extractFromPage();

