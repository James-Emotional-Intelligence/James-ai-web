import crypto from 'crypto';
import { db } from '../db/mysql';
import { env, isProduction, isDatabaseRequired } from '../config/env';
import { AiWallet, AiWalletTransaction, AiWalletTransactionType } from '../../shared/types';
import { milliVndToVnd, vndToMilliVnd, formatVnd } from '../ai/model-pricing';

export class AiCreditExhaustedError extends Error {
  public status = 402;
  public code = 'AI_CREDIT_EXHAUSTED';
  constructor(message?: string) {
    super(message || 'Ngân sách AI của bạn đã hết (0đ). Vui lòng liên hệ Admin để được hỗ trợ nạp thêm.');
    this.name = 'AiCreditExhaustedError';
  }
}

export class AiCreditInsufficientError extends Error {
  public status = 402;
  public code = 'AI_CREDIT_INSUFFICIENT';
  constructor(currentBalanceVnd: number, requiredVnd: number) {
    super(`Số dư AI hiện tại (${formatVnd(currentBalanceVnd)}) không đủ để thực hiện tác vụ này (cần tối thiểu ${formatVnd(requiredVnd)}). Vui lòng liên hệ Admin để nạp thêm.`);
    this.name = 'AiCreditInsufficientError';
  }
}

export class AiDisabledForUserError extends Error {
  public status = 403;
  public code = 'AI_DISABLED_FOR_USER';
  constructor() {
    super('Quyền sử dụng AI của tài khoản đang tạm thời bị khóa. Vui lòng liên hệ Admin để được hỗ trợ.');
    this.name = 'AiDisabledForUserError';
  }
}

export interface StoredAiWallet {
  userId: string;
  balanceMilliVnd: bigint;
  reservedMilliVnd: bigint;
  aiEnabled: boolean;
  unlimitedForever: boolean;
  unlimitedUntil?: Date | null;
  version: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredAiWalletTransaction {
  id: string;
  userId: string;
  actorUserId?: string | null;
  type: AiWalletTransactionType;
  amountMilliVnd: bigint;
  balanceAfterMilliVnd: bigint;
  reservedAfterMilliVnd: bigint;
  requestId?: string | null;
  aiRunId?: string | null;
  registrationCodeId?: string | null;
  idempotencyKey: string;
  reason?: string | null;
  metadata?: any;
  createdAt: Date;
}

export class AiWalletRepository {
  private static instance: AiWalletRepository;
  private demoWallets: Map<string, StoredAiWallet> = new Map();
  private demoTransactions: Map<string, StoredAiWalletTransaction[]> = new Map();

  private constructor() {}

  public static getInstance(): AiWalletRepository {
    if (!AiWalletRepository.instance) {
      AiWalletRepository.instance = new AiWalletRepository();
    }
    return AiWalletRepository.instance;
  }

  /**
   * Clears in-memory cache / demo wallets (for test suites)
   */
  public resetDemoData() {
    this.demoWallets.clear();
    this.demoTransactions.clear();
  }

  /**
   * Helper to create or ensure a default wallet and return AiWallet view
   */
  public async createDefaultWallet(userId: string, opts?: { initialGrantVnd?: number }): Promise<AiWallet> {
    const stored = await this.ensureWallet(userId, opts?.initialGrantVnd);
    const balanceVnd = milliVndToVnd(stored.balanceMilliVnd);
    const reservedVnd = milliVndToVnd(stored.reservedMilliVnd);
    const isLowBalance = !stored.unlimitedForever && balanceVnd < (env.AI_LOW_BALANCE_WARNING_VND ?? 5000);
    return {
      userId: stored.userId,
      balanceVnd,
      balanceMilliVnd: stored.balanceMilliVnd.toString(),
      reservedVnd,
      reservedMilliVnd: stored.reservedMilliVnd.toString(),
      isUnlimited: stored.unlimitedForever || (stored.unlimitedUntil ? stored.unlimitedUntil > new Date() : false),
      isLowBalance,
      aiEnabled: stored.aiEnabled,
      unlimitedForever: stored.unlimitedForever,
      unlimitedUntil: stored.unlimitedUntil ? stored.unlimitedUntil.toISOString() : null,
      version: Number(stored.version),
      createdAt: stored.createdAt.toISOString(),
      updatedAt: stored.updatedAt.toISOString(),
    };
  }

