import { describe, it, expect } from 'vitest';
import { getPricing, costForUsage } from '../../src/lib/pricing.js';

describe('pricing', () => {
  it('returns exact pricing for a known model', () => {
    const p = getPricing('claude-sonnet-4-5-20250929');
    expect(p.input).toBe(3.00);
    expect(p.output).toBe(15.00);
  });

  it('falls back to default pricing for an unknown model', () => {
    const p = getPricing('claude-future-model-9000');
    expect(p.input).toBeGreaterThan(0);
  });

  it('computes cost from token usage', () => {
    const cost = costForUsage(
      { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      'claude-sonnet-4-5-20250929'
    );
    expect(cost).toBeCloseTo(18.00, 2); // 3 + 15
  });
});
