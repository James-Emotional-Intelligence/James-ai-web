import { db } from '../server/db/mysql';
import { storageService, generateMaterialStorageKey, getUserDirHash } from '../server/services/storage-service';
import { env } from '../server/config/env';
import crypto from 'crypto';

interface MigrationOptions {
  execute: boolean;
  limit?: number;
  userId?: string;
  materialId?: string;
  resume: boolean;
}

function parseCliArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  let execute = false;
  let limit: number | undefined = undefined;
  let userId: string | undefined = undefined;
  let materialId: string | undefined = undefined;
  let resume = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--execute') {
      execute = true;
    } else if (arg === '--dry-run') {
      execute = false;
    } else if (arg === '--resume') {
      resume = true;
    } else if (arg === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--user-id' && args[i + 1]) {
      userId = args[i + 1];
      i++;
    } else if (arg === '--material-id' && args[i + 1]) {
      materialId = args[i + 1];
      i++;
    }
  }

  return { execute, limit, userId, materialId, resume };
}

async function runMigration() {
  const startTime = Date.now();
  const options = parseCliArgs();

  console.log('================================================================');
  console.log(' JAMI AI Storage Migration: Cloudflare R2/S3 -> Local Storage');
  console.log('================================================================');
  console.log(` Mode:        ${options.execute ? '🔴 EXECUTE (live migration)' : '🟡 DRY-RUN (simulation only)'}`);
  console.log(` Resume:      ${options.resume ? 'Yes (skip existing local files)' : 'No'}`);
  if (options.limit) console.log(` Limit:       ${options.limit} files`);
  if (options.userId) console.log(` User ID:     ${options.userId}`);
  if (options.materialId) console.log(` Material ID: ${options.materialId}`);
  console.log('----------------------------------------------------------------\n');

  const r2Adapter = storageService.getAdapter('r2');
  const localAdapter = storageService.getAdapter('local');

  // Verify storage health
  const localHealth = await localAdapter.checkHealth?.();
  if (localHealth && !localHealth.ready) {
    console.error(`❌ Local storage is not ready: ${localHealth.reason || 'Unknown error'}`);
    process.exit(1);
  }
  console.log(`✔ Local storage adapter ready.`);

  let materials: Array<{
    id: string;
    user_id: string;
    title: string;
    file_name: string | null;
    original_filename: string | null;
    mime_type: string | null;
    detected_mime: string | null;
    r2_object_key: string | null;
    storage_key: string | null;
    storage_driver: string | null;
    size_bytes: number | null;
    sha256: string | null;
  }> = [];

  if (db.isHealthy()) {
    let sql = `SELECT id, user_id, title, file_name, original_filename, mime_type, detected_mime,
                      r2_object_key, storage_key, storage_driver, size_bytes, sha256
               FROM learning_materials
               WHERE deleted_at IS NULL`;
    const params: any[] = [];

    if (options.userId) {
      sql += ' AND user_id = ?';
      params.push(options.userId);
    }
    if (options.materialId) {
      sql += ' AND id = ?';
      params.push(options.materialId);
    }
    if (!options.materialId && !options.userId) {
      // By default find R2 records
      sql += " AND (storage_driver = 'r2' OR (r2_object_key IS NOT NULL AND storage_driver != 'local'))";
    }

    sql += ' ORDER BY created_at ASC';
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    materials = await db.query<any>(sql, params);
  } else {
    console.log('ℹ Running against demo/in-memory repository (Database offline)');
  }

  console.log(`Found ${materials.length} material(s) to inspect.\n`);

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let totalBytesTransferred = 0;

  for (const row of materials) {
    scanned++;
    const filename = row.original_filename || row.file_name || 'unnamed.bin';
    const mime = row.detected_mime || row.mime_type || 'application/octet-stream';
    const sourceKey = row.storage_key || row.r2_object_key;
    const targetKey = row.storage_key || generateMaterialStorageKey(row.user_id, row.id, filename, mime);

    console.log(`[${scanned}/${materials.length}] Material: ${row.id} - "${row.title}"`);
    console.log(`   Source R2 Key:     ${sourceKey || '(none)'}`);
    console.log(`   Target Local Key:  ${targetKey}`);

    if (!sourceKey) {
      console.warn(`   ⚠️ Warning: No source storage key or r2_object_key found. Skipping.`);
      skipped++;
      continue;
    }

    // Check if target file already exists in local storage
    if (options.resume) {
      const localStat = await localAdapter.stat(targetKey);
      if (localStat.exists) {
        console.log(`   ✔ Already exists on local storage (${localStat.size} bytes). Reconciling database.`);
        if (options.execute && db.isHealthy()) {
          await db.execute(
            `UPDATE learning_materials 
             SET storage_driver = 'local', storage_key = ?, updated_at = NOW() 
             WHERE id = ?`,
            [targetKey, row.id]
          );
        }
        skipped++;
        continue;
      }
    }

    try {
      if (options.execute) {
        // Read file buffer from R2
        const buffer = await r2Adapter.readBuffer(sourceKey);
        if (!buffer || buffer.length === 0) {
          throw new Error(`Downloaded empty buffer from R2 key: ${sourceKey}`);
        }

        const calculatedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

        // If existing sha256 exists and differs, warn
        if (row.sha256 && row.sha256 !== calculatedSha256) {
          console.warn(`   ⚠️ Checksum discrepancy: DB=${row.sha256} vs Downloaded=${calculatedSha256}`);
        }

        // Save file to Local storage adapter
        const storedFile = await localAdapter.save({
          key: targetKey,
          body: buffer,
          contentType: mime,
          originalFilename: filename,
        });

        // Verify that local file is written and intact
        const verifyStat = await localAdapter.stat(targetKey);
        if (!verifyStat.exists || verifyStat.size !== buffer.length) {
          throw new Error(`Verification failed: Local file size ${verifyStat.size} != source size ${buffer.length}`);
        }

        // Update database record
        if (db.isHealthy()) {
          await db.execute(
            `UPDATE learning_materials
             SET storage_driver = 'local',
                 storage_key = ?,
                 sha256 = ?,
                 size_bytes = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [targetKey, calculatedSha256, buffer.length, row.id]
          );
        }

        totalBytesTransferred += buffer.length;
        migrated++;
        console.log(`   ✔ Migrated successfully (${buffer.length} bytes, sha256: ${calculatedSha256.substring(0, 10)}...)`);
      } else {
        // Dry-run mode: check if source exists in R2
        const r2Stat = await r2Adapter.stat(sourceKey);
        if (r2Stat.exists) {
          console.log(`   [DRY-RUN] File exists in R2 (${r2Stat.size} bytes). Ready to copy to ${targetKey}`);
          totalBytesTransferred += r2Stat.size || 0;
          migrated++;
        } else {
          console.warn(`   [DRY-RUN] ⚠️ Source file not found in R2: ${sourceKey}`);
          failed++;
        }
      }
    } catch (err: any) {
      console.error(`   ❌ Failed to migrate material ${row.id}: ${err.message}`);
      failed++;
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const transferredMb = (totalBytesTransferred / (1024 * 1024)).toFixed(2);

  console.log('\n================================================================');
  console.log(' Storage Migration Summary');
  console.log('================================================================');
  console.log(` Mode:               ${options.execute ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(` Scanned:            ${scanned}`);
  console.log(` Migrated:           ${migrated}`);
  console.log(` Skipped / Resumed:  ${skipped}`);
  console.log(` Failed:             ${failed}`);
  console.log(` Data Transferred:   ${transferredMb} MB (${totalBytesTransferred} bytes)`);
  console.log(` Duration:           ${durationSec}s`);
  console.log('================================================================\n');

  if (!options.execute && migrated > 0) {
    console.log('💡 To perform the actual migration, run with the --execute flag:');
    console.log('   npm run storage:migrate:r2-to-local -- --execute\n');
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration fatal error:', err);
    process.exit(1);
  });
