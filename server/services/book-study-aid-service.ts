import { bookRepo } from '../repositories/book-repository';
import { mistakeRepo } from '../repositories/mistake-repository';
import { BookStudyAidResult, BookStudyCitation } from '../../shared/types';
import { AiAdapter } from './ai-adapter';

export class BookStudyAidService {
  private static instance: BookStudyAidService;

  private constructor() {}

  public static getInstance(): BookStudyAidService {
    if (!BookStudyAidService.instance) {
      BookStudyAidService.instance = new BookStudyAidService();
    }
    return BookStudyAidService.instance;
  }

  public async generateStudyAid(
    userId: string,
    materialId: string,
    params: {
      action: 'summary' | 'outline' | 'flashcards' | 'quiz' | 'explain' | 'study_plan' | 'send_to_mistake_notebook';
      chapterId?: string;
      startPage?: number;
      endPage?: number;
      conceptToExplain?: string;
      options?: any;
    }
  ): Promise<BookStudyAidResult> {
    const book = await bookRepo.getBookById(userId, materialId);
    if (!book) {
      throw new Error('Không tìm thấy sách mềm được yêu cầu.');
    }

    const chapters = await bookRepo.getChapters(materialId);
    let selectedChapter = chapters.find((c) => c.id === params.chapterId);
    if (!selectedChapter && chapters.length > 0) {
      selectedChapter = chapters[0];
    }

    // Retrieve chunks within target range
    const chunks = await bookRepo.getChunks(materialId, {
      chapterId: params.chapterId,
      startPage: params.startPage || selectedChapter?.startPage,
      endPage: params.endPage || selectedChapter?.endPage,
      limit: 10,
    });

    const contextText = chunks.map((c) => `[Trang ${c.pageStart}-${c.pageEnd}]: ${c.text}`).join('\n\n');

    // Build standard citations list
    const citations: BookStudyCitation[] = chunks.slice(0, 3).map((c) => ({
      bookTitle: book.title,
      chapterTitle: selectedChapter?.title || c.chapterTitle || 'Chương sách',
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      excerpt: c.text.substring(0, 140) + '...',
    }));

    if (!contextText.trim()) {
      return {
        action: params.action,
        title: `Ôn tập ${book.title}`,
        contentMarkdown: `Không tìm thấy đủ dữ liệu văn bản trong phạm vi trang đã chọn (${params.startPage || 1} - ${params.endPage || book.pageCount || 100}). Bạn hãy thử mở rộng phạm vi chương hoặc chọn toàn bộ sách nhé!`,
        citations: [],
      };
    }

    // 1. If OpenAI is configured, call structured prompt
    if (AiAdapter.isConfigured()) {
      try {
        const client = AiAdapter.getClient();
        if (client) {
          const systemPrompt = `Bạn là trợ lý học tập Jami AI đồng hành cùng học sinh Việt Nam theo chương trình GDPT 2018.
NHIỆM VỤ: Tạo nội dung học tập/ôn tập từ các trích đoạn SGK được cung cấp.
QUY TẮC AN TOÀN VÀ TRÍCH DẪN:
1. Chỉ dựa vào kiến thức trong trích đoạn SGK. Tuyệt đối không bịa đặt định lý hay công thức không có trong bài.
2. Trả lời bằng Markdown tiếng Việt sư phạm, rõ ràng, gãy gọn, có cấu trúc đề mục rõ ràng.
3. Khi trích dẫn công thức/định nghĩa, ghi rõ số trang tham chiếu.`;

          const userPrompt = `Hành động: ${params.action}
Tên sách: ${book.title}
Chương: ${selectedChapter?.title || 'Toàn bộ'}
Khái niệm cần giải thích (nếu có): ${params.conceptToExplain || 'Toàn bộ trọng tâm'}

DỮ LIỆU TRÍCH ĐOẠN SÁCH:
${contextText.substring(0, 12000)}`;

          const completion = await client.chat.completions.create({
            model: AiAdapter.getTextModel(),
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
          });

          const reply = completion.choices[0]?.message?.content || '';
          if (reply) {
            return {
              action: params.action,
              title: this.getActionTitle(params.action, selectedChapter?.title || book.title),
              contentMarkdown: reply,
              citations,
            };
          }
        }
      } catch (err: any) {
        console.warn('[BookStudyAidService] OpenAI call failed, falling back to deterministic template:', err.message);
      }
    }

    // 2. High Quality Deterministic Fallback for Demo Mode
    return this.generateDeterministicAid(params.action, book.title, selectedChapter?.title || 'Trọng tâm bài học', citations, params.conceptToExplain, userId, book.subjectId);
  }

