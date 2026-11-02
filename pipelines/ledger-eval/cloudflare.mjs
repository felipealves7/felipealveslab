// Workers AI REST client and usage accounting for the benchmark runner.

/** Neurons implied by the reply's token counts at published rates, or null when counts are missing. */
export function actualUsage(result, rates) {
  const u = result?.usage;
  if (!u || !Number.isSafeInteger(u.prompt_tokens) || u.prompt_tokens < 0 || !Number.isSafeInteger(u.completion_tokens) || u.completion_tokens < 0) return null;
  return {
    inputTokens: u.prompt_tokens,
    outputTokens: u.completion_tokens,
    pricingDerivedNeurons: (u.prompt_tokens * rates.inputNeuronsPerMillion + u.completion_tokens * rates.outputNeuronsPerMillion) / 1e6,
  };
}

/** Worst-case neurons for the next call, from bytes rather than a tokenizer: deliberately high. */
export function reserveNeurons(messages, rates, maxTokens = 400) {
  const bytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
  return ((bytes + 1024) * rates.inputNeuronsPerMillion + maxTokens * rates.outputNeuronsPerMillion) / 1e6;
}

/** One call: fixed max_tokens 400 and temperature 0, a 30-second deadline, no retries. */
export async function infer({ account, token, model, messages, fetchFn = fetch }) {
  const start = performance.now();
  const res = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: 400, temperature: 0 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return { ok: false, httpStatus: res.status, elapsedMs: performance.now() - start };
  const body = await res.json();
  const elapsedMs = performance.now() - start;
  if (body.success === false) return { ok: false, httpStatus: res.status, elapsedMs, providerSuccess: false };
  return { ok: true, httpStatus: res.status, elapsedMs, result: body.result };
}
