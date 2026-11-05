import { callOp, getConfig, saveConfig } from './lib/api.js';

const $ = (id) => document.getElementById(id);
let pageData = { title: '', statement: '', code: '', lang: 'javascript' };
let lastCodeKey = '';

/* ---------- small helpers ---------- */
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function splitRow(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()); }
function md(s) {
  if (!s) return '';
  const lines = String(s).split('\n');
  let html = '', i = 0;
  let inList = false;
  const closeList = () => { if (inList) { html += '</div>'; inList = false; } };
  const inline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  while (i < lines.length) {
    const raw = lines[i];
    // fenced code block
    const fence = raw.match(/^\s*```(.*)$/);
    if (fence) {
      closeList();
      const lang = (fence[1] || '').trim();
      const buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      html += `<pre class="codeblock md-code">${esc(buf.join('\n'))}</pre>`;
      continue;
    }
    // GFM table (header row + |---| separator)
    if (/^\s*\|.*\|\s*$/.test(raw) && i + 1 < lines.length && /^\s*\|[\s:\-|]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const header = splitRow(raw); i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      let t = '<table class="md-table"><thead><tr>' + header.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of rows) t += '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
      t += '</tbody></table>';
      html += t;
      continue;
    }
    if (/^\s*$/.test(raw)) { closeList(); continue; }
    if (/^#{1,4}\s/.test(raw)) { closeList(); html += `<div class="md-h">${inline(raw.replace(/^#{1,4}\s*/, ''))}</div>`; continue; }
    if (/^\s*[-•*]\s+/.test(raw)) { if (!inList) { html += '<div class="md-list">'; inList = true; } html += `<div class="md-li">${inline(raw.replace(/^\s*[-•*]\s+/, ''))}</div>`; continue; }
    closeList();
    html += `<div class="md-p">${inline(raw)}</div>`;
    i++;
  }
  closeList();
  return html;
}
function setStatus(id, text) { $(id).innerHTML = text ? `<span class="spinner"></span><span>${esc(text)}</span>` : ''; }
function setStatusDone(id, text) { $(id).innerHTML = text ? `<span class="done">✓ ${esc(text)}</span>` : ''; }
function clearStatus(id) { $(id).innerHTML = ''; }
function setBusy(btn, on) { btn.disabled = on; }
function toast(msg) { let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(t._to); t._to = setTimeout(() => t.classList.remove('show'), 1600); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); } catch (e) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } toast('Copied to clipboard'); }

function effProblem() {
  const t = (pageData.title || '').trim();
  const s = (pageData.statement || '').trim();
  if (t && s) return t + '\n\n' + s;
  return s || t || '';
}
function effCode() { return pageData.code || ''; }
function needCode() { if (!effCode()) { setStatus('verify-status', ''); toast('No code detected — write some in the LeetCode editor'); return false; } return true; }
function transcriptionNote() { return ''; }

/* ---------- page reading + auto refresh ---------- */
async function extractFromPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'cxf:extract' });
    if (res && (res.code || res.title)) {
      const changed = (res.code || '') !== lastCodeKey;
      lastCodeKey = res.code || '';
      pageData = res;
      $('title').textContent = res.title || 'Untitled problem';
      $('code').textContent = res.code || '';
      const n = (res.code || '').split('\n').length;
      $('code-count').textContent = res.code ? 'Your code · ' + n + ' lines' : 'Your code (empty)';
      const dot = $('sync-dot'), st = $('extract-status');
      dot.className = 'dot ' + (changed ? 'dot-live' : 'dot-idle');
      st.textContent = changed ? 'Updated just now' : (res.code ? 'Live · ' + (res.code.length) + ' chars' : 'No code yet — start typing');
      if (changed) setTimeout(() => { dot.className = 'dot dot-idle'; }, 900);
    } else {
      $('sync-dot').className = 'dot dot-error';
      $('extract-status').textContent = 'On a LeetCode problem page? Re-read.';
    }
  } catch (e) {
    $('sync-dot').className = 'dot dot-error';
    $('extract-status').textContent = 'Could not read page';
  }
}

/* ---------- tab switching ---------- */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.pane, #settings').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ---------- code block: collapse + copy ---------- */
$('code-toggle').addEventListener('click', () => {
  const pre = $('code');
  const open = pre.hidden;
  pre.hidden = !open;
  $('code-toggle').firstChild.textContent = (open ? '▾ ' : '▸ ');
});
$('code-copy').addEventListener('click', () => copyText(effCode()));

/* ---------- settings ---------- */
$('btn-settings').addEventListener('click', async () => {
  const active = $('settings').classList.contains('active');
  document.querySelectorAll('.pane, #settings').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  if (!active) { const cfg = await getConfig(); $('cfg-base').value = cfg.workerUrl; $('cfg-token').value = cfg.token; $('settings').classList.add('active'); }
});
$('btn-save-cfg').addEventListener('click', async () => {
  await saveConfig({ workerUrl: $('cfg-base').value.trim(), token: $('cfg-token').value.trim() });
  $('cfg-status').textContent = 'Saved.'; toast('Settings saved');
  setTimeout(() => ($('cfg-status').textContent = ''), 2000);
});