  /**
   * Ensures an AI wallet exists for a user, granting default credit if newly created
   */
  public async ensureWallet(userId: string, defaultCreditVnd?: number): Promise<StoredAiWallet> {
    const grantVnd = defaultCreditVnd ?? env.AI_DEFAULT_CREDIT_VND ?? 25000;
    const initialMilliVnd = vndToMilliVnd(grantVnd);
    const now = new Date();

    if (db.isHealthy()) {
      try {
        let wallet: StoredAiWallet | null = null;
        await db.withTransaction(async (conn) => {
          const [rows]: any = await conn.query(
            'SELECT user_id, balance_milli_vnd, reserved_milli_vnd, ai_enabled, unlimited_forever, unlimited_until, version, created_at, updated_at FROM ai_wallets WHERE user_id = ? FOR UPDATE',
            [userId]
          );

          if (rows && rows.length > 0) {
            const r = rows[0];
            wallet = {
              userId: r.user_id,
              balanceMilliVnd: BigInt(r.balance_milli_vnd),
              reservedMilliVnd: BigInt(r.reserved_milli_vnd),
              aiEnabled: Boolean(r.ai_enabled),
              unlimitedForever: Boolean(r.unlimited_forever),
              unlimitedUntil: r.unlimited_until ? new Date(r.unlimited_until) : null,
              version: BigInt(r.version || 0),
              createdAt: new Date(r.created_at),
              updatedAt: new Date(r.updated_at),
            };
            return;
          }

          // Create new wallet with initial grant
          await conn.execute(
            `INSERT INTO ai_wallets (user_id, balance_milli_vnd, reserved_milli_vnd, ai_enabled, unlimited_forever, unlimited_until, version, created_at, updated_at)
             VALUES (?, ?, 0, TRUE, FALSE, NULL, 0, NOW(3), NOW(3))`,
            [userId, initialMilliVnd.toString()]
          );

          const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          const idempotencyKey = `init_grant_${userId}`;

          await conn.execute(
            `INSERT IGNORE INTO ai_wallet_transactions
             (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, idempotency_key, reason, created_at)
             VALUES (?, ?, NULL, 'initial_grant', ?, ?, 0, ?, 'Cấp ngân sách AI ban đầu (25.000đ)', NOW(3))`,
            [txId, userId, initialMilliVnd.toString(), initialMilliVnd.toString(), idempotencyKey]
          );

          wallet = {
            userId,
            balanceMilliVnd: initialMilliVnd,
            reservedMilliVnd: 0n,
            aiEnabled: true,
            unlimitedForever: false,
            unlimitedUntil: null,
            version: 0n,
            createdAt: now,
            updatedAt: now,
          };
        });

        if (wallet) return wallet;
      } catch (err: any) {
        console.error(`[AiWalletRepository] Error ensuring wallet for ${userId}:`, err.message);
        if (isProduction || isDatabaseRequired) {
          throw err;
        }
      }
    }

    // In-memory demo fallback
    let demo = this.demoWallets.get(userId);
    if (!demo) {
      demo = {
        userId,
        balanceMilliVnd: initialMilliVnd,
        reservedMilliVnd: 0n,
        aiEnabled: true,
        unlimitedForever: false,
        unlimitedUntil: null,
        version: 0n,
        createdAt: now,
        updatedAt: now,
      };
      this.demoWallets.set(userId, demo);

      const tx: StoredAiWalletTransaction = {
        id: 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        userId,
        actorUserId: null,
        type: 'initial_grant',
        amountMilliVnd: initialMilliVnd,
        balanceAfterMilliVnd: initialMilliVnd,
        reservedAfterMilliVnd: 0n,
        idempotencyKey: `init_grant_${userId}`,
        reason: 'Cấp ngân sách AI ban đầu (25.000đ)',
        createdAt: now,
      };
      const list = this.demoTransactions.get(userId) || [];
      list.unshift(tx);
      this.demoTransactions.set(userId, list);
    }

    return demo;
  }

  /**
   * Retrieves current wallet status for a user
   */
  public async getWallet(userId: string): Promise<AiWallet | null> {
    const stored = await this.ensureWallet(userId);
    const now = new Date();
    const isUnlimited = stored.unlimitedForever || Boolean(stored.unlimitedUntil && stored.unlimitedUntil > now);
    const balanceVnd = milliVndToVnd(stored.balanceMilliVnd);
    const reservedVnd = milliVndToVnd(stored.reservedMilliVnd);
    const isLowBalance = !isUnlimited && balanceVnd <= (env.AI_LOW_BALANCE_WARNING_VND ?? 5000);

    return {
      userId: stored.userId,
      balanceMilliVnd: stored.balanceMilliVnd.toString(),
      reservedMilliVnd: stored.reservedMilliVnd.toString(),
      balanceVnd,
      reservedVnd,
      aiEnabled: stored.aiEnabled,
      unlimitedForever: stored.unlimitedForever,
      unlimitedUntil: stored.unlimitedUntil?.toISOString() || null,
      isUnlimited,
      isLowBalance,
      version: Number(stored.version),
      createdAt: stored.createdAt.toISOString(),
      updatedAt: stored.updatedAt.toISOString(),
    };
  }

