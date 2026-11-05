# 🐞 Counterexample Finder

Paste a competitive-programming / LeetCode problem and your solution → get the **smallest input that breaks it**, your output, the expected output, and a plain-language **root cause**.

The AI never asserts a bug — it **writes a correct brute force + a random test generator**, and **your browser runs both** to *prove* the mismatch with real inputs. That's the "AI proposes, code verifies" pattern: no hallucinated explanations, no sandbox, no server cost.

**🎯 Built for the [BharatCode Build League](https://bharatcode.ai/hackathon)**, powered by BharatCode's `qwen-3.8-27b` API.

## ⚡ 10-second demo (no API key needed)
1. Open the app.
2. Click **"Two Pointer / Loops — Off-by-One"**.
3. Click **Find counterexample.** You'll see the smallest failing input + root cause. In **demo mode** the built-in sample runs the whole pipeline with a curated brute force; with your BharatCode API key it writes fresh artifacts for *any* problem.

## How it works
```
[problem] + [your code]
   -> Call A (BharatCode): writes bruteForce + makeInput   ->(strict JSON schema)
   -> Web Worker (browser): runs both on seeded random tests
   -> find the SMALLEST failing input (shrink search)
   -> Call B (BharatCode): explains the root cause from the REAL input + outputs
   -> here's your counterexample
```

## Safety & anti-hallucination design
- **Verification runs in a Web Worker in the visitor's browser** — untrusted code never needs a sandbox server.
- **Both-sides-both-fail detector** flags an inconclusive result instead of a false positive.
- **Resilient client**: retries 503/429/5xx with backoff + jitter, honours `Retry-After`, 180s timeout, drops optional params on a 400, empty/truncated output = error.

## Run it locally
```bash
npm run install:all
cp .env.example .env     # add your BHARATCODE_API_KEY (free for students)
npm run dev
# app on http://localhost:5173 · API on http://localhost:4000
npm run eval             # 4/4 planted bugs caught, 0 false positives
```

## Accuracy (eval)
```
🐛 FOUND    Two Sum — off-by-one outer loop
🐛 FOUND    Binary search — wrong "not found"
🐛 FOUND    Contains duplicate — inverted boolean
🐛 FOUND    Max profit — inner loop skips last day
🐛 FOUND    Sum of first K — off-by-one
🐛 FOUND    Index of max — returns last tie, not first
🐛 FOUND    Strictly increasing — allows equal neighbours
✅ CLEAN     Two Sum (correct)
✅ CLEAN     Binary search (correct)
✅ CLEAN     Sum of first K (correct)
Planted bugs caught: 7 / 7
False positives:     0 on clean code
```

## Stack
`app/` Vite + React + TypeScript · `server/` Node + Express + TypeScript · verification in a Web Worker.

MIT. Built by Sagen Hansda (SagenHansda19) for BharatCode Build League 2026.
