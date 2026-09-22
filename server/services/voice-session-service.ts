import crypto from 'crypto';
import { db } from '../db/mysql';
import { env } from '../config/env';
import { AiAdapter } from './ai-adapter';
import { jamiActionService, JamiActionService } from './jami-action-service';
import { jamiRepo } from '../repositories/jami-repository';
import { aiWalletRepo } from '../repositories/ai-wallet-repository';
import { vndToMilliVnd } from '../ai/model-pricing';

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
        }).catch(() => {});
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
          }).catch(() => {});

          await db.execute(
            `UPDATE ai_realtime_sessions SET status = 'cancelled', ended_at = NOW(3), updated_at = NOW(3) WHERE id = ?`,
            [r.id]
          ).catch(() => {});
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
      actualCostMilliVnd?: bigint | number | string;
      rawUsage?: any;
      reason?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    let sessionData: {
      userId: string;
      reservationIdempotencyKey: string;
      reservedMilliVnd: bigint;
      status: string;
    } | null = null;

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT user_id, reservation_idempotency_key, reserved_milli_vnd, status
           FROM ai_realtime_sessions WHERE id = ? LIMIT 1`,
          [sessionId]
        );
        if (rows && rows.length > 0) {
          sessionData = {
            userId: rows[0].user_id,
            reservationIdempotencyKey: rows[0].reservation_idempotency_key,
            reservedMilliVnd: BigInt(rows[0].reserved_milli_vnd || '0'),
            status: rows[0].status,
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

    const actualCost = options?.actualCostMilliVnd !== undefined
      ? BigInt(options.actualCostMilliVnd.toString())
      : 0n;

    await aiWalletRepo.reconcileCredit({
      userId,
      reservedMilliVnd: sessionData.reservedMilliVnd,
      actualCostMilliVnd: actualCost,
      isUnlimited: sessionData.reservedMilliVnd === 0n,
      idempotencyKey: `fin_${sessionData.reservationIdempotencyKey}`,
      success: true,
      reason: options?.reason || 'Kết thúc phiên thoại Realtime',
    }).catch((reconcileErr: any) => {
      console.warn('[VoiceSessionService] reconcileCredit on finalize failed:', reconcileErr.message);
    });

    const mem = this.inMemorySessions.get(sessionId);
    if (mem) {
      mem.status = 'completed';
      mem.actualCostMilliVnd = actualCost;
      mem.rawUsage = options?.rawUsage;
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
            options?.rawUsage ? JSON.stringify(options.rawUsage) : null,
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

    // Save user message to MySQL
    await jamiRepo.saveMessage(userId, {
      conversationId: options?.conversationId,
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
      lower === 'oke' ||
      lower === 'yes' ||
      lower === 'yep' ||
      lower === 'xác nhận lưu';

    const isRejectPhrase =
      lower.includes('không') ||
      lower.includes('hủy') ||
      lower.includes('thôi') ||
      lower.includes('bỏ qua') ||
      lower.includes('đừng') ||
      lower === 'no' ||
      lower === 'cancel';

    if (isConfirmPhrase || isRejectPhrase || options?.pendingProposalId) {
      const decision = isRejectPhrase ? 'reject' : 'confirm';
      const targetProposal = options?.pendingProposalId
        ? await jamiActionService.getProposalById(userId, options.pendingProposalId)
        : await jamiActionService.getLatestPendingProposal(userId);

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

    // Use AI Gateway via AiAdapter with full billing protection
    if (AiAdapter.isConfigured()) {
      try {
        const aiReply = await AiAdapter.generateJamiChat(cleanTranscript, { userId });
        const replyMsg = await jamiRepo.saveMessage(userId, {
          sender: 'jami',
          text: aiReply.message,
          emotion: aiReply.emotion || 'speaking',
          requiresConfirmation: aiReply.requiresConfirmation,
          confirmationSummary: aiReply.confirmationSummary,
          proposalId: aiReply.proposal?.id,
        });

        await this.logVoiceRequest(userId, {
          purpose: 'general_chat',
          transcript: cleanTranscript,
          mode: options?.mode || 'openai_text',
          clientTurnId: options?.clientTurnId,
        });

        return {
          replyText: aiReply.message,
          emotion: aiReply.emotion || 'speaking',
          requiresConfirmation: aiReply.requiresConfirmation,
          proposal: aiReply.proposal,
          clientAction: aiReply.clientAction,
          replyMessage: replyMsg,
        };
      } catch (err: any) {
        console.warn('[VoiceSessionService] AI Gateway chat error, falling back to local handler:', err.message);
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
      const aiReply = await AiAdapter.generateJamiChat(cleanTranscript, { userId });
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
