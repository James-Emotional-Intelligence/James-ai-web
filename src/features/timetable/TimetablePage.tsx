import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ChevronDown,
  BookOpen,
  AlertTriangle,
  X,
  Trash2,
  Edit2,
  Calendar,
  School,
  CalendarPlus2,
  Download,
  Upload,
  Image as ImageIcon,
  Check,
  Layers,
  FileText,
  RotateCcw,
  Undo2,
  UserCheck,
  Car,
  CalendarOff,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import {
  TimetableEntry,
  BusyEvent,
  BusyEventException,
  StudyTask,
  ScheduleProposal,
  Subject,
  SchoolTimetable,
  LearningMaterial,
  TimetableEntryException,
} from '../../../shared/types';
import { doesEventOccurOnLocalDate } from '../../../shared/utils/recurrence-utils';
import { formatTimeVN, formatDateVN, formatDateShortVN, formatDateFullVN, formatBytes } from '../../lib/utils';
import { generateWeekOptions } from '../../lib/week-utils';
import { exportTimetableToPdf } from '../../lib/timetable-pdf-export';
import confetti from 'canvas-confetti';

export const getSubjectColorTheme = (title: string, subjectName?: string) => {
  const text = `${title} ${subjectName || ''}`.toLowerCase();
  if (text.includes('toán') || text.includes('đại số') || text.includes('hình học') || text.includes('math')) {
    return {
      bg: 'bg-emerald-950/70 hover:bg-emerald-900/80',
      border: 'border-emerald-700/60 hover:border-emerald-500',
      text: 'text-emerald-200',
      badge: 'bg-emerald-800/80 text-emerald-200 border-emerald-500/50',
      accent: '#10B981',
    };
  }
  if (text.includes('văn') || text.includes('tiếng việt') || text.includes('ngữ văn') || text.includes('literature')) {
    return {
      bg: 'bg-amber-950/70 hover:bg-amber-900/80',
      border: 'border-amber-700/60 hover:border-amber-500',
      text: 'text-amber-200',
      badge: 'bg-amber-800/80 text-amber-200 border-amber-500/50',
      accent: '#F59E0B',
    };
  }
  if (text.includes('anh') || text.includes('ngoại ngữ') || text.includes('english')) {
    return {
      bg: 'bg-violet-950/70 hover:bg-violet-900/80',
      border: 'border-violet-700/60 hover:border-violet-500',
      text: 'text-violet-200',
      badge: 'bg-violet-800/80 text-violet-200 border-violet-500/50',
      accent: '#8B5CF6',
    };
  }
  if (text.includes('lý') || text.includes('vật lý') || text.includes('physics')) {
    return {
      bg: 'bg-cyan-950/70 hover:bg-cyan-900/80',
      border: 'border-cyan-700/60 hover:border-cyan-500',
      text: 'text-cyan-200',
      badge: 'bg-cyan-800/80 text-cyan-200 border-cyan-500/50',
      accent: '#06B6D4',
    };
  }
  if (text.includes('hóa') || text.includes('chemistry')) {
    return {
      bg: 'bg-rose-950/70 hover:bg-rose-900/80',
      border: 'border-rose-700/60 hover:border-rose-500',
      text: 'text-rose-200',
      badge: 'bg-rose-800/80 text-rose-200 border-rose-500/50',
      accent: '#F43F5E',
    };
  }
  if (text.includes('sinh') || text.includes('biology')) {
    return {
      bg: 'bg-lime-950/70 hover:bg-lime-900/80',
      border: 'border-lime-700/60 hover:border-lime-500',
      text: 'text-lime-200',
      badge: 'bg-lime-800/80 text-lime-200 border-lime-500/50',
      accent: '#84CC16',
    };
  }
  if (text.includes('sử') || text.includes('lịch sử') || text.includes('history')) {
    return {
      bg: 'bg-orange-950/70 hover:bg-orange-900/80',
      border: 'border-orange-700/60 hover:border-orange-500',
      text: 'text-orange-200',
      badge: 'bg-orange-800/80 text-orange-200 border-orange-500/50',
      accent: '#F97316',
    };
  }
  if (text.includes('địa') || text.includes('địa lý') || text.includes('geography')) {
    return {
      bg: 'bg-teal-950/70 hover:bg-teal-900/80',
      border: 'border-teal-700/60 hover:border-teal-500',
      text: 'text-teal-200',
      badge: 'bg-teal-800/80 text-teal-200 border-teal-500/50',
      accent: '#14B8A6',
    };
  }
  if (text.includes('tin') || text.includes('tin học') || text.includes('công nghệ')) {
    return {
      bg: 'bg-sky-950/70 hover:bg-sky-900/80',
      border: 'border-sky-700/60 hover:border-sky-500',
      text: 'text-sky-200',
      badge: 'bg-sky-800/80 text-sky-200 border-sky-500/50',
      accent: '#0EA5E9',
    };
  }
  if (text.includes('thể dục') || text.includes('gdtc') || text.includes('thể thao')) {
    return {
      bg: 'bg-emerald-950/70 hover:bg-emerald-900/80',
      border: 'border-emerald-600/60 hover:border-emerald-400',
      text: 'text-emerald-200',
      badge: 'bg-emerald-800/80 text-emerald-200 border-emerald-500/50',
      accent: '#10B981',
    };
  }
  if (text.includes('nhạc') || text.includes('mỹ thuật') || text.includes('họa')) {
    return {
      bg: 'bg-fuchsia-950/70 hover:bg-fuchsia-900/80',
      border: 'border-fuchsia-700/60 hover:border-fuchsia-500',
      text: 'text-fuchsia-200',
      badge: 'bg-fuchsia-800/80 text-fuchsia-200 border-fuchsia-500/50',
      accent: '#D946EF',
    };
  }
  return {
    bg: 'bg-[#101A13] hover:bg-[#142319]',
    border: 'border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50',
    text: 'text-[#F3FAF5]',
    badge: 'bg-[#14532D] text-[#86EFAC] border-[#22C55E]/30',
    accent: '#22C55E',
  };
};

