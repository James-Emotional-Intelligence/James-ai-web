import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Clock,
  Volume2,
  VolumeX,
  Coffee,
  XCircle,
  BookOpen,
  Send,
  AlertTriangle,
  Flame,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { FocusSession, StudyTask } from '../../../shared/types';
import confetti from '../../lib/safe-confetti';

type TimerMode = '15' | '25' | '45' | '60' | 'custom' | '45_10' | '25_5';
type TimerPhase = 'work' | 'break';

export const FocusTimerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryTaskId = searchParams.get('taskId') || undefined;
  const queryPlanItemId = searchParams.get('planItemId') || undefined;
  const queryPlanId = searchParams.get('planId') || undefined;
  const queryTitle = searchParams.get('title') || searchParams.get('taskTitle') || undefined;
  const querySubject = searchParams.get('subject') || searchParams.get('subjectName') || undefined;
  const querySubjectId = searchParams.get('subjectId') || undefined;
  const rawMinutes = searchParams.get('minutes') || searchParams.get('duration');
  const rawReturnTo = searchParams.get('returnTo');
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/today';
  const queryMinutes = rawMinutes ? parseInt(rawMinutes, 10) : undefined;

  const initialMode: TimerMode =
    queryMinutes === 15 ? '15' : queryMinutes === 25 ? '25' : queryMinutes === 45 ? '45' : queryMinutes === 60 ? '60' : queryMinutes ? 'custom' : '45';
  const initialWorkMinutes = queryMinutes || (initialMode === '15' ? 15 : initialMode === '25' ? 25 : initialMode === '60' ? 60 : 45);
  const initialTotalSeconds = initialWorkMinutes * 60;

  const [mode, setMode] = useState<TimerMode>(initialMode);
  const [phase, setPhase] = useState<TimerPhase>('work');
  const [customMinutes, setCustomMinutes] = useState<number>(queryMinutes || 30);
  const [customBreakMinutes, setCustomBreakMinutes] = useState<number>(5);

  const [totalSeconds, setTotalSeconds] = useState<number>(initialTotalSeconds);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(initialTotalSeconds);
  const [timerState, setTimerState] = useState<'ready' | 'running' | 'paused' | 'break' | 'completed' | 'abandoned'>('ready');
  const [pauseCount, setPauseCount] = useState(0);
  const [sessionNotes, setSessionNotes] = useState<string>(queryTitle || (querySubject ? `Tập trung môn ${querySubject}` : ''));
  const [isMuted, setIsMuted] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [linkedTaskId, setLinkedTaskId] = useState<string | undefined>(queryTaskId);
  const [linkedTask, setLinkedTask] = useState<StudyTask | null>(null);
  const [tasksList, setTasksList] = useState<StudyTask[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const isPlanItemCompletedRef = useRef(false);

  // Timestamp-based truth
  const targetEndTimeRef = useRef<number | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const getPhaseDurationSeconds = useCallback((m: TimerMode, p: TimerPhase, customM: number, customBM: number) => {
    if (m === '15') return p === 'work' ? 15 * 60 : 3 * 60;
    if (m === '25' || m === '25_5') return p === 'work' ? 25 * 60 : 5 * 60;
    if (m === '45' || m === '45_10') return p === 'work' ? 45 * 60 : 10 * 60;
    if (m === '60') return p === 'work' ? 60 * 60 : 15 * 60;
    return p === 'work' ? customM * 60 : customBM * 60;
  }, []);

  // Fetch all pending tasks for combobox selection
  useEffect(() => {
    api.getTasks()
      .then((res) => {
        setTasksList((res.tasks || []).filter((t) => t.status !== 'completed'));
      })
      .catch(() => {});
  }, []);

  // Fetch linked task details if taskId exists
  useEffect(() => {
    if (linkedTaskId) {
      api.getTask(linkedTaskId)
        .then((res) => {
          if (res.task) {
            setLinkedTask(res.task);
          }
        })
        .catch(() => {});
    } else {
      setLinkedTask(null);
    }
  }, [linkedTaskId]);

  // Audio tone helper
  const playTone = useCallback(() => {
    if (isMuted) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const audioCtx = new AudioCtxClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
      setTimeout(() => {
        audioCtx.close().catch(() => {});
      }, 1000);
    } catch {}
  }, [isMuted]);

  // Sync active focus session from backend
  const syncActiveSession = useCallback(async () => {
    try {
      setSyncWarning(null);
      const res = await api.getCurrentFocusSession();
      if (res.session) {
        const s = res.session;
        setActiveSessionId(s.id);
        if (s.taskId) setLinkedTaskId(s.taskId);
        if (s.mode) setMode(s.mode as TimerMode);
        if (s.phase) setPhase(s.phase as TimerPhase);
        if (s.notes) setSessionNotes(s.notes);
        if (s.pauseCount) setPauseCount(s.pauseCount);

        const totalSecs = (s.plannedMinutes || 25) * 60;
        setTotalSeconds(totalSecs);

        if (s.state === 'running') {
          setTimerState('running');
          if (s.targetEndAt) {
            const targetMs = new Date(s.targetEndAt).getTime();
            targetEndTimeRef.current = targetMs;
            const remaining = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
            setSecondsRemaining(remaining);
          }
        } else if (s.state === 'paused') {
          setTimerState('paused');
          targetEndTimeRef.current = null;
          const remaining = s.remainingSecondsAtPause !== undefined ? s.remainingSecondsAtPause : totalSecs;
          setSecondsRemaining(remaining);
        } else if (s.state === 'break') {
          setTimerState('break');
          setPhase('break');
          if (s.targetEndAt) {
            const targetMs = new Date(s.targetEndAt).getTime();
            targetEndTimeRef.current = targetMs;
            const remaining = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
            setSecondsRemaining(remaining);
          }
        }
      } else {
        // No active session in DB
        if (activeSessionId) {
          setActiveSessionId(null);
          setTimerState('ready');
          targetEndTimeRef.current = null;
        }
      }
    } catch (err: any) {
      setSyncWarning('Không thể đồng bộ với máy chủ. Kiểm tra lại kết nối mạng.');
    }
  }, [activeSessionId]);

  // Multi-tab BroadcastChannel setup with ref to latest sync handler
  const syncActiveSessionRef = useRef(syncActiveSession);
  syncActiveSessionRef.current = syncActiveSession;

  useEffect(() => {
    try {
      const channel = new BroadcastChannel('jami_focus_timer_sync');
      broadcastChannelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === 'SYNC_REQUIRED') {
          syncActiveSessionRef.current();
        }
      };
      return () => {
        channel.close();
      };
    } catch {}
  }, []);

  const notifyOtherTabs = () => {
    try {
      broadcastChannelRef.current?.postMessage({ type: 'SYNC_REQUIRED', timestamp: Date.now() });
    } catch {}
  };

  // Load session on mount
  useEffect(() => {
    syncActiveSession();
  }, [syncActiveSession]);

  // Re-sync on visibility change (when user switches back to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (targetEndTimeRef.current && timerState === 'running') {
          const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
          setSecondsRemaining(remaining);
        }
        syncActiveSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncActiveSession, timerState]);

  // Handle switching modes with protection against abandoning active session without confirmation
  const handleSwitchMode = async (newMode: TimerMode) => {
    if (activeSessionId && (timerState === 'running' || timerState === 'paused' || timerState === 'break')) {
      const confirmAbandon = window.confirm(
        'Bạn đang có phiên tập trung đang chạy. Bạn có chắc chắn muốn hủy phiên hiện tại để đổi chế độ không?'
      );
      if (!confirmAbandon) return;

      try {
        await api.abandonFocusSession(activeSessionId, 'Hủy do đổi chế độ học');
        notifyOtherTabs();
      } catch {}
    }

    setMode(newMode);
    setPhase('work');
    setTimerState('ready');
    setActiveSessionId(null);
    targetEndTimeRef.current = null;

    const dur = getPhaseDurationSeconds(newMode, 'work', customMinutes, customBreakMinutes);
    setTotalSeconds(dur);
    setSecondsRemaining(dur);
  };

  const handleStart = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);
    setSyncWarning(null);

    const isWork = phase === 'work';
    const plannedM = Math.round(totalSeconds / 60);
    const breakM = Math.round(getPhaseDurationSeconds(mode, 'break', customMinutes, customBreakMinutes) / 60);

    playTone();

    try {
      if (!activeSessionId && isWork) {
        const cleanTaskId = linkedTaskId && linkedTaskId !== 'none' && linkedTaskId.trim() !== '' ? linkedTaskId.trim() : undefined;
        const res = await api.startFocusSession(cleanTaskId, mode, plannedM);
        setActiveSessionId(res.session.id);
        setTimerState('running');
        if (res.session.targetEndAt) {
          targetEndTimeRef.current = new Date(res.session.targetEndAt).getTime();
        } else {
          targetEndTimeRef.current = Date.now() + totalSeconds * 1000;
        }
        notifyOtherTabs();
      } else if (activeSessionId && isWork) {
        const res = await api.resumeFocusSession(activeSessionId);
        setTimerState('running');
        if (res.session.targetEndAt) {
          targetEndTimeRef.current = new Date(res.session.targetEndAt).getTime();
        } else {
          targetEndTimeRef.current = Date.now() + secondsRemaining * 1000;
        }
        notifyOtherTabs();
      } else {
        // Break phase resume / start: purely local countdown
        setTimerState('break');
        targetEndTimeRef.current = Date.now() + secondsRemaining * 1000;
        notifyOtherTabs();
      }
    } catch (err: any) {
      setSyncWarning(err.message || 'Không thể bắt đầu phiên học.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePause = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);
    setSyncWarning(null);

    playTone();

    try {
      if (activeSessionId && phase === 'work') {
        await api.pauseFocusSession(activeSessionId);
        notifyOtherTabs();
      }
      setTimerState('paused');
      targetEndTimeRef.current = null;
      setPauseCount((prev) => prev + 1);
    } catch (err: any) {
      setSyncWarning(err.message || 'Không thể tạm dừng phiên.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReset = async () => {
    if (activeSessionId && phase === 'work' && (timerState === 'running' || timerState === 'paused')) {
      const confirmReset = window.confirm('Bạn có chắc chắn muốn hủy phiên tập trung hiện tại không?');
      if (!confirmReset) return;

      try {
        await api.abandonFocusSession(activeSessionId, 'Người dùng thiết lập lại đồng hồ');
        notifyOtherTabs();
      } catch (err: any) {
        console.warn('[FocusTimer] Reset abandon error:', err);
      }
    }

    setTimerState('ready');
    const dur = getPhaseDurationSeconds(mode, phase, customMinutes, customBreakMinutes);
    setTotalSeconds(dur);
    setSecondsRemaining(dur);
    targetEndTimeRef.current = null;
    setActiveSessionId(null);
  };

  const completePlanItemHelper = useCallback(async () => {
    if (!queryPlanItemId || isPlanItemCompletedRef.current) return;
    if (!queryPlanId) {
      console.warn('[FocusTimer] Missing queryPlanId for planItemId:', queryPlanItemId);
      return;
    }
    try {
      await api.completeTomorrowPlanItem(queryPlanId, queryPlanItemId);
      isPlanItemCompletedRef.current = true;
    } catch (err: any) {
      console.error('[FocusTimer] completeTomorrowPlanItem failed:', err);
      setSyncWarning(err.message || 'Không thể cập nhật trạng thái mục kế hoạch chuẩn bị.');
    }
  }, [queryPlanId, queryPlanItemId]);

  const handleCompleteEarly = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);
    setSyncWarning(null);

    if (activeSessionId) {
      try {
        await api.completeFocusSession(activeSessionId, sessionNotes || 'Hoàn tất sớm theo yêu cầu');
        await completePlanItemHelper();
        setTimerState('completed');
        confetti({ particleCount: 90, spread: 60 });
        playTone();
        notifyOtherTabs();
      } catch (err: any) {
        setSyncWarning(err.message || 'Không thể ghi nhận hoàn tất phiên.');
      } finally {
        setIsActionLoading(false);
      }
    } else {
      await completePlanItemHelper();
      setTimerState('completed');
      confetti({ particleCount: 90, spread: 60 });
      playTone();
      setIsActionLoading(false);
    }
  };

  const handleAbandon = async () => {
    const confirmAbandon = window.confirm('Bạn có chắc muốn hủy phiên học tập trung này không?');
    if (!confirmAbandon) return;

    setTimerState('abandoned');
    targetEndTimeRef.current = null;

    if (activeSessionId) {
      try {
        await api.abandonFocusSession(activeSessionId, sessionNotes || 'Người dùng hủy giữa chừng');
        notifyOtherTabs();
      } catch {}
    }
  };

  // Timestamp-driven countdown tick
  useEffect(() => {
    let interval: any;
    if ((timerState === 'running' || timerState === 'break') && targetEndTimeRef.current) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current! - Date.now()) / 1000));
        setSecondsRemaining(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          playTone();
          if (phase === 'work') {
            // Transition to break
            if (activeSessionId) {
              api.completeFocusSession(activeSessionId, sessionNotes || 'Hoàn thành phiên tập trung')
                .then(async () => {
                  await completePlanItemHelper();
                  notifyOtherTabs();
                })
                .catch(() => {});
              setActiveSessionId(null);
            } else {
              completePlanItemHelper();
            }
            setPhase('break');
            const breakSecs = getPhaseDurationSeconds(mode, 'break', customMinutes, customBreakMinutes);
            setTotalSeconds(breakSecs);
            setSecondsRemaining(breakSecs);
            setTimerState('break');
            targetEndTimeRef.current = Date.now() + breakSecs * 1000;
            confetti({ particleCount: 70, spread: 60 });
          } else {
            // Break completed
            setTimerState('completed');
            targetEndTimeRef.current = null;
            confetti({ particleCount: 50, spread: 45 });
          }
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [timerState, phase, mode, activeSessionId, sessionNotes, customMinutes, customBreakMinutes, completePlanItemHelper, playTone, getPhaseDurationSeconds]);

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const progressRatio = totalSeconds > 0 ? (totalSeconds - secondsRemaining) / totalSeconds : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142319] border border-[rgba(34,197,94,0.25)] text-xs font-bold text-[#86EFAC] hover:text-[#F3FAF5] transition-all cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại trang trước</span>
        </button>

        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#101A13] border border-[rgba(34,197,94,0.3)] text-xs font-bold text-[#86EFAC]">
          <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
          <span>Hẹn Giờ Tập Trung</span>
        </div>
      </div>

      {/* Top Banner */}
      <div className="text-center space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-black text-[#F3FAF5] tracking-wide">
          Không Gian Tự Học & Tập Trung Cao Độ
        </h1>
        <p className="text-xs sm:text-sm text-[#A9B8AE] max-w-md mx-auto">
          Tối ưu hóa khả năng ghi nhớ và tập trung bằng chu kỳ học tập khoa học cùng Jami.
        </p>
      </div>

      {/* Linked Tomorrow Plan Item Banner */}
      {queryPlanItemId && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0C1F16] via-[#10291B] to-[#0A1A10] border-2 border-[#22C55E]/40 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#14532D] border border-[#22C55E]/40 flex items-center justify-center text-[#86EFAC] shrink-0">
              <Sparkles className="w-5 h-5 text-[#22C55E]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[10px] font-black text-[#86EFAC] uppercase tracking-wider">
                <span>Kế Hoạch Chuẩn Bị Tối Nay</span>
                {querySubject && <span className="text-[#F3FAF5]">• {querySubject}</span>}
              </div>
              <div className="text-xs sm:text-sm font-black text-[#F3FAF5]">
                {queryTitle || 'Mục chuẩn bị bài'}
              </div>
              <div className="text-[11px] text-[#A9B8AE]">
                Thời lượng đề xuất: {queryMinutes || 25} phút
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate(returnTo)}
            className="text-xs text-[#86EFAC] hover:underline font-bold shrink-0"
          >
            Đổi mục khác
          </button>
        </div>
      )}

      {/* Linked Task Banner */}
      {linkedTask && !queryPlanItemId && (
        <div className="p-4 rounded-2xl bg-[#101A13] border border-[#22C55E]/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-[#22C55E] shrink-0" />
            <div>
              <div className="text-xs font-black text-[#F3FAF5]">{linkedTask.title}</div>
              <div className="text-[11px] text-[#A9B8AE]">
                Môn: {linkedTask.subjectName || querySubject || 'Tự học'} • Ước tính: {linkedTask.estimatedMinutes} phút
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate(`/tasks/${linkedTask.id}`)}
            className="text-xs text-[#86EFAC] hover:underline font-bold shrink-0"
          >
            Chi tiết nhiệm vụ
          </button>
        </div>
      )}

      {/* Sync / Offline Warning Alert */}
      {syncWarning && (
        <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{syncWarning}</span>
        </div>
      )}

      {/* Task Linking Combobox */}
      <div className="bg-[#0B120D] p-3 rounded-2xl border border-[rgba(34,197,94,0.2)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-[#86EFAC] font-bold">
          <BookOpen className="w-4 h-4 text-[#22C55E]" />
          <span>Liên kết nhiệm vụ / Kế hoạch:</span>
        </div>
        <select
          value={linkedTaskId || (queryPlanItemId ? `plan_${queryPlanItemId}` : '')}
          onChange={(e) => {
            const val = e.target.value || undefined;
            if (val && val.startsWith('plan_')) {
              setLinkedTaskId(undefined);
              setLinkedTask(null);
            } else {
              setLinkedTaskId(val);
              if (!val) setLinkedTask(null);
            }
          }}
          className="bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5] max-w-xs md:max-w-md truncate"
        >
          {queryPlanItemId && (
            <option value={`plan_${queryPlanItemId}`}>
              🎯 [Kế hoạch tối nay] {querySubject ? `${querySubject} - ` : ''}{queryTitle || 'Mục chuẩn bị'} ({queryMinutes || 25}p)
            </option>
          )}
          <option value="">-- Tập trung tự do (không liên kết bài tập) --</option>
          {tasksList.map((t) => (
            <option key={t.id} value={t.id}>
              [{t.subjectName || 'Môn học'}] {t.title} ({t.estimatedMinutes}p)
            </option>
          ))}
          {linkedTaskId && !tasksList.some((t) => t.id === linkedTaskId) && (
            <option value={linkedTaskId}>
              [{linkedTask?.subjectName || querySubject || 'Nhiệm vụ'}] {linkedTask?.title || queryTitle || linkedTaskId} ({linkedTask?.estimatedMinutes || queryMinutes || 25}p)
            </option>
          )}
        </select>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex justify-center">
        <div className="bg-[#0B120D] p-1.5 rounded-2xl border border-[rgba(34,197,94,0.2)] flex flex-wrap items-center justify-center gap-1.5 shadow-xl">
          <button
            onClick={() => handleSwitchMode('15')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === '15'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            ⚡ 15 Phút
          </button>
          <button
            onClick={() => handleSwitchMode('25')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === '25' || mode === '25_5'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            🍅 25 Phút (Pomodoro)
          </button>
          <button
            onClick={() => handleSwitchMode('45')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === '45' || mode === '45_10'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            🎯 45 Phút (Tiết học chuẩn)
          </button>
          <button
            onClick={() => handleSwitchMode('60')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === '60'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            🧠 60 Phút (Luyện sâu)
          </button>
          <button
            onClick={() => handleSwitchMode('custom')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === 'custom'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            ⚙️ Tùy Chỉnh
          </button>
        </div>
      </div>

      {/* Custom Duration Controls */}
      {mode === 'custom' && timerState === 'ready' && (
        <div className="bg-[#0B120D] p-4 rounded-2xl border border-[rgba(34,197,94,0.2)] flex flex-wrap items-center justify-center gap-6 text-xs text-[#A9B8AE]">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[#F3FAF5]">Thời gian học:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const m = Math.max(5, customMinutes - 5);
                  setCustomMinutes(m);
                  setTotalSeconds(m * 60);
                  setSecondsRemaining(m * 60);
                }}
                className="w-7 h-7 rounded-lg bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] font-black cursor-pointer hover:border-[#22C55E]"
              >
                -
              </button>
              <input
                type="number"
                min={5}
                max={180}
                value={customMinutes}
                onChange={(e) => {
                  const val = Math.min(180, Math.max(5, parseInt(e.target.value, 10) || 5));
                  setCustomMinutes(val);
                  setTotalSeconds(val * 60);
                  setSecondsRemaining(val * 60);
                }}
                className="w-14 text-center bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-lg py-1 font-black text-[#86EFAC]"
              />
              <button
                onClick={() => {
                  const m = Math.min(180, customMinutes + 5);
                  setCustomMinutes(m);
                  setTotalSeconds(m * 60);
                  setSecondsRemaining(m * 60);
                }}
                className="w-7 h-7 rounded-lg bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] font-black cursor-pointer hover:border-[#22C55E]"
              >
                +
              </button>
              <span>phút</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-bold text-[#F3FAF5]">Thời gian nghỉ:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCustomBreakMinutes((prev) => Math.max(1, prev - 1))}
                className="w-7 h-7 rounded-lg bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] font-black cursor-pointer hover:border-[#22C55E]"
              >
                -
              </button>
              <span className="w-10 text-center font-black text-[#86EFAC]">{customBreakMinutes}</span>
              <button
                onClick={() => setCustomBreakMinutes((prev) => Math.min(60, prev + 1))}
                className="w-7 h-7 rounded-lg bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] font-black cursor-pointer hover:border-[#22C55E]"
              >
                +
              </button>
              <span>phút</span>
            </div>
          </div>
        </div>
      )}

      {/* Circular Timer Main Card */}
      <div className="bg-[#0B120D] p-8 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-2xl flex flex-col items-center justify-center space-y-6 relative overflow-hidden">
        {/* Phase Pill */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {phase === 'work' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#14532D]/80 border border-[#22C55E]/40 text-xs font-bold text-[#86EFAC]">
                <Flame className="w-3.5 h-3.5 text-[#22C55E]" />
                Phiên Học Tập
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-700 text-xs font-bold text-cyan-300">
                <Coffee className="w-3.5 h-3.5" />
                Phiên Nghỉ Ngơi
              </span>
            )}
          </div>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#A9B8AE] hover:text-[#F3FAF5] transition-all cursor-pointer"
            title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Circular Progress Display */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background Ring */}
            <circle
              cx="50"
              cy="50"
              r="44"
              className="stroke-[#101A13]"
              strokeWidth="5"
              fill="transparent"
            />
            {/* Foreground Ring */}
            <circle
              cx="50"
              cy="50"
              r="44"
              className={`transition-all duration-300 ${
                phase === 'work' ? 'stroke-[#22C55E]' : 'stroke-cyan-400'
              }`}
              strokeWidth="5"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 * (1 - progressRatio)}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          {/* Center Digital Clock */}
          <div className="absolute flex flex-col items-center justify-center text-center space-y-1">
            <span className="text-4xl sm:text-5xl font-black text-[#F3FAF5] font-mono tracking-tight">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
            <span className="text-xs text-[#A9B8AE] capitalize font-medium">
              {timerState === 'ready' && 'Sẵn sàng'}
              {timerState === 'running' && 'Đang tập trung...'}
              {timerState === 'paused' && `Đã tạm dừng (${pauseCount})`}
              {timerState === 'break' && 'Thư giãn nào!'}
              {timerState === 'completed' && 'Hoàn thành tuyệt vời!'}
              {timerState === 'abandoned' && 'Đã hủy'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {timerState === 'ready' && (
            <button
              onClick={handleStart}
              disabled={isActionLoading}
              className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-sm font-black shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer disabled:opacity-50 jami-btn-glow"
            >
              <Play className="w-5 h-5 fill-[#050806]" />
              <span>Bắt Đầu Tập Trung</span>
            </button>
          )}

          {timerState === 'running' && (
            <button
              onClick={handlePause}
              disabled={isActionLoading}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-[#050806] text-sm font-black shadow-lg shadow-amber-500/20 transition-all cursor-pointer jami-btn"
            >
              <Pause className="w-4 h-4 fill-[#050806]" />
              <span>Tạm Dừng</span>
            </button>
          )}

          {timerState === 'paused' && (
            <button
              onClick={handleStart}
              disabled={isActionLoading}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-sm font-black shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer jami-btn-glow"
            >
              <Play className="w-4 h-4 fill-[#050806]" />
              <span>Tiếp Tục</span>
            </button>
          )}

          {(timerState === 'running' || timerState === 'paused') && (
            <>
              <button
                onClick={handleCompleteEarly}
                disabled={isActionLoading}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold transition-all cursor-pointer jami-btn"
                title="Hoàn tất và lưu thời gian học"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Hoàn tất</span>
              </button>

              <button
                onClick={handleAbandon}
                disabled={isActionLoading}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-rose-950 hover:bg-rose-900 text-rose-300 text-xs font-bold border border-rose-800 transition-all cursor-pointer jami-btn"
                title="Hủy phiên này"
              >
                <XCircle className="w-4 h-4" />
                <span>Hủy</span>
              </button>
            </>
          )}

          {(timerState === 'completed' || timerState === 'abandoned') && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black transition-all cursor-pointer shadow-lg jami-btn-glow"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Bắt Đầu Phiên Mới</span>
            </button>
          )}

          {timerState === 'ready' && (
            <button
              onClick={handleReset}
              className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#A9B8AE] hover:text-[#F3FAF5] transition-all cursor-pointer"
              title="Đặt lại"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Session Notes Input */}
        {(timerState === 'running' || timerState === 'paused' || timerState === 'ready') && (
          <div className="w-full max-w-md pt-4 border-t border-[rgba(34,197,94,0.15)] space-y-2">
            <label className="text-xs font-bold text-[#A9B8AE]">Ghi chú cho phiên học này (tùy chọn):</label>
            <input
              type="text"
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="Ví dụ: Làm bài tập 1 đến 5 trang 42..."
              maxLength={250}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] placeholder-[#A9B8AE]/50 focus:border-[#22C55E] focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
};
