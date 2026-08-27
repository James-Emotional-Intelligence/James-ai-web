import { describe, it, expect } from 'vitest';
import { isWakeWordDetected, normalizeSpeechText, normalizeVietnameseExact } from '../../src/lib/wake-word';

describe('Wake Word Normalization & Vietnamese Fuzzy Match Tests', () => {
  it('detects standard "Jami ơi" with Vietnamese diacritics and punctuation', () => {
    expect(isWakeWordDetected('Jami ơi!').matched).toBe(true);
    expect(isWakeWordDetected('jami ơi, hôm nay học gì?').matched).toBe(true);
    expect(isWakeWordDetected('  Jami ơi  ').matched).toBe(true);
    expect(isWakeWordDetected('JAMI ƠI').matched).toBe(true);
  });

  it('detects variations without diacritics "jami oi", "giami oi", "gia mi oi"', () => {
    expect(isWakeWordDetected('jami oi').matched).toBe(true);
    expect(isWakeWordDetected('gia mi oi').matched).toBe(true);
    expect(isWakeWordDetected('giami oi').matched).toBe(true);
    expect(isWakeWordDetected('cha mi oi').matched).toBe(true);
  });

  it('extracts trailing command snippet when spoken in the same utterance', () => {
    const res = isWakeWordDetected('Jami ơi mở lịch học hôm nay');
    expect(res.matched).toBe(true);
    expect(res.commandSnippet).toContain('mở lịch học hôm nay');
  });

  it('rejects unrelated speech that does not contain wake word', () => {
    expect(isWakeWordDetected('Hôm nay tôi muốn làm bài tập Toán').matched).toBe(false);
    expect(isWakeWordDetected('Chào buổi sáng mọi người').matched).toBe(false);
    expect(isWakeWordDetected('').matched).toBe(false);
    expect(isWakeWordDetected('   ').matched).toBe(false);
    expect(isWakeWordDetected('con mèo đang ngủ').matched).toBe(false);
  });

  it('normalizes speech text without accents properly', () => {
    expect(normalizeSpeechText('Chào bạn, Jami ơi!')).toBe('chao ban jami oi');
  });

  it('normalizes exact Vietnamese text removing only punctuation and extra spaces', () => {
    expect(normalizeVietnameseExact('Jami ơi, mở bài tập...')).toBe('jami ơi mở bài tập');
  });
});
