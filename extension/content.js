// Counterexample Finder — LeetCode content script.
// Extracts the problem title/statement and the user's editor code, and injects
// a small floating button to open the side panel.
(function () {
  if (window.__cxfInjected) return;
  window.__cxfInjected = true;

  function getEditorCode() {
    // Strategy 1 — Monaco API: reads the FULL model value, immune to scroll
    // virtualization (scraping .view-line misses off-screen lines).
    try {
      if (window.monaco && window.monaco.editor) {
        const eds = window.monaco.editor.getEditors ? window.monaco.editor.getEditors() : [];
        for (const ed of eds) {
          try { const v = ed && ed.getValue && ed.getValue(); if (v && v.trim()) return v; } catch (e) {}
        }
        const models = window.monaco.editor.getModels ? window.monaco.editor.getModels() : [];
        for (const m of models) {
          try { const v = m && m.getValue && m.getValue(); if (v && v.trim()) return v; } catch (e) {}
        }
      }
    } catch (e) {}
    // Strategy 2 — DOM scrape of rendered lines (fallback when Monaco API absent).
    const lines = Array.from(document.querySelectorAll('.view-lines .view-line'));
    if (lines.length) {
      const text = lines.map((el) => el.textContent || '').join('\n');
      if (text.trim()) return text;
    }
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
