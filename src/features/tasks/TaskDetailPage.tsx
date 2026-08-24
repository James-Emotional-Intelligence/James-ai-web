import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { StudyTask, ExecutionGuide } from '../../../shared/types';
import { GuidedExecutionModal } from './GuidedExecutionModal';

export const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<StudyTask | null>(null);
  const [guide, setGuide] = useState<ExecutionGuide | null>(null);
  const [isGuidedModalOpen, setIsGuidedModalOpen] = useState(false);
  const [checklist, setChecklist] = useState<{ id: string; text: string; checked: boolean }[]>([]);

  useEffect(() => {
    const taskId = id || 'task-math-1';
    api.getTask(taskId).then((res) => {
      setTask(res.task);
      if (res.task.executionGuide) {
        setGuide(res.task.executionGuide);
        setChecklist(res.task.executionGuide.preparationChecklist || []);
      }
    });
  }, [id]);

  const toggleChecklistItem = (itemIndex: number) => {
    const updated = [...checklist];
    updated[itemIndex].checked = !updated[itemIndex].checked;
    setChecklist(updated);
  };

  if (!task || !guide) {
    return (
      <div className="p-12 text-center text-[#A9B8AE] text-xs">
        Đang tải thông tin chi tiết công việc...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-[#14532D] text-[#86EFAC] text-xs font-extrabold border border-[#22C55E]/30">
              Toán học 9
            </span>
            <span className="px-3 py-1 rounded-xl bg-amber-950/60 text-amber-300 text-xs font-bold border border-amber-800/40">
              Mốc D-7 Kỳ kiểm tra
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[#86EFAC] bg-[#101A13] px-3.5 py-1.5 rounded-full border border-[rgba(34,197,94,0.2)]">
            <Clock className="w-4 h-4 text-[#22C55E]" />
            <span>19:00 – 19:45 ({task.estimatedMinutes} phút)</span>
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#F3FAF5] tracking-tight">
            {task.title}
          </h1>
          <p className="text-xs sm:text-sm text-[#A9B8AE] mt-1 leading-relaxed">{guide.objective}</p>
        </div>

        {/* Why it matters */}
        <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-[#86EFAC]">Vì sao cần làm nhiệm vụ này? </span>
            <span className="text-[#A9B8AE]">{guide.whyItMatters}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => setIsGuidedModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-black text-xs sm:text-sm shadow-md shadow-[#16A34A]/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-[#050806]" />
            <span>Bắt đầu Chế độ Hướng dẫn Từng bước</span>
          </button>

          <button
            onClick={() => navigate('/focus')}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] font-bold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            <Clock className="w-4 h-4 text-[#86EFAC]" />
            <span>Hẹn giờ tập trung (45 phút)</span>
          </button>
        </div>
      </div>

      {/* Grid: Preparation Checklist & Step Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Preparation & Criteria */}
        <div className="space-y-6">
          {/* Preparation Checklist */}
          <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-3">
            <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#22C55E]" />
              <span>Chuẩn bị trước khi học</span>
            </h2>

            <div className="space-y-2">
              {checklist.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => toggleChecklistItem(idx)}
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
          <div className="bg-[#0B120D] p-5 rounded-3xl border border-amber-800/40 shadow-xl space-y-3">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Tiêu chí Hoàn thành Xuất sắc</span>
            </h2>

            <ul className="space-y-2 text-xs text-[#F3FAF5]">
              {guide.excellentCriteria?.map((crit, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-bold text-amber-400">•</span>
                  <span className="text-[#A9B8AE]">{crit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Common Mistakes */}
          <div className="bg-[#0B120D] p-5 rounded-3xl border border-rose-900/40 shadow-xl space-y-3">
            <h2 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Lỗi thường gặp cần tránh</span>
            </h2>

            <ul className="space-y-2 text-xs text-[#A9B8AE]">
              {guide.commonMistakes?.map((mistake, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{mistake}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column (2 Cols): Step-by-Step Execution Plan */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-[#22C55E]" />
              <span>Thực hiện từng bước khoa học (5 Bước • 45 Phút)</span>
            </h2>
            <span className="text-xs font-semibold text-[#86EFAC]">
              Tiến độ: {task.completionPercent}%
            </span>
          </div>

          <div className="space-y-3.5">
            {guide.steps.map((step) => (
              <div
                key={step.id}
                className={`p-5 rounded-3xl border transition-all ${
                  step.status === 'completed'
                    ? 'bg-[#101A13] border-[#22C55E]/40'
                    : 'bg-[#0B120D] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50 shadow-xl'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        step.status === 'completed'
                          ? 'bg-[#16A34A] text-[#050806]'
                          : 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                      }`}
                    >
                      {step.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : step.stepOrder}
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
            ))}
          </div>
        </div>
      </div>

      {/* Guided Runner Modal */}
      <GuidedExecutionModal
        task={task}
        isOpen={isGuidedModalOpen}
        onClose={() => setIsGuidedModalOpen(false)}
        onCompleted={() => {
          api.getTask(task.id).then((res) => {
            setTask(res.task);
            if (res.task.executionGuide) setGuide(res.task.executionGuide);
          });
        }}
      />
    </div>
  );
};
