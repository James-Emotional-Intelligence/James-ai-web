/* global console */
import fs from 'fs';
import path from 'path';
import process from 'process';

const src = path.join(process.cwd(), 'server', 'db', 'migrations');
const dest = path.join(process.cwd(), 'dist', 'server', 'migrations');

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src);
  for (const file of files) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
  console.log(`[copy-migrations] Copied ${files.length} migration files to ${dest}`);
} else {
  console.warn(`[copy-migrations] Source directory ${src} not found.`);
}
