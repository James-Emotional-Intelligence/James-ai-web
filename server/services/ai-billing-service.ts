import crypto from 'crypto';
import { db } from '../db/mysql';
import { env } from '../config/env';
import { aiWalletRepo } from '../repositories/ai-wallet-repository';
import {
  calculateTokenCostMilliVnd,
  estimateMaxCostMilliVnd,
  formatVnd,
  isModelSupported,
  milliVndToVnd,
  ModelPricingUnavailableError,
  PRICING_VERSION,
} from '../ai/model-pricing';
import { AiWalletView, AiWalletTransaction } from '../../shared/types';

export class AiBillingService {
  private static instance: AiBillingService;

  private constructor() {}

  public static getInstance(): AiBillingService {
    if (!AiBillingService.instance) {
      AiBillingService.instance = new AiBillingService();
    }
    return AiBillingService.instance;
  }

  /**
   * Retrieves safe wallet representation for frontend views
   */
  public async getWalletView(userId: string): Promise<AiWalletView> {
    const wallet = await aiWalletRepo.getWallet(userId);
    if (!wallet) {
      return {
        balanceVnd: 0,
        balanceFormatted: '0đ',
        isUnlimited: false,
        unlimitedUntil: null,
        aiEnabled: true,
        isLowBalance: true,
        contactAdmin: {
          zalo: env.ADMIN_CONTACT_ZALO || 'https://zalo.me/g/jami_support',
          email: env.ADMIN_CONTACT_EMAIL || 'admin@jami.edu.vn',
        },
      };
    }

    return {
      balanceVnd: wallet.balanceVnd,
      balanceFormatted: formatVnd(wallet.balanceVnd),
      isUnlimited: wallet.isUnlimited,
      unlimitedUntil: wallet.unlimitedUntil,
      aiEnabled: wallet.aiEnabled,
      isLowBalance: wallet.isLowBalance,
      contactAdmin: {
        zalo: env.ADMIN_CONTACT_ZALO || 'https://zalo.me/g/jami_support',
        email: env.ADMIN_CONTACT_EMAIL || 'admin@jami.edu.vn',
      },
    };
  }

