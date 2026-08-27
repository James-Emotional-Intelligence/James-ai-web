import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Layers,
  ArrowRight,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Clock,
  Paperclip,
  FileText,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { JamiConversation, JamiMessageItem, LearningMaterial } from '../../../shared/types';
import { MaterialFilePickerModal, SelectedFileResult } from '../../components/common/MaterialFilePickerModal';
import confetti from 'canvas-confetti';

export const JamiAssistantPage: React.FC = () => {
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<JamiConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JamiMessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [confirmingMsgId, setConfirmingMsgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // File / Material attachment state
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [attachedMaterial, setAttachedMaterial] = useState<{
    id?: string;
    title: string;
    fileName?: string;
    source: 'upload' | 'material';
    savedToMaterials?: boolean;
  } | null>(null);

  // Edit title state
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // Load conversations on mount
  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getJamiConversations();
      setConversations(res.conversations || []);

      if (res.conversations && res.conversations.length > 0) {
        setActiveConvId((prev) => prev || res.conversations[0].id);
      } else {
        // Automatically create initial conversation
        const created = await api.createJamiConversation('Hội thoại chính');
        setConversations([created.conversation]);
        setActiveConvId(created.conversation.id);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách cuộc trò chuyện.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load messages whenever active conversation changes
  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await api.getJamiMessages(convId);
      setMessages(res.messages || []);
    } catch (err: any) {
      console.error('Error loading messages:', err);
    }
  }, []);

  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId);
    }
  }, [activeConvId, fetchMessages]);

  const handleCreateConversation = async () => {
    try {
      const title = `Hội thoại mới ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
      const res = await api.createJamiConversation(title);
      setConversations((prev) => [res.conversation, ...prev]);
      setActiveConvId(res.conversation.id);
      setMessages([]);
    } catch (err: any) {
      alert(err.message || 'Không thể tạo cuộc trò chuyện mới.');
    }
  };

  const handleRenameConversation = async (convId: string) => {
    if (!newTitle.trim()) return;
    try {
      const res = await api.updateJamiConversation(convId, newTitle.trim());
      setConversations((prev) => prev.map((c) => (c.id === convId ? res.conversation : c)));
      setEditingConvId(null);
      setNewTitle('');
    } catch (err: any) {
      alert(err.message || 'Không thể đổi tên cuộc trò chuyện.');
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!window.confirm('Em có chắc chắn muốn xóa cuộc trò chuyện này?')) return;
    try {
      await api.deleteJamiConversation(convId);
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);
      if (activeConvId === convId) {
        if (remaining.length > 0) {
          setActiveConvId(remaining[0].id);
        } else {
          handleCreateConversation();
        }
      }
    } catch (err: any) {
      alert(err.message || 'Không thể xóa cuộc trò chuyện.');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = (textToSend || inputMessage).trim();
    if (!rawText || isSending || !activeConvId) return;

    const attachmentPrefix = attachedMaterial
      ? `[Tài liệu đính kèm: "${attachedMaterial.title}"] `
      : '';
    const text = `${attachmentPrefix}${rawText}`;

    setInputMessage('');
    const currentAttachment = attachedMaterial;
    setAttachedMaterial(null);
    setError(null);

    const clientMessageId = 'cl_' + Date.now();
    const optimisticUserMsg: JamiMessageItem = {
      id: clientMessageId,
      conversationId: activeConvId,
      userId: '',
      sender: 'user',
      text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setIsSending(true);

    try {
      const res = await api.sendJamiChat(text, activeConvId, clientMessageId);
      // Replace optimistic message with real message and add Jami reply
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== clientMessageId);
        return [...filtered, res.userMessage, res.replyMessage];
      });

      if (res.clientAction?.route) {
        // If Jami suggested client navigation
        setTimeout(() => {
          navigate(res.clientAction.route);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể gửi tin nhắn.');
      // Rollback optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== clientMessageId));
      if (currentAttachment) setAttachedMaterial(currentAttachment);
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmAction = async (msg: JamiMessageItem, decision: 'confirm' | 'reject') => {
    setConfirmingMsgId(msg.id);
    try {
      const res = await api.confirmJamiAction(msg.id, decision);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, isConfirmed: true } : m))
      );

      if (decision === 'confirm') {
        confetti({ particleCount: 70, spread: 60 });
      }

      // If action had follow-up messages, refetch
      if (activeConvId) {
        fetchMessages(activeConvId);
      }
    } catch (err: any) {
      alert(err.message || 'Không thể thực hiện xác nhận.');
    } finally {
      setConfirmingMsgId(null);
    }
  };

  const handleActionClick = (action: any) => {
    if (typeof action === 'string') {
      handleSendMessage(action);
      return;
    }

    if (action.route) {
      navigate(action.route);
      return;
    }

    if (action.label) {
      handleSendMessage(action.label);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] min-h-[550px]">
      {/* Sidebar: Conversations List */}
      <div className="w-full lg:w-72 bg-[#0B120D] p-4 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col justify-between shrink-0">
        <div className="space-y-4 overflow-hidden flex flex-col flex-1">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#22C55E]" />
              <h2 className="text-sm font-black text-[#F3FAF5]">Trợ Lý Jami AI</h2>
            </div>
            <button
              onClick={handleCreateConversation}
              className="p-1.5 rounded-xl bg-[#14532D] text-[#86EFAC] hover:bg-[#16A34A] hover:text-[#050806] transition-all cursor-pointer"
              title="Cuộc trò chuyện mới"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider">
            Lịch sử trò chuyện
          </div>

          {/* Conversations Scrollable List */}
          <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
            {conversations.map((c) => {
              const isActive = c.id === activeConvId;
              const isEditing = c.id === editingConvId;

              return (
                <div
                  key={c.id}
                  onClick={() => !isEditing && setActiveConvId(c.id)}
                  className={`p-2.5 rounded-2xl border text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-[#14532D] border-[#22C55E] text-[#86EFAC] font-bold shadow-md shadow-[#16A34A]/20'
                      : 'bg-[#101A13] border-[rgba(34,197,94,0.15)] text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#142318]'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full text-xs p-1 bg-[#050806] border border-[#22C55E] text-[#F3FAF5] rounded-lg focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRenameConversation(c.id)}
                        className="px-2 py-1 bg-[#16A34A] text-[#050806] rounded-md font-bold text-[10px]"
                      >
                        Lưu
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 truncate">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{c.title}</span>
                      </div>

                      {isActive && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setEditingConvId(c.id);
                              setNewTitle(c.title);
                            }}
                            className="p-1 hover:text-[#F3FAF5] rounded"
                            title="Đổi tên"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteConversation(c.id)}
                            className="p-1 hover:text-rose-400 rounded"
                            title="Xóa"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick feature shortcuts */}
        <div className="pt-3 border-t border-[rgba(34,197,94,0.18)] space-y-1.5">
          <button
            onClick={() => navigate('/focus')}
            className="w-full text-left p-2 rounded-xl text-xs text-[#A9B8AE] hover:text-[#86EFAC] hover:bg-[#101A13] transition-all flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>Hẹn giờ tập trung</span>
            </span>
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => navigate('/timetable')}
            className="w-full text-left p-2 rounded-xl text-xs text-[#A9B8AE] hover:text-[#86EFAC] hover:bg-[#101A13] transition-all flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>Thời khóa biểu</span>
            </span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col justify-between overflow-hidden">
        {/* Chat Messages Stream */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-[#A9B8AE] gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#22C55E]" />
              <span>Đang kết nối với Jami...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center shadow-lg shadow-[#16A34A]/25 border border-[#22C55E]/30">
                <Bot className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-[#F3FAF5]">Chào em! Jami có thể giúp gì cho việc học hôm nay?</h3>
              <p className="text-xs text-[#A9B8AE] max-w-md">
                Em có thể hỏi lịch học hôm nay, yêu cầu dời bài tập bận, giải thích công thức toán hoặc tạo đề kiểm tra ôn thi bất cứ lúc nào.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => handleSendMessage('Hôm nay em có những lịch học và nhiệm vụ nào?')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#86EFAC] hover:bg-[#14532D] transition-all cursor-pointer"
                >
                  📅 Hôm nay học gì?
                </button>
                <button
                  onClick={() => handleSendMessage('Tối nay em bận đột xuất, hãy dời bài tập sang giờ trống khác giúp em.')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#86EFAC] hover:bg-[#14532D] transition-all cursor-pointer"
                >
                  ⚡ Dời lịch bài tập bận
                </button>
                <button
                  onClick={() => handleSendMessage('Gợi ý cách ôn tập cho bài kiểm tra sắp tới.')}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#86EFAC] hover:bg-[#14532D] transition-all cursor-pointer"
                >
                  🎯 Lập kế hoạch ôn thi
                </button>
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.sender === 'user';

              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center text-xs font-black shrink-0 border border-[#22C55E]/30 mt-1">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] sm:max-w-[75%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#16A34A] text-[#050806] font-semibold rounded-tr-none shadow-md shadow-[#16A34A]/20'
                          : 'bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-tl-none space-y-2 shadow-lg'
                      }`}
                    >
                      <div className="whitespace-pre-line">{m.text}</div>

                      {/* Safe Mutation Preview & Confirmation Card */}
                      {m.requiresConfirmation && (
                        <div className="mt-3 p-3.5 rounded-xl bg-[#050806] border border-[#22C55E]/40 space-y-2.5">
                          <div className="flex items-center gap-2 text-xs font-extrabold text-[#86EFAC]">
                            <Sparkles className="w-4 h-4 text-[#22C55E]" />
                            <span>Đề xuất hành động cần xác nhận:</span>
                          </div>

                          <div className="text-xs text-[#A9B8AE] bg-[#101A13] p-2.5 rounded-lg border border-[rgba(34,197,94,0.15)]">
                            {m.confirmationSummary || 'Thực hiện cập nhật dữ liệu học tập theo yêu cầu.'}
                          </div>

                          {!m.isConfirmed ? (
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                onClick={() => handleConfirmAction(m, 'reject')}
                                disabled={confirmingMsgId === m.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-800 text-rose-300 hover:bg-rose-950/40 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Từ chối</span>
                              </button>
                              <button
                                onClick={() => handleConfirmAction(m, 'confirm')}
                                disabled={confirmingMsgId === m.id}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{confirmingMsgId === m.id ? 'Đang thực hiện...' : 'Xác nhận thực hiện'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-[#86EFAC] font-bold pt-1">
                              <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                              <span>Đã thực hiện và cập nhật vào hệ thống.</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Suggested Action Pills */}
                    {!isUser && m.suggestedActions && Array.isArray(m.suggestedActions) && m.suggestedActions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {m.suggestedActions.map((action: any, actIdx: number) => {
                          const label = typeof action === 'string' ? action : action.label;
                          return (
                            <button
                              key={actIdx}
                              onClick={() => handleActionClick(action)}
                              className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#050806] hover:bg-[#14532D] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] transition-all cursor-pointer"
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="text-[10px] text-[#A9B8AE]/60 px-1">
                      {new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isSending && (
            <div className="flex items-start gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center text-xs font-black shrink-0 border border-[#22C55E]/30 mt-1">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-xs text-[#A9B8AE] flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#22C55E]" />
                <span>Jami đang suy nghĩ và tra cứu dữ liệu...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="p-3 mt-2 bg-rose-950/40 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[11px] font-bold underline cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Attached Material Preview Pill */}
        {attachedMaterial && (
          <div className="mt-2 p-2 bg-[#101A13] border border-[#22C55E]/40 rounded-xl flex items-center justify-between text-xs text-[#86EFAC] animate-in fade-in">
            <div className="flex items-center gap-2 truncate">
              <FileText className="w-4 h-4 text-[#22C55E] shrink-0" />
              <span className="font-bold truncate">Đính kèm: {attachedMaterial.title}</span>
              {attachedMaterial.savedToMaterials && (
                <span className="text-[10px] px-1.5 py-0.5 bg-[#14532D] text-[#86EFAC] rounded font-bold border border-[#22C55E]/30 shrink-0">
                  Đã lưu vào Kho
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAttachedMaterial(null)}
              className="p-1 hover:text-rose-400 cursor-pointer shrink-0"
              title="Hủy đính kèm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="pt-3 mt-1 border-t border-[rgba(34,197,94,0.18)] flex items-center gap-2"
        >
          <button
            type="button"
            onClick={() => setIsAttachModalOpen(true)}
            className="p-3 sm:p-3.5 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.25)] transition-all cursor-pointer shrink-0 font-bold"
            title="Đính kèm tài liệu từ Kho hoặc tải tệp mới từ máy"
          >
            <Paperclip className="w-4 h-4 text-[#22C55E]" />
          </button>

          <input
            type="text"
            placeholder={
              attachedMaterial
                ? `Nhập câu hỏi về "${attachedMaterial.title}"...`
                : "Nhắn tin với Jami (ví dụ: 'Hôm nay học gì?', 'Giải bài tập Toán'...)"
            }
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            className="flex-1 text-xs sm:text-sm p-3.5 bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-2xl focus:border-[#22C55E] focus:outline-none"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isSending}
            className="p-3.5 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] transition-all shadow-md shadow-[#16A34A]/25 cursor-pointer disabled:opacity-40 shrink-0 font-bold"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Universal File / Material Attachment Modal */}
      <MaterialFilePickerModal
        isOpen={isAttachModalOpen}
        onClose={() => setIsAttachModalOpen(false)}
        title="Đính kèm Tài liệu cho Trợ lý Jami"
        description="Chọn tài liệu có sẵn từ Kho hoặc tải file mới từ máy tính (kèm tùy chọn lưu vào kho)"
        onFileSelected={(res) => {
          setAttachedMaterial({
            id: res.materialId,
            title: res.materialTitle || res.fileName,
            fileName: res.fileName,
            source: res.source,
            savedToMaterials: res.savedToMaterials,
          });
        }}
      />
    </div>
  );
};
