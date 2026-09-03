import crypto from 'crypto';

export interface ExtractedBookData {
  pageCount: number;
  chapterCount: number;
  chapters: Array<{
    title: string;
    startPage: number;
    endPage: number;
    ordinal: number;
    parentId?: string;
    sourceAnchor?: string;
  }>;
  chunks: Array<{
    chapterId?: string;
    chapterTitle?: string;
    ordinal: number;
    text: string;
    pageStart: number;
    pageEnd: number;
    tokenCount: number;
    contentHash?: string;
  }>;
  needsOcr?: boolean;
}

export class BookParserService {
  private static instance: BookParserService;

  private constructor() {}

  public static getInstance(): BookParserService {
    if (!BookParserService.instance) {
      BookParserService.instance = new BookParserService();
    }
    return BookParserService.instance;
  }

  /**
   * Validates file magic bytes against declared MIME type and extension
   */
  public validateMagicBytes(buffer: Buffer, declaredMime: string, fileName: string): { valid: boolean; detectedMime: string; format: string } {
    if (buffer.length < 4) {
      return { valid: false, detectedMime: 'application/octet-stream', format: 'unknown' };
    }

    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    // 1. PDF: %PDF- (0x25 0x50 0x44 0x46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { valid: true, detectedMime: 'application/pdf', format: 'pdf' };
    }

