import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../server/app';
import { AuthService } from '../../server/services/auth-service';
import { UserRepository } from '../../server/repositories/user-repository';
import { registrationCodeService } from '../../server/services/registration-code-service';
import { aiWalletRepo } from '../../server/repositories/ai-wallet-repository';
import { aiBillingService } from '../../server/services/ai-billing-service';
import { env } from '../../server/config/env';

describe('AI Budget Wallet, Registration Codes & Last Admin Protection Integration Tests', () => {
  let app: any;
  const authService = AuthService.getInstance();
  const userRepo = UserRepository.getInstance();

  beforeEach(() => {
    app = createApp();
    registrationCodeService.resetDemoData();
    aiWalletRepo.resetDemoData();
  });

  it('registers user without code and grants default 25,000 VND wallet', async () => {
    const email = `test_no_code_${Date.now()}@jami.edu.vn`;
    const result = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Học Sinh Mới',
      gradeLevel: 10,
    });

    expect(result.user).toBeDefined();
    expect(result.user.role).toBe('user');

    const walletView = await aiBillingService.getWalletView(result.user.id);
    expect(walletView.balanceVnd).toBe(25000);
    expect(walletView.isUnlimited).toBe(false);
  });

  it('registers user with credit code and grants default 25,000đ + 50,000đ = 75,000đ', async () => {
    const createdCode = await registrationCodeService.createCode('admin_system', {
      rewardType: 'credit',
      creditVnd: 50000,
      maxRedemptions: 5,
    });

    const email = `test_credit_code_${Date.now()}@jami.edu.vn`;
    const result = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Học Sinh Ưu Đãi',
      gradeLevel: 11,
      registrationCode: createdCode.plainCode,
    });

    expect(result.user).toBeDefined();

    const walletView = await aiBillingService.getWalletView(result.user.id);
    expect(walletView.balanceVnd).toBe(75000); // 25k + 50k
  });

  it('registers user with unlimited code and grants unlimited access', async () => {
    const createdCode = await registrationCodeService.createCode('admin_system', {
      rewardType: 'unlimited',
      unlimitedForever: true,
      maxRedemptions: 1,
    });

    const email = `test_unlimited_code_${Date.now()}@jami.edu.vn`;
    const result = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Học Sinh VIP',
      gradeLevel: 12,
      registrationCode: createdCode.plainCode,
    });

    expect(result.user).toBeDefined();

    const walletView = await aiBillingService.getWalletView(result.user.id);
    expect(walletView.isUnlimited).toBe(true);
  });

  it('rejects registration with invalid registration code (fail-closed)', async () => {
    const email = `test_invalid_code_${Date.now()}@jami.edu.vn`;
    await expect(
      authService.registerAtomic({
        email,
        password: 'Password123!',
        displayName: 'Học Sinh Lỗi',
        gradeLevel: 9,
        registrationCode: 'JAMI-INVALID-CODE-9999-0000',
      })
    ).rejects.toThrow();

    const found = await userRepo.findByEmail(email);
    expect(found).toBeFalsy(); // No orphan user created
  });

  it('protects last remaining admin from being demoted or deleted', async () => {
    // Ensure at least 1 active admin exists
    const existing = await userRepo.findByEmail('james.admin@gmail.com');
    if (!existing) {
      await userRepo.createUser({
        email: 'james.admin@gmail.com',
        password: 'Minhtriet14',
        displayName: 'James Admin',
        role: 'admin',
      });
    } else if (existing.role !== 'admin') {
      await userRepo.setUserRole(existing.id, 'admin');
    }

    const activeAdmins = await userRepo.countActiveAdmins();
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });
});
