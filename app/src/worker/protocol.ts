export interface Artifact {
  language?: string;
  entryName: string;
  bruteForceCode: string;
  generatorCode: string;
  maxInputSize: number;
  testCount: number;
}

export interface Evals {
  userOut: unknown;
  bruteOut: unknown;
  userErr?: string;
  bruteErr?: string;
  userMs: number;
  bruteMs: number;
}

export interface Finding {
  kind: 'mismatch' | 'crash';
  input: unknown[];
  userOutput?: unknown;
  userError?: string;
  expected: unknown;
  sizeMetric: number;
}

export interface TimingPoint {
  test: number;
  userMs: number;
  bruteMs: number;
}

export interface WorkerResult {
  seed: number;
  testsRun: number;
  findings: Finding[];
  best: Finding | null;
  bothFailed: boolean;
  timing: TimingPoint[];
}


export interface WorkerRequest {
  userCode: string;
  artifact: Artifact;
  seed: number;
}

export type WorkerMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; result: WorkerResult }
  | { type: 'error'; error: string };
