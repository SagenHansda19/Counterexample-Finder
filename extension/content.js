// Counterexample Finder — LeetCode content script.
// Extracts the problem title/statement and the user's editor code, and injects
// a small floating button to open the side panel.
(function () {
  if (window.__cxfInjected) return;
  window.__cxfInjected = true;

  function getEditorCode() {
    // 1) Legacy CodeMirror (LeetCode used this for a long time).
    try {
      const cmEl = document.querySelector('.CodeMirror');
      if (cmEl && cmEl.CodeMirror) return cmEl.CodeMirror.getValue();
    } catch (e) {}
    // 2) Monaco editor (newer LeetCode editor).
    try {
      if (window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length) return models[0].getValue();
      }
    } catch (e) {}
    // 3) CodeMirror 6 content (aria) fallback.
    try {
      const cm6 = document.querySelector('.cm-content');
      if (cm6) return cm6.textContent || '';
    } catch (e) {}
    return '';
  }

  function detectLang() {
    try {
      const el = document.querySelector('[class*="language-selector"], .editor-tab');
      if (el) {
        const t = (el.textContent || '').trim().toLowerCase();
        if (t.includes('python')) return 'python';
        if (t.includes('java')) return 'java';
        if (t.includes('c++') || t.includes('cpp')) return 'cpp';
        if (t.includes('javascript') || t.includes('js') || t.includes('ts')) return 'javascript';
      }
    } catch (e) {}
    return 'javascript';
  }

  function extract() {
    let title = '';
    let statement = '';
    try {
      const t = document.querySelector('.problem-header h1, .problem-header .question-name');
      title = t ? t.textContent.trim() : document.title.replace(/^.*?\|/i, '').trim();
    } catch (e) {}
    try {
      const c = document.querySelector('.question-content, [class*="problem-statement"]');
      statement = c ? c.innerText.trim() : '';
    } catch (e) {}
    return {
      title,
      statement: statement.slice(0, 6000),
      code: getEditorCode(),
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
