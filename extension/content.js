// Counterexample Finder — LeetCode content script.
// Extracts the problem title/statement and the user's editor code, and injects
// a small floating button to open the side panel.
(function () {
  if (window.__cxfInjected) return;
  window.__cxfInjected = true;

  function readMonacoDom() {
    // Read the visible Monaco lines, but do it ROBUSTLY against virtualization:
    // pick the container with the most lines (the solution editor, not the small
    // example-input box), sort lines by their vertical offset, and drop stale
    // duplicate nodes that Monaco can keep around after an edit.
    const containers = Array.from(document.querySelectorAll('.view-lines'));
    if (!containers.length) return '';
    let best = null;
    let bestKey = -1;
    for (const c of containers) {
      const lines = c.querySelectorAll('.view-line');
      let text = '';
      try { text = c.textContent || ''; } catch (e) {}
      // Prefer a container that clearly looks like solution code, else the largest.
      const looksLikeCode =
        /class\s+Solution|def\s+\w+\(|function\s+\w+\(|#include\s|import\s|=>/.test(text);
      const key = lines.length * 2 + (looksLikeCode ? 100000 : 0);
      if (key > bestKey) { bestKey = key; best = c; }
    }
    if (!best) return '';
    const lineEls = Array.from(best.querySelectorAll('.view-line'));
    const items = lineEls.map((el) => {
      let y = 0;
      const tr = el.style && el.style.transform;
      if (tr) {
        const tm = tr.match(/translate\([^,]+,\s*([-\d.]+)px\)/) || tr.match(/matrix\([^)]*\,\s*([-\d.]+)\)/);
        if (tm) y = parseFloat(tm[1]);
      }
      return { y, text: el.textContent || '' };
    });
    items.sort((a, b) => a.y - b.y);
    const out = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.y - it.y) < 1 && last.text === it.text) continue; // stale dupe
      out.push(it);
    }
    return out.map((o) => o.text).join('\n');
  }

  function getEditorCode() {
    // Strategy 1 — Monaco API: reads the FULL model value, immune to scroll
    // virtualization (scraping .view-line misses off-screen lines).
    try {
      if (window.monaco && window.monaco.editor) {
        const eds = window.monaco.editor.getEditors ? window.monaco.editor.getEditors() : [];
        let best = '';
        for (const ed of eds) {
          try { const v = ed && ed.getValue && ed.getValue(); if (v && v.trim().length > best.length) best = v; } catch (e) {}
        }
        if (best.trim()) return best;
        const models = window.monaco.editor.getModels ? window.monaco.editor.getModels() : [];
        for (const m of models) {
          try { const v = m && m.getValue && m.getValue(); if (v && v.trim().length > best.length) best = v; } catch (e) {}
        }
        if (best.trim()) return best;
      }
    } catch (e) {}
    // Strategy 2 — robust DOM scrape of the Monaco view (handles virtualization).
    const dom = readMonacoDom();
    if (dom.trim()) return dom;
    // Strategy 3 — CodeMirror 6: editable .cm-content (skip read-only snippets).
    const cmContents = Array.from(document.querySelectorAll('.cm-content'));
    let fallback = '';
    for (const el of cmContents) {
      const editor = el.closest('.cm-editor');
      const readOnly = editor && editor.classList.contains('cm-readonly');
      const text = (el.innerText || el.textContent || '').trim();
      if (text) {
        if (el.isContentEditable && !readOnly) return text;
        if (!readOnly && text.length > fallback.length) fallback = text;
      }
    }
    if (fallback) return fallback;
    // Strategy 4 — legacy CodeMirror 5.
    try {
      const cm = document.querySelector('.CodeMirror');
      if (cm && cm.CodeMirror) return cm.CodeMirror.getValue();
    } catch (e) {}
    // Strategy 5 — plain textarea.
    try {
      const ta = document.querySelector('textarea[name="editor"], textarea.CodeMirror-textfield, textarea');
      if (ta && ta.value) return ta.value;
    } catch (e) {}
    return '';
  }

  function detectLang() {
    try {
      const el = document.querySelector('[class*="language-selector"], .editor-tab, .language-tab');
      if (el) {
        const t = (el.textContent || '').trim().toLowerCase();
        if (t.includes('python')) return 'python';
        if (t.includes('java')) return 'java';
        if (t.includes('c++') || t.includes('cpp')) return 'cpp';
        if (t.includes('javascript') || t.includes('js') || t.includes('ts')) return 'javascript';
      }
      // Secondary signal: the code itself looks like C++/Python.
      const code = getEditorCode();
      if (/\b(vector<int>|public:|std::|#include|class Solution)\b/.test(code)) return 'cpp';
      if (/^\s*def \w+\(.*\):\s*$/.test(code) && !code.includes('function')) return 'python';
    } catch (e) {}
    return 'javascript';
  }

  function extract() {
    let title = '';
    let statement = '';
    try {
      const t =
        document.querySelector('[data-e2e-locator="question-title"]') ||
        document.querySelector('#question-title') ||
        document.querySelector('.problem-header h1, .problem-header .question-name, .question-card-title');
      title = t ? t.textContent.trim() : document.title.replace(/^.*?\|/i, '').trim();
    } catch (e) {}
    try {
      // `[data-qd-rendered-description]` holds the full statement + examples + constraints.
      const c =
        document.querySelector('[data-qd-rendered-description]') ||
        document.querySelector('.question-content') ||
        document.querySelector('[class*="problem-statement"]') ||
        document.querySelector('.topic-card');
      statement = c ? c.innerText.trim() : '';
    } catch (e) {}
    const code = getEditorCode();
    return {
      title,
      statement: statement.slice(0, 8000),
      code,
      lang: detectLang(),
      url: location.href,
    };
  }

  // Floating button to open the panel.
  function addButton() {
    const btn = document.createElement('div');
    btn.id = 'cxf-fab';
    btn.setAttribute('role', 'button');
    btn.title = 'Open Counterexample panel';
    btn.innerHTML = '🐞';
    document.body.appendChild(btn);
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'cxf:open' });
    });
  }

  try {
    if (document.body) addButton();
    else document.addEventListener('DOMContentLoaded', addButton);
  } catch (e) {}

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'cxf:extract') {
      sendResponse(extract());
      return false;
    }
  });
})();
