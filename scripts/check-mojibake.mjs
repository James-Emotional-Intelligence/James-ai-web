import fs from 'fs';
import path from 'path';
import process from 'node:process';

// Known mojibake markers when UTF-8 Vietnamese is double-encoded or interpreted as CP1252/Latin1
const MOJIBAKE_PATTERNS = [
  /Ã[¡-¿]/,
  /Ä[‘-™\u0080-\u009F]/,
  /áº[¡-¿]/,
  /á»[¡-¿]/,
  /Æ[¡-¿]/,
  /â€[¡-¿]/,
  /ChÆ°a/,
  /thá»±c/,
  /Ä‘Äƒng/,
  /nháº­p/,
  /HÃ´m/,
  /báº¡n/,
  /thá»i/,
  /khÃ³a/,
  /biá»ƒu/,
];

function checkFile(filePath, violations) {
  if (!/\.(ts|tsx|js|mjs|json|sql)$/.test(filePath)) return;
  if (filePath.includes('node_modules') || filePath.includes('dist') || filePath.includes('.git') || filePath.includes('release-package')) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of MOJIBAKE_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          preview: line.trim().slice(0, 120),
          pattern: pattern.toString(),
        });
        break;
      }
    }
  }
}

function walkDir(dir, violations) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        walkDir(fullPath, violations);
      }
    } else {
      checkFile(fullPath, violations);
    }
  }
}

export function runMojibakeCheck() {
  const violations = [];
  const targetDirs = ['server', 'src', 'shared', 'tests'];

  for (const dir of targetDirs) {
    walkDir(path.resolve(process.cwd(), dir), violations);
  }

  return violations;
}

const violations = runMojibakeCheck();

if (violations.length > 0) {
  console.error(`[Mojibake Check FAILED] Found ${violations.length} lines with mojibake characters:`);
  for (const v of violations.slice(0, 30)) {
    console.error(`  - ${v.file}:${v.line}: ${v.preview}`);
  }
  if (violations.length > 30) {
    console.error(`  ... and ${violations.length - 30} more violations.`);
  }
  process.exit(1);
} else {
  console.log('[Mojibake Check PASSED] Zero mojibake characters found in source files.');
  process.exit(0);
}
