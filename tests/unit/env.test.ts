import { describe, it, expect } from 'vitest';
import { parseBooleanEnv, normalizeApiBaseUrl } from '../../server/config/env';
import { PasswordHasher } from '../../server/services/password-hasher';

describe('Environment Boolean & URL Parsing Unit Tests', () => {
  it('parses string "false", "0", "no" as boolean false', () => {
    expect(parseBooleanEnv('false')).toBe(false);
    expect(parseBooleanEnv('False')).toBe(false);
    expect(parseBooleanEnv('0')).toBe(false);
    expect(parseBooleanEnv('no')).toBe(false);
  });

  it('parses string "true", "1", "yes" as boolean true', () => {
    expect(parseBooleanEnv('true')).toBe(true);
    expect(parseBooleanEnv('TRUE')).toBe(true);
    expect(parseBooleanEnv('1')).toBe(true);
    expect(parseBooleanEnv('yes')).toBe(true);
  });

  it('returns undefined for empty/undefined values and throws on invalid boolean strings', () => {
    expect(parseBooleanEnv('')).toBe(undefined);
    expect(parseBooleanEnv(undefined)).toBe(undefined);
    expect(() => parseBooleanEnv('invalid')).toThrow();
  });

  it('normalizes API base URLs correctly', () => {
    expect(normalizeApiBaseUrl('/api/v1')).toBe('/api/v1');
    expect(normalizeApiBaseUrl('/api/v1/')).toBe('/api/v1');
    expect(normalizeApiBaseUrl('https://api.jami.edu.vn')).toBe('https://api.jami.edu.vn/api/v1');
    expect(normalizeApiBaseUrl('https://api.jami.edu.vn/api/v1')).toBe('https://api.jami.edu.vn/api/v1');
  });
});

describe('Async Scrypt Password Hasher Unit Tests', () => {
  it('hashes password with scrypt and verifies correctly', async () => {
    const password = 'StudentSecurePassword123!';
    const { passwordHash, passwordSalt, scheme } = await PasswordHasher.hashPassword(password);

    expect(scheme).toBe('scrypt');
    expect(passwordHash).toContain('scrypt:$16384$8$1$');

    const result = await PasswordHasher.verifyPassword(password, passwordSalt, passwordHash);
    expect(result.isValid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it('rejects incorrect passwords', async () => {
    const password = 'StudentSecurePassword123!';
    const { passwordHash, passwordSalt } = await PasswordHasher.hashPassword(password);

    const result = await PasswordHasher.verifyPassword('WrongPassword!', passwordSalt, passwordHash);
    expect(result.isValid).toBe(false);
  });

  it('verifies legacy SHA256 password hashes and flags needsRehash=true', async () => {
    const crypto = await import('crypto');
    const password = 'Demo1234!';
    const salt = 'legacy_salt_123';
    const legacyHash = crypto.createHash('sha256').update(password + salt).digest('hex');

    const result = await PasswordHasher.verifyPassword(password, salt, legacyHash);
    expect(result.isValid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });
});
