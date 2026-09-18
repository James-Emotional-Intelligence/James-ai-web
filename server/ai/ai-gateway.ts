import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env';
import { PromptId, getPromptDefinition, wrapUntrustedData } from './prompt-registry';

export interface AiGatewayOptions {
  timeoutMs?: number;
  maxRetries?: number;
  temperature?: number;
  model?: string;
}

export interface AiTelemetryMetric {
  promptId: PromptId | string;
  model: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  error?: string;
  timestamp: string;
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
      this.client = new OpenAI({ apiKey: apiKey.trim() });
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

  /**
   * Executes a structured JSON completion with retries, timeout, and strict Zod validation
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

    const promptDef = getPromptDefinition(promptId);
    const model = options?.model || this.getDefaultTextModel();
    const timeoutMs = options?.timeoutMs || 25000;
    const maxRetries = options?.maxRetries ?? 2;
    const temperature = options?.temperature ?? promptDef.temperature ?? 0.2;

    const wrappedContent = wrapUntrustedData(userInput);
    const startTime = Date.now();

    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptStartTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        let completion: OpenAI.Chat.Completions.ChatCompletion;
        try {
          completion = await client.chat.completions.create(
            {
              model,
              messages: [
                { role: 'system', content: promptDef.systemPrompt },
                { role: 'user', content: wrappedContent },
              ],
              response_format: { type: 'json_object' },
              max_tokens: promptDef.maxTokens,
              temperature,
            },
            { signal: controller.signal }
          );
        } finally {
          clearTimeout(timeoutHandle);
        }

        const rawContent = completion.choices[0]?.message?.content?.trim() || null;
        if (!rawContent) {
          throw new Error('Mô hình AI trả về phản hồi rỗng.');
        }

        let parsedJson: any;
        try {
          parsedJson = JSON.parse(rawContent);
        } catch (jsonErr: any) {
          throw new Error(`Định dạng JSON phản hồi từ AI không hợp lệ: ${jsonErr.message}`, { cause: jsonErr });
        }

        const parsedResult = schema.safeParse(parsedJson);
        if (!parsedResult.success) {
          throw new Error(`Cấu trúc dữ liệu AI không khớp schema: ${parsedResult.error.message}`);
        }

        const durationMs = Date.now() - startTime;
        this.recordMetric({
          promptId,
          model,
          durationMs,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
          success: true,
          timestamp: new Date().toISOString(),
        });

        return { data: parsedResult.data, raw: rawContent };
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

    const durationMs = Date.now() - startTime;
    this.recordMetric({
      promptId,
      model,
      durationMs,
      success: false,
      error: lastError?.message || 'Unknown AI error',
      timestamp: new Date().toISOString(),
    });

    return { data: null, raw: null, error: lastError?.message || 'AI_EXECUTION_FAILED' };
  }

  /**
   * Executes a Vision OCR extraction with timeout and image bounds
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

    const promptDef = getPromptDefinition('ocr_vision');
    const model = options?.model || this.getDefaultTextModel();
    const timeoutMs = options?.timeoutMs || 45000;
    const base64 = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    const wrappedTitle = wrapUntrustedData(title || 'Bài tập / Tài liệu');
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await client.chat.completions.create(
          {
            model,
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

      const extractedText = completion.choices[0]?.message?.content?.trim() || null;
      const durationMs = Date.now() - startTime;

      this.recordMetric({
        promptId: 'ocr_vision',
        model,
        durationMs,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
        success: Boolean(extractedText),
        timestamp: new Date().toISOString(),
      });

      return { text: extractedText };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.recordMetric({
        promptId: 'ocr_vision',
        model,
        durationMs,
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      return { text: null, error: err.message };
    }
  }
}

export const aiGateway = AiGateway.getInstance();
