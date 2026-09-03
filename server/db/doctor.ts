import { db } from './mysql';
import { env, isProduction } from '../config/env';
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
  'timetable_entry_exceptions',
  'busy_events',
  'busy_event_exceptions',
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
  'execution_checklist_items',
  'tomorrow_preparation_plans',
  'tomorrow_preparation_items',
  'exam_study_plans',
  'exam_study_plan_items',
  'exam_study_plan_versions',
  'mistake_notebook_entries',
  'mistake_review_attempts',
];

export async function runDbDoctor(): Promise<DoctorReport> {
  const isHealthy = db.isHealthy();
  const maskedHost = env.AIVEN_MYSQL_HOST ? `${env.AIVEN_MYSQL_HOST.substring(0, 6)}...` : 'not_configured';

  if (!isHealthy) {
    try {
      await db.init();
    } catch {}
  }

  const pingOk = await db.pingCheck(2000);
  let tlsStatus = 'TLS Not Connected';

  if (!pingOk) {
    return {
      status: 'unreachable',
      timestamp: new Date().toISOString(),
      database: {
        host: maskedHost,
        database: env.AIVEN_MYSQL_DATABASE || 'defaultdb',
        tls: tlsStatus,
        ping: false,
      },
      migrations: { appliedCount: 0, pendingCount: 0 },
      tables: { expected: REQUIRED_TABLES.length, found: 0, missing: REQUIRED_TABLES },
      checks: [
        {
          name: 'Database Readiness Ping',
          passed: false,
          details: db.getInitError() || 'Database ping timeout or connection lost. Operating in standalone demo mode.',
        },
      ],
    };
  }

  const checks: { name: string; passed: boolean; details?: string }[] = [];

  try {
    // Check actual SSL status from database session
    const sslRows = await db.query<any>("SHOW STATUS WHERE Variable_name IN ('Ssl_cipher', 'Ssl_version')");
    const sslCipher = sslRows.find((r: any) => r.Variable_name === 'Ssl_cipher')?.Value;
    const sslVersion = sslRows.find((r: any) => r.Variable_name === 'Ssl_version')?.Value;
    const hasCa = Boolean(env.AIVEN_CA_CERT || env.AIVEN_CA_CERT_PATH);

    if (sslCipher && sslCipher.length > 0) {
      tlsStatus = hasCa ? `TLS Verified (${sslVersion || 'TLS'} - ${sslCipher})` : `TLS Active (${sslCipher}) [CA Unverified]`;
    } else {
      tlsStatus = 'No TLS (Plaintext Connection)';
    }

    checks.push({
      name: 'TLS / SSL Connection Security',
      passed: Boolean(sslCipher),
      details: tlsStatus,
    });

    // 1. Ping & Version check
    const versionRows = await db.query<any>('SELECT VERSION() as version, DATABASE() as dbName');
    const versionRow = versionRows[0];
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
      const requiredUserCols = [
        'id',
        'email',
        'password_hash',
        'password_salt',
        'password_scheme',
        'display_name',
        'preferred_name',
        'timezone',
        'role',
        'status',
        'last_active_at',
        'created_at',
      ];
      const missingUserCols = requiredUserCols.filter((c) => !userColNames.has(c));
      checks.push({
        name: 'User Auth Columns Integrity',
        passed: missingUserCols.length === 0,
        details: missingUserCols.length === 0 ? 'All 12 user runtime columns verified' : `Missing: ${missingUserCols.join(', ')}`,
      });
    }

    if (existingTables.has('auth_sessions')) {
      const sessionCols = await db.query<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_sessions'`
      );
      const sessionColNames = new Set(sessionCols.map((c) => c.COLUMN_NAME.toLowerCase()));
      const requiredSessionCols = ['token_hash', 'user_id', 'expires_at', 'revoked_at', 'is_demo', 'user_agent', 'ip_address'];
      const missingSessionCols = requiredSessionCols.filter((c) => !sessionColNames.has(c));
      checks.push({
        name: 'Auth Sessions Schema Integrity',
        passed: missingSessionCols.length === 0,
        details: missingSessionCols.length === 0 ? 'token_hash, user_id, expires_at, revoked_at, is_demo, user_agent, ip_address verified' : `Missing: ${missingSessionCols.join(', ')}`,
      });
    }

    if (existingTables.has('busy_event_exceptions')) {
      const excCols = await db.query<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'busy_event_exceptions'`
      );
      const excColNames = new Set(excCols.map((c) => c.COLUMN_NAME.toLowerCase()));
      const requiredExcCols = ['id', 'user_id', 'busy_event_id', 'occurrence_date', 'exception_type'];
      const missingExcCols = requiredExcCols.filter((c) => !excColNames.has(c));
      checks.push({
        name: 'Busy Event Exceptions Schema Integrity',
        passed: missingExcCols.length === 0,
        details: missingExcCols.length === 0 ? 'id, user_id, busy_event_id, occurrence_date, exception_type verified' : `Missing: ${missingExcCols.join(', ')}`,
      });
    }

    if (existingTables.has('jami_messages')) {
      const msgCols = await db.query<any>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jami_messages'`
      );
      const msgColNames = new Set(msgCols.map((c) => c.COLUMN_NAME.toLowerCase()));
      const hasText = msgColNames.has('text');
      const hasSender = msgColNames.has('sender');
      const hasUser = msgColNames.has('user_id');
      checks.push({
        name: 'Jami Chat Messages Table Integrity',
        passed: hasText && hasSender && hasUser,
        details: hasUser ? 'jami_messages text, sender, user_id columns verified' : 'jami_messages columns missing',
      });
    }

    const allPassed = checks.every((c) => c.passed);

    return {
      status: allPassed ? 'healthy' : 'warning',
      timestamp: new Date().toISOString(),
      database: {
        host: maskedHost,
        database: env.AIVEN_MYSQL_DATABASE || 'defaultdb',
        tls: tlsStatus,
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
        database: env.AIVEN_MYSQL_DATABASE || 'defaultdb',
        tls: tlsStatus,
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
