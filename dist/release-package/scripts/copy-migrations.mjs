import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const src = path.resolve(process.cwd(), 'server', 'db', 'migrations');
const dest = path.resolve(process.cwd(), 'dist', 'server', 'migrations');

if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
  console.error(`[copy-migrations ERROR] Source migrations directory not found: ${src}`);
  process.exit(1);
}

const sqlFiles = fs.readdirSync(src).filter((f) => f.endsWith('.sql'));

if (sqlFiles.length === 0) {
  console.error(`[copy-migrations ERROR] No .sql migration files found in source: ${src}`);
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
for (const file of sqlFiles) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log(`[copy-migrations] Copied ${sqlFiles.length} SQL migration files to ${dest}`);
