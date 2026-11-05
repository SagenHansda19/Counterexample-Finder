import { useMemo, useState } from 'react';
import type { Artifact, WorkerResult } from './worker/protocol';
import { SAMPLES } from './lib/samples';
import { analyze, explain } from './lib/api';

type Status = 'idle' | 'generating' | 'running' | 'explaining' | 'done' | 'error' | 'clean';

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function newSeed(): number {
  return (Date.now() % 999983 + Math.floor(Math.random() * 1000)) >>> 0;
}

function compute(
  userCode: string,
  artifact: Artifact,
  seed: number,
  onProgress: (done: number, total: number) => void,
): Promise<WorkerResult> {
  const worker = new Worker(new URL('./worker/runner.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<WorkerResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string } & Partial<WorkerResult> & { error?: string; done?: number; total?: number };
      if (msg.type === 'progress') onProgress(msg.done ?? 0, msg.total ?? 0);
      if (msg.type === 'done') {
        worker.terminate();
        resolve(msg as unknown as WorkerResult);
      }
      if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error ?? 'worker error'));
      }
    };
    worker.postMessage({ userCode, artifact, seed });
  });
}

export default function App() {
  const [problem, setProblem] = useState(SAMPLES[0].problem);
  const [code, setCode] = useState(SAMPLES[0].code);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [seed, setSeed] = useState<number | null>(null);
  const [result, setResult] = useState<WorkerResult | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const [mock, setMock] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const active = useMemo(
    () => ['generating', 'running', 'explaining'].some((s) => s === status),
    [status],
  );

  async function run(seedVal: number, reuseArtifact: Artifact | null) {
    setError('');
    setResult(null);
    setExplanation('');
    setCopied(false);
    try {
      setStatus(reuseArtifact ? 'running' : 'generating');
      let art = reuseArtifact;
      if (!art) {
        setMock(false);
        const resp = await analyze(problem, code);
        setMock(resp.mock);
        if (!resp.artifact) throw new Error(resp.error ?? 'no artifact');
        art = resp.artifact;
      }
      setArtifact(art);
      setSeed(seedVal);
      setStatus('running');
      const wr = await compute(code, art, seedVal, (d, t) => setProgress(d / t));
      setResult(wr);
      if (wr.best) {
        setStatus('explaining');
        const ex = await explain({
          problem,
          userCode: code,
          input: wr.best.input,
          userOutput: wr.best.userOutput,
          expected: wr.best.expected,
          userError: wr.best.userError,
        });
        setExplanation(ex.explanation || ex.error || '');
      }
      setStatus(wr.best ? 'done' : 'clean');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  const findBug = () => run(newSeed(), null);
  const reroll = () => artifact && run(newSeed(), artifact);

  async function copyCounter() {
    if (!result?.best) return;
    const b = result.best;
    const text = `input: ${JSON.stringify(b.input)}\nyours:   ${
      b.kind === 'crash' ? `throws: ${b.userError}` : fmt(b.userOutput)
    }\nexpected: ${fmt(b.expected)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const verdict = result?.best
    ? { tone: 'bug', title: '🐞 Bug found', sub: 'A mismatch was proven by running the code.' }
    : status === 'clean'
      ? { tone: 'ok', title: '✅ No counterexample found', sub: `Matched the brute force on ${result?.testsRun ?? 0} random tests.` }
      : null;

  return (
    <div className="page">
      <header>
        <div className="head-row">
          <h1>🐞 Counterexample Finder</h1>
          <a className="badge" href="https://github.com/SagenHansda19/Counterexample-Finder" target="_blank" rel="noreferrer">
            ⭐ GitHub
          </a>
        </div>
        <p className="tag">
          Paste a problem + your code. The AI writes a brute force — <b>your browser proves it</b> and shows the smallest failing input.
        </p>
        {mock && (
          <div className="banner">
            ⚡ <b>Demo mode</b> (no API key) — using the built-in sample so you can try it instantly.
          </div>
        )}
      </header>

      <div className="steps">
        <span><i>1</i> Paste a problem</span>
        <span><i>2</i> AI writes a brute force</span>
        <span><i>3</i> Your browser finds the smallest failing input</span>
      </div>

      <div className="samples">
        <span>Try a sample:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setProblem(s.problem);
              setCode(s.code);
              setResult(null);
              setExplanation('');
              setError('');
              setStatus('idle');
              setArtifact(null);
            }}
          >
            {s.label}
            {s.demo ? ' (no key needed)' : ''}
          </button>
        ))}
      </div>
      <div className="grid">
        <label className="card">
          <span className="card-label">PROBLEM STATEMENT</span>
          <textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={6} spellCheck={false} />
        </label>
        <label className="card">
          <span className="card-label">YOUR SOLUTION (JavaScript)</span>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={6} spellCheck={false} />
        </label>
      </div>

      <div className="actions">
        <button className="primary" onClick={findBug} disabled={active}>
          {status === 'generating'
            ? 'Asking the AI…'
            : status === 'running'
              ? `Running tests… ${Math.round(progress * 100)}%`
              : status === 'explaining'
                ? 'Explaining…'
                : 'Find counterexample'}
        </button>
        <button className="ghost" onClick={reroll} disabled={active || !artifact}>
          🎲 New random tests
        </button>
        {active && (
          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {seed !== null && <span className="muted">seed {seed}</span>}
      </div>

      {status === 'error' && <div className="error">⚠️ {error}</div>}

      {verdict && (
        <div className={`card result ${verdict.tone === 'ok' ? 'ok' : 'bug'}`}>
          <div className="verdict">
            <div>
              <div className="verdict-title">{verdict.title}</div>
              <div className="verdict-sub">{verdict.sub}</div>
            </div>
            {result?.best && (
              <button className="ghost small" onClick={copyCounter}>
                {copied ? '✅ Copied' : '📋 Copy counterexample'}
              </button>
            )}
          </div>

          {result?.best && (
            <div className="rows">
              <div className="row">
                <span className="k">Input</span>
                <pre>{JSON.stringify(result.best.input)}</pre>
              </div>
              <div className="row">
                <span className="k">Your output</span>
                <pre className="bad">
                  {result.best.kind === 'crash' ? `throws: ${result.best.userError}` : fmt(result.best.userOutput)}
                </pre>
              </div>
              <div className="row">
                <span className="k">Expected</span>
                <pre className="good">{fmt(result.best.expected)}</pre>
              </div>
              <div className="row">
                <span className="k">Found in</span>
                <pre>{result.testsRun} random tests</pre>
              </div>
            </div>
          )}

          {explanation && (
            <>
              <h2>🧠 Root cause</h2>
              <p className="explain">{explanation}</p>
            </>
          )}

          {result?.bothFailed && (
            <p className="note">
              ⚠️ The brute force <i>also</i> failed on some input. The generator may have produced an impossible case — treat the result with care.
            </p>
          )}

          {artifact && (
            <div className="artifacts">
              <button className="ghost small" onClick={() => setShowCode((v) => !v)}>
                {showCode ? '▾ Hide AI-generated code' : '▸ Show AI-generated brute force & test generator'}
              </button>
              {showCode && (
                <div className="art-grid">
                  <div>
                    <span className="card-label">BRUTE FORCE (reference)</span>
                    <pre className="art">{artifact.bruteForceCode}</pre>
                  </div>
                  <div>
                    <span className="card-label">RANDOM TEST GENERATOR</span>
                    <pre className="art">{artifact.generatorCode}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <footer className="foot">
        Runs fully in your browser · powered by the open <b>Qwen 3.8 27B</b> model · no data leaves your machine except to the model
      </footer>
    </div>
  );
}


