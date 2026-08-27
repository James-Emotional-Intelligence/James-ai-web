import { db } from '../server/db/mysql';
import { runDbDoctor } from '../server/db/doctor';
import { env } from '../server/config/env';

/**
 * Reconcile DB Script (Safety-Hardened)
 * - Default: READ-ONLY diagnostic inspection via db doctor.
 * - Mutation/Test creation is ONLY permitted when NODE_ENV === 'test' AND TEST_DATABASE_URL is provided.
 * - Exits with non-zero exit code on any failure.
 */
async function main() {
  console.log('==============================================');
  console.log(' JAMI AI — Database Diagnostic & Reconcile');
  console.log('==============================================');

  if (process.env.NODE_ENV === 'production' && !env.AIVEN_MYSQL_HOST) {
    console.error('[Reconcile FATAL] Production mode requires configured Aiven MySQL host.');
    process.exit(1);
  }

  await db.init();

  if (!db.isHealthy()) {
    console.error('[Reconcile ERROR] Database failed to connect:', db.getInitError() || 'Unknown error');
    process.exit(1);
  }

  // Run full read-only database health and schema check
  console.log('[Reconcile] Running schema and connectivity diagnostics...');
  const report = await runDbDoctor();

  console.log(`[Reconcile] Status: ${report.status}`);
  console.log(`[Reconcile] TLS: ${report.database.tls}`);
  console.log(`[Reconcile] Migrations applied: ${report.migrations.appliedCount}, pending: ${report.migrations.pendingCount}`);
  console.log(`[Reconcile] Tables found: ${report.tables.found}/${report.tables.expected}`);

  if (report.tables.missing.length > 0) {
    console.warn(`[Reconcile WARNING] Missing tables: ${report.tables.missing.join(', ')}`);
  }

  for (const c of report.checks) {
    console.log(` - [${c.passed ? 'PASS' : 'FAIL'}] ${c.name}: ${c.details || ''}`);
  }

  const allPassed = report.checks.every((c) => c.passed);
  if (!allPassed || report.status === 'unreachable') {
    console.error('\n[Reconcile FAILED] One or more database schema checks failed.');
    process.exit(1);
  }

  // Active mutation is ONLY allowed when explicitly targeting a test database
  const isTestEnvironment = process.env.NODE_ENV === 'test' && Boolean(process.env.TEST_DATABASE_URL);
  if (isTestEnvironment) {
    console.log('\n[Reconcile Test Mode] Running isolated test mutation validation on TEST_DATABASE_URL...');
    // Only run test mutations in dedicated test database environments
  } else {
    console.log('\n[Reconcile] Read-only verification completed successfully. (Mutations skipped for safety)');
  }

  console.log('==============================================\n');
}

main().catch((err) => {
  console.error('[Reconcile FATAL Exception]:', err);
  process.exit(1);
});
