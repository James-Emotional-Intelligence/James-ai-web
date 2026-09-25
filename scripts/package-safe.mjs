import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { checkSafeArtifacts } from './check-safe-packaging.mjs';

const ALLOWED_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vitest.config.ts',
  'eslint.config.js',
  'eslint.config.mjs',
  'tailwind.config.js',
  'postcss.config.js',
  'index.html',
  'server.ts',
  'README.md',
  '.env.example',
  '.gitignore',
  'MANUAL_SECRET_ROTATION_REQUIRED.md',
]);

const ALLOWED_DIRECTORIES = new Set([
  'src',
  'server',
  'shared',
  'scripts',
  'public',
]);

const FORBIDDEN_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.staging',
  '.env.development',
  'npm-debug.log',
  'yarn-error.log',
  'storage',
  'node_modules',
]);

export function buildSafePackage(targetDir = path.join(process.cwd(), 'dist', 'release-package')) {
  console.log(`[Safe Packaging] Creating clean allowlist-based release package at: ${targetDir}`);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const rootDir = process.cwd();

  // 1. Copy allowlisted root files
  for (const fileName of ALLOWED_ROOT_FILES) {
    const srcPath = path.join(rootDir, fileName);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(targetDir, fileName));
    }
  }

  // 2. Recursive copy for allowlisted directories
  function copyDirectory(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (FORBIDDEN_FILE_NAMES.has(entry.name)) continue;
      if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
      if (entry.name.endsWith('.log')) continue;

      const srcItem = path.join(src, entry.name);
      const destItem = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'storage' || entry.name === 'dist') {
          continue;
        }
        copyDirectory(srcItem, destItem);
      } else if (entry.isFile()) {
        // Skip user-uploaded files or private keys
        if (entry.name.endsWith('.key') || entry.name.endsWith('.pem')) {
          continue;
        }
        fs.copyFileSync(srcItem, destItem);
      }
    }
  }

  for (const dirName of ALLOWED_DIRECTORIES) {
    const srcDir = path.join(rootDir, dirName);
    const destDir = path.join(targetDir, dirName);
    copyDirectory(srcDir, destDir);
  }

  // Ensure an empty storage/.gitkeep placeholder
  const storageDir = path.join(targetDir, 'storage');
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, '.gitkeep'), '# Local storage root\n');

  console.log('[Safe Packaging] Package assembled. Validating package integrity...');

  const auditResult = checkSafeArtifacts(targetDir);
  if (!auditResult.valid) {
    console.error('[Safe Packaging FAILED] Security violations found in assembled package:');
    auditResult.errors.forEach((e) => console.error(` - ${e}`));
    process.exit(1);
  }

  console.log('[Safe Packaging SUCCESS] Release package built cleanly with zero secret leaks.');
  return { success: true, packagePath: targetDir };
}

if (process.argv[1] && process.argv[1].endsWith('package-safe.mjs')) {
  buildSafePackage();
}
