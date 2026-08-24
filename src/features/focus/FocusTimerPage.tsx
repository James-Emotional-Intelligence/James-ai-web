import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Clock,
  Volume2,
  VolumeX,
  Flame,
  Coffee,
  XCircle,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { FocusSession } from '../../../shared/types';
import { RobotJami } from '../../components/jami/RobotJami';
import confetti from 'canvas-confetti';

type TimerMode = '45_10' | '25_5' | 'custom';
type TimerPhase = 'work' | 'break';

export const FocusTimerPage: React.FC = () => {
  const [mode, setMode] = useState<TimerMode>('45_10');
  const [phase, setPhase] = useState<TimerPhase>('work');
  const [customMinutes] = useState(30);

  const getPhaseDurationSeconds = (m: TimerMode, p: TimerPhase, customM: number) => {
    if (m === '25_5') return p === 'work' ? 25 * 60 : 5 * 60;
    if (m === '45_10') return p === 'work' ? 45 * 60 : 10 * 60;
    return p === 'work' ? customM * 60 : 5 * 60;
  };

  const [totalSeconds, setTotalSeconds] = useState(45 * 60);
  const [secondsRemaining, setSecondsRemaining] = useState(45 * 60);
  const [timerState, setTimerState] = useState<'ready' | 'running' | 'paused' | 'break' | 'completed' | 'abandoned'>('ready');
  const [pauseCount, setPauseCount] = useState(0);
  const [sessionNotes, setSessionNotes] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Timestamp-based truth
  const targetEndTimeRef = useRef<number | null>(null);

  // Load current active session on mount
  useEffect(() => {
    api.getCurrentFocusSession()
      .then((res) => {
        if (res.session) {
          setActiveSessionId(res.session.id);
          setTimerState('running');
        }
      })
      .catch(() => {});
  }, []);

  // Audio tone helper
  const playTone = () => {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    } catch {}
  };

  const handleSwitchMode = (newMode: TimerMode) => {
    setMode(newMode);
    setPhase('work');
    setTimerState('ready');
    const dur = getPhaseDurationSeconds(newMode, 'work', customMinutes);
    setTotalSeconds(dur);
    setSecondsRemaining(dur);
    targetEndTimeRef.current = null;
  };

  const handleStart = async () => {
    const isWork = phase === 'work';
    setTimerState(isWork ? 'running' : 'break');
    targetEndTimeRef.current = Date.now() + secondsRemaining * 1000;
    playTone();

    try {
      if (!activeSessionId && isWork) {
        const res = await api.startFocusSession(undefined, mode, Math.round(totalSeconds / 60));
        setActiveSessionId(res.session.id);
      } else if (activeSessionId && timerState === 'paused') {
        await api.resumeFocusSession(activeSessionId);
      }
    } catch {}
  };

  const handlePause = async () => {
    setTimerState('paused');
    setPauseCount((prev) => prev + 1);
    targetEndTimeRef.current = null;

    if (activeSessionId) {
      try {
        await api.pauseFocusSession(activeSessionId);
      } catch {}
    }
  };

  const handleReset = () => {
    setTimerState('ready');
    const dur = getPhaseDurationSeconds(mode, phase, customMinutes);
    setSecondsRemaining(dur);
    targetEndTimeRef.current = null;
    setActiveSessionId(null);
  };

  const handleCompleteEarly = async () => {
    setTimerState('completed');
    confetti({ particleCount: 90, spread: 60 });
    playTone();

    if (activeSessionId) {
      try {
        await api.completeFocusSession(activeSessionId, sessionNotes);
      } catch {}
    }
  };

  const handleAbandon = async () => {
    setTimerState('abandoned');
    if (activeSessionId) {
      try {
        await api.abandonFocusSession(activeSessionId, 'Người dùng hủy giữa chừng');
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
              api.completeFocusSession(activeSessionId, 'Hoàn thành phiên tập trung').catch(() => {});
            }
            setPhase('break');
            const breakSecs = mode === '45_10' ? 10 * 60 : 5 * 60;
            setTotalSeconds(breakSecs);
            setSecondsRemaining(breakSecs);
            setTimerState('break');
            targetEndTimeRef.current = Date.now() + breakSecs * 1000;
            confetti({ particleCount: 70, spread: 60 });
          } else {
            // Break completed
            setTimerState('completed');
            targetEndTimeRef.current = null;
          }
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [timerState, phase, mode, activeSessionId]);

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const progressRatio = totalSeconds > 0 ? (totalSeconds - secondsRemaining) / totalSeconds : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="text-center space-y-1.5">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#101A13] border border-[rgba(34,197,94,0.3)] text-xs font-bold text-[#86EFAC]">
          <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
          <span>Hẹn Giờ Tập Trung</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#F3FAF5] tracking-wide">
          Không Gian Tự Học & Tập Trung Cao Độ
        </h1>
        <p className="text-xs sm:text-sm text-[#A9B8AE] max-w-md mx-auto">
          Tối ưu hóa khả năng ghi nhớ và tập trung bằng chu kỳ học tập và nghỉ ngơi khoa học cùng Jami.
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex justify-center">
        <div className="bg-[#0B120D] p-1.5 rounded-2xl border border-[rgba(34,197,94,0.2)] flex items-center gap-2 shadow-xl overflow-x-auto">
          <button
            onClick={() => handleSwitchMode('45_10')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === '45_10'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            45 Phút Học / 10 Phút Nghỉ (Khuyên dùng)
          </button>
          <button
            onClick={() => handleSwitchMode('25_5')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === '25_5'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            25 Phút Học / 5 Phút Nghỉ
          </button>
          <button
            onClick={() => handleSwitchMode('custom')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              mode === 'custom'
                ? 'bg-[#16A34A] text-[#050806] shadow-md shadow-[#16A34A]/25'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
            }`}
          >
            Tùy chỉnh
          </button>
        </div>
      </div>

      {/* Main Focus Clock & Robot Container */}
      <div className="bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-2xl p-8 sm:p-12 relative overflow-hidden flex flex-col items-center justify-center text-center space-y-8">
        {/* Phase Indicator Badge */}
        <div className="flex items-center gap-2">
          {phase === 'work' ? (
            <div className="px-4 py-1.5 rounded-full bg-[#101A13] border border-[rgba(34,197,94,0.3)] text-xs font-extrabold text-[#86EFAC] flex items-center gap-1.5 shadow-sm">
              <Flame className="w-4 h-4 text-[#22C55E]" />
              <span>Phiên Học Tập Trung</span>
            </div>
          ) : (
            <div className="px-4 py-1.5 rounded-full bg-[#14532D] border border-[#22C55E]/40 text-xs font-extrabold text-[#86EFAC] flex items-center gap-1.5 shadow-sm">
              <Coffee className="w-4 h-4 text-[#22C55E]" />
              <span>Thời Gian Nghỉ Ngơi & Uống Nước</span>
            </div>
          )}

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 text-[#A9B8AE] hover:text-[#F3FAF5] bg-[#101A13] border border-[rgba(34,197,94,0.18)] rounded-lg cursor-pointer transition-colors"
            title={isMuted ? 'Bật âm thanh báo hiệu' : 'Tắt âm thanh'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#86EFAC]" />}
          </button>
        </div>

        {/* Circular Progress & Clock Face */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="50%"
              cy="50%"
              r="45%"
              className="text-[#101A13] stroke-current"
              strokeWidth="10"
              fill="transparent"
            />
            <circle
              cx="50%"
              cy="50%"
              r="45%"
              className={phase === 'work' ? 'text-[#22C55E] stroke-current' : 'text-[#86EFAC] stroke-current'}
              strokeWidth="10"
              strokeDasharray={2 * Math.PI * 130}
              strokeDashoffset={2 * Math.PI * 130 * (1 - progressRatio)}
              strokeLinecap="round"
              fill="transparent"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-5xl sm:text-6xl font-black text-[#F3FAF5] font-mono tracking-tight drop-shadow-md">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </div>
            <div className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider mt-2">
              {timerState === 'running'
                ? 'Đang tập trung'
                : timerState === 'paused'
                ? 'Đang tạm dừng'
                : timerState === 'break'
                ? 'Đang nghỉ ngơi'
                : 'Sẵn sàng'}
            </div>
          </div>
        </div>

        {/* Floating Robot Jami Companion */}
        <div className="flex items-center justify-center">
          <RobotJami
            state={timerState === 'running' ? 'focus' : timerState === 'break' ? 'celebrating' : 'idle'}
            size="sm"
            bubbleMessage={
              timerState === 'running'
                ? 'Jami đang giữ không gian yên tĩnh cho bạn tập trung!'
                : timerState === 'paused'
                ? 'Bạn đang tạm dừng. Hãy quay lại sớm nhé!'
                : 'Nhấn Bắt đầu khi bạn đã sẵn sàng.'
            }
            showBubble={timerState !== 'running'}
          />
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {timerState === 'ready' && (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-black text-sm shadow-xl shadow-[#16A34A]/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-5 h-5 fill-[#050806]" />
              <span>Bắt đầu phiên học</span>
            </button>
          )}

          {timerState === 'running' && (
            <>
              <button
                onClick={handlePause}
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-[#050806] font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                <span>Tạm dừng</span>
              </button>

              <button
                onClick={handleCompleteEarly}
                className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Hoàn thành sớm</span>
              </button>

              <button
                onClick={handleAbandon}
                className="p-3 text-[#A9B8AE] hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
                title="Hủy phiên học"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </>
          )}

          {timerState === 'paused' && (
            <>
              <button
                onClick={handleStart}
                className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-[#050806]" />
                <span>Tiếp tục học</span>
              </button>

              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] font-bold text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Đặt lại</span>
              </button>
            </>
          )}

          {timerState === 'completed' && (
            <div className="space-y-4 w-full max-w-md">
              <div className="p-4 rounded-2xl bg-[#101A13] border border-[#22C55E]/40 text-xs text-[#86EFAC] font-semibold">
                🎉 Tuyệt vời! Bạn đã hoàn thành phiên tập trung ({Math.round(totalSeconds / 60)} phút).
              </div>
              <textarea
                placeholder="Ghi chú nhanh cảm nghĩ hoặc kết quả đạt được..."
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                rows={2}
                className="w-full text-xs p-3 bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
              />
              <button
                onClick={handleReset}
                className="w-full py-3 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                Bắt đầu phiên học mới
              </button>
            </div>
          )}
        </div>

        {/* Stats footer in timer */}
        <div className="flex items-center gap-6 text-xs text-[#A9B8AE] pt-4 border-t border-[rgba(34,197,94,0.18)]">
          <div>Số lần tạm dừng: <strong className="text-[#F3FAF5]">{pauseCount}</strong></div>
          <div>Mục tiêu hôm nay: <strong className="text-[#86EFAC]">45/120 phút</strong></div>
        </div>
      </div>
    </div>
  );
};
