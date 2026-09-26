import { env } from '../config/env';

/**
 * JAMI AI Model Pricing Catalog (Standard Tier)
 * Fixed snapshot date: 2026-09-19
 * Official OpenAI Standard Tier Pricing:
 * - https://developers.openai.com/api/docs/pricing?latest-pricing=standard
 * - https://developers.openai.com/api/docs/models/gpt-4o-mini
 * - https://developers.openai.com/api/docs/models/gpt-4o
 * - https://developers.openai.com/api/docs/models/gpt-realtime
 * - https://developers.openai.com/api/docs/models/whisper-1
 *
 * Fixed exchange rate: 1 USD = 27,000 VND
 * Exact integer math in milli-VND (1 VND = 1,000 milli-VND).
 * All money and token calculations are BigInt rational math to prevent any floating point drift.
 */

export const PRICING_VERSION = '2026-09-19-standard';
export const PRICING_TIER = 'standard';
export const DEFAULT_EXCHANGE_RATE_VND = 27000;
export const REALTIME_DURATION_ESTIMATOR_VERSION = 'realtime-duration-v1';
export const REALTIME_ESTIMATED_VND_PER_MINUTE = 300;

/** Conservative server-duration fallback when provider token usage is unavailable. */
export function estimateRealtimeDurationCostMilliVnd(durationMs: number): bigint {
  const boundedMs = Math.max(0, Math.round(durationMs));
  return ceilDiv(BigInt(boundedMs) * vndToMilliVnd(REALTIME_ESTIMATED_VND_PER_MINUTE), 60_000n);
}

export interface ModelPricingTier {
  modelId: string;
  sourceUrl: string;
  checkedAt: string;
  tier: 'standard';
  // Micro-USD (1 USD = 1,000,000 micro-USD) per 1,000,000 tokens
  inputMicroUsdPer1M: bigint;
  cachedInputMicroUsdPer1M: bigint;
  outputMicroUsdPer1M: bigint;
  // Audio & Image Token pricing for Realtime models
  audioInputMicroUsdPer1M?: bigint;
  cachedAudioInputMicroUsdPer1M?: bigint;
  audioOutputMicroUsdPer1M?: bigint;
  imageInputMicroUsdPer1M?: bigint;
  cachedImageInputMicroUsdPer1M?: bigint;
  // Per-minute pricing for transcription models (micro-USD per minute)
  microUsdPerMinute?: bigint;
}

export const MODEL_PRICING_CATALOG: Record<string, ModelPricingTier> = {
  'gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-4o-mini',
    checkedAt: '2026-09-19',
    tier: 'standard',
    // 0.15 USD / 1M = 150,000 micro-USD
    inputMicroUsdPer1M: 150_000n,
    // 0.075 USD / 1M = 75,000 micro-USD
    cachedInputMicroUsdPer1M: 75_000n,
    // 0.60 USD / 1M = 600,000 micro-USD
    outputMicroUsdPer1M: 600_000n,
  },
  'gpt-4o': {
    modelId: 'gpt-4o',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-4o',
    checkedAt: '2026-09-19',
    tier: 'standard',
    // 2.50 USD / 1M = 2,500,000 micro-USD
    inputMicroUsdPer1M: 2_500_000n,
    // 1.25 USD / 1M = 1,250,000 micro-USD
    cachedInputMicroUsdPer1M: 1_250_000n,
    // 10.00 USD / 1M = 10,000,000 micro-USD
    outputMicroUsdPer1M: 10_000_000n,
  },
  'gpt-realtime': {
    modelId: 'gpt-realtime',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime',
    checkedAt: '2026-09-19',
    tier: 'standard',
    // Text: 4.00 USD / 1M input, 0.40 USD / 1M cached, 16.00 USD / 1M output
    inputMicroUsdPer1M: 4_000_000n,
    cachedInputMicroUsdPer1M: 400_000n,
    outputMicroUsdPer1M: 16_000_000n,
    // Audio: 32.00 USD / 1M input, 0.40 USD / 1M cached, 64.00 USD / 1M output
    audioInputMicroUsdPer1M: 32_000_000n,
    cachedAudioInputMicroUsdPer1M: 400_000n,
    audioOutputMicroUsdPer1M: 64_000_000n,
    // Image: 5.00 USD / 1M input, 0.50 USD / 1M cached
    imageInputMicroUsdPer1M: 5_000_000n,
    cachedImageInputMicroUsdPer1M: 500_000n,
  },
  'whisper-1': {
    modelId: 'whisper-1',
    sourceUrl: 'https://developers.openai.com/api/docs/models/whisper-1',
    checkedAt: '2026-09-19',
    tier: 'standard',
    inputMicroUsdPer1M: 0n,
    cachedInputMicroUsdPer1M: 0n,
    outputMicroUsdPer1M: 0n,
    // 0.006 USD / minute = 6,000 micro-USD / minute
    microUsdPerMinute: 6_000n,
  },
};

