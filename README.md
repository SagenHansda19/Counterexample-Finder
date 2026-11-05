# 🐞 Counterexample Finder — LeetCode Copilot (Chrome extension)

A **Chrome extension** that lives in a side panel on LeetCode. Paste/keep your solution and get:

- **💀 Verify** — the *smallest input that breaks your code*, your output, the expected output, and a plain-language **root cause**.
- **👉 Hints** — Socratic nudges (nudge / approach / debug) that guide you to the fix **without ever giving the full solution**.
- **🧺 Test Cases** — random inputs + expected outputs you can copy and run locally.

The AI never *asserts* a bug — it **writes a correct brute force + a random test generator**, the backend **runs both** on seeded random inputs, and only a *real* mismatch (real input → your output vs. expected) is reported. That's the **"AI proposes, code verifies"** pattern: no hallucinated explanations.

**🎯 Built for the [BharatCode Build League](https://bharatcode.ai/hackathon). Powered by a Qwen 3.8 27B model API (Adaption; swappable to BharatCode's `qwen-3.8-27b`).**

## How it works
```
[LeetCode tab]  ->  content script reads the problem + your code
        |
        v
[Side panel]    ->  calls the backend with { op, problem, code }
        |
        v
[Node backend]  (Render)   key + guardrail live ONLY here
  1. op=generate  -> model writes { bruteForce, makeInput, userJs (faithful, bug kept) }
  2. op=run       -> node:vm runs both on ~60 seeded random inputs, finds the
                     SMALLEST failing input (bounded shrink search), with a timeout
  3. op=explain   -> model explains the root cause from the REAL input + outputs
  4. op=hint      -> Socratic hint (never a full solution)
```

- **The model can only do these 4 fixed jobs** with fixed prompts; your problem/code is treated as **untrusted data** (prompt-injection guardrail).
- **The API key never leaves the backend** — the extension sends only a shared token + the task.
- **Verification runs on a Node service** (not in the browser, not on the free Cloudflare tier — both forbid running dynamically generated code), with a per-run `node:vm` timeout so untrusted model code can't hang the service.

## Install (unpacked, for testing)
1. `chrome://extensions` -> enable **Developer mode**.
2. **Load unpacked** -> select the `extension/` folder.
3. Open the backend (deploy on Render, or run locally — below) and set its URL + token in the panel's **⚙ Settings**.
4. Open a LeetCode problem with code in the editor -> click the 🐞 icon.

## Run the backend locally
```bash
npm run install:all
cp .env.example .env   # set BHARATCODE_API_KEY (Adaption) + CXF_TOKEN
npm run build          # builds server + app
npm start              # API on http://localhost:4000
# quick check:
curl http://localhost:4000/health
```

## Accuracy (eval — `evals/`)
```
🐛 FOUND  Two Sum - off-by-one outer loop
🐛 FOUND  Binary search - wrong "not found"
🐛 FOUND  Contains duplicate - inverted boolean
🐛 FOUND  Max profit - inner loop skips last day
🐛 FOUND  Sum of first K - off-by-one
🐛 FOUND  Index of max - returns last tie, not first
🐛 FOUND  Strictly increasing - allows equal neighbours
🙉 CLEAN  Two Sum (correct)
🙉 CLEAN  Binary search (correct)
🙉 CLEAN  Sum of first K (correct)
Planted bugs caught: 7 / 7
False positives:     0 on clean code
```

## Stack
`extension/` MV3 Chrome extension (content script + side panel) · `server/` Node + Express + TypeScript (LLM proxy + `node:vm` executor, guardrail, key on the server) · `app/` optional web demo · model: Qwen 3.8 27B via OpenAI-compatible API.

MIT. Built by Sagen Hansda (SagenHansda19) for BharatCode Build League 2026.
