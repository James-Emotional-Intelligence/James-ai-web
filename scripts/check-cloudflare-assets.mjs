import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB limit for Cloudflare Pages / Workers static assets
const WARNING_BYTES = 20 * 1024 * 1024; // 20 MiB warning threshold
const DIST_DIR = path.resolve(process.cwd(), 'dist/client');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) {
    return arrayOfFiles;
  }
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

function main() {
  console.log(`[Cloudflare Asset Check] Scanning directory: ${DIST_DIR}`);
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[Cloudflare Asset Check] Error: Directory "${DIST_DIR}" does not exist. Run "npm run build:client" first.`);
    process.exit(1);
  }

  const files = getAllFiles(DIST_DIR);
  if (files.length === 0) {
    console.error('[Cloudflare Asset Check] Error: No files found in dist/client.');
    process.exit(1);
  }

  let oversizedCount = 0;
  let warningCount = 0;
  let largestFile = { path: '', size: 0 };
  let totalBytes = 0;

  for (const file of files) {
    const stat = fs.statSync(file);
    const size = stat.size;
    totalBytes += size;
    const relPath = path.relative(DIST_DIR, file).replace(/\\/g, '/');

    if (size > largestFile.size) {
      largestFile = { path: relPath, size };
    }

    if (size >= MAX_BYTES) {
      console.error(`[FAIL] OVERSIZED (> 25 MiB): ${relPath} (${formatBytes(size)})`);
      oversizedCount++;
    } else if (size >= WARNING_BYTES) {
      console.warn(`[WARN] Large file (> 20 MiB): ${relPath} (${formatBytes(size)})`);
      warningCount++;
    }
  }

  console.log(`[Cloudflare Asset Check] Total files: ${files.length} | Total size: ${formatBytes(totalBytes)}`);
  console.log(`[Cloudflare Asset Check] Largest file: ${largestFile.path} (${formatBytes(largestFile.size)})`);

  if (oversizedCount > 0) {
    console.error(`\n[Cloudflare Asset Check] FAILED: ${oversizedCount} file(s) exceed Cloudflare's 25 MiB limit.`);
    console.error('Please compress, transcode to video (MP4/WebM), or remove these assets before deploying.');
    process.exit(1);
  }

  console.log('[Cloudflare Asset Check] PASSED: All static assets are within Cloudflare Pages / Workers limits (< 25 MiB).\n');
  process.exit(0);
}

main();