/**
 * Strict canonical model allowlist mapping snapshot identifiers to canonical pricing models
 */
export const MODEL_ALIAS_ALLOWLIST: Record<string, string> = {
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-2024-08-06': 'gpt-4o',
  'gpt-4o-2024-05-13': 'gpt-4o',
  'gpt-realtime': 'gpt-realtime',
  'gpt-realtime-2024-10-01': 'gpt-realtime',
  'whisper-1': 'whisper-1',
};

export class ModelPricingUnavailableError extends Error {
  public code = 'AI_PRICING_UNAVAILABLE';
  constructor(model: string) {
    super(`Không tìm thấy biểu phí hợp lệ cho mô hình AI: "${model}". Hệ thống từ chối thực thi (fail-closed).`);
    this.name = 'ModelPricingUnavailableError';
  }
}

/**
 * Resolves a model name / snapshot to canonical catalog modelId
 */
export function resolveCanonicalModel(model: string): string {
  if (!model) return '';
  const normalized = model.toLowerCase().trim();
  return MODEL_ALIAS_ALLOWLIST[normalized] || '';
}

/**
 * Returns whether a model is supported in the pricing catalog.
 */
export function isModelSupported(model: string): boolean {
  const canonical = resolveCanonicalModel(model);
  return Boolean(canonical && MODEL_PRICING_CATALOG[canonical]);
}

export function getModelPricing(model: string): ModelPricingTier {
  const canonical = resolveCanonicalModel(model);
  const pricing = canonical ? MODEL_PRICING_CATALOG[canonical] : undefined;
  if (!pricing) {
    throw new ModelPricingUnavailableError(model);
  }
  return pricing;
}

/**
 * Performs integer ceiling division: ceilDiv(a, b) = (a + b - 1) / b for positive BigInt
 */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error('Division by zero');
  if (a <= 0n) return 0n;
  return (a + b - 1n) / b;
}

/**
 * Converts VND to milli-VND (1 VND = 1,000 milli-VND)
 */
export function vndToMilliVnd(vnd: number | bigint | string): bigint {
  if (typeof vnd === 'bigint') return vnd * 1000n;
  const num = Number(vnd);
  if (Number.isNaN(num) || !Number.isFinite(num)) return 0n;
  return BigInt(Math.round(num * 1000));
}

/**
 * Converts milli-VND to VND
 */
export function milliVndToVnd(milliVnd: bigint | string | number): number {
  if (typeof milliVnd === 'bigint') {
    return Number(milliVnd) / 1000;
  }
  const b = BigInt(String(milliVnd || 0));
  return Number(b) / 1000;
}

/**
 * Formats a VND or milli-VND number to exact Vietnamese locale currency string (e.g. "25.000đ", "12,15đ", "0,05đ")
 */
export function formatVnd(amountVnd: number | bigint | string): string {
  const num = typeof amountVnd === 'bigint' ? Number(amountVnd) : Number(amountVnd || 0);
  if (num === 0) return '0đ';
  if (Number.isInteger(num)) {
    return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
  }
  // Fractional formatting: display up to 4 decimal places without trailing zeros
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(num);
  return formatted + 'đ';
}

export function formatMilliVnd(amountMilliVnd: bigint | string | number): string {
  const b = typeof amountMilliVnd === 'bigint' ? amountMilliVnd : BigInt(String(amountMilliVnd || 0));
  const vndValue = Number(b) / 1000;
  return formatVnd(vndValue);
}

export interface TokenUsageInput {
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  audioInputTokens?: number;
  cachedAudioInputTokens?: number;
  audioOutputTokens?: number;
  imageInputTokens?: number;
  cachedImageInputTokens?: number;
  durationMs?: number;
  durationMinutes?: number;
}

/**
 * Calculates exact token cost in milli-VND using pure BigInt rational math:
 *
 * Formula:
 * numerator = uncachedTokens * priceMicroUsdPer1M + cachedTokens * cachedPriceMicroUsdPer1M + ...
 * costMilliVnd = ceilDiv(numerator * exchangeRate, 1,000,000,000)
 *
 * Where 1 USD = exchangeRate VND = exchangeRate * 1,000 milli-VND.
 * Rate defaults to 27,000 VND / USD.
 */
