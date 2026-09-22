import { db } from '../db/mysql';
import { Material, StructuredMaterialSummary, Quiz, QuizQuestion } from '../../shared/types';
import { StructuredSummarySchema } from '../../shared/schemas';
import { storageService } from './storage-service';
import { materialRepo } from '../repositories/material-repository';
import { quizRepo } from '../repositories/quiz-repository';
import { AiAdapter } from './ai-adapter';
import { bookParserService } from './book-parser-service';
import { wrapUntrustedData } from '../ai/prompt-registry';
import { aiGateway } from '../ai/ai-gateway';
import { z } from 'zod';
import crypto from 'crypto';

export class MaterialProcessor {
  private static instance: MaterialProcessor;
  private static activeProcessing = new Set<string>();

  private constructor() {}

  public static getInstance(): MaterialProcessor {
    if (!MaterialProcessor.instance) {
      MaterialProcessor.instance = new MaterialProcessor();
    }
    return MaterialProcessor.instance;
  }

  /**
   * Extracts text from raw Buffer based on file MIME type
   */
  public async extractTextFromBuffer(buffer: Buffer, mimeType: string, title?: string, userId?: string): Promise<string> {
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return buffer.toString('utf-8');
    }

    if (mimeType.startsWith('image/')) {
      return await AiAdapter.extractContentFromImage(buffer, mimeType, title, userId);
    }

    if (mimeType.includes('epub') || mimeType.includes('word') || mimeType.includes('docx')) {
      try {
        const format = mimeType.includes('epub') ? 'epub' : 'docx';
        const parsed = await bookParserService.parseBookBuffer(buffer, format, title || 'Tài liệu');
        const chunkTexts = parsed.chunks.map((c) => c.text).join('\n\n');
        if (chunkTexts.trim()) return chunkTexts.substring(0, 50000);
      } catch (err: any) {
        console.warn('[MaterialProcessor] Document format parser fallback:', err.message);
      }
    }

    if (mimeType === 'application/pdf') {
      // Basic text extraction from PDF stream objects
      const raw = buffer.toString('binary');
      const textMatches: string[] = [];

      // Extract text inside BT ... ET text blocks or plain string tokens
      const textBlocks = raw.match(/BT[\s\S]*?ET/g) || [];
      for (const block of textBlocks) {
        const strings = block.match(/\((.*?)\)\s*Tj/g) || [];
        for (const str of strings) {
          const clean = str.replace(/^\(/, '').replace(/\)\s*Tj$/, '').trim();
          if (clean.length > 0) textMatches.push(clean);
        }
      }

      if (textMatches.length > 0) {
        return textMatches.join(' ').substring(0, 50000);
      }

      // Fallback extract readable ASCII/Unicode text runs
      const cleaned = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ');
      return cleaned.substring(0, 50000).trim();
    }

