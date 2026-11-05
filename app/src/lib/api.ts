import type { Artifact } from '../worker/protocol';

export interface AnalyzeResponse {
  mock: boolean;
  artifact?: Artifact;
  error?: string;
}

export async function analyze(problem: string, userCode: string): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ problem, userCode }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `server error ${res.status}`);
  }
  return (await res.json()) as AnalyzeResponse;
}

export interface ExplainResponse {
  mock: boolean;
  explanation: string;
  error?: string;
}

export async function explain(req: {
  problem: string;
  userCode: string;
  input: unknown;
  userOutput: unknown;
  expected: unknown;
  userError?: string;
}): Promise<ExplainResponse> {
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `server error ${res.status}`);
  }
  return (await res.json()) as ExplainResponse;
}
