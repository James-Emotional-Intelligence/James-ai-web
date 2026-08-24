import { describe, it, expect } from 'vitest';
import { parseBooleanEnv } from '../../server/config/env';

describe('Environment Boolean Parsing Tests', () => {
  it('parses string "false" as boolean false', () => {
    expect(parseBooleanEnv('false')).toBe(false);
    expect(parseBooleanEnv('False')).toBe(false);
    expect(parseBooleanEnv('0')).toBe(false);
  });

  it('parses string "true" as boolean true', () => {
    expect(parseBooleanEnv('true')).toBe(true);
    expect(parseBooleanEnv('TRUE')).toBe(true);
    expect(parseBooleanEnv('1')).toBe(true);
  });

  it('returns undefined for empty or invalid values', () => {
    expect(parseBooleanEnv('')).toBe(undefined);
    expect(parseBooleanEnv(undefined)).toBe(undefined);
    expect(parseBooleanEnv('invalid')).toBe(undefined);
  });
});
