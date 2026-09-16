import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookX,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Flame,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
  Calendar,
  Layers,
  ArrowRight,
  Lightbulb,
  Eye,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { MistakeNotebookEntry, Subject, MistakeReason, MistakeDifficulty, MistakeStatus } from '../../../shared/types';
import { RobotJami } from '../../components/jami/RobotJami';
import { PrintPdfButton } from '../../components/common/PrintPdfButton';
import { exportMistakeNotebookToPdf } from '../../lib/pdf-export-service';

const REASON_LABELS: Record<MistakeReason, { label: string; color: string }> = {
  knowledge_gap: { label: 'Chưa nhớ kiến thức', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  misread_question: { label: 'Hiểu sai đề', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  calculation_error: { label: 'Tính toán nhầm', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  wrong_choice: { label: 'Chọn nhầm đáp án', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  time_pressure: { label: 'Không đủ thời gian', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  not_learned_yet: { label: 'Chưa học nội dung', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
  other: { label: 'Nguyên nhân khác', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
};

const STATUS_LABELS: Record<MistakeStatus, { label: string; color: string }> = {
  new: { label: 'Chưa ôn', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  reviewing: { label: 'Đang ôn', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  needs_retry: { label: 'Cần ôn lại', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  mastered: { label: 'Đã hiểu', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
};

const DIFFICULTY_LABELS: Record<MistakeDifficulty, { label: string; color: string }> = {
  easy: { label: 'Dễ', color: 'text-emerald-400' },
  medium: { label: 'Vừa', color: 'text-amber-400' },
  hard: { label: 'Khó', color: 'text-rose-400' },
};

export const MistakeNotebookPage: React.FC = () => {
  const [mistakes, setMistakes] = useState<MistakeNotebookEntry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [dueOnly, setDueOnly] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMistake, setEditingMistake] = useState<MistakeNotebookEntry | null>(null);
  const [reviewingMistake, setReviewingMistake] = useState<MistakeNotebookEntry | null>(null);
  const [reviewAnswer, setReviewAnswer] = useState('');
  const [reviewResult, setReviewResult] = useState<{ isCorrect: boolean; entry: MistakeNotebookEntry } | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // AI Modal
  const [aiSimilarModal, setAiSimilarModal] = useState<{
    mistake: MistakeNotebookEntry;
    data: { questionText: string; options?: string[]; correctAnswer: string; explanation: string; difficulty: string } | null;
    userAns?: string;
    showExplanation?: boolean;
    loading: boolean;
  } | null>(null);

  const [aiExplainModal, setAiExplainModal] = useState<{
    mistake: MistakeNotebookEntry;
    explanation: string;
    tips: string[];
    loading: boolean;
  } | null>(null);

  // Add/Edit Form State
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formTopic, setFormTopic] = useState('');
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formSelectedAnswer, setFormSelectedAnswer] = useState('');
  const [formCorrectAnswer, setFormCorrectAnswer] = useState('');
  const [formMistakeReason, setFormMistakeReason] = useState<MistakeReason>('knowledge_gap');
  const [formDifficulty, setFormDifficulty] = useState<MistakeDifficulty>('medium');
  const [formExplanation, setFormExplanation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedMistakes, setExpandedMistakes] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [mistakesRes, subjectsRes] = await Promise.all([
        api.getMistakes({
          subjectId: selectedSubject !== 'all' ? selectedSubject : undefined,
          status: selectedStatus !== 'all' ? selectedStatus : undefined,
          difficulty: selectedDifficulty !== 'all' ? selectedDifficulty : undefined,
          dueOnly: dueOnly || undefined,
          search: searchTerm.trim() || undefined,
        }),
        api.getSubjects(),
      ]);

      setMistakes(mistakesRes.mistakes || []);
      setSubjects(subjectsRes.subjects || []);
    } catch (err) {
      console.error('Failed to load mistakes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubject, selectedStatus, selectedDifficulty, dueOnly, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Statistics
  const stats = useMemo(() => {
    const total = mistakes.length;
    const now = new Date().toISOString();
    const dueCount = mistakes.filter((m) => m.nextReviewAt <= now && m.status !== 'mastered').length;
    const unmasteredCount = mistakes.filter((m) => m.status !== 'mastered').length;
    const masteredCount = mistakes.filter((m) => m.status === 'mastered').length;
    return { total, dueCount, unmasteredCount, masteredCount };
  }, [mistakes]);

  const toggleExpand = (id: string) => {
    setExpandedMistakes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAdd = () => {
    setEditingMistake(null);
    setFormSubjectId(subjects[0]?.id || '');
    setFormTopic('');
    setFormQuestionText('');
    setFormSelectedAnswer('');
    setFormCorrectAnswer('');
    setFormMistakeReason('knowledge_gap');
    setFormDifficulty('medium');
    setFormExplanation('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (m: MistakeNotebookEntry) => {
    setEditingMistake(m);
    setFormSubjectId(m.subjectId || '');
    setFormTopic(m.topic);
    setFormQuestionText(m.questionText);
    setFormSelectedAnswer(m.selectedAnswer || '');
    setFormCorrectAnswer(m.correctAnswer);
    setFormMistakeReason(m.mistakeReason);
    setFormDifficulty(m.difficulty);
    setFormExplanation(m.correctExplanation || '');
    setIsAddModalOpen(true);
  };

  const handleSaveMistake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTopic.trim() || !formQuestionText.trim() || !formCorrectAnswer.trim()) return;

    try {
      setIsSaving(true);
      if (editingMistake) {
        await api.updateMistake(editingMistake.id, {
          subjectId: formSubjectId || undefined,
          topic: formTopic.trim(),
          questionText: formQuestionText.trim(),
          selectedAnswer: formSelectedAnswer.trim() || undefined,
          correctAnswer: formCorrectAnswer.trim(),
          mistakeReason: formMistakeReason,
          difficulty: formDifficulty,
          correctExplanation: formExplanation.trim() || undefined,
        });
      } else {
        await api.createMistake({
          subjectId: formSubjectId || undefined,
          topic: formTopic.trim(),
          questionText: formQuestionText.trim(),
          selectedAnswer: formSelectedAnswer.trim() || undefined,
          correctAnswer: formCorrectAnswer.trim(),
          mistakeReason: formMistakeReason,
          difficulty: formDifficulty,
          correctExplanation: formExplanation.trim() || undefined,
          sourceType: 'manual',
        });
      }
      setIsAddModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Không thể lưu câu lỗi sai.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMistake = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa câu lỗi sai này khỏi Sổ tay?')) return;
    try {
      await api.deleteMistake(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete mistake:', err);
    }
  };

  // Review Flow
  const handleOpenReview = (m: MistakeNotebookEntry) => {
    setReviewingMistake(m);
    setReviewAnswer('');
    setReviewResult(null);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingMistake || !reviewAnswer.trim()) return;

    try {
      setIsSubmittingReview(true);
      const res = await api.reviewMistake(reviewingMistake.id, reviewAnswer.trim());
      setReviewResult({ isCorrect: res.isCorrect, entry: res.entry });
      await loadData();
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // AI Similar Question Flow
  const handleGenerateSimilar = async (m: MistakeNotebookEntry) => {
    setAiSimilarModal({ mistake: m, data: null, userAns: '', showExplanation: false, loading: true });
    try {
      const res = await api.getSimilarMistakeQuestion(m.id);
      setAiSimilarModal({
        mistake: m,
        data: res.similarQuestion,
        userAns: '',
        showExplanation: false,
        loading: false,
      });
    } catch (err) {
      console.error('Failed to generate similar question:', err);
      setAiSimilarModal(null);
    }
  };

  // AI Explain Flow
  const handleAskJami = async (m: MistakeNotebookEntry) => {
    setAiExplainModal({ mistake: m, explanation: '', tips: [], loading: true });
    try {
      const res = await api.explainMistake(m.id);
      setAiExplainModal({
        mistake: m,
        explanation: res.explanation,
        tips: res.tips || [],
        loading: false,
      });
    } catch (err) {
      console.error('Failed to get Jami explanation:', err);
      setAiExplainModal(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#060D09] text-white p-4 md:p-8 space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/70 via-[#0A2617]/80 to-[#061B10]/90 border border-emerald-500/20 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide">
              <BookX className="w-3.5 h-3.5" />
              SỔ LỖI SAI CÁ NHÂN & ÔN TẬP LẶP LẠI
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Biến Lỗi Sai Thành <span className="text-emerald-400">Điểm Mạnh</span>
            </h1>
            <p className="text-sm text-zinc-400 max-w-xl">
              Hệ thống lưu trữ các câu hỏi từng làm sai và tự động xếp lịch ôn ngắt quãng theo quy luật{' '}
              <span className="text-emerald-400 font-medium">1 – 3 – 7 – 14 – 30 ngày</span> để củng cố kiến thức vững chắc.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PrintPdfButton
              onExport={async () => {
                await exportMistakeNotebookToPdf(mistakes);
              }}
              label="In sổ tay lỗi sai (PDF)"
              variant="outline"
              size="md"
            />
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              Thêm câu sai thủ công
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-emerald-500/15">
          <div className="bg-[#0B1E13]/70 border border-emerald-500/20 rounded-xl p-3.5">
            <div className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Tổng câu sai đã lưu
            </div>
            <div className="text-2xl font-black text-white mt-1">{stats.total}</div>
          </div>

          <div className="bg-[#0B1E13]/70 border border-rose-500/30 rounded-xl p-3.5">
            <div className="text-xs text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              Đến hạn ôn hôm nay
            </div>
            <div className="text-2xl font-black text-rose-400 mt-1">{stats.dueCount}</div>
          </div>

          <div className="bg-[#0B1E13]/70 border border-cyan-500/20 rounded-xl p-3.5">
            <div className="text-xs text-cyan-300 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-cyan-400" />
              Đang trong chu kỳ ôn
            </div>
            <div className="text-2xl font-black text-cyan-400 mt-1">{stats.unmasteredCount}</div>
          </div>

          <div className="bg-[#0B1E13]/70 border border-emerald-500/30 rounded-xl p-3.5">
            <div className="text-xs text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Đã hiểu bài vững
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{stats.masteredCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0A1810]/80 border border-emerald-500/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm kiếm câu hỏi, chủ đề..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Subject Filter */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tất cả môn học</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="new">Chưa ôn</option>
            <option value="reviewing">Đang ôn</option>
            <option value="needs_retry">Cần ôn lại</option>
            <option value="mastered">Đã hiểu</option>
          </select>

          {/* Difficulty Filter */}
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tất cả độ khó</option>
            <option value="easy">Dễ</option>
            <option value="medium">Vừa</option>
            <option value="hard">Khó</option>
          </select>

          {/* Due Only Toggle */}
          <button
            onClick={() => setDueOnly(!dueOnly)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
              dueOnly
                ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                : 'bg-[#060D09] border-emerald-500/20 text-zinc-400 hover:text-white'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Đến hạn hôm nay
          </button>
        </div>
      </div>

      {/* Mistake Items List */}
      {isLoading ? (
        <div className="p-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
          <span className="text-sm">Đang tải danh sách câu sai...</span>
        </div>
      ) : mistakes.length === 0 ? (
        <div className="bg-[#0A1810]/60 border border-emerald-500/15 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Chưa có câu sai nào trong mục này</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Khi làm bài kiểm tra hoặc giải đề luyện tập, bạn có thể lưu lại các câu chưa chính xác để Jami giúp bạn ôn tập định kỳ.
          </p>
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs mt-2"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mistakes.map((m) => {
            const isDue = new Date(m.nextReviewAt) <= new Date() && m.status !== 'mastered';
            const isExpanded = !!expandedMistakes[m.id];
            const reasonCfg = REASON_LABELS[m.mistakeReason] || REASON_LABELS.other;
            const statusCfg = STATUS_LABELS[m.status] || STATUS_LABELS.new;
            const diffCfg = DIFFICULTY_LABELS[m.difficulty] || DIFFICULTY_LABELS.medium;

            return (
              <div
                key={m.id}
                className={`bg-[#0A1810]/90 border rounded-2xl p-5 space-y-4 transition hover:border-emerald-500/40 relative flex flex-col justify-between ${
                  isDue ? 'border-rose-500/40 shadow-lg shadow-rose-950/20' : 'border-emerald-500/20'
                }`}
              >
                <div className="space-y-3">
                  {/* Tags */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {m.subjectName && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                          {m.subjectName}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-[#050D08] text-zinc-300 border border-emerald-500/20 text-[11px]">
                        {m.topic}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${reasonCfg.color}`}>
                        {reasonCfg.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className={`text-[11px] font-bold ${diffCfg.color}`}>
                        {diffCfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="text-sm font-medium text-zinc-200 leading-relaxed">
                    {m.questionText}
                  </div>

                  {/* Answers summary */}
                  <div className="bg-[#050D08] border border-emerald-500/10 rounded-xl p-3 text-xs space-y-1.5">
                    {m.selectedAnswer && (
                      <div className="text-rose-400 flex items-start gap-1.5">
                        <span className="font-semibold text-zinc-400">Đáp án đã chọn:</span>
                        <span>{m.selectedAnswer}</span>
                      </div>
                    )}

                    {isExpanded ? (
                      <>
                        <div className="text-emerald-400 flex items-start gap-1.5">
                          <span className="font-semibold text-zinc-400">Đáp án đúng:</span>
                          <span className="font-bold">{m.correctAnswer}</span>
                        </div>
                        {m.correctExplanation && (
                          <div className="pt-2 border-t border-emerald-500/10 text-zinc-300">
                            <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                              <Lightbulb className="w-3.5 h-3.5" /> Giải thích chi tiết:
                            </div>
                            <p className="whitespace-pre-line text-zinc-400">{m.correctExplanation}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleExpand(m.id)}
                        className="text-[11px] text-emerald-400/80 hover:text-emerald-300 font-semibold underline flex items-center gap-1 cursor-pointer pt-0.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Xem đáp án đúng & lời giải
                      </button>
                    )}
                  </div>

                  {/* Spaced Repetition Info */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                        <Flame className="w-3.5 h-3.5" /> Chuỗi đúng: {m.correctStreak}/5
                      </span>
                      <span>• Đã ôn: {m.reviewCount} lần</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Ôn tiếp theo: {new Date(m.nextReviewAt).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-emerald-500/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenReview(m)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow ${
                        isDue
                          ? 'bg-rose-500 text-white hover:bg-rose-400'
                          : 'bg-emerald-500 text-black hover:bg-emerald-400'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ôn ngay
                    </button>

                    <button
                      onClick={() => handleAskJami(m)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Hỏi Jami
                    </button>

                    <button
                      onClick={() => handleGenerateSimilar(m)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                      Câu tương tự
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {m.correctExplanation && (
                      <button
                        onClick={() => toggleExpand(m.id)}
                        className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                        title={isExpanded ? 'Thu gọn lời giải' : 'Xem lời giải'}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEdit(m)}
                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                      title="Chỉnh sửa"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMistake(m.id)}
                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-950 text-rose-400 text-xs transition"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add / Edit Mistake */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0A1810] border border-emerald-500/30 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BookX className="w-5 h-5 text-emerald-400" />
                {editingMistake ? 'Chỉnh sửa lỗi sai' : 'Thêm câu lỗi sai mới'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMistake} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Môn học</label>
                  <select
                    value={formSubjectId}
                    onChange={(e) => setFormSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">(Không chọn môn)</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Chủ đề / Chương *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Định lý Pytago, Phân số..."
                    value={formTopic}
                    onChange={(e) => setFormTopic(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Nội dung câu hỏi / Đề bài *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Nhập nội dung đề bài câu hỏi..."
                  value={formQuestionText}
                  onChange={(e) => setFormQuestionText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Đáp án đã chọn sai (nếu có)</label>
                  <input
                    type="text"
                    placeholder="VD: A. 25 cm"
                    value={formSelectedAnswer}
                    onChange={(e) => setFormSelectedAnswer(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Đáp án đúng chính xác *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: C. 20 cm"
                    value={formCorrectAnswer}
                    onChange={(e) => setFormCorrectAnswer(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Nguyên nhân sai</label>
                  <select
                    value={formMistakeReason}
                    onChange={(e) => setFormMistakeReason(e.target.value as MistakeReason)}
                    className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="knowledge_gap">Chưa nhớ kiến thức</option>
                    <option value="misread_question">Hiểu sai đề</option>
                    <option value="calculation_error">Tính toán nhầm</option>
                    <option value="wrong_choice">Chọn nhầm đáp án</option>
                    <option value="time_pressure">Không đủ thời gian</option>
                    <option value="not_learned_yet">Chưa học nội dung</option>
                    <option value="other">Nguyên nhân khác</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Mức độ khó</label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value as MistakeDifficulty)}
                    className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="easy">Dễ</option>
                    <option value="medium">Vừa</option>
                    <option value="hard">Khó</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Lời giải chi tiết / Ghi chú</label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú cách giải chuẩn hoặc các bước cần nhớ..."
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060D09] border border-emerald-500/20 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-emerald-500/15">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold flex items-center gap-2"
                >
                  {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {editingMistake ? 'Cập nhật' : 'Lưu vào sổ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Practice Review Modal (Ôn Ngay) */}
      {reviewingMistake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0A1810] border border-emerald-500/30 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Ôn tập lặp lại ngắt quãng</h3>
                  <p className="text-xs text-zinc-400">{reviewingMistake.topic}</p>
                </div>
              </div>
              <button
                onClick={() => setReviewingMistake(null)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#060D09] border border-emerald-500/20 rounded-xl p-4 text-sm text-zinc-200 leading-relaxed">
              <div className="font-semibold text-emerald-400 text-xs mb-1.5">CÂU HỎI:</div>
              {reviewingMistake.questionText}
            </div>

            {!reviewResult ? (
              <form onSubmit={handleSubmitReview} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Nhập câu trả lời hoặc đáp án của bạn:
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="VD: C, 20 cm, x = 5..."
                    value={reviewAnswer}
                    onChange={(e) => setReviewAnswer(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#060D09] border border-emerald-500/30 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setReviewingMistake(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReview || !reviewAnswer.trim()}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-2"
                  >
                    {isSubmittingReview ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Kiểm tra đáp án
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div
                  className={`rounded-xl p-4 border text-sm flex items-start gap-3 ${
                    reviewResult.isCorrect
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {reviewResult.isCorrect ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {reviewResult.isCorrect ? 'Chính xác! Làm rất tốt.' : 'Chưa chính xác!'}
                    </div>
                    <p className="text-xs mt-1 text-zinc-300">
                      Đáp án đúng: <span className="font-bold text-white">{reviewingMistake.correctAnswer}</span>
                    </p>
                    <p className="text-xs mt-1 text-zinc-400">
                      {reviewResult.isCorrect
                        ? `Chuỗi trả lời đúng tăng lên ${reviewResult.entry.correctStreak} lần. Lần ôn tiếp theo: ${new Date(
                            reviewResult.entry.nextReviewAt
                          ).toLocaleDateString('vi-VN')}.`
                        : 'Chuỗi đúng đặt lại về 0. Jami sẽ xếp lịch ôn lại câu này sau 1 ngày.'}
                    </p>
                  </div>
                </div>

                {reviewingMistake.correctExplanation && (
                  <div className="bg-[#060D09] border border-emerald-500/15 rounded-xl p-3.5 text-xs text-zinc-300">
                    <div className="font-semibold text-emerald-400 mb-1">Giải thích chi tiết:</div>
                    <p className="whitespace-pre-line text-zinc-400">{reviewingMistake.correctExplanation}</p>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setReviewingMistake(null)}
                    className="px-5 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold"
                  >
                    Hoàn tất ôn tập
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: AI Similar Question */}
      {aiSimilarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0A1810] border border-cyan-500/30 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-cyan-500/15">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Câu hỏi tương tự (AI Sinh đề)
              </h3>
              <button onClick={() => setAiSimilarModal(null)} className="text-zinc-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            {aiSimilarModal.loading ? (
              <div className="p-8 text-center text-zinc-400 space-y-2">
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                <p className="text-xs">Jami đang soạn câu hỏi tương tự cùng độ khó...</p>
              </div>
            ) : aiSimilarModal.data ? (
              <div className="space-y-4 text-sm">
                <div className="bg-[#060D09] border border-cyan-500/20 rounded-xl p-4 text-zinc-200">
                  <div className="text-xs text-cyan-400 font-semibold mb-1">ĐỀ BÀI:</div>
                  {aiSimilarModal.data.questionText}

                  {aiSimilarModal.data.options && aiSimilarModal.data.options.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {aiSimilarModal.data.options.map((opt, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300 block">Nhập hoặc chọn đáp án của em:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ví dụ: A, B, C hoặc kết quả tính toán..."
                      value={aiSimilarModal.userAns}
                      onChange={(e) =>
                        setAiSimilarModal((prev) => (prev ? { ...prev, userAns: e.target.value } : null))
                      }
                      className="flex-1 px-3 py-2 rounded-xl bg-[#060D09] border border-cyan-500/20 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAiSimilarModal((prev) => (prev ? { ...prev, showExplanation: true } : null))
                      }
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Kiểm tra đáp án
                    </button>
                  </div>
                </div>

                {aiSimilarModal.showExplanation && (
                  <div className="space-y-3 bg-[#060D09] border border-emerald-500/20 rounded-xl p-4 text-xs mt-3">
                    {aiSimilarModal.userAns && (
                      <div className="text-zinc-300">
                        <span className="text-zinc-400">Câu trả lời của em: </span>
                        <strong className="text-cyan-300">{aiSimilarModal.userAns}</strong>
                      </div>
                    )}
                    <div className="text-emerald-400 font-bold">
                      Đáp án đúng: <span className="text-white">{aiSimilarModal.data.correctAnswer}</span>
                    </div>
                    <div className="text-zinc-300">
                      <span className="font-semibold text-emerald-400">Lời giải chi tiết: </span>
                      {aiSimilarModal.data.explanation}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal: AI Explanation (Hỏi Jami) */}
      {aiExplainModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0A1810] border border-emerald-500/30 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/15">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <RobotJami size="sm" state="thinking" />
                Jami giải thích lỗi sai
              </h3>
              <button onClick={() => setAiExplainModal(null)} className="text-zinc-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            {aiExplainModal.loading ? (
              <div className="p-8 text-center text-zinc-400 space-y-2">
                <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
                <p className="text-xs">Jami đang phân tích lỗi sai và tổng hợp mẹo làm bài...</p>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="bg-[#060D09] border border-emerald-500/20 rounded-xl p-4 text-zinc-200">
                  <div className="text-xs text-emerald-400 font-semibold mb-1">HƯỚNG DẪN BẢN CHẤT:</div>
                  <p className="text-xs leading-relaxed text-zinc-300 whitespace-pre-line">
                    {aiExplainModal.explanation}
                  </p>
                </div>

                {aiExplainModal.tips && aiExplainModal.tips.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 space-y-1.5 text-xs text-amber-200">
                    <div className="font-bold flex items-center gap-1.5 text-amber-400">
                      <Lightbulb className="w-3.5 h-3.5" /> Mẹo tránh bẫy lần sau:
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-zinc-300">
                      {aiExplainModal.tips.map((t, idx) => (
                        <li key={idx}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setAiExplainModal(null)}
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold"
                  >
                    Đã hiểu
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