  /**
   * Pre-execution reservation: checks balance & reserves estimated max token cost
   */
  public async reserveForAiExecution(params: {
    userId: string;
    model: string;
    estimatedInputTokens?: number;
    maxOutputTokens?: number;
    promptId: string;
    requestId?: string;
    idempotencyKey?: string;
  }): Promise<{
    isUnlimited: boolean;
    reservedMilliVnd: bigint;
    reservationTxId?: string;
    pricingVersion: string;
    idempotencyKey: string;
  }> {
    const { userId, model, estimatedInputTokens, maxOutputTokens, promptId, requestId } = params;

    if (!isModelSupported(model)) {
      throw new ModelPricingUnavailableError(model);
    }

    const idempotencyKey = params.idempotencyKey || `res_${promptId}_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const estimatedCostMilliVnd = estimateMaxCostMilliVnd(model, {
      estimatedInputTokens,
      maxOutputTokens,
    });

    const reservation = await aiWalletRepo.reserveCredit({
      userId,
      estimatedCostMilliVnd,
      idempotencyKey,
      requestId,
      reason: `Tạm giữ ngân sách cho tác vụ AI: ${promptId}`,
      metadata: { model, promptId, estimatedInputTokens, maxOutputTokens },
    });

    return {
      isUnlimited: reservation.isUnlimited,
      reservedMilliVnd: reservation.reservedMilliVnd,
      reservationTxId: reservation.reservationTxId,
      pricingVersion: PRICING_VERSION,
      idempotencyKey,
    };
  }

  /**
   * Post-execution reconciliation: calculates actual token cost and charges/releases wallet
   */
  public async reconcileAiExecution(params: {
    userId: string;
    model: string;
    reservedMilliVnd: bigint;
    isUnlimited: boolean;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      cachedTokens?: number;
      audioInputTokens?: number;
      audioOutputTokens?: number;
      durationMs?: number;
      durationMinutes?: number;
    };
    promptId: string;
    requestId?: string;
    idempotencyKey: string;
    success: boolean;
    errorCode?: string;
    latencyMs?: number;
  }): Promise<{ actualCostMilliVnd: bigint; actualCostVnd: number; aiRunId: string }> {
    const { userId, model, reservedMilliVnd, isUnlimited, usage, promptId, requestId, success, errorCode, latencyMs } = params;
    const rawKey = params.idempotencyKey || (params as any).reservationIdempotencyKey || ('idemp_' + crypto.randomUUID().replace(/-/g, ''));

    let actualCostMilliVnd = 0n;
    if (usage && ((usage.promptTokens || 0) > 0 || (usage.completionTokens || 0) > 0 || (usage.durationMs || 0) > 0 || (usage.durationMinutes || 0) > 0) && isModelSupported(model)) {
      const calculation = calculateTokenCostMilliVnd(model, usage);
      actualCostMilliVnd = calculation.costMilliVnd;
    }

    const aiRunId = 'run_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const chargeIdempotencyKey = `chg_${rawKey.replace(/^res_/, '')}`;

    let aiRunRecorded = false;

    // Record AI run log in database
    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO ai_runs
           (id, user_id, purpose, provider, model, request_id, status, latency_ms, prompt_tokens, completion_tokens, cached_input_tokens, cost_milli_vnd, pricing_version, error_code, created_at)
           VALUES (?, ?, ?, 'openai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            aiRunId,
            userId,
            promptId,
            model,
            requestId || null,
            success ? 'success' : 'failed',
            latencyMs || 0,
            usage?.promptTokens || 0,
            usage?.completionTokens || 0,
            usage?.cachedTokens || 0,
            actualCostMilliVnd.toString(),
            PRICING_VERSION,
            errorCode || null,
          ]
        );
        aiRunRecorded = true;
      } catch (err: any) {
        console.error('[AiBillingService ANOMALY] Failed to record ai_run log:', {
          aiRunId,
          userId,
          promptId,
          model,
          requestId,
          error: err?.message || String(err),
        });
      }
    }

    // Reconcile wallet ledger
    await aiWalletRepo.reconcileCredit({
      userId,
      reservedMilliVnd,
      actualCostMilliVnd,
      isUnlimited,
      idempotencyKey: chargeIdempotencyKey,
      requestId,
      aiRunId: aiRunRecorded ? aiRunId : undefined,
      reason: success ? `Khấu trừ chi phí token tác vụ: ${promptId}` : `Hoàn lại tạm giữ tác vụ ${promptId}`,
      metadata: { model, promptId, usage, success, errorCode },
      success,
    });

    console.log(
      `[AiBillingService] AI Execution recorded (${model} / ${promptId}): ` +
      `Tokens: ${usage?.promptTokens || 0} in + ${usage?.completionTokens || 0} out = ${(usage?.promptTokens || 0) + (usage?.completionTokens || 0)} total | ` +
      `Cost: ${formatVnd(milliVndToVnd(actualCostMilliVnd))} (${actualCostMilliVnd} milli-VND) | Latency: ${latencyMs || 0}ms | Status: ${success ? 'SUCCESS' : 'FAILED'}`
    );

    return {
      actualCostMilliVnd,
      actualCostVnd: milliVndToVnd(actualCostMilliVnd),
      aiRunId,
    };
  }

  /**
   * Admin Top-Up
   */
  public async adminTopUp(params: {
    actorUserId: string;
    targetUserId: string;
    amountVnd: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ balanceVnd: number; transactionId: string }> {
    return aiWalletRepo.adminTopUp(params);
  }

  /**
   * Admin Deduct
   */
  public async adminDeduct(params: {
    actorUserId: string;
    targetUserId: string;
    amountVnd: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ balanceVnd: number; transactionId: string }> {
    return aiWalletRepo.adminDeduct(params);
  }

  /**
   * Admin Set Unlimited Status
   */
  public async adminSetUnlimited(params: {
    actorUserId: string;
    targetUserId: string;
    unlimitedForever: boolean;
    unlimitedUntil?: string | null;
    reason: string;
    idempotencyKey: string;
  }): Promise<void> {
    return aiWalletRepo.adminSetUnlimited(params);
  }

  /**
   * Admin Set Status
   */
  public async adminSetStatus(params: {
    actorUserId: string;
    targetUserId: string;
    aiEnabled: boolean;
    reason: string;
    idempotencyKey: string;
  }): Promise<void> {
    return aiWalletRepo.adminSetStatus(params);
  }

  /**
   * Get Transactions
   */
  public async getTransactions(
    userId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ transactions: AiWalletTransaction[]; nextCursor?: string }> {
    return aiWalletRepo.getTransactions(userId, options);
  }
}

export const aiBillingService = AiBillingService.getInstance();
