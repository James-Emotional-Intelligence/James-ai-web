import OpenAI from 'openai';
import { z } from 'zod';
import { env, isProduction } from '../config/env';
import { PromptId, getPromptDefinition, wrapUntrustedData } from './prompt-registry';
import { aiBillingService } from '../services/ai-billing-service';
import {
  isModelSupported,
  resolveCanonicalModel,
  ModelPricingUnavailableError,
} from './model-pricing';
import { sanitizeStrictJsonSchema } from './strict-json-schema';

/** Convert AI nullable wire values to domain-parser input before Zod validation. */
export function normalizeAiNullable<T>(value: T): T {
  if (value === null) return undefined as T;
  if (Array.isArray(value)) return value.map((item) => normalizeAiNullable(item)) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeAiNullable(item)])) as T;
  }
  return value;
}

export interface BillingContext {
  userId: string;
  operation?: string;
  idempotencyKey?: string;
  requestId?: string;
  source?: string;
}

export interface AiGatewayOptions extends Partial<BillingContext> {
  timeoutMs?: number;
  maxRetries?: number;
  temperature?: number;
  model?: string;
}

export interface AiTelemetryMetric {
  promptId: PromptId | string;
  requestedModel: string;
  resolvedModel: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export class MissingBillingContextError extends Error {
  public status = 400;
  public code = 'MISSING_BILLING_CONTEXT';
  constructor(operation: string) {
    super(`Yêu cầu AI "${operation}" thiếu BillingContext/userId hợp lệ. Hệ thống từ chối thực thi (fail-closed).`);
    this.name = 'MissingBillingContextError';
  }
}

export class AiGateway {
  private static instance: AiGateway;
  private client: OpenAI | null = null;
  private metrics: AiTelemetryMetric[] = [];

  private constructor() {}

  public static getInstance(): AiGateway {
    if (!AiGateway.instance) {
      AiGateway.instance = new AiGateway();
    }
    return AiGateway.instance;
  }

