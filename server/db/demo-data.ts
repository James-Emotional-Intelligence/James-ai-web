import {
  User,
  StudentProfile,
  Subject,
  TimetableEntry,
  BusyEvent,
  Exam,
  StudyTask,
  ExecutionGuide,
  Quiz,
  NotificationItem,
  JamiMemorySummary,
  TopicMastery,
  LearningMaterial,
} from '../../shared/types';

export const DEMO_USER: User = {
  id: 'usr_student_demo_01',
  email: 'minh.hocsinh@jami.edu.vn',
  displayName: 'Nguyễn Quang Minh',
  preferredName: 'Minh',
  locale: 'vi-VN',
  timezone: 'Asia/Ho_Chi_Minh',
  ageBand: '14-15',
  role: 'user',
  status: 'active',
  createdAt: '2026-08-20T00:00:00.000Z',
};

export const ADMIN_USER: User = {
  id: 'usr_admin_james_01',
  email: 'james.admin@gmail.com',
  displayName: 'James Admin',
  preferredName: 'Admin',
  locale: 'vi-VN',
  timezone: 'Asia/Ho_Chi_Minh',
  ageBand: 'adult',
  role: 'admin',
  status: 'active',
  createdAt: '2026-08-20T00:00:00.000Z',
};

export const DEMO_PROFILE: StudentProfile = {
  userId: 'usr_student_demo_01',
  gradeLevel: 9,
  schoolName: 'THCS Lê Quý Đôn',
  goals: ['Đạt điểm 9 môn Toán học kỳ 1', 'Nắm chắc kiến thức đồ thị hàm số', 'Duy trì thói quen học 45 phút mỗi tối'],
  preferredSessionMinutes: 45,
  maxDailyStudyMinutes: 180,
  energyPreferences: {
    morning: 'high',
    afternoon: 'medium',
    evening: 'high',
  },
  sleepSchedule: {
    wakeTime: '06:00',
    bedTime: '22:30',
  },
  mealTimes: {
    lunch: '12:00',
    dinner: '18:30',
  },
  onboardingCompletedAt: '2026-08-20T08:00:00.000Z',
};

export const DEMO_SUBJECTS: Subject[] = [
  { id: 'subj-toan', userId: 'usr_student_demo_01', name: 'Toán học', color: '#2563EB', icon: 'Calculator', sortOrder: 1 },
  { id: 'subj-van', userId: 'usr_student_demo_01', name: 'Ngữ văn', color: '#EA580C', icon: 'BookOpen', sortOrder: 2 },
  { id: 'subj-anh', userId: 'usr_student_demo_01', name: 'Tiếng Anh', color: '#16A34A', icon: 'Globe', sortOrder: 3 },
  { id: 'subj-ly', userId: 'usr_student_demo_01', name: 'Vật lý', color: '#9333EA', icon: 'Atom', sortOrder: 4 },
];

