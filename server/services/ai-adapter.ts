import OpenAI from 'openai';
import {
  VoiceGoalExtractionSchema,
  TaskDecompositionSchema,
  ExecutionGuideSchema,
  QuizDraftSchema,
  JamiResponseSchema,
} from '../../shared/schemas';
import { z } from 'zod';

export class AiAdapter {
  private static client: OpenAI | null = null;

  private static getClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length < 10 || apiKey.includes('ADD_IN_AI_STUDIO')) {
      return null;
    }
    if (!this.client) {
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  private static getTextModel(): string {
    return process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
  }

  private static getRealtimeModel(): string {
    return process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
  }

  private static getTranscribeModel(): string {
    return process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe';
  }

  public static isConfigured(): boolean {
    const apiKey = process.env.OPENAI_API_KEY;
    return Boolean(apiKey && apiKey.trim().length > 10 && !apiKey.includes('ADD_IN_AI_STUDIO'));
  }

  /**
   * Process voice audio or raw speech transcript to extract structured study goal
   */
  public static async extractGoalFromText(userText: string): Promise<z.infer<typeof VoiceGoalExtractionSchema>> {
    const client = this.getClient();
    if (client) {
      try {
        const completion = await client.chat.completions.create({
          model: this.getTextModel(),
          messages: [
            {
              role: 'system',
              content:
                'Bạn là Jami AI, trợ lý học tập cho học sinh Việt Nam theo chuẩn GDPT 2018. Trích xuất mục tiêu học tập từ văn bản của học sinh dưới định dạng JSON chính xác.',
            },
            { role: 'user', content: userText },
          ],
          response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return VoiceGoalExtractionSchema.parse({
            transcript: userText,
            ...parsed,
          });
        }
      } catch (err) {
        console.warn('[AI Adapter] OpenAI API error, using safe deterministic fallback', err);
      }
    }

    // High quality deterministic fallback for Demo Mode
    const lower = userText.toLowerCase();
    const isMath = lower.includes('toán') || lower.includes('hàm số') || lower.includes('đồ thị') || lower.includes('hình');
    const isEnglish = lower.includes('anh') || lower.includes('english') || lower.includes('unit') || lower.includes('từ vựng');
    const isLit = lower.includes('văn') || lower.includes('ngữ văn') || lower.includes('bài thơ') || lower.includes('phân tích');

    const subject = isMath ? 'Toán học' : isEnglish ? 'Tiếng Anh' : isLit ? 'Ngữ văn' : 'Toán học';
    const topics = isMath
      ? ['Hàm số bậc nhất y = ax + b', 'Vẽ đồ thị trên mặt phẳng Oxy', 'Tìm tọa độ giao điểm']
      : isEnglish
      ? ['Unit 2 City Life Vocabulary', 'Comparison of adjectives']
      : isLit
      ? ['Nghị luận văn học', 'Phân tích nhân vật']
      : ['Kiến thức trọng tâm'];

    return {
      transcript: userText,
      intent: 'schedule_exam_prep',
      subject,
      topics,
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      examDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      estimatedMinutes: 45,
      preferredWindows: ['Tối thứ Ba sau 19:00', 'Tối thứ Năm sau 19:00'],
      constraints: ['Không xếp trùng giờ học thêm 17:30', 'Thời lượng tối đa 45 phút/phiên'],
      missingFields: [],
      confidence: 0.95,
      clarification: `Jami đã ghi nhận mục tiêu: Ôn tập môn ${subject} (${topics.join(', ')}) cho bài kiểm tra tuần sau, ưu tiên khung giờ tối thứ 3 và thứ 5.`,
    };
  }

  /**
   * Decomposes a large goal into manageable study tasks
   */
  public static async decomposeTask(goalSummary: string, subject: string): Promise<z.infer<typeof TaskDecompositionSchema>> {
    const client = this.getClient();
    if (client) {
      try {
        const completion = await client.chat.completions.create({
          model: this.getTextModel(),
          messages: [
            {
              role: 'system',
              content:
                'Chia nhỏ mục tiêu học tập thành 2-3 nhiệm vụ học tập cụ thể, thực tế theo chuẩn GDPT 2018 dưới dạng JSON.',
            },
            { role: 'user', content: `Môn học: ${subject}. Mục tiêu: ${goalSummary}` },
          ],
          response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return TaskDecompositionSchema.parse(parsed);
        }
      } catch (err) {
        console.warn('[AI Adapter] OpenAI decomposition call failed, falling back to deterministic template', err);
      }
    }

    return {
      goalSummary,
      tasks: [
        {
          title: `${subject} — Ôn lý thuyết trọng tâm & công thức`,
          objective: 'Hệ thống hóa toàn bộ định nghĩa, tính chất và các dạng bài cơ bản.',
          subjectRef: subject,
          topicRefs: ['Lý thuyết nền tảng', 'Công thức ghi nhớ'],
          estimatedMinutes: 30,
          minSessionMinutes: 20,
          maxSessionMinutes: 45,
          splittable: false,
          priority: 'high',
          difficulty: 'easy',
          dueAt: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
          prerequisites: ['Đọc trước SGK'],
          dependencies: [],
          successCriteria: ['Hoàn thành sơ đồ tư duy tóm tắt trong 1 trang vở'],
          excellentCriteria: ['Tự giải thích lại được các trường hợp đặc biệt'],
          materials: ['Sách giáo khoa', 'Sổ tay công thức'],
          rationale: 'Nắm chắc lý thuyết trước khi làm bài tập giúp tránh sai sót cơ bản.',
        },
        {
          title: `${subject} — Luyện giải 5 bài tập rèn kỹ năng vận dụng`,
          objective: 'Thực hành giải các bài tập rèn phản xạ có kiểm tra đáp án.',
          subjectRef: subject,
          topicRefs: ['Bài tập vận dụng', 'Rèn phản xạ'],
          estimatedMinutes: 45,
          minSessionMinutes: 30,
          maxSessionMinutes: 60,
          splittable: false,
          priority: 'high',
          difficulty: 'medium',
          dueAt: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
          prerequisites: ['Đã hoàn thành ôn lý thuyết'],
          dependencies: [],
          successCriteria: ['Làm đúng ít nhất 4/5 bài tập'],
          excellentCriteria: ['Trình bày sạch đẹp chuẩn barem chấm điểm'],
          materials: ['Vở bài tập', 'Thước kẻ/Bút chì'],
          rationale: 'Rèn phản xạ tính toán và kỹ năng trình bày theo barem điểm thi.',
        },
      ],
    };
  }

  /**
   * Generates interactive AI Chat response
   */
  public static async generateJamiChat(userMessage: string, context?: any): Promise<z.infer<typeof JamiResponseSchema>> {
    const client = this.getClient();
    if (client) {
      try {
        const completion = await client.chat.completions.create({
          model: this.getTextModel(),
          messages: [
            {
              role: 'system',
              content:
                'Bạn là Jami - robot AI đồng hành học tập thân thiện, chuẩn mực dành cho học sinh Việt Nam. Trả lời bằng tiếng Việt ngắn gọn, ấm áp, truyền cảm hứng và khích lệ học sinh.',
            },
            { role: 'user', content: userMessage },
          ],
        });

        const replyText = completion.choices[0]?.message?.content || '';
        return {
          message: replyText,
          emotion: 'speaking',
          suggestedActions: ['Bắt đầu Hẹn giờ tập trung', 'Xem lịch học hôm nay', 'Làm bài luyện tập'],
          requiresConfirmation: false,
          citationsToUserMaterial: [],
        };
      } catch (err) {
        console.warn('[AI Adapter] OpenAI chat call failed, using responsive fallback', err);
      }
    }

    const msg = userMessage.toLowerCase();

    if (msg.includes('lịch') || msg.includes('hôm nay') || msg.includes('làm gì')) {
      return {
        message: 'Chào Minh! Hôm nay em có 1 phiên học Toán lúc 19:00 (45 phút) về "Vẽ đồ thị hàm số" và 1 buổi học Tiếng Anh lúc 20:00. Jami đã sẵn sàng đồng hành cùng em!',
        emotion: 'speaking',
        suggestedActions: ['Bắt đầu phiên học Toán 19:00', 'Xem chi tiết công việc', 'Bắt đầu Hẹn giờ tập trung'],
        requiresConfirmation: false,
        citationsToUserMaterial: ['Lịch học hôm nay'],
      };
    }

    if (msg.includes('bị kẹt') || msg.includes('không hiểu') || msg.includes('gợi ý') || msg.includes('giúp')) {
      return {
        message: 'Đừng lo lắng nhé Minh! Khi vẽ đồ thị y = ax + b (a ≠ 0), em chỉ cần tìm 2 điểm đặc biệt:\n1. Cho x = 0 thì y = b (giao điểm Oy: A(0, b))\n2. Cho y = 0 thì x = -b/a (giao điểm Ox: B(-b/a, 0))\nNối 2 điểm A và B lại là xong! Em hãy thử vẽ điểm A trước nhé.',
        emotion: 'guiding',
        suggestedActions: ['Em hiểu rồi, làm tiếp', 'Cho em thêm 1 ví dụ số cụ thể'],
        requiresConfirmation: false,
        citationsToUserMaterial: ['SGK Toán 9 Chương II'],
      };
    }

    if (msg.includes('đổi lịch') || msg.includes('bận') || msg.includes('dời')) {
      return {
        message: 'Jami đã ghi nhận! Em có muốn Jami dời phiên học tối nay sang 20:30 (sau khi em hoàn thành việc cá nhân) không? Em xem qua đề xuất và nhấn Xác nhận nhé.',
        emotion: 'reminding',
        suggestedActions: ['Xác nhận đổi sang 20:30', 'Giữ nguyên lịch cũ'],
        requiresConfirmation: true,
        confirmationSummary: 'Dời phiên học Toán từ 19:00 sang 20:30 tối nay.',
        citationsToUserMaterial: [],
      };
    }

    return {
      message: 'Jami luôn ở đây để giúp Minh lập kế hoạch, giải thích bài học và giữ tập trung. Em muốn chúng mình bắt đầu việc gì trước nào?',
      emotion: 'encouraging',
      suggestedActions: ['Kiểm tra lịch học hôm nay', 'Làm đề luyện tập AI', 'Bắt đầu Hẹn giờ tập trung'],
      requiresConfirmation: false,
      citationsToUserMaterial: [],
    };
  }

  /**
   * Realtime session initialization endpoint for WebRTC / OpenAI Voice
   */
  public static async createRealtimeSession(): Promise<{ clientSecret?: string; mode: string; message: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!this.isConfigured() || !apiKey) {
      return {
        mode: 'demo_text_fallback',
        message: 'Chế độ Demo: Giọng nói của Jami được mô phỏng qua Web Speech API / Text Fallback an toàn.',
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.getRealtimeModel(),
          voice: 'alloy',
          instructions:
            'Bạn là Jami - robot AI đồng hành học tập thân thiện dành cho học sinh Việt Nam. Trả lời ngắn gọn, ấm áp và luôn khích lệ.',
        }),
      });
      const data = await response.json();
      return {
        clientSecret: data.client_secret?.value,
        mode: 'openai_realtime',
        message: 'Giọng nói của Jami được tạo bởi trí tuệ nhân tạo.',
      };
    } catch (err) {
      return {
        mode: 'demo_text_fallback',
        message: 'Chế độ Demo: Giọng nói của Jami được mô phỏng qua Web Speech API / Text Fallback an toàn.',
      };
    }
  }
}
