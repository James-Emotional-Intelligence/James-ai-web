import { User, StudentProfile, Subject, TimetableEntry, BusyEvent, StudyTask, ExecutionGuide, Exam, Quiz, QuizQuestion, Material, Notification } from '../../shared/types';
import { subjectRepo } from './subject-repository';
import { timetableRepo } from './timetable-repository';
import { taskRepo } from './task-repository';
import { examRepo } from './exam-repository';
import { quizRepo } from './quiz-repository';
import { materialRepo } from './material-repository';
import { notificationRepo } from './notification-repository';
import { jamiRepo } from './jami-repository';

export class DemoRepository {
  public static seedUser(userId: string) {
    const subjects: Subject[] = [
      { id: 'subj-math', name: 'Toán học', color: '#16A34A', icon: 'Calculator' },
      { id: 'subj-eng', name: 'Tiếng Anh', color: '#3B82F6', icon: 'Languages' },
      { id: 'subj-lit', name: 'Ngữ văn', color: '#F59E0B', icon: 'BookOpen' },
      { id: 'subj-phys', name: 'Vật lý', color: '#8B5CF6', icon: 'Atom' },
      { id: 'subj-chem', name: 'Hóa học', color: '#EC4899', icon: 'FlaskConical' },
    ];
    subjectRepo.seedDemoSubjects(userId, subjects);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0);

