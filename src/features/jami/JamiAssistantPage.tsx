import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Mic,
  MicOff,
  CheckCircle2,
  Info,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { api, JamiChatMessageItem } from '../../lib/api-client';
import confetti from 'canvas-confetti';

export const JamiAssistantPage: React.FC = () => {
  const [messages, setMessages] = useState<JamiChatMessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await api.getJamiMessages();
      setMessages(res.messages);
    } catch (err: any) {
      setError(err.message || 'Không thể tải lịch sử tin nhắn.');
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchHistory();
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
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối máy chủ.');
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
      }
    } catch (err: any) {
      alert(err.message || 'Không thể xác nhận thao tác.');
    }
  };

  const startVoiceRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        clearInterval(timerRef.current);
        setRecordingSeconds(0);
        handleSendMessage('Tuần sau tôi có bài kiểm tra 1 tiết Toán hàm số, hãy gợi ý lịch ôn luyện.');
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Không thể truy cập micro. Vui lòng cấp quyền micro trong cài đặt trình duyệt.');
      setIsRecording(false);
    }
  };

  const stopVoiceRecord = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 h-[calc(100vh-8.5rem)] flex flex-col">
      {/* Assistant Header */}
      <div className="bg-[#0B120D] p-4 sm:p-5 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#14532D] border border-[#22C55E]/40 flex items-center justify-center text-[#86EFAC] shadow-md">
            <Bot className="w-6 h-6 text-[#22C55E]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-[#F3FAF5] flex items-center gap-2">
              <span>Trợ Lý AI Jami</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                MySQL Persistence
              </span>
            </h1>
            <p className="text-xs text-[#A9B8AE]">
              Đồng hành hỏi đáp bài học, giải thích kiến thức & tối ưu thời gian học tập
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-full text-[11px] text-[#A9B8AE] font-medium">
          <Info className="w-3.5 h-3.5 text-[#22C55E]" />
          <span>Giọng nói Jami tạo bởi trí tuệ nhân tạo</span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button onClick={fetchHistory} className="px-3 py-1 bg-rose-900 text-white font-bold rounded-lg cursor-pointer">
            Thử lại
          </button>
        </div>
      )}

      {/* Main Chat Thread */}
      <div className="flex-1 bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl p-4 sm:p-6 overflow-y-auto space-y-4 flex flex-col justify-between">
        {isFetching ? (
          <div className="h-full flex items-center justify-center text-xs text-[#A9B8AE] gap-2">
            <RefreshCw className="w-4 h-4 text-[#22C55E] animate-spin" />
            <span>Đang tải hội thoại...</span>
          </div>
        ) : (
          <div className="space-y-4 flex-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'jami' && (
                  <div className="w-8 h-8 rounded-full bg-[#14532D] border border-[#22C55E]/40 flex items-center justify-center text-[#86EFAC] text-xs font-black shrink-0 mt-1 shadow-sm">
                    J
                  </div>
                )}

                <div
                  className={`max-w-xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-[#16A34A] text-[#050806] font-bold shadow-md shadow-[#16A34A]/25'
                      : 'bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] shadow-sm'
                  }`}
                >
                  <div className="whitespace-pre-line">{msg.text}</div>

                  {/* Proposal Action Confirmation */}
                  {msg.requiresConfirmation && (
                    <div className="mt-3 p-3 bg-[#050806] rounded-xl border border-[rgba(34,197,94,0.25)] text-xs text-[#F3FAF5] space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-[#86EFAC]">
                        <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
                        <span>Xác nhận thao tác:</span>
                      </div>
                      <p className="text-[#A9B8AE]">{msg.confirmationSummary}</p>

                      <div className="flex items-center gap-2 pt-1">
                        {msg.isConfirmed ? (
                          <div className="flex items-center gap-1 text-xs font-bold text-[#86EFAC] bg-[#14532D] border border-[#22C55E]/30 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                            <span>Đã xác nhận & lưu MySQL</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleConfirmAction(msg.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black rounded-lg shadow-sm cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Xác nhận đổi lịch</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Suggested Quick Actions */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-[rgba(34,197,94,0.15)]">
                      {msg.suggestedActions.map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(action)}
                          className="px-2.5 py-1 bg-[#050806] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-[#86EFAC] pl-11">
                <div className="w-4 h-4 border-2 border-[#22C55E] border-t-transparent rounded-full animate-spin" />
                <span>Jami đang suy nghĩ câu trả lời...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="bg-[#0B120D] p-3 rounded-2xl border border-[rgba(34,197,94,0.25)] shadow-xl flex items-center gap-2 shrink-0">
        <button
          onClick={isRecording ? stopVoiceRecord : startVoiceRecord}
          className={`p-2.5 rounded-xl transition-all cursor-pointer ${
            isRecording
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)]'
          }`}
          title={isRecording ? 'Dừng thu âm' : 'Nói với Jami qua giọng nói'}
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {isRecording && (
          <span className="text-xs text-rose-400 font-mono font-bold animate-pulse">
            00:0{recordingSeconds}
          </span>
        )}

        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Hỏi Jami về bài tập, lịch học hoặc phương pháp ôn thi..."
          className="flex-1 text-xs sm:text-sm px-3 py-2 border-none focus:outline-none bg-transparent text-[#F3FAF5] placeholder-[#526356]"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!inputMessage.trim() || isLoading}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] disabled:opacity-40 text-[#050806] text-xs font-black rounded-xl shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span>Gửi</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
