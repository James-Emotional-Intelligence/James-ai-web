import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Plus,
  Clock,
  CheckCircle2,
  Play,
  Sparkles,
  BookOpen,
  ChevronRight,
  X,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { Exam, Quiz, QuizAttempt } from '../../../shared/types';
import confetti from 'canvas-confetti';

export const ExamsPage: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<{ attempt: QuizAttempt; answersFeedback: any[] } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);

  // New Exam Form State
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamSubject, setNewExamSubject] = useState('Toán học');
  const [newExamDate, setNewExamDate] = useState('');
  const [newExamScope, setNewExamScope] = useState('');
  const [newExamImportance, setNewExamImportance] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [isSavingExam, setIsSavingExam] = useState(false);

  const fetchExamsAndQuizzes = async () => {
    try {
      const [examData, quizData] = await Promise.all([api.getExams(), api.getQuizzes()]);
      setExams(examData.exams);
      setQuizzes(quizData.quizzes);
    } catch {}
  };

  useEffect(() => {
    fetchExamsAndQuizzes();
  }, []);

  const handleStartQuiz = async (quizId: string) => {
    try {
      const res = await api.getQuiz(quizId);
      setActiveQuiz(res.quiz);
      setUserAnswers({});
      setQuizResult(null);
    } catch (err: any) {
      alert(err.message || 'Không thể mở bài thi.');
    }
  };

  const handleAnswerSelect = (questionId: string, answer: string) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;
    setIsSubmitting(true);

    const formattedAnswers = activeQuiz.questions.map((q) => ({
      questionId: q.id,
      answer: userAnswers[q.id] || '',
    }));

    try {
      const res = await api.submitQuiz(activeQuiz.id, formattedAnswers);
      setQuizResult(res);
      confetti({ particleCount: 90, spread: 70 });
    } catch (err: any) {
      alert(err.message || 'Không thể nộp bài.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle.trim() || !newExamDate) return;

    setIsSavingExam(true);
    try {
      const res = await api.addExam({
        title: newExamTitle.trim(),
        subjectName: newExamSubject,
        subjectId: 'subj-math',
        examAt: new Date(newExamDate).toISOString(),
        importance: newExamImportance,
        scopeText: newExamScope.trim() || 'Phạm vi kiểm tra chương học trọng tâm.',
        status: 'upcoming',
        topics: [{ id: 'top-1', name: newExamSubject, weight: 1 }],
      });

      setExams([res.exam, ...exams]);
      setNewExamTitle('');
      setNewExamDate('');
      setNewExamScope('');
      setIsAddExamOpen(false);
      confetti({ particleCount: 70, spread: 50 });
    } catch (err: any) {
      alert(err.message || 'Không thể thêm kỳ kiểm tra.');
    } finally {
      setIsSavingExam(false);
    }
  };

  const calculateDaysRemaining = (examAt: string) => {
    const diff = new Date(examAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl">
        <div>
          <h1 className="text-xl font-black text-[#F3FAF5] flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-[#22C55E]" />
            <span>Trung Tâm Kiểm Tra & Ôn Tập AI</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-0.5">
            Lộ trình ôn thi thông minh theo mốc D-14, D-7, D-3, D-1 với đề luyện tập tự động
          </p>
        </div>

        <button
          onClick={() => setIsAddExamOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm kỳ kiểm tra mới</span>
        </button>
      </div>

      {/* Active Quiz Runner View */}
      {activeQuiz && (
        <div className="bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.3)] shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Quiz Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[rgba(34,197,94,0.18)]">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                  {activeQuiz.milestone || 'Đề Luyện Tập'}
                </span>
                <span className="text-xs text-[#A9B8AE] font-semibold">
                  {activeQuiz.questions?.length || 0} câu trắc nghiệm
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#F3FAF5] mt-1">{activeQuiz.title}</h2>
            </div>
            <button
              onClick={() => setActiveQuiz(null)}
              className="text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
            >
              Thoát bài thi
            </button>
          </div>

          {!quizResult ? (
            /* Question List */
            <div className="space-y-6">
              {activeQuiz.questions?.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#16A34A] text-[#050806] flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-[#F3FAF5] flex-1">
                      {q.prompt}
                    </div>
                  </div>

                  {/* Multiple Choice Options */}
                  {q.options && Array.isArray(q.options) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-9">
                      {q.options.map((opt: any, optIdx: number) => {
                        const optValue = typeof opt === 'string' ? opt : opt.text || opt.id;
                        const optKey = typeof opt === 'string' ? String(optIdx + 1) : opt.id || String(optIdx + 1);
                        const isSelected = userAnswers[q.id] === optValue;
                        return (
                          <button
                            key={optKey}
                            onClick={() => handleAnswerSelect(q.id, optValue)}
                            className={`text-left p-3 rounded-xl text-xs font-medium border transition-all flex items-center gap-2.5 cursor-pointer ${
                              isSelected
                                ? 'bg-[#14532D] border-[#22C55E] text-[#86EFAC] font-bold ring-2 ring-[#22C55E]/30'
                                : 'bg-[#050806] border-[rgba(34,197,94,0.2)] text-[#A9B8AE] hover:bg-[#101A13]'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                                isSelected ? 'bg-[#22C55E] text-[#050806]' : 'bg-[#101A13] text-[#A9B8AE]'
                              }`}
                            >
                              {optKey}
                            </span>
                            <span>{optValue}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Short answer input */}
                  {q.type === 'short_answer' && (
                    <div className="pl-9">
                      <input
                        type="text"
                        placeholder="Nhập câu trả lời của bạn..."
                        value={userAnswers[q.id] || ''}
                        onChange={(e) => handleAnswerSelect(q.id, e.target.value)}
                        className="w-full text-xs p-3 bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-end pt-4">
                <button
                  onClick={handleSubmitQuiz}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs sm:text-sm font-black rounded-2xl shadow-lg shadow-[#16A34A]/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Đang chấm điểm...' : 'Nộp bài & Chấm điểm tự động'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Post-Submit Score & Explanation Breakdown */
            <div className="space-y-6">
              {/* Score Hero Card */}
              <div className="p-6 rounded-3xl bg-[#101A13] border border-[#22C55E]/40 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
                <div>
                  <div className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                    Kết quả chấm điểm AI
                  </div>
                  <div className="text-3xl font-black text-[#F3FAF5] mt-1">
                    {quizResult.attempt.score} / {quizResult.attempt.maxScore || 10} Điểm
                  </div>
                  <p className="text-xs text-[#A9B8AE] mt-1 leading-relaxed">
                    {quizResult.attempt.feedbackSummary}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setActiveQuiz(null)}
                    className="px-5 py-2.5 rounded-xl bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] text-xs font-bold hover:bg-[#142219] cursor-pointer"
                  >
                    Đóng bài thi
                  </button>
                </div>
              </div>

              {/* Question Explanations List */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                  Chi tiết lời giải & giải thích từng câu:
                </h3>

                {quizResult.answersFeedback.map((fb, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border text-xs space-y-2 ${
                      fb.isCorrect
                        ? 'bg-[#101A13] border-[#22C55E]/40'
                        : 'bg-rose-950/30 border-rose-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className={fb.isCorrect ? 'text-[#86EFAC]' : 'text-rose-300'}>
                        Câu {idx + 1}: {fb.isCorrect ? 'Chính xác' : 'Chưa đúng'}
                      </span>
                      <span className="text-[#A9B8AE]">Đáp án đúng: {fb.correctAnswer}</span>
                    </div>

                    <p className="text-[#A9B8AE] leading-relaxed font-medium">
                      <strong className="text-[#F3FAF5]">Giải thích chi tiết: </strong>
                      {fb.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Exams List & Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Exams Countdown Cards */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#22C55E]" />
            <span>Kỳ kiểm tra đang chuẩn bị</span>
          </h2>

          <div className="space-y-4">
            {exams.map((exam) => {
              const daysLeft = calculateDaysRemaining(exam.examAt);
              return (
                <div
                  key={exam.id}
                  className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4 hover:border-[#22C55E]/50 transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                        {exam.subjectName || 'Toán học'}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-950/60 text-rose-300 border border-rose-800/40">
                        Mức độ: {exam.importance === 'critical' ? 'Rất quan trọng' : 'Quan trọng'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#86EFAC] bg-[#101A13] px-3 py-1 rounded-full border border-[rgba(34,197,94,0.2)]">
                      <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Còn {daysLeft} ngày</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#F3FAF5]">{exam.title}</h3>
                    <p className="text-xs text-[#A9B8AE] mt-1">{exam.scopeText}</p>
                  </div>

                  {/* Milestones Tracker */}
                  <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)] space-y-3">
                    <div className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                      Lộ trình ôn tập 4 mốc thời gian:
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#050806] border border-[rgba(34,197,94,0.15)] space-y-1">
                        <div className="font-extrabold text-[#86EFAC]">Mốc D-14</div>
                        <div className="text-[10px] text-[#A9B8AE]">Đề chẩn đoán</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#14532D] border border-[#22C55E] space-y-1 ring-2 ring-[#22C55E]/25">
                        <div className="font-extrabold text-[#86EFAC]">Mốc D-7 (Hiện tại)</div>
                        <div className="text-[10px] text-[#86EFAC] font-semibold">Ôn điểm yếu</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#050806] border border-[rgba(34,197,94,0.15)] space-y-1 opacity-70">
                        <div className="font-extrabold text-[#A9B8AE]">Mốc D-3</div>
                        <div className="text-[10px] text-[#526356]">Thi thử mô phỏng</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#050806] border border-[rgba(34,197,94,0.15)] space-y-1 opacity-70">
                        <div className="font-extrabold text-[#A9B8AE]">Mốc D-1</div>
                        <div className="text-[10px] text-[#526356]">Ôn lỗi sai</div>
                      </div>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-[#A9B8AE]">
                      Đề Luyện Tập AI đã được Jami chuẩn bị sẵn
                    </span>
                    <button
                      onClick={() => handleStartQuiz(quizzes[0]?.id || 'quiz-toan-d7')}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-[#050806]" />
                      <span>Làm bài kiểm tra D-7</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Practice Quizzes Sidebar */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#22C55E]" />
            <span>Kho đề ôn luyện AI</span>
          </h2>

          <div className="p-5 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.2)] shadow-xl space-y-3">
            {quizzes.map((q) => (
              <div
                key={q.id}
                className="p-4 rounded-2xl border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40 transition-all space-y-2 bg-[#101A13]"
              >
                <div className="font-bold text-xs text-[#F3FAF5]">{q.title}</div>
                <div className="flex items-center justify-between text-[11px] text-[#A9B8AE]">
                  <span>5 Câu hỏi • 15 phút</span>
                  <button
                    onClick={() => handleStartQuiz(q.id)}
                    className="font-bold text-[#86EFAC] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Làm đề</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Exam Modal */}
      {isAddExamOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Plus className="w-4 h-4 text-[#22C55E]" />
                <span>Thêm kỳ kiểm tra mới</span>
              </div>
              <button onClick={() => setIsAddExamOpen(false)} className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddExam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Tên bài kiểm tra:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Kiểm tra 1 tiết Toán - Hàm số"
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  className="w-full text-xs p-3 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Môn học:</label>
                  <select
                    value={newExamSubject}
                    onChange={(e) => setNewExamSubject(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  >
                    <option value="Toán học">Toán học</option>
                    <option value="Tiếng Anh">Tiếng Anh</option>
                    <option value="Ngữ văn">Ngữ văn</option>
                    <option value="Vật lý">Vật lý</option>
                    <option value="Hóa học">Hóa học</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Ngày thi:</label>
                  <input
                    type="date"
                    required
                    value={newExamDate}
                    onChange={(e) => setNewExamDate(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Phạm vi ôn tập:</label>
                <textarea
                  rows={2}
                  placeholder="Ví dụ: Chương 1 và Chương 2 SGK..."
                  value={newExamScope}
                  onChange={(e) => setNewExamScope(e.target.value)}
                  className="w-full text-xs p-3 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddExamOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingExam}
                  className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow cursor-pointer disabled:opacity-50"
                >
                  {isSavingExam ? 'Đang lưu...' : 'Tạo kỳ kiểm tra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
