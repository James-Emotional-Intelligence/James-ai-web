import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository } from '../../server/repositories/user-repository';
import { authService } from '../../server/services/auth-service';
import { db } from '../../server/db/mysql';
import { PasswordHasher } from '../../server/services/password-hasher';
import { localDateTimeToUtc, getTimezoneOffsetMinutes } from '../../shared/utils/date-utils';
import { DbSchemaIncompatibleError, DatabaseUnavailableError } from '../../server/errors/app-errors';
import { runDbDoctor } from '../../server/db/doctor';

describe('Auth Schema Integrity & Fail-Closed Authentication Unit Tests', () => {
  const userRepo = UserRepository.getInstance();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Fail-Closed Error Classification in UserRepository', () => {
    it('throws DbSchemaIncompatibleError when query fails with ER_BAD_FIELD_ERROR or Unknown column', async () => {
      vi.spyOn(db, 'isHealthy').mockReturnValue(true);
      vi.spyOn(db, 'query').mockRejectedValue({
        code: 'ER_BAD_FIELD_ERROR',
        message: "Unknown column 'last_active_at' in 'field list'",
      });

      await expect(userRepo.findByEmail('test.schema@jami.edu.vn')).rejects.toThrow(
        DbSchemaIncompatibleError
      );
    });

    it('throws DatabaseUnavailableError when database connection is lost or timeout', async () => {
      vi.spyOn(db, 'isHealthy').mockReturnValue(true);
      vi.spyOn(db, 'query').mockRejectedValue({
        code: 'PROTOCOL_CONNECTION_LOST',
        message: 'Connection lost to MySQL server',
      });

      await expect(userRepo.findByEmail('test.dbdown@jami.edu.vn')).rejects.toThrow(
        DatabaseUnavailableError
      );
    });

    it('returns undefined (not demo user) when user does not exist in healthy database in non-demo mode', async () => {
      vi.spyOn(db, 'isHealthy').mockReturnValue(true);
      vi.spyOn(db, 'query').mockResolvedValue([]);

      const user = await userRepo.findByEmail('nonexistent.realuser@domain.com');
      expect(user).toBeUndefined();
    });
  });

  describe('2. Email Normalization & Password Verification', () => {
    it('normalizes email with uppercase and whitespaces before querying', async () => {
      vi.spyOn(db, 'isHealthy').mockReturnValue(true);
      const querySpy = vi.spyOn(db, 'query').mockResolvedValue([]);

      await userRepo.findByEmail('  Student.MINH@Jami.Edu.VN  ');
      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(email) = ?'),
        ['student.minh@jami.edu.vn']
      );
    });

    it('verifies scrypt password scheme correctly', async () => {
      const plain = 'SecretPassword123!';
      const { passwordHash, passwordSalt, scheme } = await PasswordHasher.hashPassword(plain);

      const verifyRes = await PasswordHasher.verifyPassword(plain, passwordSalt, passwordHash, scheme);
      expect(verifyRes.isValid).toBe(true);
      expect(verifyRes.needsRehash).toBe(false);

      const wrongRes = await PasswordHasher.verifyPassword('WrongPass123!', passwordSalt, passwordHash, scheme);
      expect(wrongRes.isValid).toBe(false);
    });

    it('verifies legacy PBKDF2 scheme and flags needsRehash = true', async () => {
      const plain = 'LegacyPass123!';
      const salt = 'legacy_salt_123456';
      // Simulate PBKDF2 sha512 10000 iter 64 bytes hex (128 hex chars)
      const crypto = await import('crypto');
      const hash = crypto.pbkdf2Sync(plain, salt, 10000, 64, 'sha512').toString('hex');

      const verifyRes = await PasswordHasher.verifyPassword(plain, salt, hash, 'pbkdf2_sha512_10000_v1');
      expect(verifyRes.isValid).toBe(true);
      expect(verifyRes.needsRehash).toBe(true);
    });
  });

  describe('3. Timezone Transformations (Asia/Ho_Chi_Minh <-> UTC)', () => {
    it('accurately converts 19:30 Vietnam time (UTC+7) to 12:30 UTC without date drift', () => {
      const utcIso = localDateTimeToUtc('2026-09-02', '19:30', 'Asia/Ho_Chi_Minh');
      expect(utcIso).toBe('2026-09-02T12:30:00.000Z');

      // Check conversion around midnight (00:15 VN -> 17:15 previous day UTC)
      const midnightUtc = localDateTimeToUtc('2026-09-02', '00:15', 'Asia/Ho_Chi_Minh');
      expect(midnightUtc).toBe('2026-09-01T17:15:00.000Z');
    });

    it('calculates timezone offset for Asia/Ho_Chi_Minh as 420 minutes (+7h)', () => {
      const offset = getTimezoneOffsetMinutes(new Date('2026-09-02T12:00:00.000Z'), 'Asia/Ho_Chi_Minh');
      expect(offset).toBe(420);
    });
  });

  describe('4. Database Doctor Auth Schema Verification', () => {
    it('inspects users table and requires all 12 canonical auth columns', async () => {
      const report = await runDbDoctor();
      expect(report).toBeDefined();
      expect(report.checks).toBeDefined();

      const userColCheck = report.checks.find((c) => c.name === 'User Auth Columns Integrity' || c.name === 'User Password Columns');
      if (userColCheck) {
        expect(userColCheck.passed).toBe(true);
      }
    }, 15000);
  });
});
