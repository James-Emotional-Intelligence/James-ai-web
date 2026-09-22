import { describe, it, expect, beforeEach } from 'vitest';
import {
  registrationCodeService,
  InvalidRegistrationCodeError,
} from '../../server/services/registration-code-service';

describe('RegistrationCodeService Unit Tests (HMAC-SHA256 & Atomic Redemption)', () => {
  beforeEach(() => {
    registrationCodeService.resetDemoData();
  });

  it('generates high-entropy 128-bit plain code formatted as JAMI-XXXX-XXXX-...', () => {
    const code = registrationCodeService.generatePlainCode();
    expect(code).toMatch(/^JAMI-[A-F0-9]{4}(?:-[A-F0-9]{4}){7}$/);
  });

  it('computes consistent HMAC-SHA256 hash using pepper', () => {
    const plainCode = 'JAMI-ABCD-1234-EF56-7890';
    const hash1 = registrationCodeService.hashCode(plainCode);
    const hash2 = registrationCodeService.hashCode(plainCode.toLowerCase()); // case-insensitive
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // 256 bits in hex
  });

  it('creates and lists registration codes (storing only hash & prefix)', async () => {
    const created = await registrationCodeService.createCode('admin_1', {
      rewardType: 'credit',
      creditVnd: 50000,
      maxRedemptions: 3,
      note: 'Ưu đãi khối 12',
    });

    expect(created.plainCode).toBeDefined();
    expect(created.rewardType).toBe('credit');
    expect(created.creditVnd).toBe(50000);
    expect(created.maxRedemptions).toBe(3);

    const codes = await registrationCodeService.listCodes();
    expect(codes.length).toBeGreaterThanOrEqual(1);
    const found = codes.find((c) => c.id === created.id);
    expect(found).toBeDefined();
    expect(found?.codePrefix).toBeDefined();
    expect((found as any).plainCode).toBeUndefined(); // never expose plain code in listings
  });

  it('redeems credit code and marks exhausted after max redemptions', async () => {
    const created = await registrationCodeService.createCode('admin_1', {
      rewardType: 'credit',
      creditVnd: 50000,
      maxRedemptions: 2,
    });

    const hash = registrationCodeService.hashCode(created.plainCode);

    // First redemption
    const r1 = await registrationCodeService.redeemInTransaction(null, hash, 'user_1');
    expect(r1.rewardType).toBe('credit');
    expect(r1.creditMilliVnd).toBe(50000000n);

    // Second redemption
    const r2 = await registrationCodeService.redeemInTransaction(null, hash, 'user_2');
    expect(r2.rewardType).toBe('credit');

    // Third redemption should fail with InvalidRegistrationCodeError (exhausted)
    await expect(
      registrationCodeService.redeemInTransaction(null, hash, 'user_3')
    ).rejects.toThrow(InvalidRegistrationCodeError);
  });

  it('prevents redemption of revoked codes', async () => {
    const created = await registrationCodeService.createCode('admin_1', {
      rewardType: 'unlimited',
      unlimitedForever: true,
      maxRedemptions: 5,
    });

    await registrationCodeService.revokeCode('admin_1', created.id, 'Chương trình kết thúc sớm');

    const hash = registrationCodeService.hashCode(created.plainCode);
    await expect(
      registrationCodeService.redeemInTransaction(null, hash, 'user_test')
    ).rejects.toThrow(InvalidRegistrationCodeError);
  });
});
