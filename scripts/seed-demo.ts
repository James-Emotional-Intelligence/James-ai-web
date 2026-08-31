import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/db/mysql';
import { PasswordHasher } from '../server/services/password-hasher';
import { DEMO_USER, DEMO_PROFILE } from '../server/db/demo-data';

async function seedDemoDatabase() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[SEED ERROR] Demo seeding is strictly forbidden in Production mode.');
    process.exit(1);
  }

  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('[SEED ERROR] ALLOW_DEMO_SEED must be set to "true" to run database seeding.');
    process.exit(1);
  }

  const demoPassword = process.env.DEMO_USER_PASSWORD;
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!demoPassword) {
    console.error('[SEED ERROR] DEMO_USER_PASSWORD environment variable is required for seeding.');
    process.exit(1);
  }

  console.log('[SEED] Connecting to database...');
  const connected = await db.init();
  if (!connected) {
    console.error('[SEED ERROR] Failed to connect to MySQL database.');
    process.exit(1);
  }

  try {
    // 1. Seed Demo Student
    const existingStudent = await db.query<any>('SELECT id FROM users WHERE email = ?', [DEMO_USER.email.toLowerCase()]);
    if (existingStudent.length === 0) {
      const { passwordHash, passwordSalt } = await PasswordHasher.hashPassword(demoPassword);
      await db.execute(
        `INSERT INTO users (id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, locale, timezone, age_band, role, status, created_at)
         VALUES (?, ?, ?, ?, 'scrypt', ?, ?, ?, ?, ?, 'user', 'active', NOW(3))`,
        [
          DEMO_USER.id,
          DEMO_USER.email.toLowerCase(),
          passwordHash,
          passwordSalt,
          DEMO_USER.displayName,
          DEMO_USER.preferredName,
          DEMO_USER.locale,
          DEMO_USER.timezone,
          DEMO_USER.ageBand,
        ]
      );

      await db.execute(
        `INSERT INTO student_profiles (user_id, grade_level, school_name, goals_json, preferred_session_minutes, max_daily_study_minutes, energy_preferences_json, sleep_schedule_json, meal_times_json, onboarding_completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          DEMO_USER.id,
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
      console.log('[SEED] Created demo student account.');
    } else {
      console.log('[SEED] Demo student already exists. Skipping overwrite.');
    }

    // 2. Seed Admin User if specified in env
    if (adminEmail && adminPassword) {
      const existingAdmin = await db.query<any>('SELECT id FROM users WHERE email = ?', [adminEmail.toLowerCase()]);
      if (existingAdmin.length === 0) {
        const { passwordHash, passwordSalt } = await PasswordHasher.hashPassword(adminPassword);
        const adminId = 'usr_admin_' + Date.now();
        await db.execute(
          `INSERT INTO users (id, email, password_hash, password_salt, password_scheme, display_name, preferred_name, locale, timezone, age_band, role, status, created_at)
           VALUES (?, ?, ?, ?, 'scrypt', 'Administrator', 'Admin', 'vi-VN', 'Asia/Ho_Chi_Minh', 'adult', 'admin', 'active', NOW(3))`,
          [
            adminId,
            adminEmail.toLowerCase(),
            passwordHash,
            passwordSalt,
          ]
        );
        console.log('[SEED] Created development admin account.');
      } else {
        console.log('[SEED] Admin user already exists. Skipping overwrite.');
      }
    }

    console.log('[SEED SUCCESS] Database seeding completed.');
    process.exit(0);
  } catch (err: any) {
    console.error('[SEED FAILED]:', err.message);
    process.exit(1);
  }
}

seedDemoDatabase();
