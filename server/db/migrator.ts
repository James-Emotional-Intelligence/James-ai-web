import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from './mysql';
import { env, isProduction } from '../config/env';

export interface MigrationRecord {
  id: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

export function splitSqlStatements(content: string): string[] {
  const statements: string[] = [];
  let currentStatement = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++; // skip '/'
      }
      continue;
    }

    if (inSingleQuote) {
      currentStatement += char;
      if (char === '\\') {
        if (nextChar) {
          currentStatement += nextChar;
          i++;
        }
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      currentStatement += char;
      if (char === '\\') {
        if (nextChar) {
          currentStatement += nextChar;
          i++;
        }
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inBacktick) {
      currentStatement += char;
      if (char === '`') {
        inBacktick = false;
      }
      continue;
    }

    // Check for start of comments
    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === '#' && (i === 0 || content[i - 1] === '\n' || content[i - 1] === ' ' || content[i - 1] === '\t')) {
      inLineComment = true;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // String delimiter checks
    if (char === "'") {
      inSingleQuote = true;
      currentStatement += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      currentStatement += char;
      continue;
    }

    if (char === '`') {
      inBacktick = true;
      currentStatement += char;
      continue;
    }

    // Terminating semicolon
    if (char === ';') {
      const trimmed = currentStatement.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      currentStatement = '';
      continue;
    }

    currentStatement += char;
  }

  const lastTrimmed = currentStatement.trim();
  if (lastTrimmed.length > 0) {
    statements.push(lastTrimmed);
  }

  return statements;
}

/**
 * Pure helper function to resolve the active SQL migrations directory.
 * Cross-platform, handles paths with spaces, and supports both dev (source) and prod (bundled).
 *
 * Checks in priority order:
 * 1. <baseDir>/server/db/migrations (source execution via tsx)
 * 2. <baseDir>/dist/server/migrations (bundled execution from project root)
 * 3. <baseDir>/migrations (bundled execution when cwd is dist/server)
 */
export function resolveMigrationsDirectory(baseDir: string = process.cwd()): string | null {
  const candidateDirs = [
    path.resolve(baseDir, 'server', 'db', 'migrations'),
    path.resolve(baseDir, 'dist', 'server', 'migrations'),
    path.resolve(baseDir, 'migrations'),
  ];

  for (const dir of candidateDirs) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const sqlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
        if (sqlFiles.length > 0) {
          return dir;
        }
      }
    } catch {
      // Ignore errors and continue to next candidate
    }
  }

  return null;
}

export class Migrator {
  public static async initMigrationTable(): Promise<void> {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        checksum VARCHAR(64) NOT NULL,
        applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await db.execute(createTableSql);
  }