export function calculateTokenCostMilliVnd(
  model: string,
  usage: TokenUsageInput,
  customExchangeRate?: number
): {
  costMilliVnd: bigint;
  costVnd: number;
  pricingVersion: string;
  resolvedModel: string;
} {
  const canonicalModel = resolveCanonicalModel(model);
  const pricing = getModelPricing(canonicalModel);
  const rateNum = customExchangeRate || env.AI_USD_TO_VND_RATE || DEFAULT_EXCHANGE_RATE_VND;
  const rateBigInt = BigInt(Math.max(1, Math.round(rateNum)));

  let numerator = 0n;

  // 1. Text Prompt Tokens & Cached Tokens
  const totalPrompt = BigInt(Math.max(0, usage.promptTokens || 0));
  const rawCached = BigInt(Math.max(0, usage.cachedTokens || 0));

  if (rawCached > totalPrompt) {
    console.warn(`[Pricing Anomaly] cachedTokens (${rawCached}) > promptTokens (${totalPrompt}) for model ${model}. Capping to promptTokens.`);
  }
  const cachedPrompt = rawCached > totalPrompt ? totalPrompt : rawCached;
  const uncachedPrompt = totalPrompt - cachedPrompt;

  numerator += uncachedPrompt * pricing.inputMicroUsdPer1M;
  numerator += cachedPrompt * pricing.cachedInputMicroUsdPer1M;

  // 2. Text Completion Tokens
  const completion = BigInt(Math.max(0, usage.completionTokens || 0));
  numerator += completion * pricing.outputMicroUsdPer1M;

  // 3. Audio Tokens (Realtime)
  if (pricing.audioInputMicroUsdPer1M) {
    const totalAudioIn = BigInt(Math.max(0, usage.audioInputTokens || 0));
    const cachedAudioIn = BigInt(Math.max(0, usage.cachedAudioInputTokens || 0));
    const uncachedAudioIn = totalAudioIn > cachedAudioIn ? totalAudioIn - cachedAudioIn : 0n;

    numerator += uncachedAudioIn * pricing.audioInputMicroUsdPer1M;
    numerator += (cachedAudioIn > totalAudioIn ? totalAudioIn : cachedAudioIn) * (pricing.cachedAudioInputMicroUsdPer1M || pricing.audioInputMicroUsdPer1M);
  }
  if (pricing.audioOutputMicroUsdPer1M) {
    const audioOut = BigInt(Math.max(0, usage.audioOutputTokens || 0));
    numerator += audioOut * pricing.audioOutputMicroUsdPer1M;
  }

  // 4. Image Tokens (Realtime Vision)
  if (pricing.imageInputMicroUsdPer1M) {
    const totalImageIn = BigInt(Math.max(0, usage.imageInputTokens || 0));
    const cachedImageIn = BigInt(Math.max(0, usage.cachedImageInputTokens || 0));
    const uncachedImageIn = totalImageIn > cachedImageIn ? totalImageIn - cachedImageIn : 0n;

    numerator += uncachedImageIn * pricing.imageInputMicroUsdPer1M;
    numerator += (cachedImageIn > totalImageIn ? totalImageIn : cachedImageIn) * (pricing.cachedImageInputMicroUsdPer1M || pricing.imageInputMicroUsdPer1M);
  }

  // 5. Per-minute Duration (Whisper Transcription)
  let tokenCostMilliVnd = 0n;
  if (pricing.microUsdPerMinute) {
    let durationMs = usage.durationMs;
    if (durationMs === undefined && usage.durationMinutes !== undefined) {
      durationMs = Math.round(usage.durationMinutes * 60000);
    }
    const msBigInt = BigInt(Math.max(0, durationMs || 0));
    // Cost per ms = (microUsdPerMinute * rate * 1000) / (60000 * 1,000,000) = (microUsdPerMinute * rate) / (60000 * 1000)
    const whisperNumerator = msBigInt * pricing.microUsdPerMinute * rateBigInt;
    const whisperCostMilliVnd = ceilDiv(whisperNumerator, 60_000_000n);
    tokenCostMilliVnd += whisperCostMilliVnd;
  }

  if (numerator > 0n) {
    // Formula: ceilDiv(numerator * rate, 1,000,000,000)
    // Converts micro-USD per 1M tokens to milli-VND at rate VND/USD
    const tokenNumerator = numerator * rateBigInt;
    tokenCostMilliVnd += ceilDiv(tokenNumerator, 1_000_000_000n);
  }

  const costVnd = milliVndToVnd(tokenCostMilliVnd);

  return {
    costMilliVnd: tokenCostMilliVnd,
    costVnd,
    pricingVersion: PRICING_VERSION,
    resolvedModel: canonicalModel,
  };
}

/**
 * Estimates maximum upper bound cost for credit reservation before calling OpenAI
 */
export function estimateMaxCostMilliVnd(
  model: string,
  options?: {
    estimatedInputTokens?: number;
    maxOutputTokens?: number;
    durationMinutes?: number;
  },
  customExchangeRate?: number
): bigint {
  const inputTokens = options?.estimatedInputTokens || 3000;
  const outputTokens = options?.maxOutputTokens || 2000;

  const { costMilliVnd } = calculateTokenCostMilliVnd(
    model,
    {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      durationMinutes: options?.durationMinutes,
    },
    customExchangeRate
  );

  // Minimum safety reserve of 100 VND (100,000 milli-VND)
  const minReserve = 100_000n;
  return costMilliVnd > minReserve ? costMilliVnd : minReserve;
}
