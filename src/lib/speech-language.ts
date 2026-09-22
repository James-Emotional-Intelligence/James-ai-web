/**
 * Speech Language Detection & Voice Selection Utilities
 * Enables crisp, natural pronunciation for Vietnamese, English, and bilingual responses.
 */

const VIETNAMESE_DIACRITICS_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;

const COMMON_VI_WORDS = new Set([
  'là', 'và', 'của', 'có', 'được', 'cho', 'trong', 'với', 'không', 'đang', 'đã', 'sẽ',
  'bạn', 'em', 'tôi', 'mình', 'chúng', 'các', 'những', 'này', 'đó', 'khi', 'nào', 'ở',
  'đến', 'từ', 'về', 'như', 'để', 'hãy', 'nhé', 'ơi', 'jami', 'học', 'bài', 'tập',
  'lịch', 'ngày', 'mai', 'hôm', 'nay', 'giờ', 'phút', 'tiết', 'môn', 'toán', 'văn', 'anh',
  'chào', 'xin', 'cảm', 'ơn', 'giúp', 'thực', 'hành', 'ôn', 'thi', 'làm', 'câu', 'hỏi',
  'trả', 'lời', 'đúng', 'sai', 'nghĩa', 'ngữ', 'pháp', 'vựng', 'sách', 'chương', 'phần'
]);

const COMMON_EN_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on',
  'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we',
  'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
  'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
  'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into',
  'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now',
  'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any',
  'these', 'give', 'day', 'most', 'us', 'hello', 'hi', 'please', 'answer', 'question',
  'practice', 'english', 'grammar', 'vocabulary', 'sentence', 'lesson', 'chapter', 'reading',
  'listen', 'write', 'speak', 'correct', 'incorrect', 'choose', 'complete', 'great', 'job',
  'where', 'why', 'whose', 'whom', 'wherever', 'whenever', 'yes', 'sure', 'fine', 'thank',
  'thanks', 'welcome', 'here', 'is', 'are', 'was', 'were', 'am', 'been', 'being', 'had',
  'does', 'did', 'doing', 'shall', 'should', 'might', 'must'
]);

export type SpeechLanguage = 'vi-VN' | 'en-US';

export interface SpeechSegment {
  text: string;
  lang: SpeechLanguage;
}

/**
 * Clean markdown symbols, code blocks, links, and formatting noise
 */
export function cleanSpeechText(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#~>[\]]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect language of a single sentence or text fragment
 */
export function detectSegmentLanguage(text: string): SpeechLanguage {
  const trimmed = text.trim();
  if (!trimmed) return 'vi-VN';

  // 1. If text has explicit Vietnamese diacritics, it is definitively Vietnamese
  if (VIETNAMESE_DIACRITICS_REGEX.test(trimmed)) {
    return 'vi-VN';
  }

  // 2. Tokenize words
  const words = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) return 'vi-VN';

  let viScore = 0;
  let enScore = 0;

  for (const word of words) {
    if (COMMON_VI_WORDS.has(word)) viScore += 2;
    if (COMMON_EN_WORDS.has(word)) enScore += 2;
  }

  // If English score outweighs Vietnamese score
  if (enScore > viScore) {
    return 'en-US';
  }

  // If text is ASCII and contains multiple English words or looks like English sentence
  const isAscii = /^[\u0020-\u007E\t\n\r]*$/.test(trimmed);
  if (isAscii && (enScore > 0 || (words.length >= 2 && viScore === 0))) {
    return 'en-US';
  }

  return 'vi-VN';
}

/**
 * Splits full text into language-tagged segments for natural bilingual TTS
 */
export function segmentTextByLanguage(text: string, defaultLang?: SpeechLanguage): SpeechSegment[] {
  const clean = cleanSpeechText(text);
  if (!clean) return [];

  // If defaultLang is explicitly forced, return single segment
  if (defaultLang) {
    return [{ text: clean, lang: defaultLang }];
  }

  // Split by line breaks, quotes, or punctuation boundaries
  const rawPieces = clean
    .split(/(?<=[.!?:\n])\s+|(?=["“”'«»])|(?<=["“”'«»])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (rawPieces.length === 0) {
    return [{ text: clean, lang: detectSegmentLanguage(clean) }];
  }

  const rawSegments: SpeechSegment[] = [];
  for (const piece of rawPieces) {
    if (piece.length <= 1 && !/[a-zA-Z0-9]/.test(piece)) {
      if (rawSegments.length > 0) {
        rawSegments[rawSegments.length - 1].text += ' ' + piece;
      }
      continue;
    }

    const lang = detectSegmentLanguage(piece);
    rawSegments.push({ text: piece, lang });
  }

  // Merge adjacent segments with identical language
  const merged: SpeechSegment[] = [];
  for (const seg of rawSegments) {
    if (merged.length > 0 && merged[merged.length - 1].lang === seg.lang) {
      merged[merged.length - 1].text += ' ' + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged.length > 0 ? merged : [{ text: clean, lang: 'vi-VN' }];
}

/**
 * Finds the optimal voice for the given language from browser's available voices
 */
export function findOptimalVoice(
  voices: SpeechSynthesisVoice[],
  lang: SpeechLanguage
): SpeechSynthesisVoice | undefined {
  if (!voices || voices.length === 0) return undefined;

  if (lang === 'vi-VN') {
    return (
      voices.find(
        (v) =>
          (v.name.includes('Natural') || v.name.includes('Online')) &&
          (v.lang === 'vi-VN' || v.lang === 'vi_VN')
      ) ||
      voices.find((v) => v.lang === 'vi-VN' || v.lang === 'vi_VN') ||
      voices.find((v) => v.lang.startsWith('vi')) ||
      voices.find((v) => v.name.toLowerCase().includes('vietnam'))
    );
  }

  // English: Look for Natural/Online US or UK English voices
  return (
    voices.find(
      (v) =>
        (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google')) &&
        (v.lang.startsWith('en-US') || v.lang.startsWith('en_US'))
    ) ||
    voices.find((v) => v.lang === 'en-US' || v.lang === 'en_US') ||
    voices.find(
      (v) =>
        (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google')) &&
        v.lang.startsWith('en')
    ) ||
    voices.find((v) => v.lang.startsWith('en'))
  );
}
