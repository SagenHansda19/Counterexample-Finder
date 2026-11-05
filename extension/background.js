// Background service worker for the Counterexample Finder extension.
// Opens the side panel when the toolbar icon is clicked, and when the
// in-page floating button asks it to.

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn('sidePanel.open failed', e);
  }
});

// Open request coming from the content-script floating button.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'cxf:open' && sender && sender.tab) {
    chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  }
});
