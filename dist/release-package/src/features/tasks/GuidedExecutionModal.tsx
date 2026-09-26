import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  Sparkles,
  X,
  Star,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { StudyTask, ExecutionStep } from '../../../shared/types';
import { api } from '../../lib/api-client';
import confetti from '../../lib/safe-confetti';

interface GuidedExecutionModalProps {
  task: StudyTask;
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

export const GuidedExecutionModal: React.FC<GuidedExecutionModalProps> = ({
  task,
  isOpen,
  onClose,
  onCompleted,
}) => {
  const steps = task.executionGuide?.steps || [];

  // Resume from first incomplete step
  const initialIndex = Math.max(0, steps.findIndex((s) => s.status !== 'completed'));
  const [currentStepIndex, setCurrentStepIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  const currentStep: ExecutionStep | undefined = steps[currentStepIndex];

  const [secondsRemaining, setSecondsRemaining] = useState(
    currentStep ? currentStep.plannedMinutes * 60 : 300
  );
  const [isRunning, setIsRunning] = useState(true);
  const [showStuckHelp, setShowStuckHelp] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Final reflection fields
  const [rating, setRating] = useState(5);
  const [evidenceNote, setEvidenceNote] = useState('Đã hoàn thành các bài tập và nắm vững kiến thức trọng tâm.');

  // Time tracking
  const stepStartTimeRef = useRef<number>(Date.now());
  const targetEndTimeRef = useRef<number>(Date.now() + (currentStep ? currentStep.plannedMinutes * 60 * 1000 : 300000));

  useEffect(() => {
    if (isOpen && currentStep) {
      const stepSeconds = currentStep.plannedMinutes * 60;
      setSecondsRemaining(stepSeconds);
      setIsRunning(true);
      stepStartTimeRef.current = Date.now();
      targetEndTimeRef.current = Date.now() + stepSeconds * 1000;
      setIsFinished(false);

      // Start step in API
      api.startTaskStep(task.id, currentStep.id).catch(() => {});
    }
  }, [currentStepIndex, isOpen, task.id]);

  useEffect(() => {
    let interval: any;
    if (isRunning && secondsRemaining > 0 && !isFinished && isOpen) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        setSecondsRemaining(remaining);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsRemaining, isFinished, isOpen]);

  const handleToggleTimer = () => {
    if (isRunning) {
      setIsRunning(false);
    } else {
      setIsRunning(true);
      targetEndTimeRef.current = Date.now() + secondsRemaining * 1000;
    }
  };

  const handleNextStep = async () => {
    if (!currentStep) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - stepStartTimeRef.current) / 1000));
    const actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

