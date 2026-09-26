import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  Mic,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Heart,
  Zap,
  X,
  ShieldCheck,
  Power,
  MicOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useVoiceJami } from '../../context/VoiceJamiContext';
import { useTheme } from '../../context/ThemeContext';
import { JamiState, RobotVisualState, RobotDisplayMode, mapJamiStateToVisual } from './robot-types';
import { PremiumFaceMode } from './premium/jami-premium-geometry';
import { JamiRobotSvg } from './JamiRobotSvg';
import { JamiPremiumRobotVisual } from './premium/JamiPremiumRobotVisual';
import { useNaturalBlink } from './useNaturalBlink';
import { useRobotGaze } from './useRobotGaze';
import { useJamiLipSync } from './useJamiLipSync';

export type { JamiState, RobotVisualState, RobotDisplayMode, PremiumFaceMode };

interface RobotJamiProps {
  state?: JamiState;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  displayMode?: RobotDisplayMode;
  renderer?: 'premium' | 'legacy';
  faceMode?: PremiumFaceMode;
  bubblePlacement?: 'auto' | 'top' | 'bottom' | 'flow';
  bubbleMessage?: string;
  bubbleActions?: string[];
  onActionClick?: (action: string) => void;
  onClick?: () => void;
  showBubble?: boolean;
  showControlPanel?: boolean;
  isDragging?: boolean;
  dragVelocityX?: number;
  dragVelocityY?: number;
  className?: string;
  reducedMotion?: boolean;
}

