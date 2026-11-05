// Evaluation: does the verification engine catch planted bugs (and never flag clean code)?
//   node evals/run.js        (offline — no API key needed)
import { catchesBug } from './core.mjs';

function twoSum(loopStart) {
  return `function solution(nums, target) {
  for (let i = ${loopStart}; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++)
      if (nums[i] + nums[j] === target) return [i, j];
  }
  return [];
}`;
}

function binSearch(whenMissing) {
  return `function solution(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  return ${whenMissing};
}`;
}

// First-occurrence binary search — matches the brute force's contract exactly.
function binLower() {
  return `function solution(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1; else hi = mid;
  }
  return (lo < arr.length && arr[lo] === target) ? lo : -1;
}`;
}

const ART = {
  sumFirstK: {
    entryName: 'solution',
    bruteForceCode: `function bruteForce(nums, k) {
  let s = 0;
  for (let i = 0; i < k; i++) s += nums[i];
  return s;
}`,
    generatorCode: `function makeInput(rng, size) {
  const n = Math.max(3, size);
  const nums = [];
  for (let i = 0; i < n; i++) nums.push(1 + Math.floor(rng() * 5));
  const k = 2 + Math.floor(rng() * 3);
  return [nums, k];
}`,
  },
  indexMax: {
    entryName: 'solution',
    bruteForceCode: `function bruteForce(nums) {
  let idx = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] > nums[idx]) idx = i;
  return idx;
}`,
    generatorCode: `function makeInput(rng, size) {
  const n = Math.max(2, size - Math.floor(rng() * 3));
  const nums = [];
  for (let i = 0; i < n; i++) nums.push(Math.floor(rng() * 4));
  const m = nums[0];
  nums[Math.floor(rng() * n)] = m; // guarantee a tie at the max
  return [nums];
}`,
  },
  strictlyInc: {
    entryName: 'solution',
    bruteForceCode: `function bruteForce(nums) {
  for (let i = 0; i < nums.length - 1; i++) if (nums[i] >= nums[i + 1]) return false;
  return true;
}`,
    generatorCode: `function makeInput(rng, size) {
  const n = Math.max(2, size - Math.floor(rng() * 3));
  const nums = [];
  for (let i = 0; i < n; i++) nums.push(Math.floor(rng() * 5));
  const p = 1 + Math.floor(rng() * (n - 1));
  nums[p] = nums[p - 1]; // force an equal adjacent pair
  return [nums];
}`,
  },
  twoSum: {
    entryName: 'solution',
    bruteForceCode: `function bruteForce(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++)
      if (nums[i] + nums[j] === target) return [i, j];
  return [];
}`,
    generatorCode: `function makeInput(rng, size) {
  const n = Math.max(2, size - Math.floor(rng() * 3));
  const nums = [];
  for (let i = 0; i < n; i++) nums.push(Math.floor(rng() * 9));
  return [nums, nums[0] + nums[1]];
}`,
  },
  binary: {
    entryName: 'solution',
    bruteForceCode: `function bruteForce(arr, target) {
  for (let i = 0; i < arr.length; i++) if (arr[i] === target) return i;
  return -1;
}`,
    generatorCode: `function makeInput(rng, size) {
  const n = Math.max(1, size - Math.floor(rng() * 3));
  const arr = [];
  let v = Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) { v += Math.floor(rng() * 2); arr.push(v); }
  return [arr, Math.floor(rng() * 12)];
}`,
  },
  dup: {
    entryName: 'solution',
    bruteForceCode: `function bruteForce(nums) {
  for (let i = 0; i < nums.length; i++)
    for (let j = 0; j < nums.length; j++)
      if (i !== j && nums[i] === nums[j]) return true;
  return false;
}`,
    generatorCode: `function makeInput(rng, size) {
  const n = Math.max(2, size - Math.floor(rng() * 3));
  const nums = [];
  for (let i = 0; i < n - 1; i++) nums.push(Math.floor(rng() * 5));
  nums.push(nums[0]);
  return [nums];
}`,
  },
  profit: {
    entryName: 'solution',
    bruteForceCode: `function bruteForce(prices) {
  let best = 0;
  for (let i = 0; i < prices.length; i++)
    for (let j = i + 1; j < prices.length; j++)
      if (prices[j] - prices[i] > best) best = prices[j] - prices[i];
  return best;
}`,
    generatorCode: `function makeInput(rng, size) {
  const n = Math.max(2, size - Math.floor(rng() * 3));
  const prices = [];
  let v = Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) { v += Math.floor(rng() * 2); prices.push(v); }
  return [prices];
}`,
  },
};

// BUGGY cases (bug: true  -> a counterexample SHOULD be found)
const BUGGY = [
  { name: 'Two Sum — off-by-one outer loop', code: twoSum(1), art: ART.twoSum },
  { name: 'Binary search — wrong "not found"', code: binSearch(0), art: ART.binary },
  {
    name: 'Contains duplicate — inverted boolean',
    art: ART.dup,
    code: `function solution(nums) {
  const seen = new Set();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(nums[i])) return false;
    seen.add(nums[i]);
  }
  return true;
}`,
  },
  {
    name: 'Max profit — inner loop skips last day',
    art: ART.profit,
    code: `function solution(prices) {
  let best = 0;
  for (let i = 0; i < prices.length; i++)
    for (let j = i + 1; j < prices.length - 1; j++)
      if (prices[j] - prices[i] > best) best = prices[j] - prices[i];
  return best;
}`,
  },
  {
    name: 'Sum of first K — off-by-one (sums K-1)',
    art: ART.sumFirstK,
    code: `function solution(nums, k) {
  let s = 0;
  for (let i = 0; i < k - 1; i++) s += nums[i];
  return s;
}`,
  },
  {
    name: 'Index of max — returns LAST tie, not first',
    art: ART.indexMax,
    code: `function solution(nums) {
  let idx = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] >= nums[idx]) idx = i;
  return idx;
}`,
  },
  {
    name: 'Strictly increasing — allows equal neighbours',
    art: ART.strictlyInc,
    code: `function solution(nums) {
  for (let i = 0; i < nums.length - 1; i++) if (nums[i] > nums[i + 1]) return false;
  return true;
}`,
  },
];

// CLEAN cases (bug: false -> must NOT be flagged)
const CLEAN = [
  { name: 'Two Sum (correct) — CLEAN', code: twoSum(0), art: ART.twoSum },
  { name: 'Binary search (correct) — CLEAN', code: binLower(), art: ART.binary },
  {
    name: 'Sum of first K (correct) — CLEAN',
    art: ART.sumFirstK,
    code: `function solution(nums, k) {
  let s = 0;
  for (let i = 0; i < k; i++) s += nums[i];
  return s;
}`,
  },
];

let caught = 0;
let falsePos = 0;
for (const c of [...BUGGY, ...CLEAN]) {
  const found = catchesBug(c.code, { ...c.art, maxInputSize: 10, testCount: 60 });
  if (c.name.includes('CLEAN')) {
    if (found) { falsePos += 1; console.log(`🔴 FALSE POSITIVE  ${c.name}`); }
    else console.log(`✅ CLEAN           ${c.name}`);
  } else if (found) { caught += 1; console.log(`🐛 FOUND          ${c.name}`); }
  else console.log(`❌ MISS           ${c.name}`);
}

console.log('----------------------------------------------------');
console.log(`Planted bugs caught: ${caught} / ${BUGGY.length}`);
console.log(`False positives:     ${falsePos} on clean code`);
process.exit(caught === BUGGY.length ? 0 : 1);
