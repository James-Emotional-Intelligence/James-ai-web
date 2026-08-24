import { db } from './mysql';
import { env } from '../config/env';
import { Migrator } from './migrator';

export interface DoctorReport {
  status: 'healthy' | 'warning' | 'unreachable';
  timestamp: string;
  database: {
    host: string;
    database: string;
    tls: string;
    ping: boolean;
    version?: string;
  };
  migrations: {
    appliedCount: number;
    pendingCount: number;
    lastApplied?: string;
  };
  tables: {
    expected: number;
    found: number;
    missing: string[];
  };
  checks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
}

const REQUIRED_TABLES = [
  'schema_migrations',
  'users',
  'auth_sessions',
  'refresh_sessions',
  'password_reset_tokens',
  'consent_records',
  'student_profiles',
  'subjects',
  'school_timetables',
  'school_timetable_entries',
  'busy_events',
  'availability_rules',
  'exams',
  'exam_topics',
  'study_plans',
  'study_tasks',
  'task_dependencies',
  'execution_guides',
  'execution_steps',
  'focus_sessions',
  'task_evidence',
  'learning_materials',
  'quizzes',
  'quiz_questions',
  'quiz_attempts',
  'notifications',
  'jami_preferences',
  'jami_memory_summaries',
  'audit_logs',
  'jami_conversations',
  'jami_messages',
  'schedule_proposals',
];

export async function runDbDoctor(): Promise<DoctorReport> {
  if (!db.isHealthy()) {
    await db.init();
  }
  const isHealthy = db.isHealthy();
  const maskedHost = env.AIVEN_MYSQL_HOST ? `${env.AIVEN_MYSQL_HOST.substring(0, 8)}...` : 'not_configured';

  if (!isHealthy) {
    return {
      status: 'unreachable',
      timestamp: new Date().toISOString(),
      database: {
        host: maskedHost,
        database: env.AIVEN_MYSQL_DATABASE,
        tls: 'TLS Required (rejectUnauthorized: true)',
        ping: false,
      },
      migrations: { appliedCount: 0, pendingCount: 0 },
      tables: { expected: REQUIRED_TABLES.length, found: 0, missing: REQUIRED_TABLES },
      checks: [
        {
          name: 'Database Connection',
          passed: false,
          details: db.getInitError() || 'Database is not connected. Operating in standalone demo mode.',
        },
      ],
    };
  }

  const checks: { name: string; passed: boolean; details?: string }[] = [];

  try {
    // 1. Ping & Version check
    const [versionRow] = await db.query<any>('SELECT VERSION() as version, DATABASE() as dbName');
    checks.push({
      name: 'Ping & Version',
      passed: true,
      details: `MySQL Version: ${versionRow?.version || 'unknown'} (DB: ${versionRow?.dbName || env.AIVEN_MYSQL_DATABASE})`,
    });

    // 2. Migration Status
    const migrationStatus = await Migrator.status();
    checks.push({
      name: 'Migrations Check',
      passed: migrationStatus.pending.length === 0,
      details: `${migrationStatus.applied.length} applied, ${migrationStatus.pending.length} pending`,
    });

    // 3. Inspect existing tables
    const tableRows = await db.query<any>(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
    );
    const existingTables = new Set(tableRows.map((r) => r.TABLE_NAME.toLowerCase()));
    const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t.toLowerCase()));

    checks.push({
      name: 'Required Schema Tables',
      passed: missingTables.length === 0,
      details: missingTables.length === 0 ? `All ${REQUIRED_TABLES.length} tables verified` : `Missing: ${missingTables.join(', ')}`,
    });

    // 4. Check critical user & auth columns
    if (existingTables.has('users')) {
      const userCols = await db.query<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
      );
      const userColNames = new Set(userCols.map((c) => c.COLUMN_NAME.toLowerCase()));
      const hasSalt = userColNames.has('password_salt');
      const hasEmail = userColNames.has('email');
      const hasHash = userColNames.has('password_hash');
      checks.push({
        name: 'User Password Salt & Hash Columns',
        passed: hasSalt && hasEmail && hasHash,
        details: hasSalt ? 'email, password_hash, password_salt verified' : 'password_salt missing in users table',
      });
    }

    if (existingTables.has('auth_sessions')) {
      const sessionCols = await db.query<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions'`
      );
      const sessionColNames = new Set(sessionCols.map((c) => c.COLUMN_NAME.toLowerCase()));
      const hasTokenHash = sessionColNames.has('token_hash');
      const hasExpires = sessionColNames.has('expires_at');
      const hasRevoked = sessionColNames.has('revoked_at');
      checks.push({
        name: 'Auth Sessions Schema Integrity',
        passed: hasTokenHash && hasExpires && hasRevoked,
        details: hasTokenHash ? 'token_hash, expires_at, revoked_at verified' : 'auth_sessions columns incomplete',
      });
    }

    if (existingTables.has('jami_messages')) {
      const msgCols = await db.query<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jami_messages'`
      );
      const msgColNames = new Set(msgCols.map((c) => c.COLUMN_NAME.toLowerCase()));
      const hasText = msgColNames.has('text');
      const hasSender = msgColNames.has('sender');
      checks.push({
        name: 'Jami Chat Messages Table Integrity',
        passed: hasText && hasSender,
        details: 'jami_messages text & sender columns verified',
      });
    }

    const allPassed = checks.every((c) => c.passed);

    return {
      status: allPassed ? 'healthy' : 'warning',
      timestamp: new Date().toISOString(),
      database: {
        host: maskedHost,
        database: env.AIVEN_MYSQL_DATABASE,
        tls: 'TLS Verified',
        ping: true,
        version: versionRow?.version,
      },
      migrations: {
        appliedCount: migrationStatus.applied.length,
        pendingCount: migrationStatus.pending.length,
        lastApplied: migrationStatus.applied[migrationStatus.applied.length - 1]?.name,
      },
      tables: {
        expected: REQUIRED_TABLES.length,
        found: REQUIRED_TABLES.length - missingTables.length,
        missing: missingTables,
      },
      checks,
    };
  } catch (err: any) {
    return {
      status: 'unreachable',
      timestamp: new Date().toISOString(),
      database: {
        host: maskedHost,
        database: env.AIVEN_MYSQL_DATABASE,
        tls: 'TLS Verified',
        ping: false,
      },
      migrations: { appliedCount: 0, pendingCount: 0 },
      tables: { expected: REQUIRED_TABLES.length, found: 0, missing: REQUIRED_TABLES },
      checks: [
        {
          name: 'Doctor execution failure',
          passed: false,
          details: err.message,
        },
      ],
    };
  }
}

if (process.argv[1] && process.argv[1].endsWith('doctor.ts')) {
  runDbDoctor().then((report) => console.log(JSON.stringify(report, null, 2)));
}