export const DEMO_TIMETABLE_ENTRIES: TimetableEntry[] = [
  // Monday to Friday: 07:15 - 11:30
  { id: 'tt-1', timetableId: 'tt-main', title: 'Học chính khóa tại trường (Toán, Văn, Anh)', dayOfWeek: 1, startLocalTime: '07:15', endLocalTime: '11:45', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
  { id: 'tt-2', timetableId: 'tt-main', title: 'Học chính khóa tại trường (Lý, Hóa, Sử)', dayOfWeek: 2, startLocalTime: '07:15', endLocalTime: '11:45', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
  { id: 'tt-3', timetableId: 'tt-main', title: 'Học chính khóa tại trường (Toán, Địa, GDCD)', dayOfWeek: 3, startLocalTime: '07:15', endLocalTime: '11:45', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
  { id: 'tt-4', timetableId: 'tt-main', title: 'Học chính khóa tại trường (Sinh, Tin, Công nghệ)', dayOfWeek: 4, startLocalTime: '07:15', endLocalTime: '11:45', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
  { id: 'tt-5', timetableId: 'tt-main', title: 'Học chính khóa tại trường (Toán, Văn, Thể dục)', dayOfWeek: 5, startLocalTime: '07:15', endLocalTime: '11:45', commuteBeforeMinutes: 15, commuteAfterMinutes: 15 },
];

export const DEMO_BUSY_EVENTS: BusyEvent[] = [
  {
    id: 'busy-1',
    userId: 'usr_student_demo_01',
    type: 'extra_class',
    title: 'Học thêm Toán nâng cao (Thầy Hùng)',
    startsAt: '2026-08-25T10:30:00.000Z', // 17:30 VN
    endsAt: '2026-08-25T12:00:00.000Z',   // 19:00 VN
    timezone: 'Asia/Ho_Chi_Minh',
    isFixed: true,
    subjectId: 'subj-toan',
  },
  {
    id: 'busy-2',
    userId: 'usr_student_demo_01',
    type: 'extra_class',
    title: 'Học thêm Tiếng Anh Giao tiếp & IELTS Foundation',
    startsAt: '2026-08-27T10:30:00.000Z', // 17:30 VN
    endsAt: '2026-08-27T12:00:00.000Z',   // 19:00 VN
    timezone: 'Asia/Ho_Chi_Minh',
    isFixed: true,
    subjectId: 'subj-anh',
  },
  {
    id: 'busy-3',
    userId: 'usr_student_demo_01',
    type: 'personal',
    title: 'CLB Bóng rổ trường',
    startsAt: '2026-08-26T09:30:00.000Z', // 16:30 VN
    endsAt: '2026-08-26T10:45:00.000Z',   // 17:45 VN
    timezone: 'Asia/Ho_Chi_Minh',
    isFixed: true,
  },
];

// Exam in 7 days
export const DEMO_EXAM: Exam = {
  id: 'exam-toan-ham-so',
  userId: 'usr_student_demo_01',
  subjectId: 'subj-toan',
  title: 'Kiểm tra 1 tiết Toán: Hàm số bậc nhất và Đồ thị',
  examAt: '2026-08-31T01:00:00.000Z', // 08:00 VN in 7 days
  importance: 'high',
  scopeText: 'Chương II: Hàm số y = ax + b, tính đồng biến/nghịch biến, vẽ đồ thị và vị trí tương đối hai đường thẳng.',
  topics: [
    { id: 'top-1', name: 'Khái niệm & tính chất hàm số bậc nhất', weight: 2 },
    { id: 'top-2', name: 'Vẽ đồ thị hàm số y = ax + b (a ≠ 0)', weight: 4 },
    { id: 'top-3', name: 'Vị trí tương đối của hai đường thẳng song song / cắt nhau', weight: 4 },
  ],
  status: 'upcoming',
};

export const DEMO_MATH_EXECUTION_GUIDE: ExecutionGuide = {
  id: 'guide-math-1',
  taskId: 'task-math-1',
  objective: 'Nắm vững cách vẽ đồ thị hàm số y = ax + b và giải 5 bài tập xác định tọa độ giao điểm.',
  whyItMatters: 'Dạng bài này chiếm 3.5 điểm trong đề kiểm tra giữa kỳ sắp tới và là nền tảng của hình học tọa độ lớp 9.',
  prerequisites: ['Đã học định nghĩa hàm số y = ax + b', 'Biết cách xác định điểm cắt trục tung (0, b) và trục hoành (-b/a, 0)'],
  materials: ['Sách giáo khoa Toán 9 tập 1', 'Vở bài tập Toán', 'Thước kẻ chia vạch, bút mực xanh và đỏ'],
  preparationChecklist: [
    { id: 'prep-1', text: 'Dọn sạch bàn học, chỉ để vở Toán và thước kẻ', checked: true },
    { id: 'prep-2', text: 'Tắt thông báo điện thoại, đặt chế độ Tập trung', checked: true },
    { id: 'prep-3', text: 'Chuẩn bị 1 cốc nước ấm bên cạnh', checked: false },
  ],
  steps: [
    {
      id: 'step-1',
      stepOrder: 1,
      title: 'Chuẩn bị và ổn định tâm thế',
      plannedMinutes: 5,
      instruction: 'Mở trang 48 SGK Toán 9. Đọc lướt lại 2 ví dụ mẫu về cách tìm 2 điểm đặc biệt trên hệ trục Oxy.',
      expectedOutput: 'Ghi nhớ công thức xác định giao điểm với Ox và Oy.',
      tips: ['Điểm cắt Oy luôn có hoành độ x = 0 (tọa độ A(0, b))', 'Điểm cắt Ox luôn có tung độ y = 0 (tọa độ B(-b/a, 0))'],
      status: 'pending',
    },
    {
      id: 'step-2',
      stepOrder: 2,
      title: 'Ôn nhanh lý thuyết trọng tâm',
      plannedMinutes: 10,
      instruction: 'Ghi vắn tắt vào sổ tay: Điều kiện hàm số đồng biến khi a > 0, nghịch biến khi a < 0. Điều kiện 2 đường thẳng d1 // d2 khi a = a\' và b ≠ b\'.',
      expectedOutput: 'Một khung tóm tắt lý thuyết đóng khung trong vở.',
      tips: ['Dùng bút đỏ gạch chân điều kiện a ≠ 0'],
      status: 'pending',
    },
    {
      id: 'step-3',
      stepOrder: 3,
      title: 'Thực hành giải 5 bài tập rèn kỹ năng',
      plannedMinutes: 20,
      instruction: 'Làm bài 14, 15, 16 (trang 51 SGK) và 2 bài trong đề kiểm tra mẫu. Vẽ hình chính xác từng trục tọa độ.',
      expectedOutput: 'Lời giải chi tiết 5 bài toán có hình vẽ rõ ràng.',
      tips: ['Chia tỉ lệ trên trục Ox và Oy phải bằng nhau', 'Ghi rõ tên trục Ox, Oy và gốc O'],
      status: 'pending',
    },
    {
      id: 'step-4',
      stepOrder: 4,
      title: 'Kiểm tra và so sánh đáp án',
      plannedMinutes: 5,
      instruction: 'Đối chiếu kết quả tọa độ giao điểm bằng phương pháp đại số: Cho 2 vế phải bằng nhau để tìm nghiệm x.',
      expectedOutput: 'Xác nhận đúng / sai cho từng bài tập.',
      tips: ['Nếu đồ thị và đại số cho kết quả khác nhau, hãy kiểm tra lại tỉ lệ chia vạch'],
      status: 'pending',
    },
    {
      id: 'step-5',
      stepOrder: 5,
      title: 'Ghi chú lỗi sai và rút kinh nghiệm',
      plannedMinutes: 5,
      instruction: 'Ghi lại 1 lỗi tính toán thường gặp (ví dụ: quên đổi dấu khi chuyển vế) vào mục lưu ý của Jami.',
      expectedOutput: '1 gạch đầu dòng kinh nghiệm để không lặp lại trong bài kiểm tra thật.',
      tips: ['Lỗi sai hôm nay chính là điểm số được bảo toàn ngày mai'],
      status: 'pending',
    },
  ],
  successCriteria: [
    'Hoàn thành đầy đủ 5 bài tập trong 45 phút',
    'Hình vẽ đồ thị sạch đẹp, đúng tỉ lệ trên hệ trục Oxy',
    'Tìm đúng tọa độ giao điểm bằng phương trình hoành độ giao điểm',
  ],
  excellentCriteria: [
    'Đúng ít nhất 4/5 câu ngay trong lần thử đầu tiên',
    'Tự tóm tắt được lỗi sai và cách khắc phục mà không cần xem gợi ý',
  ],
  evidenceRequired: [
    'Ảnh chụp trang vở giải 5 bài tập hoặc ghi chú ngắn về kết quả tính toán',
  ],
  commonMistakes: [
    'Quên ghi tên trục Ox, Oy hoặc mũi tên định hướng',
    'Nhầm lẫn giữa điểm cắt trục tung (0, b) và trục hoành (-b/a, 0)',
    'Không đặt điều kiện a ≠ 0 khi giải bài toán tìm tham số m',
  ],
  fallbackAction: 'Nếu bị kẹt ở bước vẽ đồ thị quá 5 phút, hãy nhấn nút "Hỏi Jami" để nhận gợi ý từng bước mà không cần xem đáp án hoàn chỉnh.',
  completionQuestions: [
    'Em đã hiểu rõ cách tìm tọa độ giao điểm của 2 đường thẳng chưa?',
    'Mức độ tự tin của em cho dạng bài này là mấy sao (1-5)?',
  ],
  nextAction: 'Ngày mai sẽ luyện tập bài toán tìm tham số m để hai đường thẳng cắt nhau tại 1 điểm trên trục tung.',
};

export const DEMO_TASKS: StudyTask[] = [
  {
    id: 'task-math-1',
    userId: 'usr_student_demo_01',
    subjectId: 'subj-toan',
    examId: 'exam-toan-ham-so',
    title: 'Toán — Luyện vẽ đồ thị hàm số & tìm tọa độ giao điểm',
    objective: 'Hoàn thành 5 bài tập hàm số y = ax + b chuẩn bị cho bài kiểm tra tuần sau.',
    status: 'pending',
    priority: 'high',
    difficulty: 'medium',
    dueAt: '2026-08-24T15:00:00.000Z',
    estimatedMinutes: 45,
    minimumSessionMinutes: 30,
    maximumSessionMinutes: 60,
    splittable: false,
    locked: false,
    scheduledStartAt: '2026-08-24T12:00:00.000Z', // 19:00 VN Today
    scheduledEndAt: '2026-08-24T12:45:00.000Z',   // 19:45 VN Today
    completionPercent: 0,
    executionGuide: DEMO_MATH_EXECUTION_GUIDE,
  },
  {
    id: 'task-eng-1',
    userId: 'usr_student_demo_01',
    subjectId: 'subj-anh',
    title: 'Tiếng Anh — Ôn tập Unit 2: City Life (Từ vựng & So sánh kép)',
    objective: 'Học 20 từ vựng chủ đề đô thị và làm 10 câu trắc nghiệm cấu trúc The more... the more...',
    status: 'pending',
    priority: 'medium',
    difficulty: 'medium',
    dueAt: '2026-08-25T14:00:00.000Z',
    estimatedMinutes: 40,
    minimumSessionMinutes: 25,
    maximumSessionMinutes: 45,
    splittable: false,
    locked: false,
    scheduledStartAt: '2026-08-24T13:00:00.000Z', // 20:00 VN Today
    scheduledEndAt: '2026-08-24T13:40:00.000Z',   // 20:40 VN Today
    completionPercent: 0,
  },
  {
    id: 'task-van-1',
    userId: 'usr_student_demo_01',
    subjectId: 'subj-van',
    title: 'Ngữ văn — Đọc hiểu tác phẩm "Chuyện người con gái Nam Xương"',
    objective: 'Lập sơ đồ tư duy về phẩm chất và bi kịch của nhân vật Vũ Nương.',
    status: 'completed',
    priority: 'medium',
    difficulty: 'easy',
    dueAt: '2026-08-23T14:00:00.000Z',
    estimatedMinutes: 45,
    minimumSessionMinutes: 30,
    maximumSessionMinutes: 60,
    splittable: false,
    locked: true,
    scheduledStartAt: '2026-08-23T12:30:00.000Z',
    scheduledEndAt: '2026-08-23T13:15:00.000Z',
    completionPercent: 100,
  },
];

export const DEMO_QUIZ: Quiz = {
  id: 'quiz-toan-d7',
  userId: 'usr_student_demo_01',
  examId: 'exam-toan-ham-so',
  subjectId: 'subj-toan',
  title: 'Đề Luyện Tập AI: Hàm số bậc nhất & Đồ thị (Mốc D-7)',
  type: 'weak_topic',
  milestone: 'D-7',
  difficulty: 'medium',
  generatedByAi: true,
  createdAt: '2026-08-24T00:00:00.000Z',
  questions: [
    {
      id: 'q-1',
      order: 1,
      type: 'multiple_choice',
      prompt: 'Hàm số nào sau đây là hàm số bậc nhất đồng biến trên ℝ?',
      options: [
        { id: 'A', text: 'y = -2x + 3' },
        { id: 'B', text: 'y = (√3 - 2)x + 1' },
        { id: 'C', text: 'y = (2 - √3)x - 5' },
        { id: 'D', text: 'y = 0x + 4' },
      ],
      difficulty: 'easy',
      topicRef: 'Tính đồng biến nghịch biến',
      correctAnswer: 'C',
      explanation: 'Hàm số y = ax + b đồng biến khi hệ số góc a > 0. Vì 2 > √3 (2 = √4 > √3) nên 2 - √3 > 0, do đó hàm số y = (2 - √3)x - 5 đồng biến trên ℝ.',
    },
    {
      id: 'q-2',
      order: 2,
      type: 'multiple_choice',
      prompt: 'Đồ thị hàm số y = 2x - 4 cắt trục hoành tại điểm có tọa độ là:',
      options: [
        { id: 'A', text: '(0; -4)' },
        { id: 'B', text: '(2; 0)' },
        { id: 'C', text: '(-2; 0)' },
        { id: 'D', text: '(0; 2)' },
      ],
      difficulty: 'easy',
      topicRef: 'Giao điểm với trục tọa độ',
      correctAnswer: 'B',
      explanation: 'Điểm cắt trục hoành có tung độ y = 0. Thay y = 0 vào phương trình: 0 = 2x - 4 <=> 2x = 4 <=> x = 2. Vậy tọa độ giao điểm là (2; 0).',
    },
    {
      id: 'q-3',
      order: 3,
      type: 'true_false',
      prompt: 'Hai đường thẳng (d1): y = 3x - 1 và (d2): y = 3x + 5 song song với nhau.',
      options: [
        { id: 'true', text: 'Đúng' },
        { id: 'false', text: 'Sai' },
      ],
      difficulty: 'medium',
      topicRef: 'Vị trí tương đối hai đường thẳng',
      correctAnswer: 'true',
      explanation: 'Vì a = a\' = 3 và b = -1 ≠ b\' = 5 nên hai đường thẳng (d1) và (d2) song song với nhau.',
    },
    {
      id: 'q-4',
      order: 4,
      type: 'multiple_choice',
      prompt: 'Tìm giá trị của m để đồ thị hàm số y = (m - 1)x + 2 đi qua điểm M(2; 4):',
      options: [
        { id: 'A', text: 'm = 2' },
        { id: 'B', text: 'm = 1' },
        { id: 'C', text: 'm = 3' },
        { id: 'D', text: 'm = -2' },
      ],
      difficulty: 'medium',
      topicRef: 'Điểm thuộc đồ thị hàm số',
      correctAnswer: 'A',
      explanation: 'Thay x = 2 và y = 4 vào phương trình hàm số: 4 = (m - 1)*2 + 2 <=> (m - 1)*2 = 2 <=> m - 1 = 1 <=> m = 2 (thỏa mãn điều kiện m ≠ 1).',
    },
    {
      id: 'q-5',
      order: 5,
      type: 'short_answer',
      prompt: 'Góc tạo bởi đường thẳng y = x + 3 với trục Ox có số đo là bao nhiêu độ? (Nhập số nguyên, ví dụ: 45)',
      difficulty: 'medium',
      topicRef: 'Hệ số góc',
      correctAnswer: '45',
      explanation: 'Đường thẳng có hệ số góc a = 1 > 0. Ta có tan(α) = a = 1, suy ra góc α tạo bởi đường thẳng với tia Ox là 45°.',
    },
  ],
};

export const DEMO_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    userId: 'usr_student_demo_01',
    type: 'upcoming_class',
    title: 'Sắp đến giờ học Toán tối nay',
    body: 'Lịch học lúc 19:00: "Luyện vẽ đồ thị hàm số & tìm tọa độ giao điểm" (45 phút). Hãy chuẩn bị thước kẻ và vở bài tập nhé!',
    actionUrl: '/tasks/task-math-1',
    status: 'unread',
    createdAt: '2026-08-24T11:45:00.000Z',
  },
  {
    id: 'notif-2',
    userId: 'usr_student_demo_01',
    type: 'upcoming_exam',
    title: 'Còn 7 ngày đến bài kiểm tra Toán 1 tiết',
    body: 'Jami đã tạo sẵn Đề Luyện Tập AI (Mốc D-7) tập trung vào phần đồ thị hàm số. Em hãy thử sức nhé!',
    actionUrl: '/exams',
    status: 'unread',
    createdAt: '2026-08-24T01:00:00.000Z',
  },
  {
    id: 'notif-3',
    userId: 'usr_student_demo_01',
    type: 'incomplete_task',
    title: 'Đề xuất tối ưu hóa lịch học',
    body: 'Thứ Ba em có lịch học thêm lúc 17:30. Jami đã tự động chuyển phiên tự học sang 20:00 để em kịp ăn tối nghỉ ngơi.',
    actionUrl: '/timetable',
    status: 'read',
    createdAt: '2026-08-23T15:00:00.000Z',
  },
];

export const DEMO_TOPIC_MASTERY: TopicMastery[] = [
  { id: 'tm-1', subjectId: 'subj-toan', topicKey: 'Khái niệm hàm số bậc nhất', masteryScore: 85, confidence: 80, evidenceCount: 4, lastPracticedAt: '2026-08-22T14:00:00.000Z' },
  { id: 'tm-2', subjectId: 'subj-toan', topicKey: 'Vẽ đồ thị hàm số Oxy', masteryScore: 62, confidence: 65, evidenceCount: 3, lastPracticedAt: '2026-08-23T13:00:00.000Z' },
  { id: 'tm-3', subjectId: 'subj-toan', topicKey: 'Vị trí tương đối 2 đường thẳng', masteryScore: 55, confidence: 60, evidenceCount: 2, lastPracticedAt: '2026-08-21T12:00:00.000Z' },
  { id: 'tm-4', subjectId: 'subj-anh', topicKey: 'Từ vựng City Life', masteryScore: 78, confidence: 85, evidenceCount: 3, lastPracticedAt: '2026-08-23T15:00:00.000Z' },
  { id: 'tm-5', subjectId: 'subj-van', topicKey: 'Phân tích nhân vật Vũ Nương', masteryScore: 90, confidence: 90, evidenceCount: 5, lastPracticedAt: '2026-08-23T13:15:00.000Z' },
];

export const DEMO_MATERIALS: LearningMaterial[] = [
  {
    id: 'mat-1',
    userId: 'usr_student_demo_01',
    subjectId: 'subj-toan',
    title: 'Đề cương ôn tập Toán 9 Chương II — Đồ thị và Hàm số bậc nhất.pdf',
    type: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1245184,
    processingStatus: 'ready',
    createdAt: '2026-08-21T10:00:00.000Z',
  },
  {
    id: 'mat-2',
    userId: 'usr_student_demo_01',
    subjectId: 'subj-toan',
    title: 'Ảnh chụp bài giải mẫu tìm tọa độ giao điểm có tham số m.jpg',
    type: 'image',
    mimeType: 'image/jpeg',
    sizeBytes: 854200,
    processingStatus: 'ready',
    createdAt: '2026-08-22T08:30:00.000Z',
  },
];

export const DEMO_JAMI_MEMORIES: JamiMemorySummary[] = [
  {
    id: 'mem-1',
    category: 'weak_subject',
    summary: 'Minh thường cần thêm 5-10 phút khi vẽ đồ thị hàm số có hệ số góc phân số.',
    createdAt: '2026-08-22T14:30:00.000Z',
  },
  {
    id: 'mem-2',
    category: 'preference',
    summary: 'Thích bắt đầu phiên học bằng 5 phút chuẩn bị ngắn và kết thúc bằng 1 câu tổng kết lỗi sai.',
    createdAt: '2026-08-23T10:00:00.000Z',
  },
];