export const TimetablePage: React.FC = () => {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'timetable' | 'schedule'>('timetable');
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0); // 0 = current week, -1 = last week, +1 = next week
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(1); // 1 = Monday ... 7 = Sunday

  // Data State
  const [activeTimetable, setActiveTimetable] = useState<SchoolTimetable | null>(null);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [busyEvents, setBusyEvents] = useState<BusyEvent[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReplanning, setIsReplanning] = useState(false);
  const [isConfirmingProposal, setIsConfirmingProposal] = useState(false);
  const [proposalDiff, setProposalDiff] = useState<ScheduleProposal | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Modals
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BusyEvent | null>(null);

  // Undo Replan State
  const [lastTaskSnapshot, setLastTaskSnapshot] = useState<StudyTask[] | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  // Form States - Timetable Entry (Thời khóa biểu trường)
  const [entryTitle, setEntryTitle] = useState('');
  const [entryTeacher, setEntryTeacher] = useState('');
  const [entrySubjectId, setEntrySubjectId] = useState('');
  const [entryDayOfWeek, setEntryDayOfWeek] = useState(1);
  const [entryStartTime, setEntryStartTime] = useState('07:30');
  const [entryEndTime, setEntryEndTime] = useState('11:45');
  const [entryLocation, setEntryLocation] = useState('');
  const [entryCommuteBefore, setEntryCommuteBefore] = useState(15);
  const [entryCommuteAfter, setEntryCommuteAfter] = useState(15);

  // Form States - Busy Event & Extra Classes (Lịch học thêm, CLB, Việc bận)
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<'extra_class' | 'club' | 'personal' | 'commute' | 'meal' | 'sleep'>('extra_class');
  const [eventLocation, setEventLocation] = useState('');
  const [eventCommuteBefore, setEventCommuteBefore] = useState(0);
  const [eventCommuteAfter, setEventCommuteAfter] = useState(0);
  const [eventIsFixed, setEventIsFixed] = useState(true);
  const [eventDate, setEventDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('17:30');
  const [eventEndTime, setEventEndTime] = useState('19:00');
  const [eventRecurrence, setEventRecurrence] = useState<
    'none' | 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'biweekly' | 'monthly' | 'custom_days'
  >('none');
  const [customDays, setCustomDays] = useState<number[]>([1, 3, 5]);
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [eventSubjectId, setEventSubjectId] = useState('');
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  // Timetable Entry Exceptions (Nghỉ tuần này - Bảng 1)
  const [exceptions, setExceptions] = useState<TimetableEntryException[]>([]);
  const [skipModal, setSkipModal] = useState<{
    isOpen: boolean;
    entry: TimetableEntry | null;
    dayLabel: string;
    dateStr: string;
    formattedDate: string;
    timeRange: string;
    reason: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    entry: null,
    dayLabel: '',
    dateStr: '',
    formattedDate: '',
    timeRange: '',
    reason: '',
    isSubmitting: false,
  });

  // Busy Event Exceptions (Nghỉ tạm lần này - Bảng 2)
  const [busyExceptions, setBusyExceptions] = useState<BusyEventException[]>([]);
  const [skipBusyModal, setSkipBusyModal] = useState<{
    isOpen: boolean;
    event: BusyEvent | null;
    dayLabel: string;
    dateStr: string;
    formattedDate: string;
    timeRange: string;
    reason: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    event: null,
    dayLabel: '',
    dateStr: '',
    formattedDate: '',
    timeRange: '',
    reason: '',
    isSubmitting: false,
  });

  // OCR Timetable Import Modal States
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [ocrStep, setOcrStep] = useState<'upload' | 'analyzing' | 'preview'>('upload');
  const [ocrSourceTab, setOcrSourceTab] = useState<'upload' | 'materials'>('upload');
  const [ocrSaveToLibrary, setOcrSaveToLibrary] = useState(true);
  const [ocrMaterialTitle, setOcrMaterialTitle] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [ocrBase64, setOcrBase64] = useState<string | null>(null);
  const [ocrMimeType, setOcrMimeType] = useState<string>('image/jpeg');
  const [ocrTimetableName, setOcrTimetableName] = useState('1. THỜI KHÓA BIỂU (TRƯỜNG HỌC)');
  const [ocrReplaceExisting, setOcrReplaceExisting] = useState(true);
  const [ocrExtractedEntries, setOcrExtractedEntries] = useState<
    Array<{
      id: string;
      dayOfWeek: number;
      title: string;
      startLocalTime: string;
      endLocalTime: string;
      room?: string;
      teacher?: string;
    }>
  >([]);
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null);
  const [isOcrSaving, setIsOcrSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Week switch modal for School Timetable (Bảng 1)
  const [isWeekSwitchModalOpen, setIsWeekSwitchModalOpen] = useState(false);
  const [targetWeekOffset, setTargetWeekOffset] = useState<number | null>(null);

  // List of weeks for dropdown selector (ISO-8601 standardized)
  const weekOptions = useMemo(() => {
    return generateWeekOptions(new Date(), -4, 16);
  }, []);

  const targetWeekDays = useMemo(() => {
    if (targetWeekOffset === null) return null;
    const today = new Date();
    const currentJsDay = today.getDay();
    const mondayOffset = currentJsDay === 0 ? -6 : 1 - currentJsDay;
    const baseMonday = new Date(today);
    baseMonday.setDate(today.getDate() + mondayOffset + targetWeekOffset * 7);
    baseMonday.setHours(0, 0, 0, 0);
    const endSunday = new Date(baseMonday);
    endSunday.setDate(baseMonday.getDate() + 6);
    return { start: baseMonday, end: endSunday };
  }, [targetWeekOffset]);

  const handleRequestChangeWeek = (newOffset: number) => {
    if (newOffset === currentWeekOffset) return;
    if (timetableEntries.length > 0) {
      setTargetWeekOffset(newOffset);
      setIsWeekSwitchModalOpen(true);
    } else {
      setCurrentWeekOffset(newOffset);
    }
  };

  const handleConfirmKeepOldTimetable = () => {
    if (targetWeekOffset !== null) {
      setCurrentWeekOffset(targetWeekOffset);
    }
    setIsWeekSwitchModalOpen(false);
    setTargetWeekOffset(null);
  };

  const handleConfirmResetAndInputNew = async () => {
    const nextOffset = targetWeekOffset !== null ? targetWeekOffset : currentWeekOffset + 1;
    setIsWeekSwitchModalOpen(false);
    setTargetWeekOffset(null);
    try {
      await api.deleteAllTimetableEntries(activeTimetable?.id);
      setCurrentWeekOffset(nextOffset);
      await fetchData();
      setIsOcrModalOpen(true);
      setOcrStep('upload');
      setOcrFile(null);
      setOcrPreviewUrl(null);
      setOcrBase64(null);
      setOcrExtractedEntries([]);
      setOcrErrorMessage(null);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xóa thời khóa biểu cũ');
    }
  };

  // Fetch all timetable, task, and subject data
  const fetchData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const startRange = weekDays[0].date.toISOString();
      const endRange = new Date(weekDays[6].date.getTime() + 86400000 - 1).toISOString();

      const [ttData, taskData, subData, matData] = await Promise.all([
        api.getTimetable({ from: startRange, to: endRange }),
        api.getTasks(),
        api.getSubjects(),
        api.getMaterials().catch(() => ({ materials: [] })),
      ]);

      setActiveTimetable(ttData.activeTimetable || null);
      setTimetableEntries(ttData.entries || []);
      setBusyEvents(ttData.busyEvents || []);
      setExceptions(ttData.exceptions || []);
      setBusyExceptions(ttData.busyExceptions || []);
      setTasks(taskData.tasks || []);
      setSubjects(subData.subjects || []);
      setMaterials(matData.materials || []);
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
      setLastTaskSnapshot([...tasks]);
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

  const handleUndoReplan = async () => {
    if (!lastTaskSnapshot) return;
    if (!confirm('Bạn có muốn hoàn tác lịch tự học về trạng thái trước khi tự động xếp?')) return;
    setIsUndoing(true);
    try {
      for (const t of lastTaskSnapshot) {
        await api.updateTask(t.id, {
          scheduledStartAt: t.scheduledStartAt || null,
          scheduledEndAt: t.scheduledEndAt || null,
          locked: t.locked,
        });
      }
      setLastTaskSnapshot(null);
      await fetchData();
      alert('Đã hoàn tác thành công về lịch trước đó!');
    } catch (err: any) {
      alert(err.message || 'Không thể hoàn tác lịch');
    } finally {
      setIsUndoing(false);
    }
  };

  // Missed / Overdue tasks detector
  const missedTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter((t) => {
      if (!t.scheduledStartAt || t.status === 'completed') return false;
      const end = t.scheduledEndAt
        ? new Date(t.scheduledEndAt)
        : new Date(new Date(t.scheduledStartAt).getTime() + (t.estimatedMinutes || 45) * 60000);
      return end < now;
    });
  }, [tasks]);

  // Timetable Entry CRUD Submit
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTitle.trim()) return;

    // Check period overlap conflict on the same day
    const conflictingEntry = timetableEntries.find((item) => {
      if (editingEntry && item.id === editingEntry.id) return false;
      if (item.dayOfWeek !== entryDayOfWeek) return false;
      return (
        (entryStartTime >= item.startLocalTime && entryStartTime < item.endLocalTime) ||
        (entryEndTime > item.startLocalTime && entryEndTime <= item.endLocalTime) ||
        (entryStartTime <= item.startLocalTime && entryEndTime >= item.endLocalTime)
      );
    });

    if (conflictingEntry) {
      alert(`⚠️ Trùng giờ tiết học: Đã có tiết "${conflictingEntry.title}" (${conflictingEntry.startLocalTime} – ${conflictingEntry.endLocalTime}) vào ngày này. Vui lòng điều chỉnh lại giờ học!`);
      return;
    }

    setIsFormSubmitting(true);
    try {
      if (editingEntry) {
        await api.updateTimetableEntry(editingEntry.id, {
          title: entryTitle.trim(),
          teacher: entryTeacher.trim() || undefined,
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
          timetableId: activeTimetable?.id,
          title: entryTitle.trim(),
          teacher: entryTeacher.trim() || undefined,
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

  // Timetable Entry Skip This Week (Nghỉ tuần này)
  const isEntrySkipped = (entryId: string, dateStr: string) => {
    return exceptions.some((exc) => exc.timetableEntryId === entryId && exc.occurrenceDate === dateStr);
  };

  const handleOpenSkipModal = (
    entry: TimetableEntry,
    dayInfo: { label: string; dateStr: string; date: Date }
  ) => {
    const formatted = formatDateVN(dayInfo.date);
    setSkipModal({
      isOpen: true,
      entry,
      dayLabel: dayInfo.label,
      dateStr: dayInfo.dateStr,
      formattedDate: formatted,
      timeRange: `${entry.startLocalTime} – ${entry.endLocalTime}`,
      reason: '',
      isSubmitting: false,
    });
  };

  const handleConfirmSkip = async () => {
    if (!skipModal.entry || !skipModal.dateStr) return;
    setSkipModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const res = await api.skipTimetableEntryThisWeek(
        skipModal.entry.id,
        skipModal.dateStr,
        skipModal.reason.trim() || undefined
      );
      setExceptions((prev) => {
        const filtered = prev.filter(
          (e) => !(e.timetableEntryId === skipModal.entry!.id && e.occurrenceDate === skipModal.dateStr)
        );
        return [...filtered, res.exception];
      });
      setSkipModal((prev) => ({ ...prev, isOpen: false }));
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể đánh dấu nghỉ tiết học này');
    } finally {
      setSkipModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleUndoSkip = async (entry: TimetableEntry, dateStr: string) => {
    try {
      await api.undoSkipTimetableEntry(entry.id, dateStr);
      setExceptions((prev) =>
        prev.filter((e) => !(e.timetableEntryId === entry.id && e.occurrenceDate === dateStr))
      );
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể hoàn tác trạng thái nghỉ học');
    }
  };

  // Busy Event Skip This Week (Nghỉ tạm lần này - Thời gian biểu)
  const isBusyEventSkipped = (busyEventId: string, dateStr: string) => {
    return busyExceptions.some((exc) => exc.busyEventId === busyEventId && exc.occurrenceDate === dateStr);
  };

  const handleOpenSkipBusyModal = (
    event: BusyEvent,
    dayInfo: { label: string; dateStr: string; date: Date }
  ) => {
    const formatted = formatDateVN(dayInfo.date);
    const timeRange = event.startsAt && event.endsAt
      ? `${formatTimeVN(new Date(event.startsAt))} – ${formatTimeVN(new Date(event.endsAt))}`
      : 'Cả ngày';

    setSkipBusyModal({
      isOpen: true,
      event,
      dayLabel: dayInfo.label,
      dateStr: dayInfo.dateStr,
      formattedDate: formatted,
      timeRange,
      reason: '',
      isSubmitting: false,
    });
  };

  const handleConfirmSkipBusy = async () => {
    if (!skipBusyModal.event || !skipBusyModal.dateStr) return;
    setSkipBusyModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const res = await api.skipBusyEventThisWeek(
        skipBusyModal.event.id,
        skipBusyModal.dateStr,
        skipBusyModal.reason.trim() || undefined
      );
      setBusyExceptions((prev) => {
        const filtered = prev.filter(
          (e) => !(e.busyEventId === skipBusyModal.event!.id && e.occurrenceDate === skipBusyModal.dateStr)
        );
        return [...filtered, res.exception];
      });
      setSkipBusyModal((prev) => ({ ...prev, isOpen: false }));
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể đánh dấu nghỉ sự kiện này');
    } finally {
      setSkipBusyModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleUndoSkipBusy = async (event: BusyEvent, dateStr: string) => {
    try {
      await api.undoSkipBusyEvent(event.id, dateStr);
      setBusyExceptions((prev) =>
        prev.filter((e) => !(e.busyEventId === event.id && e.occurrenceDate === dateStr))
      );
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Không thể hoàn tác trạng thái nghỉ sự kiện');
    }
  };

  // Busy Event CRUD Submit with Expanded Recurrence
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

    // Check conflict between busy event and school periods on this day
    const eventDayOfWeek = start.getDay() === 0 ? 7 : start.getDay();
    const timeStrStart = `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;
    const timeStrEnd = `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;

    const schoolConflict = timetableEntries.find((tt) => {
      if (tt.dayOfWeek !== eventDayOfWeek) return false;
      return (
        (timeStrStart >= tt.startLocalTime && timeStrStart < tt.endLocalTime) ||
        (timeStrEnd > tt.startLocalTime && timeStrEnd <= tt.endLocalTime) ||
        (timeStrStart <= tt.startLocalTime && timeStrEnd >= tt.endLocalTime)
      );
    });

    if (schoolConflict) {
      if (!confirm(`⚠️ Cảnh báo xung đột: Khung giờ này (${timeStrStart} – ${timeStrEnd}) trùng với tiết học chính khóa "${schoolConflict.title}" (${schoolConflict.startLocalTime} – ${schoolConflict.endLocalTime}) trên trường. Bạn vẫn muốn lưu sự kiện này?`)) {
        return;
      }
    }

    const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const jsDayMap: Record<number, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };

    let recurrenceRule: string | undefined = undefined;
    if (eventRecurrence === 'daily') {
      recurrenceRule = 'FREQ=DAILY';
    } else if (eventRecurrence === 'weekdays') {
      recurrenceRule = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    } else if (eventRecurrence === 'weekends') {
      recurrenceRule = 'FREQ=WEEKLY;BYDAY=SA,SU';
    } else if (eventRecurrence === 'weekly') {
      const dayCode = dayMap[start.getDay()];
      recurrenceRule = `FREQ=WEEKLY;BYDAY=${dayCode}`;
    } else if (eventRecurrence === 'biweekly') {
      const dayCode = dayMap[start.getDay()];
      recurrenceRule = `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dayCode}`;
    } else if (eventRecurrence === 'monthly') {
      recurrenceRule = `FREQ=MONTHLY;BYMONTHDAY=${start.getDate()}`;
    } else if (eventRecurrence === 'custom_days') {
      const dayCodes = (customDays.length > 0 ? customDays : [1]).sort().map((d) => jsDayMap[d]).join(',');
      recurrenceRule = `FREQ=WEEKLY;BYDAY=${dayCodes}`;
    }

    if (recurrenceRule && recurrenceUntil) {
      recurrenceRule += `;UNTIL=${recurrenceUntil.replace(/-/g, '')}T235959Z`;
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
          isFixed: eventIsFixed,
          location: eventLocation.trim() || undefined,
          commuteBeforeMinutes: eventCommuteBefore,
          commuteAfterMinutes: eventCommuteAfter,
          subjectId: eventSubjectId || undefined,
        });
      } else {
        await api.addBusyEvent({
          title: eventTitle.trim(),
          type: eventType,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          recurrenceRule,
          isFixed: eventIsFixed,
          location: eventLocation.trim() || undefined,
          commuteBeforeMinutes: eventCommuteBefore,
          commuteAfterMinutes: eventCommuteAfter,
          timezone: 'Asia/Ho_Chi_Minh',
          subjectId: eventSubjectId || undefined,
        });
      }
      setIsAddEventOpen(false);
      setEditingEvent(null);
      setEventTitle('');
      setEventLocation('');
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

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      await exportTimetableToPdf({
        timetableName: activeTimetable?.name || '1. THỜI KHÓA BIỂU (TRƯỜNG HỌC)',
        weekDays,
        timetableEntries,
        busyEvents,
      });
    } catch (err: any) {
      alert(err.message || 'Không thể xuất thời khóa biểu dưới dạng PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // OCR Timetable Import Handlers
  const handleOcrFileSelect = (file: File) => {
    setOcrErrorMessage(null);

    const MAX_OCR_SIZE = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_OCR_SIZE) {
      setOcrErrorMessage(`Dung lượng tệp (${formatBytes(file.size)}) vượt quá giới hạn tối đa 25MB.`);
      return;
    }

    const mime = file.type || 'image/jpeg';
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isImageOrPdf =
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      ['.png', '.jpg', '.jpeg', '.webp', '.pdf'].includes(ext);

    if (!isImageOrPdf) {
      setOcrErrorMessage('Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh PNG, JPG, WEBP hoặc tệp PDF.');
      return;
    }

    setOcrFile(file);
    setOcrMimeType(mime);
    if (!ocrMaterialTitle) {
      setOcrMaterialTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      setOcrPreviewUrl(res);
      setOcrBase64(res);
    };
    reader.readAsDataURL(file);
  };

  const handleRunOcrAnalysis = async () => {
    if (!ocrBase64) {
      setOcrErrorMessage('Vui lòng chọn hoặc kéo thả hình ảnh thời khóa biểu.');
      return;
    }
    setOcrStep('analyzing');
    setOcrErrorMessage(null);
    try {
      // If user enabled saving to Materials Library and uploaded a file
      if (ocrSourceTab === 'upload' && ocrSaveToLibrary && ocrFile) {
        try {
          const title = ocrMaterialTitle.trim() || ocrFile.name.replace(/\.[^/.]+$/, '');
          const subjId = subjects[0]?.id || '';
          const intent = await api.createMaterialUploadIntent({
            title,
            subjectId: subjId,
            fileName: ocrFile.name,
            mimeType: ocrMimeType,
            sizeBytes: ocrFile.size,
          });
          await api.uploadMaterialDirect(intent.r2ObjectKey, ocrFile, ocrMimeType);
          await api.finalizeMaterialUpload(intent.material.id, { sizeBytes: ocrFile.size });
        } catch (saveMatErr) {
          console.warn('Failed to save timetable image to materials library:', saveMatErr);
        }
      }

      const res = await api.importTimetableOcr(ocrBase64, ocrMimeType);
      if (res.timetableName) {
        setOcrTimetableName(res.timetableName);
      }
      const entriesWithId = (res.entries || []).map((e, idx) => ({
        id: 'ocr_' + idx + '_' + Math.random().toString(36).substring(2, 7),
        dayOfWeek: e.dayOfWeek,
        title: e.title,
        startLocalTime: e.startLocalTime,
        endLocalTime: e.endLocalTime,
        room: e.room,
        teacher: e.teacher,
      }));
      setOcrExtractedEntries(entriesWithId);
      setOcrStep('preview');
    } catch (err: any) {
      setOcrErrorMessage(err.message || 'Không thể nhận dạng thời khóa biểu từ ảnh.');
      setOcrStep('upload');
    }
  };

  const handleConfirmOcrSave = async () => {
    if (ocrExtractedEntries.length === 0) {
      alert('Không có tiết học nào để lưu.');
      return;
    }
    setIsOcrSaving(true);
    try {
      await api.confirmTimetableOcr({
        timetableName: ocrTimetableName.trim() || 'Thời khóa biểu chính khóa',
        replaceExisting: ocrReplaceExisting,
        entries: ocrExtractedEntries.map((e) => ({
          dayOfWeek: e.dayOfWeek,
          title: e.title,
          startLocalTime: e.startLocalTime,
          endLocalTime: e.endLocalTime,
          room: e.room,
          teacher: e.teacher,
        })),
      });
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.5 } });
      setIsOcrModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu thời khóa biểu.');
    } finally {
      setIsOcrSaving(false);
    }
  };

  const openEditEntry = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setEntryTitle(entry.title);
    setEntryTeacher(entry.teacher || '');
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
    setEventType((evt.type as any) || 'extra_class');
    setEventLocation(evt.location || '');
    setEventCommuteBefore(evt.commuteBeforeMinutes ?? 0);
    setEventCommuteAfter(evt.commuteAfterMinutes ?? 0);
    setEventIsFixed(evt.isFixed ?? true);
    const start = new Date(evt.startsAt);
    setEventDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`);
    setEventStartTime(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
    const end = new Date(evt.endsAt);
    setEventEndTime(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`);
    
    if (evt.recurrenceRule) {
      const rule = evt.recurrenceRule;
      if (rule.includes('FREQ=DAILY')) {
        setEventRecurrence('daily');
      } else if (rule.includes('BYDAY=MO,TU,WE,TH,FR')) {
        setEventRecurrence('weekdays');
      } else if (rule.includes('BYDAY=SA,SU')) {
        setEventRecurrence('weekends');
      } else if (rule.includes('INTERVAL=2')) {
        setEventRecurrence('biweekly');
      } else if (rule.includes('FREQ=MONTHLY')) {
        setEventRecurrence('monthly');
      } else if (rule.includes('FREQ=WEEKLY')) {
        const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/);
        if (byDayMatch && byDayMatch[1].includes(',')) {
          setEventRecurrence('custom_days');
          const revMap: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
          const parsed = byDayMatch[1].split(',').map((c) => revMap[c]).filter(Boolean);
          setCustomDays(parsed.length > 0 ? parsed : [1]);
        } else {
          setEventRecurrence('weekly');
        }
      }

      const untilMatch = rule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
      if (untilMatch) {
        setRecurrenceUntil(`${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`);
      } else {
        setRecurrenceUntil('');
      }
    } else {
      setEventRecurrence('none');
      setRecurrenceUntil('');
    }

    setEventSubjectId(evt.subjectId || '');
    setIsAddEventOpen(true);
  };

  // Filter items for a specific day with rich recurrence engine
  const getItemsForDay = (dayOfWeek: number, dateStr: string) => {
    const dayEntries = timetableEntries.filter((e) => e.dayOfWeek === dayOfWeek);
    const dayEvents = busyEvents.filter((b) => doesEventOccurOnLocalDate(b, dateStr, 'Asia/Ho_Chi_Minh'));
    const dayTasks = tasks.filter((t) => {
      if (!t.scheduledStartAt) return false;
      const taskDate = formatDateVN(new Date(t.scheduledStartAt));
      return taskDate === dateStr;
    });

    return { dayEntries, dayEvents, dayTasks };
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Main Navigation: Tách biệt rõ ràng 2 Bảng */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0B120D] p-3 sm:p-4 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center font-black shrink-0 border border-[#22C55E]/40 shadow-inner">
            <CalendarDays className="w-5 h-5 text-[#22C55E]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-[#F3FAF5] flex items-center gap-2">
              <span>Lịch Học & Kế Hoạch Cá Nhân</span>
            </h1>
          </div>
        </div>

        {/* 2 Tabs Chuyển Đổi Nổi Bật & Rõ Ràng */}
        <div className="flex items-center p-1.5 bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-2xl gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('timetable')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'timetable'
                ? 'bg-gradient-to-r from-[#16A34A] to-[#22C55E] text-[#050806] shadow-md shadow-[#16A34A]/30 ring-1 ring-[#86EFAC]'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            <School className="w-4 h-4" />
            <span>1. THỜI KHÓA BIỂU (TRƯỜNG HỌC)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#050806]/30 font-extrabold">
              {timetableEntries.length} tiết
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeTab === 'schedule'
                ? 'bg-gradient-to-r from-[#16A34A] to-[#22C55E] text-[#050806] shadow-md shadow-[#16A34A]/30 ring-1 ring-[#86EFAC]'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>2. THỜI GIAN BIỂU (SINH HOẠT & TỰ HỌC)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#050806]/30 font-extrabold">
              {busyEvents.length + tasks.length} mục
            </span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={fetchData} className="underline font-bold hover:text-white cursor-pointer ml-3">
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
                  <span className="truncate pr-2">{item.title}</span>
                  <span className="text-[10px] font-bold text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded border border-[#22C55E]/30 shrink-0">
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
                <div key={i} className="text-[11px] text-[#A9B8AE] pl-5">
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
              <span>{isConfirmingProposal ? 'Đang cập nhật...' : 'Xác nhận cập nhật lịch'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BẢNG 1: THỜI KHÓA BIỂU (CHÍNH KHÓA TRƯỜNG HỌC) */}
      {/* ========================================================================= */}
      {activeTab === 'timetable' && (
        <div className="space-y-6">
          {/* Subheader & Timetable Action Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.22)] shadow-xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className="flex items-center gap-2 shrink-0 bg-[#101A13] hover:bg-[#14532D] active:scale-95 border border-[rgba(34,197,94,0.3)] hover:border-[#22C55E]/60 rounded-xl px-3.5 py-2 shadow-md text-xs font-black text-[#86EFAC] transition-all cursor-pointer group"
                title="Bấm để chuyển sang Bảng 2: Thời gian biểu sinh hoạt & tự học"
              >
                <Layers className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Bảng 2</span>
                <div className="flex items-center text-[#86EFAC] bg-[#0B120D] px-1.5 py-0.5 rounded-md border border-[rgba(34,197,94,0.2)] group-hover:border-[#22C55E]/50 group-hover:text-white transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>

              <div className="h-5 w-px bg-[rgba(34,197,94,0.2)] shrink-0 hidden sm:block" />

              <h2 className="text-base font-black text-[#F3FAF5] flex items-center gap-2">
                <School className="w-4 h-4 text-[#22C55E]" />
                <span>
                  {activeTimetable?.name &&
                  activeTimetable.name !== 'Thời khóa biểu trường' &&
                  activeTimetable.name !== 'THỜI KHÓA BIỂU (TRƯỜNG HỌC)'
                    ? activeTimetable.name
                    : '1. THỜI KHÓA BIỂU (TRƯỜNG HỌC)'}
                </span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Week Navigator for School Timetable */}
              <div className="flex items-center bg-[#101A13] p-1 rounded-xl border border-[rgba(34,197,94,0.22)] text-xs text-[#F3FAF5]">
                <button
                  type="button"
                  onClick={() => handleRequestChangeWeek(currentWeekOffset - 1)}
                  className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] hover:bg-[#142319] rounded cursor-pointer transition-colors"
                  title="Tuần trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="relative flex items-center px-1">
                  <Calendar className="w-3.5 h-3.5 text-[#22C55E] mr-1.5 shrink-0 pointer-events-none" />
                  <select
                    value={currentWeekOffset}
                    onChange={(e) => handleRequestChangeWeek(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-[#86EFAC] focus:outline-none cursor-pointer pr-1 [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                  >
                    {weekOptions.map((opt) => (
                      <option key={opt.offset} value={opt.offset}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleRequestChangeWeek(currentWeekOffset + 1)}
                  className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] hover:bg-[#142319] rounded cursor-pointer transition-colors"
                  title="Tuần tiếp theo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {currentWeekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => handleRequestChangeWeek(0)}
                    className="ml-1 px-2 py-0.5 bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-[10px] font-bold rounded cursor-pointer border border-[#22C55E]/30 transition-all"
                  >
                    Tuần hiện tại
                  </button>
                )}
              </div>

              {/* View Toggle */}
              <div className="flex items-center bg-[#101A13] p-1 rounded-xl border border-[rgba(34,197,94,0.18)]">
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'week' ? 'bg-[#16A34A] text-[#050806] shadow-sm' : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                  }`}
                >
                  Tuần
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'day' ? 'bg-[#16A34A] text-[#050806] shadow-sm' : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                  }`}
                >
                  Ngày
                </button>
              </div>

              {/* Action Buttons for Timetable */}
              <button
                type="button"
                onClick={() => {
                  setIsOcrModalOpen(true);
                  setOcrStep('upload');
                  setOcrFile(null);
                  setOcrPreviewUrl(null);
                  setOcrBase64(null);
                  setOcrExtractedEntries([]);
                  setOcrErrorMessage(null);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#14532D] to-[#166534] hover:from-[#16A34A] hover:to-[#15803D] text-[#86EFAC] hover:text-white border border-[#22C55E]/40 text-xs font-bold transition-all cursor-pointer shadow-md shadow-[#16A34A]/20"
                title="Tự động nhận dạng và nhập thời khóa biểu từ hình ảnh hoặc PDF qua AI"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Nhập TKB bằng ảnh</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingEntry(null);
                  setEntryTitle('');
                  setEntrySubjectId(subjects[0]?.id || '');
                  setEntryLocation('');
                  setIsAddEntryOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer"
                aria-label="Thêm tiết học mới"
                title="Thêm tiết học mới"
              >
                <CalendarPlus2 className="w-3.5 h-3.5" />
                <span>Thêm tiết học</span>
              </button>

              {timetableEntries.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isDownloadingPdf}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    title="Tải xuống hoặc in thời khóa biểu dưới dạng tệp PDF"
                  >
                    <Download className={`w-3.5 h-3.5 text-[#22C55E] ${isDownloadingPdf ? 'animate-bounce' : ''}`} />
                    <span className="hidden sm:inline">{isDownloadingPdf ? 'Đang tạo PDF...' : 'Tải PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteAllEntries}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-bold transition-colors cursor-pointer"
                    title="Xóa toàn bộ các tiết học trong thời khóa biểu để nhập lại mới"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span className="hidden sm:inline">Làm mới TKB</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Day Selector Tabs for Timetable */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const count = timetableEntries.filter((e) => e.dayOfWeek === d.dayOfWeek).length;
              return (
                <button
                  key={d.dayOfWeek}
                  type="button"
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
                  <div className="text-[10px] font-bold mt-1 opacity-90">
                    {count > 0 ? `${count} tiết` : 'Nghỉ'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Timetable Content Body */}
          {isLoading ? (
            <div className="p-12 text-center text-xs text-[#A9B8AE] flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
              <span>Đang tải thời khóa biểu từ hệ thống...</span>
            </div>
          ) : viewMode === 'day' ? (
            /* Day View for Timetable */
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.15)]">
                <div className="flex items-center gap-2">
                  <School className="w-4 h-4 text-[#22C55E]" />
                  <h3 className="text-sm font-bold text-[#F3FAF5]">
                    Tiết học ngày {selectedDayInfo.label} ({formatDateVN(selectedDayInfo.date)})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {timetableEntries.filter((e) => e.dayOfWeek === selectedDayOfWeek).length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteEntriesByDay(selectedDayOfWeek, selectedDayInfo.label)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      title={`Xóa tất cả các tiết chính khóa của ${selectedDayInfo.label}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa hết tiết {selectedDayInfo.label}</span>
                    </button>
                  )}
                  <span className="text-xs font-extrabold text-[#86EFAC] bg-[#14532D] px-2.5 py-1 rounded-full border border-[#22C55E]/30">
                    {timetableEntries.filter((e) => e.dayOfWeek === selectedDayOfWeek).length} tiết học
                  </span>
                </div>
              </div>

              {timetableEntries.filter((e) => e.dayOfWeek === selectedDayOfWeek).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 jami-card-grid">
                  {timetableEntries
                    .filter((e) => e.dayOfWeek === selectedDayOfWeek)
                    .sort((a, b) => a.startLocalTime.localeCompare(b.startLocalTime))
                    .map((entry) => {
                      const theme = getSubjectColorTheme(entry.title, entry.subjectName);
                      const isSkipped = isEntrySkipped(entry.id, selectedDayInfo.dateStr);

                      return (
                        <div
                          key={entry.id}
                          className={`p-4 rounded-2xl ${theme.bg} border ${theme.border} space-y-2 relative group transition-all shadow-sm jami-card-interactive ${
                            isSkipped ? 'opacity-75 saturate-50 border-dashed border-amber-600/60' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-bold block ${isSkipped ? 'line-through text-[#A9B8AE]' : 'text-[#F3FAF5]'}`}>
                                  {entry.title}
                                </span>
                                {isSkipped && (
                                  <span className="text-[10px] font-black bg-amber-950/90 text-amber-300 border border-amber-600/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <CalendarOff className="w-2.5 h-2.5 text-amber-400" />
                                    <span>Đã nghỉ tuần này</span>
                                  </span>
                                )}
                              </div>
                              {entry.subjectName && (
                                <span className={`text-[10px] font-bold ${theme.badge} px-2 py-0.5 rounded mt-1 inline-block border`}>
                                  {entry.subjectName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isSkipped ? (
                                <button
                                  type="button"
                                  onClick={() => handleUndoSkip(entry, selectedDayInfo.dateStr)}
                                  className="px-2 py-1 text-[11px] font-bold text-amber-300 hover:text-white bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                                  title="Hoàn tác trạng thái nghỉ tiết học này"
                                >
                                  <Undo2 className="w-3 h-3 text-amber-400" />
                                  <span>Hoàn tác</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSkipModal(entry, selectedDayInfo)}
                                  className="p-1.5 text-amber-400 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 rounded-lg border border-amber-800/60 cursor-pointer transition-colors"
                                  title="Nghỉ tuần này"
                                >
                                  <CalendarOff className="w-3.5 h-3.5 text-amber-400" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditEntry(entry)}
                                className="p-1.5 text-[#A9B8AE] hover:text-[#86EFAC] bg-[#050806] rounded-lg border border-[rgba(34,197,94,0.15)] cursor-pointer"
                                title="Sửa tiết học"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(entry.id, entry.title)}
                                className="p-1.5 text-rose-400 hover:text-rose-200 bg-rose-950/70 rounded-lg border border-rose-800/60 cursor-pointer"
                                title="Xóa tiết học này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="text-xs text-[#A9B8AE] flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
                            <span>{entry.startLocalTime} – {entry.endLocalTime}</span>
                          </div>

                          {entry.teacher && (
                            <div className="text-xs text-[#86EFAC] flex items-center gap-1.5 font-medium">
                              <UserCheck className="w-3.5 h-3.5 text-[#22C55E]" />
                              <span>GV: {entry.teacher}</span>
                            </div>
                          )}

                          {entry.location && (
                            <div className="text-xs text-[#A9B8AE] flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#22C55E]" />
                              <span>{entry.location}</span>
                            </div>
                          )}

                          {(entry.commuteBeforeMinutes || entry.commuteAfterMinutes) ? (
                            <div className="text-[10px] text-[#A9B8AE] pt-1 border-t border-[rgba(34,197,94,0.1)]">
                              Di chuyển: Trước {entry.commuteBeforeMinutes || 0}p • Sau {entry.commuteAfterMinutes || 0}p
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-[#A9B8AE] border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl space-y-3">
                  <School className="w-8 h-8 text-[#22C55E]/40 mx-auto" />
                  <p>Không có tiết học nào trong ngày {selectedDayInfo.label}.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEntry(null);
                      setEntryTitle('');
                      setEntryTeacher('');
                      setEntrySubjectId(subjects[0]?.id || '');
                      setEntryDayOfWeek(selectedDayOfWeek);
                      setEntryLocation('');
                      setIsAddEntryOpen(true);
                    }}
                    className="px-4 py-2 bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm tiết học cho {selectedDayInfo.label}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Week Matrix View for Timetable (7 Columns Standard Vietnamese School Matrix) */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
                {weekDays.map((day) => {
                  const dayEntries = timetableEntries
                    .filter((e) => e.dayOfWeek === day.dayOfWeek)
                    .sort((a, b) => a.startLocalTime.localeCompare(b.startLocalTime));
                  const isSelected = selectedDayOfWeek === day.dayOfWeek;

                  return (
                    <div
                      key={day.dayOfWeek}
                      onClick={() => setSelectedDayOfWeek(day.dayOfWeek)}
                      className={`bg-[#0B120D] p-3.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer space-y-3 ${
                        isSelected
                          ? 'border-[#22C55E] shadow-lg shadow-[#16A34A]/15 bg-[#0E1711]'
                          : 'border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
                      }`}
                    >
                      {/* Day Header */}
                      <div className="pb-2 border-b border-[rgba(34,197,94,0.15)] flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-black text-[#F3FAF5] truncate">{day.label}</span>
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
                              title={`Xóa tất cả ${dayEntries.length} tiết của ${day.label}`}
                            >
                              <Trash2 className="w-3 h-3" />
                              <span className="hidden xl:inline">Xóa</span>
                            </button>
                          )}
                          <span className="text-[9px] font-extrabold bg-[#14532D] text-[#86EFAC] px-1.5 py-0.5 rounded border border-[#22C55E]/30">
                            {dayEntries.length} tiết
                          </span>
                        </div>
                      </div>

                      {/* Day Entries List */}
                      <div className="space-y-2 flex-1">
                        {dayEntries.map((e, idx) => {
                          const theme = getSubjectColorTheme(e.title, e.subjectName);
                          const isSkipped = isEntrySkipped(e.id, day.dateStr);

                          return (
                            <div
                              key={e.id}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openEditEntry(e);
                              }}
                              className={`p-2.5 rounded-xl ${theme.bg} border ${theme.border} text-[11px] space-y-1 relative group cursor-pointer transition-all shadow-sm ${
                                isSkipped ? 'opacity-70 saturate-50 border-dashed border-amber-600/60' : ''
                              }`}
                              title={isSkipped ? 'Tiết này đã đánh dấu nghỉ trong tuần này' : 'Bấm để chỉnh sửa tiết học này'}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="font-bold truncate pr-1">
                                  <span className="text-[#86EFAC] mr-1 font-black">T{idx + 1}:</span>
                                  <span className={isSkipped ? 'line-through text-[#A9B8AE]' : 'text-[#F3FAF5]'}>{e.title}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {isSkipped ? (
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        handleUndoSkip(e, day.dateStr);
                                      }}
                                      className="px-1.5 py-0.5 text-[9px] font-bold text-amber-300 hover:text-white bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-md transition-colors cursor-pointer"
                                      title="Hoàn tác trạng thái nghỉ"
                                    >
                                      <Undo2 className="w-2.5 h-2.5" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        handleOpenSkipModal(e, day);
                                      }}
                                      className="p-1 text-amber-400 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/60 rounded-md transition-colors cursor-pointer"
                                      title="Nghỉ tuần này"
                                    >
                                      <CalendarOff className="w-3 h-3 text-amber-400" />
                                    </button>
                                  )}
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
                              {isSkipped && (
                                <div className="text-[9px] font-black text-amber-400 flex items-center gap-1">
                                  <CalendarOff className="w-2.5 h-2.5" />
                                  <span>Đã nghỉ tuần này</span>
                                </div>
                              )}
                              <div className="text-[#A9B8AE] text-[10px] flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[#22C55E]" />
                                <span>{e.startLocalTime} – {e.endLocalTime}</span>
                              </div>
                              {e.teacher && (
                                <div className="text-[10px] text-[#86EFAC] truncate flex items-center gap-1 font-medium">
                                  <UserCheck className="w-2.5 h-2.5 text-[#22C55E]" />
                                  <span>GV: {e.teacher}</span>
                                </div>
                              )}
                              {e.location && (
                                <div className="text-[10px] text-[#A9B8AE] truncate flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5 text-[#22C55E]" />
                                  <span>{e.location}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {dayEntries.length === 0 && (
                          <div className="py-6 text-center text-[10px] text-[#A9B8AE]/60 italic border border-dashed border-[rgba(34,197,94,0.1)] rounded-xl">
                            Không có tiết
                          </div>
                        )}
                      </div>

                      {/* Quick Add Button */}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditingEntry(null);
                          setEntryTitle('');
                          setEntryTeacher('');
                          setEntrySubjectId(subjects[0]?.id || '');
                          setEntryDayOfWeek(day.dayOfWeek);
                          setEntryLocation('');
                          setIsAddEntryOpen(true);
                        }}
                        className="w-full py-1.5 bg-[#101A13] hover:bg-[#14532D] text-[#86EFAC] text-[10px] font-bold rounded-xl border border-[rgba(34,197,94,0.15)] flex items-center justify-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Thêm tiết</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Subject Breakdown Card */}
              <div className="p-5 bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#F3FAF5] uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#22C55E]" />
                    <span>Tổng Hợp Số Tiết Theo Môn Học Trong Tuần</span>
                  </h3>
                  <span className="text-xs font-black text-[#86EFAC]">
                    Tổng cộng: {timetableEntries.length} tiết / tuần
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {subjects.map((sub) => {
                    const count = timetableEntries.filter(
                      (e) => e.subjectId === sub.id || e.title.toLowerCase().includes(sub.name.toLowerCase())
                    ).length;
                    if (count === 0) return null;
                    return (
                      <div
                        key={sub.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs"
                      >
                        <span className="font-bold text-[#F3FAF5]">{sub.name}:</span>
                        <span className="font-black text-[#86EFAC] bg-[#14532D] px-2 py-0.5 rounded-md">
                          {count} tiết
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* BẢNG 2: THỜI GIAN BIỂU (LỊCH SINH HOẠT, HỌC THÊM & TỰ HỌC THÔNG MINH) */}
      {/* ========================================================================= */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* Subheader & Schedule Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.22)] shadow-xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('timetable')}
                className="flex items-center gap-2 shrink-0 bg-[#101A13] hover:bg-[#14532D] active:scale-95 border border-[rgba(34,197,94,0.3)] hover:border-[#22C55E]/60 rounded-xl px-3.5 py-2 shadow-md text-xs font-black text-[#86EFAC] transition-all cursor-pointer group"
                title="Bấm để chuyển sang Bảng 1: 1. THỜI KHÓA BIỂU (TRƯỜNG HỌC)"
              >
                <Layers className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Bảng 1</span>
                <div className="flex items-center text-[#86EFAC] bg-[#0B120D] px-1.5 py-0.5 rounded-md border border-[rgba(34,197,94,0.2)] group-hover:border-[#22C55E]/50 group-hover:text-white transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>

              <div className="h-5 w-px bg-[rgba(34,197,94,0.2)] shrink-0 hidden sm:block" />

              <h2 className="text-base font-black text-[#F3FAF5] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#22C55E]" />
                <span>2. THỜI GIAN BIỂU (SINH HOẠT & TỰ HỌC)</span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Week Navigator */}
              <div className="flex items-center bg-[#101A13] p-1 rounded-xl border border-[rgba(34,197,94,0.22)] text-xs text-[#F3FAF5]">
                <button
                  type="button"
                  onClick={() => setCurrentWeekOffset((prev) => prev - 1)}
                  className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] hover:bg-[#142319] rounded cursor-pointer transition-colors"
                  title="Tuần trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="relative flex items-center px-1">
                  <Calendar className="w-3.5 h-3.5 text-[#22C55E] mr-1.5 shrink-0 pointer-events-none" />
                  <select
                    value={currentWeekOffset}
                    onChange={(e) => setCurrentWeekOffset(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-[#86EFAC] focus:outline-none cursor-pointer pr-1 [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                  >
                    {weekOptions.map((opt) => (
                      <option key={opt.offset} value={opt.offset}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentWeekOffset((prev) => prev + 1)}
                  className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] hover:bg-[#142319] rounded cursor-pointer transition-colors"
                  title="Tuần kế tiếp"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {currentWeekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentWeekOffset(0)}
                    className="ml-1 px-2 py-0.5 bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-[10px] font-bold rounded cursor-pointer border border-[#22C55E]/30 transition-all"
                  >
                    Tuần hiện tại
                  </button>
                )}
              </div>

              {/* View Toggle */}
              <div className="flex items-center bg-[#101A13] p-1 rounded-xl border border-[rgba(34,197,94,0.18)]">
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'week' ? 'bg-[#16A34A] text-[#050806] shadow-sm' : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                  }`}
                >
                  Tuần
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'day' ? 'bg-[#16A34A] text-[#050806] shadow-sm' : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                  }`}
                >
                  Ngày
                </button>
              </div>

              {/* Undo Replan Button */}
              {lastTaskSnapshot && (
                <button
                  type="button"
                  onClick={handleUndoReplan}
                  disabled={isUndoing}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-950/70 hover:bg-amber-900/90 text-amber-200 border border-amber-600/50 text-xs font-bold transition-all cursor-pointer shadow-md shadow-amber-950/40 disabled:opacity-50"
                  title="Khôi phục lại lịch trước lần AI tự động xếp gần nhất"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isUndoing ? 'animate-spin' : ''}`} />
                  <span>{isUndoing ? 'Đang hoàn tác...' : 'Hoàn tác xếp lịch'}</span>
                </button>
              )}

              {/* Actions for Schedule */}
              <button
                type="button"
                onClick={() => {
                  setEditingEvent(null);
                  setEventTitle('');
                  setEventLocation('');
                  setEventCommuteBefore(0);
                  setEventCommuteAfter(0);
                  setEventIsFixed(true);
                  setEventDate(selectedDayInfo.dateStr);
                  setIsAddEventOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#86EFAC]" />
                <span>Thêm lịch học thêm / việc bận</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerReplan}
                disabled={isReplanning}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-extrabold shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReplanning ? 'animate-spin' : ''}`} />
                <span>{isReplanning ? 'Đang tính toán...' : 'Tự động sắp xếp lại'}</span>
              </button>
            </div>
          </div>

          {/* Missed / Overdue Tasks Auto-Replan Alert Banner */}
          {missedTasks.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/50 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-950/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-900/80 text-amber-300 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-amber-100">
                    Phát hiện {missedTasks.length} nhiệm vụ đã qua giờ học nhưng chưa hoàn thành!
                  </div>
                  <div className="text-[11px] text-amber-300/80 mt-0.5">
                    Các bài tập bị trễ: {missedTasks.slice(0, 3).map((t) => t.title).join(', ')}{missedTasks.length > 3 ? '...' : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleTriggerReplan}
                disabled={isReplanning}
                className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl shadow cursor-pointer shrink-0 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Tự động xếp lại vào giờ trống mới</span>
              </button>
            </div>
          )}

          {/* Day Selector Tabs for Schedule */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d) => (
              <button
                key={d.dayOfWeek}
                type="button"
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

          {/* Schedule Content Body */}
          {isLoading ? (
            <div className="p-12 text-center text-xs text-[#A9B8AE] flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
              <span>Đang tải thời gian biểu từ hệ thống...</span>
            </div>
          ) : viewMode === 'day' ? (
            /* DAY VIEW: 2-column Breakdown (Chỉ Lịch Bận/Học Thêm và Tự Học AI) */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[#101A13] px-4 py-2.5 rounded-2xl border border-[rgba(34,197,94,0.2)] text-xs text-[#86EFAC] font-bold">
                <span>Chi tiết ngày: {selectedDayInfo.label} ({formatDateVN(selectedDayInfo.date)})</span>
                <span>{selectedDayInfo.isToday ? 'Hôm nay' : ''}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {(() => {
                  const { dayEvents, dayTasks } = getItemsForDay(selectedDayOfWeek, selectedDayInfo.dateStr);
                  return (
                    <>
                      {/* Busy Events & Extra Classes */}
                      <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
                          <h3 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>1. Học Thêm, CLB & Lịch Bận Cá Nhân</span>
                          </h3>
                          <span className="text-[10px] font-extrabold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/40">
                            {dayEvents.length} sự kiện
                          </span>
                        </div>

                        {dayEvents.length > 0 ? (
                          <div className="space-y-2.5">
                            {dayEvents.map((evt) => {
                              const isSkipped = isBusyEventSkipped(evt.id, selectedDayInfo.dateStr);
                              return (
                                <div
                                  key={evt.id}
                                  className={`p-3.5 rounded-2xl bg-[#101A13] border space-y-1.5 relative group shadow-sm transition-all ${
                                    isSkipped
                                      ? 'opacity-70 saturate-50 border-dashed border-amber-600/60'
                                      : 'border-amber-900/30 hover:border-amber-700/50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-xs font-bold ${isSkipped ? 'line-through text-[#A9B8AE]' : 'text-[#F3FAF5]'}`}>
                                        {evt.title}
                                      </span>
                                      {isSkipped && (
                                        <span className="text-[10px] font-black bg-amber-950/90 text-amber-300 border border-amber-600/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                                          <CalendarOff className="w-2.5 h-2.5 text-amber-400" />
                                          <span>Đã nghỉ lần này</span>
                                        </span>
                                      )}
                                      {evt.isFixed && !isSkipped && (
                                        <span className="text-[9px] font-black bg-amber-950/80 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Sự kiện cố định không dời lịch">
                                          <Lock className="w-2.5 h-2.5" />
                                          <span>Cố định</span>
                                        </span>
                                      )}
                                      {evt.type === 'club' && !isSkipped && (
                                        <span className="text-[9px] font-black bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded">
                                          CLB
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isSkipped ? (
                                        <button
                                          type="button"
                                          onClick={() => handleUndoSkipBusy(evt, selectedDayInfo.dateStr)}
                                          className="px-2 py-1 text-[11px] font-bold text-amber-300 hover:text-white bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                                          title="Hoàn tác trạng thái nghỉ sự kiện này"
                                        >
                                          <Undo2 className="w-3 h-3 text-amber-400" />
                                          <span>Hoàn tác</span>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenSkipBusyModal(evt, selectedDayInfo)}
                                          className="p-1.5 text-amber-400 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 rounded-lg border border-amber-800/60 cursor-pointer transition-colors"
                                          title="Nghỉ tạm lần này / Nghỉ tuần này"
                                        >
                                          <CalendarOff className="w-3.5 h-3.5 text-amber-400" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openEditEvent(evt)}
                                        className="p-1.5 text-[#A9B8AE] hover:text-[#86EFAC] bg-[#050806] rounded-lg border border-[rgba(34,197,94,0.15)] cursor-pointer"
                                        title="Sửa lịch bận"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteBusyEvent(evt.id, evt.title)}
                                        className="p-1.5 text-[#A9B8AE] hover:text-rose-400 bg-[#050806] rounded-lg border border-[rgba(34,197,94,0.15)] cursor-pointer"
                                        title="Xóa vĩnh viễn lịch bận này"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-[#A9B8AE]">
                                    <Clock className="w-3 h-3 text-[#22C55E]" />
                                    <span>{formatTimeVN(evt.startsAt)} – {formatTimeVN(evt.endsAt)}</span>
                                  </div>
                                  {evt.location && (
                                    <div className="text-[11px] text-[#86EFAC] flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-[#22C55E]" />
                                      <span>{evt.location}</span>
                                    </div>
                                  )}
                                  {(evt.commuteBeforeMinutes || evt.commuteAfterMinutes) ? (
                                    <div className="text-[10px] text-[#A9B8AE] flex items-center gap-1">
                                      <Car className="w-3 h-3 text-amber-400" />
                                      <span>Di chuyển: Trước {evt.commuteBeforeMinutes || 0}p • Sau {evt.commuteAfterMinutes || 0}p</span>
                                    </div>
                                  ) : null}
                                  {evt.recurrenceRule && (
                                    <div className="text-[10px] text-amber-400/90 font-semibold">
                                      • Lặp lại: {evt.recurrenceRule.includes('WEEKLY') ? 'Hàng tuần' : evt.recurrenceRule.includes('DAILY') ? 'Hàng ngày' : 'Định kỳ'}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-8 text-center text-xs text-[#A9B8AE] border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl">
                            Không có lịch bận hay học thêm trong ngày này
                          </div>
                        )}
                      </div>

                      {/* Tasks on this day */}
                      <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.15)]">
                          <h3 className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-[#22C55E]" />
                            <span>2. Tự Học & Bài Tập (AI Tự Động Xếp)</span>
                          </h3>
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
                                      type="button"
                                      onClick={() => handleToggleLockTask(task.id)}
                                      className="p-1 text-[#A9B8AE] hover:text-[#86EFAC] bg-[#050806] rounded-md border border-[rgba(34,197,94,0.15)] cursor-pointer"
                                      title={task.locked ? 'Đã khóa lịch' : 'Cho phép tự động dời lịch'}
                                    >
                                      {task.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-[#A9B8AE]" />}
                                    </button>
                                    <button
                                      type="button"
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
            /* WEEK VIEW: 7-column Breakdown (Chỉ Lịch Bận và Tự Học) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
              {weekDays.map((day) => {
                const { dayEvents, dayTasks } = getItemsForDay(day.dayOfWeek, day.dateStr);
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
                        {day.isToday && (
                          <span className="text-[9px] font-extrabold bg-[#14532D] text-[#86EFAC] px-1.5 py-0.5 rounded border border-[#22C55E]/30">
                            Hôm nay
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Day Content */}
                    <div className="space-y-2 flex-1">
                      {/* Busy Events */}
                      {dayEvents.map((evt) => {
                        const isSkipped = isBusyEventSkipped(evt.id, day.dateStr);
                        return (
                          <div
                            key={evt.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEditEvent(evt);
                            }}
                            className={`p-2.5 rounded-xl border text-[11px] space-y-1 relative group cursor-pointer transition-all shadow-sm ${
                              isSkipped
                                ? 'opacity-70 saturate-50 border-dashed border-amber-600/60 bg-amber-950/20'
                                : 'bg-amber-950/30 hover:bg-amber-950/50 border-amber-800/40 hover:border-amber-700/60'
                            }`}
                            title={isSkipped ? 'Sự kiện này đã đánh dấu nghỉ lần này' : 'Bấm để chỉnh sửa lịch bận này'}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="font-bold text-amber-200 truncate pr-1 flex items-center gap-1">
                                <span className={isSkipped ? 'line-through text-[#A9B8AE]' : ''}>{evt.title}</span>
                                {evt.isFixed && !isSkipped && <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isSkipped ? (
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      handleUndoSkipBusy(evt, day.dateStr);
                                    }}
                                    className="px-1.5 py-0.5 text-[9px] font-bold text-amber-300 hover:text-white bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 rounded-md transition-colors cursor-pointer"
                                    title="Hoàn tác trạng thái nghỉ"
                                  >
                                    <Undo2 className="w-2.5 h-2.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      handleOpenSkipBusyModal(evt, day);
                                    }}
                                    className="p-1 text-amber-400 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/60 rounded-md transition-colors cursor-pointer"
                                    title="Nghỉ tạm lần này"
                                  >
                                    <CalendarOff className="w-3 h-3 text-amber-400" />
                                  </button>
                                )}
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
                                  title="Xóa vĩnh viễn lịch bận này"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {isSkipped && (
                              <div className="text-[9px] font-black text-amber-400 flex items-center gap-1">
                                <CalendarOff className="w-2.5 h-2.5" />
                                <span>Đã nghỉ lần này</span>
                              </div>
                            )}
                            <div className="text-amber-400/80 text-[10px] flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>{formatTimeVN(evt.startsAt)} – {formatTimeVN(evt.endsAt)}</span>
                            </div>
                            {evt.location && (
                              <div className="text-[10px] text-[#86EFAC] truncate flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 text-[#22C55E]" />
                                <span>{evt.location}</span>
                              </div>
                            )}
                            {(evt.commuteBeforeMinutes || evt.commuteAfterMinutes) ? (
                              <div className="text-[9px] text-[#A9B8AE] flex items-center gap-1">
                                <Car className="w-2.5 h-2.5 text-amber-400" />
                                <span>{evt.commuteBeforeMinutes || 0}p trước • {evt.commuteAfterMinutes || 0}p sau</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}

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
                              title="Hủy xếp lịch tiết này"
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

                      {dayEvents.length === 0 && dayTasks.length === 0 && (
                        <div className="py-6 text-center text-[10px] text-[#A9B8AE]/60 italic">
                          Không có lịch bận hay bài tập
                        </div>
                      )}
                    </div>

                    <div className="pt-2 text-center text-[10px] font-bold text-[#86EFAC] opacity-80 border-t border-[rgba(34,197,94,0.1)]">
                      {dayEvents.length + dayTasks.length} mục
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Thêm / Sửa Tiết Học Trường */}
      {isAddEntryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5] jami-modal-animate">
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
                <label className="block font-bold text-[#F3FAF5] mb-1">Giáo viên phụ trách:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Thầy Hùng / Cô Mai"
                  value={entryTeacher}
                  onChange={(e) => setEntryTeacher(e.target.value)}
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

      {/* Modal: Thêm / Sửa Lịch Bận / Học Thêm / CLB */}
      {isAddEventOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5] jami-modal-animate">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F3FAF5]">
                {editingEvent ? 'Sửa lịch học thêm / việc bận' : 'Thêm lịch học thêm, CLB hoặc việc bận'}
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
                  placeholder="Ví dụ: Học thêm Toán Thầy Hùng, CLB Bóng đá..."
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Loại hoạt động:</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="extra_class">📚 Lớp học thêm</option>
                    <option value="club">⚽ Câu lạc bộ / Năng khiếu</option>
                    <option value="personal">👤 Việc cá nhân / Gia đình</option>
                    <option value="commute">🚗 Di chuyển</option>
                    <option value="meal">🍱 Ăn uống</option>
                    <option value="sleep">🛌 Nghỉ ngơi / Giấc ngủ</option>
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
                <label className="block font-bold text-[#F3FAF5] mb-1">Địa điểm diễn ra:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Trung tâm BDVH, Nhà thi đấu..."
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Di chuyển trước (phút):</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={eventCommuteBefore}
                    onChange={(e) => setEventCommuteBefore(Number(e.target.value))}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Di chuyển sau (phút):</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={eventCommuteAfter}
                    onChange={(e) => setEventCommuteAfter(Number(e.target.value))}
                    className="w-full p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  />
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
                  <option value="none">Chỉ 1 lần (Không lặp lại)</option>
                  <option value="daily">Hàng ngày (Mỗi ngày trong tuần)</option>
                  <option value="weekdays">Các ngày trong tuần (Thứ 2 đến Thứ 6)</option>
                  <option value="weekends">Cuối tuần (Thứ 7 & Chủ Nhật)</option>
                  <option value="weekly">Hàng tuần (Vào thứ này hàng tuần)</option>
                  <option value="biweekly">Cách tuần (2 tuần một lần)</option>
                  <option value="monthly">Hàng tháng (Cùng ngày hàng tháng)</option>
                  <option value="custom_days">Tùy chọn ngày trong tuần (T2, T3, T4...)</option>
                </select>
              </div>

              {eventRecurrence === 'custom_days' && (
                <div className="bg-[#050806] p-3 rounded-xl border border-[rgba(34,197,94,0.2)] space-y-1.5">
                  <label className="block font-bold text-[#86EFAC] text-[11px]">Chọn các thứ lặp lại trong tuần:</label>
                  <div className="grid grid-cols-7 gap-1">
                    {[
                      { day: 1, label: 'T2' },
                      { day: 2, label: 'T3' },
                      { day: 3, label: 'T4' },
                      { day: 4, label: 'T5' },
                      { day: 5, label: 'T6' },
                      { day: 6, label: 'T7' },
                      { day: 7, label: 'CN' },
                    ].map((d) => {
                      const isSelected = customDays.includes(d.day);
                      return (
                        <button
                          key={d.day}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              if (customDays.length > 1) {
                                setCustomDays(customDays.filter((x) => x !== d.day));
                              }
                            } else {
                              setCustomDays([...customDays, d.day]);
                            }
                          }}
                          className={`py-1.5 rounded-lg text-xs font-bold text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                              : 'bg-[#101A13] text-[#A9B8AE] hover:text-[#F3FAF5]'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {eventRecurrence !== 'none' && (
                <div>
                  <label className="block font-bold text-[#F3FAF5] mb-1">Ngày kết thúc lặp (tùy chọn):</label>
                  <input
                    type="date"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    className="w-full p-2 border border-[rgba(34,197,94,0.2)] bg-[#050806] text-[#F3FAF5] rounded-xl text-xs focus:border-[#22C55E] focus:outline-none"
                    placeholder="Để trống nếu lặp vô hạn"
                  />
                </div>
              )}

              <div className="p-3 bg-[#050806] rounded-xl border border-[rgba(34,197,94,0.2)] flex items-center justify-between">
                <div>
                  <label htmlFor="isFixedCheck" className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1 cursor-pointer">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sự kiện cố định</span>
                  </label>
                  <p className="text-[10px] text-[#A9B8AE]">AI sẽ không bao giờ tự ý dời hay ghi đè lên lịch này</p>
                </div>
                <input
                  id="isFixedCheck"
                  type="checkbox"
                  checked={eventIsFixed}
                  onChange={(e) => setEventIsFixed(e.target.checked)}
                  className="w-4 h-4 text-[#16A34A] accent-[#16A34A] rounded cursor-pointer"
                />
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

      {/* Modal: Nhập Thời Khóa Biểu Bằng Hình Ảnh (AI OCR) */}
      {isOcrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-2xl w-full shadow-2xl space-y-5 text-[#F3FAF5] my-auto max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[rgba(34,197,94,0.18)] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] shadow-md">
                  <Sparkles className="w-4 h-4 text-[#86EFAC]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#F3FAF5]">
                    Nhập Thời Khóa Biểu Bằng Hình Ảnh AI
                  </h3>
                  <p className="text-[11px] text-[#A9B8AE]">
                    Tự động nhận dạng tiết học từ ảnh chụp hoặc file PDF
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOcrModalOpen(false)}
                className="p-1.5 rounded-lg text-[#A9B8AE] hover:text-white bg-[#101A13] border border-[rgba(34,197,94,0.15)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error message */}
            {ocrErrorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{ocrErrorMessage}</span>
              </div>
            )}

            {/* Step 1: Upload / Choose from Materials */}
            {ocrStep === 'upload' && (
              <div className="space-y-4">
                {/* Source Tab Selector */}
                <div className="grid grid-cols-2 p-1 bg-[#050806] rounded-xl border border-[rgba(34,197,94,0.2)] text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setOcrSourceTab('upload');
                      setOcrErrorMessage(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all cursor-pointer ${
                      ocrSourceTab === 'upload'
                        ? 'bg-[#16A34A] text-[#050806] shadow-sm font-extrabold'
                        : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Tải ảnh mới từ máy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOcrSourceTab('materials');
                      setOcrErrorMessage(null);
                    }}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all cursor-pointer ${
                      ocrSourceTab === 'materials'
                        ? 'bg-[#16A34A] text-[#050806] shadow-sm font-extrabold'
                        : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Chọn từ Kho tài liệu ({materials.length})</span>
                  </button>
                </div>

                {/* TAB 1: UPLOAD FROM DEVICE */}
                {ocrSourceTab === 'upload' && (
                  <div className="space-y-3">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleOcrFileSelect(e.dataTransfer.files[0]);
                        }
                      }}
                      className="border-2 border-dashed border-[rgba(34,197,94,0.35)] hover:border-[#22C55E] bg-[#050806] p-6 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-[#101A13]/40 group"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleOcrFileSelect(e.target.files[0]);
                          }
                        }}
                      />

                      {ocrPreviewUrl ? (
                        <div className="space-y-2.5 w-full flex flex-col items-center">
                          {ocrMimeType === 'application/pdf' || ocrFile?.name.toLowerCase().endsWith('.pdf') ? (
                            <div className="w-full p-4 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] flex items-center justify-center gap-3 text-[#86EFAC]">
                              <FileText className="w-8 h-8 text-[#22C55E]" />
                              <div className="text-left">
                                <div className="text-xs font-bold text-[#F3FAF5]">{ocrFile?.name || 'Tài liệu PDF'}</div>
                                <div className="text-[11px] text-[#A9B8AE]">Định dạng tài liệu PDF sẵn sàng để phân tích</div>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={ocrPreviewUrl}
                              alt="Thời khóa biểu preview"
                              className="max-h-48 rounded-xl object-contain border border-[rgba(34,197,94,0.25)] shadow-lg"
                            />
                          )}
                          <div className="text-xs font-bold text-[#86EFAC] flex items-center gap-1.5">
                            <Check className="w-4 h-4 text-[#22C55E]" />
                            <span>Đã chọn: {ocrFile?.name} ({(ocrFile!.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <span className="text-[11px] text-[#A9B8AE] underline group-hover:text-white">
                            Bấm để đổi tệp khác
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="w-12 h-12 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                            <Upload className="w-5 h-5 text-[#22C55E]" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[#F3FAF5]">
                              Kéo thả hoặc bấm để chọn ảnh hoặc PDF Thời khóa biểu
                            </div>
                            <div className="text-[11px] text-[#A9B8AE] mt-0.5">
                              Hỗ trợ định dạng PNG, JPG, JPEG, WEBP hoặc PDF (tối đa 25MB)
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Checkbox: Save to Library */}
                    <div className="bg-[#050806] p-3.5 rounded-2xl border border-[rgba(34,197,94,0.2)] space-y-2">
                      <label className="flex items-center gap-2.5 text-xs text-[#F3FAF5] font-bold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ocrSaveToLibrary}
                          onChange={(e) => setOcrSaveToLibrary(e.target.checked)}
                          className="w-4 h-4 rounded text-[#16A34A] focus:ring-[#22C55E] bg-[#101A13] border-[rgba(34,197,94,0.3)] cursor-pointer"
                        />
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-[#22C55E]" />
                          <span>Đồng thời lưu ảnh này vào Kho tài liệu</span>
                        </span>
                      </label>

                      {ocrSaveToLibrary && (
                        <div className="pl-6 pt-1">
                          <label className="block text-[11px] font-bold text-[#A9B8AE] mb-1">Tên lưu trong kho:</label>
                          <input
                            type="text"
                            value={ocrMaterialTitle}
                            onChange={(e) => setOcrMaterialTitle(e.target.value)}
                            placeholder="Ví dụ: TKB Lớp 9A Học kỳ 2"
                            className="w-full p-2 bg-[#101A13] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: SELECT FROM MATERIALS */}
                {ocrSourceTab === 'materials' && (
                  <div className="space-y-2.5">
                    <div className="max-h-56 overflow-y-auto space-y-1.5 border border-[rgba(34,197,94,0.18)] bg-[#050806] p-2 rounded-2xl">
                      {materials.length === 0 ? (
                        <div className="py-8 text-center text-xs text-[#A9B8AE]">
                          Kho tài liệu hiện chưa có tài liệu nào. Hãy chuyển sang tab "Tải ảnh mới" để tải lên.
                        </div>
                      ) : (
                        materials.map((m) => {
                          const isSelected = selectedMaterialId === m.id;
                          return (
                            <div
                              key={m.id}
                              onClick={async () => {
                                setSelectedMaterialId(m.id);
                                setOcrTimetableName(m.title);
                                setOcrBase64(null);
                                const mime = m.mimeType || (m.type === 'notes' ? 'text/plain' : 'image/jpeg');
                                setOcrMimeType(mime);
                                setOcrFile(null);
                                if (mime.startsWith('image/')) {
                                  setOcrPreviewUrl((m as any).fileUrl || null);
                                } else {
                                  setOcrPreviewUrl(null);
                                }

                                try {
                                  const dlRes = await fetch(`/api/v1/materials/${m.id}/download`, { credentials: 'include' });
                                  if (dlRes.ok) {
                                    const dlJson = await dlRes.json();
                                    const fileUrl = dlJson.downloadUrl || `/api/v1/materials/${m.id}/content`;
                                    const fileRes = await fetch(fileUrl, { credentials: 'include' });
                                    if (fileRes.ok) {
                                      const blob = await fileRes.blob();
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const b64 = reader.result as string;
                                        setOcrBase64(b64);
                                        if (mime.startsWith('image/')) {
                                          setOcrPreviewUrl(b64);
                                        }
                                      };
                                      reader.readAsDataURL(blob);
                                    }
                                  }
                                } catch {
                                  // Fallback with extractedText or note content
                                  const extText = (m as any).extractedText;
                                  if (extText) {
                                    setOcrBase64(`data:text/plain;base64,${btoa(unescape(encodeURIComponent(extText)))}`);
                                  }
                                }
                              }}
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-[#14532D]/70 border-[#22C55E] text-[#F3FAF5] shadow-sm'
                                  : 'bg-[#101A13] border-[rgba(34,197,94,0.15)] text-[#A9B8AE] hover:text-[#F3FAF5]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-1.5 rounded-lg bg-[#050806] text-[#22C55E] shrink-0">
                                  {m.mimeType?.startsWith('image/') ? (
                                    <ImageIcon className="w-4 h-4" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-[#F3FAF5] truncate">{m.title}</div>
                                  <div className="text-[10px] text-[#A9B8AE] truncate">{m.fileName || 'Ảnh / Tài liệu'}</div>
                                </div>
                              </div>
                              <div className="shrink-0">
                                {isSelected ? (
                                  <div className="w-5 h-5 rounded-full bg-[#22C55E] text-[#050806] flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full border border-[rgba(34,197,94,0.3)]" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <div className="bg-[#101A13] p-3 rounded-xl border border-[rgba(34,197,94,0.15)] text-xs text-[#A9B8AE] space-y-1">
                  <div className="font-bold text-[#86EFAC] flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>Mẹo nhận dạng thời khóa biểu:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                    <li>Chụp đủ ánh sáng, thấy rõ các cột Thứ (T2-T7) và các tiết học.</li>
                    <li>Sau khi AI quét xong, em có thể xem và chỉnh sửa từng tiết học trước khi lưu.</li>
                  </ul>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOcrModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={!ocrBase64}
                    onClick={handleRunOcrAnalysis}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-[#16A34A]/25 cursor-pointer disabled:opacity-40 transition-all"
                  >
                    <Sparkles className="w-4 h-4 fill-[#050806]" />
                    <span>AI Nhận Dạng Thời Khóa Biểu</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Analyzing Loading State */}
            {ocrStep === 'analyzing' && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-[rgba(34,197,94,0.2)] border-t-[#22C55E] animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-[#22C55E] animate-pulse" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-black text-[#F3FAF5]">
                    Jami AI đang phân tích và trích xuất tiết học...
                  </div>
                  <div className="text-xs text-[#A9B8AE]">
                    Đang đọc các cột ngày trong tuần, tên môn học, giờ bắt đầu và phòng học
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Preview and Confirmation Table */}
            {ocrStep === 'preview' && (
              <div className="space-y-4">
                {/* Timetable Name & Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#050806] p-3.5 rounded-2xl border border-[rgba(34,197,94,0.2)]">
                  <div>
                    <label className="block text-[11px] font-bold text-[#86EFAC] mb-1">Tên thời khóa biểu:</label>
                    <input
                      type="text"
                      value={ocrTimetableName}
                      onChange={(e) => setOcrTimetableName(e.target.value)}
                      className="w-full p-2 bg-[#101A13] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    />
                  </div>
                  <div className="flex items-center pt-4 sm:pt-6">
                    <label className="flex items-center gap-2 text-xs text-[#F3FAF5] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ocrReplaceExisting}
                        onChange={(e) => setOcrReplaceExisting(e.target.checked)}
                        className="w-4 h-4 rounded text-[#16A34A] focus:ring-[#22C55E] bg-[#101A13] border-[rgba(34,197,94,0.3)] cursor-pointer"
                      />
                      <span>Xóa tiết học cũ và lưu TKB mới này</span>
                    </label>
                  </div>
                </div>

                {/* Extracted Entries List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#86EFAC]">
                      Đã nhận dạng ({ocrExtractedEntries.length} tiết học):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newEntry = {
                          id: 'manual_' + Math.random().toString(36).substring(2, 7),
                          dayOfWeek: 1,
                          title: 'Toán học',
                          startLocalTime: '07:30',
                          endLocalTime: '08:15',
                          room: '',
                        };
                        setOcrExtractedEntries([...ocrExtractedEntries, newEntry]);
                      }}
                      className="text-[#22C55E] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm tiết</span>
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[#050806] divide-y divide-[rgba(34,197,94,0.1)]">
                    {ocrExtractedEntries.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#A9B8AE]">
                        Chưa có tiết học nào. Hãy bấm "+ Thêm tiết" để nhập thủ công.
                      </div>
                    ) : (
                      ocrExtractedEntries.map((item, index) => (
                        <div key={item.id} className="p-2.5 flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs">
                          {/* Day Select */}
                          <select
                            value={item.dayOfWeek}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setOcrExtractedEntries(
                                ocrExtractedEntries.map((entry, idx) => (idx === index ? { ...entry, dayOfWeek: val } : entry))
                              );
                            }}
                            className="bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-lg px-2 py-1 text-xs text-[#86EFAC] font-bold cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                          >
                            <option value={1}>Thứ 2</option>
                            <option value={2}>Thứ 3</option>
                            <option value={3}>Thứ 4</option>
                            <option value={4}>Thứ 5</option>
                            <option value={5}>Thứ 6</option>
                            <option value={6}>Thứ 7</option>
                            <option value={7}>Chủ Nhật</option>
                          </select>

                          {/* Subject / Title */}
                          <input
                            type="text"
                            value={item.title}
                            placeholder="Tên môn học"
                            onChange={(e) => {
                              const val = e.target.value;
                              setOcrExtractedEntries(
                                ocrExtractedEntries.map((entry, idx) => (idx === index ? { ...entry, title: val } : entry))
                              );
                            }}
                            className="flex-1 min-w-[120px] bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-lg px-2.5 py-1 text-xs text-[#F3FAF5] font-bold focus:border-[#22C55E] focus:outline-none"
                          />

                          {/* Time Inputs */}
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="time"
                              value={item.startLocalTime}
                              onChange={(e) => {
                                const val = e.target.value;
                                setOcrExtractedEntries(
                                  ocrExtractedEntries.map((entry, idx) => (idx === index ? { ...entry, startLocalTime: val } : entry))
                                );
                              }}
                              className="w-20 bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-lg px-1 py-1 text-xs text-[#F3FAF5] text-center"
                            />
                            <span className="text-[#A9B8AE]">-</span>
                            <input
                              type="time"
                              value={item.endLocalTime}
                              onChange={(e) => {
                                const val = e.target.value;
                                setOcrExtractedEntries(
                                  ocrExtractedEntries.map((entry, idx) => (idx === index ? { ...entry, endLocalTime: val } : entry))
                                );
                              }}
                              className="w-20 bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-lg px-1 py-1 text-xs text-[#F3FAF5] text-center"
                            />
                          </div>

                          {/* Room */}
                          <input
                            type="text"
                            value={item.room || ''}
                            placeholder="Phòng học"
                            onChange={(e) => {
                              const val = e.target.value;
                              setOcrExtractedEntries(
                                ocrExtractedEntries.map((entry, idx) => (idx === index ? { ...entry, room: val } : entry))
                              );
                            }}
                            className="w-20 bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-lg px-2 py-1 text-xs text-[#A9B8AE]"
                          />

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setOcrExtractedEntries(ocrExtractedEntries.filter((_, idx) => idx !== index));
                            }}
                            className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 rounded-lg cursor-pointer shrink-0"
                            title="Xóa tiết này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-[rgba(34,197,94,0.18)]">
                  <button
                    type="button"
                    onClick={() => setOcrStep('upload')}
                    className="px-3.5 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                  >
                    ← Chọn ảnh khác
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsOcrModalOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={isOcrSaving || ocrExtractedEntries.length === 0}
                      onClick={handleConfirmOcrSave}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-[#16A34A]/30 cursor-pointer disabled:opacity-40 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isOcrSaving ? 'Đang lưu thời khóa biểu...' : `Xác Nhận & Lưu (${ocrExtractedEntries.length} tiết)`}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Xác nhận chuyển tuần và xử lý Thời Khóa Biểu cũ */}
      {isWeekSwitchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-5 text-[#F3FAF5]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#F3FAF5]">Chuyển sang tuần mới</h3>
                <p className="text-xs text-[#86EFAC] font-bold">
                  {targetWeekDays ? `${formatDateFullVN(targetWeekDays.start)} – ${formatDateFullVN(targetWeekDays.end)}` : ''}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)] space-y-2">
              <p className="text-xs text-[#F3FAF5] leading-relaxed">
                Bạn đang có <strong className="text-[#86EFAC]">{timetableEntries.length} tiết học</strong> trong thời khóa biểu hiện tại.
              </p>
              <p className="text-xs text-[#A9B8AE] leading-relaxed">
                Bạn có muốn <strong className="text-[#F3FAF5]">tiếp tục áp dụng thời khóa biểu cũ</strong> cho tuần mới không, hay muốn <strong className="text-rose-300">xóa tất cả để nhập lại mới</strong>?
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsWeekSwitchModalOpen(false);
                  setTargetWeekOffset(null);
                }}
                className="px-4 py-2.5 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmResetAndInputNew}
                className="px-4 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800/60 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-rose-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa tất cả & Nhập TKB mới</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmKeepOldTimetable}
                className="px-4 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-[#16A34A]/25"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Tiếp tục TKB cũ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Nghỉ tuần này (Bảng 1) */}
      {skipModal.isOpen && skipModal.entry && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Xác nhận nghỉ tuần này">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-5 text-[#F3FAF5]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                <CalendarOff className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#F3FAF5]">Xác nhận nghỉ tuần này</h3>
                <p className="text-xs text-amber-300 font-bold">Chỉ hủy đúng buổi học của tuần hiện tại</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)] space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                <span className="text-[#A9B8AE]">Môn / Tiết học:</span>
                <span className="font-extrabold text-[#F3FAF5]">{skipModal.entry.title}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                <span className="text-[#A9B8AE]">Thứ & Ngày:</span>
                <span className="font-bold text-[#86EFAC]">
                  {skipModal.dayLabel} ({skipModal.formattedDate})
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                <span className="text-[#A9B8AE]">Giờ học:</span>
                <span className="font-bold text-[#F3FAF5]">{skipModal.timeRange}</span>
              </div>
              {skipModal.entry.teacher && (
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                  <span className="text-[#A9B8AE]">Giáo viên:</span>
                  <span className="font-bold text-[#F3FAF5]">{skipModal.entry.teacher}</span>
                </div>
              )}
              <div className="text-[11px] text-[#A9B8AE] leading-relaxed pt-1">
                ℹ️ Tiết học này sẽ được đánh dấu nghỉ trong tuần này, không xuất hiện ở mục Học tập hôm nay, không tạo thông báo nhắc nhở và không tính vào kế hoạch của Jami. Tiết học lặp lại các tuần sau vẫn được giữ nguyên.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#A9B8AE] block">Lý do nghỉ (Tùy chọn):</label>
              <input
                type="text"
                placeholder="VD: Nghỉ lễ, giáo viên bận, nghỉ ốm..."
                value={skipModal.reason}
                onChange={(e) => setSkipModal((prev) => ({ ...prev, reason: e.target.value }))}
                className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={skipModal.isSubmitting}
                onClick={() => setSkipModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={skipModal.isSubmitting}
                onClick={handleConfirmSkip}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <CalendarOff className="w-3.5 h-3.5" />
                <span>{skipModal.isSubmitting ? 'Đang cập nhật...' : 'Xác nhận nghỉ tuần này'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Nghỉ tạm lần này (Bảng 2 - Thời gian biểu) */}
      {skipBusyModal.isOpen && skipBusyModal.event && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Xác nhận nghỉ tạm sự kiện này">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-5 text-[#F3FAF5]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                <CalendarOff className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#F3FAF5]">Xác nhận nghỉ tạm lần này</h3>
                <p className="text-xs text-amber-300 font-bold">Chỉ hủy đúng buổi/sự kiện của ngày này</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)] space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                <span className="text-[#A9B8AE]">Sự kiện / Việc bận:</span>
                <span className="font-extrabold text-[#F3FAF5]">{skipBusyModal.event.title}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                <span className="text-[#A9B8AE]">Thứ & Ngày:</span>
                <span className="font-bold text-[#86EFAC]">
                  {skipBusyModal.dayLabel} ({skipBusyModal.formattedDate})
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                <span className="text-[#A9B8AE]">Khung giờ:</span>
                <span className="font-bold text-[#F3FAF5]">{skipBusyModal.timeRange}</span>
              </div>
              {skipBusyModal.event.location && (
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.1)]">
                  <span className="text-[#A9B8AE]">Địa điểm:</span>
                  <span className="font-bold text-[#F3FAF5]">{skipBusyModal.event.location}</span>
                </div>
              )}
              <div className="text-[11px] text-[#A9B8AE] leading-relaxed pt-1">
                ℹ️ Buổi học thêm / việc bận này sẽ được đánh dấu nghỉ tạm lần này. Khung giờ này sẽ được giải phóng làm thời gian rảnh cho Jami sắp xếp kế hoạch ôn tập & chuẩn bị ngày mai. Lịch lặp lại định kỳ các ngày/tuần sau vẫn được giữ nguyên.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#A9B8AE] block">Lý do nghỉ (Tùy chọn):</label>
              <input
                type="text"
                placeholder="VD: Nghỉ học thêm hôm nay, được nghỉ đột xuất..."
                value={skipBusyModal.reason}
                onChange={(e) => setSkipBusyModal((prev) => ({ ...prev, reason: e.target.value }))}
                className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={skipBusyModal.isSubmitting}
                onClick={() => setSkipBusyModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={skipBusyModal.isSubmitting}
                onClick={handleConfirmSkipBusy}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <CalendarOff className="w-3.5 h-3.5" />
                <span>{skipBusyModal.isSubmitting ? 'Đang cập nhật...' : 'Xác nhận nghỉ tạm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
