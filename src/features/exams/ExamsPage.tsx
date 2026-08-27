import React, { useState, useEffect, useCallback } from 'react';
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
  AlertCircle,
  RefreshCw,
  Award,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { Exam, Quiz, QuizAttempt, Subject, ExamMilestone } from '../../../shared/types';
import confetti from 'canvas-confetti';

export const ExamsPage: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Quiz State
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<QuizAttempt | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<{ attempt: QuizAttempt; answersFeedback: any[] } | null>(null);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingMilestone, setGeneratingMilestone] = useState<{ examId: string; milestone: string } | null>(null);

  // Add Exam Form State
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamSubjectId, setNewExamSubjectId] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [newExamScope, setNewExamScope] = useState('');
  const [newExamImportance, setNewExamImportance] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [examFormError, setExamFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [examData, subjectData, quizData] = await Promise.all([
        api.getExams(),
        api.getSubjects(),
        api.getQuizzes(),
      ]);
      setExams(examData.exams);
      setSubjects(subjectData.subjects);
      setQuizzes(quizData.quizzes);

      if (subjectData.subjects.length > 0 && !newExamSubjectId) {
        setNewExamSubjectId(subjectData.subjects[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu kỳ kiểm tra.');
    } finally {
      setIsLoading(false);
    }
  }, [newExamSubjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStartQuiz = async (quizId: string) => {
    setIsStartingQuiz(true);
    try {
      const [quizRes, attemptRes] = await Promise.all([
        api.getQuiz(quizId),
        api.startQuizAttempt(quizId),
      ]);
      setActiveQuiz(quizRes.quiz);
      setActiveAttempt(attemptRes.attempt);
      setUserAnswers({});
      setQuizResult(null);
    } catch (err: any) {
      alert(err.message || 'Không thể bắt đầu làm bài thi.');
    } finally {
      setIsStartingQuiz(false);
    }
  };

  const handleGenerateExamQuiz = async (exam: Exam, milestone: 'D-14' | 'D-7' | 'D-3' | 'D-1') => {
    setGeneratingMilestone({ examId: exam.id, milestone });
    try {
      const res = await api.generateExamQuiz(exam.id, {
        milestone,
        questionCount: 5,
        difficulty: exam.importance === 'critical' ? 'hard' : 'medium',
      });
      // Refetch and start immediately
      await fetchData();
      if (res.quiz?.id) {
        await handleStartQuiz(res.quiz.id);
      }
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề ôn tập.');
    } finally {
      setGeneratingMilestone(null);
    }
  };

  const handleAnswerSelect = (questionId: string, answer: string) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;
    const questions = activeQuiz.questions || [];
    const unanswered = questions.filter((q) => !userAnswers[q.id] || !userAnswers[q.id].trim());

    if (unanswered.length > 0) {
      const confirmSubmit = window.confirm(
        `Em còn ${unanswered.length} câu chưa trả lời. Em có chắc chắn muốn nộp bài không?`
      );
      if (!confirmSubmit) return;
    }

    setIsSubmitting(true);

    const formattedAnswers = questions.map((q) => ({
      questionId: q.id,
      answer: userAnswers[q.id] || '',
    }));

    try {
      const res = await api.submitQuiz(activeQuiz.id, formattedAnswers, activeAttempt?.id);
      setQuizResult(res);
      confetti({ particleCount: 90, spread: 70 });
      // Refresh exams and quizzes list to reflect updated milestone and last score
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể nộp bài.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamFormError(null);

    if (!newExamTitle.trim()) {
      setExamFormError('Vui lòng nhập tên kỳ kiểm tra.');
      return;
    }
    if (!newExamSubjectId) {
      setExamFormError('Vui lòng chọn môn học.');
      return;
    }
    if (!newExamDate) {
      setExamFormError('Vui lòng chọn ngày kiểm tra.');
      return;
    }

    setIsSavingExam(true);
    try {
      const selectedSubj = subjects.find((s) => s.id === newExamSubjectId);
      const res = await api.addExam({
        title: newExamTitle.trim(),
        subjectId: newExamSubjectId,
        subjectName: selectedSubj?.name || 'Môn học',
        examAt: new Date(newExamDate).toISOString(),
        importance: newExamImportance,
        scopeText: newExamScope.trim() || 'Phạm vi kiểm tra chương học trọng tâm theo SGK.',
        topics: [{ name: selectedSubj?.name || 'Kiến thức trọng tâm', weight: 1 }],
      });

      setExams((prev) => [res.exam, ...prev]);
      setNewExamTitle('');
      setNewExamDate('');
      setNewExamScope('');
      setIsAddExamOpen(false);
      confetti({ particleCount: 70, spread: 50 });
    } catch (err: any) {
      setExamFormError(err.message || 'Không thể thêm kỳ kiểm tra.');
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#F3FAF5] flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-[#22C55E]" />
            <span>Trung Tâm Kiểm Tra & Ôn Tập AI</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-1">
            Lộ trình ôn thi 4 mốc thời gian D-14, D-7, D-3, D-1 với đề luyện tập tự động từ Jami
          </p>
        </div>

        <button
          onClick={() => setIsAddExamOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm kỳ kiểm tra mới</span>
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 bg-rose-900 text-white font-bold rounded-lg cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Active Quiz Runner View */}
      {activeQuiz && (
        <div className="bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.3)] shadow-2xl p-5 sm:p-8 space-y-6">
          {/* Quiz Header */}
          <div className="flex flex-wrap items-center justify-between pb-4 border-b border-[rgba(34,197,94,0.18)] gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                  {activeQuiz.milestone || 'Luyện Tập'}
                </span>
                <span className="text-xs text-[#A9B8AE] font-semibold">
                  {activeQuiz.questions?.length || 0} câu hỏi • Môn {activeQuiz.subjectName}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#F3FAF5] mt-1">{activeQuiz.title}</h2>
            </div>
            <button
              onClick={() => {
                setActiveQuiz(null);
                setQuizResult(null);
              }}
              className="text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] px-3 py-1.5 rounded-xl border border-[rgba(34,197,94,0.2)] hover:bg-[#101A13] transition-all cursor-pointer"
            >
              Thoát bài thi
            </button>
          </div>

          {!quizResult ? (
            /* Question List View */
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
                  {q.type !== 'short_answer' && q.options && Array.isArray(q.options) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-0 sm:pl-9">
                      {q.options.map((opt: any, optIdx: number) => {
                        const optText = typeof opt === 'string' ? opt : opt.text || opt.id;
                        const optKey = typeof opt === 'string' ? String(optIdx + 1) : opt.id || String(optIdx + 1);
                        const isSelected = userAnswers[q.id] === optText || userAnswers[q.id] === optKey;

                        return (
                          <button
                            key={optKey}
                            onClick={() => handleAnswerSelect(q.id, optKey)}
                            className={`text-left p-3 rounded-xl text-xs font-medium border transition-all flex items-center gap-2.5 cursor-pointer ${
                              isSelected
                                ? 'bg-[#14532D] border-[#22C55E] text-[#86EFAC] font-bold ring-2 ring-[#22C55E]/30'
                                : 'bg-[#050806] border-[rgba(34,197,94,0.2)] text-[#A9B8AE] hover:bg-[#101A13]'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                isSelected ? 'bg-[#22C55E] text-[#050806]' : 'bg-[#101A13] text-[#A9B8AE]'
                              }`}
                            >
                              {optKey}
                            </span>
                            <span className="truncate">{optText}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Short answer input */}
                  {q.type === 'short_answer' && (
                    <div className="pl-0 sm:pl-9">
                      <input
                        type="text"
                        placeholder="Nhập câu trả lời ngắn của bạn..."
                        value={userAnswers[q.id] || ''}
                        onChange={(e) => handleAnswerSelect(q.id, e.target.value)}
                        className="w-full text-xs p-3 bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-between pt-4 border-t border-[rgba(34,197,94,0.18)]">
                <span className="text-xs text-[#A9B8AE]">
                  Đã trả lời: {Object.keys(userAnswers).length} / {activeQuiz.questions?.length || 0} câu
                </span>
                <button
                  onClick={handleSubmitQuiz}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang chấm điểm...' : 'Nộp bài & Xem lời giải'}
                </button>
              </div>
            </div>
          ) : (
            /* Result & Detailed Explanations View */
            <div className="space-y-6">
              {/* Score Card */}
              <div className="p-6 rounded-2xl bg-[#14532D]/40 border border-[#22C55E]/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#22C55E] text-[#050806] flex items-center justify-center font-black text-xl shadow-lg">
                    <Award className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#F3FAF5]">
                      {quizResult.attempt.score} <span className="text-sm font-normal text-[#86EFAC]">/ 10 điểm</span>
                    </div>
                    <p className="text-xs text-[#A9B8AE] mt-0.5">{quizResult.attempt.feedbackSummary}</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setActiveQuiz(null);
                    setQuizResult(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#16A34A] text-[#050806] text-xs font-bold hover:bg-[#22C55E] transition-all cursor-pointer shrink-0"
                >
                  Hoàn tất bài ôn
                </button>
              </div>

              {/* Review Questions & Explanations */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-[#F3FAF5] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#22C55E]" />
                  <span>Chi tiết đáp án & Lời giải từ Jami AI</span>
                </h3>

                {quizResult.answersFeedback?.map((fb: any, idx: number) => {
                  const q = activeQuiz.questions?.find((quest) => quest.id === fb.questionId);
                  return (
                    <div
                      key={fb.questionId || idx}
                      className={`p-5 rounded-2xl border ${
                        fb.isCorrect
                          ? 'bg-[#101A13] border-[#22C55E]/30'
                          : 'bg-[#140808] border-rose-900/40'
                      } space-y-3`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                            fb.isCorrect ? 'bg-[#16A34A] text-[#050806]' : 'bg-rose-600 text-white'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className="text-xs sm:text-sm font-semibold text-[#F3FAF5] flex-1">
                          {q?.prompt || `Câu hỏi ${idx + 1}`}
                        </div>
                      </div>

                      <div className="pl-0 sm:pl-9 space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-[#A9B8AE]">Câu trả lời của em:</span>
                          <strong className={fb.isCorrect ? 'text-[#86EFAC]' : 'text-rose-400'}>
                            {fb.userAnswer || '(Bỏ trống)'}
                          </strong>
                        </div>
                        {!fb.isCorrect && (
                          <div className="flex items-center gap-2">
                            <span className="text-[#A9B8AE]">Đáp án chính xác:</span>
                            <strong className="text-[#86EFAC]">{fb.correctAnswer}</strong>
                          </div>
                        )}
                        {fb.explanation && (
                          <div className="p-3 mt-2 rounded-xl bg-[#050806] border border-[rgba(34,197,94,0.15)] text-[#A9B8AE] leading-relaxed">
                            <span className="font-bold text-[#86EFAC]">Lời giải: </span>
                            {fb.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Exam Countdown Cards & Practice Quizzes Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Exams Countdown Cards (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#22C55E]" />
            <span>Kỳ kiểm tra đang chuẩn bị</span>
          </h2>

          {isLoading ? (
            <div className="p-12 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2 bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)]">
              <RefreshCw className="w-4 h-4 animate-spin text-[#22C55E]" />
              <span>Đang tải danh sách kỳ thi và đề ôn tập...</span>
            </div>
          ) : exams.length > 0 ? (
            <div className="space-y-4">
              {exams.map((exam) => {
                const daysLeft = calculateDaysRemaining(exam.examAt);
                const examQuizzes = quizzes.filter((q) => q.examId === exam.id);

                return (
                  <div
                    key={exam.id}
                    className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4 hover:border-[#22C55E]/40 transition-all"
                  >
                    {/* Card Top */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                          {exam.subjectName}
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

                    {/* Milestones Tracker D-14, D-7, D-3, D-1 */}
                    <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)] space-y-3">
                      <div className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center justify-between">
                        <span>Lộ trình ôn tập 4 mốc thời gian:</span>
                        <span className="text-[11px] font-normal text-[#A9B8AE]">
                          Ngày thi: {new Date(exam.examAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {exam.milestones?.map((m) => {
                          const isGenerating =
                            generatingMilestone?.examId === exam.id &&
                            generatingMilestone?.milestone === m.milestoneType;

                          return (
                            <div
                              key={m.milestoneType}
                              onClick={() => {
                                const matchedQuiz = examQuizzes.find((q) => q.milestone === m.milestoneType);
                                if (matchedQuiz) {
                                  handleStartQuiz(matchedQuiz.id);
                                } else {
                                  handleGenerateExamQuiz(exam, m.milestoneType);
                                }
                              }}
                              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                                m.status === 'completed'
                                  ? 'bg-[#14532D]/30 border-[#22C55E]/40 text-[#86EFAC]'
                                  : m.status === 'current'
                                  ? 'bg-[#14532D] border-[#22C55E] text-[#86EFAC] ring-2 ring-[#22C55E]/30'
                                  : m.status === 'overdue'
                                  ? 'bg-rose-950/20 border-rose-800/40 text-rose-300'
                                  : 'bg-[#050806] border-[rgba(34,197,94,0.15)] text-[#A9B8AE] opacity-80 hover:opacity-100'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold">{m.milestoneType}</span>
                                {m.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />}
                              </div>
                              <div className="text-[10px] leading-tight truncate">
                                {m.milestoneType === 'D-14'
                                  ? 'Đề chẩn đoán'
                                  : m.milestoneType === 'D-7'
                                  ? 'Luyện đề tổng hợp'
                                  : m.milestoneType === 'D-3'
                                  ? 'Thi thử mô phỏng'
                                  : 'Rà soát lỗi sai'}
                              </div>
                              <div className="text-[9px] text-[#A9B8AE]">
                                {isGenerating ? (
                                  <span className="text-[#86EFAC] animate-pulse">Đang tạo đề...</span>
                                ) : (
                                  new Date(m.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between pt-2 gap-2">
                      <span className="text-xs text-[#A9B8AE]">
                        {examQuizzes.length > 0
                          ? `Đã tạo ${examQuizzes.length} đề ôn tập cho kỳ thi này`
                          : 'Chưa có đề luyện tập cho kỳ thi này'}
                      </span>

                      <div className="flex items-center gap-2">
                        {examQuizzes.length > 0 ? (
                          <button
                            onClick={() => handleStartQuiz(examQuizzes[0].id)}
                            disabled={isStartingQuiz}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-[#050806]" />
                            <span>Làm đề ôn tập ({examQuizzes[0].milestone || 'D-7'})</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleGenerateExamQuiz(exam, 'D-7')}
                            disabled={generatingMilestone?.examId === exam.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-bold shadow-md transition-all cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {generatingMilestone?.examId === exam.id
                                ? 'Đang biên soạn đề...'
                                : 'Tạo đề luyện tập với Jami'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] space-y-3">
              <Calendar className="w-10 h-10 text-[#22C55E] opacity-50 mx-auto" />
              <p className="font-bold text-[#F3FAF5]">Chưa có kỳ kiểm tra nào được lên lịch</p>
              <p className="text-[11px]">Bấm "Thêm kỳ kiểm tra mới" để Jami thiết lập lộ trình ôn 4 mốc thời gian cho em nhé.</p>
              <button
                onClick={() => setIsAddExamOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#16A34A] text-[#050806] text-xs font-bold rounded-xl cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm kỳ kiểm tra</span>
              </button>
            </div>
          )}
        </div>

        {/* Practice Quizzes Sidebar */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#22C55E]" />
            <span>Kho đề ôn luyện AI ({quizzes.length})</span>
          </h2>

          <div className="p-5 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.2)] shadow-xl space-y-3">
            {quizzes.length > 0 ? (
              quizzes.map((q) => (
                <div
                  key={q.id}
                  className="p-4 rounded-2xl border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40 transition-all space-y-2 bg-[#101A13]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-xs text-[#F3FAF5] truncate">{q.title}</div>
                    {q.lastScore !== undefined && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#14532D] text-[#86EFAC] shrink-0">
                        {q.lastScore}đ
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#A9B8AE]">
                    <span>
                      {q.questionCount || 5} Câu hỏi • Môn {q.subjectName || 'Toán'}
                    </span>
                    <button
                      onClick={() => handleStartQuiz(q.id)}
                      className="font-bold text-[#86EFAC] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Làm đề</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-[#A9B8AE] space-y-2">
                <Layers className="w-8 h-8 text-[#22C55E] opacity-50 mx-auto" />
                <p>Chưa có đề ôn luyện nào.</p>
                <p className="text-[11px]">Đề ôn tập sẽ tự động xuất hiện khi em tạo lộ trình kỳ kiểm tra hoặc tải tài liệu lên.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Exam Modal */}
      {isAddExamOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Plus className="w-4 h-4 text-[#22C55E]" />
                <span>Thêm kỳ kiểm tra mới</span>
              </div>
              <button
                onClick={() => {
                  setIsAddExamOpen(false);
                  setExamFormError(null);
                }}
                className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {examFormError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-rose-300 text-xs">
                {examFormError}
              </div>
            )}

            <form onSubmit={handleAddExam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Tên bài kiểm tra:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Kiểm tra 1 tiết Toán - Hàm số bậc nhất"
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  className="w-full text-xs p-3 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Môn học:</label>
                  <select
                    value={newExamSubjectId}
                    onChange={(e) => setNewExamSubjectId(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
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
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Mức độ quan trọng:</label>
                <select
                  value={newExamImportance}
                  onChange={(e) => setNewExamImportance(e.target.value as any)}
                  className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                >
                  <option value="medium">Bình thường (15 phút, thường xuyên)</option>
                  <option value="high">Quan trọng (1 tiết, giữa kỳ)</option>
                  <option value="critical">Rất quan trọng (Cuối kỳ, thi thử vào 10/THPT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Phạm vi ôn tập:</label>
                <textarea
                  rows={2}
                  placeholder="Ví dụ: Chương 1 Hàm số và Chương 2 Hình học không gian..."
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
                  className="px-5 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow cursor-pointer disabled:opacity-50"
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
