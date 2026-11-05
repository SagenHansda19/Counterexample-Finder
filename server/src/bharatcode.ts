/**
 * Minimal OpenAI-compatible Chat Completions client for BharatCode.
 *
 * Handles BharatCode's shared-capacity behaviour — see the resilience notes
 * in BharatCode.txt:
 *  - retries busy/5xx/429 with exponential backoff + jitter, honours Retry-After
 *  - 180s per-request timeout
 *  - drops optional params (response_format / reasoning_effort) on a 400
 *  - treats empty / truncated output as an error, never a result
 */

export interface CompletionRequest {
  system: string;
  user: string;
  /** JSON schema for structured output. The response text is then JSON (validate it). */
  schema?: { name: string; schema: Record<string, unknown> };
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
}

export interface BharatCodeClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

interface ChatResponse {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string;
  }[];
}

class BharatCodeClient {
  private structuredOutput = true;
  private reasoningParam = true;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly opts: BharatCodeClientOptions) {
    this.baseUrl = (opts.baseUrl ?? 'https://bharatcode.ai/api/model/v1').replace(/\/$/, '');
    this.model = opts.model ?? 'qwen-3.8-27b';
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  /** Returns the raw text content of the completion. */
  async complete(req: CompletionRequest): Promise<string> {
    let attempt = 0;
    for (let guard = 0; guard <= this.maxRetries; guard += 1) {
      try {
        return await this.attempt(req);
      } catch (err) {
        const e = err as LLMError;
        const retryable = e.retryable || !(err instanceof LLMError);
        if (!retryable || guard >= this.maxRetries) throw e;
        const retryAfter = e.retryAfterMs ?? equalJitter(2000, 30000);
        console.info(
          `[bharatcode] busy/unreachable (${e.message}); retry ${guard + 1} in ${Math.round(retryAfter / 1000)}s`,
        );
        await sleep(retryAfter);
      }
    }
    throw new LLMError('exhausted retries');
  }

  private buildBody(req: CompletionRequest): Record<string, unknown> {
    let system = req.system;
    const body: Record<string, unknown> = {
      model: req.model ?? this.model,
      max_tokens: req.maxOutputTokens ?? 8000,
      temperature: req.temperature ?? 0.1,
    };
    if (this.reasoningParam) body.reasoning_effort = 'low';
    if (req.schema) {
      if (this.structuredOutput) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: req.schema.name, schema: req.schema.schema, strict: true },
        };
      } else {
        system +=
          `\n\nRespond with ONLY a JSON object (no prose, no code fences) matching this JSON schema:\n` +
          JSON.stringify(req.schema.schema);
      }
    }
    body.messages = [
      { role: 'system', content: system },
      { role: 'user', content: req.user },
    ];
    return body;
  }

  private async attempt(req: CompletionRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.opts.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(this.buildBody(req)),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const requestId = res.headers.get('x-request-id') ?? undefined;
    const raw = await res.text();

    if (!res.ok) {
      const message = extractErrorMessage(raw) ?? res.statusText;
      if (res.status === 400 && (this.structuredOutput || this.reasoningParam)) {
        console.debug(`[bharatcode] rejected params (${message}); retrying without optional params`);
        if (this.structuredOutput && /response_format|json_schema|schema/i.test(message)) {
          this.structuredOutput = false;
        } else if (this.reasoningParam && /reasoning/i.test(message)) {
          this.reasoningParam = false;
        } else {
          this.structuredOutput = false;
          this.reasoningParam = false;
        }
        throw new LLMError(`400 ${message}`, 400, requestId, true);
      }
      if (res.status === 401 || res.status === 402) {
        throw new LLMError(
          `${res.status}: verify your student email / subscription at bharatcode.ai/account`,
          res.status,
          requestId,
          false,
        );
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new LLMError(
        `${res.status} ${message}${requestId ? ` (x-request-id: ${requestId})` : ''}`,
        res.status,
        requestId,
        RETRYABLE_STATUS.has(res.status),
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      );
    }

    let data: ChatResponse;
    try {
      data = JSON.parse(raw) as ChatResponse;
    } catch {
      throw new LLMError('BharatCode returned a non-JSON response', res.status, requestId, true);
    }
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';
    if (choice?.finish_reason === 'length' && !content.trim()) {
      throw new LLMError('Model output was truncated (finish_reason: length)', res.status, requestId, false);
    }
    if (!content.trim()) throw new LLMError('Model returned an empty response', res.status, requestId, true);
    return content;
  }
}

function equalJitter(base: number, cap: number): number {
  const d = Math.min(base, cap);
  return d / 2 + Math.random() * d;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractErrorMessage(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    return parsed.error?.message ?? parsed.message;
  } catch {
    return raw.slice(0, 200) || undefined;
  }
}

export { BharatCodeClient };

