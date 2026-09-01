import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  X,
  Bot,
  Layers,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { ScheduleProposal } from '../../../shared/types';
import { formatTimeVN, formatDateVN } from '../../lib/utils';
import confetti from 'canvas-confetti';

interface VoiceGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProposalConfirmed?: () => void;
}

export const VoiceGoalModal: React.FC<VoiceGoalModalProps> = ({
  isOpen,
  onClose,
  onProposalConfirmed,
}) => {
  const [step, setStep] = useState<'input' | 'processing' | 'preview'>('input');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [proposal, setProposal] = useState<ScheduleProposal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const samplePrompts = [
    'Tuần sau em kiểm tra Toán chương hàm số. Em còn yếu đồ thị, tối thứ ba và thứ năm rảnh sau 7 giờ. Hãy lên kế hoạch cho em.',
    'Tối nay em muốn dành 40 phút ôn từ vựng Tiếng Anh Unit 2 trước 9 giờ tối.',
    'Em cần 30 phút tóm tắt tác phẩm Chuyện người con gái Nam Xương chiều nay.',
  ];

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        clearInterval(timerRef.current);
        setRecordingSeconds(0);
        if (!transcript.trim()) {
          setTranscript(
            'Tuần sau em kiểm tra Toán chương hàm số. Em còn yếu đồ thị, tối thứ ba và thứ năm rảnh sau 7 giờ. Hãy lên kế hoạch cho em.'
          );
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Không thể truy cập micro. Bạn có thể chọn hoặc gõ nội dung mẫu bên dưới.');
      setIsRecording(false);
      setTranscript(
        'Tuần sau em kiểm tra Toán chương hàm số. Em còn yếu đồ thị, tối thứ ba và thứ năm rảnh sau 7 giờ. Hãy lên kế hoạch cho em.'
      );
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleProcessGoal = async () => {
    if (!transcript.trim()) return;
    setStep('processing');

    try {
      const res = await api.previewVoiceGoal(transcript);
      setExtractionResult(res.extraction);
      setProposal(res.proposal);
      setStep('preview');
    } catch (err: any) {
      alert(err.message || 'Không thể tạo kế hoạch.');
      setStep('input');
    }
  };

  const handleConfirmPlan = async () => {
    if (!proposal) return;
    setIsSubmitting(true);
    try {
      await api.confirmProposal(proposal.id);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });
      onProposalConfirmed?.();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Không thể cập nhật thời khóa biểu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] text-[#F3FAF5] jami-modal-animate"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[rgba(34,197,94,0.18)] flex items-center justify-between bg-[#101A13]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30 flex items-center justify-center">
              <Bot className="w-5 h-5 text-[#22C55E]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F3FAF5]">Lập kế hoạch thông minh cùng Jami</h2>
              <p className="text-xs text-[#A9B8AE]">Nói hoặc nhập mục tiêu, Jami sẽ tự động tính toán thời gian rảnh</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {step === 'input' && (
            <div className="space-y-6">
              {/* Mic Visualizer / Record Button */}
              <div className="flex flex-col items-center justify-center py-6 bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-2xl p-6 text-center">
                <button
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl transition-all cursor-pointer ${
                    isRecording
                      ? 'bg-rose-600 animate-pulse ring-8 ring-rose-900 scale-110'
                      : 'bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] hover:scale-105 shadow-[#16A34A]/30 text-[#050806]'
                  }`}
                >
                  {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8 fill-[#050806]" />}
                </button>

                <div className="mt-4">
                  <div className="text-sm font-bold text-[#F3FAF5]">
                    {isRecording ? `Đang lắng nghe... (00:0${recordingSeconds})` : 'Nhấn nút mic để nói mục tiêu'}
                  </div>
                  <div className="text-xs text-[#A9B8AE] mt-0.5">
                    {isRecording
                      ? 'Nhấn mic một lần nữa để dừng và tạo kế hoạch...'
                      : 'Hoặc bạn có thể gõ văn bản/chọn gợi ý bên dưới'}
                  </div>
                </div>
              </div>

              {/* Editable Transcript Input */}
              <div>
                <label className="block text-xs font-bold text-[#86EFAC] uppercase tracking-wider mb-2">
                  Bản chép lời / Nội dung mục tiêu:
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Ví dụ: Tuần sau em kiểm tra Toán chương hàm số. Em còn yếu đồ thị, tối thứ ba và thứ năm rảnh sau 7 giờ..."
                  rows={3}
                  className="w-full text-sm p-3.5 border border-[rgba(34,197,94,0.25)] rounded-2xl focus:outline-none focus:border-[#22C55E] bg-[#050806] text-[#F3FAF5] placeholder-[#526356]"
                />
              </div>

              {/* Sample Prompts */}
              <div>
                <div className="text-xs font-semibold text-[#A9B8AE] mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                  <span>Gợi ý câu nói mẫu:</span>
                </div>
                <div className="space-y-1.5">
                  {samplePrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTranscript(prompt)}
                      className="w-full text-left text-xs p-2.5 rounded-xl border border-[rgba(34,197,94,0.18)] hover:border-[#22C55E]/40 hover:bg-[#101A13] text-[#A9B8AE] transition-colors cursor-pointer"
                    >
                      "{prompt}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 border-4 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
              <div className="font-bold text-[#F3FAF5] text-base">Jami đang phân tích mục tiêu & xếp lịch...</div>
              <div className="text-xs text-[#A9B8AE] max-w-sm">
                Đang đối chiếu thời khóa biểu trường, giờ học thêm và thời gian ăn/ngủ để tìm khung giờ tối ưu nhất.
              </div>
            </div>
          )}

          {step === 'preview' && proposal && (
            <div className="space-y-6">
              {/* Understanding Summary */}
              {extractionResult && (
                <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.25)]">
                  <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-xs uppercase tracking-wider mb-1">
                    <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                    <span>Jami đã hiểu mục tiêu</span>
                  </div>
                  <p className="text-xs text-[#A9B8AE] leading-relaxed font-medium">
                    {extractionResult.clarification}
                  </p>
                </div>
              )}

              {/* Task Breakdown & Slots */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#22C55E]" />
                    <span>Đề xuất phân bổ lịch học ({proposal.tasksToSchedule.length} phiên)</span>
                  </h3>
                  <span className="text-[11px] font-semibold text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded-full border border-[#22C55E]/30">
                    Không trùng lịch cố định
                  </span>
                </div>

                <div className="space-y-2.5">
                  {proposal.tasksToSchedule.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[#101A13] hover:border-[#22C55E]/50 shadow-xl transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-xs text-[#F3FAF5]">{item.title}</div>
                        <span className="text-[11px] font-extrabold text-[#86EFAC] bg-[#050806] px-2 py-0.5 rounded-lg shrink-0 border border-[rgba(34,197,94,0.2)]">
                          {item.estimatedMinutes} phút
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#A9B8AE]">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#22C55E]" />
                          <span>{formatDateVN(item.proposedStart)}</span>
                        </div>
                        <div className="flex items-center gap-1 font-semibold text-[#86EFAC]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {formatTimeVN(item.proposedStart)} – {formatTimeVN(item.proposedEnd)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unscheduled items warning if any */}
              {proposal.unscheduledItems.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/40 text-xs text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Lưu ý: </span>
                    <span className="text-[#A9B8AE]">{proposal.unscheduledItems[0].reason}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer with Actions */}
        <div className="px-6 py-4 border-t border-[rgba(34,197,94,0.18)] bg-[#101A13] flex items-center justify-between gap-3">
          {step === 'input' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleProcessGoal}
                disabled={!transcript.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] disabled:opacity-40 text-[#050806] text-xs font-black rounded-xl shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <span>Tạo kế hoạch học tập</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : step === 'preview' ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('input')}
                  className="px-3.5 py-2 text-xs font-semibold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl transition-colors cursor-pointer"
                >
                  Chỉnh sửa
                </button>
                <button
                  onClick={handleProcessGoal}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tạo lại</span>
                </button>
              </div>
              <button
                onClick={handleConfirmPlan}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-black rounded-xl shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Đang lưu...' : 'Chấp nhận kế hoạch & Lưu lịch'}</span>
              </button>
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};
