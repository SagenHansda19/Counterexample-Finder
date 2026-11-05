import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { BharatCodeClient } from './bharatcode.js';
import { buildGenerateRequest, buildExplainRequest, parseJson, type GenerateResult } from './prompts.js';
import { mockGenerate, mockExplain } from './mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the repository root (where the real key lives) regardless of cwd.
config({ path: path.resolve(__dirname, '../../.env') });
config(); // fallback to cwd/.env if the present one exists
const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(express.json({ limit: '512kb' }));

const apiKey = process.env.BHARATCODE_API_KEY;
const client = apiKey
  ? new BharatCodeClient({
      apiKey,
      baseUrl: process.env.BHARATCODE_BASE_URL,
      model: process.env.BHARATCODE_MODEL,
    })
  : null;

function isGenerateResult(v: unknown): v is GenerateResult {
  const o = v as GenerateResult;
  return (
    !!o &&
    typeof o.entryName === 'string' &&
    typeof o.bruteForceCode === 'string' &&
    typeof o.generatorCode === 'string'
  );
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, modelConfigured: !!client });
});

app.post('/api/analyze', async (req: Request, res: Response) => {
  const { problem, userCode } = (req.body ?? {}) as { problem?: string; userCode?: string };
  if (!problem?.trim() || !userCode?.trim()) {
    res.status(400).json({ error: 'problem and userCode are required' });
    return;
  }
  if (!client) {
    res.json(mockGenerate());
    return;
  }
  try {
    const raw = await client.complete(buildGenerateRequest(problem, userCode));
    const parsed = parseJson(raw);
    if (!isGenerateResult(parsed)) {
      res.status(502).json({ error: 'model returned invalid artifact shape' });
      return;
    }
    res.json({ mock: false, artifact: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
});

app.post('/api/explain', async (req: Request, res: Response) => {
  const { problem, userCode, input, userOutput, expected, userError } = req.body ?? {};
  if (!client) {
    res.json({ mock: true, explanation: mockExplain() });
    return;
  }
  try {
    const raw = await client.complete(buildExplainRequest(problem, userCode, input, userOutput, expected, userError));
    res.json({ mock: false, explanation: raw.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.json({ mock: false, explanation: '', error: message });
  }
});

// In production, serve the built frontend from app/dist (single-URL deploy).
const appDist = path.resolve(__dirname, '../../app/dist');
app.use(express.static(appDist));

app.listen(PORT, () => {
  console.log(
    `[counterexample-finder] API on http://localhost:${PORT} (model: ${client ? 'configured' : 'DEMO MODE'})`,
  );
});
