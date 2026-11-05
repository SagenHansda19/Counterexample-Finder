// Extension -> Cloudflare Worker (guardrail + key-holder).
// The extension NEVER holds the model API key and NEVER builds prompts.
// It only picks an op and sends { op, problem, code, ... } to the Worker.
//
// Configure the Worker URL + shared token in the panel Settings (⚙️), or set them
// here as defaults before publishing.

const DEFAULTS = {
  // Your Cloudflare Worker URL (public endpoint — safe to hardcode).
  workerUrl: 'https://counterexample-finder.sagenh009.workers.dev',
  // Must match the CXF_TOKEN set on the Worker. Hardcoded now for frictionless
  // testing; before publishing to the Store, clear this to '' so it's
  // Settings-only (prevents unknown users from spending your free credits).
  token: 'cef7f3a92d41b8e65c0a9347d2e8f160',
};

export async function getConfig() {
  const stored = await chrome.storage.local.get(['cxf_workerUrl', 'cxf_token']);
  return {
    workerUrl: stored.cxf_workerUrl || DEFAULTS.workerUrl,
    token: stored.cxf_token || DEFAULTS.token,
  };
}

export async function saveConfig(cfg) {
  await chrome.storage.local.set({
    cxf_workerUrl: cfg.workerUrl,
    cxf_token: cfg.token,
  });
}

// Call the Worker. body = { op, problem, code, ... }. Returns parsed JSON.
export async function callOp(body) {
  const cfg = await getConfig();
  const res = await fetch(cfg.workerUrl.replace(/\/$/, ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cxf': cfg.token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Worker ' + res.status));
  return data;
}