  public getClient(): OpenAI | null {
    const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length < 10 || apiKey.includes('ADD_IN_AI_STUDIO')) {
      return null;
    }
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: apiKey.trim(),
      });
    }
    return this.client;
  }

  public isAvailable(): boolean {
    return Boolean(this.getClient());
  }

  public getDefaultTextModel(): string {
    return env.OPENAI_TEXT_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  public getDefaultRealtimeModel(): string {
    return env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
  }

  public getDefaultTranscribeModel(): string {
    return env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
  }

  public getDefaultVoice(): string {
    return env.OPENAI_VOICE || 'alloy';
  }

  private recordMetric(metric: AiTelemetryMetric) {
    this.metrics.push(metric);
    if (this.metrics.length > 500) {
      this.metrics.shift();
    }
    if (!metric.success) {
      console.warn(`[AiGateway] Call failed [${metric.promptId}] in ${metric.durationMs}ms: ${metric.error}`);
    }
  }

  public getRecentMetrics(): AiTelemetryMetric[] {
    return [...this.metrics];
  }

  private getStrictJsonSchemaFormat<T>(promptId: PromptId | string, schema: z.ZodType<T>) {
    const generated = (schema as any).toJSONSchema ? (schema as any).toJSONSchema() : z.toJSONSchema(schema);
    const jsonSchema = sanitizeStrictJsonSchema(generated);
    return {
      type: 'json_schema' as const,
      json_schema: {
        name: String(promptId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
        strict: true,
        schema: jsonSchema,
      },
    } as any;
  }

  /**
   * Executes a structured JSON completion with retries, timeout, strict Zod validation,
   * cumulative attempt usage metering, and fail-closed billing reservation.
   */
  public async executeStructured<T>(
    promptId: PromptId,
    userInput: string | Record<string, any>,
    schema: z.ZodType<T>,
    options?: AiGatewayOptions
  ): Promise<{ data: T | null; raw: string | null; error?: string }> {
    const client = this.getClient();
    if (!client) {
      return { data: null, raw: null, error: 'AI_NOT_CONFIGURED' };
    }

    // Fail closed if userId is missing in production
    const userId = options?.userId;
    if (!userId && isProduction) {
      throw new MissingBillingContextError(promptId);
    }

    const requestedModel = options?.model || this.getDefaultTextModel();
    if (!isModelSupported(requestedModel)) {
      throw new ModelPricingUnavailableError(requestedModel);
    }

    const promptDef = getPromptDefinition(promptId);
    const timeoutMs = options?.timeoutMs || 25000;
    const maxRetries = options?.maxRetries ?? 2;
    const temperature = options?.temperature ?? promptDef.temperature ?? 0.2;

    const wrappedContent = wrapUntrustedData(userInput);
    const startTime = Date.now();

    // 1. Reserve credit before calling OpenAI (Throws 402 if balance is depleted)
    let billingReservation: {
      isUnlimited: boolean;
      reservedMilliVnd: bigint;
      reservationTxId?: string;
      idempotencyKey: string;
    } | null = null;

    if (userId) {
      billingReservation = await aiBillingService.reserveForAiExecution({
        userId,
        model: requestedModel,
        estimatedInputTokens: promptDef.maxTokens,
        maxOutputTokens: promptDef.maxTokens,
        promptId,
        requestId: options?.requestId,
        idempotencyKey: options?.idempotencyKey,
      });
    }

    // Cumulative usage tracking across all retry attempts
    let cumulativePromptTokens = 0;
    let cumulativeCompletionTokens = 0;
    let cumulativeCachedTokens = 0;
    let resolvedModel = requestedModel;
    let lastError: any = null;
    let validatedData: T | null = null;
    let rawContent: string | null = null;
    let businessValidationSucceeded = false;

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

          let completion: OpenAI.Chat.Completions.ChatCompletion;
          try {
            completion = await client.chat.completions.create(
              {
                model: requestedModel,
                messages: [
                  { role: 'system', content: promptDef.systemPrompt },
                  { role: 'user', content: wrappedContent },
                ],
                response_format: this.getStrictJsonSchemaFormat(promptId, schema),
                max_tokens: promptDef.maxTokens,
                temperature,
              },
              { signal: controller.signal }
            );
          } finally {
            clearTimeout(timeoutHandle);
          }

          // Accumulate provider tokens used regardless of whether business parsing succeeds
          if (completion.usage) {
            cumulativePromptTokens += completion.usage.prompt_tokens || 0;
            cumulativeCompletionTokens += completion.usage.completion_tokens || 0;
            const details = (completion.usage as any).prompt_tokens_details;
            cumulativeCachedTokens += details?.cached_tokens || 0;
          }
          if (completion.model) {
            resolvedModel = resolveCanonicalModel(completion.model) || completion.model;
          }

          rawContent = completion.choices[0]?.message?.content?.trim() || null;
          if (!rawContent) {
            throw new Error('Mô hình AI trả về phản hồi rỗng.');
          }

          let parsedJson: any;
          try {
            parsedJson = JSON.parse(rawContent);
          } catch (jsonErr: any) {
            throw new Error(`Định dạng JSON phản hồi từ AI không hợp lệ: ${jsonErr.message}`, { cause: jsonErr });
          }

          const parsedResult = schema.safeParse(normalizeAiNullable(parsedJson));
          if (!parsedResult.success) {
            throw new Error(`Cấu trúc dữ liệu AI không khớp schema: ${parsedResult.error.message}`);
          }

          validatedData = parsedResult.data;
          businessValidationSucceeded = true;
          break; // Success!
        } catch (err: any) {
          lastError = err;
          const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
          const isRateLimit = err.status === 429;
          const isServerError = err.status >= 500;

          if (attempt < maxRetries && (isRateLimit || isServerError || isAbort)) {
            const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
            console.warn(`[AiGateway] Retrying [${promptId}] after ${backoff}ms (attempt ${attempt + 1}/${maxRetries}): ${err.message}`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }
          break;
        }
      }
    } finally {
      const durationMs = Date.now() - startTime;
      const totalTokens = cumulativePromptTokens + cumulativeCompletionTokens;

      this.recordMetric({
        promptId,
        requestedModel,
        resolvedModel,
        durationMs,
        promptTokens: cumulativePromptTokens,
        completionTokens: cumulativeCompletionTokens,
        cachedTokens: cumulativeCachedTokens,
        totalTokens,
        success: businessValidationSucceeded,
        error: businessValidationSucceeded ? undefined : (lastError?.message || 'AI_EXECUTION_FAILED'),
        timestamp: new Date().toISOString(),
      });

      // 2. Exact reconciliation in finally block:
      // If tokens were consumed by provider (even on business failure), charge accurately and release unused reservation
      if (billingReservation && userId) {
        try {
          await aiBillingService.reconcileAiExecution({
            userId,
            model: resolvedModel,
            reservedMilliVnd: billingReservation.reservedMilliVnd,
            isUnlimited: billingReservation.isUnlimited,
            usage: totalTokens > 0 ? {
              promptTokens: cumulativePromptTokens,
              completionTokens: cumulativeCompletionTokens,
              cachedTokens: cumulativeCachedTokens,
            } : undefined,
            promptId,
            requestId: options?.requestId,
            idempotencyKey: billingReservation.idempotencyKey,
            success: businessValidationSucceeded,
            errorCode: businessValidationSucceeded ? undefined : (lastError?.code || lastError?.message || 'AI_EXECUTION_FAILED'),
            latencyMs: durationMs,
          });
        } catch (reconErr: any) {
          console.error(`[AiGateway] Billing reconciliation error for ${userId}:`, reconErr.message);
        }
      }
    }

    if (businessValidationSucceeded && validatedData !== null) {
      return { data: validatedData, raw: rawContent };
    }

    return { data: null, raw: rawContent, error: lastError?.message || 'AI_EXECUTION_FAILED' };
  }

  /**
   * Executes a Vision OCR extraction with timeout, image bounds and billing reservation
   */
  public async executeVision(
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg',
    title?: string,
    options?: AiGatewayOptions
  ): Promise<{ text: string | null; error?: string }> {
    const client = this.getClient();
    if (!client) {
      return { text: null, error: 'AI_NOT_CONFIGURED' };
    }

    const userId = options?.userId;
    if (!userId && isProduction) {
      throw new MissingBillingContextError('ocr_vision');
    }

    const requestedModel = options?.model || this.getDefaultTextModel();
    if (!isModelSupported(requestedModel)) {
      throw new ModelPricingUnavailableError(requestedModel);
    }

    const promptDef = getPromptDefinition('ocr_vision');
    const timeoutMs = options?.timeoutMs || 45000;
    const base64 = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    const wrappedTitle = wrapUntrustedData(title || 'Bài tập / Tài liệu');
    const startTime = Date.now();

    // 1. Reserve credit before calling OpenAI
    let billingReservation: {
      isUnlimited: boolean;
      reservedMilliVnd: bigint;
      reservationTxId?: string;
      idempotencyKey: string;
    } | null = null;

    if (userId) {
      billingReservation = await aiBillingService.reserveForAiExecution({
        userId,
        model: requestedModel,
        estimatedInputTokens: promptDef.maxTokens,
        maxOutputTokens: promptDef.maxTokens,
        promptId: 'ocr_vision',
        requestId: options?.requestId,
        idempotencyKey: options?.idempotencyKey,
      });
    }

    let extractedText: string | null = null;
    let providerPromptTokens = 0;
    let providerCompletionTokens = 0;
    let providerCachedTokens = 0;
    let resolvedModel = requestedModel;
    let lastError: any = null;

    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await client.chat.completions.create(
          {
            model: requestedModel,
            messages: [
              { role: 'system', content: promptDef.systemPrompt },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Hãy trích xuất và số hóa toàn bộ nội dung của bức ảnh học tập này (Tiêu đề: ${wrappedTitle}).`,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: dataUri,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
            max_tokens: promptDef.maxTokens,
            temperature: promptDef.temperature ?? 0.1,
          },
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(timeoutHandle);
      }

      if (completion.usage) {
        providerPromptTokens = completion.usage.prompt_tokens || 0;
        providerCompletionTokens = completion.usage.completion_tokens || 0;
        const details = (completion.usage as any).prompt_tokens_details;
        providerCachedTokens = details?.cached_tokens || 0;
      }
      if (completion.model) {
        resolvedModel = resolveCanonicalModel(completion.model) || completion.model;
      }

      extractedText = completion.choices[0]?.message?.content?.trim() || null;
      return { text: extractedText };
    } catch (err: any) {
      lastError = err;
      return { text: null, error: err.message };
    } finally {
      const durationMs = Date.now() - startTime;
      const totalTokens = providerPromptTokens + providerCompletionTokens;
      const success = Boolean(extractedText);

      this.recordMetric({
        promptId: 'ocr_vision',
        requestedModel,
        resolvedModel,
        durationMs,
        promptTokens: providerPromptTokens,
        completionTokens: providerCompletionTokens,
        cachedTokens: providerCachedTokens,
        totalTokens,
        success,
        error: success ? undefined : (lastError?.message || 'AI_OCR_FAILED'),
        timestamp: new Date().toISOString(),
      });

      if (billingReservation && userId) {
        try {
          await aiBillingService.reconcileAiExecution({
            userId,
            model: resolvedModel,
            reservedMilliVnd: billingReservation.reservedMilliVnd,
            isUnlimited: billingReservation.isUnlimited,
            usage: totalTokens > 0 ? {
              promptTokens: providerPromptTokens,
              completionTokens: providerCompletionTokens,
              cachedTokens: providerCachedTokens,
            } : undefined,
            promptId: 'ocr_vision',
            requestId: options?.requestId,
            idempotencyKey: billingReservation.idempotencyKey,
            success,
            errorCode: success ? undefined : (lastError?.code || lastError?.message || 'AI_OCR_FAILED'),
            latencyMs: durationMs,
          });
        } catch (reconErr: any) {
          console.error(`[AiGateway] Vision billing reconciliation error for ${userId}:`, reconErr.message);
        }
      }
    }
  }

  /**
   * Executes a Vision structured extraction directly returning typed schema object without intermediate text loss
   */
  public async executeVisionStructured<T>(
    promptId: PromptId | string,
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg',
    titleOrPrompt: string,
    schema: z.ZodType<T>,
    options?: AiGatewayOptions
  ): Promise<{ data: T | null; raw: string | null; error?: string }> {
    const client = this.getClient();
    if (!client) {
      return { data: null, raw: null, error: 'AI_NOT_CONFIGURED' };
    }

    const userId = options?.userId;
    if (!userId && isProduction) {
      throw new MissingBillingContextError(promptId);
    }

    const requestedModel = options?.model || this.getDefaultTextModel();
    if (!isModelSupported(requestedModel)) {
      throw new ModelPricingUnavailableError(requestedModel);
    }

    const timeoutMs = options?.timeoutMs || 45000;
    const base64 = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;
    const startTime = Date.now();
    const maxTokens = 3000;

    // 1. Reserve credit before calling OpenAI
    let billingReservation: {
      isUnlimited: boolean;
      reservedMilliVnd: bigint;
      reservationTxId?: string;
      idempotencyKey: string;
    } | null = null;

    if (userId) {
      billingReservation = await aiBillingService.reserveForAiExecution({
        userId,
        model: requestedModel,
        estimatedInputTokens: maxTokens,
        maxOutputTokens: maxTokens,
        promptId: promptId as any,
        requestId: options?.requestId,
        idempotencyKey: options?.idempotencyKey,
      });
    }

    let rawContent: string | null = null;
    const validatedData: T | null = null;
    let providerPromptTokens = 0;
    let providerCompletionTokens = 0;
    let providerCachedTokens = 0;
    let resolvedModel = requestedModel;
    let lastError: any = null;
    let success = false;

    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await client.chat.completions.create(
          {
            model: requestedModel,
            messages: [
              {
                role: 'system',
                content: `Bạn là trợ lý thị giác học tập AI. Hãy phân tích hình ảnh và trích xuất dữ liệu trả về JSON thuần túy khớp chính xác với định dạng được yêu cầu. Không thêm giải thích markdown ngoài JSON.`,
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `${titleOrPrompt}\n\nChỉ trả về JSON hợp lệ.`,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: dataUri,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
            response_format: this.getStrictJsonSchemaFormat(promptId, schema),
            max_tokens: maxTokens,
            temperature: options?.temperature ?? 0.1,
          },
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(timeoutHandle);
      }

      if (completion.usage) {
        providerPromptTokens = completion.usage.prompt_tokens || 0;
        providerCompletionTokens = completion.usage.completion_tokens || 0;
        const details = (completion.usage as any).prompt_tokens_details;
        providerCachedTokens = details?.cached_tokens || 0;
      }
      if (completion.model) {
        resolvedModel = resolveCanonicalModel(completion.model) || completion.model;
      }

      rawContent = completion.choices[0]?.message?.content?.trim() || null;
      if (!rawContent) {
        throw new Error('AI trả về phản hồi rỗng.');
      }

      let parsedJson: any;
      try {
        const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        parsedJson = JSON.parse(cleaned);
      } catch (parseErr: any) {
        throw new Error(`Phản hồi AI không đúng định dạng JSON: ${parseErr.message}`, { cause: parseErr });
      }

      const validation = schema.safeParse(normalizeAiNullable(parsedJson));
      if (!validation.success) {
        const issueMsg = validation.error.issues.map((i) => i.message).join('; ');
        throw new Error(`Dữ liệu thị giác không khớp schema: ${issueMsg}`);
      }

      const validatedData = validation.data;
      success = true;
      return { data: validatedData, raw: rawContent };
    } catch (err: any) {
      lastError = err;
      return { data: null, raw: rawContent, error: err.message };
    } finally {
      const durationMs = Date.now() - startTime;
      const totalTokens = providerPromptTokens + providerCompletionTokens;

      this.recordMetric({
        promptId: promptId as any,
        requestedModel,
        resolvedModel,
        durationMs,
        promptTokens: providerPromptTokens,
        completionTokens: providerCompletionTokens,
        cachedTokens: providerCachedTokens,
        totalTokens,
        success,
        error: success ? undefined : (lastError?.message || 'AI_VISION_STRUCTURED_FAILED'),
        timestamp: new Date().toISOString(),
      });

      if (billingReservation && userId) {
        try {
          await aiBillingService.reconcileAiExecution({
            userId,
            model: resolvedModel,
            reservedMilliVnd: billingReservation.reservedMilliVnd,
            isUnlimited: billingReservation.isUnlimited,
            usage: totalTokens > 0 ? {
              promptTokens: providerPromptTokens,
              completionTokens: providerCompletionTokens,
              cachedTokens: providerCachedTokens,
            } : undefined,
            promptId: promptId as any,
            requestId: options?.requestId,
            idempotencyKey: billingReservation.idempotencyKey,
            success,
            errorCode: success ? undefined : (lastError?.code || lastError?.message || 'AI_VISION_STRUCTURED_FAILED'),
            latencyMs: durationMs,
          });
        } catch (reconErr: any) {
          console.error(`[AiGateway] Vision billing reconciliation error for ${userId}:`, reconErr.message);
        }
      }
    }
  }
}

export const aiGateway = AiGateway.getInstance();
