import { describe, it, expect } from 'vitest';
import {
  calculateTokenCostMilliVnd,
  estimateMaxCostMilliVnd,
  formatVnd,
  formatMilliVnd,
  isModelSupported,
  milliVndToVnd,
  vndToMilliVnd,
  ModelPricingUnavailableError,
} from '../../server/ai/model-pricing';

describe('AI Model Pricing & Milli-VND Math (Fail-closed)', () => {
  it('converts between VND and Milli-VND with exact integer precision', () => {
    expect(vndToMilliVnd(25000)).toBe(25000000n);
    expect(milliVndToVnd(25000000n)).toBe(25000);
    expect(vndToMilliVnd(0)).toBe(0n);
    expect(milliVndToVnd(0n)).toBe(0);
    expect(vndToMilliVnd(1)).toBe(1000n);
    expect(milliVndToVnd(999n)).toBe(0.999);
    expect(milliVndToVnd(1000n)).toBe(1);
  });

  it('formats VND strings accurately without truncating small positive values', () => {
    expect(formatVnd(25000)).toBe('25.000đ');
    expect(formatVnd(0)).toBe('0đ');
    expect(formatVnd(1000000)).toBe('1.000.000đ');
    expect(formatMilliVnd(12150n)).toBe('12,15đ');
    expect(formatMilliVnd(64800n)).toBe('64,8đ');
    expect(formatMilliVnd(162000n)).toBe('162đ');
  });

  it('recognizes supported OpenAI models', () => {
    expect(isModelSupported('gpt-4o-mini')).toBe(true);
    expect(isModelSupported('gpt-4o')).toBe(true);
    expect(isModelSupported('gpt-realtime')).toBe(true);
    expect(isModelSupported('whisper-1')).toBe(true);
    expect(isModelSupported('unsupported-custom-llm')).toBe(false);
  });

  it('throws ModelPricingUnavailableError for unsupported models (fail-closed)', () => {
    expect(() => {
      calculateTokenCostMilliVnd('unsupported-model', {
        promptTokens: 100,
        completionTokens: 50,
      });
    }).toThrow(ModelPricingUnavailableError);
  });

  it('Example 1: GPT-4o-mini (1,000 prompt, 0 cached, 500 output) = 12.15 VND = 12,150 milli-VND', () => {
    const res = calculateTokenCostMilliVnd(
      'gpt-4o-mini',
      {
        promptTokens: 1000,
        cachedTokens: 0,
        completionTokens: 500,
      },
      27000
    );

    expect(res.costMilliVnd).toBe(12150n);
    expect(res.costVnd).toBe(12.15);
  });

  it('Example 2: GPT-4o-mini (10,000 total prompt with 4,000 cached, 2,000 output) = 64.8 VND = 64,800 milli-VND', () => {
    const res = calculateTokenCostMilliVnd(
      'gpt-4o-mini',
      {
        promptTokens: 10000,
        cachedTokens: 4000,
        completionTokens: 2000,
      },
      27000
    );

    expect(res.costMilliVnd).toBe(64800n);
    expect(res.costVnd).toBe(64.8);
  });

  it('Example 3: Whisper-1 (60,000 ms audio = 1 minute) = 162 VND = 162,000 milli-VND', () => {
    const res = calculateTokenCostMilliVnd(
      'whisper-1',
      {
        durationMs: 60000,
      },
      27000
    );

    expect(res.costMilliVnd).toBe(162000n);
    expect(res.costVnd).toBe(162);
  });

  it('estimates max pre-call reservation cost', () => {
    const est = estimateMaxCostMilliVnd(
      'gpt-4o-mini',
      {
        estimatedInputTokens: 2000,
        maxOutputTokens: 1000,
      },
      27000
    );
    expect(est).toBeGreaterThanOrEqual(100000n);
    expect(typeof est).toBe('bigint');
  });
});