export const RobotJami: React.FC<RobotJamiProps> = ({
  state: propState,
  size = 'md',
  displayMode = 'full',
  renderer = 'premium',
  faceMode = 'source',
  bubblePlacement = 'auto',
  bubbleMessage: propBubbleMessage,
  bubbleActions: propBubbleActions = [],
  onActionClick,
  onClick,
  showBubble = true,
  showControlPanel = false,
  isDragging = false,
  dragVelocityX = 0,
  dragVelocityY = 0,
  className,
  reducedMotion: propReducedMotion = false,
}) => {
  const voiceContext = useVoiceJami();
  const systemReducedMotion = useReducedMotion();
  const effectiveReducedMotion = propReducedMotion || !!systemReducedMotion;

  let isHaiBaTrung = false;
  try {
    const themeContext = useTheme();
    isHaiBaTrung = themeContext?.isHaiBaTrung || false;
  } catch {}

  const robotRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(showControlPanel);
  const [localBubbleDismissed, setLocalBubbleDismissed] = useState(false);
  const [useLegacyFallback, setUseLegacyFallback] = useState(false);

  // Derive active state: priority to voiceContext state when hands-free is enabled
  const effectiveState: JamiState = voiceContext?.isHandsFreeEnabled
    ? voiceContext.state
    : propState || 'idle';

  const visualState: RobotVisualState = mapJamiStateToVisual(effectiveState);

  const effectiveBubbleMessage =
    voiceContext?.isHandsFreeEnabled && voiceContext?.lastReply
      ? voiceContext.lastReply
      : propBubbleMessage;

  // Active speaking indicator
  const isSpeaking = voiceContext?.isSpeaking || effectiveState === 'speaking';
  const utteranceText = voiceContext?.currentUtteranceText || effectiveBubbleMessage || '';

  // 1. Natural Blink Hook
  const { blinkProgress } = useNaturalBlink({
    state: visualState,
    reducedMotion: effectiveReducedMotion,
  });

  // 2. Pointer Gaze Hook
  const { irisX, irisY, headTiltX, headTiltY } = useRobotGaze({
    robotRef,
    state: visualState,
    reducedMotion: effectiveReducedMotion,
  });

  // 3. Vietnamese Lip-Sync Hook
  const { mouthShape, speechEnergy } = useJamiLipSync({
    isSpeaking,
    text: utteranceText,
    remoteAudioElement: voiceContext?.remoteAudioElement,
    remoteMediaStream: voiceContext?.remoteMediaStream,
    reducedMotion: effectiveReducedMotion,
  });

  // Proportional full-body sizes (839/1213 ≈ 0.6917) vs head-only (1:1)
  const sizeDimensions = {
    full: {
      sm: { width: 84, height: 122 },
      md: { width: 148, height: 214 },
      lg: { width: 210, height: 304 },
      xl: { width: 280, height: 405 },
    },
    head: {
      sm: { width: 40, height: 40 },
      md: { width: 54, height: 54 },
      lg: { width: 80, height: 80 },
      xl: { width: 110, height: 110 },
    },
  }[displayMode][size];

  // Visual status badge mappings
  const stateBadge: Record<
    JamiState,
    { color: string; icon: any; label: string; glow: string }
  > = {
    disabled: { color: 'bg-zinc-700', icon: MicOff, label: 'Đang tắt', glow: 'rgba(63,63,70,0.3)' },
    requesting_permission: { color: 'bg-amber-500 animate-pulse', icon: Mic, label: 'Xin quyền micro...', glow: 'rgba(245,158,11,0.5)' },
    armed: { color: 'bg-[#16A34A]', icon: Sparkles, label: 'Đang nghe "Jami ơi"', glow: 'rgba(34,197,94,0.5)' },
    wake_detected: { color: 'bg-[#22C55E] animate-ping', icon: Mic, label: 'Jami nghe đây!', glow: 'rgba(34,197,94,0.8)' },
    listening_command: { color: 'bg-[#22C55E] animate-pulse', icon: Mic, label: 'Đang nghe câu lệnh...', glow: 'rgba(34,197,94,0.6)' },
    connecting: { color: 'bg-[#15803D] animate-spin', icon: Zap, label: 'Đang kết nối...', glow: 'rgba(22,163,74,0.5)' },
    thinking: { color: 'bg-[#15803D] animate-spin', icon: Zap, label: 'Đang suy nghĩ...', glow: 'rgba(22,163,74,0.6)' },
    speaking: { color: 'bg-[#22C55E]', icon: Volume2, label: 'Đang phản hồi', glow: 'rgba(34,197,94,0.7)' },
    confirmation_pending: { color: 'bg-amber-500 animate-bounce', icon: AlertCircle, label: 'Chờ xác nhận', glow: 'rgba(245,158,11,0.7)' },
    executing: { color: 'bg-[#16A34A] animate-spin', icon: Zap, label: 'Đang xử lý...', glow: 'rgba(22,163,74,0.5)' },
    suspended: { color: 'bg-zinc-600', icon: Clock, label: 'Tạm dừng khi ẩn tab', glow: 'rgba(82,82,91,0.4)' },
    idle: { color: 'bg-[#16A34A]', icon: Sparkles, label: 'Sẵn sàng', glow: 'rgba(34,197,94,0.4)' },
    guiding: { color: 'bg-[#16A34A]', icon: CheckCircle2, label: 'Hướng dẫn', glow: 'rgba(34,197,94,0.4)' },
    focus: { color: 'bg-amber-500', icon: Clock, label: 'Tập trung', glow: 'rgba(245,158,11,0.4)' },
    reminding: { color: 'bg-orange-500', icon: AlertCircle, label: 'Nhắc nhở', glow: 'rgba(249,115,22,0.5)' },
    celebrating: { color: 'bg-[#4ADE80]', icon: Heart, label: 'Tuyệt vời!', glow: 'rgba(74,222,128,0.7)' },
    encouraging: { color: 'bg-[#22C55E]', icon: Sparkles, label: 'Cố lên nào!', glow: 'rgba(34,197,94,0.5)' },
    sleeping: { color: 'bg-[#526356]', icon: Clock, label: 'Nghỉ ngơi', glow: 'rgba(82,99,86,0.3)' },
    error: { color: 'bg-rose-500', icon: AlertCircle, label: 'Mất kết nối', glow: 'rgba(244,63,94,0.6)' },
  };

  const badge = stateBadge[effectiveState] || stateBadge.idle;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isPremiumActive = renderer === 'premium' && !useLegacyFallback;

  // Determine speech bubble placement classes
  const getBubblePositionClass = () => {
    if (bubblePlacement === 'bottom') {
      return 'top-full mt-3 left-1/2 -translate-x-1/2';
    }
    if (bubblePlacement === 'flow') {
      return 'relative mb-3 w-full';
    }
    // Default top / auto
    return 'absolute bottom-full mb-3 right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2';
  };

  return (
    <div className={cn('relative inline-flex flex-col items-center select-none', className)}>
      {/* Speech Bubble */}
      <AnimatePresence>
        {showBubble && effectiveBubbleMessage && !localBubbleDismissed && (
          <motion.div
            data-no-robot-drag="true"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className={cn(
              'z-30 max-w-[min(320px,calc(100vw-32px))] w-max bg-[#0B120D]/95 backdrop-blur-md border border-[rgba(34,197,94,0.35)] rounded-2xl shadow-2xl p-3.5 text-xs text-[#F3FAF5]',
              getBubblePositionClass()
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-[#86EFAC] text-xs mb-1">
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>{voiceContext?.isHandsFreeEnabled ? 'Jami giọng nói' : 'Jami chia sẻ'}</span>
              </div>
              <button
                data-no-robot-drag="true"
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

            <p className="leading-relaxed text-[#F3FAF5] font-medium whitespace-pre-line text-xs break-words">
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
                    data-no-robot-drag="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      voiceContext.confirmProposal('confirm');
                    }}
                    className="flex-1 py-1 px-2 rounded-lg bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs cursor-pointer text-center"
                  >
                    Đồng ý
                  </button>
                  <button
                    data-no-robot-drag="true"
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
                    data-no-robot-drag="true"
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
            {bubblePlacement !== 'flow' && (
              <div
                className={cn(
                  'absolute w-3 h-3 bg-[#0B120D] transform rotate-45',
                  bubblePlacement === 'bottom'
                    ? '-top-1.5 left-1/2 -translate-x-1/2 border-l border-t border-[rgba(34,197,94,0.35)]'
                    : '-bottom-1.5 right-8 sm:left-1/2 sm:-translate-x-1/2 border-r border-b border-[rgba(34,197,94,0.35)]'
                )}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Robot Character Host */}
      <div
        ref={robotRef}
        onClick={() => {
          if (isDragging) return;
          if (onClick) onClick();
          else setIsPanelOpen(!isPanelOpen);
        }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        className="relative cursor-pointer transition-transform flex items-center justify-center"
        style={{
          width: sizeDimensions.width,
          height: sizeDimensions.height,
        }}
        role="button"
        tabIndex={0}
        aria-label={`Trợ lý Robot Jami - ${badge.label}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onClick) onClick();
            else setIsPanelOpen(!isPanelOpen);
          }
        }}
      >
        {/* Subtle Ambient Radial Glow */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-25 transition-opacity group-hover:opacity-50 pointer-events-none"
          style={{ background: badge.glow }}
        />

        {/* Character Visual Renderer (Premium Image by default; SVG as Fallback) */}
        {isPremiumActive ? (
          <JamiPremiumRobotVisual
            width={sizeDimensions.width}
            height={sizeDimensions.height}
            displayMode={displayMode}
            faceMode={faceMode}
            state={visualState}
            isHovered={isHovered}
            isDragging={isDragging}
            dragVelocityX={dragVelocityX}
            dragVelocityY={dragVelocityY}
            mouthShape={mouthShape}
            speechEnergy={speechEnergy}
            blinkProgress={blinkProgress}
            irisX={irisX}
            irisY={irisY}
            headTiltX={headTiltX}
            headTiltY={headTiltY}
            isSpeaking={isSpeaking}
            reducedMotion={effectiveReducedMotion}
            onImageError={() => setUseLegacyFallback(true)}
            className="w-full h-full relative z-10"
          />
        ) : (
          <JamiRobotSvg
            state={visualState}
            mouthShape={mouthShape}
            irisX={irisX}
            irisY={irisY}
            headTiltX={headTiltX}
            headTiltY={headTiltY}
            blinkProgress={blinkProgress}
            isSpeaking={isSpeaking}
            speechEnergy={speechEnergy}
            displayMode={displayMode}
            reducedMotion={effectiveReducedMotion}
            className="w-full h-full relative z-10"
          />
        )}

        {/* Floating Status Badge */}
        <div
          className={cn(
            'absolute -bottom-1 -right-1 p-1 rounded-full text-white shadow-md ring-2 ring-[#050806] z-20',
            badge.color
          )}
          title={badge.label}
        >
          <badge.icon className="w-3 h-3 text-[#050806]" />
        </div>

        {/* Hai Ba Trung Theme Subtle Accent Badge */}
        {isHaiBaTrung && (
          <div
            className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-[#102B20] border border-[#D2A84A] text-[#E8C66A] shadow-md ring-2 ring-[#06130E] z-20 text-[10px] font-black pointer-events-none"
            title="Chủ đề Hai Bà Trưng"
          >
            <span>⚔️</span>
          </div>
        )}
      </div>

      {/* Mini Control Modal / Panel */}
      <AnimatePresence>
        {isPanelOpen && voiceContext && (
          <motion.div
            data-no-robot-drag="true"
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
                data-no-robot-drag="true"
                onClick={() => setIsPanelOpen(false)}
                className="text-[#A9B8AE] hover:text-[#F3FAF5] p-1 rounded-lg cursor-pointer"
                title="Đóng bảng điều khiển"
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
                  data-no-robot-drag="true"
                  onClick={voiceContext.disableHandsFree}
                  className="px-2.5 py-1 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Power className="w-3 h-3" />
                  <span>Tắt</span>
                </button>
              ) : (
                <button
                  data-no-robot-drag="true"
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
