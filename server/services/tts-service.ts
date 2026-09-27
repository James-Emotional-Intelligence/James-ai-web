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

    const model = (env as any).OPENAI_TTS_MODEL || 'tts-1';
    const format = ((env as any).OPENAI_TTS_FORMAT || 'mp3') as 'mp3' | 'opus' | 'aac' | 'flac';
    const baseVoice = (env as any).OPENAI_TTS_VOICE || env.OPENAI_VOICE || 'shimmer';
    const voice = (baseVoice) as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

    try {
      const response = await client.audio.speech.create({
        model: model,
        voice: voice,
        input: text,
        response_format: format,
      });

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      if (error?.status === 401) {
        throw new Error('AI_UNAUTHORIZED');
      }
      if (error?.status === 429) {
        throw new Error('AI_RATE_LIMIT_EXCEEDED');
      }
      throw error;
    }
  }
}

export const ttsService = TtsService.getInstance();
