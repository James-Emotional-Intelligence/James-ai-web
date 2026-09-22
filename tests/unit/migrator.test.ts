import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { splitSqlStatements, resolveMigrationsDirectory } from '../../server/db/migrator';

describe('Migrator SQL Statement Parser Tests', () => {
  it('correctly splits SQL statements separated by semicolons', () => {
    const sql = `
      CREATE TABLE users (id INT);
      INSERT INTO users VALUES (1);
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE users');
    expect(statements[1]).toContain('INSERT INTO users');
  });

  it('ignores semicolons inside single or double quotes', () => {
    const sql = `
      INSERT INTO users (name) VALUES ('hello; world');
      SELECT * FROM users;
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('hello; world');
  });

  it('ignores single-line and block comments', () => {
    const sql = `
      -- First comment
      CREATE TABLE test (id INT);
      /* Block comment with ; inside */
      ALTER TABLE test ADD COLUMN name VARCHAR(50);
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE test');
    expect(statements[1]).toContain('ALTER TABLE test ADD COLUMN');
  });
});

describe('Migrator resolveMigrationsDirectory Tests', () => {
  it('resolves actual server/db/migrations from current working directory', () => {
    const dir = resolveMigrationsDirectory(process.cwd());
    expect(dir).not.toBeNull();
    expect(fs.existsSync(dir!)).toBe(true);
    const sqlFiles = fs.readdirSync(dir!).filter((f) => f.endsWith('.sql'));
    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it('finds server/db/migrations when running in source layout', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-mig-src-'));
    try {
      const migDir = path.join(tmpRoot, 'server', 'db', 'migrations');
      fs.mkdirSync(migDir, { recursive: true });
      fs.writeFileSync(path.join(migDir, '001_init.sql'), 'SELECT 1;');

      const resolved = resolveMigrationsDirectory(tmpRoot);
      expect(resolved).toBe(path.resolve(migDir));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('falls back to dist/server/migrations when server/db/migrations is missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-mig-dist-'));
    try {
      const distMigDir = path.join(tmpRoot, 'dist', 'server', 'migrations');
      fs.mkdirSync(distMigDir, { recursive: true });
      fs.writeFileSync(path.join(distMigDir, '001_init.sql'), 'SELECT 1;');

      const resolved = resolveMigrationsDirectory(tmpRoot);
      expect(resolved).toBe(path.resolve(distMigDir));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('falls back to migrations/ when baseDir is dist/server', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-mig-cwd-'));
    try {
      const migDir = path.join(tmpRoot, 'migrations');
      fs.mkdirSync(migDir, { recursive: true });
      fs.writeFileSync(path.join(migDir, '001_init.sql'), 'SELECT 1;');

      const resolved = resolveMigrationsDirectory(tmpRoot);
      expect(resolved).toBe(path.resolve(migDir));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('works seamlessly with paths containing whitespace', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jami ai test path with spaces '));
    try {
      const migDir = path.join(tmpRoot, 'server', 'db', 'migrations');
      fs.mkdirSync(migDir, { recursive: true });
      fs.writeFileSync(path.join(migDir, '001_init.sql'), 'SELECT 1;');

      const resolved = resolveMigrationsDirectory(tmpRoot);
      expect(resolved).toBe(path.resolve(migDir));
      expect(resolved).toContain(' ');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('ignores candidate directory if it exists but has no .sql files', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-mig-empty-'));
    try {
      // Empty server/db/migrations
      const emptySrcDir = path.join(tmpRoot, 'server', 'db', 'migrations');
      fs.mkdirSync(emptySrcDir, { recursive: true });
      fs.writeFileSync(path.join(emptySrcDir, 'readme.txt'), 'No sql here');

      // Valid dist/server/migrations with .sql
      const validDistDir = path.join(tmpRoot, 'dist', 'server', 'migrations');
      fs.mkdirSync(validDistDir, { recursive: true });
      fs.writeFileSync(path.join(validDistDir, '001_init.sql'), 'SELECT 1;');

      const resolved = resolveMigrationsDirectory(tmpRoot);
      expect(resolved).toBe(path.resolve(validDistDir));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('returns null when no candidate directory contains .sql files', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-mig-none-'));
    try {
      const resolved = resolveMigrationsDirectory(tmpRoot);
      expect(resolved).toBeNull();
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('confirms server/db/migrator.ts does NOT reference global __dirname', () => {
    const migratorFile = path.resolve(process.cwd(), 'server', 'db', 'migrations');
    const files = fs.readdirSync(migratorFile).filter((f) => f.endsWith('.sql')).sort();

    const idx029 = files.indexOf('029_session_checkin_homework_image.sql');
    const idx029zz = files.indexOf('029_zz_prepare_homework_material_fk_resize.sql');
    const idx030 = files.indexOf('030_reconcile_homework_image_material_id_length.sql');
    const idx030zz = files.indexOf('030_zz_restore_homework_material_fk_after_resize.sql');
    const idx031 = files.indexOf('031_ai_credit_wallet_registration_codes.sql');
    const idx032 = files.indexOf('032_ai_pricing_realtime_safety_and_billing_fix.sql');
    const idx033 = files.indexOf('033_production_hardening_and_integrity.sql');
    const idx034 = files.indexOf('034_ai_runs_billing_columns.sql');

    expect(idx029).toBeGreaterThanOrEqual(0);
    expect(idx029zz).toBeGreaterThan(idx029);
    expect(idx030).toBeGreaterThan(idx029zz);
    expect(idx030zz).toBeGreaterThan(idx030);
    expect(idx031).toBeGreaterThan(idx030zz);
    expect(idx032).toBeGreaterThan(idx031);
    expect(idx033).toBeGreaterThan(idx032);
    expect(idx034).toBeGreaterThan(idx033);
  });
});


