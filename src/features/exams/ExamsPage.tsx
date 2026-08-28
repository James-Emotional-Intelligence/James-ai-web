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
  Award,
  Calendar,
  Layers,
  RotateCcw,
  Target,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { Exam, Quiz, QuizAttempt, Subject, ExamMilestone } from '../../../shared/types';
import { MaterialFilePickerModal, SelectedFileResult } from '../../components/common/MaterialFilePickerModal';
import confetti from 'canvas-confetti';

export const ExamsPage: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Material Quiz Generator Modal
  const [isMaterialQuizModalOpen, setIsMaterialQuizModalOpen] = useState(false);
  const [isGeneratingMaterialQuiz, setIsGeneratingMaterialQuiz] = useState(false);

  // AI Custom Quiz Generator Modal (5.2)
  const [isAiQuizModalOpen, setIsAiQuizModalOpen] = useState(false);
  const [aiQuizSubjectId, setAiQuizSubjectId] = useState('');
  const [aiQuizTopics, setAiQuizTopics] = useState('');
  const [aiQuizQuestionCount, setAiQuizQuestionCount] = useState<number>(5);
  const [aiQuizDifficulty, setAiQuizDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [aiQuizFormat, setAiQuizFormat] = useState<'multiple_choice' | 'essay' | 'combined'>('multiple_choice');
  const [isGeneratingAiQuiz, setIsGeneratingAiQuiz] = useState(false);

  // Active Quiz State (5.2 & 5.3)
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<QuizAttempt | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<{ attempt: QuizAttempt; answersFeedback: any[] } | null>(null);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetaking, setIsRetaking] = useState(false);
  const [generatingMilestone, setGeneratingMilestone] = useState<{ examId: string; milestone: string } | null>(null);

  // Add Exam Form State (5.1)
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamSubjectId, setNewExamSubjectId] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [newExamScope, setNewExamScope] = useState('');
  const [newExamImportance, setNewExamImportance] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [newExamTargetScore, setNewExamTargetScore] = useState('8.5');
  const [newExamFormat, setNewExamFormat] = useState<'multiple_choice' | 'essay' | 'combined'>('combined');
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
      setExams(examData.exams || []);
      setSubjects(subjectData.subjects || []);
      setQuizzes(quizData.quizzes || []);

      if (subjectData.subjects?.length > 0 && !newExamSubjectId) {
        setNewExamSubjectId(subjectData.subjects[0].id);
        setAiQuizSubjectId(subjectData.subjects[0].id);
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

  const handleGenerateExamQuiz = async (exam: Exam, milestone: string) => {
    setGeneratingMilestone({ examId: exam.id, milestone });
    try {
      const res = await api.generateExamQuiz(exam.id, {
        milestone,
        questionCount: 5,
        difficulty: exam.importance === 'critical' ? 'hard' : 'medium',
      });
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
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể nộp bài.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetakeWrongQuestions = async () => {
    if (!activeQuiz || !quizResult) return;
    const wrongAnswers = (quizResult.answersFeedback || []).filter((fb) => !fb.isCorrect);
    const wrongQuestionIds = wrongAnswers.map((fb) => fb.questionId);

    if (wrongQuestionIds.length === 0) {
      alert('Tuyệt vời! Em đã làm đúng tất cả các câu hỏi.');
      return;
    }

    setIsRetaking(true);
    try {
      const res = await api.retakeWrongQuestions(activeQuiz.id, wrongQuestionIds);
      if (res.quiz?.id) {
        await handleStartQuiz(res.quiz.id);
      }
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề làm lại các câu sai.');
    } finally {
      setIsRetaking(false);
    }
  };

  const calculateDaysRemaining = (examAt: string) => {
    const diff = new Date(examAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const handleCreateQuizFromMaterial = async (res: SelectedFileResult) => {
    setIsGeneratingMaterialQuiz(true);
    try {
      if (res.materialId) {
        await api.generateQuizFromMaterial(res.materialId, {
          questionCount: 5,
          difficulty: 'medium',
          title: `Đề ôn tập: ${res.materialTitle || res.fileName}`,
        });
        confetti({ particleCount: 80, spread: 60 });
        await fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề ôn tập từ tài liệu này.');
    } finally {
      setIsGeneratingMaterialQuiz(false);
    }
  };

  const handleGenerateCustomAiQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingAiQuiz(true);
    try {
      const selectedSubj = subjects.find((s) => s.id === aiQuizSubjectId);
      const subjectName = selectedSubj?.name || 'Toán học';
      const topicsList = aiQuizTopics
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await api.generateSubjectQuiz({
        subjectId: aiQuizSubjectId,
        subjectName,
        topics: topicsList.length > 0 ? topicsList : [subjectName],
        difficulty: aiQuizDifficulty,
        questionCount: aiQuizQuestionCount,
        format: aiQuizFormat,
      });

      setIsAiQuizModalOpen(false);
      confetti({ particleCount: 80, spread: 60 });
      await fetchData();

      if (res.quiz?.id) {
        await handleStartQuiz(res.quiz.id);
      }
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề luyện tập AI.');
    } finally {
      setIsGeneratingAiQuiz(false);
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
      await api.addExam({
        title: newExamTitle.trim(),
        subjectId: newExamSubjectId,
        subjectName: selectedSubj?.name || 'Môn học',
        examAt: new Date(newExamDate).toISOString(),
        importance: newExamImportance,
        targetScore: parseFloat(newExamTargetScore) || 8.5,
        examFormat: newExamFormat,
        scopeText: newExamScope.trim() || 'Phạm vi kiểm tra chương học trọng tâm theo SGK.',
        topics: [{ name: selectedSubj?.name || 'Kiến thức trọng tâm', weight: 1 }],
      });

      setIsAddExamOpen(false);
      setNewExamTitle('');
      setNewExamDate('');
      setNewExamScope('');
      setNewExamTargetScore('8.5');
      confetti({ particleCount: 70, spread: 50 });
      await fetchData();
    } catch (err: any) {
      setExamFormError(err.message || 'Không thể tạo kỳ kiểm tra.');
    } finally {
      setIsSavingExam(false);
    }
  };

  const wrongFeedbacks = quizResult?.answersFeedback?.filter((fb) => !fb.isCorrect) || [];
  const correctCount = (quizResult?.answersFeedback?.length || 0) - wrongFeedbacks.length;

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center border border-[#22C55E]/30 shadow-md">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#F3FAF5]">Kiểm Tra & Ôn Tập AI</h1>
            <p className="text-xs text-[#A9B8AE]">
              Quản lý lịch thi, lộ trình ôn tập khoa học và tự động tạo đề luyện thi thông minh.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsMaterialQuizModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142318] text-[#86EFAC] text-xs font-bold border border-[rgba(34,197,94,0.25)] transition-all cursor-pointer"
            title="Tạo đề từ file bài giảng, SGK hoặc đề thi PDF có sẵn"
          >
            <FileText className="w-4 h-4 text-[#22C55E]" />
            <span>Tạo đề từ tài liệu</span>
          </button>

          <button
            onClick={() => setIsAiQuizModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#14532D] hover:bg-[#16A34A] hover:text-[#050806] text-[#86EFAC] text-xs font-black border border-[#22C55E]/40 shadow-md transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Tạo đề luyện tập AI</span>
          </button>

          <button
            onClick={() => setIsAddExamOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm kỳ kiểm tra</span>
          </button>
        </div>
      </div>

      {activeQuiz && (
        <div className="bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.3)] shadow-2xl p-5 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between pb-4 border-b border-[rgba(34,197,94,0.18)] gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                  {activeQuiz.milestone || 'Luyện Tập'}
                </span>
                <span className="text-xs text-[#A9B8AE] font-semibold">
                  {activeQuiz.questions?.length || 0} câu hỏi • Môn {activeQuiz.subjectName} • Mức độ {activeQuiz.difficulty?.toUpperCase()}
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

                  {q.type !== 'short_answer' && q.options && Array.isArray(q.options) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-0 sm:pl-9">
                      {q.options.map((opt: any, optIdx: number) => {
                        const optText = typeof opt === 'string' ? opt : opt.text || opt.id;
                        const optKey = typeof opt === 'string' ? String(optIdx + 1) : opt.id || String(optIdx + 1);
                        const isSelected = userAnswers[q.id] === optText || userAnswers[q.id] === optKey;

                        return (
                          <button
                            key={optKey}
                            type="button"
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

                  {q.type === 'short_answer' && (
                    <div className="pl-0 sm:pl-9">
                      <input
                        type="text"
                        placeholder="Nhập câu trả lời ngắn / tự luận của em..."
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
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-[#14532D]/40 border border-[#22C55E]/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#22C55E] text-[#050806] flex items-center justify-center font-black text-xl shadow-lg">
                    <Award className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#F3FAF5]">
                      {quizResult.attempt.score} <span className="text-sm font-normal text-[#86EFAC]">/ 10 điểm</span>
                      <span className="text-xs font-bold text-[#A9B8AE] ml-2">
                        ({correctCount} / {activeQuiz.questions?.length || 0} câu đúng)
                      </span>
                    </div>
                    <p className="text-xs text-[#A9B8AE] mt-0.5">{quizResult.attempt.feedbackSummary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {wrongFeedbacks.length > 0 && (
                    <button
                      onClick={handleRetakeWrongQuestions}
                      disabled={isRetaking}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#050806] text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-50"
                      title="Tạo đề luyện tập chỉ chứa các câu làm sai để củng cố ngay"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{isRetaking ? 'Đang tạo...' : `Làm lại ${wrongFeedbacks.length} câu sai`}</span>
                    </button>
                  )}

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
              </div>

              {wrongFeedbacks.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/40 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Kiến thức cần củng cố & Đề xuất bài học:</span>
                  </div>
                  <p className="text-xs text-[#A9B8AE]">
                    Em đang gặp khó khăn ở các chủ đề: <strong className="text-[#F3FAF5]">{wrongFeedbacks.map((f, i) => f.topicRef || `Câu ${i + 1}`).join(', ')}</strong>. Hãy bấm nút <strong>"Làm lại câu sai"</strong> ở trên hoặc nhờ <strong>Trợ lý Jami</strong> giải thích lại dạng bài này nhé!
                  </p>
                </div>
              )}

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#22C55E]" />
            <span>Kỳ kiểm tra đang chuẩn bị</span>
          </h2>

          {isLoading ? (
            <div className="p-12 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2 bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)]">
              <div className="w-4 h-4 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
              <span>Đang tải...</span>
            </div>
          ) : exams.length > 0 ? (
            <div className="space-y-4">
              {exams.map((exam) => {
                const daysLeft = calculateDaysRemaining(exam.examAt);
                const isVerySoon = daysLeft <= 3;
                const examQuizzes = quizzes.filter((q) => q.examId === exam.id);

                return (
                  <div
                    key={exam.id}
                    className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4 hover:border-[#22C55E]/40 transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                          {exam.subjectName}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#101A13] text-[#A9B8AE] border border-[rgba(34,197,94,0.2)]">
                          Hình thức: {exam.examFormat === 'essay' ? 'Tự luận' : exam.examFormat === 'multiple_choice' ? 'Trắc nghiệm' : 'Kết hợp'}
                        </span>
                        {exam.targetScore && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-950/50 text-amber-300 border border-amber-800/40 flex items-center gap-1">
                            <Target className="w-3 h-3 text-amber-400" />
                            <span>Mục tiêu: {exam.targetScore}đ</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 ${
                            isVerySoon
                              ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                              : 'bg-[#101A13] text-[#86EFAC] border border-[rgba(34,197,94,0.25)]'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>{daysLeft === 0 ? 'Hôm nay thi!' : `Còn ${daysLeft} ngày`}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-[#F3FAF5]">{exam.title}</h3>
                      <p className="text-xs text-[#A9B8AE] mt-1 line-clamp-2">{exam.scopeText}</p>
                      <div className="text-[11px] text-[#A9B8AE]/80 mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#22C55E]" />
                        <span>Ngày thi: {new Date(exam.examAt).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[rgba(34,197,94,0.15)] space-y-2">
                      <div className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                        <span>Kế hoạch ôn tập theo mốc thời gian:</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(exam.milestones || []).map((m: ExamMilestone) => {
                          const isDone = m.status === 'completed';
                          const isCurrent = m.status === 'current';
                          const isGenThis =
                            generatingMilestone?.examId === exam.id &&
                            generatingMilestone?.milestone === m.milestoneType;

                          return (
                            <button
                              key={m.milestoneType}
                              onClick={() => handleGenerateExamQuiz(exam, m.milestoneType)}
                              disabled={isGenThis}
                              className={`p-3 rounded-2xl border text-left flex flex-col justify-between space-y-2 transition-all cursor-pointer ${
                                isDone
                                  ? 'bg-[#14532D]/40 border-[#22C55E] text-[#86EFAC]'
                                  : isCurrent
                                  ? 'bg-[#101A13] border-[#22C55E] text-[#F3FAF5] ring-2 ring-[#22C55E]/30'
                                  : 'bg-[#050806] border-[rgba(34,197,94,0.15)] text-[#A9B8AE] hover:bg-[#101A13]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold text-xs">{m.milestoneType}</span>
                                {isDone ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 text-[#A9B8AE]" />
                                )}
                              </div>
                              <div className="text-[10px] font-semibold truncate leading-tight">
                                {isGenThis ? 'Đang tạo đề...' : m.name.split(':')[1] || m.name}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] space-y-3">
              <GraduationCap className="w-10 h-10 text-[#22C55E] opacity-60 mx-auto" />
              <h3 className="text-sm font-bold text-[#F3FAF5]">Chưa có kỳ kiểm tra nào</h3>
              <p className="text-xs text-[#A9B8AE] max-w-sm mx-auto">
                Hãy thêm bài kiểm tra 1 tiết, giữa kỳ hoặc thi học kỳ để Jami tự động lập lộ trình ôn tập khoa học.
              </p>
              <button
                onClick={() => setIsAddExamOpen(true)}
                className="px-4 py-2 bg-[#16A34A] text-[#050806] rounded-xl text-xs font-bold hover:bg-[#22C55E] cursor-pointer"
              >
                Thêm kỳ kiểm tra đầu tiên
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#22C55E]" />
            <span>Đề ôn tập & Lịch sử ({quizzes.length})</span>
          </h2>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {quizzes.length > 0 ? (
              quizzes.map((q) => (
                <div
                  key={q.id}
                  className="p-4 rounded-2xl border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40 transition-all space-y-2 bg-[#0B120D]"
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
                      {q.questionCount || 5} câu • Môn {q.subjectName || 'Toán'}
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
              <div className="p-6 text-center text-xs text-[#A9B8AE] space-y-2 bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.18)]">
                <Layers className="w-8 h-8 text-[#22C55E] opacity-50 mx-auto" />
                <p>Chưa có đề ôn luyện nào.</p>
                <p className="text-[11px]">Bấm "Tạo đề luyện tập AI" để sinh đề mới ngay!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isAiQuizModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Sparkles className="w-4 h-4 text-[#22C55E]" />
                <span>Tạo Đề Luyện Tập AI Thông Minh</span>
              </div>
              <button
                onClick={() => setIsAiQuizModalOpen(false)}
                className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateCustomAiQuiz} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Môn học:</label>
                <select
                  value={aiQuizSubjectId}
                  onChange={(e) => setAiQuizSubjectId(e.target.value)}
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
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">
                  Chủ đề / Bài học (cách nhau bởi dấu phẩy):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Hàm số bậc nhất, Định lý Pytago, Tam giác đồng dạng..."
                  value={aiQuizTopics}
                  onChange={(e) => setAiQuizTopics(e.target.value)}
                  className="w-full text-xs p-3 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Số lượng câu hỏi:</label>
                  <select
                    value={aiQuizQuestionCount}
                    onChange={(e) => setAiQuizQuestionCount(parseInt(e.target.value))}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                  >
                    <option value={5}>5 câu (Ôn nhanh 10p)</option>
                    <option value={10}>10 câu (Luyện đề 20p)</option>
                    <option value={15}>15 câu (Đề 30p)</option>
                    <option value={20}>20 câu (Thi thử 45p)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Mức độ:</label>
                  <select
                    value={aiQuizDifficulty}
                    onChange={(e) => setAiQuizDifficulty(e.target.value as any)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="easy">Dễ (Nhận biết / Thông hiểu)</option>
                    <option value="medium">Trung bình (Vận dụng)</option>
                    <option value="hard">Khó (Vận dụng cao)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Hình thức câu hỏi:</label>
                <select
                  value={aiQuizFormat}
                  onChange={(e) => setAiQuizFormat(e.target.value as any)}
                  className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                >
                  <option value="multiple_choice">Trắc nghiệm 4 lựa chọn (A, B, C, D)</option>
                  <option value="essay">Tự luận / Điền câu trả lời ngắn</option>
                  <option value="combined">Kết hợp Trắc nghiệm & Tự luận</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAiQuizModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingAiQuiz}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isGeneratingAiQuiz ? 'Jami đang tạo đề...' : 'Tạo đề & Bắt đầu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Hình thức kiểm tra:</label>
                  <select
                    value={newExamFormat}
                    onChange={(e) => setNewExamFormat(e.target.value as any)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="combined">Kết hợp (Trắc nghiệm + Tự luận)</option>
                    <option value="multiple_choice">Trắc nghiệm 100%</option>
                    <option value="essay">Tự luận 100%</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Mục tiêu điểm số:</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="10"
                    value={newExamTargetScore}
                    onChange={(e) => setNewExamTargetScore(e.target.value)}
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
                  <option value="medium">Bình thường (15 phút, kiểm tra miệng)</option>
                  <option value="high">Quan trọng (1 tiết, kiểm tra giữa kỳ)</option>
                  <option value="critical">Rất quan trọng (Cuối kỳ, thi thử vào 10/THPT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Phạm vi kiến thức ôn tập:</label>
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

      <MaterialFilePickerModal
        isOpen={isMaterialQuizModalOpen}
        onClose={() => setIsMaterialQuizModalOpen(false)}
        title="Tạo Đề Ôn Tập Từ Tài Liệu / Đề Thi"
        description="Chọn đề thi/tài liệu có sẵn trong Kho hoặc tải file mới từ máy tính (kèm lưu vào kho)"
        onFileSelected={handleCreateQuizFromMaterial}
      />
    </div>
  );
};