    try {
      await api.completeTaskStep(task.id, currentStep.id, actualMinutes);

      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        setIsFinished(true);
        confetti({ particleCount: 80, spread: 60 });
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Không thể ghi nhận hoàn tất bước này.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Submit evidence and reflection rating
      await api.submitTaskEvidence(task.id, {
        rating,
        evidenceNote: evidenceNote.trim() || 'Đã hoàn thành toàn bộ các bước của bài học.',
      });

      // 2. Mark task as completed
      await api.completeTask(task.id);

      confetti({ particleCount: 100, spread: 70 });
      onCompleted?.();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Không thể lưu minh chứng hoặc hoàn tất nhiệm vụ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !currentStep) return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] text-[#F3FAF5] jami-modal-animate"
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-[rgba(34,197,94,0.18)] flex items-center justify-between bg-[#101A13] text-[#F3FAF5]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30 flex items-center justify-center font-bold text-sm">
              {isFinished ? steps.length : currentStepIndex + 1}/{steps.length}
            </div>
            <div>
              <div className="text-xs text-[#86EFAC] font-semibold uppercase tracking-wider">
                Chế độ đồng hành từng bước
              </div>
              <h2 className="text-sm sm:text-base font-bold line-clamp-1 text-[#F3FAF5]">{task.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#A9B8AE] hover:text-[#F3FAF5] rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {submitError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {!isFinished ? (
            <>
              {/* Active Step Hero Card */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 p-6 rounded-3xl bg-[#101A13] border border-[rgba(34,197,94,0.2)]">
                <div className="space-y-3 flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14532D] text-[#86EFAC] text-xs font-bold border border-[#22C55E]/30">
                    <span>Bước {currentStep.stepOrder}: {currentStep.title}</span>
                  </div>

                  <p className="text-sm font-semibold text-[#F3FAF5] leading-relaxed">
                    {currentStep.instruction}
                  </p>

                  <div className="p-3 bg-[#050806] rounded-2xl border border-[rgba(34,197,94,0.15)] text-xs space-y-1">
                    <span className="font-bold text-[#86EFAC]">Kết quả kỳ vọng: </span>
                    <span className="text-[#A9B8AE]">{currentStep.expectedOutput}</span>
                  </div>

                  {currentStep.tips && currentStep.tips.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-[#86EFAC] font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Mẹo từ Jami: {currentStep.tips[0]}</span>
                    </div>
                  )}
                </div>

                {/* Step Timer Visualizer */}
                <div className="flex flex-col items-center justify-center p-4 bg-[#050806] rounded-2xl border border-[rgba(34,197,94,0.2)] shadow-sm min-w-[140px]">
                  <div className="text-2xl font-black text-[#22C55E] font-mono tracking-tight">
                    {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] font-bold text-[#A9B8AE] uppercase tracking-wider mt-1">
                    Thời gian dự kiến
                  </div>

                  <button
                    onClick={handleToggleTimer}
                    className="mt-3 p-2 rounded-full bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] transition-colors cursor-pointer"
                  >
                    {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-[#F3FAF5]" />}
                  </button>
                </div>
              </div>

              {/* Stuck / Help Drawer */}
              {showStuckHelp && (
                <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/40 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span>Phương án xử lý khi gặp khó khăn:</span>
                  </div>
                  <p className="text-[#A9B8AE] leading-relaxed">
                    {task.executionGuide?.fallbackAction ||
                      'Nếu bị kẹt quá 5 phút, hãy tạm thời chuyển sang câu tiếp theo hoặc hỏi trợ lý Jami để được gợi ý phương pháp.'}
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Final Reflection & Evidence Screen */
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-[#14532D] text-[#86EFAC] flex items-center justify-center mx-auto border border-[#22C55E]/40">
                <CheckCircle2 className="w-10 h-10 text-[#22C55E]" />
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-[#F3FAF5]">Chúc mừng em đã hoàn thành xuất sắc!</h3>
                <p className="text-xs text-[#A9B8AE] mt-1">
                  Em đã hoàn tất trọn vẹn các bước theo đúng lộ trình khoa học của Jami.
                </p>
              </div>

              {/* Self Assessment */}
              <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-left space-y-3">
                <label className="block text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                  1. Tự đánh giá mức độ hiểu bài:
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`p-1.5 rounded-lg transition-transform hover:scale-110 cursor-pointer ${
                        star <= rating ? 'text-amber-400' : 'text-[#526356]'
                      }`}
                    >
                      <Star className="w-6 h-6 fill-current" />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-[#F3FAF5] ml-2">{rating}/5 sao</span>
                </div>
              </div>

              {/* Evidence / Note */}
              <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-left space-y-2">
                <label className="block text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#22C55E]" />
                  <span>2. Minh chứng kết quả / Ghi chú rút kinh nghiệm:</span>
                </label>
                <textarea
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  rows={3}
                  className="w-full text-xs p-3 bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  placeholder="Ghi chú các bài tập đã giải xong hoặc phần kiến thức tâm đắc..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[rgba(34,197,94,0.18)] bg-[#101A13] flex items-center justify-between gap-3">
          {!isFinished ? (
            <>
              <button
                type="button"
                onClick={() => setShowStuckHelp(!showStuckHelp)}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:underline cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Gặp khó khăn?</span>
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>
                      {currentStepIndex < steps.length - 1 ? 'Hoàn thành bước này' : 'Tổng kết phiên học'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="w-full py-3 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <span>Lưu kết quả & Hoàn tất nhiệm vụ</span>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
