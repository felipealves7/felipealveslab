// Response times and usage for a run. List-price figures use published rates; they are not a bill.

export function measurements(records, summary) {
  const times = records.map((r) => r.elapsedMs).filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const complete = records.length > 0 && records.every((r) => r.usage && Number.isFinite(r.usage.pricingDerivedNeurons));
  const neurons = complete ? records.reduce((n, r) => n + r.usage.pricingDerivedNeurons, 0) : null;
  const equivalent = neurons === null ? null : (neurons * 0.011) / 1000; // US$0.011 per 1,000 neurons
  const rank = (q) => (times.length ? times[Math.ceil(times.length * q) - 1] : null);
  return {
    responseTiming: {
      population: 'All recorded complete HTTP responses, including errors; not server-only inference time.',
      sampleCount: times.length,
      missingCount: records.length - times.length,
      meanMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
      p50Ms: rank(0.5),
      p95Ms: rank(0.95),
      quantileMethod: 'nearest rank; small samples are not latency guarantees',
    },
    usage: {
      telemetryComplete: complete,
      recordsWithUsage: records.filter((r) => r.usage).length,
      inputTokens: complete ? records.reduce((n, r) => n + r.usage.inputTokens, 0) : null,
      outputTokens: complete ? records.reduce((n, r) => n + r.usage.outputTokens, 0) : null,
      pricingDerivedNeurons: neurons,
      listPriceEquivalentUsd: equivalent,
      actualBilledUsd: null,
      listPriceUsdPerCorrectNumericAnswer: equivalent !== null && summary.correct_answer > 0 ? equivalent / summary.correct_answer : null,
      listPriceUsdPerCorrectDecision: equivalent !== null && summary.right > 0 ? equivalent / summary.right : null,
      note: 'List-price equivalents use published rates. Billing needs the account meter; zero is never assumed.',
    },
  };
}
