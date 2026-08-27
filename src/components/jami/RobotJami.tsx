import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Heart,
  Zap,
  X,
  ShieldCheck,
  Power,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useVoiceJami, VoiceState } from '../../context/VoiceJamiContext';

export type JamiState =
  | VoiceState
  | 'idle'
  | 'guiding'
  | 'focus'
  | 'reminding'
  | 'celebrating'
  | 'encouraging'
  | 'sleeping';

interface RobotJamiProps {
  state?: JamiState;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  bubbleMessage?: string;
  bubbleActions?: string[];
  onActionClick?: (action: string) => void;
  onClick?: () => void;
  showBubble?: boolean;
  showControlPanel?: boolean;
  className?: string;
  reducedMotion?: boolean;
}

export const RobotJami: React.FC<RobotJamiProps> = ({
  state: propState,
  size = 'md',
  bubbleMessage: propBubbleMessage,
  bubbleActions: propBubbleActions = [],
  onActionClick,
  onClick,
  showBubble = true,
  showControlPanel = false,
  className,
  reducedMotion = false,
}) => {
  const voiceContext = useVoiceJami();
  const [isBlinking, setIsBlinking] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(showControlPanel);
  const [localBubbleDismissed, setLocalBubbleDismissed] = useState(false);

  // Derive active state from voice context or fallback to prop
  const effectiveState: JamiState = voiceContext?.isHandsFreeEnabled
    ? voiceContext.state
    : propState || 'idle';

  const effectiveBubbleMessage =
    voiceContext?.isHandsFreeEnabled && voiceContext?.lastReply
      ? voiceContext.lastReply
      : propBubbleMessage;

  // Random blink effect
  useEffect(() => {
    if (effectiveState === 'sleeping' || effectiveState === 'focus' || effectiveState === 'disabled') return;
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 200);
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, [effectiveState]);

  const sizePixels = {
    sm: 64,
    md: 96,
    lg: 140,
    xl: 180,
  }[size];

  // Visual status mapping in Green / Emerald theme
  const stateBadge: Record<
    JamiState,
    { color: string; icon: any; label: string; glow: string }
  > = {
    disabled: { color: 'bg-zinc-700', icon: MicOff, label: 'Đang tắt', glow: 'bg-zinc-800' },
    requesting_permission: { color: 'bg-amber-500 animate-pulse', icon: Mic, label: 'Xin quyền micro...', glow: 'bg-amber-500' },
    armed: { color: 'bg-[#16A34A]', icon: Sparkles, label: 'Đang nghe "Jami ơi"', glow: 'bg-[#16A34A]' },
    wake_detected: { color: 'bg-[#22C55E] animate-ping', icon: Mic, label: 'Jami nghe đây!', glow: 'bg-[#22C55E]' },
    listening_command: { color: 'bg-[#22C55E] animate-pulse', icon: Mic, label: 'Đang nghe câu lệnh...', glow: 'bg-[#22C55E]' },
    connecting: { color: 'bg-[#15803D] animate-spin', icon: Zap, label: 'Đang kết nối...', glow: 'bg-[#15803D]' },
    thinking: { color: 'bg-[#15803D] animate-spin', icon: Zap, label: 'Đang suy nghĩ...', glow: 'bg-[#15803D]' },
    speaking: { color: 'bg-[#22C55E]', icon: Volume2, label: 'Đang phản hồi', glow: 'bg-[#22C55E]' },
    confirmation_pending: { color: 'bg-amber-500 animate-bounce', icon: AlertCircle, label: 'Chờ xác nhận', glow: 'bg-amber-500' },
    executing: { color: 'bg-[#16A34A] animate-spin', icon: Zap, label: 'Đang xử lý...', glow: 'bg-[#16A34A]' },
    suspended: { color: 'bg-zinc-600', icon: Clock, label: 'Tạm dừng khi ẩn tab', glow: 'bg-zinc-700' },
    idle: { color: 'bg-[#16A34A]', icon: Sparkles, label: 'Sẵn sàng', glow: 'bg-[#16A34A]' },
    guiding: { color: 'bg-[#16A34A]', icon: CheckCircle2, label: 'Hướng dẫn', glow: 'bg-[#16A34A]' },
    focus: { color: 'bg-amber-500', icon: Clock, label: 'Tập trung', glow: 'bg-amber-500' },
    reminding: { color: 'bg-orange-500', icon: AlertCircle, label: 'Nhắc nhở', glow: 'bg-orange-500' },
    celebrating: { color: 'bg-[#4ADE80]', icon: Heart, label: 'Tuyệt vời!', glow: 'bg-[#4ADE80]' },
    encouraging: { color: 'bg-[#22C55E]', icon: Sparkles, label: 'Cố lên nào!', glow: 'bg-[#22C55E]' },
    sleeping: { color: 'bg-[#526356]', icon: Clock, label: 'Nghỉ ngơi', glow: 'bg-[#526356]' },
    error: { color: 'bg-rose-500', icon: AlertCircle, label: 'Mất kết nối', glow: 'bg-rose-500' },
  };

  const badge = stateBadge[effectiveState] || stateBadge.idle;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('relative inline-flex flex-col items-center select-none', className)}>
      {/* Speech Bubble */}
      <AnimatePresence>
        {showBubble && effectiveBubbleMessage && !localBubbleDismissed && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute bottom-full mb-3 z-30 max-w-xs sm:max-w-sm w-max bg-[#0B120D]/95 backdrop-blur-md border border-[rgba(34,197,94,0.3)] rounded-2xl shadow-2xl p-3.5 text-xs sm:text-sm text-[#F3FAF5]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-[#86EFAC] text-xs mb-1">
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>{voiceContext?.isHandsFreeEnabled ? 'Jami giọng nói' : 'Jami chia sẻ'}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalBubbleDismissed(true);
                }}
                className="text-[#A9B8AE] hover:text-[#F3FAF5] p-0.5 rounded cursor-pointer"
                title="Đóng lời nhắc"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="leading-relaxed text-[#F3FAF5] font-medium whitespace-pre-line">
              {effectiveBubbleMessage}
            </p>

            {/* Pending Action Confirmation Card inside Bubble */}
            {voiceContext?.pendingProposal && (
              <div className="mt-2.5 p-2 bg-[#050806] rounded-xl border border-amber-500/40 space-y-2">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Xác nhận thao tác:</span>
                </div>
                <p className="text-[11px] text-[#A9B8AE] leading-snug">
                  {voiceContext.pendingProposal.previewText}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      voiceContext.confirmProposal('confirm');
                    }}
                    className="flex-1 py-1 px-2 rounded-lg bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs cursor-pointer text-center"
                  >
                    Đồng ý
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      voiceContext.confirmProposal('reject');
                    }}
                    className="py-1 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[#A9B8AE] font-bold text-xs cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}

            {/* Bubble Action Quick Buttons */}
            {propBubbleActions.length > 0 && !voiceContext?.pendingProposal && (
              <div className="mt-2.5 pt-2 border-t border-[rgba(34,197,94,0.2)] flex flex-wrap gap-1.5">
                {propBubbleActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onActionClick?.(action);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] font-bold text-[11px] transition-colors cursor-pointer border border-[#22C55E]/30"
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}

            {/* Bubble Tail */}
            <div className="absolute -bottom-2 right-8 w-4 h-4 bg-[#0B120D] border-r border-b border-[rgba(34,197,94,0.3)] transform rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Robot Avatar */}
      <div
        onClick={() => {
          if (onClick) onClick();
          else setIsPanelOpen(!isPanelOpen);
        }}
        className={cn(
          'relative cursor-pointer transition-transform group',
          !reducedMotion && 'hover:scale-105 active:scale-95'
        )}
        style={{ width: sizePixels, height: sizePixels }}
        role="button"
        tabIndex={0}
        aria-label={`Trợ lý Robot Jami - ${badge.label}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (onClick) onClick();
            else setIsPanelOpen(!isPanelOpen);
          }
        }}
      >
        {/* Glow ambient background */}
        <div
          className={cn(
            'absolute inset-0 rounded-full blur-xl opacity-40 transition-opacity group-hover:opacity-75',
            badge.glow
          )}
        />

        {/* Robot Head Body */}
        <div className="relative w-full h-full rounded-full bg-gradient-to-b from-[#101A13] via-[#0B120D] to-[#050806] border-2 border-[#22C55E]/60 shadow-2xl p-2 flex flex-col items-center justify-center overflow-hidden">
          {/* Top Antenna */}
          <div
            className={cn(
              'absolute -top-1 w-2.5 h-2.5 rounded-full ring-2 ring-[#050806] shadow-sm',
              effectiveState === 'armed' || effectiveState === 'listening_command'
                ? 'bg-[#22C55E] animate-ping'
                : 'bg-[#16A34A]'
            )}
          />

          {/* Visor / Face Screen */}
          <div className="w-4/5 h-3/5 rounded-2xl bg-[#050806] border border-[#22C55E]/30 relative flex items-center justify-around px-2 shadow-inner">
            {/* Left Eye */}
            <div
              className={cn(
                'w-3 h-4 sm:w-3.5 sm:h-5 rounded-full bg-[#22C55E] shadow-sm shadow-[#22C55E] transition-all',
                isBlinking && 'h-0.5 scale-y-10',
                effectiveState === 'disabled' && 'bg-zinc-600 shadow-none'
              )}
            />
            {/* Right Eye */}
            <div
              className={cn(
                'w-3 h-4 sm:w-3.5 sm:h-5 rounded-full bg-[#22C55E] shadow-sm shadow-[#22C55E] transition-all',
                isBlinking && 'h-0.5 scale-y-10',
                effectiveState === 'disabled' && 'bg-zinc-600 shadow-none'
              )}
            />

            {/* Expression Overlays */}
            {(effectiveState === 'thinking' || effectiveState === 'executing') && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#050806]/80 backdrop-blur-xs">
                <Zap className="w-4 h-4 text-[#86EFAC] animate-bounce" />
              </div>
            )}
            {effectiveState === 'speaking' && (
              <div className="absolute bottom-1 w-4 h-1.5 rounded-full bg-[#86EFAC] animate-pulse" />
            )}
            {effectiveState === 'listening_command' && (
              <div className="absolute bottom-1 flex items-center gap-0.5">
                <div className="w-1 h-2 bg-[#22C55E] animate-pulse" />
                <div className="w-1 h-3.5 bg-[#22C55E] animate-pulse" />
                <div className="w-1 h-2 bg-[#22C55E] animate-pulse" />
              </div>
            )}
          </div>
        </div>

        {/* Floating Status Badge */}
        <div
          className={cn(
            'absolute -bottom-1 -right-1 p-1 rounded-full text-white shadow-md ring-2 ring-[#050806]',
            badge.color
          )}
          title={badge.label}
        >
          <badge.icon className="w-3 h-3 text-[#050806]" />
        </div>
      </div>

      {/* Mini Control Modal / Panel */}
      <AnimatePresence>
        {isPanelOpen && voiceContext && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full mb-4 right-0 z-50 w-80 bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(34,197,94,0.2)] pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#14532D] text-[#86EFAC] flex items-center justify-center font-bold text-xs">
                  J
                </div>
                <span className="text-xs font-black text-[#F3FAF5]">Điều Khiển Robot Jami</span>
              </div>
              <button
                onClick={() => setIsPanelOpen(false)}
                className="text-[#A9B8AE] hover:text-[#F3FAF5] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hands-Free Toggle Button */}
            <div className="flex items-center justify-between bg-[#101A13] p-2.5 rounded-2xl border border-[rgba(34,197,94,0.2)]">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-3 h-3 rounded-full',
                    voiceContext.isHandsFreeEnabled ? 'bg-[#22C55E] animate-pulse' : 'bg-zinc-600'
                  )}
                />
                <div>
                  <div className="text-xs font-bold text-[#F3FAF5]">
                    {voiceContext.isHandsFreeEnabled ? 'Đang bật rảnh tay' : 'Chế độ rảnh tay'}
                  </div>
                  <div className="text-[10px] text-[#A9B8AE]">
                    {voiceContext.isHandsFreeEnabled
                      ? `Thời lượng: ${formatDuration(voiceContext.sessionDuration)}`
                      : 'Nói "Jami ơi" để gọi robot'}
                  </div>
                </div>
              </div>

              {voiceContext.isHandsFreeEnabled ? (
                <button
                  onClick={voiceContext.disableHandsFree}
                  className="px-2.5 py-1 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Power className="w-3 h-3" />
                  <span>Tắt</span>
                </button>
              ) : (
                <button
                  onClick={voiceContext.enableHandsFree}
                  className="px-3 py-1.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs flex items-center gap-1 cursor-pointer shadow-md"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Bật</span>
                </button>
              )}
            </div>

            {/* Privacy & Transparency Badge */}
            <div className="p-2 bg-[#050806] rounded-xl border border-[rgba(34,197,94,0.15)] text-[10px] text-[#A9B8AE] space-y-1">
              <div className="flex items-center gap-1 text-[#86EFAC] font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Quyền riêng tư & Giới hạn kỹ thuật</span>
              </div>
              <p className="leading-snug">
                Nhận dạng từ khóa & giọng nói qua Web Speech API (do trình duyệt xử lý). Không truyền âm thanh liên tục tới bên thứ 3.
              </p>
              <p className="leading-snug text-zinc-500">
                * Lưu ý: Trình duyệt web sẽ tạm dừng nghe khi bạn đóng hoặc ẩn tab.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
