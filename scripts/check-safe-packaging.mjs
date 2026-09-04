/* global console */
import fs from 'fs';
import path from 'path';
import process from 'process';

// Checks that sensitive and non-portable files are never packaged into source releases
const FORBIDDEN_PATTERNS = [
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\.production$/,
  /^node_modules/,
  /^\.git/,
  /^storage\/(?!test-fixtures)/,
  /^dist/,
  /^coverage/,
  /^test-results/,
  /^playwright-report/,
];

const SENSITIVE_CONTENT_PATTERNS = [
  /AIVEN_APP_PASSWORD\s*=\s*['"]?[a-zA-Z0-9_-]{8,}['"]?/,
  /SESSION_SECRET\s*=\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/,
  /INTERNAL_CRON_SECRET\s*=\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

export function checkSafeArtifacts(rootDir = process.cwd()) {
  const errors = [];

  function scanDir(dir, relativePath = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const rel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      // Check forbidden patterns
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(rel) && rel !== '.gitignore' && rel !== '.env.example') {
          if (process.env.CHECK_RELEASE_PACKAGE === 'true') {
            errors.push(`Release package must not contain: ${rel}`);
          }
        }
      }

      if (entry.isFile() && !rel.startsWith('node_modules') && !rel.startsWith('.git') && !rel.startsWith('dist')) {
        // Inspect content for accidentally committed secrets
        if (rel.endsWith('.ts') || rel.endsWith('.tsx') || rel.endsWith('.js') || rel.endsWith('.mjs') || rel.endsWith('.json')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            for (const secretPat of SENSITIVE_CONTENT_PATTERNS) {
              if (secretPat.test(content)) {
                errors.push(`Sensitive secret pattern detected in ${rel}`);
              }
            }
          } catch {}
        }
      }

      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'storage') {
        scanDir(fullPath, rel);
      }
    }
  }

  scanDir(rootDir);

  return {
    valid: errors.length === 0,
    errors,
  };
}

if (process.argv[1] && process.argv[1].endsWith('check-safe-packaging.mjs')) {
  const result = checkSafeArtifacts();
  if (!result.valid) {
    console.error('[Security Check FAILED]:');
    result.errors.forEach((e) => console.error(' - ' + e));
    process.exit(1);
  } else {
    console.log('[Security Check PASSED] No secret leaks detected in codebase.');
  }
}
