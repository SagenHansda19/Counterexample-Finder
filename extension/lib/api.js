// Extension -> backend (Node service, deployed on Render; or localhost for dev).
// The extension NEVER holds the model API key and NEVER builds prompts.
// It only picks an op and sends { op, problem, code, ... } to the backend.
//
// Configure the backend URL + shared token in the panel Settings (⚙️), or set
// them here as defaults before publishing.

const DEFAULTS = {
  // The backend (Node service on Render). It holds the API key (private),
  // enforces the guardrail, and runs the code (node:vm). Enter the shared
  // token (matches the CXF_TOKEN env var on Render) once in the panel Settings
  // (⚙️); it is intentionally NOT committed to this repo.
  workerUrl: 'https://counterexample-finder.onrender.com',
  token: '',
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

