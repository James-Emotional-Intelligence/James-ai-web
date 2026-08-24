import crypto from 'crypto';
import { User, StudentProfile } from '../../shared/types';
import { DEMO_USER, DEMO_PROFILE } from '../db/demo-data';
import { db } from '../db/mysql';
import { env } from '../config/env';
import { DemoRepository } from './demo-repository';

export interface StoredUser extends User {
  passwordHash: string;
  passwordSalt: string;
}

export class UserRepository {
  private static instance: UserRepository;
  // Ephemeral fallback cache for demo mode only
  private demoUsers: Map<string, StoredUser> = new Map();
  private demoProfiles: Map<string, StudentProfile> = new Map();

  private constructor() {
    this.seedDemoUserMemory();
  }

  public static getInstance(): UserRepository {
    if (!UserRepository.instance) {
      UserRepository.instance = new UserRepository();
    }
    return UserRepository.instance;
  }

  private seedDemoUserMemory() {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword('Demo1234!', salt);

    const demoStored: StoredUser = {
      ...DEMO_USER,
      passwordHash: hash,
      passwordSalt: salt,
    };

    this.demoUsers.set(DEMO_USER.email.toLowerCase(), demoStored);
    this.demoProfiles.set(DEMO_USER.id, { ...DEMO_PROFILE });
  }

  public hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  public verifyPassword(plainPassword: string, salt: string, expectedHash: string): boolean {
    if (!plainPassword || !salt || !expectedHash) return false;
    const computed = this.hashPassword(plainPassword, salt);
    try {
      const bufA = Buffer.from(computed, 'hex');
      const bufB = Buffer.from(expectedHash, 'hex');
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return computed === expectedHash;
    }
  }

  public async syncWithMySQL() {
    if (!db.isHealthy()) return;

    try {
      // Seed demo user into MySQL if not existing
      const existingDemo = await db.query<any>('SELECT id FROM users WHERE email = ?', [DEMO_USER.email]);
      const demoUser = this.demoUsers.get(DEMO_USER.email.toLowerCase())!;

      if (existingDemo.length === 0) {
        await db.execute(
          `INSERT INTO users (id, email, password_hash, password_salt, display_name, preferred_name, locale, timezone, age_band, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            demoUser.id,
            demoUser.email,
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
        console.log('[JAMI MySQL] Seeded demo user into MySQL.');
      } else {
        await db.execute(
          `UPDATE users SET password_hash = ?, password_salt = ? WHERE email = ?`,
          [demoUser.passwordHash, demoUser.passwordSalt, demoUser.email]
        );
        console.log('[JAMI MySQL] Demo user credentials synchronized with MySQL.');
      }
    } catch (err: any) {
      console.warn('[JAMI MySQL] User repository sync notice:', err.message);
    }
  }

  public async findByEmail(email: string): Promise<StoredUser | undefined> {
    const normalizedEmail = email.trim().toLowerCase();

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, email, password_hash, password_salt, display_name, preferred_name, locale, timezone, age_band, status, created_at
           FROM users
           WHERE email = ?`,
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

          return {
            id: r.id,
            email: r.email,
            passwordHash: hash,
            passwordSalt: salt,
            displayName: r.display_name,
            preferredName: r.preferred_name,
            locale: r.locale,
            timezone: r.timezone,
            ageBand: r.age_band,
            status: r.status,
            createdAt: r.created_at?.toISOString?.() || String(r.created_at),
          };
        }
      } catch (err: any) {
        if (env.APP_MODE === 'production') throw err;
      }
    }

    // Demo in-memory fallback
    return this.demoUsers.get(normalizedEmail);
  }