  public static async getAppliedMigrations(): Promise<MigrationRecord[]> {
    await this.initMigrationTable();
    const rows = await db.query<any>('SELECT id, name, checksum, applied_at as appliedAt FROM schema_migrations ORDER BY id ASC');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      checksum: r.checksum,
      appliedAt: r.appliedAt?.toISOString?.() || String(r.appliedAt),
    }));
  }

  public static async run(): Promise<{ applied: string[]; alreadyUpToDate: boolean }> {
    if (!db.isHealthy()) {
      await db.init();
    }
    if (!db.isHealthy()) {
      const err = db.getInitError() || 'Lỗi kết nối MySQL không xác định';
      throw new Error(`Database is not connected. Cannot run migrations: ${err}`);
    }

    // Acquire MySQL named lock to prevent concurrent migrations
    let lockAcquired = false;
    try {
      const lockRes = await db.query<any>('SELECT GET_LOCK(?, 10) as lockAcquired', ['jami_migration_lock']);
      if (lockRes && (lockRes[0]?.lockAcquired === 1 || lockRes[0]?.lockAcquired === '1')) {
        lockAcquired = true;
      }
    } catch (lockErr: any) {
      console.warn('[JAMI Migrator] Lỗi khi yêu cầu GET_LOCK:', lockErr.message);
    }

    if (!lockAcquired) {
      throw new Error('[JAMI Migrator] Không thể lấy khóa migration (GET_LOCK jami_migration_lock). Một tiến trình migration khác đang thực thi.');
    }

    try {
      await this.initMigrationTable();
      const applied = await this.getAppliedMigrations();
      const appliedMap = new Map<string, string>();
      for (const m of applied) {
        appliedMap.set(m.name, m.checksum);
      }

      const migrationsDir = resolveMigrationsDirectory();

      if (!migrationsDir) {
        const candidatePaths = [
          path.resolve(process.cwd(), 'server', 'db', 'migrations'),
          path.resolve(process.cwd(), 'dist', 'server', 'migrations'),
          path.resolve(process.cwd(), 'migrations'),
        ];
        const errMsg = `[JAMI Migrator FATAL] Không tìm thấy thư mục migrations chứa các tệp .sql hợp lệ. Đã kiểm tra:\n  - ${candidatePaths.join('\n  - ')}`;
        if (isProduction) {
          throw new Error(errMsg);
        } else {
          console.warn(errMsg);
          return { applied: [], alreadyUpToDate: false };
        }
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      const newlyApplied: string[] = [];

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const normalizedContent = content.replace(/\r\n/g, '\n');
        const checksum = crypto.createHash('sha256').update(normalizedContent).digest('hex');

        if (appliedMap.has(file)) {
          const existingChecksum = appliedMap.get(file);
          if (existingChecksum && existingChecksum !== checksum) {
            const errorMsg = `Migration ${file} checksum mismatch! Applied: ${existingChecksum.substring(0, 8)}, Current file: ${checksum.substring(0, 8)}`;
            if (isProduction) {
              throw new Error(`[JAMI Migrator FATAL] ${errorMsg}. Unapproved migration modification in Production.`);
            } else {
              console.warn(`[JAMI Migrator] Notice: ${errorMsg}`);
            }
          }
          continue;
        }

        console.log(`[JAMI Migrator] Applying migration: ${file}...`);
        const statements = splitSqlStatements(content);
        console.log(`[JAMI Migrator] Found ${statements.length} executable SQL statements in ${file}`);

        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i];
          try {
            await db.execute(stmt);
          } catch (stmtErr: any) {
            const isDuplicate =
              stmtErr.code === 'ER_DUP_FIELDNAME' ||
              stmtErr.code === 'ER_DUP_KEYNAME' ||
              stmtErr.code === 'ER_FK_DUP_NAME' ||
              stmtErr.code === 'ER_DUP_KEY' ||
              stmtErr.errno === 1060 ||
              stmtErr.errno === 1061 ||
              stmtErr.errno === 1826 ||
              stmtErr.errno === 1022;
            if (isDuplicate) {
              console.log(`[JAMI Migrator] Notice: Column/Key/FK constraint already exists in statement #${i + 1}, continuing idempotently.`);
            } else {
              console.error(`[JAMI Migrator ERROR] Statement ${i + 1}/${statements.length} failed in ${file}:`, stmtErr.message);
              throw new Error(`Migration ${file} failed at statement #${i + 1}: ${stmtErr.message}`, { cause: stmtErr });
            }
          }
        }

        await db.execute(
          'INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)',
          [file, checksum, new Date()]
        );

        newlyApplied.push(file);
        console.log(`[JAMI Migrator] Successfully applied: ${file} (checksum: ${checksum.substring(0, 10)})`);
      }

      return {
        applied: newlyApplied,
        alreadyUpToDate: newlyApplied.length === 0,
      };
    } finally {
      if (lockAcquired) {
        try {
          await db.query('SELECT RELEASE_LOCK(?)', ['jami_migration_lock']);
        } catch {}
      }
    }
  }

  public static async status(): Promise<{ total: number; applied: MigrationRecord[]; pending: string[] }> {
    if (!db.isHealthy()) {
      return { total: 0, applied: [], pending: [] };
    }

    try {
      const applied = await this.getAppliedMigrations();
      const appliedNames = new Set(applied.map((m) => m.name));

      const migrationsDir = resolveMigrationsDirectory();
      let files: string[] = [];
      if (migrationsDir) {
        files = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort();
      }

      const pending = files.filter((f) => !appliedNames.has(f));

      return {
        total: files.length,
        applied,
        pending,
      };
    } catch {
      return { total: 0, applied: [], pending: [] };
    }
  }
}
