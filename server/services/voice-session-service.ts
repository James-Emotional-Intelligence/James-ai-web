import crypto from 'crypto';
import { db } from '../db/mysql';
import { env } from '../config/env';
import { AiAdapter } from './ai-adapter';
import { jamiActionService } from './jami-action-service';
import { jamiOrchestrator } from './jami-orchestrator';
import { jamiRepo } from '../repositories/jami-repository';
import { aiWalletRepo } from '../repositories/ai-wallet-repository';
import { UserRepository } from '../repositories/user-repository';
import { vndToMilliVnd, estimateRealtimeDurationCostMilliVnd, PRICING_VERSION, REALTIME_DURATION_ESTIMATOR_VERSION } from '../ai/model-pricing';
import { executeRegisteredTool, getAllOpenAiToolDefinitions } from '../ai/tool-registry';
import { getNowInTimeZone, resolveUserTimeZone } from '../lib/date-time';

const userRepo = UserRepository.getInstance();

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
  private inMemorySessions: Map<string, {
    id: string;
    userId: string;
    reservationIdempotencyKey: string;
    reservedMilliVnd: bigint;
    status: 'active' | 'completed' | 'cancelled' | 'expired' | 'failed';
    actualCostMilliVnd?: bigint;
    rawUsage?: any;
    startedAt: Date;
    expiresAt?: Date;
    endedAt?: Date;
  }> = new Map();

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
   * Cancels and reconciles any previous active realtime sessions for the user to enforce single-session limit
   */
  public async cancelActiveSessionsForUser(userId: string): Promise<void> {
    for (const [, sess] of this.inMemorySessions.entries()) {
      if (sess.userId === userId && sess.status === 'active') {
        sess.status = 'cancelled';
        sess.endedAt = new Date();
        await aiWalletRepo.reconcileCredit({
          userId,
          reservedMilliVnd: sess.reservedMilliVnd,
          actualCostMilliVnd: 0n,
          isUnlimited: sess.reservedMilliVnd === 0n,
          idempotencyKey: `cancel_dup_${sess.reservationIdempotencyKey}`,
          success: false,
          reason: 'Hủy phiên cũ để khởi tạo phiên Realtime mới',
        }).catch((err) => console.error('[VoiceSessionService] duplicate-session reconciliation failed', { userId, error: err instanceof Error ? err.message : String(err) }));
      }
    }

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, reservation_idempotency_key, reserved_milli_vnd
           FROM ai_realtime_sessions
           WHERE user_id = ? AND status = 'active'`,
          [userId]
        );
        for (const r of rows) {
          await aiWalletRepo.reconcileCredit({
            userId,
            reservedMilliVnd: BigInt(r.reserved_milli_vnd || '0'),
            actualCostMilliVnd: 0n,
            isUnlimited: BigInt(r.reserved_milli_vnd || '0') === 0n,
            idempotencyKey: `cancel_dup_${r.reservation_idempotency_key}`,
            success: false,
            reason: 'Hủy phiên cũ để khởi tạo phiên Realtime mới (DB)',
          }).catch((err) => console.error('[VoiceSessionService] duplicate DB session reconciliation failed', { sessionId: r.id, error: err instanceof Error ? err.message : String(err) }));

          await db.execute(
            `UPDATE ai_realtime_sessions SET status = 'cancelled', ended_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
            [r.id]
          ).catch((err) => console.error('[VoiceSessionService] duplicate DB session status update failed', { sessionId: r.id, error: err instanceof Error ? err.message : String(err) }));
        }
      } catch (err: any) {
        console.warn('[VoiceSessionService] cancelActiveSessionsForUser error:', err.message);
      }
    }
  }

  /**
   * Exchanges WebRTC SDP offer with OpenAI Realtime API /v1/realtime/calls using FormData
   */
  public async exchangeRealtimeSdp(
    userId: string,
    sdpOffer: string
  ): Promise<{
    mode: 'openai_realtime' | 'demo_fallback';
    sessionId?: string;
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

    // Enforce single active Realtime session per user
    await this.cancelActiveSessionsForUser(userId);

    const realtimeReserveVnd = env.AI_REALTIME_SESSION_RESERVE_VND || 10000;
    const idempotencyKey = `rt_sdp_${userId}_${Date.now()}`;
    const sessionId = 'rts_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    let reservation: { isUnlimited: boolean; reservedMilliVnd: bigint };

    try {
      reservation = await aiWalletRepo.reserveCredit({
        userId,
        estimatedCostMilliVnd: vndToMilliVnd(realtimeReserveVnd),
        idempotencyKey,
        reason: 'Tạm giữ ngân sách phiên OpenAI Realtime WebRTC',
      });
    } catch (billingErr: any) {
      return {
        mode: 'demo_fallback',
        errorCode: billingErr.code || 'AI_CREDIT_EXHAUSTED',
        message: 'Ngân sách AI không đủ để khởi tạo phiên Realtime. Đang chuyển sang Giọng nói của trình duyệt.',
      };
    }

    const reservedMilliVnd = reservation?.reservedMilliVnd ? BigInt(reservation.reservedMilliVnd) : 0n;
    this.inMemorySessions.set(sessionId, {
      id: sessionId,
      userId,
      reservationIdempotencyKey: idempotencyKey,
      reservedMilliVnd,
      status: 'active',
      startedAt: new Date(),
    });

    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO ai_realtime_sessions
           (id, user_id, reservation_idempotency_key, reserved_milli_vnd, status, started_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', NOW(3), NOW(3), NOW(3))`,
          [sessionId, userId, idempotencyKey, reservedMilliVnd.toString()]
        );
      } catch (dbErr: any) {
        console.warn('[VoiceSessionService] Error recording ai_realtime_sessions:', dbErr.message);
      }
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
        tools: getAllOpenAiToolDefinitions(),
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

        // Release reservation on upstream error
        if (reservation) {
          await aiWalletRepo.reconcileCredit({
            userId,
            reservedMilliVnd: reservation.reservedMilliVnd,
            actualCostMilliVnd: 0n,
            isUnlimited: reservation.isUnlimited,
            idempotencyKey: `rel_${idempotencyKey}`,
            success: false,
            reason: 'Giải phóng tạm giữ do lỗi thiết lập WebRTC',
          }).catch(() => {});
        }

        const memSess = this.inMemorySessions.get(sessionId);
        if (memSess) {
          memSess.status = 'failed';
          memSess.endedAt = new Date();
        }

        if (db.isHealthy()) {
          await db.execute(
            `UPDATE ai_realtime_sessions SET status = 'failed', ended_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
            [sessionId]
          ).catch(() => {});
        }

        return {
          mode: 'demo_fallback',
          errorCode,
          message: 'Không thể thiết lập WebRTC với OpenAI Realtime. Đang chuyển sang Giọng nói trình duyệt.',
        };
      }

      const sdpAnswer = await response.text();
      return {
        mode: 'openai_realtime',
        sessionId,
        sdpAnswer,
        model,
        message: 'WebRTC kết nối thành công với OpenAI Realtime.',
      };
    } catch (err: any) {
      console.warn('[VoiceSessionService] OpenAI Realtime WebRTC exchange error:', err.message);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');

      // Release reservation on exception
      if (reservation) {
        await aiWalletRepo.reconcileCredit({
          userId,
          reservedMilliVnd: reservation.reservedMilliVnd,
          actualCostMilliVnd: 0n,
          isUnlimited: reservation.isUnlimited,
          idempotencyKey: `rel_${idempotencyKey}`,
          success: false,
          reason: 'Giải phóng tạm giữ do lỗi ngoại lệ WebRTC',
        }).catch((err) => console.error('[VoiceSessionService] realtime setup reconciliation failed', { sessionId, error: err instanceof Error ? err.message : String(err) }));
      }

      const memSess = this.inMemorySessions.get(sessionId);
      if (memSess) {
        memSess.status = 'failed';
        memSess.endedAt = new Date();
      }

      if (db.isHealthy()) {
        await db.execute(
          `UPDATE ai_realtime_sessions SET status = 'failed', ended_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
          [sessionId]
        ).catch(() => {});
      }

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
    sessionId?: string;
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

    // Enforce single active Realtime session per user
    await this.cancelActiveSessionsForUser(userId);

    const realtimeReserveVnd = env.AI_REALTIME_SESSION_RESERVE_VND || 10000;
    const idempotencyKey = `rt_sec_${userId}_${Date.now()}`;
    const sessionId = 'rts_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    let reservation: { isUnlimited: boolean; reservedMilliVnd: bigint };

    try {
      reservation = await aiWalletRepo.reserveCredit({
        userId,
        estimatedCostMilliVnd: vndToMilliVnd(realtimeReserveVnd),
        idempotencyKey,
        reason: 'Tạm giữ ngân sách phiên OpenAI Realtime Client Secret',
      });
    } catch (billingErr: any) {
      return {
        mode: 'demo_fallback',
        errorCode: billingErr.code || 'AI_CREDIT_EXHAUSTED',
        message: 'Ngân sách AI không đủ để khởi tạo phiên Realtime. Đang chuyển sang Web Speech Fallback.',
      };
    }

    const reservedMilliVnd = reservation?.reservedMilliVnd ? BigInt(reservation.reservedMilliVnd) : 0n;
    this.inMemorySessions.set(sessionId, {
      id: sessionId,
      userId,
      reservationIdempotencyKey: idempotencyKey,
      reservedMilliVnd,
      status: 'active',
      startedAt: new Date(),
    });

    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO ai_realtime_sessions
           (id, user_id, reservation_idempotency_key, reserved_milli_vnd, status, started_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', NOW(3), NOW(3), NOW(3))`,
          [sessionId, userId, idempotencyKey, reservedMilliVnd.toString()]
        );
      } catch (dbErr: any) {
        console.warn('[VoiceSessionService] Error recording ai_realtime_sessions:', dbErr.message);
      }
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
      tools: getAllOpenAiToolDefinitions(),
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

        // Release reservation on upstream error
        if (reservation) {
          await aiWalletRepo.reconcileCredit({
            userId,
            reservedMilliVnd: reservation.reservedMilliVnd,
            actualCostMilliVnd: 0n,
            isUnlimited: reservation.isUnlimited,
            idempotencyKey: `rel_${idempotencyKey}`,
            success: false,
            reason: 'Giải phóng tạm giữ do lỗi tạo client secret',
          }).catch((err) => console.error('[VoiceSessionService] realtime client-secret reconciliation failed', { sessionId, error: err instanceof Error ? err.message : String(err) }));
        }

        const memSess = this.inMemorySessions.get(sessionId);
        if (memSess) {
          memSess.status = 'failed';
          memSess.endedAt = new Date();
        }

        if (db.isHealthy()) {
          await db.execute(
            `UPDATE ai_realtime_sessions SET status = 'failed', ended_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
            [sessionId]
          ).catch((err) => console.error('[VoiceSessionService] realtime setup status update failed', { sessionId, error: err instanceof Error ? err.message : String(err) }));
        }

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
        if (reservation) {
          await aiWalletRepo.reconcileCredit({
            userId,
            reservedMilliVnd: reservation.reservedMilliVnd,
            actualCostMilliVnd: 0n,
            isUnlimited: reservation.isUnlimited,
            idempotencyKey: `rel_${idempotencyKey}`,
            success: false,
            reason: 'Giải phóng tạm giữ do thiếu client secret',
          }).catch(() => {});
        }

        const memSess = this.inMemorySessions.get(sessionId);
        if (memSess) {
          memSess.status = 'failed';
          memSess.endedAt = new Date();
        }

        if (db.isHealthy()) {
          await db.execute(
            `UPDATE ai_realtime_sessions SET status = 'failed', ended_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
            [sessionId]
          ).catch(() => {});
        }

        return {
          mode: 'demo_fallback',
          errorCode: 'AI_UPSTREAM_ERROR',
          message: 'Không nhận được ephemeral client secret từ OpenAI.',
        };
      }

      const expDate = expiresAt ? new Date(expiresAt * 1000) : undefined;
      const memSess = this.inMemorySessions.get(sessionId);
      if (memSess && expDate) {
        memSess.expiresAt = expDate;
      }

      if (db.isHealthy() && expDate) {
        await db.execute(
          `UPDATE ai_realtime_sessions SET expires_at = ?, updated_at = NOW(3) WHERE id = ?`,
          [expDate, sessionId]
        ).catch(() => {});
      }

      return {
        mode: 'openai_realtime',
        sessionId,
        clientSecret: clientSecretValue,
        expiresAt,
        model,
        voice,
        message: 'Phiên OpenAI Realtime WebRTC đã sẵn sàng.',
      };
    } catch (err: any) {
      console.warn('[VoiceSessionService] OpenAI Realtime request error:', err.message);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');

      if (reservation) {
        await aiWalletRepo.reconcileCredit({
          userId,
          reservedMilliVnd: reservation.reservedMilliVnd,
          actualCostMilliVnd: 0n,
          isUnlimited: reservation.isUnlimited,
          idempotencyKey: `rel_${idempotencyKey}`,
          success: false,
          reason: 'Giải phóng tạm giữ do lỗi ngoại lệ client secret',
        }).catch(() => {});
      }

      const memSess = this.inMemorySessions.get(sessionId);
      if (memSess) {
        memSess.status = 'failed';
        memSess.endedAt = new Date();
      }

      if (db.isHealthy()) {
        await db.execute(
          `UPDATE ai_realtime_sessions SET status = 'failed', ended_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
          [sessionId]
        ).catch(() => {});
      }

      return {
        mode: 'demo_fallback',
        errorCode: isTimeout ? 'AI_TIMEOUT' : 'AI_UPSTREAM_ERROR',
        message: 'Lỗi kết nối OpenAI Realtime. Sử dụng Web Speech Fallback.',
      };
    }
  }

  /**
   * Finalizes a realtime voice session and reconciles reserved credits
   */
  public async finalizeRealtimeSession(
    userId: string,
    sessionId: string,
    options?: {
      reason?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    let sessionData: {
      userId: string;
      reservationIdempotencyKey: string;
      reservedMilliVnd: bigint;
      status: string;
      startedAt?: Date;
    } | null = null;

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT user_id, reservation_idempotency_key, reserved_milli_vnd, status, started_at
           FROM ai_realtime_sessions WHERE id = ? LIMIT 1`,
          [sessionId]
        );
        if (rows && rows.length > 0) {
          sessionData = {
            userId: rows[0].user_id,
            reservationIdempotencyKey: rows[0].reservation_idempotency_key,
            reservedMilliVnd: BigInt(rows[0].reserved_milli_vnd || '0'),
            status: rows[0].status,
            startedAt: rows[0].started_at ? new Date(rows[0].started_at) : undefined,
          };
        }
      } catch (err: any) {
        console.warn('[VoiceSessionService] Error fetching session from DB:', err.message);
      }
    }

    if (!sessionData) {
      const mem = this.inMemorySessions.get(sessionId);
      if (mem) {
        sessionData = {
          userId: mem.userId,
          reservationIdempotencyKey: mem.reservationIdempotencyKey,
          reservedMilliVnd: mem.reservedMilliVnd,
          status: mem.status,
          startedAt: mem.startedAt,
        };
      }
    }

    if (!sessionData) {
      return { success: false, message: 'Không tìm thấy phiên thoại.' };
    }

    if (sessionData.userId !== userId) {
      return { success: false, message: 'Bạn không có quyền thao tác trên phiên thoại này.' };
    }

    if (sessionData.status !== 'active') {
      return { success: true, message: 'Phiên thoại đã được kết thúc trước đó.' };
    }

    if (db.isHealthy()) {
      const claim = await db.execute(
        `UPDATE ai_realtime_sessions SET status = 'finalizing', updated_at = NOW(3)
         WHERE id = ? AND user_id = ? AND status = 'active'`,
        [sessionId, userId]
      );
      if ((claim?.affectedRows || 0) !== 1) {
        return { success: false, message: 'Phiên thoại đang được kết thúc bởi một yêu cầu khác.' };
      }
    }

    // Server-authoritative cost calculation. WebRTC usage is not trusted from the browser.
    const memSess = this.inMemorySessions.get(sessionId);
    const startObj = sessionData.startedAt || memSess?.startedAt || new Date();
    const startTime = startObj.getTime();
    const durationMs = Math.max(0, Date.now() - startTime);
    const calculatedCost = estimateRealtimeDurationCostMilliVnd(durationMs);

    // Clamp actual cost to reserved amount to prevent overdraft
    const actualCost = calculatedCost <= sessionData.reservedMilliVnd ? calculatedCost : sessionData.reservedMilliVnd;

    try {
      await aiWalletRepo.reconcileCredit({
        userId,
        reservedMilliVnd: sessionData.reservedMilliVnd,
        actualCostMilliVnd: actualCost,
        isUnlimited: sessionData.reservedMilliVnd === 0n,
        idempotencyKey: `fin_${sessionData.reservationIdempotencyKey}`,
        success: true,
        reason: options?.reason || 'Kết thúc phiên thoại Realtime',
      });
    } catch (reconcileErr: any) {
      console.error('[VoiceSessionService] reconcileCredit on finalize failed:', reconcileErr.message);
      if (db.isHealthy()) {
        await db.execute(`UPDATE ai_realtime_sessions SET status = 'reconciliation_failed', updated_at = NOW(3) WHERE id = ? AND user_id = ?`, [sessionId, userId]);
      }
      return { success: false, message: 'Chưa thể đối soát chi phí phiên thoại. Hệ thống sẽ thử lại an toàn.' };
    }

    const mem = this.inMemorySessions.get(sessionId);
    if (mem) {
      mem.status = 'completed';
      mem.actualCostMilliVnd = actualCost;
      mem.rawUsage = { estimated: true, source: 'server_duration', durationMs, pricingVersion: PRICING_VERSION, estimatorVersion: REALTIME_DURATION_ESTIMATOR_VERSION };
      mem.endedAt = new Date();
    }

    if (db.isHealthy()) {
      try {
        await db.execute(
          `UPDATE ai_realtime_sessions
           SET status = 'completed',
               actual_cost_milli_vnd = ?,
               raw_usage_json = ?,
               ended_at = NOW(3),
               updated_at = NOW(3)
           WHERE id = ?`,
          [
            actualCost.toString(),
            JSON.stringify({ estimated: true, source: 'server_duration', durationMs, pricingVersion: PRICING_VERSION, estimatorVersion: REALTIME_DURATION_ESTIMATOR_VERSION }),
            sessionId,
          ]
        );
      } catch (err: any) {
        console.warn('[VoiceSessionService] Error updating session status to completed:', err.message);
      }
    }

    return { success: true, message: 'Phiên thoại đã kết thúc thành công.' };
  }

  /**
   * Sweeps stale active sessions (>30 mins or past expiresAt) and releases reserved credits
   */
  public async sweepStaleSessions(): Promise<{ sweptCount: number }> {
    let count = 0;
    const now = new Date();

    // In-memory sweeping
    for (const [id, mem] of this.inMemorySessions.entries()) {
      const isPastExpiry = mem.expiresAt && mem.expiresAt < now;
      const isOlderThan30Min = (now.getTime() - mem.startedAt.getTime()) > 30 * 60 * 1000;
      if (mem.status === 'active' && (isPastExpiry || isOlderThan30Min)) {
        mem.status = 'expired';
        mem.endedAt = now;
        await aiWalletRepo.reconcileCredit({
          userId: mem.userId,
          reservedMilliVnd: mem.reservedMilliVnd,
          actualCostMilliVnd: 0n,
          isUnlimited: mem.reservedMilliVnd === 0n,
          idempotencyKey: `sweep_${mem.reservationIdempotencyKey}`,
          success: false,
          reason: 'Giải phóng ngân sách do phiên Realtime hết hạn',
        }).catch(() => {});
        count++;
      }
    }

    if (db.isHealthy()) {
      try {
        const staleRows = await db.query<any>(
          `SELECT id, user_id, reservation_idempotency_key, reserved_milli_vnd
           FROM ai_realtime_sessions
           WHERE status = 'active'
             AND (
               (expires_at IS NOT NULL AND expires_at < NOW(3))
               OR started_at < DATE_SUB(NOW(3), INTERVAL 30 MINUTE)
             )
           LIMIT 100`
        );

        for (const row of staleRows) {
          await aiWalletRepo.reconcileCredit({
            userId: row.user_id,
            reservedMilliVnd: BigInt(row.reserved_milli_vnd || '0'),
            actualCostMilliVnd: 0n,
            isUnlimited: BigInt(row.reserved_milli_vnd || '0') === 0n,
            idempotencyKey: `sweep_${row.reservation_idempotency_key}`,
            success: false,
            reason: 'Giải phóng ngân sách do phiên Realtime hết hạn (DB Sweep)',
          }).catch(() => {});

          await db.execute(
            `UPDATE ai_realtime_sessions
             SET status = 'expired', ended_at = NOW(3), updated_at = NOW(3)
             WHERE id = ?`,
            [row.id]
          ).catch(() => {});

          count++;
        }
      } catch (err: any) {
        console.warn('[VoiceSessionService] Error sweeping stale sessions in DB:', err.message);
      }
    }

    return { sweptCount: count };
  }

  private sweeperTimer: NodeJS.Timeout | null = null;

  public startStaleSessionSweeper(intervalMs = 300000): void {
    if (this.sweeperTimer) return;
    this.sweeperTimer = setInterval(async () => {
      try {
        await this.sweepStaleSessions();
      } catch (err: any) {
        console.warn('[VoiceSessionService] Error in stale session sweeper tick:', err.message);
      }
    }, intervalMs);
    // Initial run immediately
    this.sweepStaleSessions().catch((err) => console.error('[VoiceSessionService] initial stale session sweep failed', { error: err instanceof Error ? err.message : String(err) }));
  }

  public stopStaleSessionSweeper(): void {
    if (this.sweeperTimer) {
      clearInterval(this.sweeperTimer);
      this.sweeperTimer = null;
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
    options?: { clientTurnId?: string; mode?: string; conversationId?: string; pendingProposalId?: string }
  ) {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) {
      return {
        replyText: 'Jami chưa nghe rõ, bạn có thể nói lại được không?',
        emotion: 'idle',
      };
    }

    const lower = cleanTranscript.toLowerCase();

    // Check if the user is confirming or rejecting a pending proposal
    const isConfirmPhrase =
      lower.includes('đồng ý') ||
      lower.includes('xác nhận') ||
      lower.includes('làm đi') ||
      lower.includes('được rồi') ||
      lower === 'ok' ||
      lower === 'có' ||
      lower === 'oke' ||
      lower === 'yes' ||
      lower === 'yep' ||
      lower === 'xác nhận lưu';

    const pendingDecision = classifyPendingDecision(lower);
    const isRejectPhrase = pendingDecision === 'reject';
    const isModifyPhrase = pendingDecision === 'modify';

    if (options?.pendingProposalId && (isConfirmPhrase || isRejectPhrase)) {
      const decision = isRejectPhrase ? 'reject' : 'confirm';
      await jamiRepo.saveMessage(userId, {
        conversationId: options?.conversationId,
        sender: 'user',
        text: cleanTranscript,
        clientMessageId: options?.clientTurnId,
      });
      const targetProposal = await jamiActionService.getProposalById(userId, options.pendingProposalId);

      if (targetProposal) {
        const actionRes = await jamiActionService.handleProposalDecision(
          userId,
          decision,
          targetProposal.id,
          options?.conversationId
        );

        const replyEmotion = actionRes.success
          ? (decision === 'confirm' ? 'celebrating' : 'speaking')
          : 'speaking';

        const replyMsg = await jamiRepo.saveMessage(userId, {
          conversationId: options?.conversationId,
          sender: 'jami',
          text: actionRes.message,
          emotion: replyEmotion,
        });

        await this.logVoiceRequest(userId, {
          purpose: 'confirmation_command',
          transcript: cleanTranscript,
          mode: options?.mode || 'web_speech',
          clientTurnId: options?.clientTurnId,
        });

        return {
          replyText: actionRes.message,
          emotion: replyEmotion,
          clientAction: actionRes.clientAction,
          replyMessage: replyMsg,
          success: actionRes.success,
        };
      } else if (isConfirmPhrase || isRejectPhrase) {
        const replyText = isConfirmPhrase
          ? 'Hiện tại không có đề xuất nào đang chờ xác nhận từ bạn.'
          : 'Đã ghi nhận, hiện không có thao tác nào cần hủy.';
        const replyMsg = await jamiRepo.saveMessage(userId, {
          conversationId: options?.conversationId,
          sender: 'jami',
          text: replyText,
          emotion: 'speaking',
        });
        return {
          replyText,
          emotion: 'speaking',
          replyMessage: replyMsg,
        };
      }
    }

    // A proposed edit is new intent, never an implicit rejection.
    if (options?.pendingProposalId && isModifyPhrase) {
      return jamiOrchestrator.processTurn({
        userId, message: cleanTranscript, conversationId: options.conversationId,
        clientMessageId: options.clientTurnId, source: 'voice',
      });
    }

    // Check direct command intents
    if (lower.includes('mở lịch') || lower.includes('thời khóa biểu') || lower.includes('xem lịch')) {
      await jamiRepo.saveMessage(userId, {
        conversationId: options?.conversationId,
        sender: 'user',
        text: cleanTranscript,
        clientMessageId: options?.clientTurnId,
      });
      const user = await userRepo.findById(userId);
      const timeInfo = getNowInTimeZone(resolveUserTimeZone(user?.timezone));
      const actionRes = await executeRegisteredTool({ userId, conversationId: options?.conversationId, source: 'voice', clientTurnId: options?.clientTurnId, timezone: timeInfo.timeZone, now: timeInfo.now }, 'navigate_to', { route: '/timetable' });
      const replyText = 'Jami đang mở thời khóa biểu của bạn đây.';
       const replyMsg = await jamiRepo.saveMessage(userId, {
         conversationId: options?.conversationId,
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
      await jamiRepo.saveMessage(userId, {
        conversationId: options?.conversationId,
        sender: 'user',
        text: cleanTranscript,
        clientMessageId: options?.clientTurnId,
      });
      const minutes = match ? parseInt(match[1], 10) : 25;
      const user = await userRepo.findById(userId);
      const timeInfo = getNowInTimeZone(resolveUserTimeZone(user?.timezone));
      const actionRes = await executeRegisteredTool({ userId, conversationId: options?.conversationId, source: 'voice', clientTurnId: options?.clientTurnId, timezone: timeInfo.timeZone, now: timeInfo.now }, 'start_focus_timer', { plannedMinutes: minutes });

      const replyText = `Đã bắt đầu phiên tập trung ${minutes} phút cho bạn. Hãy sẵn sàng nhé!`;
       const replyMsg = await jamiRepo.saveMessage(userId, {
         conversationId: options?.conversationId,
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

    // Use unified Jami Orchestrator with tool execution and context
    try {
      const turnResult = await jamiOrchestrator.processTurn({
        userId,
        message: cleanTranscript,
        conversationId: options?.conversationId,
        clientMessageId: options?.clientTurnId,
        source: 'voice',
      });

      await this.logVoiceRequest(userId, {
        purpose: 'general_voice_command',
        transcript: cleanTranscript,
        mode: options?.mode || (AiAdapter.isConfigured() ? 'openai_text' : 'local_fallback'),
        clientTurnId: options?.clientTurnId,
      });

      return {
        replyText: turnResult.replyMessage.text,
        emotion: turnResult.replyMessage.emotion || 'speaking',
        requiresConfirmation: Boolean(turnResult.replyMessage.requiresConfirmation),
        confirmationSummary: turnResult.replyMessage.confirmationSummary,
        proposal: turnResult.proposal,
        clientAction: turnResult.clientAction,
        replyMessage: turnResult.replyMessage,
        success: true,
      };
    } catch (err: any) {
      console.warn('[VoiceSessionService] Orchestrator voice turn error:', err.message);
      const replyText = 'Jami đang gặp gián đoạn kết nối với máy chủ AI. Bạn vui lòng thử lại câu hỏi sau giây lát nhé.';
      const replyMsg = await jamiRepo.saveMessage(userId, {
        conversationId: options?.conversationId,
        sender: 'jami',
        text: replyText,
        emotion: 'speaking',
      });

      await this.logVoiceRequest(userId, {
        purpose: 'voice_error_fallback',
        transcript: cleanTranscript,
        mode: options?.mode || 'error_fallback',
        clientTurnId: options?.clientTurnId,
        errorCode: 'ORCHESTRATOR_ERROR',
      });

      return {
        replyText,
        emotion: 'speaking',
        requiresConfirmation: false,
        replyMessage: replyMsg,
        success: false,
      };
    }
  }
}

function classifyPendingDecision(text: string): 'confirm' | 'reject' | 'modify' | 'normal' {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const reject = new Set(['không', 'không đồng ý', 'hủy', 'hủy đi', 'bỏ qua', 'thôi', 'đừng lưu', 'cancel', 'no']);
  if (reject.has(normalized)) return 'reject';
  if (/^(không|hủy|thôi|no|cancel)[,\s].+/.test(normalized) || /\b(đổi|sửa|chuyển sang|thay thành)\b/.test(normalized)) return 'modify';
  if (['ok', 'oke', 'yes', 'yep', 'có', 'đồng ý', 'xác nhận', 'làm đi', 'được rồi', 'xác nhận lưu'].includes(normalized)) return 'confirm';
  return 'normal';
}

export const voiceSessionService = VoiceSessionService.getInstance();
