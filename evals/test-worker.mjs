// Headless test for extension/lib/verify-worker.js
// Simulates the Web Worker (self.onmessage/postMessage) and runs known cases.
'use strict';
import fs from 'node:fs';
import path from 'node:path';

const workerSrc = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'extension', 'lib', 'verify-worker.js'),
  'utf8'
);

function runWorker(userCode, artifact, seed) {
  const out = [];
  const self = {
    onmessage: null,
    postMessage: (m) => out.push(m),
  };
  const fn = new Function('self', workerSrc + '\n; if (self.onmessage) return self;');
  const workerStub = fn(self);
  // Trigger onmessage
  self.onmessage({ data: { userCode, artifact, seed } });
  return out;
}

function buildArtifactForProblem({ entryName, bruteForce, generator, maxInputSize, testCount }) {
  return {
    entryName,
    bruteForceCode: bruteForce,
    generatorCode: generator,
    maxInputSize,
    testCount,
  };
}

function firstMsg(events) {
  return events.find((m) => m.type === 'done' || m.type === 'error');
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let pass = 0;
let fail = 0;

function check(label, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? '  — ' + detail : '')); }
}

// Case 1: Two Sum off-by-one (skip index 0)
{
  const userCode = `
    function twoSum(nums, target) {
      for (let i = 1; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          if (nums[i] + nums[j] === target) return [i, j];
        }
      }
      return [];
    }
  `;
  const artifact = buildArtifactForProblem({
    entryName: 'twoSum',
    bruteForce: `
      function bruteForce(nums, target) {
        for (let i = 0; i < nums.length; i++)
          for (let j = i + 1; j < nums.length; j++)
            if (nums[i] + nums[j] === target) return [i, j];
        return [];
      }
    `,
    generator: `
      function makeInput(rng, size) {
        const n = Math.max(2, Math.min(size, 6));
        const nums = Array.from({length: n}, () => Math.floor(rng() * 10) - 5);
        const target = nums[Math.floor(rng() * nums.length)] + nums[Math.floor(rng() * nums.length)];
        return [nums, target];
      }
    `,
    maxInputSize: 5,
    testCount: 60,
  });
  const m = firstMsg(runWorker(userCode, artifact, 42));
  if (m.type === 'error') { check('Two Sum off-by-one', false, m.error); }
  else if (m.result && m.result.best) {
    check('Two Sum off-by-one', true, `input=${JSON.stringify(m.result.best.input)} yours=${JSON.stringify(m.result.best.userOutput)} exp=${JSON.stringify(m.result.best.expected)}`);
  } else {
    check('Two Sum off-by-one', false, 'no bug found (expected one)');
  }
}

// Case 2: Clean Two Sum (should not find a bug)
{
  const userCode = `
    function twoSum(nums, target) {
      for (let i = 0; i < nums.length; i++)
        for (let j = i + 1; j < nums.length; j++)
          if (nums[i] + nums[j] === target) return [i, j];
      return [];
    }
  `;
  const artifact = buildArtifactForProblem({
    entryName: 'twoSum',
    bruteForce: `
      function bruteForce(nums, target) {
        for (let i = 0; i < nums.length; i++)
          for (let j = i + 1; j < nums.length; j++)
            if (nums[i] + nums[j] === target) return [i, j];
        return [];
      }
    `,
    generator: `
      function makeInput(rng, size) {
        const n = Math.max(2, Math.min(size, 6));
        const nums = Array.from({length: n}, () => Math.floor(rng() * 10) - 5);
        const target = nums[Math.floor(rng() * nums.length)] + nums[Math.floor(rng() * nums.length)];
        return [nums, target];
      }
    `,
    maxInputSize: 5,
    testCount: 60,
  });
  const m = firstMsg(runWorker(userCode, artifact, 42));
  if (m.type === 'error') check('Clean Two Sum', false, m.error);
  else if (m.result && !m.result.best) check('Clean Two Sum', true);
  else check('Clean Two Sum', false, `false positive: ${JSON.stringify(m.result.best)}`);
}

console.log(`\nWorker tests: ${pass}/${pass + fail} pass`);