  public async findById(id: string): Promise<StoredUser | undefined> {
    if (!id) return undefined;

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, email, password_hash, password_salt, display_name, preferred_name, locale, timezone, age_band, status, created_at
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

          return {
            id: r.id,
            email: r.email,
            passwordHash: hash,
            passwordSalt: salt,
            displayName: r.display_name,
            preferredName: r.preferred_name,
            locale: r.locale,
            timezone: r.timezone,
            ageBand: r.age_band,
            status: r.status,
            createdAt: r.created_at?.toISOString?.() || String(r.created_at),
          };
        }
      } catch (err: any) {
        if (env.APP_MODE === 'production') throw err;
      }
    }

    // Demo fallback
    for (const u of this.demoUsers.values()) {
      if (u.id === id) return u;
    }
    return undefined;
  }

  public async getProfile(userId: string): Promise<StudentProfile | undefined> {
    if (!userId) return undefined;

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
          return {
            userId: p.user_id,
            gradeLevel: p.grade_level,
            schoolName: p.school_name || 'THCS / THPT',
            goals: typeof p.goals_json === 'string' ? JSON.parse(p.goals_json) : p.goals_json || [],
            preferredSessionMinutes: p.preferred_session_minutes || 45,
            maxDailyStudyMinutes: p.max_daily_study_minutes || 180,
            energyPreferences: typeof p.energy_preferences_json === 'string' ? JSON.parse(p.energy_preferences_json) : p.energy_preferences_json || {},
            sleepSchedule: typeof p.sleep_schedule_json === 'string' ? JSON.parse(p.sleep_schedule_json) : p.sleep_schedule_json || { wakeTime: '06:00', bedTime: '22:30' },
            mealTimes: typeof p.meal_times_json === 'string' ? JSON.parse(p.meal_times_json) : p.meal_times_json || { lunch: '11:45', dinner: '18:30' },
          };
        }
      } catch (err: any) {
        if (env.APP_MODE === 'production') throw err;
      }
    }

    // Demo fallback
    return this.demoProfiles.get(userId);
  }

  public async updateProfile(userId: string, updates: Partial<StudentProfile>): Promise<StudentProfile> {
    const current = (await this.getProfile(userId)) || {
      userId,
      gradeLevel: 9,
      schoolName: 'Trường THCS / THPT',
      goals: ['Hoàn thành tốt chương trình học kì'],
      preferredSessionMinutes: 45,
      maxDailyStudyMinutes: 180,
      energyPreferences: {
        morning: 'medium',
        afternoon: 'medium',
        evening: 'high',
      },
      sleepSchedule: {
        wakeTime: '06:00',
        bedTime: '22:30',
      },
      mealTimes: {
        lunch: '11:45',
        dinner: '18:30',
      },
    };

    const updated: StudentProfile = {
      ...current,
      ...updates,
      goals: updates.goals || current.goals,
      energyPreferences: updates.energyPreferences || current.energyPreferences,
      sleepSchedule: updates.sleepSchedule || current.sleepSchedule,
      mealTimes: updates.mealTimes || current.mealTimes,
    };

    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO student_profiles (user_id, grade_level, school_name, goals_json, preferred_session_minutes, max_daily_study_minutes, energy_preferences_json, sleep_schedule_json, meal_times_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             grade_level = VALUES(grade_level),
             school_name = VALUES(school_name),
             goals_json = VALUES(goals_json),
             preferred_session_minutes = VALUES(preferred_session_minutes),
             max_daily_study_minutes = VALUES(max_daily_study_minutes),
             energy_preferences_json = VALUES(energy_preferences_json),
             sleep_schedule_json = VALUES(sleep_schedule_json),
             meal_times_json = VALUES(meal_times_json)`,
          [
            userId,
            updated.gradeLevel,
            updated.schoolName,
            JSON.stringify(updated.goals),
            updated.preferredSessionMinutes,
            updated.maxDailyStudyMinutes,
            JSON.stringify(updated.energyPreferences),
            JSON.stringify(updated.sleepSchedule),
            JSON.stringify(updated.mealTimes),
          ]
        );
      } catch (err: any) {
        if (env.APP_MODE === 'production') throw err;
      }
    }

    this.demoProfiles.set(userId, updated);
    return updated;
  }

  public async createUser(params: {
    email: string;
    password: string;
    displayName: string;
    preferredName?: string;
    gradeLevel: number;
  }): Promise<{ user: User; profile: StudentProfile }> {
    const normalizedEmail = params.email.trim().toLowerCase();

    // Check in-memory demo map first if running in demo mode
    if (this.demoUsers.has(normalizedEmail)) {
      throw new Error('Email này đã được đăng ký. Vui lòng chuyển sang trang Đăng nhập.');
    }

    const trimmedDisplayName = params.displayName.trim();
    const nameParts = trimmedDisplayName.split(/\s+/);
    const preferredName = (params.preferredName && params.preferredName.trim())
      ? params.preferredName.trim()
      : (nameParts[nameParts.length - 1] || 'Học sinh');

    const grade = Number(params.gradeLevel) || 9;
    const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword(params.password, salt);

    const newUser: StoredUser = {
      id: userId,
      email: normalizedEmail,
      displayName: trimmedDisplayName,
      preferredName: preferredName,
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      ageBand: `grade_${grade}`,
      status: 'active',
      createdAt: new Date().toISOString(),
      passwordHash: hash,
      passwordSalt: salt,
    };

    const newProfile: StudentProfile = {
      userId,
      gradeLevel: grade,
      schoolName: 'Trường THCS / THPT',
      goals: ['Hoàn thành tốt chương trình học kì'],
      preferredSessionMinutes: 45,
      maxDailyStudyMinutes: 180,
      energyPreferences: {
        morning: 'medium',
        afternoon: 'medium',
        evening: 'high',
      },
      sleepSchedule: {
        wakeTime: '06:00',
        bedTime: '22:30',
      },
      mealTimes: {
        lunch: '11:45',
        dinner: '18:30',
      },
    };

    // Save to MySQL in a Transaction
    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        // Check email uniqueness within transaction
        const [existing] = await conn.query<any>('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing && (existing as any[]).length > 0) {
          throw new Error('Email này đã được đăng ký. Vui lòng chuyển sang trang Đăng nhập.');
        }

        // Insert User
        await conn.execute(
          `INSERT INTO users (id, email, password_hash, password_salt, display_name, preferred_name, locale, timezone, age_band, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newUser.id,
            newUser.email,
            newUser.passwordHash,
            newUser.passwordSalt,
            newUser.displayName,
            newUser.preferredName,
            newUser.locale,
            newUser.timezone,
            newUser.ageBand,
            newUser.status,
            new Date(),
          ]
        );

        // Insert Profile
        await conn.execute(
          `INSERT INTO student_profiles (user_id, grade_level, school_name, goals_json, preferred_session_minutes, max_daily_study_minutes, energy_preferences_json, sleep_schedule_json, meal_times_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newProfile.userId,
            newProfile.gradeLevel,
            newProfile.schoolName,
            JSON.stringify(newProfile.goals),
            newProfile.preferredSessionMinutes,
            newProfile.maxDailyStudyMinutes,
            JSON.stringify(newProfile.energyPreferences),
            JSON.stringify(newProfile.sleepSchedule),
            JSON.stringify(newProfile.mealTimes),
          ]
        );
      });
    } else if (env.APP_MODE === 'production') {
      throw new Error('Cơ sở dữ liệu đang không khả dụng. Vui lòng thử lại sau.');
    }

    this.demoUsers.set(normalizedEmail, newUser);
    this.demoProfiles.set(userId, newProfile);

    // Seed default subjects and sample tasks for onboarding experience
    try {
      DemoRepository.seedUser(userId);
    } catch {
      // ignore
    }

    const { passwordHash, passwordSalt, ...safeUser } = newUser;
    return { user: safeUser, profile: newProfile };
  }
}
