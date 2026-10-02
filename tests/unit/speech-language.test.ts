import { describe, it, expect } from 'vitest';
import {
  cleanSpeechText,
  detectSegmentLanguage,
  segmentTextByLanguage,
  findOptimalVoice,
} from '../../src/lib/speech-language';

describe('Speech Language Detection & Segmentation Unit Tests', () => {
  describe('cleanSpeechText', () => {
    it('strips code blocks, markdown symbols, and urls cleanly', () => {
      const input = 'Chào em! Xem code tại `const a = 1;` và https://jami.edu.vn **nhé**!';
      const output = cleanSpeechText(input);
      expect(output).toBe('Chào em! Xem code tại const a = 1; và nhé!');
    });
  });

  describe('detectSegmentLanguage', () => {
    it('accurately identifies Vietnamese text with diacritics', () => {
      expect(detectSegmentLanguage('Chào bạn! Hôm nay bạn có một bài tập cần làm.')).toBe('vi-VN');
      expect(detectSegmentLanguage('Hãy mở sách giáo khoa trang 25.')).toBe('vi-VN');
      expect(detectSegmentLanguage('Chúc em hoàn thành tốt bài thi môn Tiếng Anh nhé.')).toBe('vi-VN');
    });

    it('accurately identifies English text without diacritics', () => {
      expect(detectSegmentLanguage('Hello! How can I help you today?')).toBe('en-US');
      expect(detectSegmentLanguage('What is the past tense of the verb "go"?')).toBe('en-US');
      expect(detectSegmentLanguage('Great job! That is the correct answer.')).toBe('en-US');
      expect(detectSegmentLanguage('Where do you live?')).toBe('en-US');
      expect(detectSegmentLanguage('The sun rises in the east.')).toBe('en-US');
    });

    it('handles short English phrases', () => {
      expect(detectSegmentLanguage('Good morning!')).toBe('en-US');
      expect(detectSegmentLanguage('Thank you very much.')).toBe('en-US');
      expect(detectSegmentLanguage('Yes, absolutely!')).toBe('en-US');
    });
  });

  describe('segmentTextByLanguage', () => {
    it('returns a single English segment when text is purely English', () => {
      const text = 'Hello! Today we will practice English speaking and pronunciation.';
      const segments = segmentTextByLanguage(text);
      expect(segments).toHaveLength(1);
      expect(segments[0].lang).toBe('en-US');
      expect(segments[0].text).toContain('Hello!');
    });

    it('returns a single Vietnamese segment when text is purely Vietnamese', () => {
      const text = 'Chào bạn! Hôm nay chúng ta sẽ ôn tập kiến thức môn Toán lớp 9.';
      const segments = segmentTextByLanguage(text);
      expect(segments).toHaveLength(1);
      expect(segments[0].lang).toBe('vi-VN');
      expect(segments[0].text).toContain('Chào bạn!');
    });

    it('splits mixed bilingual text into proper language-tagged segments', () => {
      const text = 'Từ vựng hôm nay: "She goes to school by bus." Em hãy dịch câu này sang tiếng Việt nhé!';
      const segments = segmentTextByLanguage(text);
      
      expect(segments.length).toBeGreaterThanOrEqual(2);
      
      const enSegment = segments.find((s) => s.lang === 'en-US');
      const viSegment = segments.find((s) => s.lang === 'vi-VN');
      
      expect(enSegment).toBeDefined();
      expect(enSegment?.text).toContain('She goes to school by bus');
      expect(viSegment).toBeDefined();
    });
  });

  describe('findOptimalVoice', () => {
    const mockVoices = [
      { name: 'Microsoft HoaiMy', lang: 'vi_VN', localService: true } as any,
      { name: 'Microsoft Jenny', lang: 'en-US', localService: true } as any,
      { name: 'Google US English', lang: 'en-US', localService: false } as any,
      { name: 'Google Tiếng Việt', lang: 'vi-VN', localService: false } as any,
    ];

    it('finds Vietnamese voice for vi-VN', () => {
      const voice = findOptimalVoice(mockVoices, 'vi-VN');
      expect(voice).toBeDefined();
      expect(voice?.lang.replace('_', '-')).toBe('vi-VN');
      expect(voice?.localService).toBe(true);
    });

    it('finds English voice for en-US', () => {
      const voice = findOptimalVoice(mockVoices, 'en-US');
      expect(voice).toBeDefined();
      expect(voice?.lang).toBe('en-US');
      expect(voice?.localService).toBe(true);
    });

    it('does not select an online voice or silently fall back to another language', () => {
      expect(findOptimalVoice([{ name: 'Vietnamese Online', lang: 'vi-VN', localService: false } as any], 'vi-VN')).toBeUndefined();
      expect(findOptimalVoice([{ name: 'English local', lang: 'en-US', localService: true } as any], 'vi-VN')).toBeUndefined();
    });

    it('keeps forced-language and punctuation-free text in bounded chunks', () => {
      const text = Array.from({ length: 80 }, () => 'tiếng Việt').join(' ');
      const segments = segmentTextByLanguage(text, 'vi-VN', 100);
      expect(segments.length).toBeGreaterThan(1);
      expect(segments.every((segment) => segment.text.length <= 100 && segment.lang === 'vi-VN')).toBe(true);
    });
  });
});