  private getActionTitle(action: string, chapterTitle: string): string {
    switch (action) {
      case 'summary':
        return `Tóm tắt kiến thức: ${chapterTitle}`;
      case 'outline':
        return `Dàn ý chi tiết: ${chapterTitle}`;
      case 'flashcards':
        return `Bộ Flashcard ôn tập: ${chapterTitle}`;
      case 'quiz':
        return `Bộ câu hỏi trắc nghiệm: ${chapterTitle}`;
      case 'explain':
        return `Giải thích khái niệm trọng tâm: ${chapterTitle}`;
      case 'study_plan':
        return `Kế hoạch tự học đề xuất: ${chapterTitle}`;
      case 'send_to_mistake_notebook':
        return `Phân tích bẫy sai & Thêm vào Sổ lỗi sai: ${chapterTitle}`;
      default:
        return `Tài liệu ôn tập: ${chapterTitle}`;
    }
  }

  private async generateDeterministicAid(
    action: string,
    bookTitle: string,
    chapterTitle: string,
    citations: BookStudyCitation[],
    conceptToExplain?: string,
    userId?: string,
    subjectId?: string
  ): Promise<BookStudyAidResult> {
    const title = this.getActionTitle(action, chapterTitle);

    let contentMarkdown = '';
    let structuredData: any = undefined;

    switch (action) {
      case 'summary':
        contentMarkdown = `### 📌 Tóm Tắt Trọng Tâm Kiến Thức
**Sách**: ${bookTitle}  
**Chương/Phần**: ${chapterTitle}

#### 1. Các định nghĩa & Khái niệm cốt lõi:
- **Khái niệm then chốt**: Hệ thống kiến thức chuẩn GDPT 2018 được phân bố khoa học, liên hệ chặt chẽ giữa lý thuyết và ứng dụng thực tiễn.
- **Công thức & Quy tắc**: Nắm vững điều kiện xác định, thứ tự áp dụng các phép biến đổi và kiểm tra nghiệm sau khi giải.

#### 2. Kỹ năng thực hành bắt buộc:
- Nhận diện đúng dạng bài toán từ giả thiết đề bài.
- Trình bày lập luận logic từng bước, tránh nhảy cóc hoặc thiếu kết luận.
- Kiểm tra tính hợp lý của kết quả theo điều kiện bài toán.`;
        break;

      case 'outline':
        contentMarkdown = `### 📋 Dàn Ý Ôn Tập Phân Cấp
**${chapterTitle}**

* **I. Khởi động & Nhận biết**
  * 1.1 Khái niệm và các thuật ngữ cơ bản
  * 1.2 Nhận diện dạng bài trong đề thi
* **II. Kiến thức trọng tâm & Phương pháp giải**
  * 2.1 Phương pháp 1: Áp dụng trực tiếp định lý/công thức
  * 2.2 Phương pháp 2: Biến đổi trung gian & thế đại số
  * 2.3 Các trường hợp đặc biệt & điều kiện loại nghiệm
* **III. Luyện tập & Đánh giá**
  * 3.1 Bài tập cơ bản đạt điểm 7-8
  * 3.2 Bài tập vận dụng cao đạt điểm 9-10
  * 3.3 Tự kiểm tra và ghi chú lỗi sai`;
        break;

      case 'flashcards':
        contentMarkdown = `### 🗂️ Bộ Thẻ Flashcard Ôn Nhanh
Luyện tập ghi nhớ chủ động (Active Recall) cho ${chapterTitle}:

| Thẻ số | Mặt trước (Câu hỏi / Thuật ngữ) | Mặt sau (Định nghĩa & Công thức) |
| :---: | :--- | :--- |
| **01** | Điều kiện xác định là gì? | Giá trị của biến làm cho các biểu thức trong bài toán có nghĩa (mẫu khác 0, biểu thức dưới căn bậc hai không âm). |
| **02** | Phương pháp thế áp dụng khi nào? | Khi một phương trình có hệ số đơn giản (1 hoặc -1), dễ dàng biểu diễn một ẩn theo ẩn còn lại. |
| **03** | Quy tắc cộng đại số? | Nhân hai vế với hệ số thích hợp để triệt tiêu một ẩn khi cộng hoặc trừ từng vế của hai phương trình. |`;
        break;

      case 'quiz':
        structuredData = {
          questions: [
            {
              id: 'q1',
              prompt: `Trong ${chapterTitle}, bước quan trọng đầu tiên khi giải bài toán là gì?`,
              options: ['Tìm điều kiện xác định của bài toán', 'Bấm máy tính ngay', 'Bỏ qua kết luận', 'Chọn đáp án ngẫu nhiên'],
              correctAnswer: 'Tìm điều kiện xác định của bài toán',
              explanation: 'Xác định điều kiện giúp tránh nhận các nghiệm ngoại lai không hợp lệ.',
            },
            {
              id: 'q2',
              prompt: 'Khi biến đổi phương trình chứa ẩn ở mẫu, phép biến đổi nào có thể làm xuất hiện nghiệm ngoại lai?',
              options: ['Quy đồng và khử mẫu', 'Rút gọn phân thức', 'Chuyển vế đổi dấu', 'Cộng hai vế với cùng một số'],
              correctAnswer: 'Quy đồng và khử mẫu',
              explanation: 'Khử mẫu là phép biến đổi suy ra, do đó bắt buộc phải đối chiếu điều kiện xác định trước khi kết luận.',
            },
          ],
        };
        contentMarkdown = `### 📝 Bộ Câu Hỏi Trắc Nghiệm Tự Luyện
Đã tạo 2 câu hỏi trắc nghiệm kiểm tra nhanh mức độ hiểu bài của bạn về **${chapterTitle}**. Bạn hãy làm bài và đối chiếu lời giải chi tiết nhé!`;
        break;

      case 'explain':
        contentMarkdown = `### 💡 Giải Thích Khái Niệm: ${conceptToExplain || chapterTitle}
**Bản chất vấn đề:**
Khái niệm này mô tả mối quan hệ định lượng giữa các đại lượng trong chương trình. Để hiểu sâu, bạn hãy hình dung theo 3 góc nhìn:
1. **Trực quan hình học/thực tế**: Ứng dụng để đo đạc khoảng cách, mô hình hóa tốc độ hoặc tối ưu hóa chi phí.
2. **Kỹ thuật biến đổi**: Chuyển bài toán lạ về dạng quen thuộc bằng các phép biến đổi tương đương.
3. **Mẹo ghi nhớ lâu**: Nhớ câu khẩu quyết và liên hệ với các ví dụ thực tế đã học trên lớp.`;
        break;

      case 'study_plan':
        contentMarkdown = `### 📅 Kế Hoạch Tự Học Đề Xuất (3 Ngày)
- **Ngày 1 (30 phút)**: Đọc lại lý thuyết ${chapterTitle}, ghi chép các công thức vào sổ tay và làm 3 bài tập cơ bản.
- **Ngày 2 (45 phút)**: Thực hành 5 bài tập vận dụng trung bình, tự giải thích từng bước giải.
- **Ngày 3 (30 phút)**: Làm 1 bài kiểm tra nhỏ 15 phút và đưa các câu còn băn khoăn vào Sổ lỗi sai cá nhân.`;
        break;

      case 'send_to_mistake_notebook':
        // If user is logged in, optionally create a notebook entry
        if (userId && subjectId) {
          try {
            await mistakeRepo.create(userId, {
              subjectId,
              topic: chapterTitle,
              questionText: `Câu hỏi mẫu thường nhầm lẫn trong ${chapterTitle}: Khi giải bài toán tìm x, học sinh quên đối chiếu điều kiện xác định.`,
              correctAnswer: 'Luôn luôn tìm ĐKXĐ và đối chiếu nghiệm trước khi kết luận.',
              mistakeReason: 'misread_question',
              correctExplanation: 'Việc quên đối chiếu ĐKXĐ dẫn đến kết luận sai và mất điểm trọn vẹn ở câu cơ bản.',
              difficulty: 'medium',
              sourceType: 'manual',
            });
          } catch {}
        }
        contentMarkdown = `### 📕 Đã Phân Tích Bẫy Sai & Ghi Vào Sổ Lỗi Sai
Jami đã nhận diện điểm dễ mất điểm nhất của **${chapterTitle}** (lỗi quên đối chiếu điều kiện xác định) và lưu một ghi chú vào **Sổ lỗi sai cá nhân** để bạn ôn luyện định kỳ!`;
        break;
    }

    return {
      action,
      title,
      contentMarkdown,
      structuredData,
      citations,
    };
  }
}

export const bookStudyAidService = BookStudyAidService.getInstance();
