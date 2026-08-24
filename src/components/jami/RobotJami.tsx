import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Mic, Volume2, CheckCircle2, AlertCircle, Clock, Heart, Zap, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type JamiState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'guiding'
  | 'focus'
  | 'reminding'
  | 'celebrating'
  | 'encouraging'
  | 'sleeping'
  | 'error';

interface RobotJamiProps {
  state?: JamiState;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  bubbleMessage?: string;
  bubbleActions?: string[];
  onActionClick?: (action: string) => void;
  onClick?: () => void;
  showBubble?: boolean;
  className?: string;
  reducedMotion?: boolean;
}

export const RobotJami: React.FC<RobotJamiProps> = ({
  state = 'idle',
  size = 'md',
  bubbleMessage,
  bubbleActions = [],
  onActionClick,
  onClick,
  showBubble = true,
  className,
  reducedMotion = false,
}) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [localBubbleDismissed, setLocalBubbleDismissed] = useState(false);

  // Random blink effect
  useEffect(() => {
    if (state === 'sleeping' || state === 'focus') return;
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 200);
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, [state]);

  const sizePixels = {
    sm: 64,
    md: 96,
    lg: 140,
    xl: 180,
  }[size];

  // Visual status colors & icons in Emerald / Green theme
  const stateBadge = {
    idle: { color: 'bg-[#16A34A]', icon: Sparkles, label: 'Sẵn sàng' },
    listening: { color: 'bg-[#22C55E] animate-pulse', icon: Mic, label: 'Đang nghe...' },
    thinking: { color: 'bg-[#15803D] animate-spin', icon: Zap, label: 'Đang suy nghĩ...' },
    speaking: { color: 'bg-[#22C55E]', icon: Volume2, label: 'Đang nói' },
    guiding: { color: 'bg-[#16A34A]', icon: CheckCircle2, label: 'Hướng dẫn' },
    focus: { color: 'bg-amber-500', icon: Clock, label: 'Tập trung' },
    reminding: { color: 'bg-orange-500', icon: AlertCircle, label: 'Nhắc nhở' },
    celebrating: { color: 'bg-[#4ADE80]', icon: Heart, label: 'Tuyệt vời!' },
    encouraging: { color: 'bg-[#22C55E]', icon: Sparkles, label: 'Cố lên nào!' },
    sleeping: { color: 'bg-[#526356]', icon: Clock, label: 'Nghỉ ngơi' },
    error: { color: 'bg-rose-500', icon: AlertCircle, label: 'Mất kết nối' },
  }[state];

  return (
    <div className={cn('relative inline-flex flex-col items-center select-none', className)}>
      {/* Speech Bubble */}
      <AnimatePresence>
        {showBubble && bubbleMessage && !localBubbleDismissed && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute bottom-full mb-3 z-30 max-w-xs sm:max-w-sm w-max bg-[#0B120D]/95 backdrop-blur-md border border-[rgba(34,197,94,0.3)] rounded-2xl shadow-2xl p-3.5 text-xs sm:text-sm text-[#F3FAF5]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-[#86EFAC] text-xs mb-1">
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Jami chia sẻ</span>
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
            <p className="leading-relaxed text-[#F3FAF5] font-medium">{bubbleMessage}</p>

            {bubbleActions.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-[rgba(34,197,94,0.2)] flex flex-wrap gap-1.5">
                {bubbleActions.map((action, idx) => (
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
        onClick={onClick}
        className={cn(
          'relative cursor-pointer transition-transform group',
          !reducedMotion && 'hover:scale-105 active:scale-95'
        )}
        style={{ width: sizePixels, height: sizePixels }}
        role="button"
        tabIndex={0}
        aria-label={`Trợ lý Jami - Trạng thái ${stateBadge.label}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClick?.();
          }
        }}
      >
        {/* Glow ambient background */}
        <div
          className={cn(
            'absolute inset-0 rounded-full blur-xl opacity-40 transition-opacity group-hover:opacity-75',
            state === 'focus' ? 'bg-amber-500' : 'bg-[#16A34A]'
          )}
        />

        {/* Robot Head Body */}
        <div className="relative w-full h-full rounded-full bg-gradient-to-b from-[#101A13] via-[#0B120D] to-[#050806] border-2 border-[#22C55E]/60 shadow-2xl p-2 flex flex-col items-center justify-center overflow-hidden">
          {/* Top Antenna */}
          <div className="absolute -top-1 w-2.5 h-2.5 rounded-full bg-[#22C55E] ring-2 ring-[#050806] shadow-sm shadow-[#22C55E]" />

          {/* Visor / Face Screen */}
          <div className="w-4/5 h-3/5 rounded-2xl bg-[#050806] border border-[#22C55E]/30 relative flex items-center justify-around px-2 shadow-inner">
            {/* Left Eye */}
            <div
              className={cn(
                'w-3 h-4 sm:w-3.5 sm:h-5 rounded-full bg-[#22C55E] shadow-sm shadow-[#22C55E] transition-all',
                isBlinking && 'h-0.5 scale-y-10'
              )}
            />
            {/* Right Eye */}
            <div
              className={cn(
                'w-3 h-4 sm:w-3.5 sm:h-5 rounded-full bg-[#22C55E] shadow-sm shadow-[#22C55E] transition-all',
                isBlinking && 'h-0.5 scale-y-10'
              )}
            />

            {/* Expression Overlays */}
            {state === 'thinking' && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#050806]/80 backdrop-blur-xs">
                <Zap className="w-4 h-4 text-[#86EFAC] animate-bounce" />
              </div>
            )}
            {state === 'speaking' && (
              <div className="absolute bottom-1 w-4 h-1.5 rounded-full bg-[#86EFAC] animate-pulse" />
            )}
          </div>
        </div>

        {/* Floating Status Badge */}
        <div
          className={cn(
            'absolute -bottom-1 -right-1 p-1 rounded-full text-white shadow-md ring-2 ring-[#050806]',
            stateBadge.color
          )}
          title={stateBadge.label}
        >
          <stateBadge.icon className="w-3 h-3 text-[#050806]" />
        </div>
      </div>
    </div>
  );
};
