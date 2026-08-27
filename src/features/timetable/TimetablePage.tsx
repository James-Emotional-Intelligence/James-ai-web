import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
  BookOpen,
  AlertTriangle,
  X,
  Trash2,
  Edit2,
  Calendar,
  School,
  Download,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import {
  TimetableEntry,
  BusyEvent,
  StudyTask,
  ScheduleProposal,
  Subject,
  SchoolTimetable,
} from '../../../shared/types';
import { formatTimeVN, formatDateVN } from '../../lib/utils';
import confetti from 'canvas-confetti';

export const TimetablePage: React.FC = () => {
  // Navigation & View State
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0); // 0 = current week, -1 = last week, +1 = next week
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(1); // 1 = Monday ... 7 = Sunday

  // Data State
  const [activeTimetable, setActiveTimetable] = useState<SchoolTimetable | null>(null);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [busyEvents, setBusyEvents] = useState<BusyEvent[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReplanning, setIsReplanning] = useState(false);
  const [isConfirmingProposal, setIsConfirmingProposal] = useState(false);
  const [proposalDiff, setProposalDiff] = useState<ScheduleProposal | null>(null);

  // Modals
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BusyEvent | null>(null);

  // Form States - Timetable Entry
  const [entryTitle, setEntryTitle] = useState('');
  const [entrySubjectId, setEntrySubjectId] = useState('');
  const [entryDayOfWeek, setEntryDayOfWeek] = useState(1);
  const [entryStartTime, setEntryStartTime] = useState('07:30');
  const [entryEndTime, setEntryEndTime] = useState('11:45');
  const [entryLocation, setEntryLocation] = useState('');
  const [entryCommuteBefore, setEntryCommuteBefore] = useState(15);
  const [entryCommuteAfter, setEntryCommuteAfter] = useState(15);

  // Form States - Busy Event
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<'extra_class' | 'meal' | 'sleep' | 'commute' | 'personal'>('extra_class');
  const [eventDate, setEventDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('17:30');
  const [eventEndTime, setEventEndTime] = useState('19:00');
  const [eventRecurrence, setEventRecurrence] = useState<'none' | 'weekly' | 'daily'>('none');
  const [eventSubjectId, setEventSubjectId] = useState('');
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  // Calculate Week Days
  const weekDays = useMemo(() => {
    const today = new Date();
    const currentJsDay = today.getDay(); // 0 = Sun, 1 = Mon ...
    const mondayOffset = currentJsDay === 0 ? -6 : 1 - currentJsDay;

    const baseMonday = new Date(today);
    baseMonday.setDate(today.getDate() + mondayOffset + currentWeekOffset * 7);
    baseMonday.setHours(0, 0, 0, 0);

    const days: { dayOfWeek: number; date: Date; dateStr: string; label: string; isToday: boolean }[] = [];
    const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        dayOfWeek: i + 1,
        date: d,
        dateStr,
        label: dayLabels[i],
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, [currentWeekOffset]);

  const selectedDayInfo = useMemo(() => {
    return weekDays.find((d) => d.dayOfWeek === selectedDayOfWeek) || weekDays[0];
  }, [weekDays, selectedDayOfWeek]);

  // Fetch all timetable, task, and subject data
  const fetchData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const startRange = weekDays[0].date.toISOString();
      const endRange = new Date(weekDays[6].date.getTime() + 86400000 - 1).toISOString();

      const [ttData, taskData, subData] = await Promise.all([
        api.getTimetable({ from: startRange, to: endRange }),
        api.getTasks(),
        api.getSubjects(),
      ]);

      setActiveTimetable(ttData.activeTimetable || null);
      setTimetableEntries(ttData.entries || []);
      setBusyEvents(ttData.busyEvents || []);
      setTasks(taskData.tasks || []);
      setSubjects(subData.subjects || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tải dữ liệu thời khóa biểu');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentWeekOffset]);

  // Set default event date when opening add modal
  useEffect(() => {
    if (selectedDayInfo) {
      setEventDate(selectedDayInfo.dateStr);
      setEntryDayOfWeek(selectedDayOfWeek);
    }
  }, [selectedDayInfo, selectedDayOfWeek]);

  const handleToggleLockTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      const updated = await api.updateTask(taskId, { locked: !task.locked });
      setTasks(tasks.map((t) => (t.id === taskId ? updated.task : t)));
    } catch (err: any) {
      alert(err.message || 'Không thể thay đổi khóa nhiệm vụ.');
    }
  };

  const handleTriggerReplan = async () => {
    setIsReplanning(true);
    setErrorMessage(null);
    try {
      const res = await api.previewReplan({
        startDate: selectedDayInfo.date.toISOString(),
        daysCount: 7,
      });
      setProposalDiff(res.proposal);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tạo đề xuất sắp xếp lại.');
    } finally {
      setIsReplanning(false);
    }
  };

  const handleConfirmReplan = async () => {
    if (!proposalDiff) return;
    setIsConfirmingProposal(true);
    try {
      const res = await api.confirmProposal(proposalDiff.id);
      setTasks(res.tasks);
      setProposalDiff(null);
      confetti({ particleCount: 70, spread: 50, origin: { y: 0.6 } });
      await fetchData(); // Refetch from MySQL
    } catch (err: any) {
      alert(err.message || 'Xác nhận đề xuất thất bại.');
    } finally {
      setIsConfirmingProposal(false);
    }
  };

  // Timetable Entry CRUD Submit
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTitle.trim()) return;
    setIsFormSubmitting(true);
    try {
      if (editingEntry) {
        await api.updateTimetableEntry(editingEntry.id, {
          title: entryTitle.trim(),
          subjectId: entrySubjectId || null,
          dayOfWeek: entryDayOfWeek,
          startLocalTime: entryStartTime,
          endLocalTime: entryEndTime,
          location: entryLocation.trim() || undefined,
          commuteBeforeMinutes: entryCommuteBefore,
          commuteAfterMinutes: entryCommuteAfter,
        });
      } else {
        await api.createTimetableEntry({
          title: entryTitle.trim(),
          subjectId: entrySubjectId || undefined,
          dayOfWeek: entryDayOfWeek,
          startLocalTime: entryStartTime,
          endLocalTime: entryEndTime,
          location: entryLocation.trim() || undefined,
          commuteBeforeMinutes: entryCommuteBefore,
          commuteAfterMinutes: entryCommuteAfter,
        });
      }
      setIsAddEntryOpen(false);
      setEditingEntry(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể lưu tiết học');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDeleteEntry = async (id: string, title?: string) => {
    if (!confirm(`Bạn có chắc muốn xóa tiết học "${title || 'này'}" khỏi thời khóa biểu?`)) return;
    try {
      await api.deleteTimetableEntry(id);
      setIsAddEntryOpen(false);
      setEditingEntry(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể xóa tiết học');
    }
  };

  // Busy Event CRUD Submit
  const handleSaveBusyEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    const [sH, sM] = eventStartTime.split(':').map(Number);
    const [eH, eM] = eventEndTime.split(':').map(Number);

    const [y, m, d] = eventDate.split('-').map(Number);
    const start = new Date(y, m - 1, d, sH, sM, 0);
    const end = new Date(y, m - 1, d, eH, eM, 0);

    if (start >= end) {
      alert('Giờ kết thúc phải sau giờ bắt đầu');
      return;
    }

    let recurrenceRule: string | undefined = undefined;
    if (eventRecurrence === 'daily') {
      recurrenceRule = 'FREQ=DAILY';
    } else if (eventRecurrence === 'weekly') {
      const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      const dayCode = dayMap[start.getDay()];
      recurrenceRule = `FREQ=WEEKLY;BYDAY=${dayCode}`;
    }

    setIsFormSubmitting(true);
    try {
      if (editingEvent) {
        await api.updateBusyEvent(editingEvent.id, {
          title: eventTitle.trim(),
          type: eventType,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          recurrenceRule,
          subjectId: eventSubjectId || undefined,
        });
      } else {
        await api.addBusyEvent({
          title: eventTitle.trim(),
          type: eventType,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          recurrenceRule,
          isFixed: true,
          timezone: 'Asia/Ho_Chi_Minh',
          subjectId: eventSubjectId || undefined,
        });
      }
      setIsAddEventOpen(false);
      setEditingEvent(null);
      setEventTitle('');
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể lưu lịch bận');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDeleteBusyEvent = async (id: string, title?: string) => {
    if (!confirm(`Bạn có chắc muốn xóa lịch bận/học thêm "${title || 'này'}"?`)) return;
    try {
      await api.deleteBusyEvent(id);
      setIsAddEventOpen(false);
      setEditingEvent(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể xóa lịch bận');
    }
  };

  const handleUnscheduleTask = async (taskId: string, title?: string) => {
    if (!confirm(`Bạn có muốn hủy xếp lịch cho nhiệm vụ "${title || 'này'}"? (Bài tập sẽ trở về trạng thái chưa xếp giờ để Jami sắp xếp lại)`)) return;
    try {
      await api.unscheduleTask(taskId);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể hủy xếp lịch bài tập');
    }
  };

  const handleDeleteEntriesByDay = async (dayOfWeek: number, dayLabel: string) => {
    if (!confirm(`Bạn có chắc muốn xóa toàn bộ tất cả các tiết học của ${dayLabel}?`)) return;
    try {
      const res = await api.deleteEntriesByDay(dayOfWeek, activeTimetable?.id);
      alert(`Đã xóa ${res.deletedCount} tiết học của ${dayLabel}`);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể xóa các tiết học của ngày này');
    }
  };

  const handleDeleteAllEntries = async () => {
    if (!confirm('Bạn có chắc muốn XÓA TOÀN BỘ tất cả các tiết học trong thời khóa biểu để làm mới?')) return;
    try {
      const res = await api.deleteAllTimetableEntries(activeTimetable?.id);
      alert(`Đã xóa sạch ${res.deletedCount} tiết học trong thời khóa biểu`);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể làm mới thời khóa biểu');
    }
  };

  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const handleDownloadTimetable = async () => {
    setIsDownloadingCsv(true);
    try {
      await api.downloadTimetableCsv();
    } catch (err: any) {
      alert(err.message || 'Không thể tải xuống thời khóa biểu');
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  const openEditEntry = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setEntryTitle(entry.title);
    setEntrySubjectId(entry.subjectId || '');
    setEntryDayOfWeek(entry.dayOfWeek);
    setEntryStartTime(entry.startLocalTime);
    setEntryEndTime(entry.endLocalTime);
    setEntryLocation(entry.location || entry.room || '');
    setEntryCommuteBefore(entry.commuteBeforeMinutes ?? 15);
    setEntryCommuteAfter(entry.commuteAfterMinutes ?? 15);
    setIsAddEntryOpen(true);
  };

  const openEditEvent = (evt: BusyEvent) => {
    setEditingEvent(evt);
    setEventTitle(evt.title);
    setEventType(evt.type);
    const start = new Date(evt.startsAt);
    setEventDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`);
    setEventStartTime(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
    const end = new Date(evt.endsAt);
    setEventEndTime(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`);
    if (evt.recurrenceRule?.includes('FREQ=DAILY')) {
      setEventRecurrence('daily');
    } else if (evt.recurrenceRule?.includes('FREQ=WEEKLY')) {
      setEventRecurrence('weekly');
    } else {
      setEventRecurrence('none');
    }
    setEventSubjectId(evt.subjectId || '');
    setIsAddEventOpen(true);
  };

  // Filter items for a specific day
  const getItemsForDay = (dayOfWeek: number, dateStr: string) => {
    const dayEntries = timetableEntries.filter((e) => e.dayOfWeek === dayOfWeek);

    const dayEvents = busyEvents.filter((b) => {
      if (b.recurrenceRule) {
        if (b.recurrenceRule.includes('FREQ=DAILY')) return true;
        if (b.recurrenceRule.includes('FREQ=WEEKLY')) {
          const jsDayMap: Record<number, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };
          const target = jsDayMap[dayOfWeek];
          return b.recurrenceRule.includes(target);
        }
      }
      return b.startsAt.startsWith(dateStr);
    });

    const dayTasks = tasks.filter((t) => t.scheduledStartAt && t.scheduledStartAt.startsWith(dateStr));

    return { dayEntries, dayEvents, dayTasks };
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.22)] shadow-xl">
        <div>
          <h1 className="text-xl font-black text-[#F3FAF5] flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#22C55E]" />
            <span>Lịch Học Thông Minh</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-0.5">
            {activeTimetable ? `${activeTimetable.name} • Tự động xếp lịch tự học` : 'Tự động đồng bộ thời khóa biểu trường, lịch bận và thời gian tự học'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Week Navigator */}
          <div className="flex items-center bg-[#101A13] px-2 py-1 rounded-xl border border-[rgba(34,197,94,0.18)] text-xs text-[#F3FAF5]">
            <button
              onClick={() => setCurrentWeekOffset((prev) => prev - 1)}
              className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] rounded cursor-pointer"
              title="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-bold text-xs text-[#86EFAC]">
              {formatDateVN(weekDays[0].date)} – {formatDateVN(weekDays[6].date)}
            </span>
            <button
              onClick={() => setCurrentWeekOffset((prev) => prev + 1)}
              className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] rounded cursor-pointer"
              title="Tuần kế tiếp"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {currentWeekOffset !== 0 && (
              <button
                onClick={() => setCurrentWeekOffset(0)}
                className="ml-1 px-2 py-0.5 bg-[#14532D] text-[#86EFAC] text-[10px] font-bold rounded cursor-pointer border border-[#22C55E]/30"
              >
                Hôm nay
              </button>
            )}
          </div>

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

          {/* Add Actions */}
          <button
            onClick={() => {
              setEditingEntry(null);
              setEntryTitle('');
              setEntrySubjectId(subjects[0]?.id || '');
              setEntryLocation('');
              setIsAddEntryOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-colors cursor-pointer"
          >
            <School className="w-3.5 h-3.5 text-[#86EFAC]" />
            <span>Thêm tiết học</span>
          </button>

          <button
            onClick={() => {
              setEditingEvent(null);
              setEventTitle('');
              setEventDate(selectedDayInfo.dateStr);
              setIsAddEventOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#86EFAC]" />
            <span>Thêm lịch bận</span>
          </button>

          {timetableEntries.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDownloadTimetable}
                disabled={isDownloadingCsv}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                title="Tải xuống thời khóa biểu dưới dạng tệp CSV"
              >
                <Download className={`w-3.5 h-3.5 text-[#22C55E] ${isDownloadingCsv ? 'animate-bounce' : ''}`} />
                <span className="hidden sm:inline">{isDownloadingCsv ? 'Đang tải...' : 'Tải xuống TKB'}</span>
              </button>

              <button
                onClick={handleDeleteAllEntries}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-bold transition-colors cursor-pointer"
                title="Xóa toàn bộ các tiết học trong thời khóa biểu để nhập lại mới"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Làm mới TKB</span>
              </button>
            </>
          )}

          <button
            onClick={handleTriggerReplan}
            disabled={isReplanning}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-extrabold shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReplanning ? 'animate-spin' : ''}`} />
            <span>{isReplanning ? 'Đang tính toán...' : 'Tự động sắp xếp lại'}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={fetchData} className="underline font-bold hover:text-white cursor-pointer">
            Thử lại
          </button>
        </div>
      )}

      {/* Replan Proposal Modal Diff */}
      {proposalDiff && (
        <div className="p-5 rounded-3xl bg-[#101A13] border border-[#22C55E]/40 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
              <Sparkles className="w-4 h-4 text-[#22C55E]" />
              <span>Xem trước đề xuất tối ưu lịch học ({proposalDiff.tasksToSchedule.length} nhiệm vụ)</span>
            </div>
            <button
              onClick={() => setProposalDiff(null)}
              className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
            >
              Đóng
            </button>
          </div>

          <p className="text-xs text-[#A9B8AE] leading-relaxed">{proposalDiff.reason}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {proposalDiff.tasksToSchedule.map((item, idx) => (
              <div key={idx} className="p-3 bg-[#0B120D] rounded-2xl border border-[rgba(34,197,94,0.25)] text-xs space-y-1.5">
                <div className="font-bold text-[#F3FAF5] flex items-center justify-between">
                  <span>{item.title}</span>
                  <span className="text-[10px] font-bold text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded border border-[#22C55E]/30">
                    {item.estimatedMinutes}p
                  </span>
                </div>
                <div className="text-[#A9B8AE] flex items-center gap-1.5 text-[11px]">
                  <Clock className="w-3 h-3 text-[#22C55E]" />
                  <span>
                    {formatDateVN(item.proposedStart)} • {formatTimeVN(item.proposedStart)} – {formatTimeVN(item.proposedEnd)}
                  </span>
                </div>
                <div className="text-[11px] text-[#86EFAC] font-medium">{item.reason}</div>
              </div>
            ))}
          </div>

          {proposalDiff.unscheduledItems.length > 0 && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-2xl text-xs text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Không thể xếp tự động {proposalDiff.unscheduledItems.length} bài tập:</span>
              </div>
              {proposalDiff.unscheduledItems.map((u, i) => (
                <div key={i} className="text-[11px] text-[#A9B8AE]">
                  • <strong>{u.title}:</strong> {u.reason}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setProposalDiff(null)}
              className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleConfirmReplan}
              disabled={isConfirmingProposal}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isConfirmingProposal ? 'Đang lưu vào MySQL...' : 'Xác nhận cập nhật lịch'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Day Selector Tabs */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((d) => (
          <button
            key={d.dayOfWeek}
            onClick={() => setSelectedDayOfWeek(d.dayOfWeek)}
            className={`p-3 rounded-2xl text-center border transition-all cursor-pointer ${
              selectedDayOfWeek === d.dayOfWeek
                ? 'bg-[#16A34A] text-[#050806] border-[#22C55E] shadow-md shadow-[#16A34A]/25'
                : 'bg-[#0B120D] text-[#F3FAF5] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
            }`}
          >
            <div className="text-xs font-bold flex items-center justify-center gap-1">
              <span>{d.label}</span>
              {d.isToday && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </div>
            <div className="text-[11px] font-extrabold mt-0.5 opacity-90">
              {d.date.getDate()}/{d.date.getMonth() + 1}
            </div>
          </button>
        ))}
      </div>

      {/* Main Content: Single Day or Full Week View */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-[#A9B8AE] flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
          <span>Đang tải lịch học từ hệ thống...</span>
        </div>
      ) : viewMode === 'day' ? (
        // DAY VIEW
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#101A13] px-4 py-2.5 rounded-2xl border border-[rgba(34,197,94,0.2)] text-xs text-[#86EFAC] font-bold">
            <span>Chi tiết ngày: {selectedDayInfo.label} ({formatDateVN(selectedDayInfo.date)})</span>
            <span>{selectedDayInfo.isToday ? 'Hôm nay' : ''}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* School Session */}
            {(() => {
              const { dayEntries, dayEvents, dayTasks } = getItemsForDay(selectedDayOfWeek, selectedDayInfo.dateStr);
              return (
                <>
                  <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
                      <h2 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider flex items-center gap-1.5">
                        <School className="w-3.5 h-3.5 text-[#22C55E]" />
                        <span>Chính Khóa (Trường)</span>
                      </h2>
                      <div className="flex items-center gap-2">
                        {dayEntries.length > 0 && (
                          <button
                            onClick={() => handleDeleteEntriesByDay(selectedDayOfWeek, selectedDayInfo.label)}
                            className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                            title={`Xóa tất cả các tiết chính khóa của ${selectedDayInfo.label}`}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Xóa hết tiết ngày này</span>
                          </button>
                        )}
                        <span className="text-[10px] font-extrabold text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded-full border border-[#22C55E]/30">
                          {dayEntries.length} tiết
                        </span>
                      </div>
                    </div>

                    {dayEntries.length > 0 ? (
                      <div className="space-y-2.5">
                        {dayEntries.map((entry) => (
                          <div key={entry.id} className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-1 relative group">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#F3FAF5]">{entry.title}</span>
                              <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEditEntry(entry)} className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)]" title="Sửa tiết học">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button onClick={() => handleDeleteEntry(entry.id, entry.title)} className="p-1 text-[#A9B8AE] hover:text-rose-400 bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)]" title="Xóa tiết học này">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="text-[11px] text-[#A9B8AE] flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-[#22C55E]" />
                              <span>{entry.startLocalTime} – {entry.endLocalTime}</span>
                            </div>
                            {entry.location && (
                              <div className="text-[11px] text-[#86EFAC] flex items-center gap-1.5 pt-0.5">
                                <MapPin className="w-3 h-3 text-[#22C55E]" />
                                <span>{entry.location}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-[#A9B8AE] border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl">
                        Không có lịch chính khóa ngày này
                      </div>
                    )}
                  </div>

                  {/* Busy Events & Extra Classes */}
                  <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
                      <h2 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Học Thêm & Việc Bận</span>
                      </h2>
                      <span className="text-[10px] font-extrabold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/40">
                        {dayEvents.length} sự kiện
                      </span>
                    </div>

                    {dayEvents.length > 0 ? (
                      <div className="space-y-2.5">
                        {dayEvents.map((evt) => (
                          <div key={evt.id} className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-1 relative group">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#F3FAF5]">{evt.title}</span>
                              <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEditEvent(evt)} className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)]" title="Sửa lịch bận">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button onClick={() => handleDeleteBusyEvent(evt.id, evt.title)} className="p-1 text-[#A9B8AE] hover:text-rose-400 bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)]" title="Xóa lịch bận này">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-[#A9B8AE]">
                              <Clock className="w-3 h-3 text-[#22C55E]" />
                              <span>{formatTimeVN(evt.startsAt)} – {formatTimeVN(evt.endsAt)}</span>
                            </div>
                            {evt.recurrenceRule && (
                              <div className="text-[10px] text-[#86EFAC] font-semibold">
                                • Lặp: {evt.recurrenceRule.includes('WEEKLY') ? 'Hàng tuần' : 'Hàng ngày'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-[#A9B8AE] border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl">
                        Không có lịch bận hay học thêm
                      </div>
                    )}
                  </div>

                  {/* Tasks on this day */}
                  <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
                      <h2 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#22C55E]" />
                        <span>Tự Học & Bài Tập</span>
                      </h2>
                      <span className="text-[10px] font-extrabold text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded-full border border-[#22C55E]/30">
                        {dayTasks.length} nhiệm vụ
                      </span>
                    </div>

                    {dayTasks.length > 0 ? (
                      <div className="space-y-3">
                        {dayTasks.map((task) => (
                          <div key={task.id} className="p-3.5 rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[#101A13] hover:border-[#22C55E]/50 shadow-sm space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-bold text-xs text-[#F3FAF5]">{task.title}</div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleToggleLockTask(task.id)}
                                  className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)] cursor-pointer"
                                  title={task.locked ? 'Đã khóa lịch' : 'Cho phép tự động dời lịch'}
                                >
                                  {task.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-[#A9B8AE]" />}
                                </button>
                                <button
                                  onClick={() => handleUnscheduleTask(task.id, task.title)}
                                  className="p-1 text-[#A9B8AE] hover:text-rose-400 bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)] cursor-pointer"
                                  title="Hủy xếp lịch cho bài tập này (đưa về trạng thái tự do)"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-[#A9B8AE]">
                              <div className="flex items-center gap-1 text-[#86EFAC] font-semibold text-[11px]">
                                <Clock className="w-3 h-3 text-[#22C55E]" />
                                <span>{task.scheduledStartAt ? `${formatTimeVN(task.scheduledStartAt)} (${task.estimatedMinutes}p)` : 'Chưa xếp lịch'}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                task.status === 'completed'
                                  ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                                  : 'bg-[#050806] text-[#A9B8AE] border border-[rgba(34,197,94,0.15)]'
                              }`}>
                                {task.status === 'completed' ? 'Đã xong' : 'Chưa học'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-[#A9B8AE] border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl">
                        Không có nhiệm vụ tự học xếp trong ngày này
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        // WEEK VIEW: Full 7-column / 7-day Breakdown
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const { dayEntries, dayEvents, dayTasks } = getItemsForDay(day.dayOfWeek, day.dateStr);
            const isSelected = selectedDayOfWeek === day.dayOfWeek;

            return (
              <div
                key={day.dayOfWeek}
                onClick={() => setSelectedDayOfWeek(day.dayOfWeek)}
                className={`bg-[#0B120D] p-3.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer space-y-3 ${
                  isSelected
                    ? 'border-[#22C55E] shadow-lg shadow-[#16A34A]/10 bg-[#0E1711]'
                    : 'border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
                }`}
              >
                {/* Day Header */}
                <div className="pb-2 border-b border-[rgba(34,197,94,0.15)] flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black text-[#F3FAF5] truncate">{day.label}</span>
                    <span className="text-[10px] text-[#A9B8AE]">({day.date.getDate()}/{day.date.getMonth() + 1})</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {dayEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDeleteEntriesByDay(day.dayOfWeek, day.label);
                        }}
                        className="px-1.5 py-0.5 text-[10px] font-bold text-rose-400 hover:text-rose-200 bg-rose-950/60 hover:bg-rose-900/90 border border-rose-800/60 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                        title={`Xóa tất cả ${dayEntries.length} tiết chính khóa của ${day.label}`}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="hidden xl:inline">Xóa ngày</span>
                      </button>
                    )}
                    {day.isToday && (
                      <span className="text-[9px] font-extrabold bg-[#14532D] text-[#86EFAC] px-1.5 py-0.5 rounded border border-[#22C55E]/30">
                        Hôm nay
                      </span>
                    )}
                  </div>
                </div>

                {/* Day Content */}
                <div className="space-y-2 flex-1">
                  {/* School Entries */}
                  {dayEntries.map((e) => (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEditEntry(e);
                      }}
                      className="p-2.5 rounded-xl bg-[#101A13] hover:bg-[#142319] border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50 text-[11px] space-y-1 relative group cursor-pointer transition-all shadow-sm"
                      title="Bấm để chỉnh sửa hoặc xóa tiết học này"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-bold text-[#F3FAF5] truncate pr-1">{e.title}</div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEditEntry(e);
                            }}
                            className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)] transition-colors cursor-pointer"
                            title="Chỉnh sửa tiết học"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleDeleteEntry(e.id, e.title);
                            }}
                            className="p-1 text-rose-400 hover:text-rose-200 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/60 rounded-md transition-colors cursor-pointer"
                            title="Xóa tiết học này"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[#A9B8AE] text-[10px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#22C55E]" />
                        <span>{e.startLocalTime} – {e.endLocalTime}</span>
                      </div>
                      {e.location && (
                        <div className="text-[10px] text-[#86EFAC] truncate flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 text-[#22C55E]" />
                          <span>{e.location}</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Busy Events */}
                  {dayEvents.map((evt) => (
                    <div
                      key={evt.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEditEvent(evt);
                      }}
                      className="p-2.5 rounded-xl bg-amber-950/30 hover:bg-amber-950/50 border border-amber-800/40 hover:border-amber-700/60 text-[11px] space-y-1 relative group cursor-pointer transition-all shadow-sm"
                      title="Bấm để chỉnh sửa hoặc xóa lịch bận này"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-bold text-amber-200 truncate pr-1">{evt.title}</div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEditEvent(evt);
                            }}
                            className="p-1 text-amber-400 hover:text-amber-200 bg-[#050806] rounded-md border border-amber-900/40 transition-colors cursor-pointer"
                            title="Chỉnh sửa lịch bận"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleDeleteBusyEvent(evt.id, evt.title);
                            }}
                            className="p-1 text-rose-400 hover:text-rose-200 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/60 rounded-md transition-colors cursor-pointer"
                            title="Xóa lịch bận này"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="text-amber-400/80 text-[10px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>{formatTimeVN(evt.startsAt)} – {formatTimeVN(evt.endsAt)}</span>
                      </div>
                    </div>
                  ))}

                  {/* Tasks */}
                  {dayTasks.map((t) => (
                    <div key={t.id} className="p-2.5 rounded-xl bg-[#14532D]/30 border border-[#22C55E]/30 text-[11px] space-y-1 relative group shadow-sm">
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-bold text-[#86EFAC] truncate pr-1">{t.title}</div>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleUnscheduleTask(t.id, t.title);
                          }}
                          className="p-1 text-rose-400 hover:text-rose-200 bg-rose-950/60 hover:bg-rose-900/90 border border-rose-800/50 rounded-md transition-colors shrink-0 cursor-pointer"
                          title="Hủy xếp lịch tiết này (đưa về trạng thái tự do)"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-[#A9B8AE] text-[10px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#22C55E]" />
                        <span>{t.scheduledStartAt ? formatTimeVN(t.scheduledStartAt) : 'Chưa xếp lịch'} ({t.estimatedMinutes}p)</span>
                      </div>
                    </div>
                  ))}

                  {dayEntries.length === 0 && dayEvents.length === 0 && dayTasks.length === 0 && (
                    <div className="py-6 text-center text-[10px] text-[#A9B8AE]/60 italic">
                      Trống
                    </div>
                  )}
                </div>

                <div className="pt-2 text-center text-[10px] font-bold text-[#86EFAC] opacity-80 border-t border-[rgba(34,197,94,0.1)]">
                  {dayEntries.length + dayEvents.length + dayTasks.length} mục
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Thêm / Sửa Tiết Học Trường */}
      {isAddEntryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3FAF5]">
                {editingEntry ? 'Sửa tiết học trường' : 'Thêm tiết học chính khóa'}
              </h3>
              <button onClick={() => setIsAddEntryOpen(false)} className="text-[#A9B8AE] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#F3FAF5] mb-1">Tên môn / Tiết học:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Toán học - Đại số"
                  value={entryTitle}
                  onChange={(e) => setEntryTitle(e.target.value)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#F3FAF5] mb-1">Môn học liên kết:</label>
                <select
                  value={entrySubjectId}
                  onChange={(e) => setEntrySubjectId(e.target.value)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                >
                  <option value="">-- Chọn môn học --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Thứ:</label>
                  <select
                    value={entryDayOfWeek}
                    onChange={(e) => setEntryDayOfWeek(Number(e.target.value))}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                  >
                    <option value={1}>Thứ 2</option>
                    <option value={2}>Thứ 3</option>
                    <option value={3}>Thứ 4</option>
                    <option value={4}>Thứ 5</option>
                    <option value={5}>Thứ 6</option>
                    <option value={6}>Thứ 7</option>
                    <option value={7}>Chủ Nhật</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Bắt đầu:</label>
                  <input
                    type="time"
                    required
                    value={entryStartTime}
                    onChange={(e) => setEntryStartTime(e.target.value)}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Kết thúc:</label>
                  <input
                    type="time"
                    required
                    value={entryEndTime}
                    onChange={(e) => setEntryEndTime(e.target.value)}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#F3FAF5] mb-1">Phòng học / Địa điểm:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Phòng 9A2 - Dãy B"
                  value={entryLocation}
                  onChange={(e) => setEntryLocation(e.target.value)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Đi lại trước (phút):</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={entryCommuteBefore}
                    onChange={(e) => setEntryCommuteBefore(Number(e.target.value))}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Đi lại sau (phút):</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={entryCommuteAfter}
                    onChange={(e) => setEntryCommuteAfter(Number(e.target.value))}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[rgba(34,197,94,0.15)]">
                {editingEntry ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEntry(editingEntry.id, editingEntry.title)}
                    className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa tiết học này</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddEntryOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isFormSubmitting}
                    className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow cursor-pointer disabled:opacity-50"
                  >
                    {isFormSubmitting ? 'Đang lưu...' : editingEntry ? 'Lưu thay đổi' : 'Lưu tiết học'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Thêm / Sửa Lịch Bận / Học Thêm */}
      {isAddEventOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3FAF5]">
                {editingEvent ? 'Sửa lịch học thêm / việc bận' : 'Thêm lịch học thêm hoặc việc bận'}
              </h3>
              <button onClick={() => setIsAddEventOpen(false)} className="text-[#A9B8AE] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBusyEvent} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#F3FAF5] mb-1">Tên sự kiện / Buổi học:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Học thêm Toán Thầy Hùng"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Loại:</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="extra_class">Học thêm</option>
                    <option value="personal">Việc cá nhân</option>
                    <option value="commute">Di chuyển</option>
                    <option value="meal">Ăn uống</option>
                    <option value="sleep">Nghỉ ngơi</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Môn (nếu có):</label>
                  <select
                    value={eventSubjectId}
                    onChange={(e) => setEventSubjectId(e.target.value)}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="">-- Không chọn --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#F3FAF5] mb-1">Ngày diễn ra:</label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Bắt đầu:</label>
                  <input
                    type="time"
                    required
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Kết thúc:</label>
                  <input
                    type="time"
                    required
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#F3FAF5] mb-1">Quy tắc lặp lại:</label>
                <select
                  value={eventRecurrence}
                  onChange={(e) => setEventRecurrence(e.target.value as any)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                >
                  <option value="none">Không lặp (chỉ ngày này)</option>
                  <option value="weekly">Hàng tuần vào ngày này</option>
                  <option value="daily">Hàng ngày</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[rgba(34,197,94,0.15)]">
                {editingEvent ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteBusyEvent(editingEvent.id, editingEvent.title)}
                    className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa lịch bận này</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddEventOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isFormSubmitting}
                    className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow cursor-pointer disabled:opacity-50"
                  >
                    {isFormSubmitting ? 'Đang lưu...' : editingEvent ? 'Lưu thay đổi' : 'Lưu vào lịch'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
