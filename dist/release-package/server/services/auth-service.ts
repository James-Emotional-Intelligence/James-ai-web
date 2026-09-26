import crypto from 'crypto';
import { Response } from 'express';
import { env, isProduction, isDatabaseRequired } from '../config/env';
import { sessionRepo } from '../repositories/session-repository';
import { userRepo } from '../repositories/user-repository';
import { db } from '../db/mysql';
import { PasswordHasher } from './password-hasher';
import { User, StudentProfile } from '../../shared/types';
import { registrationCodeService } from './registration-code-service';
import { aiWalletRepo } from '../repositories/ai-wallet-repository';
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
    rememberMe?: boolean;
    registrationCode?: string;
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
      role: 'user',
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
    const sessionTtlMs = data.rememberMe ? 30 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
    const expiresAtDate = new Date(Date.now() + sessionTtlMs);

    const defaultGrantVnd = env.AI_DEFAULT_CREDIT_VND ?? 25000;
    const defaultGrantMilliVnd = BigInt(defaultGrantVnd) * 1000n;

    if (db.isHealthy()) {
      try {
        await db.withTransaction(async (conn) => {
          // 1. Check email conflict inside transaction with FOR UPDATE
          const [existingRows]: any = await conn.query('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
          if (existingRows && existingRows.length > 0) {
            throw new EmailAlreadyExistsError();
          }

          // 2. Insert user first (strictly role: 'user') so child foreign keys (like code redemptions) succeed
          await conn.execute(
            `INSERT INTO users (id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, role, locale, timezone, age_band, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?)`,
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

          // 3. Validate and redeem registration code if provided (transaction will roll back if invalid)
          let codeRedemption: {
            rewardType: 'credit' | 'unlimited';
            creditMilliVnd: bigint;
            unlimitedForever: boolean;
            unlimitedUntil: Date | null;
            codeId: string;
          } | null = null;

          if (data.registrationCode && data.registrationCode.trim()) {
            codeRedemption = await registrationCodeService.redeemInTransaction(
              conn,
              userId,
              data.registrationCode.trim()
            );
          }

          // 4. Insert student profile
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

          // 5. Seed default core subjects
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

          // 6. Initialize AI Wallet with default grant & code bonuses
          const bonusCreditMilliVnd = codeRedemption?.rewardType === 'credit' ? codeRedemption.creditMilliVnd : 0n;
          const totalBalanceMilliVnd = defaultGrantMilliVnd + bonusCreditMilliVnd;
          const isUnlimitedForever = codeRedemption?.rewardType === 'unlimited' ? codeRedemption.unlimitedForever : false;
          const unlimitedUntil = codeRedemption?.rewardType === 'unlimited' ? codeRedemption.unlimitedUntil : null;

          await conn.execute(
            `INSERT INTO ai_wallets (user_id, balance_milli_vnd, reserved_milli_vnd, ai_enabled, unlimited_forever, unlimited_until, version, created_at, updated_at)
             VALUES (?, ?, 0, TRUE, ?, ?, 0, NOW(3), NOW(3))`,
            [
              userId,
              totalBalanceMilliVnd.toString(),
              isUnlimitedForever ? 1 : 0,
              unlimitedUntil,
            ]
          );

          // Record initial grant transaction in ledger
          const initialTxId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO ai_wallet_transactions
             (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, idempotency_key, reason, created_at)
             VALUES (?, ?, NULL, 'initial_grant', ?, ?, 0, ?, 'Cấp ngân sách AI ban đầu (25.000đ)', NOW(3))`,
            [
              initialTxId,
              userId,
              defaultGrantMilliVnd.toString(),
              defaultGrantMilliVnd.toString(),
              `init_grant_${userId}`,
            ]
          );

          // If code granted extra credit, record bonus credit transaction in ledger
          if (bonusCreditMilliVnd > 0n && codeRedemption) {
            const codeTxId = 'tx_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
            await conn.execute(
              `INSERT INTO ai_wallet_transactions
               (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, registration_code_id, idempotency_key, reason, created_at)
               VALUES (?, ?, NULL, 'code_credit', ?, ?, 0, ?, ?, 'Cộng ngân sách AI từ mã ưu đãi', NOW(3))`,
              [
                codeTxId,
                userId,
                bonusCreditMilliVnd.toString(),
                totalBalanceMilliVnd.toString(),
                codeRedemption.codeId,
                `code_credit_${userId}_${codeRedemption.codeId}`,
              ]
            );
          }

          // 7. Insert auth session in the same transaction
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
        if (err instanceof EmailAlreadyExistsError || err.code === 'INVALID_REGISTRATION_CODE') {
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
      // Demo in-memory fallback with atomic rollback snapshot
      const existing = await userRepo.findByEmail(normalizedEmail);
      if (existing) {
        throw new EmailAlreadyExistsError();
      }

      const codeSnapshot = registrationCodeService.createDemoSnapshot();
      try {
        let codeRedemption: any = null;
        if (data.registrationCode && data.registrationCode.trim()) {
          codeRedemption = await registrationCodeService.redeemInTransaction(null, userId, data.registrationCode.trim());
        }

        const { user: createdUser, profile: createdProfile } = await userRepo.createUser({
          email: normalizedEmail,
          password: data.password,
          displayName: data.displayName,
          preferredName: data.preferredName,
          gradeLevel: data.gradeLevel,
        });

        const bonusVnd = codeRedemption?.rewardType === 'credit' ? Number((codeRedemption.creditMilliVnd || 0n) / 1000n) : 0;
        const initialTotalVnd = defaultGrantVnd + bonusVnd;
        const wallet = await aiWalletRepo.ensureWallet(createdUser.id, initialTotalVnd);
        if (codeRedemption?.rewardType === 'unlimited') {
          wallet.unlimitedForever = Boolean(codeRedemption.unlimitedForever);
          wallet.unlimitedUntil = codeRedemption.unlimitedUntil || null;
        }

        const sess = await sessionRepo.createSession(createdUser.id, false, !!data.rememberMe);
        return { user: createdUser, profile: createdProfile, rawToken: sess.rawToken };
      } catch (err) {
        // Roll back in-memory redemption on any failure
        registrationCodeService.restoreDemoSnapshot(codeSnapshot);
        throw err;
      }
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