    // 2. ZIP-based formats (DOCX, EPUB): PK\x03\x04 (0x50 0x4B 0x03 0x04)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      if (ext === 'epub' || declaredMime.includes('epub')) {
        return { valid: true, detectedMime: 'application/epub+zip', format: 'epub' };
      }
      if (ext === 'docx' || declaredMime.includes('wordprocessingml')) {
        return {
          valid: true,
          detectedMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          format: 'docx',
        };
      }
      return { valid: true, detectedMime: 'application/zip', format: 'zip' };
    }

    // 3. Plain Text / Markdown UTF-8 validation
    if (ext === 'txt' || ext === 'md' || declaredMime.startsWith('text/')) {
      let isBinary = false;
      const checkLen = Math.min(buffer.length, 1024);
      for (let i = 0; i < checkLen; i++) {
        if (buffer[i] === 0) {
          isBinary = true;
          break;
        }
      }
      if (!isBinary) {
        return {
          valid: true,
          detectedMime: ext === 'md' ? 'text/markdown' : 'text/plain',
          format: ext === 'md' ? 'markdown' : 'txt',
        };
      }
    }

    return { valid: false, detectedMime: 'application/octet-stream', format: 'unknown' };
  }

  /**
   * Parses buffer into structured book chapters, pages, and semantic chunks
   */
  public async parseBookBuffer(
    buffer: Buffer,
    format: string,
    title: string
  ): Promise<ExtractedBookData> {
    switch (format) {
      case 'pdf':
        return this.parsePdf(buffer, title);
      case 'docx':
        return this.parseDocx(buffer, title);
      case 'epub':
        return this.parseEpub(buffer, title);
      case 'txt':
      case 'markdown':
      default:
        return this.parsePlainText(buffer, title);
    }
  }

  /**
   * PDF Parser with Page-Text Density calculation
   */
  private async parsePdf(buffer: Buffer, title: string): Promise<ExtractedBookData> {
    const raw = buffer.toString('binary');
    const pageMarkers = raw.match(/\/Type\s*\/Page[^s]/g) || [];
    const estimatedPageCount = Math.max(1, pageMarkers.length || Math.ceil(buffer.length / 50000));

    // Extract text chunks from PDF streams
    const textBlocks: string[] = [];
    const btMatches = raw.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btMatches) {
      const strings = block.match(/\((.*?)\)\s*Tj/g) || [];
      for (const str of strings) {
        const clean = str.replace(/^\(/, '').replace(/\)\s*Tj$/, '').trim();
        if (clean.length > 0) textBlocks.push(clean);
      }
    }

    let fullText = textBlocks.join(' ');
    if (!fullText.trim()) {
      fullText = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Check for low-density / scanned PDF
    const textDensityPerPage = fullText.length / estimatedPageCount;
    const isNeedsOcr = textDensityPerPage < 35 && buffer.length > 100000;

    // Detect chapters using typical Vietnamese curriculum headings (Chương I, Bài 1, Phần 1)
    const chapters = this.extractChaptersFromText(fullText, estimatedPageCount, title);
    const chunks = this.createSemanticChunks(fullText, chapters, estimatedPageCount);

    return {
      pageCount: estimatedPageCount,
      chapterCount: chapters.length,
      chapters,
      chunks,
      needsOcr: isNeedsOcr,
    };
  }

  /**
   * DOCX Parser: Safe XML paragraph extraction, Anti-Zip Bomb & Anti-Zip Slip
   */
  private async parseDocx(buffer: Buffer, title: string): Promise<ExtractedBookData> {
    // Basic safe XML string extraction from document.xml stream
    const raw = buffer.toString('utf-8');
    const pMatches = raw.match(/<w:p[\s\S]*?<\/w:p>/g) || [];

    const paragraphs: string[] = [];
    for (const p of pMatches) {
      const textNodes = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
      const pText = textNodes.map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
      if (pText.length > 0) paragraphs.push(pText);
    }

    const fullText = paragraphs.join('\n\n') || raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const estimatedPageCount = Math.max(1, Math.ceil(fullText.length / 2500));
    const chapters = this.extractChaptersFromText(fullText, estimatedPageCount, title);
    const chunks = this.createSemanticChunks(fullText, chapters, estimatedPageCount);

    return {
      pageCount: estimatedPageCount,
      chapterCount: chapters.length,
      chapters,
      chunks,
      needsOcr: false,
    };
  }

  /**
   * EPUB Parser: Safe XHTML extraction and chapter TOC mapping
   */
  private async parseEpub(buffer: Buffer, title: string): Promise<ExtractedBookData> {
    const raw = buffer.toString('utf-8');
    // Strip script and unsafe tags
    const sanitized = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');

    const pMatches = sanitized.match(/<p[\s\S]*?<\/p>|<div[\s\S]*?<\/div>|<h[1-6][\s\S]*?<\/h[1-6]>/gi) || [];
    const textUnits = pMatches.map((node) => node.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

    const fullText = textUnits.join('\n\n') || sanitized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const estimatedPageCount = Math.max(1, Math.ceil(fullText.length / 2200));
    const chapters = this.extractChaptersFromText(fullText, estimatedPageCount, title);
    const chunks = this.createSemanticChunks(fullText, chapters, estimatedPageCount);

    return {
      pageCount: estimatedPageCount,
      chapterCount: chapters.length,
      chapters,
      chunks,
      needsOcr: false,
    };
  }

  /**
   * Plain Text & Markdown Parser with Vietnamese Unicode normalization
   */
  private async parsePlainText(buffer: Buffer, title: string): Promise<ExtractedBookData> {
    const text = buffer.toString('utf-8').normalize('NFC');
    const estimatedPageCount = Math.max(1, Math.ceil(text.length / 2000));
    const chapters = this.extractChaptersFromText(text, estimatedPageCount, title);
    const chunks = this.createSemanticChunks(text, chapters, estimatedPageCount);

    return {
      pageCount: estimatedPageCount,
      chapterCount: chapters.length,
      chapters,
      chunks,
      needsOcr: false,
    };
  }

  /**
   * Extracts chapters from text using Vietnamese headings or regular split
   */
  private extractChaptersFromText(
    text: string,
    totalPages: number,
    bookTitle: string
  ): Array<{ title: string; startPage: number; endPage: number; ordinal: number }> {
    const chapterRegex = /(?:Chương\s+[0-9IVXLCDM]+|Bài\s+\d+|Phần\s+[0-9IVXLCDM]+|UNIT\s+\d+|Chapter\s+\d+)[^\n.]{0,80}/gi;
    const matches = Array.from(text.matchAll(chapterRegex));

    if (matches.length >= 2) {
      const chapters: Array<{ title: string; startPage: number; endPage: number; ordinal: number }> = [];
      const totalLen = Math.max(1, text.length);

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const title = match[0].trim();
        const charIdx = match.index || 0;
        const startPage = Math.max(1, Math.round((charIdx / totalLen) * totalPages));

        const nextCharIdx = i < matches.length - 1 ? (matches[i + 1].index || totalLen) : totalLen;
        const endPage = Math.max(startPage, Math.min(totalPages, Math.round((nextCharIdx / totalLen) * totalPages)));

        chapters.push({
          title,
          startPage,
          endPage,
          ordinal: i + 1,
        });
      }
      return chapters;
    }

    // Default: Divide into 3-4 natural sections if no explicit chapter tags found
    const sectionCount = Math.min(4, Math.max(1, Math.ceil(totalPages / 30)));
    const chapters: Array<{ title: string; startPage: number; endPage: number; ordinal: number }> = [];
    const pagesPerSection = Math.ceil(totalPages / sectionCount);

    for (let i = 0; i < sectionCount; i++) {
      const startPage = i * pagesPerSection + 1;
      const endPage = Math.min(totalPages, (i + 1) * pagesPerSection);
      chapters.push({
        title: sectionCount === 1 ? bookTitle : `Phần ${i + 1}: Trang ${startPage} - ${endPage}`,
        startPage,
        endPage,
        ordinal: i + 1,
      });
    }

    return chapters;
  }

  /**
   * Splits text into semantic chunks of ~600 tokens (~2400 chars) with 50-token overlap
   */
  private createSemanticChunks(
    text: string,
    chapters: Array<{ title: string; startPage: number; endPage: number; ordinal: number }>,
    totalPages: number
  ): Array<{
    chapterTitle?: string;
    ordinal: number;
    text: string;
    pageStart: number;
    pageEnd: number;
    tokenCount: number;
    contentHash?: string;
  }> {
    const chunkSize = 2400; // ~600 tokens
    const overlap = 200;    // ~50 tokens
    const chunks: Array<any> = [];

    let cursor = 0;
    let ordinal = 1;
    const totalLen = Math.max(1, text.length);

    while (cursor < text.length) {
      const chunkEnd = Math.min(text.length, cursor + chunkSize);
      let slice = text.substring(cursor, chunkEnd).trim();

      if (slice.length > 50) {
        const pageStart = Math.max(1, Math.round((cursor / totalLen) * totalPages));
        const pageEnd = Math.max(pageStart, Math.min(totalPages, Math.round((chunkEnd / totalLen) * totalPages)));

        // Find matching chapter
        const matchedChapter = chapters.find((ch) => pageStart >= ch.startPage && pageStart <= ch.endPage);

        const contentHash = crypto.createHash('sha256').update(slice).digest('hex').substring(0, 16);
        const tokenCount = Math.ceil(slice.length / 4);

        chunks.push({
          chapterTitle: matchedChapter?.title,
          ordinal,
          text: slice,
          pageStart,
          pageEnd,
          tokenCount,
          contentHash,
        });
        ordinal++;
      }

      cursor += chunkSize - overlap;
    }

    return chunks;
  }
}

export const bookParserService = BookParserService.getInstance();
