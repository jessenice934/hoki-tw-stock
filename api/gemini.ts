/**
 * Vercel Serverless Function — Gemini API proxy.
 * Keys live in server-side env vars (no VITE_ prefix) and never reach the browser.
 *
 * POST /api/gemini
 * Body: { systemInstruction?: string; contents: GeminiContent[]; generationConfig?: object }
 * Response: { text: string } | { error: string }
 */

// Node.js Serverless runtime — supports maxDuration for longer AI calls
export const maxDuration = 60;

// flash-lite first: no thinking mode, consistently fast.
// flash second: only for fallback when lite fails or produces empty output.
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Shared deadline across all retries (leave 2s buffer before Vercel's 60s hard limit).
const TOTAL_BUDGET_MS = 58_000;
// Reduced from 50s → 40s so a single-call timeout still leaves room for one retry.
const PER_CALL_TIMEOUT_MS = 40_000;
// If a fast-fail error (overload / 503) occurs and we still have this much time, try fallback.
const MIN_FALLBACK_BUDGET_MS = 20_000;

export default async function handler(
  req: { method: string; body: unknown },
  res: {
    status: (code: number) => {
      json: (data: unknown) => void;
    };
  }
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    return res.status(500).json({ error: 'API not configured — set GEMINI_API_KEY in Vercel env vars' });
  }

  const body = req.body as {
    systemInstruction?: string;
    contents?: unknown[];
    generationConfig?: unknown;
  };

  const { systemInstruction, contents, generationConfig } = body ?? {};

  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'Missing contents' });
  }

  // Budget-aware retry: multiple attempts allowed as long as remaining budget > MIN_FALLBACK_BUDGET_MS.
  // On 503/overloaded we swap to the next model (flash-lite is usually less busy).
  const startTime = Date.now();
  const budgetRemaining = () => Math.max(0, TOTAL_BUDGET_MS - (Date.now() - startTime));

  const deadKeys = new Set<number>();
  // Randomise starting key so load spreads across all keys across requests
  let keyIndex = Math.floor(Math.random() * keys.length);
  let modelIndex = 0;
  let lastError = '';
  let attemptCount = 0;

  while (budgetRemaining() > MIN_FALLBACK_BUDGET_MS && attemptCount < keys.length * MODELS.length) {
    attemptCount++;

    // Skip dead keys
    let skip = 0;
    while (deadKeys.has(keyIndex) && skip < keys.length) {
      keyIndex = (keyIndex + 1) % keys.length;
      skip++;
    }
    if (deadKeys.size >= keys.length) break;

    const key = keys[keyIndex];
    const model = MODELS[modelIndex % MODELS.length];

    const payload: Record<string, unknown> = { contents };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (generationConfig) {
      // Disable thinking for gemini-2.5-flash to prevent 50-60s timeout; lite has no thinking.
      payload.generationConfig = model === 'gemini-2.5-flash'
        ? { ...(generationConfig as Record<string, unknown>), thinkingConfig: { thinkingBudget: 0 } }
        : generationConfig;
    }

    // Per-call timeout: min(remaining budget, PER_CALL_TIMEOUT_MS)
    const callTimeout = Math.min(budgetRemaining(), PER_CALL_TIMEOUT_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), callTimeout);

    try {
      const geminiRes = await fetch(`${BASE_URL}/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await geminiRes.json() as {
        candidates?: Array<{
          content: { parts: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        error?: { message: string };
      };

      if (!geminiRes.ok) {
        const msg = data.error?.message ?? `HTTP ${geminiRes.status}`;
        lastError = msg;
        if (geminiRes.status === 400 || geminiRes.status === 403) deadKeys.add(keyIndex);
        // 404 = model not found → try next model
        // 503/overloaded = this model busy → swap to next model (flash-lite)
        // 429 = rate limit → rotate key
        if (geminiRes.status === 404 || geminiRes.status === 503) modelIndex++;
        keyIndex = (keyIndex + 1) % keys.length;
        continue;
      }

      const candidate = data.candidates?.[0];
      if (candidate?.finishReason === 'MAX_TOKENS') {
        lastError = 'MAX_TOKENS';
        modelIndex++;
        continue;
      }

      const text = candidate?.content?.parts?.find(p => p.text)?.text;
      if (!text) {
        lastError = 'Empty response from model';
        continue;
      }

      return res.status(200).json({ text });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      lastError = isTimeout
        ? `Gemini timeout after ${(callTimeout / 1000).toFixed(0)}s`
        : msg;
      // On timeout, don't keep retrying — we've already burned most of the budget.
      if (isTimeout) break;
      keyIndex = (keyIndex + 1) % keys.length;
    } finally {
      clearTimeout(timer);
    }
  }

  return res.status(500).json({ error: `Analysis failed: ${lastError}` });
}
