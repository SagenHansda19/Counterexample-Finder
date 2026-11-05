// Counterexample Finder — LeetCode content script.
// Extracts the problem title/statement and the user's editor code, and injects
// a small floating button to open the side panel.
(function () {
  if (window.__cxfInjected) return;
  window.__cxfInjected = true;

  function getEditorCode() {
    // LeetCode's editor is CodeMirror 6: an editable `div.cm-content`.
    // Strategy 1 — find every .cm-content, prefer an EDITABLE one (not a
    // read-only snippet in the problem statement), and return its text.
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
    // Strategy 2 — legacy CodeMirror 5.
    try {
      const cm = document.querySelector('.CodeMirror');
      if (cm && cm.CodeMirror) return cm.CodeMirror.getValue();
    } catch (e) {}
    // Strategy 3 — Monaco.
    try {
      if (window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length) return models[0].getValue();
      }
    } catch (e) {}
    // Strategy 4 — plain textarea.
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
        document.querySelector('#question-title') ||
        document.querySelector('.problem-header h1, .problem-header .question-name, .question-card-title');
      title = t ? t.textContent.trim() : document.title.replace(/^.*?\|/i, '').trim();
    } catch (e) {}
    try {
      // `.question-content` holds the full statement + examples.
      const c =
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
