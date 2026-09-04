import crypto from 'crypto';
import { User, StudentProfile } from '../../shared/types';
import { DEMO_USER, DEMO_PROFILE, ADMIN_USER } from '../db/demo-data';
import { db, DatabaseError } from '../db/mysql';
import { env, isProduction, isDatabaseRequired } from '../config/env';
import { DemoRepository } from './demo-repository';
import { PasswordHasher, PasswordVerificationResult } from '../services/password-hasher';

export interface StoredUser extends User {
  passwordHash: string;
  passwordSalt: string;
  passwordScheme?: string;
}

interface DemoResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  usedAt?: number | null;
}

import { DbSchemaIncompatibleError, DatabaseUnavailableError } from '../errors/app-errors';

export class UserRepository {
  private static instance: UserRepository;
  // Ephemeral fallback cache for demo/test mode only
  private demoUsers: Map<string, StoredUser> = new Map();
  private demoProfiles: Map<string, StudentProfile> = new Map();
  private demoResetTokens: Map<string, DemoResetToken> = new Map();
  private userCache: Map<string, { user: StoredUser; cachedAt: number }> = new Map();
  private profileCache: Map<string, { profile: StudentProfile; cachedAt: number }> = new Map();

  private constructor() {
    this.seedDemoUserMemory();
  }

  public static getInstance(): UserRepository {
    if (!UserRepository.instance) {
      UserRepository.instance = new UserRepository();
    }
    return UserRepository.instance;
  }

  private classifyDbError(err: any): Error {
    const code = err.code || '';
    const msg = err.message || '';
    if (
      code === 'ER_BAD_FIELD_ERROR' ||
      code === 'ER_NO_SUCH_TABLE' ||
      msg.includes('Unknown column') ||
      msg.includes("doesn't exist")
    ) {
      return new DbSchemaIncompatibleError(`Cơ sở dữ liệu chưa đồng bộ lược đồ phiên bản mới nhất (${msg})`);
    }
    if (
      code === 'PROTOCOL_CONNECTION_LOST' ||
      code === 'ECONNREFUSED' ||
      code === 'ETIMEDOUT' ||
      code === 'ER_CON_COUNT_ERROR' ||
      code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
    ) {
      return new DatabaseUnavailableError(`Cơ sở dữ liệu đang tạm gián đoạn (${code || msg})`);
    }
    return new DatabaseUnavailableError(`Lỗi truy vấn cơ sở dữ liệu (${msg})`);
  }

  private seedDemoUserMemory() {
    if (isProduction || !env.DEMO_LOGIN_ENABLED) {
      return;
    }

    const demoPassword = process.env.DEMO_USER_PASSWORD || (process.env.NODE_ENV === 'test' ? 'TestDemo123!' : undefined);
    if (!demoPassword) {
      return;
    }

    const demoSalt = 'demo_salt_seed_minh_1234';
    const demoHash = crypto.createHash('sha256').update(demoPassword + demoSalt).digest('hex');

    const demoStored: StoredUser = {
      ...DEMO_USER,
      role: 'user',
      passwordHash: demoHash,
      passwordSalt: demoSalt,
      passwordScheme: 'sha256',
    };

    this.demoUsers.set(DEMO_USER.email.toLowerCase(), demoStored);
    this.demoProfiles.set(DEMO_USER.id, { ...DEMO_PROFILE });
  }

