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

export const DEFAULT_MAX_SPEECH_CHARS = 220;

/**
 * Clean markdown symbols, code blocks, links, and formatting noise
 */
export function cleanSpeechText(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^]]+)\]\([^)]*\)/g, '$1')
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

  // Only if English score strictly and significantly outweighs Vietnamese score
  // and there are actual English words found, classify as English.
  // Otherwise, default to Vietnamese.
  if (enScore > 0 && enScore > viScore) {
    return 'en-US';
  }

  return 'vi-VN';
}

/**
 * Splits full text into language-tagged segments for natural bilingual TTS
 */
export function splitSpeechText(text: string, maxChars = DEFAULT_MAX_SPEECH_CHARS): string[] {
  const limit = Math.max(40, Math.floor(maxChars));
  const result: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const punctuation = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '), window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(', '));
    const whitespace = window.lastIndexOf(' ');
    const cut = punctuation >= Math.floor(limit * 0.55) ? punctuation + 1 : whitespace > 0 ? whitespace : limit;
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

export function segmentTextByLanguage(text: string, defaultLang?: SpeechLanguage, maxChars = DEFAULT_MAX_SPEECH_CHARS): SpeechSegment[] {
  const clean = cleanSpeechText(text);
  if (!clean) return [];

  // A forced language still needs bounded utterances for mobile browsers.
  if (defaultLang) {
    return splitSpeechText(clean, maxChars).map((piece) => ({ text: piece, lang: defaultLang }));
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

  // Merge adjacent segments with identical language without recreating an unbounded utterance.
  const merged: SpeechSegment[] = [];
  for (const seg of rawSegments) {
    const previous = merged[merged.length - 1];
    if (previous && previous.lang === seg.lang && previous.text.length + seg.text.length + 1 <= maxChars) {
      previous.text += ' ' + seg.text;
    } else {
      splitSpeechText(seg.text, maxChars).forEach((piece) => merged.push({ text: piece, lang: seg.lang }));
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
  const localVoices = voices.filter((voice) => voice.localService === true);
  if (localVoices.length === 0) return undefined;
  const normalizedLang = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-').toLowerCase();
  const requestedPrefix = lang === 'vi-VN' ? 'vi-' : 'en-';
  const matching = localVoices.filter((voice) => normalizedLang(voice).startsWith(requestedPrefix));
  if (matching.length === 0) return undefined;

  const savedName = typeof window !== 'undefined'
    ? window.localStorage.getItem(`jami.tts.voice.${lang}`)
    : null;
  if (savedName) {
    const saved = matching.find((voice) => voice.name === savedName);
    if (saved) return saved;
  }

  const qualityScore = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase();
    let score = voice.default ? 10 : 0;
    if (name.includes('natural')) score += 50;
    if (name.includes('hoaimy') || name.includes('hoài my')) score += 40;
    if (name.includes('namminh') || name.includes('nam minh')) score += 35;
    if (name.includes('google')) score += 20;
    if (normalizedLang(voice) === lang.toLowerCase()) score += 5;
    return score;
  };

  matching.sort((a, b) => qualityScore(b) - qualityScore(a));

  return matching[0];
}
