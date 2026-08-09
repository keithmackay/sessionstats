// ABOUTME: Per-model USD pricing table and cost calculation
// ABOUTME: Ported from claude-sessions/scripts/claude-metrics.py; update when Anthropic pricing changes

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-5-20251101': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-opus-4-6': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 1.00 },
};

const DEFAULT_PRICING: ModelPricing = { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 };

export function getPricing(model: string): ModelPricing {
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }
  return DEFAULT_PRICING;
}

export function costForUsage(usage: Usage, model: string): number {
  const pricing = getPricing(model);
  const perM = 1_000_000;
  return (
    (usage.input_tokens / perM) * pricing.input +
    (usage.output_tokens / perM) * pricing.output +
    (usage.cache_read_input_tokens / perM) * pricing.cacheRead +
    (usage.cache_creation_input_tokens / perM) * pricing.cacheWrite
  );
}
