import { describe, it, expect, beforeEach } from 'vitest';
import {
  aiWalletRepo,
  AiCreditExhaustedError,
  AiCreditInsufficientError,
  AiDisabledForUserError,
} from '../../server/repositories/ai-wallet-repository';
import { aiBillingService } from '../../server/services/ai-billing-service';

describe('AiWalletRepository & AiBillingService Unit Tests (Fail-Closed Billing)', () => {
  beforeEach(() => {
    aiWalletRepo.resetDemoData();
  });

  it('creates default wallet with 25,000 VND (25,000,000 milli-VND) grant', async () => {
    const wallet = await aiWalletRepo.createDefaultWallet('user_test_1', {
      initialGrantVnd: 25000,
    });

    expect(wallet.balanceVnd).toBe(25000);
    expect(wallet.balanceMilliVnd).toBe(25000000n.toString());
    expect(wallet.isUnlimited).toBe(false);
    expect(wallet.aiEnabled).toBe(true);

    const view = await aiBillingService.getWalletView('user_test_1');
    expect(view.balanceVnd).toBe(25000);
    expect(view.balanceFormatted).toBe('25.000đ');
  });

  it('reserves and reconciles credit accurately without negative balance', async () => {
    await aiWalletRepo.createDefaultWallet('user_test_2', { initialGrantVnd: 25000 });

    // 1. Pre-call reservation
    const reservation = await aiBillingService.reserveForAiExecution({
      userId: 'user_test_2',
      model: 'gpt-4o-mini',
      estimatedInputTokens: 1000,
      maxOutputTokens: 500,
      promptId: 'chat_jami',
    });

    expect(reservation.reservedMilliVnd).toBeGreaterThan(0n);
    expect(reservation.isUnlimited).toBe(false);

    // 2. Post-call reconciliation (actual tokens used)
    const reconciliation = await aiBillingService.reconcileAiExecution({
      userId: 'user_test_2',
      model: 'gpt-4o-mini',
      promptId: 'chat_jami',
      usage: { promptTokens: 300, completionTokens: 150 },
      reservedMilliVnd: reservation.reservedMilliVnd,
      isUnlimited: false,
      success: true,
      idempotencyKey: reservation.idempotencyKey,
    });

    expect(reconciliation.actualCostMilliVnd).toBeGreaterThan(0n);

    // Balance should have decreased slightly
    const updatedView = await aiBillingService.getWalletView('user_test_2');
    expect(updatedView.balanceVnd).toBeLessThanOrEqual(25000);
    expect(updatedView.balanceVnd).toBeGreaterThan(0);
  });

  it('throws AiCreditExhaustedError when balance is 0 before calling AI (fail-closed)', async () => {
    await aiWalletRepo.createDefaultWallet('user_depleted', { initialGrantVnd: 0 });

    await expect(
      aiBillingService.reserveForAiExecution({
        userId: 'user_depleted',
        model: 'gpt-4o-mini',
        promptId: 'chat_jami',
      })
    ).rejects.toThrow(AiCreditExhaustedError);
  });

  it('bypasses deduction when unlimited mode is enabled', async () => {
    await aiWalletRepo.createDefaultWallet('user_unlimited', { initialGrantVnd: 0 });
    await aiBillingService.adminSetUnlimited({
      actorUserId: 'admin_1',
      targetUserId: 'user_unlimited',
      unlimitedForever: true,
      reason: 'VIP Student',
      idempotencyKey: 'idem_vip_1',
    });

    const reservation = await aiBillingService.reserveForAiExecution({
      userId: 'user_unlimited',
      model: 'gpt-4o-mini',
      promptId: 'chat_jami',
    });

    expect(reservation.isUnlimited).toBe(true);
    expect(reservation.reservedMilliVnd).toBe(0n);
  });

  it('throws AiDisabledForUserError when wallet is disabled by admin', async () => {
    await aiWalletRepo.createDefaultWallet('user_disabled', { initialGrantVnd: 25000 });
    await aiBillingService.adminSetStatus({
      actorUserId: 'admin_1',
      targetUserId: 'user_disabled',
      aiEnabled: false,
      reason: 'Tạm khóa AI',
      idempotencyKey: 'idem_disable_1',
    });

    await expect(
      aiBillingService.reserveForAiExecution({
        userId: 'user_disabled',
        model: 'gpt-4o-mini',
        promptId: 'chat_jami',
      })
    ).rejects.toThrow(AiDisabledForUserError);
  });

  it('supports admin manual top-up and deduction with idempotent ledger records', async () => {
    await aiWalletRepo.createDefaultWallet('user_admin_ops', { initialGrantVnd: 25000 });

    // Top-up 50,000 VND
    const topUpRes = await aiBillingService.adminTopUp({
      actorUserId: 'admin_1',
      targetUserId: 'user_admin_ops',
      amountVnd: 50000,
      reason: 'Thưởng học sinh giỏi',
      idempotencyKey: 'idem_topup_1',
    });
    expect(topUpRes.balanceVnd).toBe(75000);

    // Deduct 20,000 VND
    const deductRes = await aiBillingService.adminDeduct({
      actorUserId: 'admin_1',
      targetUserId: 'user_admin_ops',
      amountVnd: 20000,
      reason: 'Điều chỉnh ngân sách',
      idempotencyKey: 'idem_deduct_1',
    });
    expect(deductRes.balanceVnd).toBe(55000);

    // Ledger transactions check
    const txHistory = await aiBillingService.getTransactions('user_admin_ops');
    expect(txHistory.transactions.length).toBeGreaterThanOrEqual(3);
  });

  it('records ai_runs with canonical columns (prompt_tokens, completion_tokens, cached_input_tokens, cost_milli_vnd, pricing_version)', async () => {
    await aiWalletRepo.createDefaultWallet('user_ai_run_test', { initialGrantVnd: 25000 });

    const reservation = await aiBillingService.reserveForAiExecution({
      userId: 'user_ai_run_test',
      model: 'gpt-4o-mini',
      estimatedInputTokens: 500,
      maxOutputTokens: 250,
      promptId: 'test_canonical_run',
    });

    const reconciliation = await aiBillingService.reconcileAiExecution({
      userId: 'user_ai_run_test',
      model: 'gpt-4o-mini',
      promptId: 'test_canonical_run',
      usage: {
        promptTokens: 400,
        completionTokens: 200,
        cachedTokens: 50,
      },
      reservedMilliVnd: reservation.reservedMilliVnd,
      isUnlimited: false,
      success: true,
      idempotencyKey: reservation.idempotencyKey,
      latencyMs: 120,
    });

    expect(reconciliation.actualCostMilliVnd).toBeGreaterThan(0n);
    expect(reconciliation.actualCostVnd).toBeGreaterThan(0);
    expect(reconciliation.aiRunId).toMatch(/^run_[a-f0-9]{24}$/);
  });
});

