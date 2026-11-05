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

function needCode() {
  if (!pageData.code) {
    alert('No code detected. Open a LeetCode problem with your solution in the editor, then click "Re-read page".');
    return false;
  }
  return true;
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
    const { hint: text } = await callOp({ op: 'hint', problem: pageData.statement || pageData.title, code: pageData.code, level });
    out.innerHTML = `<div class="card"><p class="hint">${esc(text)}</p></div>`;
  } catch (e) {
    out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div></div>`;
  } finally {
    setBusy($('btn-hint'), false, 'Get hint');
  }
});


async function runWorker(userCode, artifact, s, onProgress) {
  const worker = new Worker('lib/verify-worker.js');
  return await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.done, m.total);
      if (m.type === 'done') { worker.terminate(); resolve(m.result); }
      if (m.type === 'error') { worker.terminate(); reject(new Error(m.error)); }
    };
    worker.postMessage({ userCode, artifact, seed: s });
  });
}

async function getArtifact() {
  const r = await callOp({ op: 'generate', problem: pageData.statement || pageData.title, code: pageData.code });
  return r.artifact;
}

$('btn-verify').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('verify-result');
  setBusy($('btn-verify'), true, 'Working…');
  out.innerHTML = '<div class="muted">1/2 Writing a brute force…</div>';
  let s;
  try {
    const artifact = await getArtifact();
    out.innerHTML = '<div class="muted">2/2 Running random tests in your browser…</div>';
    s = seed();
    const wr = await runWorker(pageData.code, artifact, s, (d, t) => {
      out.innerHTML = `<div class="muted">Running… ${Math.round((d / t) * 100)}%</div>`;
    });
    if (wr.best) {
      out.innerHTML = `<div class="muted">Explaining root cause…</div>`;
      const { explanation: text } = await callOp({
        op: 'explain',
        problem: pageData.statement || pageData.title,
        code: pageData.code,
        input: wr.best.input,
        userOutput: wr.best.userOutput,
        userError: wr.best.userError,
        expected: wr.best.expected,
      });
      const b = wr.best;
      out.innerHTML = `
        <div class="card bug">
          <div class="verdict-title">🐞 Smallest failing input</div>
          <pre class="codeblock">input:   ${esc(JSON.stringify(b.input))}</pre>
          <pre class="codeblock bad">yours:   ${esc(b.kind === 'crash' ? 'throws: ' + b.userError : JSON.stringify(b.userOutput))}</pre>
          <pre class="codeblock good">expected: ${esc(JSON.stringify(b.expected))}</pre>
          <p class="explain">${esc(text)}</p>
        </div>`;
    } else {
      out.innerHTML = `<div class="card ok"><div class="verdict-title">✅ No counterexample found</div><p class="muted">Matched the brute force on ${wr.testsRun} random tests.</p></div>`;
    }
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
  out.innerHTML = '<div class="muted">Building generator + reference…</div>';
  try {
    const artifact = await getArtifact();
    const wr = await runWorker(pageData.code, artifact, seed(), () => {});
    if (!wr.testCases.length) { out.innerHTML = '<div class="muted">No test cases produced.</div>'; return; }
    const items = wr.testCases.map((tc, i) => `
      <div class="case-item">
        <div class="muted">#${i + 1} input</div>
        <pre class="codeblock">${esc(JSON.stringify(tc.input))}</pre>
        <div class="muted">expected</div>
        <pre class="codeblock good">${esc(JSON.stringify(tc.expected))}</pre>
      </div>`).join('');
    out.innerHTML = `<div class="card"><div class="verdict-title">🧪 Test cases (copy & run locally)</div>${items}</div>`;
  } catch (e) {
    out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div></div>`;
  } finally {
    setBusy($('btn-cases'), false, 'Generate test cases');
  }
});

$('btn-extract').addEventListener('click', extractFromPage);
extractFromPage();

