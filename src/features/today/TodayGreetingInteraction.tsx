import React, { useState } from 'react';
import { Sparkles, Mic, MicOff, Send, RefreshCw, Volume2, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { RobotJami } from '../../components/jami/RobotJami';
import { UseTodayGreetingConversationResult } from './useTodayGreetingConversation';
import { useVoiceJami } from '../../context/VoiceJamiContext';

interface TodayGreetingInteractionProps {
  conversation: UseTodayGreetingConversationResult;
  studentName?: string;
  className?: string;
  compact?: boolean;
}

export const TodayGreetingInteraction: React.FC<TodayGreetingInteractionProps> = ({
  conversation,
  studentName,
  className = '',
  compact = false,
}) => {
  const {
    displayMessage,
    status,
    answerText,
    setAnswerText,
    handleSubmit,
    handleSkipOrDismiss,
    isThinking,
    hasReplied,
    questionItem,
    isListening,
    startListening,
    stopListening,
    speechError,
    isSpeechSupported,
  } = conversation;

  const voice = useVoiceJami();
  const [showManualInput, setShowManualInput] = useState(false);

  const robotState = isThinking ? 'thinking' : isListening ? 'listening_command' : hasReplied ? 'encouraging' : 'speaking';

  return (
    <div
      className={`relative w-full rounded-2xl bg-[#0F1912]/90 border border-[#22C55E]/25 p-4 sm:p-5 shadow-lg backdrop-blur-sm transition-all ${className}`}
      data-testid="today-greeting-interaction"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        {/* Robot Jami Avatar */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="relative">
            <RobotJami
              size={compact ? 'sm' : 'md'}
              displayMode="head"
              state={robotState}
              faceMode="source"
              showBubble={false}
            />
            {isListening && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500" />
              </span>
            )}
          </div>
          <div className="md:hidden">
            <span className="text-xs font-black text-[#22C55E] uppercase tracking-wider">
              Robot Jami
            </span>
          </div>
        </div>

        {/* Message and Voice Interactive Answering */}
        <div className="flex-1 w-full space-y-3">
          {/* Question / Reply Display */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#86EFAC]">
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>
                  {hasReplied ? 'Phản hồi từ Robot Jami' : 'Câu hỏi khởi động ngày mới'}
                </span>
              </div>
              {hasReplied && (
                <button
                  type="button"
                  onClick={() => voice?.speak(displayMessage)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#142319] hover:bg-[#1A2E21] text-[#86EFAC] text-[11px] font-medium border border-[#22C55E]/20 transition-all cursor-pointer"
                  title="Nghe lại phản hồi"
                  aria-label="Nghe lại phản hồi"
                >
                  <Volume2 className="w-3 h-3 text-[#22C55E]" />
                  <span className="hidden sm:inline">Nghe lại</span>
                </button>
              )}
            </div>

            <p className="text-sm sm:text-base font-bold text-[#F3FAF5] leading-relaxed">
              {displayMessage}
            </p>
          </div>

          {/* Voice-First Answering Section when Asking */}
          {status === 'asking' && (
            <div className="space-y-2.5 pt-1">
              {/* Spoken Transcript Live Preview */}
              {answerText && (
                <div className="p-3 rounded-xl bg-[#050906] border border-[#22C55E]/40 text-xs text-[#86EFAC] flex items-start gap-2 animate-fadeIn">
                  <Mic className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5 animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#A9B8AE]">
                      {isListening ? 'Jami đang nghe được...' : 'Câu trả lời của bạn:'}
                    </span>
                    <p className="font-semibold text-[#F3FAF5] italic">“{answerText}”</p>
                  </div>
                </div>
              )}

              {/* Primary Voice Controls */}
              {!showManualInput ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  {isListening ? (
                    <button
                      type="button"
                      onClick={() => stopListening()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-600/30 transition-all cursor-pointer animate-pulse"
                    >
                      <MicOff className="w-4 h-4" />
                      <span>Đang nghe... Nhấn để Dừng & Gửi</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startListening()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-lg shadow-[#16A34A]/30 transition-all cursor-pointer jami-btn-glow"
                    >
                      <Mic className="w-4 h-4 text-[#050806]" />
                      <span>Nhấn để nói câu trả lời</span>
                    </button>
                  )}

                  {answerText && !isListening && (
                    <button
                      type="button"
                      onClick={() => handleSubmit(answerText)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#14532D] hover:bg-[#166534] text-[#86EFAC] text-xs font-bold border border-[#22C55E]/30 transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Gửi phản hồi</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSkipOrDismiss}
                    className="inline-flex items-center justify-center px-3.5 py-2.5 rounded-xl bg-[#101A13] hover:bg-[#15241A] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-semibold border border-[rgba(34,197,94,0.15)] transition-all cursor-pointer"
                    title="Bỏ qua"
                    aria-label="Bỏ qua câu hỏi"
                  >
                    Bỏ qua
                  </button>

                  {/* Fallback typing toggle */}
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="text-[11px] text-[#A9B8AE]/70 hover:text-[#86EFAC] underline transition-colors ml-auto cursor-pointer"
                  >
                    Hoặc gõ văn bản
                  </button>
                </div>
              ) : (
                /* Fallback Manual Input Form */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit(answerText);
                  }}
                  className="flex flex-col sm:flex-row items-center gap-2"
                >
                  <div className="relative flex-1 w-full">
                    <input
                      type="text"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder={questionItem.placeholder || 'Nhập câu trả lời ngắn của bạn...'}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#050906] border border-[#22C55E]/30 text-white text-xs placeholder:text-[#A9B8AE]/60 focus:outline-none focus:border-[#22C55E] focus:ring-1 focus:ring-[#22C55E] transition-all"
                      aria-label="Câu trả lời cho Robot Jami"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Gửi</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowManualInput(false)}
                      className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl bg-[#101A13] hover:bg-[#15241A] text-[#86EFAC] text-xs font-semibold border border-[rgba(34,197,94,0.2)] transition-all cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Dùng giọng nói</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSkipOrDismiss}
                      className="inline-flex items-center justify-center px-3 py-2.5 rounded-xl bg-[#101A13] hover:bg-[#15241A] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-semibold border border-[rgba(34,197,94,0.15)] transition-all cursor-pointer"
                    >
                      Bỏ qua
                    </button>
                  </div>
                </form>
              )}

              {/* Error Message for Micro */}
              {speechError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-950/40 p-2 rounded-xl border border-rose-800/40">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{speechError}</span>
                </div>
              )}
            </div>
          )}

          {/* Thinking State */}
          {status === 'thinking' && (
            <div className="flex items-center gap-2 text-xs text-[#86EFAC] pt-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#22C55E]" />
              <span>Jami đang lắng nghe và suy nghĩ lời phản hồi dành riêng cho bạn...</span>
            </div>
          )}

          {/* Replied Indicator */}
          {status === 'replied' && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#86EFAC]/80 pt-0.5">
              <CheckCircle2 className="w-3 h-3 text-[#22C55E]" />
              <span>Đã sẵn sàng cho các nhiệm vụ học tập hôm nay!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
