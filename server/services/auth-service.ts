import { Response } from 'express';
import { env } from '../config/env';
import { sessionRepo, AuthSessionRecord } from '../repositories/session-repository';

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  isDemo: boolean;
}

export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public getCookieOptions(rememberMe = false) {
    const isProd = env.NODE_ENV === 'production';
    const secure = env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE : isProd;
    const sameSite = (env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'strict' | 'none';
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    return {
      httpOnly: true,
      secure,
      sameSite,
      maxAge,
      path: '/',
    };
  }

  public async createSession(userId: string, isDemo = false, rememberMe = false): Promise<string> {
    const { rawToken } = await sessionRepo.createSession(userId, isDemo, rememberMe);
    return rawToken;
  }

  public async getSession(rawToken: string): Promise<Session | null> {
    if (!rawToken) return null;
    const record = await sessionRepo.findByRawToken(rawToken);
    if (!record) return null;

    return {
      id: record.id,
      userId: record.userId,
      createdAt: new Date(record.createdAt).getTime(),
      expiresAt: new Date(record.expiresAt).getTime(),
      isDemo: record.isDemo || false,
    };
  }

  public async revokeSession(rawToken: string): Promise<void> {
    if (rawToken) {
      await sessionRepo.revokeSession(rawToken);
    }
  }

  public setAuthCookie(res: Response, rawToken: string, rememberMe = false): void {
    const options = this.getCookieOptions(rememberMe);
    try {
      res.cookie('jami_session', rawToken, options);
    } catch (err: any) {
      console.warn('[JAMI Auth] Warning setting auth cookie:', err.message);
    }
  }

  public clearAuthCookie(res: Response): void {
    const options = this.getCookieOptions(false);
    try {
      res.clearCookie('jami_session', {
        httpOnly: options.httpOnly,
        secure: options.secure,
        sameSite: options.sameSite,
        path: options.path,
      });
    } catch (err: any) {
      console.warn('[JAMI Auth] Warning clearing auth cookie:', err.message);
    }
  }
}

export const authService = AuthService.getInstance();