    const timetables: TimetableEntry[] = [
      { id: 'tt-1', dayOfWeek: 2, period: 1, subjectId: 'subj-math', subjectName: 'Toán học', title: 'Đại số 9', room: 'Phòng 9A1', startLocalTime: '07:15', endLocalTime: '09:00', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
      { id: 'tt-2', dayOfWeek: 2, period: 2, subjectId: 'subj-eng', subjectName: 'Tiếng Anh', title: 'English 9 Unit 2', room: 'Phòng 9A1', startLocalTime: '09:15', endLocalTime: '11:30', commuteBeforeMinutes: 0, commuteAfterMinutes: 15 },
      { id: 'tt-3', dayOfWeek: 3, period: 1, subjectId: 'subj-lit', subjectName: 'Ngữ văn', title: 'Văn học hiện đại', room: 'Phòng 9A1', startLocalTime: '07:15', endLocalTime: '09:45', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
      { id: 'tt-4', dayOfWeek: 4, period: 1, subjectId: 'subj-math', subjectName: 'Toán học', title: 'Hình học 9', room: 'Phòng 9A1', startLocalTime: '07:15', endLocalTime: '09:00', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
      { id: 'tt-5', dayOfWeek: 5, period: 1, subjectId: 'subj-phys', subjectName: 'Vật lý', title: 'Điện học 9', room: 'Phòng thực hành', startLocalTime: '07:15', endLocalTime: '09:45', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
    ];

    const busyEvents: BusyEvent[] = [
      {
        id: 'busy-1',
        userId,
        type: 'extra_class',
        title: 'Học thêm Toán nâng cao',
        startsAt: new Date(today.getTime() - 2 * 3600 * 1000).toISOString(),
        endsAt: new Date(today.getTime() - 0.5 * 3600 * 1000).toISOString(),
        recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU,TH',
        timezone: 'Asia/Ho_Chi_Minh',
        isFixed: true,
        source: 'user',
      },
    ];
    timetableRepo.seedDemo(userId, timetables, busyEvents);

    const tasks: StudyTask[] = [
      {
        id: 'task-math-1',
        userId,
        subjectId: 'subj-math',
        subjectName: 'Toán học',
        title: 'Vẽ đồ thị hàm số y = ax + b (a ≠ 0)',
        objective: 'Nắm vững cách tìm 2 điểm đặc biệt trên trục tọa độ và vẽ chính xác đồ thị hàm số bậc nhất.',
        status: 'in_progress',
        priority: 'high',
        difficulty: 'medium',
        dueAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
        estimatedMinutes: 45,
        minSessionMinutes: 25,
        maxSessionMinutes: 60,
        splittable: false,
        locked: true,
        scheduledStartAt: today.toISOString(),
        scheduledEndAt: new Date(today.getTime() + 45 * 60 * 1000).toISOString(),
        completionPercent: 35,
        source: 'planner',
      },
      {
        id: 'task-eng-1',
        userId,
        subjectId: 'subj-eng',
        subjectName: 'Tiếng Anh',
        title: 'Ôn tập từ vựng & Ngữ pháp Unit 2: City Life',
        objective: 'Thuộc 15 từ vựng mới về chủ đề đô thị và cấu trúc so sánh hơn của tính từ dài.',
        status: 'pending',
        priority: 'medium',
        difficulty: 'easy',
        dueAt: new Date(now.getTime() + 3 * 86400000).toISOString(),
        estimatedMinutes: 30,
        minSessionMinutes: 20,
        maxSessionMinutes: 45,
        splittable: false,
        locked: false,
        scheduledStartAt: new Date(today.getTime() + 60 * 60 * 1000).toISOString(),
        scheduledEndAt: new Date(today.getTime() + 90 * 60 * 1000).toISOString(),
        completionPercent: 0,
        source: 'planner',
      },
      {
        id: 'task-lit-1',
        userId,
        subjectId: 'subj-lit',
        subjectName: 'Ngữ văn',
        title: 'Lập dàn ý bài văn nghị luận xã hội về tinh thần tự học',
        objective: 'Xây dựng mở bài, 3 luận điểm thân bài với dẫn chứng xác thực và kết bài.',
        status: 'pending',
        priority: 'medium',
        difficulty: 'hard',
        dueAt: new Date(now.getTime() + 4 * 86400000).toISOString(),
        estimatedMinutes: 45,
        minSessionMinutes: 30,
        maxSessionMinutes: 60,
        splittable: false,
        locked: false,
        scheduledStartAt: new Date(today.getTime() + 24 * 3600 * 1000).toISOString(),
        scheduledEndAt: new Date(today.getTime() + 24 * 3600 * 1000 + 45 * 60 * 1000).toISOString(),
        completionPercent: 0,
        source: 'planner',
      },
    ];

    const guideMap = new Map<string, ExecutionGuide>();
    guideMap.set('task-math-1', {
      taskId: 'task-math-1',
      objective: 'Nắm vững cách tìm tọa độ 2 giao điểm với trục Ox, Oy và vẽ đường thẳng chính xác trên mặt phẳng Oxy.',
      whyItMatters: 'Dạng bài cốt lõi luôn xuất hiện trong cấu trúc đề thi vào 10 chuyên và công lập (chiếm 1.5 - 2.0 điểm).',
      prerequisites: ['Đã học định nghĩa hàm số bậc nhất', 'Biết cách xác định tọa độ điểm (x, y)'],
      materials: ['Sách giáo khoa Toán 9 tập 1', 'Vở bài tập', 'Thước kẻ thẳng chia milimet', 'Bút chì'],
      preparationChecklist: [
        { item: 'Chuẩn bị thước kẻ và bút chì chuốt nhọn', completed: true },
        { item: 'Mở trang 50 SGK Toán 9 tập 1', completed: true },
        { item: 'Đặt bàn học gọn gàng, bật chế độ Không làm phiền', completed: false },
      ],
      steps: [
        {
          id: 'step-1',
          order: 1,
          title: 'Khởi động & Ôn lý thuyết giao điểm',
          minutes: 10,
          instruction: 'Đọc lại khung kiến thức trang 50 SGK: Giao điểm trục tung A(0; b) và giao điểm trục hoành B(-b/a; 0).',
          expectedOutput: 'Viết ra nháp công thức tìm tọa độ 2 điểm cắt trục Oxy.',
          tips: ['Nếu b = 0, đồ thị đi qua gốc tọa độ O(0;0)', 'a > 0 đồ thị đồng biến đi lên, a < 0 nghịch biến đi xuống'],
          status: 'completed',
          completedAt: new Date(now.getTime() - 15 * 60000).toISOString(),
        },
        {
          id: 'step-2',
          order: 2,
          title: 'Thực hành vẽ ví dụ mẫu y = 2x - 3',
          minutes: 20,
          instruction: 'Tìm A(0; -3) và B(1.5; 0). Chấm 2 điểm trên mặt phẳng Oxy và dùng thước kẻ đường thẳng qua A, B.',
          expectedOutput: 'Hình vẽ đồ thị sạch đẹp trong vở với đầy đủ tên trục Ox, Oy, gốc O và phương trình đường thẳng.',
          tips: ['Chia đều khoảng cách 1cm giữa các số trên trục', 'Kéo dài đường thẳng vượt quá 2 điểm một chút'],
          status: 'in_progress',
        },
        {
          id: 'step-3',
          order: 3,
          title: 'Tự luyện 2 bài tập rèn phản xạ',
          minutes: 15,
          instruction: 'Vẽ đồ thị y = -x + 2 và y = 3x. Tự kiểm tra giao điểm với đáp án SGK.',
          expectedOutput: '2 hình vẽ hoàn chỉnh có ghi rõ tọa độ giao điểm.',
          tips: ['Tự nhẩm lại xem đồ thị có đúng chiều nghiêng không'],
          status: 'pending',
        },
      ],
      successCriteria: [
        'Tìm đúng tọa độ 2 điểm cắt trục',
        'Vẽ mặt phẳng Oxy vuông góc và chia vạch đều',
        'Đường thẳng đi chính xác qua 2 điểm',
      ],
      excellentCriteria: [
        'Trình bày sạch sẽ, ghi đủ nhãn tên hàm số và mũi tên chiều dương trục tọa độ',
      ],
      evidenceRequired: ['Chụp ảnh bài vẽ trong vở hoặc tự chấm đạt'],
      commonMistakes: [
        'Chia khoảng cách trên trục Ox và Oy không bằng nhau',
        'Tính nhầm dấu tọa độ giao điểm B(-b/a; 0)',
        'Quên vẽ mũi tên hướng dương của trục x và y',
      ],
      fallbackAction: 'Nhờ Jami AI giải thích cách tìm giao điểm Oy hoặc gửi ví dụ số cụ thể',
      completionQuestions: [
        'Điểm giao với trục tung Oy có hoành độ x bằng mấy?',
        'Khi a < 0 thì đồ thị dốc theo hướng nào?',
      ],
      nextAction: 'Làm bài trắc nghiệm nhanh 5 câu trên Jami để tích lũy điểm làm chủ chủ đề.',
    });
    taskRepo.seedDemo(userId, tasks, guideMap);

    const exams: Exam[] = [
      {
        id: 'exam-math-mid',
        userId,
        subjectId: 'subj-math',
        subjectName: 'Toán học',
        title: 'Kiểm tra giữa kỳ I - Toán 9',
        examAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
        importance: 'high',
        scopeText: 'Căn bậc hai, căn bậc ba & Hàm số bậc nhất y = ax + b',
        topics: [
          { id: 'top-1', name: 'Rút gọn biểu thức chứa căn', weight: 3 },
          { id: 'top-2', name: 'Vẽ đồ thị hàm số & tọa độ giao điểm', weight: 2 },
          { id: 'top-3', name: 'Hệ thức lượng trong tam giác vuông', weight: 3 },
        ],
        milestones: [
          { name: 'D-14: Ôn tập nền tảng', date: new Date(now.getTime() - 7 * 86400000).toISOString(), status: 'completed' },
          { name: 'D-7: Luyện đề tổng hợp', date: now.toISOString(), status: 'in_progress' },
          { name: 'D-3: Rà soát lỗi sai', date: new Date(now.getTime() + 4 * 86400000).toISOString(), status: 'pending' },
          { name: 'D-1: Giữ tinh thần thoải mái', date: new Date(now.getTime() + 6 * 86400000).toISOString(), status: 'pending' },
        ],
      },
    ];
    examRepo.seedDemo(userId, exams);

    const quizzes: Quiz[] = [
      {
        id: 'quiz-math-1',
        userId,
        examId: 'exam-math-mid',
        subjectId: 'subj-math',
        subjectName: 'Toán học',
        title: 'Đề luyện tập D-7: Hàm số bậc nhất & Đồ thị',
        type: 'simulation',
        milestone: 'D-7',
        difficulty: 'medium',
        status: 'ready',
        questionCount: 4,
        lastScore: 8.5,
      },
    ];

    const questionMap = new Map<string, QuizQuestion[]>();
    questionMap.set('quiz-math-1', [
      {
        id: 'q-1',
        quizId: 'quiz-math-1',
        order: 1,
        type: 'multiple_choice',
        prompt: 'Đồ thị của hàm số y = 2x - 4 cắt trục tung Oy tại điểm có tọa độ là:',
        options: ['A. (0; -4)', 'B. (-4; 0)', 'C. (0; 2)', 'D. (2; 0)'],
        correctAnswer: 'A. (0; -4)',
        explanation: 'Điểm cắt trục tung có hoành độ x = 0. Thay x = 0 vào hàm số được y = 2(0) - 4 = -4. Vậy tọa độ là (0; -4).',
        difficulty: 'easy',
        topicRef: 'Giao điểm trục tung',
      },
      {
        id: 'q-2',
        quizId: 'quiz-math-1',
        order: 2,
        type: 'multiple_choice',
        prompt: 'Hàm số nào sau đây nghịch biến trên tập số thực R?',
        options: ['A. y = 3x - 1', 'B. y = (1 - √2)x + 5', 'C. y = √3 x - 2', 'D. y = 0.5x + 7'],
        correctAnswer: 'B. y = (1 - √2)x + 5',
        explanation: 'Hàm số y = ax + b nghịch biến khi hệ số a < 0. Ta có 1 - √2 ≈ 1 - 1.414 = -0.414 < 0.',
        difficulty: 'medium',
        topicRef: 'Tính đồng biến nghịch biến',
      },
      {
        id: 'q-3',
        quizId: 'quiz-math-1',
        order: 3,
        type: 'multiple_choice',
        prompt: 'Tọa độ giao điểm của hai đường thẳng (d1): y = x + 1 và (d2): y = 2x - 1 là:',
        options: ['A. (2; 3)', 'B. (1; 2)', 'C. (3; 4)', 'D. (-2; -1)'],
        correctAnswer: 'A. (2; 3)',
        explanation: 'Phương trình hoành độ giao điểm: x + 1 = 2x - 1 <=> x = 2. Thay x = 2 vào (d1): y = 2 + 1 = 3. Vậy giao điểm là (2; 3).',
        difficulty: 'medium',
        topicRef: 'Tọa độ giao điểm',
      },
      {
        id: 'q-4',
        quizId: 'quiz-math-1',
        order: 4,
        type: 'multiple_choice',
        prompt: 'Góc tạo bởi đường thẳng y = x + 3 và trục Ox có số đo là:',
        options: ['A. 30°', 'B. 45°', 'C. 60°', 'D. 135°'],
        correctAnswer: 'B. 45°',
        explanation: 'Hệ số góc a = 1 = tan(α) => α = 45°.',
        difficulty: 'easy',
        topicRef: 'Hệ số góc',
      },
    ]);
    quizRepo.seedDemo(userId, quizzes, questionMap);

    const materials: Material[] = [
      {
        id: 'mat-1',
        userId,
        subjectId: 'subj-math',
        subjectName: 'Toán học',
        title: 'SGK Toán 9 Tập 1 - Chương II Hàm số bậc nhất',
        type: 'pdf',
        sizeBytes: 1024 * 1024 * 3.2,
        processingStatus: 'ready',
        summary: 'Toàn bộ lý thuyết định nghĩa hàm số bậc nhất, tính đồng biến, nghịch biến, đồ thị và vị trí tương đối giữa hai đường thẳng.',
        createdAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      },
      {
        id: 'mat-2',
        userId,
        subjectId: 'subj-eng',
        subjectName: 'Tiếng Anh',
        title: 'Unit 2 City Life - Vocabulary & Grammar Summary',
        type: 'notes',
        sizeBytes: 1024 * 450,
        processingStatus: 'ready',
        summary: 'Danh sách 20 tính từ miêu tả thành phố và bảng so sánh hơn, so sánh nhất.',
        createdAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
      },
    ];
    materialRepo.seedDemo(userId, materials);

    const notifications: Notification[] = [
      {
        id: 'notif-1',
        userId,
        type: 'upcoming_class',
        title: 'Sắp đến giờ học Toán 19:00',
        body: 'Phiên học "Vẽ đồ thị hàm số" sẽ bắt đầu sau 15 phút nữa. Hãy chuẩn bị thước kẻ và bút chì nhé!',
        deliveredAt: new Date(now.getTime() - 10 * 60000).toISOString(),
        status: 'unread',
      },
      {
        id: 'notif-2',
        userId,
        type: 'upcoming_exam',
        title: 'Cột mốc D-7: Kiểm tra giữa kỳ Toán 9',
        body: 'Còn đúng 7 ngày nữa là tới bài kiểm tra! Jami đã tạo đề luyện tập mô phỏng sẵn sàng cho em.',
        deliveredAt: new Date(now.getTime() - 3600000).toISOString(),
        status: 'unread',
      },
    ];
    notificationRepo.seedDemo(userId, notifications);

    jamiRepo.seedDemo(
      userId,
      {
        userId,
        voiceEnabled: true,
        soundEffects: true,
        selectedVoice: 'vi-VN-Standard-A',
        animationEnabled: true,
        responseLength: 'balanced',
        preferredAddress: 'Minh',
        memoryEnabled: true,
      },
      [
        {
          id: 'mem-1',
          userId,
          category: 'weak_subject',
          summary: 'Cần củng cố thêm các bước vẽ bảng biến thiên hàm số bậc nhất',
          createdAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
        },
      ]
    );
  }
}
