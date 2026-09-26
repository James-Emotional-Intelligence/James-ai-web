import crypto from 'crypto';
import util from 'util';

const pbkdf2Async = util.promisify(crypto.pbkdf2);

const SCRYPT_PARAMS = {
  cost: 16384, // N
  blockSize: 8, // r
  parallelization: 1, // p
  keyLen: 64,
};

export type PasswordScheme = 'scrypt' | 'pbkdf2_sha512_10000_v1' | 'sha256_legacy' | 'unknown';

export interface PasswordVerificationResult {
  isValid: boolean;
  needsRehash: boolean;
  detectedScheme: PasswordScheme;
}

function deriveScryptKey(
  password: string,
  saltHex: string,
  keyLen: number,
  cost: number,
  blockSize: number,
  parallelization: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      saltHex,
      keyLen,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: 32 * 1024 * 1024,
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(derivedKey);
      }
    );
  });
}

export class PasswordHasher {
  /**
   * Hashes a password using Node.js async crypto.scrypt with high security parameters.
   * Returns a formatted hash string: scrypt:$16384$8$1$<saltHex>$<derivedKeyHex>
   */
  public static async hashPassword(
    password: string
  ): Promise<{ passwordHash: string; passwordSalt: string; scheme: string }> {
    const saltBytes = crypto.randomBytes(16);
    const saltHex = saltBytes.toString('hex');

    const derivedKey = await deriveScryptKey(
      password,
      saltHex,
      SCRYPT_PARAMS.keyLen,
      SCRYPT_PARAMS.cost,
      SCRYPT_PARAMS.blockSize,
      SCRYPT_PARAMS.parallelization
    );

    const derivedKeyHex = derivedKey.toString('hex');
    const formattedHash = `scrypt:$${SCRYPT_PARAMS.cost}$${SCRYPT_PARAMS.blockSize}$${SCRYPT_PARAMS.parallelization}$${saltHex}$${derivedKeyHex}`;

    return {
      passwordHash: formattedHash,
      passwordSalt: saltHex,
      scheme: 'scrypt',
    };
  }

  /**
   * Generates a legacy PBKDF2 hash using the older version's formula for testing & fixtures:
   * crypto.pbkdf2(password, salt, 10000, 64, 'sha512') -> 128 hex chars
   */
  public static async hashLegacyPBKDF2(
    password: string,
    salt: string
  ): Promise<string> {
    const derived = await pbkdf2Async(password, salt, 10000, 64, 'sha512');
    return derived.toString('hex');
  }

  /**
   * Generates a legacy SHA256 hash: sha256(password + salt) -> 64 hex chars
   */
  public static hashLegacySHA256(password: string, salt: string): string {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
  }

  /**
   * Detects the password scheme based on stored scheme and hash characteristics.
   */
  public static detectScheme(storedHash: string, storedScheme?: string): PasswordScheme {
    if (!storedHash) return 'unknown';

    if (storedHash.startsWith('scrypt:$')) {
      return 'scrypt';
    }

    if (storedScheme === 'scrypt' && storedHash.startsWith('scrypt:$')) {
      return 'scrypt';
    }

    if (storedScheme === 'pbkdf2_sha512_10000_v1' || storedScheme === 'pbkdf2') {
      if (/^[0-9a-fA-F]{128}$/.test(storedHash)) {
        return 'pbkdf2_sha512_10000_v1';
      }
    }

    if (storedScheme === 'sha256_legacy' || storedScheme === 'sha256') {
      if (/^[0-9a-fA-F]{64}$/.test(storedHash) || storedHash.includes(':')) {
        return 'sha256_legacy';
      }
    }

    // Heuristic detection based on hash format
    if (/^[0-9a-fA-F]{128}$/.test(storedHash)) {
      return 'pbkdf2_sha512_10000_v1';
    }

    if (/^[0-9a-fA-F]{64}$/.test(storedHash) || storedHash.includes(':')) {
      return 'sha256_legacy';
    }

    return 'unknown';
  }

