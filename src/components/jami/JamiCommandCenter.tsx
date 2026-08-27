import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Mic,
  MicOff,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api, JamiChatMessageItem } from '../../lib/api-client';
import { JamiState } from './RobotJami';
import confetti from 'canvas-confetti';
import { useVoiceJami } from '../../context/VoiceJamiContext';

interface JamiCommandCenterProps {
  onStateChange?: (state: JamiState, latestMessage?: string) => void;
  onDataUpdated?: () => void;
}

export const JamiCommandCenter: React.FC<JamiCommandCenterProps> = ({
  onStateChange,
  onDataUpdated,
}) => {
  const navigate = useNavigate();
  const voice = useVoiceJami();
  const [messages, setMessages] = useState<JamiChatMessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const speechRecognizerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await api.getJamiMessages();
      setMessages(res.messages);
      const latest = res.messages[res.messages.length - 1];
      if (latest && onStateChange) {
        onStateChange((latest.emotion as JamiState) || 'idle', latest.text);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải lịch sử hội thoại.');
      if (onStateChange) onStateChange('error');
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isLoading) return;

    setInputMessage('');
    setIsLoading(true);
    setError(null);
    if (onStateChange) onStateChange('thinking');

    // Optimistic UI append for immediate user message
    const tempUserMsg: JamiChatMessageItem = {
      id: 'temp_user_' + Date.now(),
      sender: 'user',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await api.sendJamiChat(text.trim());
      setMessages((prev) =>
        prev.map((m) => (m.id === tempUserMsg.id ? res.userMessage : m)).concat([res.replyMessage])
      );

      if (onStateChange) {
        onStateChange((res.replyMessage.emotion as JamiState) || 'speaking', res.replyMessage.text);
      }

      if (onDataUpdated) {
        onDataUpdated();
      }
    } catch (err: any) {
      setError(err.message || 'Không thể gửi tin nhắn.');
      if (onStateChange) onStateChange('error', 'Không thể kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = async (msgId: string) => {
    try {
      const res = await api.confirmJamiAction(msgId);
      if (res.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, isConfirmed: true } : m))
        );
        confetti({ particleCount: 80, spread: 60 });
        if (onDataUpdated) onDataUpdated();
      }
    } catch (err: any) {
      alert(err.message || 'Không thể xác nhận thao tác.');
    }
  };

  // Real Web Speech Recognition
  const startListening = () => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      alert('Trình duyệt của bạn không hỗ trợ Web Speech Recognition.');
      return;
    }

    try {
      const recognizer = new SpeechRecognitionClass();
      recognizer.lang = 'vi-VN';
      recognizer.interimResults = true;
      recognizer.continuous = false;
      speechRecognizerRef.current = recognizer;

      let transcriptAccumulated = '';

      recognizer.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            transcriptAccumulated += item;
          } else {
            interim += item;
          }
        }
        setInputMessage(transcriptAccumulated || interim);
      };

      recognizer.onerror = (event: any) => {
        console.warn('[JamiCommandCenter] Speech error:', event.error);
        stopListening();
      };

      recognizer.onend = () => {
        setIsListening(false);
        clearInterval(timerRef.current);
        setRecordingSeconds(0);
        if (transcriptAccumulated.trim()) {
          handleSendMessage(transcriptAccumulated.trim());
        }
      };

      recognizer.start();
      setIsListening(true);
      if (onStateChange) onStateChange('listening');

      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.warn('[JamiCommandCenter] Could not start speech recognizer:', err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (speechRecognizerRef.current && isListening) {
      try {
        speechRecognizerRef.current.stop();
      } catch {}
      setIsListening(false);
      clearInterval(timerRef.current);
      setRecordingSeconds(0);
    }
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Bây giờ';
    }
  };

  return (
    <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 flex flex-col h-[480px]">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-[rgba(34,197,94,0.18)] pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center font-bold border border-[#22C55E]/30 shadow-md">
            <Sparkles className="w-4.5 h-4.5 text-[#22C55E]" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-[#F3FAF5] flex items-center gap-2">
              <span>Trung Tâm Hội Thoại Jami AI</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                MySQL Sync
              </span>
            </h2>
            <p className="text-[11px] text-[#A9B8AE]">
              Tương tác giọng nói thật và lịch sử học tập cá nhân hóa
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/jami')}
          className="flex items-center gap-1 text-xs font-bold text-[#86EFAC] hover:text-[#22C55E] transition-colors cursor-pointer"
        >
          <span>Xem toàn bộ lịch sử</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages Thread Container */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 scrollbar-thin">
        {isFetching ? (
          <div className="h-full flex items-center justify-center text-xs text-[#A9B8AE] gap-2">
            <RefreshCw className="w-4 h-4 text-[#22C55E] animate-spin" />
            <span>Đang tải lịch sử hội thoại từ MySQL...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs space-y-2 text-center">
            <div className="flex items-center justify-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchMessages}
              className="px-3 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded-lg font-bold text-xs cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[#A9B8AE] space-y-2 p-6">
            <MessageSquare className="w-8 h-8 text-[#22C55E]" />
            <p className="text-xs">Chưa có tin nhắn nào. Hãy bắt đầu trò chuyện với Jami ngay!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.sender === 'jami' && (
                <div className="w-7 h-7 rounded-lg bg-[#14532D] border border-[#22C55E]/40 flex items-center justify-center text-[#86EFAC] text-xs font-extrabold shrink-0 mt-0.5">
                  J
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-md rounded-2xl p-3 text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#16A34A] text-[#050806] font-bold shadow-md shadow-[#16A34A]/20'
                    : 'bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5]'
                }`}
              >
                <div className="whitespace-pre-line">{msg.text}</div>

                {/* Proposal Confirmation Card */}
                {msg.requiresConfirmation && (
                  <div className="mt-2.5 p-2.5 bg-[#050806] rounded-xl border border-[rgba(34,197,94,0.3)] text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-[#86EFAC]">
                      <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>Xác nhận cập nhật:</span>
                    </div>
                    <p className="text-[#A9B8AE]">{msg.confirmationSummary}</p>

                    <div className="flex items-center gap-2 pt-1">
                      {msg.isConfirmed ? (
                        <div className="flex items-center gap-1 text-[11px] font-bold text-[#86EFAC] bg-[#14532D] px-2.5 py-1 rounded-lg border border-[#22C55E]/30">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />
                          <span>Đã xác nhận & cập nhật MySQL</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleConfirmAction(msg.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black rounded-lg text-xs shadow-md cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Xác nhận</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Suggested Action Quick Buttons */}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-[rgba(34,197,94,0.15)]">
                    {msg.suggestedActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(action)}
                        className="px-2 py-0.5 bg-[#050806] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  className={`text-[10px] mt-1 text-right ${
                    msg.sender === 'user' ? 'text-[#050806]/70' : 'text-[#A9B8AE]/70'
                  }`}
                >
                  {formatTimestamp(msg.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-[#86EFAC] pl-9">
            <div className="w-3.5 h-3.5 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
            <span>Jami đang suy nghĩ...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Bar */}
      <div className="bg-[#050806] p-2 sm:p-2.5 rounded-2xl border border-[rgba(34,197,94,0.25)] flex items-center gap-2 shrink-0">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            isListening
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)]'
          }`}
          title={isListening ? 'Dừng lắng nghe' : 'Nói với Jami bằng giọng nói'}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-[#22C55E]" />}
        </button>

        {isListening && (
          <span className="text-xs text-rose-400 font-mono font-bold animate-pulse">
            00:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
          </span>
        )}

        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Hỏi Jami bài tập, dời lịch hay lập kế hoạch học tập..."
          className="flex-1 text-xs sm:text-sm px-2.5 py-1.5 bg-transparent border-none focus:outline-none text-[#F3FAF5] placeholder-[#526356]"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!inputMessage.trim() || isLoading}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] disabled:opacity-40 text-[#050806] text-xs font-black rounded-xl shadow-md transition-all cursor-pointer"
        >
          <span>Gửi</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