  /**
   * Reserves credit before invoking OpenAI (Atomic check & reserve)
   */
  public async reserveCredit(params: {
    userId: string;
    estimatedCostMilliVnd: bigint;
    idempotencyKey: string;
    requestId?: string;
    reason?: string;
    metadata?: any;
  }): Promise<{ isUnlimited: boolean; reservedMilliVnd: bigint; reservationTxId?: string }> {
    const { userId, estimatedCostMilliVnd, idempotencyKey, requestId, reason, metadata } = params;

    if (db.isHealthy()) {
      let result: { isUnlimited: boolean; reservedMilliVnd: bigint; reservationTxId?: string } | null = null;
      await db.withTransaction(async (conn) => {
        // Check idempotency first
        const [existingTx]: any = await conn.query(
          'SELECT id, type, amount_milli_vnd FROM ai_wallet_transactions WHERE idempotency_key = ?',
          [idempotencyKey]
        );
        if (existingTx && existingTx.length > 0) {
          const tx = existingTx[0];
          result = {
            isUnlimited: false,
            reservedMilliVnd: BigInt(tx.amount_milli_vnd),
            reservationTxId: tx.id,
          };
          return;
        }

        const [rows]: any = await conn.query(
          'SELECT balance_milli_vnd, reserved_milli_vnd, ai_enabled, unlimited_forever, unlimited_until, version FROM ai_wallets WHERE user_id = ? FOR UPDATE',
          [userId]
        );

        if (!rows || rows.length === 0) {
          throw new AiCreditExhaustedError();
        }

        const w = rows[0];
        if (!w.ai_enabled) {
          throw new AiDisabledForUserError();
        }

        // 1. Global daily hard budget check applies to ALL accounts (including unlimited / admin)
        const globalDailyBudgetVnd = env.AI_GLOBAL_DAILY_BUDGET_VND;
        if (globalDailyBudgetVnd && globalDailyBudgetVnd > 0) {
          const globalDailyLimitMilliVnd = vndToMilliVnd(globalDailyBudgetVnd);
          const [globalSpendRows]: any = await conn.query(
            `SELECT COALESCE(SUM(ABS(amount_milli_vnd)), 0) as spent
             FROM ai_wallet_transactions
             WHERE type IN ('ai_charge', 'unlimited_usage') AND created_at >= CURDATE()`
          );
          const globalSpentToday = BigInt(globalSpendRows[0]?.spent || 0);
          if (globalSpentToday + estimatedCostMilliVnd > globalDailyLimitMilliVnd) {
            const err = new Error(`Hệ thống đã đạt hạn mức ngân sách AI toàn cục trong ngày. Vui lòng thử lại sau.`);
            (err as any).code = 'AI_BUDGET_EXCEEDED';
            (err as any).status = 429;
            throw err;
          }
        }

        const now = new Date();
        const isUnlimited = Boolean(w.unlimited_forever || (w.unlimited_until && new Date(w.unlimited_until) > now));
        if (isUnlimited) {
          result = { isUnlimited: true, reservedMilliVnd: 0n };
          return;
        }

        // 2. Check user daily spend limit if configured
        const userDailyLimitVnd = env.AI_USER_DAILY_SPEND_LIMIT_VND;
        if (userDailyLimitVnd && userDailyLimitVnd > 0) {
          const userDailyLimitMilliVnd = vndToMilliVnd(userDailyLimitVnd);
          const [userSpendRows]: any = await conn.query(
            `SELECT COALESCE(SUM(ABS(amount_milli_vnd)), 0) as spent
             FROM ai_wallet_transactions
             WHERE user_id = ? AND type IN ('ai_charge', 'unlimited_usage') AND created_at >= CURDATE()`,
            [userId]
          );
          const userSpentToday = BigInt(userSpendRows[0]?.spent || 0);
          if (userSpentToday + estimatedCostMilliVnd > userDailyLimitMilliVnd) {
            throw new Error(`Đã vượt quá hạn mức chi tiêu AI hàng ngày của tài khoản (${formatVnd(userDailyLimitVnd)}/ngày). Vui lòng thử lại vào ngày mai.`);
          }
        }

        const currentBalance = BigInt(w.balance_milli_vnd);
        const currentReserved = BigInt(w.reserved_milli_vnd);
        const availableBalance = currentBalance - currentReserved;

        if (currentBalance <= 0n || availableBalance <= 0n) {
          throw new AiCreditExhaustedError();
        }

        if (availableBalance < estimatedCostMilliVnd) {
          throw new AiCreditInsufficientError(milliVndToVnd(availableBalance), milliVndToVnd(estimatedCostMilliVnd));
        }

        const newReserved = currentReserved + estimatedCostMilliVnd;
        await conn.execute(
          'UPDATE ai_wallets SET reserved_milli_vnd = ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ?',
          [newReserved.toString(), userId]
        );

        const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        await conn.execute(
          `INSERT INTO ai_wallet_transactions
           (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, request_id, idempotency_key, reason, metadata_json, created_at)
           VALUES (?, ?, NULL, 'ai_reserve', ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            txId,
            userId,
            estimatedCostMilliVnd.toString(),
            currentBalance.toString(),
            newReserved.toString(),
            requestId || null,
            idempotencyKey,
            reason || 'Tạm giữ ngân sách gọi AI',
            metadata ? JSON.stringify(metadata) : null,
          ]
        );

        result = {
          isUnlimited: false,
          reservedMilliVnd: estimatedCostMilliVnd,
          reservationTxId: txId,
        };
      });

      if (result) return result;
    }

    // In-memory demo fallback
    const wallet = await this.ensureWallet(userId);
    if (!wallet.aiEnabled) throw new AiDisabledForUserError();

    const now = new Date();
    const isUnlimited = wallet.unlimitedForever || Boolean(wallet.unlimitedUntil && wallet.unlimitedUntil > now);
    if (isUnlimited) return { isUnlimited: true, reservedMilliVnd: 0n };

    const available = wallet.balanceMilliVnd - wallet.reservedMilliVnd;
    if (wallet.balanceMilliVnd <= 0n || available <= 0n) throw new AiCreditExhaustedError();
    if (available < estimatedCostMilliVnd) {
      throw new AiCreditInsufficientError(milliVndToVnd(available), milliVndToVnd(estimatedCostMilliVnd));
    }

    wallet.reservedMilliVnd += estimatedCostMilliVnd;
    wallet.version += 1n;
    wallet.updatedAt = now;

    const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const tx: StoredAiWalletTransaction = {
      id: txId,
      userId,
      actorUserId: null,
      type: 'ai_reserve',
      amountMilliVnd: estimatedCostMilliVnd,
      balanceAfterMilliVnd: wallet.balanceMilliVnd,
      reservedAfterMilliVnd: wallet.reservedMilliVnd,
      requestId,
      idempotencyKey,
      reason: reason || 'Tạm giữ ngân sách gọi AI',
      metadata,
      createdAt: now,
    };
    const list = this.demoTransactions.get(userId) || [];
    list.unshift(tx);
    this.demoTransactions.set(userId, list);

    return {
      isUnlimited: false,
      reservedMilliVnd: estimatedCostMilliVnd,
      reservationTxId: txId,
    };
  }

  /**
   * Reconciles actual token cost after OpenAI response
   */
  public async reconcileCredit(params: {
    userId: string;
    reservedMilliVnd: bigint;
    actualCostMilliVnd: bigint;
    isUnlimited: boolean;
    idempotencyKey: string;
    requestId?: string;
    aiRunId?: string;
    reason?: string;
    metadata?: any;
    success: boolean;
  }): Promise<void> {
    const { userId, reservedMilliVnd, actualCostMilliVnd, isUnlimited, idempotencyKey, requestId, aiRunId, reason, metadata, success } = params;

    if (isUnlimited) {
      // Record unlimited usage ledger record for auditing actual OpenAI spend
      if (actualCostMilliVnd > 0n) {
        if (db.isHealthy()) {
          try {
            const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
            await db.execute(
              `INSERT IGNORE INTO ai_wallet_transactions
               (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, request_id, ai_run_id, idempotency_key, reason, metadata_json, created_at)
               VALUES (?, ?, NULL, 'unlimited_usage', ?, 0, 0, ?, ?, ?, 'Chi phí thực tế phát sinh của tài khoản Vô hạn', ?, NOW(3))`,
              [
                txId,
                userId,
                actualCostMilliVnd.toString(),
                requestId || null,
                aiRunId || null,
                idempotencyKey,
                metadata ? JSON.stringify(metadata) : null,
              ]
            );
          } catch (auditErr: any) {
            console.warn('[AiWalletRepository] Error logging unlimited usage tx:', auditErr.message);
          }
        }
      }
      return;
    }

    if (db.isHealthy()) {
      try {
        await db.withTransaction(async (conn) => {
          // Check if charge already reconciled via scoped user_id + idempotencyKey
          const [existingTx]: any = await conn.query(
            'SELECT id FROM ai_wallet_transactions WHERE user_id = ? AND idempotency_key = ?',
            [userId, idempotencyKey]
          );
          if (existingTx && existingTx.length > 0) {
            return;
          }

          const [rows]: any = await conn.query(
            'SELECT balance_milli_vnd, reserved_milli_vnd FROM ai_wallets WHERE user_id = ? FOR UPDATE',
            [userId]
          );
          if (!rows || rows.length === 0) return;

          const currentBalance = BigInt(rows[0].balance_milli_vnd);
          const currentReserved = BigInt(rows[0].reserved_milli_vnd);

          // Release reservation
          const newReserved = currentReserved >= reservedMilliVnd ? currentReserved - reservedMilliVnd : 0n;

          if (actualCostMilliVnd > 0n) {
            // Deduct actual cost from balance (never below 0)
            const newBalance = currentBalance >= actualCostMilliVnd ? currentBalance - actualCostMilliVnd : 0n;

            await conn.execute(
              'UPDATE ai_wallets SET balance_milli_vnd = ?, reserved_milli_vnd = ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ?',
              [newBalance.toString(), newReserved.toString(), userId]
            );

            const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
            await conn.execute(
              `INSERT INTO ai_wallet_transactions
               (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, request_id, ai_run_id, idempotency_key, reason, metadata_json, created_at)
               VALUES (?, ?, NULL, 'ai_charge', ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
              [
                txId,
                userId,
                (-actualCostMilliVnd).toString(),
                newBalance.toString(),
                newReserved.toString(),
                requestId || null,
                aiRunId || null,
                idempotencyKey,
                reason || (success ? 'Khấu trừ chi phí token AI' : 'Khấu trừ token đã phát sinh khi gọi AI'),
                metadata ? JSON.stringify(metadata) : null,
              ]
            );
          } else {
            // No tokens were consumed: release reserve only
            await conn.execute(
              'UPDATE ai_wallets SET reserved_milli_vnd = ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ?',
              [newReserved.toString(), userId]
            );

            const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
            await conn.execute(
              `INSERT INTO ai_wallet_transactions
               (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, request_id, ai_run_id, idempotency_key, reason, metadata_json, created_at)
               VALUES (?, ?, NULL, 'ai_release', 0, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
              [
                txId,
                userId,
                currentBalance.toString(),
                newReserved.toString(),
                requestId || null,
                aiRunId || null,
                idempotencyKey,
                reason || 'Hoàn lại tạm giữ do không tiêu tốn token',
                metadata ? JSON.stringify(metadata) : null,
              ]
            );
          }
        });
      } catch (err: any) {
        console.error(`[AiWalletRepository] Error reconciling credit for ${userId}:`, err.message);
        try {
          const queueId = 'recq_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await db.execute(
            `INSERT INTO ai_wallet_reconcile_queue
             (id, user_id, idempotency_key, reserved_milli_vnd, actual_cost_milli_vnd, is_unlimited, request_id, ai_run_id, reason, metadata_json, last_error, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(3), NOW(3))
             ON DUPLICATE KEY UPDATE
             retry_count = retry_count + 1,
             last_error = VALUES(last_error),
             updated_at = NOW(3)`,
            [
              queueId,
              userId,
              idempotencyKey,
              reservedMilliVnd.toString(),
              actualCostMilliVnd.toString(),
              isUnlimited ? 1 : 0,
              requestId || null,
              aiRunId || null,
              reason || 'Failed reconcileCredit retry outbox',
              metadata ? JSON.stringify(metadata) : null,
              err.message || 'Transaction error during reconcileCredit',
            ]
          );
        } catch (queueErr: any) {
          console.error('[AiWalletRepository] Failed to write to ai_wallet_reconcile_queue:', queueErr.message);
        }
      }
      return;
    }

    // In-memory demo fallback
    const wallet = await this.ensureWallet(userId);
    wallet.reservedMilliVnd = wallet.reservedMilliVnd >= reservedMilliVnd ? wallet.reservedMilliVnd - reservedMilliVnd : 0n;

    if (actualCostMilliVnd > 0n) {
      wallet.balanceMilliVnd = wallet.balanceMilliVnd >= actualCostMilliVnd ? wallet.balanceMilliVnd - actualCostMilliVnd : 0n;
      wallet.version += 1n;
      wallet.updatedAt = new Date();

      const tx: StoredAiWalletTransaction = {
        id: 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        userId,
        actorUserId: null,
        type: 'ai_charge',
        amountMilliVnd: -actualCostMilliVnd,
        balanceAfterMilliVnd: wallet.balanceMilliVnd,
        reservedAfterMilliVnd: wallet.reservedMilliVnd,
        requestId,
        aiRunId,
        idempotencyKey,
        reason: reason || 'Khấu trừ chi phí token AI',
        metadata,
        createdAt: new Date(),
      };
      const list = this.demoTransactions.get(userId) || [];
      list.unshift(tx);
      this.demoTransactions.set(userId, list);
    }
  }

  /**
   * Admin Manual Top-Up
   */
  public async adminTopUp(params: {
    actorUserId: string;
    targetUserId: string;
    amountVnd: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ balanceVnd: number; transactionId: string }> {
    const { actorUserId, targetUserId, amountVnd, reason, idempotencyKey } = params;
    const amountMilliVnd = vndToMilliVnd(amountVnd);

    if (db.isHealthy()) {
      let result: { balanceVnd: number; transactionId: string } | null = null;
      await db.withTransaction(async (conn) => {
        // Idempotency check
        const [existingTx]: any = await conn.query(
          'SELECT id, balance_after_milli_vnd FROM ai_wallet_transactions WHERE idempotency_key = ?',
          [idempotencyKey]
        );
        if (existingTx && existingTx.length > 0) {
          result = {
            balanceVnd: milliVndToVnd(existingTx[0].balance_after_milli_vnd),
            transactionId: existingTx[0].id,
          };
          return;
        }

        const [rows]: any = await conn.query(
          'SELECT balance_milli_vnd, reserved_milli_vnd FROM ai_wallets WHERE user_id = ? FOR UPDATE',
          [targetUserId]
        );

        let currentBalance = 0n;
        let currentReserved = 0n;
        if (rows && rows.length > 0) {
          currentBalance = BigInt(rows[0].balance_milli_vnd);
          currentReserved = BigInt(rows[0].reserved_milli_vnd);
        } else {
          // Initialize wallet
          await conn.execute(
            'INSERT INTO ai_wallets (user_id, balance_milli_vnd, reserved_milli_vnd, ai_enabled, unlimited_forever, version, created_at, updated_at) VALUES (?, 0, 0, TRUE, FALSE, 0, NOW(3), NOW(3))',
            [targetUserId]
          );
        }

        const newBalance = currentBalance + amountMilliVnd;
        await conn.execute(
          'UPDATE ai_wallets SET balance_milli_vnd = ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ?',
          [newBalance.toString(), targetUserId]
        );

        const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        await conn.execute(
          `INSERT INTO ai_wallet_transactions
           (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, idempotency_key, reason, created_at)
           VALUES (?, ?, ?, 'admin_topup', ?, ?, ?, ?, ?, NOW(3))`,
          [
            txId,
            targetUserId,
            actorUserId,
            amountMilliVnd.toString(),
            newBalance.toString(),
            currentReserved.toString(),
            idempotencyKey,
            reason,
          ]
        );

        // Record audit log
        await conn.execute(
          `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, result, safe_metadata_json, created_at)
           VALUES (?, ?, 'ai_wallet_topup', 'user', ?, 'success', ?, NOW(3))`,
          [
            'audit_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            actorUserId,
            targetUserId,
            JSON.stringify({ amountVnd, previousBalanceVnd: milliVndToVnd(currentBalance), newBalanceVnd: milliVndToVnd(newBalance), reason }),
          ]
        );

        result = {
          balanceVnd: milliVndToVnd(newBalance),
          transactionId: txId,
        };
      });

      if (result) return result;
    }

    // In-memory demo fallback
    const wallet = await this.ensureWallet(targetUserId);
    const newBalance = wallet.balanceMilliVnd + amountMilliVnd;
    wallet.balanceMilliVnd = newBalance;
    wallet.version += 1n;
    wallet.updatedAt = new Date();

    const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const tx: StoredAiWalletTransaction = {
      id: txId,
      userId: targetUserId,
      actorUserId,
      type: 'admin_topup',
      amountMilliVnd,
      balanceAfterMilliVnd: newBalance,
      reservedAfterMilliVnd: wallet.reservedMilliVnd,
      idempotencyKey,
      reason,
      createdAt: new Date(),
    };
    const list = this.demoTransactions.get(targetUserId) || [];
    list.unshift(tx);
    this.demoTransactions.set(targetUserId, list);

    return {
      balanceVnd: milliVndToVnd(newBalance),
      transactionId: txId,
    };
  }

  /**
   * Admin Manual Deduction (prevents negative balance)
   */
  public async adminDeduct(params: {
    actorUserId: string;
    targetUserId: string;
    amountVnd: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ balanceVnd: number; transactionId: string }> {
    const { actorUserId, targetUserId, amountVnd, reason, idempotencyKey } = params;
    const amountMilliVnd = vndToMilliVnd(amountVnd);

    if (db.isHealthy()) {
      let result: { balanceVnd: number; transactionId: string } | null = null;
      await db.withTransaction(async (conn) => {
        // Idempotency check
        const [existingTx]: any = await conn.query(
          'SELECT id, balance_after_milli_vnd FROM ai_wallet_transactions WHERE idempotency_key = ?',
          [idempotencyKey]
        );
        if (existingTx && existingTx.length > 0) {
          result = {
            balanceVnd: milliVndToVnd(existingTx[0].balance_after_milli_vnd),
            transactionId: existingTx[0].id,
          };
          return;
        }

        const [rows]: any = await conn.query(
          'SELECT balance_milli_vnd, reserved_milli_vnd FROM ai_wallets WHERE user_id = ? FOR UPDATE',
          [targetUserId]
        );

        if (!rows || rows.length === 0) {
          throw new Error('Không tìm thấy ví của người dùng.');
        }

        const currentBalance = BigInt(rows[0].balance_milli_vnd);
        const currentReserved = BigInt(rows[0].reserved_milli_vnd);

        if (currentBalance < amountMilliVnd) {
          throw new Error(`Số dư hiện tại (${formatVnd(milliVndToVnd(currentBalance))}) nhỏ hơn số tiền cần trừ (${formatVnd(amountVnd)}). Hệ thống không cho phép số dư âm.`);
        }

        const newBalance = currentBalance - amountMilliVnd;
        if (newBalance < currentReserved) {
          throw new Error(`Không thể trừ tiền: Số dư sau khi trừ (${formatVnd(milliVndToVnd(newBalance))}) sẽ nhỏ hơn số tiền đang bị tạm giữ cho tác vụ AI (${formatVnd(milliVndToVnd(currentReserved))}).`);
        }

        await conn.execute(
          'UPDATE ai_wallets SET balance_milli_vnd = ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ?',
          [newBalance.toString(), targetUserId]
        );

        const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        await conn.execute(
          `INSERT INTO ai_wallet_transactions
           (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, idempotency_key, reason, created_at)
           VALUES (?, ?, ?, 'admin_deduction', ?, ?, ?, ?, ?, NOW(3))`,
          [
            txId,
            targetUserId,
            actorUserId,
            (-amountMilliVnd).toString(),
            newBalance.toString(),
            currentReserved.toString(),
            idempotencyKey,
            reason,
          ]
        );

        // Record audit log
        await conn.execute(
          `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, result, safe_metadata_json, created_at)
           VALUES (?, ?, 'ai_wallet_deduct', 'user', ?, 'success', ?, NOW(3))`,
          [
            'audit_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            actorUserId,
            targetUserId,
            JSON.stringify({ amountVnd, previousBalanceVnd: milliVndToVnd(currentBalance), newBalanceVnd: milliVndToVnd(newBalance), reason }),
          ]
        );

        result = {
          balanceVnd: milliVndToVnd(newBalance),
          transactionId: txId,
        };
      });

      if (result) return result;
    }

    // In-memory demo fallback
    const wallet = await this.ensureWallet(targetUserId);
    if (wallet.balanceMilliVnd < amountMilliVnd) {
      throw new Error(`Số dư hiện tại (${formatVnd(milliVndToVnd(wallet.balanceMilliVnd))}) nhỏ hơn số tiền cần trừ (${formatVnd(amountVnd)}).`);
    }

    const newBalance = wallet.balanceMilliVnd - amountMilliVnd;
    if (newBalance < wallet.reservedMilliVnd) {
      throw new Error(`Không thể trừ tiền: Số dư sau khi trừ (${formatVnd(milliVndToVnd(newBalance))}) sẽ nhỏ hơn số tiền đang bị tạm giữ (${formatVnd(milliVndToVnd(wallet.reservedMilliVnd))}).`);
    }
    wallet.balanceMilliVnd = newBalance;
    wallet.version += 1n;
    wallet.updatedAt = new Date();

    const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const tx: StoredAiWalletTransaction = {
      id: txId,
      userId: targetUserId,
      actorUserId,
      type: 'admin_deduction',
      amountMilliVnd: -amountMilliVnd,
      balanceAfterMilliVnd: newBalance,
      reservedAfterMilliVnd: wallet.reservedMilliVnd,
      idempotencyKey,
      reason,
      createdAt: new Date(),
    };
    const list = this.demoTransactions.get(targetUserId) || [];
    list.unshift(tx);
    this.demoTransactions.set(targetUserId, list);

    return {
      balanceVnd: milliVndToVnd(newBalance),
      transactionId: txId,
    };
  }

  /**
   * Admin sets unlimited budget status
   */
  public async adminSetUnlimited(params: {
    actorUserId: string;
    targetUserId: string;
    unlimitedForever: boolean;
    unlimitedUntil?: string | null;
    reason: string;
    idempotencyKey: string;
  }): Promise<void> {
    const { actorUserId, targetUserId, unlimitedForever, unlimitedUntil, reason } = params;
    const untilDate = unlimitedUntil ? new Date(unlimitedUntil) : null;

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          'UPDATE ai_wallets SET unlimited_forever = ?, unlimited_until = ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ?',
          [unlimitedForever ? 1 : 0, untilDate, targetUserId]
        );

        await conn.execute(
          `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, result, safe_metadata_json, created_at)
           VALUES (?, ?, 'ai_wallet_unlimited_change', 'user', ?, 'success', ?, NOW(3))`,
          [
            'audit_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            actorUserId,
            targetUserId,
            JSON.stringify({ unlimitedForever, unlimitedUntil, reason }),
          ]
        );
      });
      return;
    }

    const wallet = await this.ensureWallet(targetUserId);
    wallet.unlimitedForever = unlimitedForever;
    wallet.unlimitedUntil = untilDate;
    wallet.version += 1n;
    wallet.updatedAt = new Date();
  }

  /**
   * Admin sets AI enabled/disabled status
   */
  public async adminSetStatus(params: {
    actorUserId: string;
    targetUserId: string;
    aiEnabled: boolean;
    reason: string;
    idempotencyKey: string;
  }): Promise<void> {
    const { actorUserId, targetUserId, aiEnabled, reason } = params;

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          'UPDATE ai_wallets SET ai_enabled = ?, version = version + 1, updated_at = NOW(3) WHERE user_id = ?',
          [aiEnabled ? 1 : 0, targetUserId]
        );

        await conn.execute(
          `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, result, safe_metadata_json, created_at)
           VALUES (?, ?, 'ai_wallet_status_change', 'user', ?, 'success', ?, NOW(3))`,
          [
            'audit_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            actorUserId,
            targetUserId,
            JSON.stringify({ aiEnabled, reason }),
          ]
        );
      });
      return;
    }

    const wallet = await this.ensureWallet(targetUserId);
    wallet.aiEnabled = aiEnabled;
    wallet.version += 1n;
    wallet.updatedAt = new Date();
  }

  /**
   * Retrieves paginated transaction history
   */
  public async getTransactions(
    userId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ transactions: AiWalletTransaction[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(options?.limit || 20, 1), 100);

    if (db.isHealthy()) {
      try {
        let sql = `
          SELECT tx.id, tx.user_id, tx.actor_user_id, tx.type, tx.amount_milli_vnd,
                 tx.balance_after_milli_vnd, tx.reserved_after_milli_vnd, tx.request_id,
                 tx.ai_run_id, tx.registration_code_id, tx.idempotency_key, tx.reason,
                 tx.metadata_json, tx.created_at, u.email as actor_email
          FROM ai_wallet_transactions tx
          LEFT JOIN users u ON tx.actor_user_id = u.id
          WHERE tx.user_id = ?
        `;
        const params: any[] = [userId];

        if (options?.cursor) {
          sql += ' AND tx.created_at < ?';
          params.push(new Date(options.cursor));
        }

        sql += ' ORDER BY tx.created_at DESC LIMIT ?';
        params.push(limit + 1);

        const rows = await db.query<any>(sql, params);
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? new Date(items[items.length - 1].created_at).toISOString() : undefined;

        const transactions: AiWalletTransaction[] = items.map((r) => {
          const amt = BigInt(r.amount_milli_vnd);
          const bal = BigInt(r.balance_after_milli_vnd);
          const amtVnd = milliVndToVnd(amt);
          return {
            id: r.id,
            userId: r.user_id,
            actorUserId: r.actor_user_id || null,
            actorEmail: r.actor_email || null,
            type: r.type,
            amountMilliVnd: r.amount_milli_vnd.toString(),
            amountVnd: amtVnd,
            amountFormatted: (amt >= 0n ? '+' : '') + formatVnd(amtVnd),
            balanceAfterMilliVnd: r.balance_after_milli_vnd.toString(),
            balanceAfterVnd: milliVndToVnd(bal),
            reservedAfterMilliVnd: (r.reserved_after_milli_vnd || 0).toString(),
            requestId: r.request_id || null,
            aiRunId: r.ai_run_id || null,
            registrationCodeId: r.registration_code_id || null,
            idempotencyKey: r.idempotency_key,
            reason: r.reason || null,
            metadata: typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json) : r.metadata_json,
            createdAt: new Date(r.created_at).toISOString(),
          };
        });

        return { transactions, nextCursor };
      } catch (err: any) {
        console.error(`[AiWalletRepository] Error fetching transactions for ${userId}:`, err.message);
      }
    }

    // In-memory demo fallback
    const list = this.demoTransactions.get(userId) || [];
    const filtered = options?.cursor
      ? list.filter((t) => t.createdAt.toISOString() < (options.cursor as string))
      : list;
    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : undefined;

    const transactions: AiWalletTransaction[] = items.map((t) => {
      const amtVnd = milliVndToVnd(t.amountMilliVnd);
      return {
        id: t.id,
        userId: t.userId,
        actorUserId: t.actorUserId || null,
        type: t.type,
        amountMilliVnd: t.amountMilliVnd.toString(),
        amountVnd: amtVnd,
        amountFormatted: (t.amountMilliVnd >= 0n ? '+' : '') + formatVnd(amtVnd),
        balanceAfterMilliVnd: t.balanceAfterMilliVnd.toString(),
        balanceAfterVnd: milliVndToVnd(t.balanceAfterMilliVnd),
        reservedAfterMilliVnd: t.reservedAfterMilliVnd.toString(),
        requestId: t.requestId || null,
        aiRunId: t.aiRunId || null,
        registrationCodeId: t.registrationCodeId || null,
        idempotencyKey: t.idempotencyKey,
        reason: t.reason || null,
        metadata: t.metadata,
        createdAt: t.createdAt.toISOString(),
      };
    });

    return { transactions, nextCursor };
  }

  /**
   * Durable Worker: Processes pending reconciliation outbox items with exponential backoff
   */
  public async processReconcileQueue(batchSize = 20): Promise<{ processedCount: number; resolvedCount: number; failedCount: number }> {
    if (!db.isHealthy()) {
      return { processedCount: 0, resolvedCount: 0, failedCount: 0 };
    }

    let processedCount = 0;
    let resolvedCount = 0;
    let failedCount = 0;

    try {
      const rows = await db.query<any>(
        `SELECT id, user_id, idempotency_key, reserved_milli_vnd, actual_cost_milli_vnd, is_unlimited, request_id, ai_run_id, reason, metadata_json, retry_count
         FROM ai_wallet_reconcile_queue
         WHERE status = 'pending' OR (status = 'processing' AND updated_at < DATE_SUB(NOW(3), INTERVAL 5 MINUTE))
         ORDER BY created_at ASC
         LIMIT ?`,
        [batchSize]
      );

      for (const row of rows) {
        processedCount++;
        // Claim row
        const claimResult: any = await db.execute(
          `UPDATE ai_wallet_reconcile_queue
           SET status = 'processing', updated_at = NOW(3)
           WHERE id = ? AND status IN ('pending', 'processing')`,
          [row.id]
        );

        if (!claimResult || claimResult.affectedRows === 0) {
          continue;
        }

        try {
          await this.reconcileCredit({
            userId: row.user_id,
            reservedMilliVnd: BigInt(row.reserved_milli_vnd || '0'),
            actualCostMilliVnd: BigInt(row.actual_cost_milli_vnd || '0'),
            isUnlimited: Boolean(row.is_unlimited),
            idempotencyKey: row.idempotency_key,
            requestId: row.request_id || undefined,
            aiRunId: row.ai_run_id || undefined,
            reason: row.reason || 'Reconciled via outbox worker',
            metadata: row.metadata_json ? (typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json) : undefined,
            success: true,
          });

          await db.execute(
            `UPDATE ai_wallet_reconcile_queue
             SET status = 'resolved', last_error = NULL, updated_at = NOW(3)
             WHERE id = ?`,
            [row.id]
          );
          resolvedCount++;
        } catch (execErr: any) {
          failedCount++;
          const nextRetry = (row.retry_count || 0) + 1;
          const finalStatus = nextRetry >= 5 ? 'failed' : 'pending';
          await db.execute(
            `UPDATE ai_wallet_reconcile_queue
             SET status = ?, retry_count = ?, last_error = ?, updated_at = NOW(3)
             WHERE id = ?`,
            [finalStatus, nextRetry, execErr.message || 'Worker reconciliation retry failed', row.id]
          );
        }
      }
    } catch (err: any) {
      console.warn('[AiWalletRepository] Error running reconcile outbox worker:', err.message);
    }

    return { processedCount, resolvedCount, failedCount };
  }
}

export const aiWalletRepo = AiWalletRepository.getInstance();
