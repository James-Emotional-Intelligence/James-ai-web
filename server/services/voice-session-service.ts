import crypto from 'crypto';
import OpenAI from 'openai';
import { db } from '../db/mysql';
import { AiAdapter } from './ai-adapter';
import { jamiActionService, JamiActionService } from './jami-action-service';
import { jamiRepo } from '../repositories/jami-repository';

export interface VoiceRequestLogRecord {
  id: string;
  userId: string;
  purpose: string;
  transcript?: string;
  language: string;
  durationMs: number;
  processingStatus: string;
  mode: string;
  clientTurnId?: string;
  errorCode?: string;
  createdAt: string;
}

export class VoiceSessionService {
  private static instance: VoiceSessionService;
  private demoLogs: VoiceRequestLogRecord[] = [];

  private constructor() {}

  public static getInstance(): VoiceSessionService {
    if (!VoiceSessionService.instance) {
      VoiceSessionService.instance = new VoiceSessionService();
    }
    return VoiceSessionService.instance;
  }

  /**
   * Generates a stable, non-reversible safety identifier for OpenAI abuse monitoring
   */
  public generateSafetyIdentifier(userId: string): string {
    return crypto.createHash('sha256').update(`jami_safety_${userId}`).digest('hex');
  }

  /**
   * Exchanges WebRTC SDP offer with OpenAI Realtime API /v1/realtime/calls using FormData
   */
  public async exchangeRealtimeSdp(
    userId: string,
    sdpOffer: string
  ): Promise<{
    mode: 'openai_realtime' | 'demo_fallback';
    sdpAnswer?: string;
    model?: string;
    message?: string;
    errorCode?: string;
  }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!AiAdapter.isConfigured() || !apiKey) {
      return {
        mode: 'demo_fallback',
        errorCode: 'AI_NOT_CONFIGURED',
        message: 'OpenAI API chưa được cấu hình. Đang kích hoạt chế độ Giọng nói của trình duyệt.',
      };
    }

    try {
      const model = AiAdapter.getRealtimeModel();
      const safetyId = this.generateSafetyIdentifier(userId);
      const sessionConfig = {
        type: 'realtime',
        model,
        instructions:
          'Bạn là Jami - robot AI đồng hành học tập thân thiện dành cho học sinh Việt Nam theo chương trình GDPT 2018. ' +
          'Khi học sinh nói "Jami ơi", bạn đã mở kết nối. ' +
          'Hãy lắng nghe kỹ yêu cầu của học sinh, trả lời bằng tiếng Việt ngắn gọn, ấm áp, tích cực và gọi các công cụ quản lý thời khóa biểu, nhiệm vụ khi cần thiết. ' +
          'Mọi hành động thêm/xóa/sửa dữ liệu phải tạo bản xem trước và hỏi ý kiến học sinh trước khi thực hiện.',
        audio: {
          input: {
            transcription: {
              model: AiAdapter.getTranscribeModel(),
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
            },
          },
          output: {
            voice: AiAdapter.getVoice(),
          },
        },
        tools: JamiActionService.getToolDefinitions(),
      };

      const formData = new FormData();
      formData.append('sdp', sdpOffer);
      formData.append('session', JSON.stringify(sessionConfig));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch('https://api.openai.com/v1/realtime/calls', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'OpenAI-Safety-Identifier': safetyId,
          },
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('[VoiceSessionService] OpenAI Realtime WebRTC calls failed:', response.status, errorText);
        let errorCode = 'AI_UPSTREAM_ERROR';
        if (response.status === 401 || response.status === 403) errorCode = 'AI_AUTH_FAILED';
        else if (response.status === 429) errorCode = 'AI_RATE_LIMITED';

        return {
          mode: 'demo_fallback',
          errorCode,
          message: 'Không thể thiết lập WebRTC với OpenAI Realtime. Đang chuyển sang Giọng nói trình duyệt.',
        };
      }

      const sdpAnswer = await response.text();
      return {
        mode: 'openai_realtime',
        sdpAnswer,
        model,
        message: 'WebRTC kết nối thành công với OpenAI Realtime.',
      };
    } catch (err: any) {
      console.warn('[VoiceSessionService] OpenAI Realtime WebRTC exchange error:', err.message);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');
      return {
        mode: 'demo_fallback',
        errorCode: isTimeout ? 'AI_TIMEOUT' : 'AI_UPSTREAM_ERROR',
        message: 'Lỗi mạng khi kết nối OpenAI Realtime WebRTC. Sử dụng Giọng nói của trình duyệt.',
      };
    }
  }

  /**
   * Creates an ephemeral client secret from OpenAI Realtime API (/v1/realtime/client_secrets)
   */
  public async createRealtimeClientSecret(userId: string): Promise<{
    mode: 'openai_realtime' | 'demo_fallback';
    clientSecret?: string;
    expiresAt?: number;
    model?: string;
    voice?: string;
    message?: string;
    errorCode?: string;
  }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!AiAdapter.isConfigured() || !apiKey) {
      return {
        mode: 'demo_fallback',
        errorCode: 'AI_NOT_CONFIGURED',
        message: 'OpenAI API chưa được cấu hình. Đang kích hoạt Fallback Web Speech API trung thực.',
      };
    }

    const model = AiAdapter.getRealtimeModel();
    const voice = AiAdapter.getVoice();
    const safetyId = this.generateSafetyIdentifier(userId);
    const sessionConfig = {
      type: 'realtime',
      model,
      instructions:
        'Bạn là Jami - robot AI đồng hành học tập thân thiện dành cho học sinh Việt Nam theo chương trình GDPT 2018. ' +
        'Khi học sinh nói "Jami ơi", bạn đã mở kết nối. ' +
        'Hãy lắng nghe kỹ yêu cầu của học sinh, trả lời bằng tiếng Việt ngắn gọn, ấm áp, tích cực và gọi các công cụ quản lý thời khóa biểu, nhiệm vụ khi cần thiết. ' +
        'Mọi hành động thêm/xóa/sửa dữ liệu phải tạo bản xem trước và hỏi ý kiến học sinh trước khi thực hiện.',
      audio: {
        input: {
          transcription: {
            model: AiAdapter.getTranscribeModel(),
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
        },
        output: {
          voice,
        },
      },
      tools: JamiActionService.getToolDefinitions(),
    };

    const sessionPayload = {
      session: sessionConfig,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let response: Response;
      try {
        response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Safety-Identifier': safetyId,
          },
          body: JSON.stringify(sessionPayload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('[VoiceSessionService] OpenAI Realtime client secret creation failed:', response.status, errorText);
        let errorCode = 'AI_UPSTREAM_ERROR';
        if (response.status === 401 || response.status === 403) errorCode = 'AI_AUTH_FAILED';
        else if (response.status === 429) errorCode = 'AI_RATE_LIMITED';

        return {
          mode: 'demo_fallback',
          errorCode,
          message: 'Không thể khởi tạo phiên OpenAI Realtime. Đang chuyển sang Web Speech Fallback.',
        };
      }

      const data = await response.json();
      const clientSecretValue = data.value || data.client_secret?.value;
      const expiresAt = data.expires_at || data.client_secret?.expires_at;

      if (!clientSecretValue) {
        return {
          mode: 'demo_fallback',
          errorCode: 'AI_UPSTREAM_ERROR',
          message: 'Không nhận được ephemeral client secret từ OpenAI.',
        };
      }

      return {
        mode: 'openai_realtime',
        clientSecret: clientSecretValue,
        expiresAt,
        model,
        voice,
        message: 'Phiên OpenAI Realtime WebRTC đã sẵn sàng.',
      };
    } catch (err: any) {
      console.warn('[VoiceSessionService] OpenAI Realtime request error:', err.message);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');
      return {
        mode: 'demo_fallback',
        errorCode: isTimeout ? 'AI_TIMEOUT' : 'AI_UPSTREAM_ERROR',
        message: 'Lỗi kết nối OpenAI Realtime. Sử dụng Web Speech Fallback.',
      };
    }
  }

  /**
   * Log voice interaction metadata to MySQL voice_requests
   */
  public async logVoiceRequest(
    userId: string,
    params: {
      purpose: string;
      transcript?: string;
      durationMs?: number;
      processingStatus?: string;
      mode?: string;
      clientTurnId?: string;
      errorCode?: string;
    }
  ): Promise<VoiceRequestLogRecord> {
    const id = 'vreq_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const createdAt = new Date().toISOString();

    const record: VoiceRequestLogRecord = {
      id,
      userId,
      purpose: params.purpose || 'voice_command',
      transcript: params.transcript,
      language: 'vi',
      durationMs: params.durationMs || 0,
      processingStatus: params.processingStatus || 'completed',
      mode: params.mode || 'openai_realtime',
      clientTurnId: params.clientTurnId,
      errorCode: params.errorCode,
      createdAt,
    };

    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO voice_requests
           (id, user_id, purpose, transcript, language, duration_ms, processing_status, mode, client_turn_id, error_code, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            id,
            userId,
            record.purpose,
            record.transcript || null,
            record.language,
            record.durationMs,
            record.processingStatus,
            record.mode,
            record.clientTurnId || null,
            record.errorCode || null,
          ]
        );
      } catch (err: any) {
        console.warn('[VoiceSessionService] Error logging voice request to DB:', err.message);
      }
    }

    this.demoLogs.unshift(record);
    if (this.demoLogs.length > 50) this.demoLogs.pop();

    return record;
  }

  /**
   * Process voice transcript command into AI response and execute corresponding tools
   */
  public async processVoiceCommand(
    userId: string,
    transcript: string,
    options?: { clientTurnId?: string; mode?: string; conversationId?: string }
  ) {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) {
      return {
        replyText: 'Jami chưa nghe rõ, bạn có thể nói lại được không?',
        emotion: 'idle',
      };
    }

    // Save user message to MySQL
    await jamiRepo.saveMessage(userId, {
      sender: 'user',
      text: cleanTranscript,
    });

    const lower = cleanTranscript.toLowerCase();

    // Check if the user is confirming or rejecting a pending proposal
    const isConfirmPhrase =
      lower.includes('đồng ý') ||
      lower.includes('xác nhận') ||
      lower.includes('làm đi') ||
      lower.includes('được rồi') ||
      lower === 'ok' ||
      lower === 'có' ||
      lower === 'oke';

    const isRejectPhrase =
      lower.includes('không') ||
      lower.includes('hủy') ||
      lower.includes('thôi') ||
      lower.includes('bỏ qua') ||
      lower.includes('đừng');

    if (isConfirmPhrase || isRejectPhrase) {
      const decision = isConfirmPhrase ? 'confirm' : 'reject';
      const actionRes = await jamiActionService.handleProposalDecision(userId, decision);
      if (actionRes.success) {
        const replyMsg = await jamiRepo.saveMessage(userId, {
          sender: 'jami',
          text: actionRes.message,
          emotion: decision === 'confirm' ? 'celebrating' : 'speaking',
        });

        await this.logVoiceRequest(userId, {
          purpose: 'confirmation_command',
          transcript: cleanTranscript,
          mode: options?.mode || 'web_speech',
          clientTurnId: options?.clientTurnId,
        });

        return {
          replyText: actionRes.message,
          emotion: decision === 'confirm' ? 'celebrating' : 'speaking',
          clientAction: actionRes.clientAction,
          replyMessage: replyMsg,
        };
      }
    }

    // Check direct command intents
    if (lower.includes('mở lịch') || lower.includes('thời khóa biểu') || lower.includes('xem lịch')) {
      const actionRes = await jamiActionService.executeTool(userId, 'navigate_to', { route: '/timetable' });
      const replyText = 'Jami đang mở thời khóa biểu của bạn đây.';
      const replyMsg = await jamiRepo.saveMessage(userId, {
        sender: 'jami',
        text: replyText,
        emotion: 'guiding',
      });

      await this.logVoiceRequest(userId, {
        purpose: 'navigation_command',
        transcript: cleanTranscript,
        mode: options?.mode || 'web_speech',
        clientTurnId: options?.clientTurnId,
      });

      return {
        replyText,
        emotion: 'guiding',
        clientAction: actionRes.clientAction,
        replyMessage: replyMsg,
      };
    }

    if (lower.includes('tập trung') || lower.includes('hẹn giờ') || lower.includes('pomodoro')) {
      const match = lower.match(/(\d+)\s*phút/);
      const minutes = match ? parseInt(match[1], 10) : 25;
      const actionRes = await jamiActionService.executeTool(userId, 'start_focus_timer', { plannedMinutes: minutes });

      const replyText = `Đã bắt đầu phiên tập trung ${minutes} phút cho bạn. Hãy sẵn sàng nhé!`;
      const replyMsg = await jamiRepo.saveMessage(userId, {
        sender: 'jami',
        text: replyText,
        emotion: 'focus',
      });

      await this.logVoiceRequest(userId, {
        purpose: 'focus_timer_command',
        transcript: cleanTranscript,
        mode: options?.mode || 'web_speech',
        clientTurnId: options?.clientTurnId,
      });

      return {
        replyText,
        emotion: 'focus',
        clientAction: actionRes.clientAction,
        replyMessage: replyMsg,
      };
    }

    // Use OpenAI Chat Completion with Tool Calling if configured
    if (AiAdapter.isConfigured()) {
      try {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await client.chat.completions.create({
          model: AiAdapter.getTextModel(),
          messages: [
            {
              role: 'system',
              content:
                'Bạn là Jami - robot AI đồng hành học tập chuẩn GDPT 2018 dành cho học sinh Việt Nam. ' +
                'Hãy trả lời bằng tiếng Việt ngắn gọn, ấm áp, khích lệ. Sử dụng function call khi người dùng yêu cầu hành động.',
            },
            { role: 'user', content: cleanTranscript },
          ],
          tools: JamiActionService.getToolDefinitions() as any,
          tool_choice: 'auto',
        });

        const choice = response.choices[0]?.message;
        if (choice?.tool_calls && choice.tool_calls.length > 0) {
          const toolCall = choice.tool_calls[0];
          const fnName = (toolCall as any).function?.name;
          const fnArgs = JSON.parse((toolCall as any).function?.arguments || '{}');

          const actionRes = await jamiActionService.executeTool(userId, fnName, fnArgs);

          const replyMsg = await jamiRepo.saveMessage(userId, {
            sender: 'jami',
            text: actionRes.message,
            emotion: actionRes.requiresConfirmation ? 'reminding' : 'speaking',
            requiresConfirmation: actionRes.requiresConfirmation,
            confirmationSummary: actionRes.requiresConfirmation ? actionRes.message : undefined,
            proposalId: actionRes.proposal?.id,
          });

          await this.logVoiceRequest(userId, {
            purpose: 'tool_execution',
            transcript: cleanTranscript,
            mode: options?.mode || 'openai_text',
            clientTurnId: options?.clientTurnId,
          });

          return {
            replyText: actionRes.message,
            emotion: actionRes.requiresConfirmation ? 'reminding' : 'speaking',
            requiresConfirmation: actionRes.requiresConfirmation,
            proposal: actionRes.proposal,
            clientAction: actionRes.clientAction,
            replyMessage: replyMsg,
          };
        }

        const replyContent = choice?.content || 'Jami đã ghi nhận câu hỏi của bạn!';
        const replyMsg = await jamiRepo.saveMessage(userId, {
          sender: 'jami',
          text: replyContent,
          emotion: 'speaking',
        });

        await this.logVoiceRequest(userId, {
          purpose: 'general_chat',
          transcript: cleanTranscript,
          mode: options?.mode || 'openai_text',
          clientTurnId: options?.clientTurnId,
        });

        return {
          replyText: replyContent,
          emotion: 'speaking',
          replyMessage: replyMsg,
        };
      } catch (err: any) {
        console.warn('[VoiceSessionService] OpenAI call error, falling back to local handler:', err.message);
      }
    }

    // Local heuristic fallback for common learning commands
    let replyText: string;
    let emotion: string;
    let requiresConfirmation = false;
    let proposal: any = undefined;
    let clientAction: any = undefined;

    if (lower.includes('toán') && (lower.includes('xếp') || lower.includes('học') || lower.includes('lịch'))) {
      const match = lower.match(/(\d+)\s*phút/);
      const minutes = match ? parseInt(match[1], 10) : 45;
      const previewRes = await jamiActionService.executeTool(userId, 'preview_create_task', {
        title: `Ôn tập Toán học (${minutes} phút)`,
        subjectName: 'Toán học',
        estimatedMinutes: minutes,
        priority: 'high',
      });
      replyText = previewRes.message;
      emotion = 'reminding';
      requiresConfirmation = true;
      proposal = previewRes.proposal;
    } else if (lower.includes('báo cáo') || lower.includes('kết quả') || lower.includes('tiến độ')) {
      const repRes = await jamiActionService.executeTool(userId, 'read_report', {});
      replyText = repRes.message;
      emotion = 'speaking';
      clientAction = repRes.clientAction;
    } else {
      const aiReply = await AiAdapter.generateJamiChat(cleanTranscript);
      replyText = aiReply.message;
      emotion = aiReply.emotion || 'speaking';
    }

    const replyMsg = await jamiRepo.saveMessage(userId, {
      sender: 'jami',
      text: replyText,
      emotion,
      requiresConfirmation,
      confirmationSummary: requiresConfirmation ? replyText : undefined,
      proposalId: proposal?.id,
    });

    await this.logVoiceRequest(userId, {
      purpose: 'local_fallback_command',
      transcript: cleanTranscript,
      mode: options?.mode || 'local_fallback',
      clientTurnId: options?.clientTurnId,
    });

    return {
      replyText,
      emotion,
      requiresConfirmation,
      proposal,
      clientAction,
      replyMessage: replyMsg,
    };
  }
}

export const voiceSessionService = VoiceSessionService.getInstance();
