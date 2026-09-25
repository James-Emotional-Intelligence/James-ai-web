import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { buildSafePackage } from './package-safe.mjs';
import { checkSafeArtifacts } from './check-safe-packaging.mjs';

export function createReleaseArchive() {
  execFileSync(process.execPath, [path.resolve(process.cwd(), 'scripts/check-tracked-secrets.mjs')], { stdio: 'inherit' });
  const result = buildSafePackage();
  if (!result.success) {
    console.error('[release-archive ERROR] buildSafePackage failed.');
    process.exit(1);
  }

  const packageDir = result.packagePath;
  const audit = checkSafeArtifacts(packageDir);
  if (!audit.valid) {
    console.error('[release-archive ERROR] Packaging audit failed with security issues.');
    process.exit(1);
  }

  const artifactDir = path.resolve(process.cwd(), 'release-artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
  const archivePath = path.join(artifactDir, `jami-ai-release-${stamp}.zip`);
  const sourceGlob = path.join(packageDir, '*');

  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Compress-Archive -Path ${psLiteral(sourceGlob)} -DestinationPath ${psLiteral(archivePath)} -Force`], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-qr', archivePath, '.'], { cwd: packageDir, stdio: 'inherit' });
  }

  const extractDir = fs.mkdtempSync(path.join(artifactDir, 'verify-'));
  try {
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -Path ${psLiteral(archivePath)} -DestinationPath ${psLiteral(extractDir)} -Force`], { stdio: 'inherit' });
    } else {
      execFileSync('unzip', ['-q', archivePath, '-d', extractDir], { stdio: 'inherit' });
    }
    const extractedAudit = checkSafeArtifacts(extractDir);
    if (!extractedAudit.valid) {
      throw new Error(`Archive inspection failed: ${extractedAudit.errors.join('; ')}`);
    }
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }

  console.log(`[release-archive SUCCESS] Clean release archive created at: ${archivePath}`);
  return archivePath;
}

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

if (process.argv[1] && process.argv[1].endsWith('release-archive.mjs')) {
  createReleaseArchive();
}
