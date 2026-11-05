export interface Sample {
  id: string;
  label: string;
  demo: boolean;
  problem: string;
  code: string;
}

const TWO_POINTER: Sample = {
  id: 'two-pointer',
  label: 'Two Pointer / Loops — Off-by-One',
  demo: true,
  problem:
    'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Exactly one valid solution exists. (Assume 0-based indices.)',
  code: `function solution(nums, target) {
  // BUG: outer loop starts at i = 1, so index 0 is never used.
  for (let i = 1; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
  return [];
}`,
};

const PREFIX_SUM: Sample = {
  id: 'prefix-sum',
  label: 'Subarray Sum — Off-by-One Range',
  demo: false,
  problem:
    'Given an array of integers nums, return the maximum sum of any contiguous subarray using a sliding window of a fixed positive length k.',
  code: `function solution(nums, k) {
  // BUG: window sum compares before advancing, and the loop reads past its
  // intended range, so the maximum can be missed.
  let best = -Infinity;
  for (let i = 0; i < nums.length - k; i++) {
    let sum = 0;
    for (let j = i; j < i + k; j++) sum += nums[j];
    if (sum > best) best = sum;       // this is fine
  }
  return best;                        // BUG: last valid window (i = n-k) is skipped
}`,
};

export const SAMPLES: Sample[] = [TWO_POINTER, PREFIX_SUM];
