/**
 * Wake-word normalization and matching utility for "Jami ơi"
 * Handles speech recognition variations, punctuation, diacritics, and fuzzy Vietnamese matches.
 */

export function normalizeSpeechText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accent marks for fuzzy match
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, ' ') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeVietnameseExact(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WAKE_PHRASES_NORMALIZED = [
  'jami oi',
  'jami',
  'giami oi',
  'gia mi oi',
  'giami',
  'gia mi',
  'cha mi oi',
  'chami oi',
  'chami',
  'cha mi',
  'tra mi oi',
  'trami oi',
  'hey jami',
  'hi jami',
  'ok jami',
  'oke jami',
  'tro ly jami oi',
  'tro ly jami',
];

const WAKE_PHRASES_VIETNAMESE = [
  'jami ơi',
  'jami oi',
  'gia mi ơi',
  'gia mi oi',
  'giami ơi',
  'cha mi ơi',
  'chà mi ơi',
  'trà mi ơi',
  'trợ lý jami',
  'robot jami',
  'này jami',
];

/**
 * Checks if a speech recognition transcript contains a valid wake word invocation
 */
export function isWakeWordDetected(rawTranscript: string): {
  matched: boolean;
  wakePhrase?: string;
  commandSnippet?: string;
} {
  if (!rawTranscript || typeof rawTranscript !== 'string') {
    return { matched: false };
  }

  const raw = rawTranscript.trim();
  const exactVi = normalizeVietnameseExact(raw);
  const normalized = normalizeSpeechText(raw);

  // 1. Direct match on Vietnamese phrases
  for (const phrase of WAKE_PHRASES_VIETNAMESE) {
    const idx = exactVi.indexOf(phrase);
    if (idx !== -1) {
      const remaining = exactVi.substring(idx + phrase.length).trim();
      return {
        matched: true,
        wakePhrase: phrase,
        commandSnippet: remaining || undefined,
      };
    }
  }

  // 2. Normalized match (without accents)
  for (const phrase of WAKE_PHRASES_NORMALIZED) {
    const idx = normalized.indexOf(phrase);
    if (idx !== -1) {
      const remaining = normalized.substring(idx + phrase.length).trim();
      return {
        matched: true,
        wakePhrase: phrase,
        commandSnippet: remaining || undefined,
      };
    }
  }

  // 3. Regex token boundary check (e.g. "ơi jami", "jami")
  const regex = /\b(jami|gia\s*mi|cha\s*mi|tra\s*mi)\s*(ơi|oi|nhé|nhe)?\b/i;
  const match = regex.exec(raw);
  if (match) {
    const afterMatch = raw.substring(match.index + match[0].length).trim();
    return {
      matched: true,
      wakePhrase: match[0],
      commandSnippet: afterMatch || undefined,
    };
  }

  return { matched: false };
}