  /**
   * Verifies a raw password against stored hash & salt.
   * Supports new scrypt hashes and legacy PBKDF2 / SHA256 hashes seamlessly.
   */
  public static async verifyPassword(
    password: string,
    storedSalt: string,
    storedHash: string,
    storedScheme?: string
  ): Promise<PasswordVerificationResult> {
    if (!password || !storedHash) {
      return { isValid: false, needsRehash: false, detectedScheme: 'unknown' };
    }

    const scheme = this.detectScheme(storedHash, storedScheme);

    // 1. Scrypt format verification
    if (scheme === 'scrypt' || storedHash.startsWith('scrypt:$')) {
      try {
        const parts = storedHash.split('$');
        if (parts.length >= 6) {
          const cost = Number(parts[1]);
          const blockSize = Number(parts[2]);
          const parallelization = Number(parts[3]);
          const saltHex = parts[4];
          const expectedKeyHex = parts[5];

          const derivedKey = await deriveScryptKey(password, saltHex, 64, cost, blockSize, parallelization);
          const keyBuf = Buffer.from(expectedKeyHex, 'hex');

          if (derivedKey.length === keyBuf.length && crypto.timingSafeEqual(derivedKey, keyBuf)) {
            return { isValid: true, needsRehash: false, detectedScheme: 'scrypt' };
          }
        }
      } catch {
        return { isValid: false, needsRehash: false, detectedScheme: 'scrypt' };
      }
      return { isValid: false, needsRehash: false, detectedScheme: 'scrypt' };
    }

    // 2. Legacy PBKDF2 (PBKDF2-HMAC-SHA512, 10000 iterations, 64 bytes key)
    if (scheme === 'pbkdf2_sha512_10000_v1') {
      try {
        const salt = storedSalt || '';
        if (salt) {
          const derived = await pbkdf2Async(password, salt, 10000, 64, 'sha512');
          const derivedHex = derived.toString('hex');
          const derivedBuf = Buffer.from(derivedHex, 'utf-8');
          const expectedBuf = Buffer.from(storedHash, 'utf-8');

          if (derivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(derivedBuf, expectedBuf)) {
            return { isValid: true, needsRehash: true, detectedScheme: 'pbkdf2_sha512_10000_v1' };
          }
        }
      } catch {
        return { isValid: false, needsRehash: false, detectedScheme: 'pbkdf2_sha512_10000_v1' };
      }
      return { isValid: false, needsRehash: false, detectedScheme: 'pbkdf2_sha512_10000_v1' };
    }

    // 3. Legacy SHA256 (hash = sha256(password + salt))
    if (scheme === 'sha256_legacy') {
      try {
        let salt = storedSalt || '';
        let hashToCompare = storedHash;

        if (!salt && storedHash.includes(':')) {
          const parts = storedHash.split(':');
          salt = parts[0];
          hashToCompare = parts[1];
        }

        if (salt) {
          const computed = crypto.createHash('sha256').update(password + salt).digest('hex');
          const computedBuf = Buffer.from(computed, 'utf-8');
          const expectedBuf = Buffer.from(hashToCompare, 'utf-8');

          if (computedBuf.length === expectedBuf.length && crypto.timingSafeEqual(computedBuf, expectedBuf)) {
            return { isValid: true, needsRehash: true, detectedScheme: 'sha256_legacy' };
          }
        }
      } catch {
        return { isValid: false, needsRehash: false, detectedScheme: 'sha256_legacy' };
      }
      return { isValid: false, needsRehash: false, detectedScheme: 'sha256_legacy' };
    }

    // Unknown scheme - safely reject and audit log without logging credentials or raw hash
    console.warn('[JAMI Security Audit] HASH_SCHEME_UNKNOWN: Rejected login attempt for unrecognized password hash format');
    return { isValid: false, needsRehash: false, detectedScheme: 'unknown' };
  }
}
