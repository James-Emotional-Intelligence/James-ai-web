import crypto from 'crypto';
import { db } from '../db/mysql';
import { env } from '../config/env';

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  isDemo?: boolean;
}

export class SessionRepository {
  private static instance: SessionRepository;
  // Ephemeral fallback cache for demo mode only
  private demoSessions: Map<string, AuthSessionRecord> = new Map();

  private constructor() {}

  public static getInstance(): SessionRepository {
    if (!SessionRepository.instance) {
      SessionRepository.instance = new SessionRepository();
    }
    return SessionRepository.instance;
  }

  public hashToken(token: string): string {
    const pepper = env.SESSION_SECRET || 'jami-secret-salt-default-32';
    return crypto.createHmac('sha256', pepper).update(token).digest('hex');
  }

  public async createSession(userId: string, isDemo = false, rememberMe = false): Promise<{ rawToken: string; session: AuthSessionRecord }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const id = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const durationMs = rememberMe ? 30 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
    const expiresAtDate = new Date(Date.now() + durationMs);
    const expiresAt = expiresAtDate.toISOString();
    const createdAt = new Date().toISOString();

    const record: AuthSessionRecord = {
      id,
      userId,
      tokenHash,
      expiresAt,
      revokedAt: null,
      createdAt,
      isDemo,
    };

    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
           VALUES (?, ?, ?, ?, NULL, ?)`,
          [id, userId, tokenHash, expiresAtDate, new Date(createdAt)]
        );
      } catch (err: any) {
        if (env.APP_MODE === 'production') {
          throw new Error(`Failed to create database session: ${err.message}`);
        }
        this.demoSessions.set(tokenHash, record);
      }
    } else {
      if (env.APP_MODE === 'production') {
        throw new Error('Database is unreachable. Cannot create session in production mode.');
      }
      this.demoSessions.set(tokenHash, record);
    }

    return { rawToken, session: record };
  }

  public async findByRawToken(rawToken: string): Promise<AuthSessionRecord | null> {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const tokenHash = this.hashToken(rawToken);

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT s.id, s.user_id, s.token_hash, s.expires_at, s.revoked_at, s.created_at, u.status as user_status
           FROM auth_sessions s
           LEFT JOIN users u ON s.user_id = u.id
           WHERE s.token_hash = ? AND s.revoked_at IS NULL`,
          [tokenHash]
        );

        if (rows.length > 0) {
          const r = rows[0];
          if (r.user_status && r.user_status !== 'active') {
            return null; // Inactive or suspended user
          }

          const expiresIso = r.expires_at ? (r.expires_at.toISOString?.() || String(r.expires_at)) : null;
          if (expiresIso) {
            const expiresTime = new Date(expiresIso).getTime();
            if (!isNaN(expiresTime) && expiresTime <= Date.now()) {
              return null; // Session expired
            }
          }

          return {
            id: r.id,
            userId: r.user_id,
            tokenHash: r.token_hash,
            expiresAt: expiresIso || new Date(Date.now() + 86400000).toISOString(),
            revokedAt: r.revoked_at ? (r.revoked_at?.toISOString?.() || String(r.revoked_at)) : null,
            createdAt: r.created_at ? (r.created_at?.toISOString?.() || String(r.created_at)) : new Date().toISOString(),
            isDemo: false,
          };
        }
      } catch (err: any) {
        if (env.APP_MODE === 'production') throw err;
      }
    }

    // Demo in-memory fallback
    const demo = this.demoSessions.get(tokenHash);
    if (demo) {
      if (new Date(demo.expiresAt).getTime() < Date.now() || demo.revokedAt) {
        this.demoSessions.delete(tokenHash);
        return null;
      }
      return demo;
    }

    return null;
  }

  public async revokeSession(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);

    if (db.isHealthy()) {
      try {
        await db.execute('UPDATE auth_sessions SET revoked_at = NOW(3) WHERE token_hash = ?', [tokenHash]);
      } catch (err: any) {
        if (env.APP_MODE === 'production') throw err;
      }
    }

    const demo = this.demoSessions.get(tokenHash);
    if (demo) {
      demo.revokedAt = new Date().toISOString();
      this.demoSessions.delete(tokenHash);
    }
  }

  public async cleanupExpiredSessions(): Promise<number> {
    if (db.isHealthy()) {
      try {
        const result = await db.execute('DELETE FROM auth_sessions WHERE expires_at < NOW(3) OR revoked_at < NOW(3) - INTERVAL 7 DAY');
        return result?.affectedRows || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }
}

export const sessionRepo = SessionRepository.getInstance();