/* ---------- Hints ---------- */
$('btn-hint').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('hint-result');
  setBusy($('btn-hint'), true);
  out.innerHTML = '';
  setStatus('hint-status', 'Asking the tutor…');
  try {
    const { hint } = await callOp({ op: 'hint', problem: effProblem(), code: effCode(), level: $('hint-level').value });
    setStatus('hint-status', '');
    out.innerHTML = `<div class="card"><div class="verdict-title">💡 Hint</div><div class="hint">${md(hint)}</div></div>`;
  } catch (e) { console.error('[cxf hint]', e); setStatus('hint-status', ''); out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div><div class="muted">Open the panel DevTools (right-click → Inspect → Console) for the full error.</div></div>`; }
  finally { setBusy($('btn-hint'), false); }
});

async function generateAndRun() {
  const problem = effProblem(), code = effCode();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { artifact } = await callOp({ op: 'generate', problem, code });
      const r = await callOp({ op: 'run', artifact, seed: (Date.now() % 999983) >>> 0 });
      return { artifact, r };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* ---------- Verify ---------- */
$('btn-verify').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('verify-result');
  setBusy($('btn-verify'), true);
  out.innerHTML = '';
  setStatus('verify-status', 'Writing a brute force…');
  const t0 = Date.now();
  try {
    const { r } = await generateAndRun();
    if (!r.best && (r.genFailures || 0) >= (r.testsRun || 1)) {
      out.innerHTML = '<div class="card bug"><div class="verdict-title">⚠️ The AI\'s test generator kept failing on this problem.</div><div class="muted">Try again, or paste the code in JavaScript.</div></div>';
      setStatus('verify-status', ''); setBusy($('btn-verify'), false); return;
    }
    let explanation = '';
    if (r.best) {
      setStatus('verify-status', 'Found it — writing the root cause…');
      const ex = await callOp({ op: 'explain', problem: effProblem(), code: effCode(), input: r.best.input, userOutput: r.best.userOutput, userError: r.best.userError, expected: r.best.expected });
      explanation = ex.explanation || '';
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.best) {
      const b = r.best;
      out.innerHTML = `
        <div class="card bug">
          <div class="verdict-title">🐞 Smallest failing input</div>
          <div class="kv">
            <div class="k">input</div><pre class="codeblock">${esc(JSON.stringify(b.input))}</pre>
            <div class="k">yours</div><pre class="codeblock bad">${esc(b.kind === 'crash' ? 'throws: ' + b.userError : JSON.stringify(b.userOutput))}</pre>
            <div class="k">expected</div><pre class="codeblock good">${esc(JSON.stringify(b.expected))}</pre>
          </div>
          ${explanation ? `<div class="explain-label">ROOT CAUSE</div><div class="explain">${md(explanation)}</div>` : ''}
          ${transcriptionNote()}
        </div>`;
    } else {
      out.innerHTML = `<div class="card ok"><div class="verdict-title">✅ No counterexample found</div><div class="muted">Matched the brute force on ${r.testsRun} random tests.</div>${transcriptionNote()}</div>`;
    }
    if (r.bothFailed) out.innerHTML += '<div class="muted note">⚠️ The reference and your code both threw on some inputs — this result may be inconclusive.</div>';
    setStatusDone('verify-status', `Done in ${secs}s`);
  } catch (e) { console.error('[cxf verify]', e); setStatus('verify-status', ''); out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div><div class="muted">Open the panel DevTools (right-click → Inspect → Console) for the full error.</div></div>`; }
  finally { setBusy($('btn-verify'), false); }
});

/* ---------- Test cases ---------- */
$('btn-cases').addEventListener('click', async () => {
  if (!needCode()) return;
  const out = $('cases-result');
  setBusy($('btn-cases'), true);
  out.innerHTML = '';
  setStatus('cases-status', 'Writing a generator + reference…');
  try {
    const { artifact, r } = await generateAndRun();
    if (!r.testCases || !r.testCases.length) { out.innerHTML = '<div class="muted">No test cases produced.</div>'; setStatus('cases-status', ''); return; }
    const names = (artifact.paramNames && artifact.paramNames.length) ? artifact.paramNames : (r.testCases[0].input || []).map((_, i) => 'arg' + i);
    const dispInput = (input) => (input || []).map((arg, i) => (names[i] || ('arg' + i)) + ' = ' + JSON.stringify(arg)).join('\n');
    const rawInput = (input) => (input || []).map((arg) => JSON.stringify(arg)).join('\n');
    const items = r.testCases.map((tc, i) => {
      const payload = rawInput(tc.input);
      return `
      <div class="case-item">
        <div class="case-top"><span class="case-idx">Case ${i + 1}</span><button class="mini" data-copy='${esc(payload).replace(/'/g, '&#39;')}'>⧉ Copy</button></div>
        <pre class="codeblock">${esc(dispInput(tc.input))}</pre>
        <div class="exp-label">expected</div>
        <pre class="codeblock good">${esc(JSON.stringify(tc.expected))}</pre>
      </div>`;
    }).join('');
    out.innerHTML = `<div class="cases-head"><div class="verdict-title" style="margin:0">🧪 Test cases</div><button class="mini" id="copy-all">⧉ Copy all</button></div>${items}`;
    out.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.getAttribute('data-copy'))));
    const all = $('copy-all'); if (all) all.addEventListener('click', () => copyText(r.testCases.map((tc) => rawInput(tc.input)).join('\n')));
    setStatusDone('cases-status', r.testCases.length + ' test cases');
  } catch (e) { setStatus('cases-status', ''); out.innerHTML = `<div class="card bug"><div class="verdict-title">⚠️ ${esc(e.message)}</div></div>`; }
  finally { setBusy($('btn-cases'), false); }
});

/* ---------- manual re-read + keep-alive + auto refresh ---------- */
$('btn-extract').addEventListener('click', extractFromPage);
async function pingServer() { try { const cfg = await getConfig(); if (!cfg.workerUrl) return; await fetch(cfg.workerUrl.replace(/\/$/, '') + '/health', { method: 'GET', cache: 'no-store' }); } catch (_) {} }
extractFromPage();
setInterval(extractFromPage, 1500);
pingServer();
setInterval(pingServer, 45000);
