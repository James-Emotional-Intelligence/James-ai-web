import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { StudyTask, ExecutionGuide, TaskEvidence, PreparationChecklistItem } from '../../../shared/types';
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
      const res = await api.generateExecutionGuide(task.id);
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

  const handleCompleteTaskDirectly = async () => {
    if (!task) return;
    try {
      const res = await api.completeTask(task.id);
      setTask(res.task);
      confetti({ particleCount: 90, spread: 60 });
    } catch (err: any) {
      alert(err.message || 'Không thể hoàn tất nhiệm vụ.');
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

      {/* Header Banner */}
      <div className="bg-[#0B120D] p-6 sm:p-8 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4 relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-[#14532D] text-[#86EFAC] text-xs font-extrabold border border-[#22C55E]/30">
              {task.subjectName || 'Môn học'}
            </span>
            <span
              className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                task.priority === 'high'
                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/40'
                  : task.priority === 'low'
                  ? 'bg-[#101A13] text-[#A9B8AE] border-[rgba(34,197,94,0.2)]'
                  : 'bg-amber-950/60 text-amber-300 border-amber-800/40'
              }`}
            >
              Độ ưu tiên: {task.priority === 'high' ? 'Cao' : task.priority === 'low' ? 'Thấp' : 'Trung bình'}
            </span>
            {isCompleted && (
              <span className="px-3 py-1 rounded-xl bg-[#16A34A] text-[#050806] text-xs font-black">
                Đã hoàn thành 100%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[#86EFAC] bg-[#101A13] px-3.5 py-1.5 rounded-full border border-[rgba(34,197,94,0.2)]">
            <Clock className="w-4 h-4 text-[#22C55E]" />
            <span>Thời lượng ước tính: {task.estimatedMinutes} phút</span>
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F3FAF5] tracking-tight">
            {task.title}
          </h1>
          {task.objective && (
            <p className="text-xs sm:text-sm text-[#A9B8AE] mt-1 leading-relaxed">
              {task.objective}
            </p>
          )}
        </div>

        {/* Why it matters (from guide if generated) */}
        {guide?.whyItMatters && (
          <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[#86EFAC]">Vì sao cần làm nhiệm vụ này? </span>
              <span className="text-[#A9B8AE]">{guide.whyItMatters}</span>
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {guide && (
            <button
              onClick={() => setIsGuidedModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-black text-xs sm:text-sm shadow-md shadow-[#16A34A]/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-[#050806]" />
              <span>{isCompleted ? 'Xem lại chế độ hướng dẫn' : 'Bắt đầu Chế độ Hướng dẫn Từng bước'}</span>
            </button>
          )}

          <button
            onClick={() => navigate(`/focus?taskId=${task.id}&minutes=${task.estimatedMinutes}`)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] font-bold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            <Clock className="w-4 h-4 text-[#86EFAC]" />
            <span>Hẹn giờ tập trung ({task.estimatedMinutes} phút)</span>
          </button>

          {!isCompleted && (
            <button
              onClick={handleCompleteTaskDirectly}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold transition-all cursor-pointer ml-auto"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Đánh dấu xong</span>
            </button>
          )}
        </div>
      </div>

      {/* Guide Content vs Generate Guide Prompt Card */}
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
              Jami AI có thể phân tích bài học này thành các bước nhỏ khoa học kèm danh sách chuẩn bị và mẹo làm bài.
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
          {/* Left Column: Preparation Checklist & Criteria */}
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

            {/* Criteria for Excellent Completion */}
            {guide.excellentCriteria && guide.excellentCriteria.length > 0 && (
              <div className="bg-[#0B120D] p-5 rounded-3xl border border-amber-800/40 shadow-xl space-y-3">
                <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Tiêu chí Hoàn thành Xuất sắc</span>
                </h2>

                <ul className="space-y-2 text-xs text-[#F3FAF5]">
                  {guide.excellentCriteria.map((crit, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-bold text-amber-400">•</span>
                      <span className="text-[#A9B8AE]">{crit}</span>
                    </li>
                  ))}
                </ul>
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

          {/* Right Column: Step Breakdown & Reflection */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.18)]">
              <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-[#22C55E]" />
                <span>
                  Lộ trình từng bước ({guide.steps.length} Bước • {totalPlannedMinutes} Phút)
                </span>
              </h2>
              <span className="text-xs font-bold text-[#86EFAC] bg-[#101A13] px-3 py-1 rounded-xl border border-[rgba(34,197,94,0.2)]">
                Tiến độ: {task.completionPercent}%
              </span>
            </div>

            <div className="space-y-3.5">
              {guide.steps.map((step) => {
                const isStepDone = step.status === 'completed';

                return (
                  <div
                    key={step.id}
                    className={`p-5 rounded-3xl border transition-all ${
                      isStepDone
                        ? 'bg-[#101A13] border-[#22C55E]/40'
                        : 'bg-[#0B120D] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50 shadow-xl'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isStepDone
                              ? 'bg-[#16A34A] text-[#050806]'
                              : 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                          }`}
                        >
                          {isStepDone ? <CheckCircle2 className="w-4 h-4" /> : step.stepOrder}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#F3FAF5]">{step.title}</h3>
                          <p className="text-xs text-[#A9B8AE] mt-1 leading-relaxed">{step.instruction}</p>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-[#86EFAC] bg-[#101A13] px-2.5 py-1 rounded-lg shrink-0 border border-[rgba(34,197,94,0.2)]">
                        {step.plannedMinutes} phút
                      </span>
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
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Evidence & Attached Material Section */}
            <div className="mt-6 pt-4 border-t border-[rgba(34,197,94,0.18)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#22C55E]" />
                  <span>Tài liệu bài tập & Minh chứng ({evidenceList.length})</span>
                </h3>

                <button
                  type="button"
                  onClick={() => setIsAttachModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold border border-[#22C55E]/40 transition-all cursor-pointer shadow-sm"
                  title="Đính kèm tài liệu tham khảo từ kho hoặc tải tệp lên"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Đính kèm tệp</span>
                </button>
              </div>

              {evidenceList.length > 0 ? (
                <div className="space-y-2">
                  {evidenceList.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between text-[#86EFAC] font-bold">
                        <span>Tài liệu / Minh chứng</span>
                        {ev.scoreValue && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            {ev.scoreValue}/5 sao
                          </span>
                        )}
                      </div>
                      {ev.textValue && <p className="text-[#F3FAF5]">{ev.textValue}</p>}
                      <div className="text-[10px] text-[#A9B8AE]">
                        Ghi nhận lúc: {new Date(ev.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#050806] border border-[rgba(34,197,94,0.15)] text-center text-xs text-[#A9B8AE]">
                  Chưa có tài liệu đính kèm. Bấm "Đính kèm tệp" để thêm tài liệu tham khảo cho bài học.
                </div>
              )}
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
              textValue: `[Tài liệu đính kèm]: ${res.materialTitle || res.fileName}${
                res.savedToMaterials ? ' (Đã lưu vào Kho tài liệu)' : ''
              }`,
              scoreValue: 5,
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
