// Live integration test: real Adaption qwen3.8-27b generate -> parse -> worker run.
// Uses the extension's real prompts + schema. Reads the key from ../.env.
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGenerateRequest, buildHintRequest, buildExplainRequest, GENERATE_SCHEMA } from '../extension/lib/prompts.js';

const env = fs.readFileSync(path.join(import.meta.dirname, '..', '.env'), 'utf8');
const key = env.match(/BHARATCODE_API_KEY=(\S+)/)[1];
const model = (env.match(/BHARATCODE_MODEL=(\S+)/) || [])[1] || 'qwen3.8-27b';
const baseUrl = (env.match(/BHARATCODE_BASE_URL=(\S+)/) || [])[1] || 'https://api.prod.adaptionlabs.ai/api/v1';

function parseJsonLoose(text) {
  let s = (text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function chat(opts) {
  const body = {
    model,
    max_tokens: opts.maxTokens ?? 8000,
    temperature: opts.temperature ?? 0.1,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  };
  if (opts.schema) body.response_format = { type: 'json_schema', json_schema: { name: 'resp', schema: opts.schema, strict: true } };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

const problem = `Given an array nums and an integer target, return indices of the two numbers such that they add up to target.
Example: nums = [2,7,11,15], target = 9 => [0,1]. Return [] if none. (JavaScript)
You must not modify the input array in place.`;

const userCode = `
function twoSum(nums, target) {
  for (let i = 1; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
  return [];
}`;

// 1) Generate
const req = buildGenerateRequest(problem, userCode);
const artifact = parseJsonLoose(await chat(req));
console.log('entryName:', artifact.entryName);
console.log('has bruteForce:', !!artifact.bruteForceCode, '| has generator:', !!artifact.generatorCode);

// 2) Run in the (headless) worker
const workerSrc = fs.readFileSync(path.join(import.meta.dirname, '..', 'extension', 'lib', 'verify-worker.js'), 'utf8');
const out = [];
const self = { onmessage: null, postMessage: (m) => out.push(m) };
new Function('self', workerSrc + '\n; if (self.onmessage) return self;')(self);
self.onmessage({ data: { userCode, artifact, seed: 42 } });
const m = out.find((x) => x.type === 'done' || x.type === 'error');
if (m.type === 'error') {
  console.log('WORKER ERROR:', m.error);
} else if (m.result && m.result.best) {
  const b = m.result.best;
  console.log('BUG FOUND input:', JSON.stringify(b.input), 'yours:', JSON.stringify(b.userOutput), 'exp:', JSON.stringify(b.expected));
} else {
  console.log('no bug found:', m && m.result ? m.result.testsRun + ' tests' : '');
}

// 3) Hint (should NOT contain a full solution)
const hint = await chat(buildHintRequest(problem, userCode, 'debug'));
const looksComplete = /\bfunction\s+twoSum\b[\s\S]*\{[\s\S]*return/i.test(hint) && hint.length > 400;
console.log('hint length:', hint.length, '| contains full twoSum fn?:', looksComplete);
console.log('--- hint preview ---\n' + hint.slice(0, 300));
