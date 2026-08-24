import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Plus,
  Lock,
  Unlock,
  RefreshCw,
  Clock,
  MapPin,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { TimetableEntry, BusyEvent, StudyTask, ScheduleProposal } from '../../../shared/types';
import { formatTimeVN, formatDateVN } from '../../lib/utils';
import confetti from 'canvas-confetti';

export const TimetablePage: React.FC = () => {
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(1); // 1 = Monday
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [busyEvents, setBusyEvents] = useState<BusyEvent[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [isReplanning, setIsReplanning] = useState(false);
  const [proposalDiff, setProposalDiff] = useState<ScheduleProposal | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStart, setNewEventStart] = useState('17:30');
  const [newEventEnd, setNewEventEnd] = useState('19:00');

  useEffect(() => {
    Promise.all([api.getTimetable(), api.getTasks()])
      .then(([ttData, taskData]) => {
        setTimetableEntries(ttData.entries);
        setBusyEvents(ttData.busyEvents);
        setTasks(taskData.tasks);
      })
      .catch(() => {});
  }, []);

  const days = [
    { num: 1, label: 'Thứ 2' },
    { num: 2, label: 'Thứ 3' },
    { num: 3, label: 'Thứ 4' },
    { num: 4, label: 'Thứ 5' },
    { num: 5, label: 'Thứ 6' },
    { num: 6, label: 'Thứ 7' },
    { num: 7, label: 'Chủ Nhật' },
  ];

  const handleToggleLockTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updated = await api.updateTask(taskId, { locked: !task.locked });
    setTasks(tasks.map((t) => (t.id === taskId ? updated.task : t)));
  };

  const handleTriggerReplan = async () => {
    setIsReplanning(true);
    try {
      const res = await api.previewReplan();
      setProposalDiff(res.proposal);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReplanning(false);
    }
  };

  const handleConfirmReplan = async () => {
    if (!proposalDiff) return;
    await api.confirmProposal(proposalDiff.id);
    const updatedTasks = await api.getTasks();
    setTasks(updatedTasks.tasks);
    setProposalDiff(null);
    confetti({ particleCount: 70, spread: 50 });
  };

  const handleAddBusyEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const baseDate = new Date();
    const [sH, sM] = newEventStart.split(':').map(Number);
    const [eH, eM] = newEventEnd.split(':').map(Number);

    const start = new Date(baseDate);
    start.setHours(sH, sM, 0, 0);

    const end = new Date(baseDate);
    end.setHours(eH, eM, 0, 0);

    const res = await api.addBusyEvent({
      title: newEventTitle,
      type: 'extra_class',
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      isFixed: true,
      timezone: 'Asia/Ho_Chi_Minh',
    });

    setBusyEvents([...busyEvents, res.event]);
    setNewEventTitle('');
    setIsAddEventOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.22)] shadow-xl">
        <div>
          <h1 className="text-xl font-black text-[#F3FAF5] flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#22C55E]" />
            <span>Lịch Học Thông Minh</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-0.5">
            Tự động đồng bộ thời khóa biểu trường, giờ học thêm và thời gian tự học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Toggle */}
          <div className="flex items-center bg-[#101A13] p-1 rounded-xl border border-[rgba(34,197,94,0.18)]">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'week' ? 'bg-[#16A34A] text-[#050806] shadow-sm' : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              Tuần
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'day' ? 'bg-[#16A34A] text-[#050806] shadow-sm' : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              Ngày
            </button>
          </div>

          <button
            onClick={() => setIsAddEventOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#86EFAC]" />
            <span>Thêm lịch bận/học thêm</span>
          </button>

          <button
            onClick={handleTriggerReplan}
            disabled={isReplanning}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-extrabold shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReplanning ? 'animate-spin' : ''}`} />
            <span>Tự động sắp xếp lại</span>
          </button>
        </div>
      </div>

      {/* Replan Proposal Modal Diff */}
      {proposalDiff && (
        <div className="p-5 rounded-3xl bg-[#101A13] border border-[#22C55E]/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
              <Sparkles className="w-4 h-4 text-[#22C55E]" />
              <span>Xem trước đề xuất tối ưu lịch học từ Jami</span>
            </div>
            <button
              onClick={() => setProposalDiff(null)}
              className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
            >
              Đóng
            </button>
          </div>

          <p className="text-xs text-[#A9B8AE] leading-relaxed">{proposalDiff.reason}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {proposalDiff.tasksToSchedule.map((item, idx) => (
              <div key={idx} className="p-3 bg-[#0B120D] rounded-2xl border border-[rgba(34,197,94,0.25)] text-xs space-y-1">
                <div className="font-bold text-[#F3FAF5]">{item.title}</div>
                <div className="text-[#A9B8AE]">
                  {formatDateVN(item.proposedStart)} • {formatTimeVN(item.proposedStart)} –{' '}
                  {formatTimeVN(item.proposedEnd)}
                </div>
                <div className="text-[11px] text-[#86EFAC] font-medium">{item.reason}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setProposalDiff(null)}
              className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmReplan}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow-md cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Xác nhận cập nhật lịch</span>
            </button>
          </div>
        </div>
      )}

      {/* Week Day Selector Tabs */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <button
            key={d.num}
            onClick={() => setSelectedDay(d.num)}
            className={`p-3 rounded-2xl text-center border transition-all cursor-pointer ${
              selectedDay === d.num
                ? 'bg-[#16A34A] text-[#050806] border-[#22C55E] shadow-md shadow-[#16A34A]/25'
                : 'bg-[#0B120D] text-[#F3FAF5] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
            }`}
          >
            <div className="text-xs font-bold">{d.label}</div>
            <div className="text-[10px] opacity-80 mt-0.5">
              {d.num <= 5 ? 'Chính khóa' : 'Tự học'}
            </div>
          </button>
        ))}
      </div>

      {/* Timetable Schedule Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Morning Fixed School Session */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
            <h2 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider">
              Buổi Sáng (Chính Khóa)
            </h2>
            <span className="text-[10px] font-extrabold text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded-full border border-[#22C55E]/30">
              07:15 – 11:45
            </span>
          </div>

          {selectedDay <= 5 ? (
            <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#F3FAF5]">Trường THCS Lê Quý Đôn</span>
                <span className="text-[10px] font-semibold text-[#86EFAC]">Cố định</span>
              </div>
              <div className="text-xs text-[#A9B8AE]">
                Toán học • Ngữ văn • Tiếng Anh • Vật lý
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#86EFAC] pt-1">
                <MapPin className="w-3 h-3 text-[#22C55E]" />
                <span>Phòng học 9A2 • 15p di chuyển</span>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-[#A9B8AE]">
              Không có lịch học chính khóa vào cuối tuần
            </div>
          )}
        </div>

        {/* Afternoon Extra Classes & Activities */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
            <h2 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider">
              Buổi Chiều (Học Thêm & CLB)
            </h2>
            <span className="text-[10px] font-extrabold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/40">
              14:00 – 18:30
            </span>
          </div>

          <div className="space-y-2.5">
            {busyEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F3FAF5]">{evt.title}</span>
                  <Lock className="w-3.5 h-3.5 text-[#86EFAC]" />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#A9B8AE]">
                  <Clock className="w-3 h-3 text-[#22C55E]" />
                  <span>
                    {formatTimeVN(evt.startsAt)} – {formatTimeVN(evt.endsAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evening Flexible Study Tasks */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
            <h2 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider">
              Buổi Tối (Tự Học Cùng Jami)
            </h2>
            <span className="text-[10px] font-extrabold text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded-full border border-[#22C55E]/30">
              19:00 – 22:00
            </span>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-3.5 rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[#101A13] hover:border-[#22C55E]/50 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-xs text-[#F3FAF5]">{task.title}</div>
                  <button
                    onClick={() => handleToggleLockTask(task.id)}
                    className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] rounded cursor-pointer"
                    title={task.locked ? 'Đã khóa lịch' : 'Cho phép tự động dời lịch'}
                  >
                    {task.locked ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-[#A9B8AE]" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-[#A9B8AE]">
                  <div className="flex items-center gap-1 text-[#86EFAC] font-semibold">
                    <Clock className="w-3 h-3 text-[#22C55E]" />
                    <span>
                      {formatTimeVN(task.scheduledStartAt || new Date())} ({task.estimatedMinutes}p)
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      task.status === 'completed'
                        ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                        : 'bg-[#050806] text-[#A9B8AE] border border-[rgba(34,197,94,0.15)]'
                    }`}
                  >
                    {task.status === 'completed' ? 'Đã xong' : 'Chưa học'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Busy Event Modal */}
      {isAddEventOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <h3 className="text-base font-bold text-[#F3FAF5]">Thêm lịch học thêm hoặc việc bận</h3>

            <form onSubmit={handleAddBusyEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Tên buổi học / sự kiện:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Học thêm Toán Thầy Hùng"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full text-xs p-3 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Giờ bắt đầu:</label>
                  <input
                    type="time"
                    value={newEventStart}
                    onChange={(e) => setNewEventStart(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Giờ kết thúc:</label>
                  <input
                    type="time"
                    value={newEventEnd}
                    onChange={(e) => setNewEventEnd(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddEventOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow cursor-pointer"
                >
                  Thêm vào lịch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
