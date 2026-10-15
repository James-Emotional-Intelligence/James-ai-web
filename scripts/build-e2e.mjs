import { spawnSync } from 'node:child_process';

for (const script of ['build:client', 'build:server']) {
  const result = spawnSync(`npm run ${script}`, {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, VITE_JAMI_TTS_MODE: 'browser-local' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