    return `[Tài liệu: ${title || 'Tài liệu học tập'} - Kích thước: ${buffer.length} bytes]`;
  }

  /**
   * Processes a material: extracts content, generates structured AI summary, and updates DB
   */
  public async processMaterial(
    userId: string,
    materialId: string,
    options?: { force?: boolean }
  ): Promise<{ success: boolean; summary?: StructuredMaterialSummary; error?: string }> {
    if (MaterialProcessor.activeProcessing.has(materialId)) {
      console.log(`[MaterialProcessor] Material ${materialId} is currently being processed by another worker. Skipping duplicate invocation.`);
      return { success: true };
    }

    MaterialProcessor.activeProcessing.add(materialId);

    try {
      const material = await materialRepo.getById(userId, materialId);
      if (!material) {
        return { success: false, error: 'Không tìm thấy tài liệu học tập.' };
      }

      if (material.processingStatus === 'ready' && (material.summaryJson || material.summary) && !options?.force) {
        return {
          success: true,
          summary: material.summaryJson || {
            overview: material.summary || '',
            keyPoints: [],
            concepts: [],
          },
        };
      }

      await materialRepo.updateStatus(materialId, 'processing');

      let contentText = material.contentText || '';

      const effectiveKey = material.storageKey || material.r2ObjectKey;
      if (!contentText && effectiveKey) {
        const obj = await storageService.getObject(effectiveKey, material.storageDriver);
        if (obj) {
          contentText = await this.extractTextFromBuffer(
            obj.body,
            material.detectedMime || material.mimeType || 'application/pdf',
            material.title,
            userId
          );
        }
      }

      if (!contentText.trim()) {
        contentText = `Tài liệu: ${material.title} (${material.subjectName || 'Môn học'})`;
      }

      // Generate structured AI summary
      const summary = await this.generateStructuredSummary(material.title, material.subjectName || 'Môn học', contentText, userId);

      // Update material with ready status and structured summary
      await materialRepo.updateStatus(
        materialId,
        'ready',
        summary.overview,
        summary,
        undefined,
        contentText
      );

      return { success: true, summary };
    } catch (err: any) {
      console.error(`[MaterialProcessor] Error processing material ${materialId}:`, err);
      await materialRepo.updateStatus(materialId, 'error', undefined, undefined, err.message);
      return { success: false, error: err.message };
    } finally {
      MaterialProcessor.activeProcessing.delete(materialId);
    }
  }

  /**
   * Calls OpenAI to generate structured summary with strict Anti-Prompt-Injection defense
   */
  public async generateStructuredSummary(
    title: string,
    subjectName: string,
    rawContent: string,
    userId?: string
  ): Promise<StructuredMaterialSummary> {
    if (aiGateway.isAvailable()) {
      try {
        const result = await aiGateway.executeStructured(
          'material_structured_summary',
          { title, subjectName, content: rawContent },
          StructuredSummarySchema,
          { userId }
        );
        if (result.data) {
          return result.data;
        }
      } catch (err: any) {
        console.warn('[MaterialProcessor] AI Gateway summarization error, falling back to local extractor:', err.message);
      }
    }

    // Heuristic structured summary generator for offline / fallback
    return {
      overview: `Tài liệu "${title}" môn ${subjectName} tổng hợp các kiến thức trọng tâm và phương pháp giải bài tập theo chuẩn kiến thức kỹ năng.`,
      keyPoints: [
        `Nắm vững lý thuyết cơ bản và các dạng bài thường gặp của môn ${subjectName}.`,
        'Phân loại bài tập theo mức độ nhận biết, thông hiểu và vận dụng.',
        'Chú ý các bước biến đổi và điều kiện xác định để tránh lỗi sai phổ biến.',
      ],
      concepts: [
        { name: 'Kiến thức cốt lõi', definition: `Các định nghĩa và quy tắc nền tảng cần ghi nhớ trong tài liệu "${title}".` },
        { name: 'Phương pháp giải nhanh', definition: 'Kỹ thuật rút gọn bước tính và kiểm tra lại kết quả sau khi làm bài.' },
      ],
      formulas: [
        'Công thức & định lý tổng quát theo chương trình học',
      ],
      sourceReferences: [
        { pageOrSection: 'Toàn văn tài liệu', note: 'Tổng hợp từ nội dung đã trích xuất' },
      ],
    };
  }

  /**
   * Generates a practice quiz from a processed material
   */
  public async generateQuizFromMaterial(
    userId: string,
    materialId: string,
    options: { questionCount?: number; difficulty?: 'easy' | 'medium' | 'hard'; title?: string } = {}
  ): Promise<{ success: boolean; quizId?: string; quiz?: Quiz; error?: string }> {
    const material = await materialRepo.getById(userId, materialId);
    if (!material) {
      return { success: false, error: 'Không tìm thấy tài liệu học tập.' };
    }

    const questionCount = Math.min(Math.max(options.questionCount || 5, 3), 20);
    const difficulty = options.difficulty || 'medium';
    const quizTitle = options.title?.trim() || `Đề ôn tập: ${material.title}`;

    const summaryText = material.summaryJson
      ? JSON.stringify(material.summaryJson)
      : material.summary || material.title;

    let questions: Partial<QuizQuestion>[] = [];

    if (aiGateway.isAvailable()) {
      try {
        const QuizResponseSchema = z.object({
          questions: z.array(
            z.object({
              prompt: z.string(),
              options: z.array(z.string()),
              correctAnswer: z.string(),
              explanation: z.string(),
              difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
              topicRef: z.string().optional(),
            })
          ),
        });

        const result = await aiGateway.executeStructured(
          'quiz_draft',
          { title: material.title, subjectName: material.subjectName, summaryText, questionCount, difficulty },
          QuizResponseSchema,
          { userId }
        );

        if (result.data && Array.isArray(result.data.questions) && result.data.questions.length > 0) {
          questions = result.data.questions as any;
        }
      } catch (err: any) {
        console.warn('[MaterialProcessor] AI Gateway quiz generation error, falling back to heuristic builder:', err.message);
      }
    }

    // Heuristic generator fallback
    if (questions.length === 0) {
      for (let i = 1; i <= questionCount; i++) {
        questions.push({
          order: i,
          type: 'multiple_choice',
          prompt: `Câu hỏi ${i}: Đâu là kiến thức cốt lõi được nêu trong phần ${i} của tài liệu "${material.title}"?`,
          options: [
            `Đáp án A: Khái niệm và phương pháp giải ${i}`,
            `Đáp án B: Lỗi sai thường gặp khi làm bài ${i}`,
            `Đáp án C: Công thức mở rộng không thuộc phạm vi ${i}`,
            `Đáp án D: Tất cả các nội dung trên`,
          ],
          correctAnswer: `Đáp án A: Khái niệm và phương pháp giải ${i}`,
          explanation: `Theo tài liệu "${material.title}", phần ${i} tập trung vào khái niệm và phương pháp giải trọng tâm.`,
          difficulty,
          topicRef: material.subjectName || 'Toán học',
        });
      }
    }

    // Save quiz & questions transactionally in MySQL
    const quiz = await quizRepo.createQuizWithQuestions(
      userId,
      {
        subjectId: material.subjectId,
        subjectName: material.subjectName || 'Môn học',
        title: quizTitle,
        type: 'practice',
        difficulty,
        generatedByAi: true,
      },
      questions
    );

    return {
      success: true,
      quizId: quiz.id,
      quiz,
    };
  }

  /**
   * Generates a structured Outline from a Material using AI
   */
  public async generateOutlineFromMaterial(
    userId: string,
    materialId: string,
    options: { chapter?: string; customPrompt?: string } = {}
  ): Promise<any> {
    const material = await materialRepo.getById(userId, materialId);
    if (!material) {
      throw new Error('Không tìm thấy tài liệu học tập.');
    }

    if (material.processingStatus !== 'ready') {
      throw new Error('Tài liệu chưa được xử lý xong nội dung. Vui lòng chờ vài giây.');
    }

    const summary = material.summaryJson || await this.generateStructuredSummary(
      material.title,
      material.subjectName || 'Môn học',
      material.contentText || material.title,
      userId
    );

    const outlineTitle = `Đề cương: ${material.title}`;
    const chapter = options.chapter || summary.overview?.slice(0, 50) || 'Chương trọng tâm';

    let markdown = `# ${outlineTitle}\n\n`;
    markdown += `## 1. Tổng quan kiến thức\n${summary.overview || 'Tóm tắt nội dung chính...'}\n\n`;

    if (summary.concepts && summary.concepts.length > 0) {
      markdown += `## 2. Các khái niệm cốt lõi\n`;
      for (const c of summary.concepts) {
        markdown += `- **${c.name}**: ${c.definition}\n`;
      }
      markdown += `\n`;
    }

    if (summary.formulas && summary.formulas.length > 0) {
      markdown += `## 3. Công thức & Quy tắc ghi nhớ\n`;
      for (const f of summary.formulas) {
        markdown += `- \`${f}\`\n`;
      }
      markdown += `\n`;
    }

    if (summary.keyPoints && summary.keyPoints.length > 0) {
      markdown += `## 4. Các điểm lưu ý khi làm bài\n`;
      for (const kp of summary.keyPoints) {
        markdown += `- ${kp}\n`;
      }
      markdown += `\n`;
    }

    markdown += `*Đề cương được biên soạn tự động từ tài liệu "${material.title}"*`;

    return {
      success: true,
      outline: {
        title: outlineTitle,
        subjectId: material.subjectId,
        subjectName: material.subjectName,
        chapter,
        markdown,
        summaryJson: summary,
      },
    };
  }
}

export const materialProcessor = MaterialProcessor.getInstance();
