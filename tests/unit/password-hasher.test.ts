import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { PasswordHasher } from '../../server/services/password-hasher';

describe('PasswordHasher Comprehensive Multi-Scheme Security Tests', () => {
  it('hashes password with Scrypt and verifies successfully (needsRehash = false)', async () => {
    const password = 'CorrectScryptPassword123!';
    const { passwordHash, passwordSalt, scheme } = await PasswordHasher.hashPassword(password);

    expect(scheme).toBe('scrypt');
    expect(passwordHash).toMatch(/^scrypt:\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);

    const result = await PasswordHasher.verifyPassword(password, passwordSalt, passwordHash, scheme);
    expect(result.isValid).toBe(true);
    expect(result.needsRehash).toBe(false);
    expect(result.detectedScheme).toBe('scrypt');
  });

  it('rejects incorrect password with Scrypt hash', async () => {
    const password = 'CorrectScryptPassword123!';
    const { passwordHash, passwordSalt, scheme } = await PasswordHasher.hashPassword(password);

    const result = await PasswordHasher.verifyPassword('WrongPassword123!', passwordSalt, passwordHash, scheme);
    expect(result.isValid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it('verifies legacy PBKDF2-HMAC-SHA512 (10,000 iterations, 64 bytes) hash and flags needsRehash = true', async () => {
    // Exact legacy formula used in earlier versions of the project
    const password = 'LegacyStudentPassword2024!';
    const salt = crypto.randomBytes(16).toString('hex');
    const legacyPBKDF2Hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');

    // 128 hex chars
    expect(legacyPBKDF2Hash).toHaveLength(128);

    // Verify with scheme provided
    const resultWithScheme = await PasswordHasher.verifyPassword(
      password,
      salt,
      legacyPBKDF2Hash,
      'pbkdf2_sha512_10000_v1'
    );
    expect(resultWithScheme.isValid).toBe(true);
    expect(resultWithScheme.needsRehash).toBe(true);
    expect(resultWithScheme.detectedScheme).toBe('pbkdf2_sha512_10000_v1');

    // Verify with auto-detection without scheme
    const resultAutoDetect = await PasswordHasher.verifyPassword(
      password,
      salt,
      legacyPBKDF2Hash
    );
    expect(resultAutoDetect.isValid).toBe(true);
    expect(resultAutoDetect.needsRehash).toBe(true);
    expect(resultAutoDetect.detectedScheme).toBe('pbkdf2_sha512_10000_v1');
  });

  it('rejects incorrect password with legacy PBKDF2 hash', async () => {
    const password = 'LegacyStudentPassword2024!';
    const salt = crypto.randomBytes(16).toString('hex');
    const legacyPBKDF2Hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');

    const result = await PasswordHasher.verifyPassword('WrongPassword!', salt, legacyPBKDF2Hash);
    expect(result.isValid).toBe(false);
  });

  it('verifies legacy SHA256 (64 hex) hash and flags needsRehash = true', async () => {
    const password = 'LegacyDemoPassword123!';
    const salt = 'demo_legacy_salt_456';
    const legacySha256Hash = crypto.createHash('sha256').update(password + salt).digest('hex');

    expect(legacySha256Hash).toHaveLength(64);

    const result = await PasswordHasher.verifyPassword(password, salt, legacySha256Hash, 'sha256_legacy');
    expect(result.isValid).toBe(true);
    expect(result.needsRehash).toBe(true);
    expect(result.detectedScheme).toBe('sha256_legacy');
  });

  it('safely rejects unknown or corrupted hash formats without throwing', async () => {
    const result = await PasswordHasher.verifyPassword('SomePassword', 'salt', 'invalid_unrecognized_hash_string');
    expect(result.isValid).toBe(false);
    expect(result.needsRehash).toBe(false);
    expect(result.detectedScheme).toBe('unknown');
  });
});
