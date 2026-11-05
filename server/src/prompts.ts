import type { CompletionRequest } from './bharatcode.js';

export interface GenerateResult {
  entryName: string;
  bruteForceCode: string;
  generatorCode: string;
  userJs: string;
  normalizeCode: string;
  maxInputSize: number;
  testCount: number;
}

/** JSON schema for Call A (strict structured output). */
export const GENERATE_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['entryName', 'bruteForceCode', 'generatorCode', 'userJs', 'normalizeCode'],
  properties: {
    entryName: {
      type: 'string',
      description:
        'The exact name of the function defined in the user solution code that we will call.',
    },
    bruteForceCode: {
      type: 'string',
      description:
        'JavaScript source that defines a function named `bruteForce`. It is a slow but guaranteed-correct reference solution for the problem. It is called as bruteForce(...args) where args come from makeInput. Must be self-contained (no external helpers).',
    },
    generatorCode: {
      type: 'string',
      description:
        'JavaScript source that defines a function named `makeInput(rng, size)`. rng is a seeded function returning a float in [0,1). size is a hint for the desired input size. It returns an ARRAY of positional arguments to pass to both bruteForce and the user solution. It must be self-contained.',
    },
    userJs: {
      type: 'string',
      description:
        'JavaScript source that defines a function named EXACTLY entryName — a faithful JavaScript version of the USER solution, preserving its EXACT logic and any bug (same control flow, same return values). If the user code is already JavaScript, copy it verbatim. It must accept the same positional arguments that makeInput returns. Do NOT fix the bug.',
    },
    normalizeCode: {
      type: 'string',
      description:
        'JavaScript source that defines a function named `canon(output, input)`. It returns a CANONICAL form of an answer so that two equivalent answers compare equal. Use the PROBLEM statement to decide: if the problem allows any order / a set / a multiset (e.g. "you can return the answer in any order", "indices" of a set), sort or normalize so equivalent answers match (e.g. for an array of indices return output.slice().sort((a,b)=>a-b)); if the problem requires a specific order, return output unchanged. If output is undefined/null, return null. input is the array of positional args. Keep it deterministic and side-effect free.',
    },
    maxInputSize: {
      type: 'number',
      description: 'Smallest width hint that still hits the bug class (keep small, e.g. 6-10).',
    },
    testCount: {
      type: 'number',
      description: 'How many random tests to generate (e.g. 80-150).',
    },
  },
} as const;

export const GENERATE_NAME = 'generate_artifacts';

export const SYSTEM_GENERATE = `You are the code-generation stage of a "counterexample finder" for competitive programming and LeetCode-style problems.

The user gives you a problem statement and their (possibly buggy) solution in JavaScript. Your job: produce artifacts that let a verifier PROVE the bug by running code, never by trusting your words.

You must emit the following executable JavaScript artifacts:

1. bruteForce — a correct, safe, SLOW reference solution. Correctness beats speed. Prefer an O(N^2) or exponential scan so it is obviously right. It must be defined as a function named bruteForce and accept the SAME positional arguments returned by makeInput.

2. makeInput(rng, size) — a random test-case generator. rng is a seeded function: calling rng() returns a float in [0,1). size is an integer hint for how big the input should be (you can use Math.max(2, floor(size - floor(rng()*3)))). It must return an ARRAY of positional arguments (e.g. [nums, target]). Bias it to craft inputs that trigger tricky edge cases for the problem (duplicates, zeros, negatives, empty, boundaries), while still being random. Do NOT put the solution logic in here.

3. userJs — a faithful JavaScript re-implementation of the USER's solution, as a function named EXACTLY entryName, with the SAME logic INCLUDING any bug. If the user code is already JavaScript, copy it verbatim. If it is in another language (C++, Python, etc.), transcribe it to JavaScript keeping the exact control flow and bug. Do NOT fix the bug.

4. canon(output, input) — a canonicalizer. Using the PROBLEM statement, return a form of an answer so that equivalent answers compare equal. If the problem allows multiple valid orderings or a set (e.g. "you can return the answer in any order", "a set of indices"), normalize (e.g. sort an array of indices). If a specific order is required, return the output unchanged. This prevents false positives when several answers are all correct.

5. entryName — the exact function name of the user's solution to call.

Rules:
- Both bruteForce and makeInput must be self-contained and define their function using a top-level JavaScript function declaration (for example function NAME(args) { ... }) so they can be extracted. No imports, no outer wrapper, no template-literal backticks inside, no trailing exports.
- Do not reference each other; makeInput returns raw args, bruteForce computes from them.
- These run in a browser sandbox. Keep them bounded and deterministic for a given rng.

Make sure bruteForce is genuinely correct — the whole tool depends on it.`;

export function buildGenerateRequest(problem: string, userCode: string): CompletionRequest {
  return {
    system: SYSTEM_GENERATE,
    user: `PROBLEM STATEMENT:\n${problem}\n\nUSER SOLUTION (JavaScript):\n${userCode}\n\nProduce the JSON artifacts now.`,
    schema: { name: GENERATE_NAME, schema: JSON.parse(JSON.stringify(GENERATE_SCHEMA)) },
    maxOutputTokens: 4000,
    temperature: 0.1,
  };
}

export function buildExplainRequest(
  problem: string,
  userCode: string,
  input: unknown,
  userOutput: unknown,
  expected: unknown,
  userError?: string,
): CompletionRequest {
  return {
    system: `You explain, in a few clean sentences, the root cause of a bug in a competitive-programming solution — given the ACTUAL input that broke it and the actual outputs. Be concrete, reference the specific input, and suggest the fix in the user's OWN code. The user's code is given below (it may be C++, Python, JavaScript, etc.) — explain in THAT language, referencing the user's actual code, NOT a JavaScript translation. Do not invent behavior that is not shown. If the mismatch is a crash, focus on why that input crashes.`,
    user: `A counterexample was found. Explain the root cause.

PROBLEM:
${problem}

USER SOLUTION:
${userCode}

FAILING INPUT (arg list):
${JSON.stringify(input)}

YOUR OUTPUT:
${userError ? `The solution threw an error: ${userError}` : JSON.stringify(userOutput)}

EXPECTED (from the verified brute force):
${JSON.stringify(expected)}

Root cause and fix:`,
    maxOutputTokens: 900,
    temperature: 0.3,
  };
}

/** lenient JSON extraction: strip code fences and leading prose */
export function parseJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}
