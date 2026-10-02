import { AiGateway } from '../ai/ai-gateway';
import { env } from '../config/env';

export class TtsService {
  private static instance: TtsService;
  private aiGateway: AiGateway;

  private constructor() {
    this.aiGateway = AiGateway.getInstance();
  }

  public static getInstance(): TtsService {
    if (!TtsService.instance) {
      TtsService.instance = new TtsService();
    }
    return TtsService.instance;
  }

  public async generateSpeech(text: string, language: string = 'vi-VN'): Promise<Buffer> {
    const client = this.aiGateway.getClient();
    if (!client) {
      throw new Error('AI_NOT_CONFIGURED');
    }

    const model = env.OPENAI_TTS_MODEL;
    const format = env.OPENAI_TTS_FORMAT;
    const baseVoice = env.OPENAI_TTS_VOICE || env.OPENAI_VOICE || 'shimmer';
    const voice = (baseVoice) as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.JAMI_TTS_CLOUD_TIMEOUT_MS);

    try {
      const response = await client.audio.speech.create({
        model: model,
        voice: voice,
        input: text,
        response_format: format,
      }, { signal: controller.signal });

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      if (error?.status === 401) {
        throw new Error('AI_UNAUTHORIZED', { cause: error });
      }
      if (error?.status === 429) {
        throw new Error('AI_RATE_LIMIT_EXCEEDED', { cause: error });
      }
      if (error?.name === 'AbortError') throw new Error('AI_TTS_TIMEOUT', { cause: error });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const ttsService = TtsService.getInstance();
