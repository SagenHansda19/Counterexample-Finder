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


// The heavy lifting (run the reference + user solution, find the failing input)
// happens on the Cloudflare Worker, because browser contexts forbid `new Function`.
$('btn-verify').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('verify-result');
  setBusy($('btn-verify'), true, 'Working…');
  out.innerHTML = '<div class="muted">Writing a brute force & running random tests…</div>';
  try {
    const r = await callOp({ op: 'verify', problem: effProblem(), code: effCode() });
    if (r.best) {
      const b = r.best;
      out.innerHTML = `
        <div class="card bug">
          <div class="verdict-title">🐞 Smallest failing input</div>
          <pre class="codeblock">input:   ${esc(JSON.stringify(b.input))}</pre>
          <pre class="codeblock bad">yours:   ${esc(b.kind === 'crash' ? 'throws: ' + b.userError : JSON.stringify(b.userOutput))}</pre>
          <pre class="codeblock good">expected: ${esc(JSON.stringify(b.expected))}</pre>
          <p class="explain">${esc(r.explanation || '')}</p>
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
  out.innerHTML = '<div class="muted">Building generator + reference…</div>';
  try {
    const r = await callOp({ op: 'cases', problem: effProblem(), code: effCode() });
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

