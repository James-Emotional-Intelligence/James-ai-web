import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { checkSafeArtifacts } from '../../scripts/check-safe-packaging.mjs';

describe('Safe Packaging & Secret Leak Prevention Unit Tests', () => {
  it('passes on a clean directory containing only safe files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-safe-pkg-test-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');
      fs.writeFileSync(path.join(tempDir, '.env.example'), 'SAMPLE_KEY=placeholder');
      fs.writeFileSync(path.join(tempDir, '.gitignore'), '.env\nnode_modules\n');
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const hello = "world";');

      const result = checkSafeArtifacts(tempDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails if .env or .env.production exists in release artifact', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-leak-env-test-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');
      fs.writeFileSync(path.join(tempDir, '.env'), 'OPENAI_API_KEY=sk-test1234567890');

      const result = checkSafeArtifacts(tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('forbidden resource'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails if sensitive credential patterns are found in source files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jami-leak-secret-test-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test"}');
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(
        path.join(tempDir, 'src', 'config.ts'),
        'export const SESSION_SECRET = "super-secret-key-that-was-leaked-123456";'
      );

      const result = checkSafeArtifacts(tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Sensitive secret pattern detected'))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
