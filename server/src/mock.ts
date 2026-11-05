import type { GenerateResult } from './prompts.js';

/**
 * Demo mode: when no BHARATCODE_API_KEY is set, the server returns this canned
 * artifact so the built-in sample (Two-Pointer Off-by-One) still runs REAL
 * verification in the browser. The AI "writes" this; the browser still checks it.
 */
export function mockGenerate(): { artifact: GenerateResult; mock: true } {
  return {
    mock: true,
    artifact: {
      entryName: 'solution',
      userJs: `function solution(nums, target) {
  for (let i = 1; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
  return [];
}`,
      bruteForceCode: `function bruteForce(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
  return [];
}`,
      generatorCode: `function makeInput(rng, size) {
  const n = Math.max(2, size - Math.floor(rng() * 3));
  const nums = [];
  for (let i = 0; i < n; i++) {
    nums.push(Math.floor(rng() * 8));
  }
  // guarantee a valid pair (indices 0 and 1) so the off-by-one bug always shows.
  const target = nums[0] + nums[1];
  return [nums, target];
}`,
      normalizeCode: `function canon(output, input) {
  if (output == null) return null;
  if (Array.isArray(output)) return output.slice().sort((a, b) => a - b);
  return output;
}`,
      maxInputSize: 10,
      testCount: 40,
    },
  };
}

export function mockExplain(): string {
  return (
    'The loop starts at i = 1 and skips index 0 entirely, and the chosen pair is ' +
    'always (0, 1). So on an input like this the true answer is [0, 1], but your ' +
    'code never considers pairs involving index 0 and returns []. Fix: start the ' +
    'outer loop at i = 0.'
  );
}
