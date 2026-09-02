import crypto from 'crypto';
import { Response } from 'express';
import { env, isProduction, isDatabaseRequired } from '../config/env';
import { sessionRepo } from '../repositories/session-repository';
import { userRepo } from '../repositories/user-repository';
import { db } from '../db/mysql';
import { PasswordHasher } from './password-hasher';
import { User, StudentProfile } from '../../shared/types';
import {
  EmailAlreadyExistsError,
  DatabaseUnavailableError,
  DbSchemaIncompatibleError,
} from '../errors/app-errors';

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

  /**
   * Atomic Registration:
   * Executes User creation, Student Profile, Default Subjects, and Session creation
   * within a SINGLE database transaction.
   * If any step fails (e.g. session insert), the entire transaction rolls back cleanly,
   * preventing orphaned "half-created" user rows.
   */
  public async registerAtomic(data: {
    email: string;
    password: string;
    displayName: string;
    preferredName?: string;
    gradeLevel?: number;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{ user: User; profile: StudentProfile; rawToken: string }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const { passwordHash, passwordSalt, scheme } = await PasswordHasher.hashPassword(data.password);
    const createdAt = new Date().toISOString();

    const user: User = {
      id: userId,
      email: normalizedEmail,
      displayName: data.displayName.trim(),
      preferredName: (data.preferredName || data.displayName.trim().split(/\s+/).pop() || 'Học sinh').trim(),
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      ageBand: '14-17',
      status: 'active',
      createdAt,
    };

    const profile: StudentProfile = {
      userId,
      gradeLevel: Number(data.gradeLevel) || 9,
      schoolName: 'Trường THCS / THPT',
      goals: ['Lập kế hoạch và duy trì thói quen học tập hàng ngày cùng Jami'],
      preferredSessionMinutes: 45,
      maxDailyStudyMinutes: 180,
      energyPreferences: { morning: 'high', afternoon: 'medium', evening: 'high' },
      sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
      mealTimes: { lunch: '12:00', dinner: '18:30' },
      onboardingCompletedAt: undefined,
    };

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sessionRepo.hashToken(rawToken);
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const expiresAtDate = new Date(Date.now() + 24 * 3600 * 1000);

    if (db.isHealthy()) {
      try {
        await db.withTransaction(async (conn) => {
          // 1. Check email conflict inside transaction with FOR UPDATE or pre-check
          const [existingRows]: any = await conn.query('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
          if (existingRows && existingRows.length > 0) {
            throw new EmailAlreadyExistsError();
          }

          // 2. Insert user
          await conn.execute(
            `INSERT INTO users (id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, locale, timezone, age_band, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              normalizedEmail,
              passwordHash,
              passwordSalt,
              scheme,
              user.displayName,
              user.preferredName,
              user.locale,
              user.timezone,
              user.ageBand,
              user.status,
              new Date(createdAt),
            ]
          );

          // 3. Insert student profile
          await conn.execute(
            `INSERT INTO student_profiles (user_id, grade_level, school_name, goals_json, preferred_session_minutes, max_daily_study_minutes, energy_preferences_json, sleep_schedule_json, meal_times_json, onboarding_completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              profile.gradeLevel,
              profile.schoolName,
              JSON.stringify(profile.goals),
              profile.preferredSessionMinutes,
              profile.maxDailyStudyMinutes,
              JSON.stringify(profile.energyPreferences),
              JSON.stringify(profile.sleepSchedule),
              JSON.stringify(profile.mealTimes),
              profile.onboardingCompletedAt ? new Date(profile.onboardingCompletedAt) : null,
            ]
          );

          // 4. Seed default core subjects
          const defaultSubjects = [
            { id: `subj_toan_${userId.slice(-6)}`, name: 'Toán học', color: '#2563EB', icon: 'Calculator', order: 1 },
            { id: `subj_van_${userId.slice(-6)}`, name: 'Ngữ văn', color: '#EA580C', icon: 'BookOpen', order: 2 },
            { id: `subj_anh_${userId.slice(-6)}`, name: 'Tiếng Anh', color: '#16A34A', icon: 'Globe', order: 3 },
          ];
          for (const s of defaultSubjects) {
            await conn.execute(
              `INSERT INTO subjects (id, user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
              [s.id, userId, s.name, s.color, s.icon, s.order]
            );
          }

          // 5. Insert auth session in the same transaction
          await conn.execute(
            `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, revoked_at, user_agent, ip_address, is_demo, created_at)
             VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?)`,
            [
              sessionId,
              userId,
              tokenHash,
              expiresAtDate,
              data.userAgent ? data.userAgent.substring(0, 255) : null,
              data.ipAddress ? data.ipAddress.substring(0, 50) : null,
              new Date(createdAt),
            ]
          );
        });
      } catch (err: any) {
        if (err instanceof EmailAlreadyExistsError) {
          throw err;
        }
        if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
          throw new EmailAlreadyExistsError();
        }
        if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
          throw new DbSchemaIncompatibleError(`Cơ sở dữ liệu chưa đồng bộ bảng: ${err.message}`);
        }
        if (isProduction || isDatabaseRequired) {
          throw new DatabaseUnavailableError(`Giao dịch đăng ký cơ sở dữ liệu thất bại: ${err.message}`);
        }
        throw err;
      }
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new DatabaseUnavailableError('Cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau.');
      }
      // Demo in-memory fallback
      const existing = await userRepo.findByEmail(normalizedEmail);
      if (existing) {
        throw new EmailAlreadyExistsError();
      }
      const { user: createdUser, profile: createdProfile } = await userRepo.createUser({
        email: normalizedEmail,
        password: data.password,
        displayName: data.displayName,
        preferredName: data.preferredName,
        gradeLevel: data.gradeLevel,
      });
      const sess = await sessionRepo.createSession(createdUser.id, false, false);
      return { user: createdUser, profile: createdProfile, rawToken: sess.rawToken };
    }

    return { user, profile, rawToken };
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
