// LIVE test: run worker/worker.js against the real Adaption API (uses key from .env).
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const envFile = fs.readFileSync(path.join(import.meta.dirname, '..', '.env'), 'utf8');
const key = envFile.match(/BHARATCODE_API_KEY=(\S+)/)[1];
const model = (envFile.match(/BHARATCODE_MODEL=(\S+)/) || [])[1] || 'qwen3.8-27b';
const base = (envFile.match(/BHARATCODE_BASE_URL=(\S+)/) || [])[1] || 'https://api.prod.adaptionlabs.ai/api/v1';

let src = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker', 'worker.js'), 'utf8');
src = src.replace('export default {', 'const __worker = {') + '\nexport default __worker;\n';
const tmp = path.join(os.tmpdir(), 'cxf-worker-live-' + Date.now() + '.mjs');
fs.writeFileSync(tmp, src);
const worker = (await import(tmp)).default;

const env = { ADA_BASE_URL: base, ADA_MODEL: model, API_KEY: key };
const u = 'https://local.test/';
async function post(obj) {
  return worker.fetch(new Request(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) }), env);
}

const problem = 'Given an array nums and an integer target, return indices of the two numbers that add up to target. Example: nums=[2,7,11,15], target=9 => [0,1]. Return [] if none. (JavaScript) Do not modify the input array.';
const userCode = 'function twoSum(nums,target){for(let i=1;i<nums.length;i++){for(let j=i+1;j<nums.length;j++){if(nums[i]+nums[j]===target)return[i,j];}}return[];}';

console.log('--- generate ---');
const g = await post({ op: 'generate', problem, code: userCode });
const gjson = await g.json();
if (g.status === 200) {
  const a = gjson.artifact;
  console.log('entryName:', a.entryName, '| bf len:', a.bruteForceCode.length, '| gen len:', a.generatorCode.length, '| size:', a.maxInputSize, '| tests:', a.testCount);
} else console.log('generate FAILED', g.status, JSON.stringify(gjson));

// feed the real artifact into the (headless) verify worker
if (g.status === 200) {
  const vw = fs.readFileSync(path.join(import.meta.dirname, '..', 'extension', 'lib', 'verify-worker.js'), 'utf8');
  const out = [];
  const self = { onmessage: null, postMessage: (m) => out.push(m) };
  new Function('self', vw + '\n; if (self.onmessage) return self;')(self);
  self.onmessage({ data: { userCode, artifact: gjson.artifact, seed: 42 } });
  const m = out.find((x) => x.type === 'done' || x.type === 'error');
  if (m.type === 'error') console.log('verify error:', m.error);
  else if (m.result.best) console.log('BUG FOUND input:', JSON.stringify(m.result.best.input), 'yours:', JSON.stringify(m.result.best.userOutput), 'exp:', JSON.stringify(m.result.best.expected));
  else console.log('no bug found (tests:', m.result.testsRun + ')');

  // live explain
  const best = m.result.best || { input: [[2, 0, 2]], userOutput: 0, expected: 1 };
  console.log('--- explain ---');
  const x = await post({ op: 'explain', problem, code: userCode, input: best.input, userOutput: best.userOutput, userError: best.userError, expected: best.expected });
  const xjson = await x.json();
  console.log('explain status:', x.status, '| len:', (xjson.explanation || '').length, '| preview:', (xjson.explanation || JSON.stringify(xjson)).slice(0, 200));
}

console.log('--- hint ---');
const h = await post({ op: 'hint', problem, code: userCode, level: 'debug' });
const hjson = await h.json();
const hasFullFn = /\bfunction\s+twoSum\b[\s\S]*\{[\s\S]*return/.test(hjson.hint || '');
console.log('hint status:', h.status, '| len:', (hjson.hint || '').length, '| contains full twoSum fn?:', hasFullFn);
console.log('hint preview:\n' + (hjson.hint || JSON.stringify(hjson)).slice(0, 300));
fs.unlinkSync(tmp);
