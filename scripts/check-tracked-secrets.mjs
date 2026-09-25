import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const violations = [];
const forbiddenName = /(^|\/)(\.env(?:\..*)?|id_rsa|.*\.(?:key|p12|pfx|bak|log))(?:$|\/)/i;
const forbiddenPath = /(^|\/)(node_modules|\.git|storage\/materials|backup|backups|test-results)(\/|$)/i;
const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];

for (const file of tracked) {
  const normalized = file.replaceAll('\\', '/');
  const publicCertificate = normalized === 'certs/ca.pem';
  if ((!publicCertificate && forbiddenName.test(normalized)) || forbiddenPath.test(normalized)) {
    if (!/^\.env\.example$/.test(normalized)) violations.push(`${file}: forbidden tracked path`);
    continue;
  }
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2 * 1024 * 1024 || normalized.startsWith('tests/')) continue;
  const content = fs.readFileSync(absolute, 'utf8');
  const hasConfiguredSecret = content.split(/\r?\n/).some((line) => {
    if (!/(?:OPENAI_API_KEY|AIVEN_APP_PASSWORD|SESSION_SECRET|INTERNAL_CRON_SECRET|ADMIN_SECRET_KEY|REGISTRATION_CODE_PEPPER)\s*=/.test(line)) return false;
    const value = line.split('=', 2)[1]?.trim().replace(/^['"]|['"]$/g, '') || '';
    return value.length > 8 && !/^(your_|process\.env|jami-|undefined|null|example|changeme)/i.test(value);
  });
  if (secretPatterns.some((pattern) => pattern.test(content)) || hasConfiguredSecret) {
    violations.push(`${file}: secret-like content pattern`);
  }
}

if (violations.length > 0) {
  console.error('[Tracked secrets check FAILED]');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('[Tracked secrets check PASSED] No forbidden tracked paths or secret-like patterns found.');
}