  public async hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string; scheme: string }> {
    return PasswordHasher.hashPassword(password);
  }

  public async verifyPassword(
    plainPassword: string,
    salt: string,
    expectedHash: string,
    scheme?: string
  ): Promise<PasswordVerificationResult> {
    return PasswordHasher.verifyPassword(plainPassword, salt, expectedHash, scheme);
  }

  public async rehashUserPassword(userId: string, newPlainPassword: string): Promise<void> {
    const { passwordHash, passwordSalt } = await this.hashPassword(newPlainPassword);
    this.userCache.delete(userId);

    if (db.isHealthy()) {
      try {
        await db.execute(
          `UPDATE users SET password_hash = ?, password_salt = ?, password_scheme = 'scrypt', updated_at = NOW(3) WHERE id = ?`,
          [passwordHash, passwordSalt, userId]
        );
      } catch (err: any) {
        console.warn('[JAMI UserRepository] Warning rehashing password in DB:', err.message);
      }
    }

    for (const u of this.demoUsers.values()) {
      if (u.id === userId) {
        u.passwordHash = passwordHash;
        u.passwordSalt = passwordSalt;
        u.passwordScheme = 'scrypt';
      }
    }
  }

  public async syncWithMySQL() {
    if (!db.isHealthy()) return;
    if (isProduction || process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') return;

    try {
      // Sync Demo Student User only in non-production when ALLOW_DEMO_SEED is true
      const demoUser = this.demoUsers.get(DEMO_USER.email.toLowerCase());
      if (demoUser) {
        const existingDemo = await db.query<any>('SELECT id FROM users WHERE email = ?', [DEMO_USER.email.toLowerCase()]);
        if (existingDemo.length === 0) {
          await db.execute(
            `INSERT INTO users (id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, locale, timezone, age_band, role, status, created_at)
             VALUES (?, ?, ?, ?, 'sha256', ?, ?, ?, ?, ?, 'user', ?, ?)`,
            [
              demoUser.id,
              demoUser.email.toLowerCase(),
              demoUser.passwordHash,
              demoUser.passwordSalt,
              demoUser.displayName,
              demoUser.preferredName,
              demoUser.locale,
              demoUser.timezone,
              demoUser.ageBand,
              demoUser.status,
              new Date(),
            ]
          );

          await db.execute(
            `INSERT INTO student_profiles (user_id, grade_level, school_name, goals_json, preferred_session_minutes, max_daily_study_minutes, energy_preferences_json, sleep_schedule_json, meal_times_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              demoUser.id,
              DEMO_PROFILE.gradeLevel,
              DEMO_PROFILE.schoolName,
              JSON.stringify(DEMO_PROFILE.goals),
              DEMO_PROFILE.preferredSessionMinutes,
              DEMO_PROFILE.maxDailyStudyMinutes,
              JSON.stringify(DEMO_PROFILE.energyPreferences),
              JSON.stringify(DEMO_PROFILE.sleepSchedule),
              JSON.stringify(DEMO_PROFILE.mealTimes),
            ]
          );
          console.log('[JAMI MySQL] Seeded demo student into MySQL.');
        }
      }
    } catch (err: any) {
      console.warn('[JAMI MySQL] Sync demo users warning:', err.message);
    }
  }

  public async findByEmail(email: string): Promise<StoredUser | undefined> {
    const normalizedEmail = email.toLowerCase().trim();

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, locale, timezone, age_band, role, status, last_active_at, created_at
           FROM users
           WHERE LOWER(email) = ?`,
          [normalizedEmail]
        );

        if (rows.length > 0) {
          const r = rows[0];
          let salt = r.password_salt || '';
          let hash = r.password_hash || '';

          if (!salt && hash.includes(':')) {
            const parts = hash.split(':');
            salt = parts[0];
            hash = parts[1];
          }

          const userObj: StoredUser = {
            id: r.id,
            email: r.email,
            passwordHash: hash,
            passwordSalt: salt,
            passwordScheme: r.password_scheme || 'scrypt',
            displayName: r.display_name,
            preferredName: r.preferred_name,
            locale: r.locale,
            timezone: r.timezone,
            ageBand: r.age_band,
            role: r.role || 'user',
            status: r.status || 'active',
            lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toISOString() : undefined,
            createdAt: r.created_at?.toISOString?.() || String(r.created_at),
          };
          this.userCache.set(r.id, { user: userObj, cachedAt: Date.now() });
          return userObj;
        }

        // Query succeeded and returned 0 rows -> User truly does not exist in DB!
        if (isProduction || !env.DEMO_LOGIN_ENABLED) {
          return undefined;
        }
      } catch (err: any) {
        console.error(`[UserRepository] DB query findByEmail error:`, err.message);
        throw this.classifyDbError(err);
      }
    }

    if (isProduction || isDatabaseRequired) {
      return undefined;
    }

    return this.demoUsers.get(normalizedEmail);
  }

  public async findById(id: string): Promise<StoredUser | undefined> {
    if (!id) return undefined;

    const cached = this.userCache.get(id);
    if (cached && Date.now() - cached.cachedAt < 60000) {
      return cached.user;
    }

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, locale, timezone, age_band, role, status, last_active_at, last_offline_scan_at, created_at
           FROM users
           WHERE id = ?`,
          [id]
        );

        if (rows.length > 0) {
          const r = rows[0];
          let salt = r.password_salt || '';
          let hash = r.password_hash || '';

          if (!salt && hash.includes(':')) {
            const parts = hash.split(':');
            salt = parts[0];
            hash = parts[1];
          }

          const userObj: StoredUser = {
            id: r.id,
            email: r.email,
            passwordHash: hash,
            passwordSalt: salt,
            passwordScheme: r.password_scheme || 'scrypt',
            displayName: r.display_name,
            preferredName: r.preferred_name,
            locale: r.locale,
            timezone: r.timezone,
            ageBand: r.age_band,
            role: r.role || 'user',
            status: r.status || 'active',
            lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toISOString() : undefined,
            lastOfflineScanAt: r.last_offline_scan_at ? new Date(r.last_offline_scan_at).toISOString() : undefined,
            createdAt: r.created_at?.toISOString?.() || String(r.created_at),
          };

          this.userCache.set(id, { user: userObj, cachedAt: Date.now() });
          return userObj;
        }

        if (isProduction || !env.DEMO_LOGIN_ENABLED) {
          return undefined;
        }
      } catch (err: any) {
        console.error(`[UserRepository] DB query findById(${id}) error:`, err.message);
        throw this.classifyDbError(err);
      }
    }

    if (cached) return cached.user;

    if (isProduction || isDatabaseRequired) {
      return undefined;
    }

    for (const u of this.demoUsers.values()) {
      if (u.id === id) return u;
    }

    return undefined;
  }

  public async touchLastActive(userId: string): Promise<void> {
    if (!userId) return;
    const nowIso = new Date().toISOString();
    if (db.isHealthy()) {
      try {
        await db.execute('UPDATE users SET last_active_at = NOW(3) WHERE id = ?', [userId]);
      } catch (err: any) {
        console.warn(`[UserRepository] touchLastActive(${userId}) warning:`, err.message);
      }
    }
    const cached = this.userCache.get(userId);
    if (cached && cached.user) {
      cached.user.lastActiveAt = nowIso;
    }
    for (const u of this.demoUsers.values()) {
      if (u.id === userId) {
        u.lastActiveAt = nowIso;
      }
    }
  }

  public async touchLastOfflineScan(userId: string): Promise<void> {
    if (!userId) return;
    const nowIso = new Date().toISOString();
    if (db.isHealthy()) {
      try {
        await db.execute('UPDATE users SET last_offline_scan_at = NOW(3) WHERE id = ?', [userId]);
      } catch (err: any) {
        console.warn(`[UserRepository] touchLastOfflineScan(${userId}) warning:`, err.message);
      }
    }
    const cached = this.userCache.get(userId);
    if (cached && cached.user) {
      cached.user.lastOfflineScanAt = nowIso;
    }
    for (const u of this.demoUsers.values()) {
      if (u.id === userId) {
        u.lastOfflineScanAt = nowIso;
      }
    }
  }

  public async getProfile(userId: string): Promise<StudentProfile | undefined> {
    if (!userId) return undefined;

    const cached = this.profileCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < 60000) {
      return cached.profile;
    }

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT user_id, grade_level, school_name, goals_json, preferred_session_minutes, max_daily_study_minutes, energy_preferences_json, sleep_schedule_json, meal_times_json, onboarding_completed_at
           FROM student_profiles
           WHERE user_id = ?`,
          [userId]
        );

        if (rows.length > 0) {
          const p = rows[0];
          let goals: string[] = [];
          let weakSubjects: string[] | undefined = undefined;
          let curriculum: string | undefined = undefined;
          let learningStyle: string | undefined = undefined;

          if (p.goals_json) {
            try {
              const parsedGoals = typeof p.goals_json === 'string' ? JSON.parse(p.goals_json) : p.goals_json;
              if (Array.isArray(parsedGoals)) {
                goals = parsedGoals;
              } else if (parsedGoals && typeof parsedGoals === 'object') {
                goals = parsedGoals.goals || [];
                weakSubjects = parsedGoals.weakSubjects;
                curriculum = parsedGoals.curriculum;
                learningStyle = parsedGoals.learningStyle;
              }
            } catch {}
          }

          const user = await this.findById(userId);

          const prof: StudentProfile = {
            userId: p.user_id,
            gradeLevel: p.grade_level || 9,
            schoolName: p.school_name || 'THCS / THPT',
            goals,
            preferredName: user?.preferredName,
            weakSubjects,
            curriculum,
            learningStyle,
            preferredSessionMinutes: p.preferred_session_minutes || 45,
            maxDailyStudyMinutes: p.max_daily_study_minutes || 180,
            energyPreferences: typeof p.energy_preferences_json === 'string' ? JSON.parse(p.energy_preferences_json) : p.energy_preferences_json || {},
            sleepSchedule: typeof p.sleep_schedule_json === 'string' ? JSON.parse(p.sleep_schedule_json) : p.sleep_schedule_json || { wakeTime: '06:00', bedTime: '22:30' },
            mealTimes: typeof p.meal_times_json === 'string' ? JSON.parse(p.meal_times_json) : p.meal_times_json || { lunch: '11:45', dinner: '18:30' },
            onboardingCompletedAt: p.onboarding_completed_at ? new Date(p.onboarding_completed_at).toISOString() : undefined,
          };
          this.profileCache.set(userId, { profile: prof, cachedAt: Date.now() });
          return prof;
        }
      } catch (err: any) {
        console.warn(`[UserRepository] DB query getProfile(${userId}) warning:`, err.message);
        if (cached) return cached.profile;
      }
    }

    if (cached) return cached.profile;
    return this.demoProfiles.get(userId);
  }

  public async updateProfile(userId: string, updates: Partial<StudentProfile>): Promise<StudentProfile> {
    const current = (await this.getProfile(userId)) || {
      userId,
      gradeLevel: 9,
      schoolName: 'Trường THCS / THPT',
      goals: ['Đạt điểm khá giỏi các môn trọng tâm'],
      preferredSessionMinutes: 45,
      maxDailyStudyMinutes: 180,
      energyPreferences: { morning: 'high', afternoon: 'medium', evening: 'high' },
      sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
      mealTimes: { lunch: '12:00', dinner: '18:30' },
    };

    const updated: StudentProfile = {
      ...current,
      ...updates,
    };

    if (updates.preferredName) {
      if (db.isHealthy()) {
        try {
          await db.execute('UPDATE users SET preferred_name = ? WHERE id = ?', [updates.preferredName, userId]);
        } catch (err: any) {
          console.warn(`[UserRepository] Could not update preferred_name for ${userId}:`, err.message);
        }
      }
      const userCached = this.userCache.get(userId);
      if (userCached && userCached.user) {
        userCached.user.preferredName = updates.preferredName;
      }
      for (const demoUser of this.demoUsers.values()) {
        if (demoUser.id === userId) {
          demoUser.preferredName = updates.preferredName;
        }
      }
    }

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO student_profiles
         (user_id, grade_level, school_name, goals_json, preferred_session_minutes, max_daily_study_minutes, energy_preferences_json, sleep_schedule_json, meal_times_json, onboarding_completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           grade_level = VALUES(grade_level),
           school_name = VALUES(school_name),
           goals_json = VALUES(goals_json),
           preferred_session_minutes = VALUES(preferred_session_minutes),
           max_daily_study_minutes = VALUES(max_daily_study_minutes),
           energy_preferences_json = VALUES(energy_preferences_json),
           sleep_schedule_json = VALUES(sleep_schedule_json),
           meal_times_json = VALUES(meal_times_json),
           onboarding_completed_at = VALUES(onboarding_completed_at)`,
        [
          userId,
          updated.gradeLevel,
          updated.schoolName,
          JSON.stringify({
            goals: updated.goals || [],
            weakSubjects: updated.weakSubjects,
            curriculum: updated.curriculum,
            learningStyle: updated.learningStyle,
          }),
          updated.preferredSessionMinutes,
          updated.maxDailyStudyMinutes,
          JSON.stringify(updated.energyPreferences),
          JSON.stringify(updated.sleepSchedule),
          JSON.stringify(updated.mealTimes),
          updated.onboardingCompletedAt ? new Date(updated.onboardingCompletedAt) : null,
        ]
      );
    } else {
      this.demoProfiles.set(userId, updated);
    }

    this.profileCache.delete(userId);
    return updated;
  }

  public async createUser(data: {
    email: string;
    password: string;
    displayName: string;
    preferredName?: string;
    gradeLevel?: number;
  }): Promise<{ user: User; profile: StudentProfile }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      const err: any = new Error('Email này đã được đăng ký. Vui lòng đăng nhập.');
      err.code = 'EMAIL_ALREADY_EXISTS';
      throw err;
    }

    const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const { passwordHash, passwordSalt, scheme } = await this.hashPassword(data.password);
    const createdAt = new Date().toISOString();
    const role = (data as any).role || 'student';

    const user: User = {
      id: userId,
      email: normalizedEmail,
      displayName: data.displayName.trim(),
      preferredName: (data.preferredName || data.displayName.trim().split(/\s+/).pop() || 'Học sinh').trim(),
      role,
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
      onboardingCompletedAt: createdAt,
    };

    if (db.isHealthy()) {
      try {
        await db.withTransaction(async (conn) => {
          await conn.execute(
            `INSERT INTO users (id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, role, locale, timezone, age_band, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              normalizedEmail,
              passwordHash,
              passwordSalt,
              scheme,
              user.displayName,
              user.preferredName,
              role,
              user.locale,
              user.timezone,
              user.ageBand,
              user.status,
              new Date(createdAt),
            ]
          );

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
              new Date(createdAt),
            ]
          );

          // Seed default subjects for new student
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
        });
      } catch (err: any) {
        if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
          const dupErr: any = new Error('Email này đã được đăng ký. Vui lòng đăng nhập.');
          dupErr.code = 'EMAIL_ALREADY_EXISTS';
          throw dupErr;
        }
        throw new Error(`Tạo tài khoản thất bại: ${err.message}`, { cause: err });
      }
    } else {
      if (isProduction) {
        throw new Error('Cơ sở dữ liệu đang không khả dụng. Vui lòng thử lại sau.');
      }
      const storedUser: StoredUser = {
        ...user,
        passwordHash,
        passwordSalt,
        passwordScheme: scheme,
      };
      this.demoUsers.set(normalizedEmail, storedUser);
      this.demoProfiles.set(userId, profile);
    }

    return { user, profile };
  }

  // ==========================================
  // Password Reset Token Management
  // ==========================================

  public async createPasswordResetToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const pepper = env.SESSION_SECRET || 'jami-secret-salt-default-32';
    const tokenHash = crypto.createHmac('sha256', pepper).update(rawToken).digest('hex');
    const id = 'rst_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const expiresAt = Date.now() + 60 * 60 * 1000; // 60 minutes TTL

    if (db.isHealthy()) {
      await db.execute(`UPDATE password_reset_tokens SET used_at = NOW(3) WHERE user_id = ? AND used_at IS NULL`, [userId]);

      await db.execute(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, NOW(3))`,
        [id, userId, tokenHash, new Date(expiresAt)]
      );
    } else {
      this.demoResetTokens.set(tokenHash, {
        id,
        userId,
        tokenHash,
        expiresAt,
        usedAt: null,
      });
    }

    return rawToken;
  }

  public async verifyPasswordResetToken(rawToken: string): Promise<{ userId: string; tokenId: string } | null> {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const pepper = env.SESSION_SECRET || 'jami-secret-salt-default-32';
    const tokenHash = crypto.createHmac('sha256', pepper).update(rawToken).digest('hex');

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL`,
          [tokenHash]
        );

        if (rows.length > 0) {
          const r = rows[0];
          const expiresIso = r.expires_at ? (r.expires_at.toISOString?.() || String(r.expires_at)) : null;
          if (expiresIso && new Date(expiresIso).getTime() > Date.now()) {
            return { userId: r.user_id, tokenId: r.id };
          }
        }
      } catch (err: any) {
        if (isProduction) throw err;
      }
    }

    const demo = this.demoResetTokens.get(tokenHash);
    if (demo && !demo.usedAt && demo.expiresAt > Date.now()) {
      return { userId: demo.userId, tokenId: demo.id };
    }

    return null;
  }

  public async resetPasswordWithToken(rawToken: string, newPassword: string): Promise<boolean> {
    const record = await this.verifyPasswordResetToken(rawToken);
    if (!record) return false;

    const { passwordHash, passwordSalt, scheme } = await this.hashPassword(newPassword);

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE users SET password_hash = ?, password_salt = ?, password_scheme = ?, updated_at = NOW(3) WHERE id = ?`,
          [passwordHash, passwordSalt, scheme, record.userId]
        );

        await conn.execute(`UPDATE password_reset_tokens SET used_at = NOW(3) WHERE id = ?`, [record.tokenId]);
        await conn.execute(`UPDATE auth_sessions SET revoked_at = NOW(3) WHERE user_id = ?`, [record.userId]);
      });
      return true;
    } else {
      for (const u of this.demoUsers.values()) {
        if (u.id === record.userId) {
          u.passwordHash = passwordHash;
          u.passwordSalt = passwordSalt;
          u.passwordScheme = scheme;
        }
      }
      const pepper = env.SESSION_SECRET || 'jami-secret-salt-default-32';
      const tokenHash = crypto.createHmac('sha256', pepper).update(rawToken).digest('hex');
      const demo = this.demoResetTokens.get(tokenHash);
      if (demo) demo.usedAt = Date.now();
      return true;
    }
  }

  // ==========================================
  // Admin User Management Operations
  // ==========================================

  public async getAllUsers(params?: {
    search?: string;
    status?: string;
  }): Promise<{
    users: User[];
    totalCount: number;
    activeCount: number;
    bannedCount: number;
    adminCount: number;
  }> {
    const search = params?.search?.trim().toLowerCase() || '';
    const statusFilter = params?.status?.trim() || '';

    if (db.isHealthy()) {
      try {
        let query = `
          SELECT id, email, display_name, preferred_name, locale, timezone, age_band, role, status, created_at
          FROM users
          WHERE 1=1
        `;
        const queryArgs: any[] = [];

        if (search) {
          query += ` AND (LOWER(email) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(preferred_name) LIKE ?)`;
          const sParam = `%${search}%`;
          queryArgs.push(sParam, sParam, sParam);
        }

        if (statusFilter && statusFilter !== 'all') {
          query += ` AND status = ?`;
          queryArgs.push(statusFilter);
        }

        query += ` ORDER BY created_at DESC`;

        const rows = await db.query<any>(query, queryArgs);

        const users: User[] = rows.map((r) => ({
          id: r.id,
          email: r.email,
          displayName: r.display_name,
          preferredName: r.preferred_name,
          locale: r.locale,
          timezone: r.timezone,
          ageBand: r.age_band,
          role: r.role || 'user',
          status: r.status || 'active',
          createdAt: r.created_at?.toISOString?.() || String(r.created_at),
        }));

        // Get overall statistics across all users
        const allStats = await db.query<any>(`
          SELECT 
            COUNT(*) as total_count,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
            SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) as banned_count,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count
          FROM users
        `);

        const statsRow = allStats[0] || {};
        return {
          users,
          totalCount: Number(statsRow.total_count) || users.length,
          activeCount: Number(statsRow.active_count) || 0,
          bannedCount: Number(statsRow.banned_count) || 0,
          adminCount: Number(statsRow.admin_count) || 0,
        };
      } catch (err: any) {
        if (isProduction) throw err;
      }
    }

    // In-memory fallback
    const allUsers: User[] = Array.from(this.demoUsers.values()).map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      preferredName: u.preferredName,
      locale: u.locale,
      timezone: u.timezone,
      ageBand: u.ageBand,
      role: u.role || 'user',
      status: u.status || 'active',
      createdAt: u.createdAt,
    }));

    const totalCount = allUsers.length;
    const activeCount = allUsers.filter((u) => u.status === 'active').length;
    const bannedCount = allUsers.filter((u) => u.status === 'banned').length;
    const adminCount = allUsers.filter((u) => u.role === 'admin').length;

    let filtered = allUsers;
    if (search) {
      filtered = filtered.filter(
        (u) =>
          u.email.toLowerCase().includes(search) ||
          u.displayName.toLowerCase().includes(search) ||
          u.preferredName.toLowerCase().includes(search)
      );
    }
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((u) => u.status === statusFilter);
    }

    return {
      users: filtered,
      totalCount,
      activeCount,
      bannedCount,
      adminCount,
    };
  }

  public async setUserStatus(userId: string, status: 'active' | 'banned' | 'inactive'): Promise<User> {
    this.userCache.delete(userId);
    this.profileCache.delete(userId);

    if (db.isHealthy()) {
      await db.execute(`UPDATE users SET status = ?, updated_at = NOW(3) WHERE id = ?`, [status, userId]);
      if (status === 'banned') {
        try {
          await db.execute(`UPDATE refresh_sessions SET revoked_at = NOW(3) WHERE user_id = ?`, [userId]);
        } catch {}
      }
    }

    for (const u of this.demoUsers.values()) {
      if (u.id === userId) {
        u.status = status;
      }
    }

    const updated = await this.findById(userId);
    if (!updated) {
      throw new Error('Người dùng không tồn tại.');
    }
    const { passwordHash, passwordSalt, passwordScheme, ...safeUser } = updated;
    return safeUser;
  }

  public async setUserRole(userId: string, role: 'admin' | 'user'): Promise<User> {
    this.userCache.delete(userId);
    this.profileCache.delete(userId);

    if (db.isHealthy()) {
      await db.execute(`UPDATE users SET role = ?, updated_at = NOW(3) WHERE id = ?`, [role, userId]);
    }

    for (const u of this.demoUsers.values()) {
      if (u.id === userId) {
        u.role = role;
      }
    }

    const updated = await this.findById(userId);
    if (!updated) {
      throw new Error('Người dùng không tồn tại.');
    }
    const { passwordHash, passwordSalt, passwordScheme, ...safeUser } = updated;
    return safeUser;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    this.userCache.delete(userId);
    this.profileCache.delete(userId);

    if (db.isHealthy()) {
      try {
        await db.withTransaction(async (conn) => {
          await conn.execute(`DELETE FROM student_profiles WHERE user_id = ?`, [userId]);
          await conn.execute(`DELETE FROM refresh_sessions WHERE user_id = ?`, [userId]);
          await conn.execute(`DELETE FROM consent_records WHERE user_id = ?`, [userId]);
          await conn.execute(`DELETE FROM users WHERE id = ?`, [userId]);
        });
      } catch (err: any) {
        await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);
      }
    }

    for (const [email, u] of this.demoUsers.entries()) {
      if (u.id === userId) {
        this.demoUsers.delete(email);
        this.demoProfiles.delete(userId);
      }
    }

    return true;
  }
}

export const userRepo = UserRepository.getInstance();

