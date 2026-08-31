import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ListTodo,
  CheckCircle2,
  Clock,
  Play,
  Sparkles,
  Target,
  AlertTriangle,
  Award,
  CheckSquare,
  Square,
  ArrowLeft,
  RefreshCw,
  HelpCircle,
  Calendar,
  Layers,
  Star,
  FileText,
  Paperclip,
  FolderArchive,
  Upload,
  ChevronUp,
  ChevronDown,
  Bot,
  Link as LinkIcon,
  Image as ImageIcon,
  Check,
  X,
  Flame,
  Send,
  MessageSquare,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { StudyTask, ExecutionGuide, ExecutionStep, TaskEvidence, PreparationChecklistItem } from '../../../shared/types';
import { GuidedExecutionModal } from './GuidedExecutionModal';
import { MaterialFilePickerModal, SelectedFileResult } from '../../components/common/MaterialFilePickerModal';
import confetti from 'canvas-confetti';

export const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<StudyTask | null>(null);
  const [guide, setGuide] = useState<ExecutionGuide | null>(null);
  const [evidenceList, setEvidenceList] = useState<TaskEvidence[]>([]);
  const [checklist, setChecklist] = useState<PreparationChecklistItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [isGuidedModalOpen, setIsGuidedModalOpen] = useState(false);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);

  // 3.2 Explain Step with Jami Modal State
  const [explainingStep, setExplainingStep] = useState<ExecutionStep | null>(null);
  const [studentQuestion, setStudentQuestion] = useState('');
  const [stepExplanation, setStepExplanation] = useState<{
    explanation: string;
    actionableSteps: string[];
    example: string;
    keyTips: string[];
  } | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  // 3.3 Submit Evidence Modal State
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [evidenceType, setEvidenceType] = useState<'text' | 'image' | 'file' | 'link'>('text');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceLink, setEvidenceLink] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceRating, setEvidenceRating] = useState<number>(5);
  const [isStudentConfirmed, setIsStudentConfirmed] = useState(false);
  const [isEvaluatingEvidence, setIsEvaluatingEvidence] = useState(false);
  const [evidenceEvaluation, setEvidenceEvaluation] = useState<{
    score: number;
    rating: number;
    isPassed: boolean;
    feedback: string;
    strengths: string[];
    missingPoints: string[];
  } | null>(null);
  const [isSubmittingEvidence, setIsSubmittingEvidence] = useState(false);

  // 3.4 Completion & Celebration Modal
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [criteriaChecked, setCriteriaChecked] = useState<Record<number, boolean>>({});

  const fetchTaskDetails = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getTask(id);
      const activeGuide = res.executionGuide || res.task.executionGuide || null;
      setTask({ ...res.task, executionGuide: activeGuide || undefined });
      if (activeGuide) {
        setGuide(activeGuide);
        setChecklist(activeGuide.preparationChecklist || []);
      } else {
        setGuide(null);
        setChecklist([]);
      }
      if (res.evidence) {
        setEvidenceList(res.evidence);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải thông tin nhiệm vụ.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTaskDetails();
  }, [fetchTaskDetails]);

  const handleGenerateGuide = async () => {
    if (!task) return;
    setIsGeneratingGuide(true);
    setError(null);
    try {
      const res = await api.generateSteps(task.id);
      setGuide(res.guide);
      setTask((prev) => (prev ? { ...prev, executionGuide: res.guide } : null));
      setChecklist(res.guide.preparationChecklist || []);
      confetti({ particleCount: 60, spread: 50 });
    } catch (err: any) {
      setError(err.message || 'Không thể tạo hướng dẫn bằng AI. Vui lòng thử lại.');
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const toggleChecklistItem = async (item: PreparationChecklistItem) => {
    if (!task) return;
    const prevChecked = item.checked;
    const newChecked = !prevChecked;

    // Optimistic UI update
    setChecklist((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, checked: newChecked } : c))
    );
    setChecklistError(null);

    try {
      await api.updateChecklistItem(task.id, item.id, newChecked);
    } catch (err: any) {
      // Rollback on error
      setChecklist((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, checked: prevChecked } : c))
      );
      setChecklistError('Không thể cập nhật danh sách chuẩn bị. Vui lòng thử lại.');
    }
  };

  // 3.2 Step Reordering Actions
  const handleMoveStep = async (index: number, direction: 'up' | 'down') => {
    if (!guide || !guide.steps || !task) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= guide.steps.length) return;

    const newSteps = [...guide.steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;

    // Optimistic update
    const reorderedSteps = newSteps.map((s, idx) => ({ ...s, stepOrder: idx + 1 }));
    setGuide((prev) => (prev ? { ...prev, steps: reorderedSteps } : null));

    try {
      await api.reorderTaskSteps(task.id, reorderedSteps.map((s) => s.id));
    } catch (err: any) {
      alert(err.message || 'Không thể thay đổi thứ tự bước.');
      await fetchTaskDetails();
    }
  };

  // 3.2 Step Status Toggle
  const handleToggleStep = async (step: ExecutionStep) => {
    if (!task || !guide) return;
    const nextStatus = step.status === 'completed' ? 'pending' : 'completed';

    try {
      if (nextStatus === 'completed') {
        const res = await api.completeTaskStep(task.id, step.id, step.plannedMinutes);
        if (res.guide) setGuide(res.guide);
        if (res.task) setTask((prev) => (prev ? { ...prev, ...res.task } : null));
        confetti({ particleCount: 40, spread: 45 });
      } else {
        const res = await api.updateTaskStepDetails(task.id, step.id, { status: 'pending' });
        if (res.guide) setGuide(res.guide);
        await fetchTaskDetails();
      }
    } catch (err: any) {
      alert(err.message || 'Không thể cập nhật trạng thái bước.');
    }
  };

  // 3.2 Explain Step with Jami
  const handleOpenExplainModal = async (step: ExecutionStep) => {
    if (!task) return;
    setExplainingStep(step);
    setStudentQuestion('');
    setIsExplaining(true);
    setStepExplanation(null);

    try {
      const res = await api.explainTaskStep(task.id, {
        stepId: step.id,
        stepTitle: step.title,
        instruction: step.instruction,
        expectedOutput: step.expectedOutput,
        plannedMinutes: step.plannedMinutes,
      });
      setStepExplanation(res.explanation);
    } catch (err: any) {
      alert(err.message || 'Không thể kết nối đến Jami AI để giải thích bước này.');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleAskFollowUp = async () => {
    if (!task || !explainingStep || !studentQuestion.trim()) return;
    setIsExplaining(true);
    try {
      const res = await api.explainTaskStep(task.id, {
        stepId: explainingStep.id,
        stepTitle: explainingStep.title,
        instruction: explainingStep.instruction,
        expectedOutput: explainingStep.expectedOutput,
        plannedMinutes: explainingStep.plannedMinutes,
        studentQuestion: studentQuestion.trim(),
      });
      setStepExplanation(res.explanation);
      setStudentQuestion('');
    } catch (err: any) {
      alert(err.message || 'Không thể gửi câu hỏi cho Jami.');
    } finally {
      setIsExplaining(false);
    }
  };

  // 3.3 Evaluate Evidence with AI
  const handleEvaluateEvidenceWithAI = async () => {
    if (!task) return;
    const textToEval = evidenceType === 'link' ? evidenceLink : evidenceNote || evidenceFile?.name || '';
    if (!textToEval.trim()) {
      alert('Vui lòng nhập ghi chú, liên kết hoặc tải tệp lên trước khi kiểm tra.');
      return;
    }

    setIsEvaluatingEvidence(true);
    try {
      const res = await api.evaluateTaskEvidence(task.id, {
        textValue: textToEval,
        fileUrl: evidenceLink,
        type: evidenceType,
      });
      setEvidenceEvaluation(res.evaluation);
      if (res.evaluation.rating) {
        setEvidenceRating(res.evaluation.rating);
      }
    } catch (err: any) {
      alert(err.message || 'Không thể đánh giá minh chứng.');
    } finally {
      setIsEvaluatingEvidence(false);
    }
  };

  // 3.3 Submit Evidence
  const handleSubmitEvidence = async () => {
    if (!task) return;
    if (!isStudentConfirmed) {
      alert('Vui lòng tích xác nhận tính trung thực trước khi nộp minh chứng.');
      return;
    }

    setIsSubmittingEvidence(true);
    try {
      let finalNote = evidenceNote.trim();
      if (evidenceType === 'link') {
        finalNote = `[Liên kết trực tuyến]: ${evidenceLink} - ${evidenceNote}`;
      } else if (evidenceType === 'file' || evidenceType === 'image') {
        finalNote = `[Tệp đính kèm (${evidenceFile?.name || 'Tài liệu'})]: ${evidenceNote}`;
      }

      await api.submitTaskEvidence(task.id, {
        type: evidenceType,
        evidenceNote: finalNote || 'Minh chứng hoàn thành bài làm',
        rating: evidenceRating,
        fileUrl: evidenceLink || undefined,
      });

      confetti({ particleCount: 60, spread: 55 });
      setIsEvidenceModalOpen(false);
      setEvidenceNote('');
      setEvidenceLink('');
      setEvidenceFile(null);
      setIsStudentConfirmed(false);
      setEvidenceEvaluation(null);
      await fetchTaskDetails();
    } catch (err: any) {
      alert(err.message || 'Không thể lưu minh chứng.');
    } finally {
      setIsSubmittingEvidence(false);
    }
  };

  // 3.4 Complete Task
  const handleConfirmCompleteTask = async () => {
    if (!task) return;
    setIsCompletingTask(true);
    try {
      const res = await api.completeTask(task.id);
      setTask(res.task);
      setIsCompletionModalOpen(false);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
      await fetchTaskDetails();
    } catch (err: any) {
      alert(err.message || 'Không thể hoàn tất nhiệm vụ.');
    } finally {
      setIsCompletingTask(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại danh sách nhiệm vụ</span>
        </button>
        <div className="h-44 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.2)] animate-pulse flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-[#A9B8AE]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#22C55E]" />
            <span>Đang tải thông tin chi tiết nhiệm vụ...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại danh sách</span>
        </button>
        <div className="p-8 bg-[#0B120D] border border-rose-900/60 rounded-3xl text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <h2 className="text-base font-bold text-[#F3FAF5]">
            {error || 'Nhiệm vụ không tồn tại hoặc đã bị xóa.'}
          </h2>
          <button
            onClick={() => navigate('/tasks')}
            className="px-4 py-2 rounded-xl bg-[#14532D] text-[#86EFAC] text-xs font-bold hover:bg-[#16A34A] hover:text-[#050806] transition-all cursor-pointer"
          >
            Về trang Quản lý nhiệm vụ
          </button>
        </div>
      </div>
    );
  }

  const isCompleted = task.status === 'completed';
  const totalPlannedMinutes = guide?.steps?.reduce((acc, s) => acc + s.plannedMinutes, 0) || task.estimatedMinutes;
  const completedStepsCount = guide?.steps?.filter((s) => s.status === 'completed').length || 0;
  const totalStepsCount = guide?.steps?.length || 0;
  const allStepsDone = totalStepsCount > 0 && completedStepsCount === totalStepsCount;

  // Criteria calculations
  const totalCriteriaCount = (guide?.successCriteria?.length || 0) + (guide?.excellentCriteria?.length || 0);
  const metCriteriaCount = Object.values(criteriaChecked).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Top Back Navigation */}
      <button
        onClick={() => navigate('/tasks')}
        className="flex items-center gap-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Quay lại danh sách nhiệm vụ</span>
      </button>

      {/* 3.1. Chuẩn bị và mục tiêu (Header Banner) */}
      <div className="bg-[#0B120D] p-6 sm:p-8 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4 relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-[#14532D] text-[#86EFAC] text-xs font-extrabold border border-[#22C55E]/30">
              {task.subjectName || 'Môn học'}
            </span>
            <span
              className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                task.priority === 'high'
                  ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                  : task.priority === 'low'
                  ? 'bg-[#101A13] text-[#A9B8AE] border-[rgba(34,197,94,0.2)]'
                  : 'bg-amber-950/80 text-amber-300 border-amber-800'
              }`}
            >
              Độ ưu tiên: {task.priority === 'high' ? 'Cao' : task.priority === 'low' ? 'Thấp' : 'Trung bình'}
            </span>
            {task.dueAt && (
              <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-[#101A13] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Hạn nộp: {new Date(task.dueAt).toLocaleDateString('vi-VN')}</span>
              </span>
            )}
            {isCompleted && (
              <span className="px-3 py-1 rounded-xl bg-[#16A34A] text-[#050806] text-xs font-black flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã hoàn thành 100%</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[#86EFAC] bg-[#101A13] px-3.5 py-1.5 rounded-full border border-[rgba(34,197,94,0.2)]">
            <Clock className="w-4 h-4 text-[#22C55E]" />
            <span>Thời lượng dự kiến: {task.estimatedMinutes} phút</span>
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F3FAF5] tracking-tight">
            {task.title}
          </h1>
          {task.objective && (
            <div className="mt-2 p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] flex items-start gap-2.5">
              <Target className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#86EFAC] text-xs">Mục tiêu cần đạt: </span>
                <span className="text-xs text-[#F3FAF5] leading-relaxed">{task.objective}</span>
              </div>
            </div>
          )}
        </div>

        {/* Why it matters & Exam alignment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {guide?.whyItMatters ? (
            <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#86EFAC]">Lý do nhiệm vụ quan trọng: </span>
                <span className="text-[#A9B8AE]">{guide.whyItMatters}</span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
              <span>Nhiệm vụ rèn luyện kỹ năng tư duy và củng cố kiến thức trọng tâm.</span>
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] flex items-start gap-2.5">
            <GraduationCap className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[#86EFAC]">Kiến thức trọng tâm bài thi: </span>
              <span className="text-[#A9B8AE]">
                Bám sát chương trình GDPT 2018 và cấu trúc đề kiểm tra định kỳ môn {task.subjectName || 'học'}.
              </span>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[rgba(34,197,94,0.15)]">
          {guide && (
            <button
              onClick={() => setIsGuidedModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-black text-xs sm:text-sm shadow-md shadow-[#16A34A]/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-[#050806]" />
              <span>{isCompleted ? 'Xem lại chế độ hướng dẫn' : 'Bắt đầu Chế độ Hướng dẫn Từng bước'}</span>
            </button>
          )}

          <button
            onClick={() => navigate(`/focus?taskId=${task.id}&minutes=${task.estimatedMinutes}`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] font-bold text-xs transition-colors cursor-pointer"
          >
            <Clock className="w-4 h-4 text-[#86EFAC]" />
            <span>Hẹn giờ tập trung ({task.estimatedMinutes} phút)</span>
          </button>

          <button
            onClick={() => setIsEvidenceModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[#22C55E]/40 font-bold text-xs transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Nộp minh chứng bài làm</span>
          </button>

          {!isCompleted && (
            <button
              onClick={() => setIsCompletionModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black transition-all cursor-pointer ml-auto shadow-md shadow-[#16A34A]/20"
            >
              <Award className="w-4 h-4" />
              <span>Hoàn tất xuất sắc</span>
            </button>
          )}
        </div>
      </div>

      {/* 3.2 & 3.4 Guide Content vs Generate Steps Prompt */}
      {!guide ? (
        <div className="bg-[#0B120D] p-8 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center mx-auto border border-[#22C55E]/40">
            <Sparkles className="w-6 h-6" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-base sm:text-lg font-bold text-[#F3FAF5]">
              Chưa có hướng dẫn thực hiện từng bước
            </h2>
            <p className="text-xs text-[#A9B8AE] leading-relaxed">
              Jami AI có thể phân tích bài học này thành các bước nhỏ khoa học kèm danh sách chuẩn bị, kết quả mong đợi và mẹo làm bài.
            </p>
          </div>

          <button
            onClick={handleGenerateGuide}
            disabled={isGeneratingGuide}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs sm:text-sm shadow-lg shadow-[#16A34A]/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {isGeneratingGuide ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Jami đang phân tích và tạo hướng dẫn...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 fill-[#050806]" />
                <span>Tạo hướng dẫn từng bước với Jami AI</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Preparation Checklist & Criteria (3.1 & 3.4) */}
          <div className="space-y-6">
            {/* Preparation Checklist */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-3">
              <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#22C55E]" />
                <span>Chuẩn bị trước khi học ({checklist.filter((c) => c.checked).length}/{checklist.length})</span>
              </h2>

              {checklistError && (
                <div className="text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded-xl border border-rose-900/50">
                  {checklistError}
                </div>
              )}

              <div className="space-y-1.5">
                {checklist.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleChecklistItem(item)}
                    className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-[#101A13] transition-colors text-xs cursor-pointer"
                  >
                    {item.checked ? (
                      <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-[#A9B8AE] shrink-0 mt-0.5" />
                    )}
                    <span className={item.checked ? 'line-through text-[#526356]' : 'text-[#F3FAF5]'}>
                      {item.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3.4 Criteria for Excellent Completion */}
            {((guide.successCriteria && guide.successCriteria.length > 0) ||
              (guide.excellentCriteria && guide.excellentCriteria.length > 0)) && (
              <div className="bg-[#0B120D] p-5 rounded-3xl border border-amber-800/40 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>Tiêu chí Hoàn thành Xuất sắc</span>
                  </h2>
                  <span className="text-[11px] font-black text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-700/50">
                    Đạt {metCriteriaCount}/{totalCriteriaCount} tiêu chí
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {guide.successCriteria?.map((crit, idx) => (
                    <label key={`suc_${idx}`} className="flex items-start gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-[#101A13]">
                      <input
                        type="checkbox"
                        checked={Boolean(criteriaChecked[idx])}
                        onChange={(e) =>
                          setCriteriaChecked((prev) => ({ ...prev, [idx]: e.target.checked }))
                        }
                        className="mt-0.5 accent-[#22C55E]"
                      />
                      <span className="text-[#F3FAF5]">{crit}</span>
                    </label>
                  ))}
                  {guide.excellentCriteria?.map((crit, idx) => {
                    const offsetIdx = (guide.successCriteria?.length || 0) + idx;
                    return (
                      <label key={`exc_${idx}`} className="flex items-start gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-[#101A13]">
                        <input
                          type="checkbox"
                          checked={Boolean(criteriaChecked[offsetIdx])}
                          onChange={(e) =>
                            setCriteriaChecked((prev) => ({ ...prev, [offsetIdx]: e.target.checked }))
                          }
                          className="mt-0.5 accent-amber-400"
                        />
                        <span className="text-amber-200 font-medium">✨ {crit}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Common Mistakes */}
            {guide.commonMistakes && guide.commonMistakes.length > 0 && (
              <div className="bg-[#0B120D] p-5 rounded-3xl border border-rose-900/40 shadow-xl space-y-3">
                <h2 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Lỗi thường gặp cần tránh</span>
                </h2>

                <ul className="space-y-2 text-xs text-[#A9B8AE]">
                  {guide.commonMistakes.map((mistake, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span>{mistake}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fallback Action / Stuck Help */}
            {guide.fallbackAction && (
              <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-2">
                <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-[#22C55E]" />
                  <span>Khi gặp bài khó / Bị kẹt</span>
                </h2>
                <p className="text-xs text-[#A9B8AE] leading-relaxed">
                  {guide.fallbackAction}
                </p>
              </div>
            )}
          </div>

          {/* Right Column: 3.2 Step Breakdown, Reorder, Persistence & 3.3 Evidence */}
          <div className="lg:col-span-2 space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-[#22C55E]" />
                <h2 className="text-base font-bold text-[#F3FAF5]">
                  Lộ trình từng bước ({guide.steps.length} Bước • {totalPlannedMinutes} Phút)
                </h2>
              </div>
              <span className="text-xs font-bold text-[#86EFAC] bg-[#101A13] px-3 py-1 rounded-xl border border-[rgba(34,197,94,0.2)]">
                Tiến độ: {task.completionPercent}% ({completedStepsCount}/{totalStepsCount} bước)
              </span>
            </div>

            {/* Step list with Reorder & Jami Explain */}
            <div className="space-y-3.5">
              {guide.steps.map((step, idx) => {
                const isStepDone = step.status === 'completed';

                return (
                  <div
                    key={step.id}
                    className={`p-5 rounded-3xl border transition-all ${
                      isStepDone
                        ? 'bg-[#101A13]/80 border-[#22C55E]/40'
                        : 'bg-[#0B120D] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50 shadow-xl'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 truncate">
                        <button
                          type="button"
                          onClick={() => handleToggleStep(step)}
                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer transition-all ${
                            isStepDone
                              ? 'bg-[#16A34A] text-[#050806]'
                              : 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30 hover:border-[#22C55E]'
                          }`}
                          title={isStepDone ? 'Đã hoàn thành (Bấm để hủy)' : 'Đánh dấu hoàn thành bước này'}
                        >
                          {isStepDone ? <CheckCircle2 className="w-4 h-4" /> : step.stepOrder}
                        </button>
                        <div className="truncate">
                          <h3 className={`text-sm font-bold truncate ${isStepDone ? 'line-through text-[#A9B8AE]' : 'text-[#F3FAF5]'}`}>
                            {step.title}
                          </h3>
                          <p className="text-xs text-[#A9B8AE] mt-1 leading-relaxed">{step.instruction}</p>
                        </div>
                      </div>

                      {/* Right step tools: Duration + Reorder buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-[#86EFAC] bg-[#101A13] px-2.5 py-1 rounded-lg border border-[rgba(34,197,94,0.2)]">
                          {step.plannedMinutes} phút
                        </span>

                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveStep(idx, 'up')}
                            className="p-1 rounded bg-[#101A13] hover:bg-[#16A34A] hover:text-[#050806] text-[#A9B8AE] disabled:opacity-20 cursor-pointer"
                            title="Di chuyển bước này lên trên"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === guide.steps.length - 1}
                            onClick={() => handleMoveStep(idx, 'down')}
                            className="p-1 rounded bg-[#101A13] hover:bg-[#16A34A] hover:text-[#050806] text-[#A9B8AE] disabled:opacity-20 cursor-pointer"
                            title="Di chuyển bước này xuống dưới"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pl-10 space-y-2">
                      <div className="p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] text-xs text-[#A9B8AE] flex items-start gap-2">
                        <Target className="w-3.5 h-3.5 text-[#22C55E] shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-[#F3FAF5]">Kết quả mong đợi: </strong>
                          {step.expectedOutput}
                        </span>
                      </div>

                      {step.tips && step.tips.length > 0 && (
                        <div className="text-[11px] text-[#86EFAC] font-medium flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                          <span>{step.tips[0]}</span>
                        </div>
                      )}

                      {/* 3.2 Ask Jami to explain this step button */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleOpenExplainModal(step)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#14532D]/60 hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold border border-[#22C55E]/30 transition-all cursor-pointer"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>🤖 Nhờ Jami giải thích bước này</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3.3 Evidence & Attached Material Section */}
            <div className="mt-6 pt-4 border-t border-[rgba(34,197,94,0.18)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#22C55E]" />
                  <span>Minh chứng bài làm & Tài liệu ({evidenceList.length})</span>
                </h3>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEvidenceModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black transition-all cursor-pointer shadow-sm"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Nộp minh chứng mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAttachModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.2)] transition-all cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Đính kèm từ kho</span>
                  </button>
                </div>
              </div>

              {evidenceList.length > 0 ? (
                <div className="space-y-2.5">
                  {evidenceList.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[#86EFAC] font-bold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                          <span>Minh chứng [{ev.type}]</span>
                        </span>
                        {ev.scoreValue && (
                          <span className="flex items-center gap-1 text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-800/40">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            {ev.scoreValue}/5 sao
                          </span>
                        )}
                      </div>
                      {ev.textValue && <p className="text-[#F3FAF5] leading-relaxed">{ev.textValue}</p>}
                      {ev.fileUrl && (
                        <div className="text-xs text-[#86EFAC]">
                          🔗 Liên kết: <a href={ev.fileUrl} target="_blank" rel="noreferrer" className="underline">{ev.fileUrl}</a>
                        </div>
                      )}
                      <div className="text-[10px] text-[#A9B8AE]">
                        Ghi nhận lúc: {new Date(ev.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-[#050806] border border-[rgba(34,197,94,0.15)] text-center text-xs text-[#A9B8AE] space-y-2">
                  <p>Chưa có minh chứng bài làm nào được ghi nhận.</p>
                  <p className="text-[11px]">Bấm "Nộp minh chứng mới" để nhập bài giải, tải ảnh hoặc liên kết bài tập.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3.2 Modal: Jami AI Explain Step */}
      {explainingStep && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-xl w-full shadow-2xl space-y-5 text-[#F3FAF5] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.2)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center font-black text-xs">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#F3FAF5]">Jami giải thích bước: {explainingStep.title}</h3>
                  <p className="text-[11px] text-[#A9B8AE]">Dành {explainingStep.plannedMinutes} phút để thực hiện</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExplainingStep(null)}
                className="p-1.5 rounded-xl hover:bg-[#101A13] text-[#A9B8AE] hover:text-[#F3FAF5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isExplaining && !stepExplanation ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#22C55E] mx-auto" />
                <p className="text-xs text-[#A9B8AE]">Jami đang chuẩn bị lời giảng giải và ví dụ mẫu...</p>
              </div>
            ) : stepExplanation ? (
              <div className="space-y-4 text-xs">
                {/* Visual explanation */}
                <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-1.5">
                  <span className="font-bold text-[#86EFAC]">💡 Bản chất & Cách hiểu:</span>
                  <p className="text-[#F3FAF5] leading-relaxed">{stepExplanation.explanation}</p>
                </div>

                {/* Actionable Steps */}
                <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-2">
                  <span className="font-bold text-[#86EFAC]">📝 Các thao tác cụ thể từng bước:</span>
                  <ul className="space-y-1 pl-2">
                    {stepExplanation.actionableSteps.map((act, idx) => (
                      <li key={idx} className="text-[#F3FAF5] flex items-start gap-2">
                        <span className="text-[#22C55E] font-bold">{idx + 1}.</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Example */}
                <div className="p-3.5 rounded-2xl bg-[#101A13] border border-amber-800/40 space-y-1.5">
                  <span className="font-bold text-amber-300">🔍 Ví dụ minh họa có giải mẫu:</span>
                  <p className="text-amber-100 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                    {stepExplanation.example}
                  </p>
                </div>

                {/* Key Tips */}
                <div className="p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-1">
                  <span className="font-bold text-[#86EFAC]">⭐ Mẹo làm nhanh & Bẫy cần tránh:</span>
                  <ul className="space-y-1 pl-2">
                    {stepExplanation.keyTips.map((tip, idx) => (
                      <li key={idx} className="text-[#A9B8AE] flex items-start gap-1.5">
                        <span className="text-[#22C55E]">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Follow up question box */}
                <div className="pt-2 space-y-2">
                  <label className="text-[11px] font-bold text-[#86EFAC]">Chưa hiểu rõ? Đặt thêm câu hỏi cho Jami:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={studentQuestion}
                      onChange={(e) => setStudentQuestion(e.target.value)}
                      placeholder="Ví dụ: Em chưa hiểu tại sao lại suy ra công thức này..."
                      className="flex-1 p-2.5 bg-[#101A13] border border-[rgba(34,197,94,0.3)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    />
                    <button
                      type="button"
                      disabled={isExplaining || !studentQuestion.trim()}
                      onClick={handleAskFollowUp}
                      className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black rounded-xl text-xs cursor-pointer transition-all disabled:opacity-40"
                    >
                      Hỏi tiếp
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2 border-t border-[rgba(34,197,94,0.18)]">
              <button
                type="button"
                onClick={() => setExplainingStep(null)}
                className="px-4 py-2 bg-[#101A13] hover:bg-[#142319] text-[#86EFAC] text-xs font-bold rounded-xl cursor-pointer"
              >
                Đã hiểu, đóng lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.3 Modal: Submit Evidence & AI Check */}
      {isEvidenceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 text-[#F3FAF5] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.2)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#F3FAF5]">Nộp minh chứng kết quả</h3>
                  <p className="text-[11px] text-[#A9B8AE]">Giới hạn tệp: Ảnh / PDF tối đa 10MB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEvidenceModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-[#101A13] text-[#A9B8AE] hover:text-[#F3FAF5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Evidence Type Tabs */}
            <div className="grid grid-cols-4 gap-1 bg-[#101A13] p-1 rounded-2xl text-xs font-bold">
              {[
                { key: 'text', label: 'Ghi chú / Lời giải' },
                { key: 'image', label: 'Ảnh bài làm' },
                { key: 'file', label: 'Tệp PDF' },
                { key: 'link', label: 'Liên kết URL' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setEvidenceType(tab.key as any)}
                  className={`p-2 rounded-xl text-center cursor-pointer transition-all ${
                    evidenceType === tab.key
                      ? 'bg-[#16A34A] text-[#050806]'
                      : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Type-specific inputs */}
            {evidenceType === 'link' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#86EFAC]">Đường dẫn bài làm (Google Drive, Doc, Quiz, Link):</label>
                <input
                  type="url"
                  value={evidenceLink}
                  onChange={(e) => setEvidenceLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-2.5 bg-[#101A13] border border-[rgba(34,197,94,0.3)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
              </div>
            )}

            {(evidenceType === 'image' || evidenceType === 'file') && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#86EFAC]">
                  Chọn tệp ({evidenceType === 'image' ? 'JPG, PNG, WEBP' : 'PDF'}, tối đa 10MB):
                </label>
                <input
                  type="file"
                  accept={evidenceType === 'image' ? 'image/jpeg,image/png,image/webp' : 'application/pdf'}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) {
                        alert('Tệp vượt quá dung lượng cho phép (tối đa 10MB).');
                        return;
                      }
                      setEvidenceFile(file);
                    }
                  }}
                  className="w-full text-xs text-[#A9B8AE] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#14532D] file:text-[#86EFAC] cursor-pointer"
                />
                {evidenceFile && (
                  <p className="text-[11px] text-[#86EFAC]">
                    ✓ Đã chọn: {evidenceFile.name} ({(evidenceFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#86EFAC]">Nội dung ghi chú / câu trả lời chi tiết:</label>
              <textarea
                rows={3}
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="Nhập phần tóm tắt các bước giải, đáp án cuối cùng hoặc ghi chú cho giáo viên..."
                className="w-full p-3 bg-[#101A13] border border-[rgba(34,197,94,0.3)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
              />
            </div>

            {/* AI Evaluation Button */}
            <div>
              <button
                type="button"
                disabled={isEvaluatingEvidence}
                onClick={handleEvaluateEvidenceWithAI}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isEvaluatingEvidence ? 'AI đang phân tích và chấm điểm...' : '✨ AI kiểm tra minh chứng theo tiêu chí'}</span>
              </button>

              {evidenceEvaluation && (
                <div className="mt-3 p-3.5 rounded-2xl bg-[#101A13] border border-amber-700/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-amber-300 font-black">
                    <span>Đánh giá từ AI: {evidenceEvaluation.score}/100 điểm ({evidenceEvaluation.rating}/5 sao)</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {evidenceEvaluation.isPassed ? 'Đạt yêu cầu' : 'Cần bổ sung'}
                    </span>
                  </div>
                  <p className="text-[#F3FAF5] leading-relaxed">{evidenceEvaluation.feedback}</p>
                  {evidenceEvaluation.missingPoints.length > 0 && (
                    <div className="text-amber-200">
                      <span className="font-bold">Gợi ý phần còn thiếu: </span>
                      <span>{evidenceEvaluation.missingPoints.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Student Confirmation Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] cursor-pointer">
              <input
                type="checkbox"
                checked={isStudentConfirmed}
                onChange={(e) => setIsStudentConfirmed(e.target.checked)}
                className="mt-0.5 accent-[#22C55E]"
              />
              <span>
                Em xác nhận đây là minh chứng học tập thực tế của bản thân và cam kết trung thực trong học tập.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[rgba(34,197,94,0.18)]">
              <button
                type="button"
                onClick={() => setIsEvidenceModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSubmittingEvidence || !isStudentConfirmed}
                onClick={handleSubmitEvidence}
                className="px-5 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-[#16A34A]/25 disabled:opacity-40"
              >
                {isSubmittingEvidence ? 'Đang lưu...' : 'Lưu & Nộp minh chứng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.4 Modal: Hoàn thành xuất sắc */}
      {isCompletionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-amber-500/50 p-6 sm:p-7 rounded-3xl max-w-md w-full shadow-2xl space-y-5 text-[#F3FAF5] text-center">
            <div className="w-14 h-14 rounded-3xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
              <Award className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-amber-300">Hoàn thành xuất sắc nhiệm vụ</h3>
              <p className="text-xs text-[#A9B8AE]">
                Chúc mừng em đã hoàn thành bài học "{task.title}"!
              </p>
            </div>

            {/* Checklist of requirements check */}
            <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-left space-y-2 text-xs">
              <div className="flex items-center justify-between text-[#86EFAC]">
                <span>Các bước thực hiện:</span>
                <span className="font-bold">
                  {completedStepsCount}/{totalStepsCount} bước {allStepsDone ? '✓' : '(chưa hoàn tất hết)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-amber-300">
                <span>Tiêu chí đạt được:</span>
                <span className="font-bold">{metCriteriaCount}/{totalCriteriaCount} tiêu chí</span>
              </div>
              <div className="flex items-center justify-between text-[#F3FAF5]">
                <span>Minh chứng đã nộp:</span>
                <span className="font-bold">{evidenceList.length} minh chứng</span>
              </div>
            </div>

            {/* Rewards info */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#14532D]/40 to-amber-950/40 border border-[#22C55E]/40 flex items-center justify-around text-xs font-black">
              <span className="text-[#86EFAC] flex items-center gap-1">
                ⭐ +50 EXP Học Tập
              </span>
              <span className="text-amber-400 flex items-center gap-1">
                🔥 Duy trì chuỗi ngày học
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[rgba(34,197,94,0.18)]">
              <button
                type="button"
                onClick={() => setIsCompletionModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
              >
                Xem lại bài
              </button>
              <button
                type="button"
                disabled={isCompletingTask}
                onClick={handleConfirmCompleteTask}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-400 to-[#16A34A] text-[#050806] text-xs font-black rounded-xl cursor-pointer transition-all shadow-lg shadow-amber-500/25 hover:scale-105"
              >
                {isCompletingTask ? 'Đang ghi nhận...' : 'Xác nhận hoàn thành ngay 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided Runner Modal */}
      {guide && (
        <GuidedExecutionModal
          task={task}
          isOpen={isGuidedModalOpen}
          onClose={() => setIsGuidedModalOpen(false)}
          onCompleted={() => {
            fetchTaskDetails();
          }}
        />
      )}

      {/* Universal File / Material Picker */}
      <MaterialFilePickerModal
        isOpen={isAttachModalOpen}
        onClose={() => setIsAttachModalOpen(false)}
        title="Đính Kèm Tài Liệu Cho Bài Học"
        description="Chọn tài liệu từ Kho hoặc tải file bài tập mới từ máy tính (kèm lưu vào kho)"
        onFileSelected={async (res) => {
          if (!task) return;
          try {
            await api.submitTaskEvidence(task.id, {
              evidenceNote: `[Tài liệu đính kèm]: ${res.materialTitle || res.fileName}${
                res.savedToMaterials ? ' (Đã lưu vào Kho tài liệu)' : ''
              }`,
              rating: 5,
            });
            confetti({ particleCount: 50, spread: 40 });
            await fetchTaskDetails();
          } catch (err: any) {
            alert(err.message || 'Không thể đính kèm tài liệu.');
          }
        }}
      />
    </div>
  );
};

