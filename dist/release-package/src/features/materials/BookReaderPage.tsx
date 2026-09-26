import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Highlighter,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  Type,
  ExternalLink,
  HelpCircle,
  Calendar,
  FileText,
  Layers,
  X,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import {
  LearningMaterial,
  BookChapter,
  BookChunk,
  BookProgress,
  BookBookmark,
  BookHighlight,
  BookStudyAidResult,
} from '../../../shared/types';
import { PrintPdfButton } from '../../components/common/PrintPdfButton';
import { exportMaterialSummaryToPdf } from '../../lib/pdf-export-service';
import confetti from '../../lib/safe-confetti';

type ActiveSidebarTab = 'toc' | 'bookmarks' | 'highlights' | 'search' | 'study';

export const BookReaderPage: React.FC = () => {
  const { id: bookId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [book, setBook] = useState<LearningMaterial | null>(null);
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageChunks, setPageChunks] = useState<BookChunk[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [activeSidebarTab, setActiveSidebarTab] = useState<ActiveSidebarTab>('toc');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Reader Customization (Font Size & Color Theme)
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [readerTheme, setReaderTheme] = useState<'dark' | 'sepia' | 'light'>('dark');

  // Bookmarks & Highlights
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([]);
  const [highlights, setHighlights] = useState<BookHighlight[]>([]);
  const [selectedText, setSelectedText] = useState<string>('');
  const [highlightNote, setHighlightNote] = useState<string>('');
  const [highlightColor, setHighlightColor] = useState<string>('yellow');
  const [showHighlightModal, setShowHighlightModal] = useState<boolean>(false);

  // Search within book
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Array<{ chunk: BookChunk; score: number; snippet: string }>>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // AI Study Aids Panel
  const [selectedAidAction, setSelectedAidAction] = useState<
    'summary' | 'outline' | 'flashcards' | 'quiz' | 'explain' | 'study_plan' | 'send_to_mistake_notebook'
  >('summary');
  const [selectedAidChapterId, setSelectedAidChapterId] = useState<string>('all');
  const [conceptQuery, setConceptQuery] = useState<string>('');
  const [isGeneratingAid, setIsGeneratingAid] = useState<boolean>(false);
  const [studyAidResult, setStudyAidResult] = useState<BookStudyAidResult | null>(null);
  const [studyAidError, setStudyAidError] = useState<string | null>(null);

  // Load Book Details & TOC
  const loadBookData = useCallback(async () => {
    if (!bookId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [bookRes, chaptersRes, bmkRes, hlRes] = await Promise.all([
        api.getBook(bookId),
        api.getBookChapters(bookId),
        api.getBookmarks(bookId),
        api.getHighlights(bookId),
      ]);

      setBook(bookRes.book);
      setChapters(chaptersRes.chapters || []);
      setBookmarks(bmkRes.bookmarks || []);
      setHighlights(hlRes.highlights || []);

      const initialPage = bookRes.progress?.page || 1;
      setCurrentPage(initialPage);
      setTotalPages(bookRes.book.pageCount || 100);
    } catch (err: any) {
      setError(err.message || 'Không thể tải thông tin sách mềm.');
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadBookData();
  }, [loadBookData]);

  // Load Page Chunks when Page Changes
  const loadPageContent = useCallback(async (page: number) => {
    if (!bookId) return;
    try {
      const res = await api.readBookPage(bookId, page);
      setPageChunks(res.chunks || []);
      if (res.pageCount) setTotalPages(res.pageCount);

      // Auto-save reading progress (debounced)
      const pct = Math.min(100, Math.round((page / (res.pageCount || 100)) * 100));
      api.saveBookProgress(bookId, page, undefined, pct).catch(() => {});
    } catch (err) {
      console.warn('[BookReader] Failed to load page chunks:', err);
    }
  }, [bookId]);

  useEffect(() => {
    if (bookId && currentPage > 0) {
      loadPageContent(currentPage);
    }
  }, [bookId, currentPage, loadPageContent]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setCurrentPage((prev) => Math.min(totalPages, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages]);

  // Handle Search
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId || !searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await api.searchBook(bookId, searchQuery.trim());
      setSearchResults(res.results || []);
    } catch (err) {
      console.warn('[BookReader] Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Add Bookmark
  const handleAddBookmark = async () => {
    if (!bookId) return;
    const currentChapter = chapters.find((c) => currentPage >= c.startPage && currentPage <= c.endPage);
    const title = `Trang ${currentPage}${currentChapter ? ` - ${currentChapter.title}` : ''}`;
    try {
      const res = await api.createBookmark(bookId, { page: currentPage, title, chapterId: currentChapter?.id });
      setBookmarks((prev) => [...prev, res.bookmark]);
      confetti({ particleCount: 30, spread: 40, origin: { y: 0.8 } });
    } catch (err) {
      console.warn('[BookReader] Failed to create bookmark:', err);
    }
  };

  // Delete Bookmark
  const handleDeleteBookmark = async (bmkId: string) => {
    if (!bookId) return;
    try {
      await api.deleteBookmark(bookId, bmkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bmkId));
    } catch (err) {
      console.warn('[BookReader] Failed to delete bookmark:', err);
    }
  };

  // Handle Text Selection for Highlight
  const handleTextSelect = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 3) {
      setSelectedText(sel);
    }
  };

  const handleSaveHighlight = async () => {
    if (!bookId || !selectedText) return;
    try {
      const res = await api.createHighlight(bookId, {
        page: currentPage,
        selectedText,
        note: highlightNote,
        color: highlightColor,
      });
      setHighlights((prev) => [res.highlight, ...prev]);
      setShowHighlightModal(false);
      setSelectedText('');
      setHighlightNote('');
    } catch (err) {
      console.warn('[BookReader] Failed to create highlight:', err);
    }
  };

  // AI Study Aid Trigger
  const handleGenerateStudyAid = async () => {
    if (!bookId) return;
    setIsGeneratingAid(true);
    setStudyAidError(null);
    setStudyAidResult(null);

    try {
      const res = await api.generateBookStudyAid(bookId, {
        action: selectedAidAction,
        chapterId: selectedAidChapterId === 'all' ? undefined : selectedAidChapterId,
        conceptToExplain: conceptQuery.trim() || undefined,
      });
      setStudyAidResult(res);
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    } catch (err: any) {
      setStudyAidError(err.message || 'Không thể tạo tài liệu ôn tập từ sách.');
    } finally {
      setIsGeneratingAid(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#06130E] text-slate-200 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-300">Đang mở sách mềm...</p>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-[#06130E] text-slate-200 flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-12 h-12 text-rose-400" />
        <h2 className="text-lg font-bold text-white">Không thể tải sách mềm</h2>
        <p className="text-sm text-slate-300 text-center max-w-md">{error || 'Không tìm thấy sách.'}</p>
        <button
          onClick={() => navigate('/materials')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition"
        >
          Quay lại Kho tài liệu
        </button>
      </div>
    );
  }

  // Theme styles for reading pane
  const themeClasses = {
    dark: 'bg-[#0B1A14] text-slate-200 border-emerald-900/30',
    sepia: 'bg-[#FBF0D9] text-[#433422] border-[#E2D1B3]',
    light: 'bg-white text-slate-800 border-slate-200',
  }[readerTheme];

  const fontSizes = {
    sm: 'text-sm leading-relaxed',
    base: 'text-base leading-relaxed',
    lg: 'text-lg leading-loose',
    xl: 'text-xl leading-loose',
  }[fontSize];

  return (
    <div className="min-h-screen bg-[#050C08] text-slate-100 flex flex-col">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-emerald-900/40 bg-[#071710] px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/materials')}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition flex items-center gap-1.5 text-xs"
            title="Quay lại Kho tài liệu"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Kho tài liệu</span>
          </button>
          <div className="h-4 w-px bg-emerald-900/60 hidden sm:block" />
          <h1 className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">{book.title}</h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/50 text-emerald-300 hidden md:inline-block">
            {book.subjectName || 'Môn học'}
          </span>
        </div>

        {/* Reader Tools & Customization */}
        <div className="flex items-center gap-2">
          {/* Theme switcher */}
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-emerald-900/40 text-xs">
            <button
              onClick={() => setReaderTheme('dark')}
              className={`px-2 py-1 rounded ${readerTheme === 'dark' ? 'bg-emerald-800 text-white font-semibold' : 'text-slate-400'}`}
            >
              Tối
            </button>
            <button
              onClick={() => setReaderTheme('sepia')}
              className={`px-2 py-1 rounded ${readerTheme === 'sepia' ? 'bg-[#DCC8A7] text-[#433422] font-semibold' : 'text-slate-400'}`}
            >
              Vàng
            </button>
            <button
              onClick={() => setReaderTheme('light')}
              className={`px-2 py-1 rounded ${readerTheme === 'light' ? 'bg-white text-slate-900 font-semibold' : 'text-slate-400'}`}
            >
              Sáng
            </button>
          </div>

          {/* Font size control */}
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-emerald-900/40 text-xs">
            <button
              onClick={() => setFontSize('sm')}
              className={`px-2 py-1 rounded ${fontSize === 'sm' ? 'bg-emerald-800 text-white' : 'text-slate-400'}`}
            >
              A-
            </button>
            <button
              onClick={() => setFontSize('base')}
              className={`px-2 py-1 rounded ${fontSize === 'base' ? 'bg-emerald-800 text-white' : 'text-slate-400'}`}
            >
              A
            </button>
            <button
              onClick={() => setFontSize('lg')}
              className={`px-2 py-1 rounded ${fontSize === 'lg' ? 'bg-emerald-800 text-white' : 'text-slate-400'}`}
            >
              A+
            </button>
          </div>

          {/* Bookmark Button */}
          <button
            onClick={handleAddBookmark}
            className="p-1.5 text-amber-400 hover:text-amber-300 rounded-lg hover:bg-white/5 border border-amber-500/30 transition flex items-center gap-1 text-xs"
            title="Đánh dấu trang hiện tại"
          >
            <Bookmark className="w-4 h-4 fill-amber-400/30" />
            <span className="hidden sm:inline">Dấu trang</span>
          </button>

          {/* Print PDF Button */}
          <PrintPdfButton
            onExport={async () => {
              if (!book) return;
              await exportMaterialSummaryToPdf(book, {
                chapters: chapters.map((c) => ({ title: c.title, startPage: c.startPage, endPage: c.endPage })),
              });
            }}
            label="In tóm tắt (PDF)"
            variant="outline"
            size="sm"
          />

          {/* Toggle Sidebar */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1.5 rounded-lg border transition ${
              isSidebarOpen
                ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                : 'bg-black/40 border-emerald-900/40 text-slate-400 hover:text-white'
            }`}
            title="Mở thanh công cụ & Mục lục"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout: Reader Viewport + Collapsible Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Main Reading Viewport */}
        <main className="flex-1 flex flex-col justify-between overflow-y-auto p-4 md:p-8" onMouseUp={handleTextSelect}>
          <div className={`max-w-3xl w-full mx-auto p-6 md:p-10 rounded-2xl border shadow-xl transition-colors ${themeClasses}`}>
            {/* Header info */}
            <div className="flex items-center justify-between border-b pb-3 mb-6 opacity-60 text-xs">
              <span>{book.title}</span>
              <span>Trang {currentPage} / {totalPages}</span>
            </div>

            {/* Page Text Chunks */}
            <div className={`space-y-6 ${fontSizes} font-serif select-text`}>
              {pageChunks.length > 0 ? (
                pageChunks.map((chunk, idx) => (
                  <div key={chunk.id || idx} className="relative group">
                    {chunk.chapterTitle && (
                      <h3 className="font-sans font-bold text-emerald-400 text-sm mb-3 opacity-90">
                        {chunk.chapterTitle}
                      </h3>
                    )}
                    <p className="whitespace-pre-line leading-relaxed">{chunk.text}</p>
                  </div>
                ))
              ) : (
                <div className="py-16 text-center text-slate-400 text-sm">
                  <p>Trang {currentPage} chưa có nội dung văn bản trích xuất.</p>
                  <p className="text-xs text-slate-500 mt-1">Sử dụng nút chuyển trang bên dưới để tiếp tục đọc.</p>
                </div>
              )}
            </div>

            {/* Selection Toolbar Trigger */}
            {selectedText && (
              <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-[#0F291E] border border-emerald-500/60 shadow-2xl rounded-xl p-2 flex items-center gap-2 z-30 animate-bounce">
                <span className="text-xs text-emerald-200 max-w-xs truncate">"{selectedText}"</span>
                <button
                  onClick={() => setShowHighlightModal(true)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  Ghi chú & Tô màu
                </button>
                <button
                  onClick={() => {
                    setActiveSidebarTab('study');
                    setSelectedAidAction('explain');
                    setConceptQuery(selectedText);
                    setIsSidebarOpen(true);
                  }}
                  className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Hỏi Jami
                </button>
              </div>
            )}
          </div>

          {/* Bottom Pagination Controls */}
          <footer className="max-w-3xl w-full mx-auto mt-6 pt-4 border-t border-emerald-900/30 flex items-center justify-between text-xs text-slate-400">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 bg-[#0F291E] hover:bg-emerald-900/50 disabled:opacity-30 disabled:pointer-events-none text-slate-200 rounded-lg border border-emerald-800/40 flex items-center gap-1 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Trang trước</span>
            </button>

            {/* Slider */}
            <div className="flex items-center gap-3 flex-1 max-w-xs mx-4">
              <input
                type="range"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="font-mono text-emerald-300 font-bold min-w-[50px] text-right">
                {currentPage} / {totalPages}
              </span>
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 bg-[#0F291E] hover:bg-emerald-900/50 disabled:opacity-30 disabled:pointer-events-none text-slate-200 rounded-lg border border-emerald-800/40 flex items-center gap-1 transition"
            >
              <span>Trang sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </footer>
        </main>

        {/* Right Side: Tabbed Tool Drawer (TOC, Bookmarks, Highlights, Search, Study Aids) */}
        {isSidebarOpen && (
          <aside className="w-80 md:w-96 border-l border-emerald-900/40 bg-[#071710] flex flex-col z-10">
            {/* Sidebar Tabs */}
            <div className="flex border-b border-emerald-900/40 bg-[#050F0B] p-1 gap-1 text-xs">
              <button
                onClick={() => setActiveSidebarTab('toc')}
                className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-1 font-medium transition ${
                  activeSidebarTab === 'toc' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50' : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Mục lục</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab('study')}
                className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-1 font-medium transition ${
                  activeSidebarTab === 'study' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Ôn tập AI</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab('bookmarks')}
                className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-1 font-medium transition ${
                  activeSidebarTab === 'bookmarks' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                <span>Dấu trang ({bookmarks.length})</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab('search')}
                className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-1 font-medium transition ${
                  activeSidebarTab === 'search' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Tìm kiếm</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* TAB 1: Table of Contents */}
              {activeSidebarTab === 'toc' && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mục lục chương sách</h3>
                  {chapters.length > 0 ? (
                    chapters.map((ch) => {
                      const isActive = currentPage >= ch.startPage && currentPage <= ch.endPage;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => setCurrentPage(ch.startPage)}
                          className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                            isActive
                              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 font-semibold'
                              : 'bg-[#0A1F16]/50 border-emerald-900/30 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{ch.title}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Tr.{ch.startPage}-{ch.endPage}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-500 italic">Chưa có mục lục phân cấp cho sách này.</p>
                  )}
                </div>
              )}

              {/* TAB 2: AI Study Aids */}
              {activeSidebarTab === 'study' && (
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-emerald-950/60 border border-emerald-800/40 rounded-xl space-y-2">
                    <span className="text-emerald-300 font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Ôn tập cùng Jami từ Sách mềm
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Chọn chương và tác vụ để Jami tạo tài liệu học tập chuẩn GDPT 2018 có kèm trích dẫn trang cụ thể.
                    </p>
                  </div>

                  {/* Chapter Scope Selector */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Phạm vi ôn tập:</label>
                    <select
                      value={selectedAidChapterId}
                      onChange={(e) => setSelectedAidChapterId(e.target.value)}
                      className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-lg p-2 text-slate-200"
                    >
                      <option value="all">Toàn bộ cuốn sách ({totalPages} trang)</option>
                      {chapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.title} (Tr.{ch.startPage}-{ch.endPage})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action Selector */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Tác vụ ôn tập:</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'summary', label: '📌 Tóm tắt chương' },
                        { id: 'outline', label: '📋 Dàn ý chi tiết' },
                        { id: 'flashcards', label: '🗂️ Bộ Flashcard' },
                        { id: 'quiz', label: '📝 Trắc nghiệm Quiz' },
                        { id: 'explain', label: '💡 Giải thích khái niệm' },
                        { id: 'study_plan', label: '📅 Kế hoạch tự học' },
                        { id: 'send_to_mistake_notebook', label: '📕 Bẫy sai & Sổ lỗi' },
                      ].map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => setSelectedAidAction(action.id as any)}
                          className={`p-2 rounded-lg border text-left font-medium transition ${
                            selectedAidAction === action.id
                              ? 'bg-emerald-600 border-emerald-400 text-white shadow-md'
                              : 'bg-[#0A1F16] border-emerald-900/40 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Concept Query (for explain action) */}
                  {selectedAidAction === 'explain' && (
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Khái niệm cần giải thích:</label>
                      <input
                        type="text"
                        value={conceptQuery}
                        onChange={(e) => setConceptQuery(e.target.value)}
                        placeholder="VD: Điều kiện xác định, Định lý Pytago..."
                        className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-lg p-2 text-slate-200"
                      />
                    </div>
                  )}

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerateStudyAid}
                    disabled={isGeneratingAid}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition"
                  >
                    {isGeneratingAid ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Jami đang tổng hợp...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Bắt đầu ôn tập</span>
                      </>
                    )}
                  </button>

                  {/* Result Area */}
                  {studyAidError && (
                    <div className="p-3 bg-rose-950/60 border border-rose-800/40 rounded-xl text-rose-300 text-xs">
                      {studyAidError}
                    </div>
                  )}

                  {studyAidResult && (
                    <div className="mt-4 p-4 bg-[#0A1F16] border border-emerald-800/50 rounded-xl space-y-3">
                      <h4 className="font-bold text-emerald-300 text-sm">{studyAidResult.title}</h4>
                      <div className="text-slate-200 whitespace-pre-line leading-relaxed max-h-80 overflow-y-auto font-sans">
                        {studyAidResult.contentMarkdown}
                      </div>

                      {/* Citations list */}
                      {studyAidResult.citations && studyAidResult.citations.length > 0 && (
                        <div className="border-t border-emerald-900/40 pt-3 space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                            Nguồn trích dẫn trong sách:
                          </span>
                          {studyAidResult.citations.map((cit, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                if (cit.pageStart) setCurrentPage(cit.pageStart);
                              }}
                              className="w-full text-left p-2 rounded-lg bg-black/30 hover:bg-emerald-900/30 border border-emerald-900/40 text-[11px] text-emerald-200 flex items-center justify-between group transition"
                            >
                              <span className="truncate max-w-[200px]">{cit.chapterTitle || cit.bookTitle}</span>
                              <span className="text-amber-300 font-mono text-[10px] group-hover:underline">
                                Trang {cit.pageStart}-{cit.pageEnd}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Bookmarks */}
              {activeSidebarTab === 'bookmarks' && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-400 uppercase tracking-wider">Dấu trang đã lưu</h3>
                    <button
                      onClick={handleAddBookmark}
                      className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white rounded text-[11px] flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Lưu trang {currentPage}
                    </button>
                  </div>
                  {bookmarks.length > 0 ? (
                    bookmarks.map((bmk) => (
                      <div
                        key={bmk.id}
                        className="p-3 bg-[#0A1F16] border border-emerald-900/40 rounded-xl flex items-center justify-between gap-2"
                      >
                        <button
                          onClick={() => setCurrentPage(bmk.page)}
                          className="text-left font-medium text-slate-200 hover:text-emerald-300 truncate"
                        >
                          <span className="block text-amber-400 text-[10px] font-mono">Trang {bmk.page}</span>
                          <span className="truncate">{bmk.title}</span>
                        </button>
                        <button
                          onClick={() => handleDeleteBookmark(bmk.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Xóa dấu trang"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">Chưa có dấu trang nào được lưu.</p>
                  )}
                </div>
              )}

              {/* TAB 4: Search */}
              {activeSidebarTab === 'search' && (
                <div className="space-y-3 text-xs">
                  <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm từ khóa trong sách..."
                      className="flex-1 bg-[#050F0B] border border-emerald-900/50 rounded-lg p-2 text-slate-200"
                    />
                    <button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      className="px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-bold"
                    >
                      {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </form>

                  <div className="space-y-2 mt-3">
                    {searchResults.length > 0 ? (
                      searchResults.map((res, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentPage(res.chunk.pageStart)}
                          className="w-full text-left p-3 bg-[#0A1F16] hover:bg-emerald-950 border border-emerald-900/30 rounded-xl space-y-1 transition"
                        >
                          <div className="flex items-center justify-between text-[10px] text-amber-400 font-mono">
                            <span>Trang {res.chunk.pageStart}</span>
                            <span>{res.chunk.chapterTitle || 'Chương sách'}</span>
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed">{res.snippet}</p>
                        </button>
                      ))
                    ) : (
                      searchQuery && !isSearching && <p className="text-xs text-slate-500 text-center py-4">Không tìm thấy kết quả phù hợp.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Highlight & Note Modal */}
      {showHighlightModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0B1F17] border border-emerald-700/60 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-emerald-900/50 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Highlighter className="w-4 h-4 text-amber-300" />
                Tô màu & Ghi chú (Trang {currentPage})
              </h3>
              <button onClick={() => setShowHighlightModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-black/40 rounded-xl text-xs text-slate-300 italic max-h-24 overflow-y-auto border border-emerald-950">
              "{selectedText}"
            </div>

            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">Màu sắc nổi bật:</label>
              <div className="flex gap-2">
                {['yellow', 'green', 'blue', 'pink', 'purple'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setHighlightColor(color)}
                    className={`w-6 h-6 rounded-full border-2 transition ${
                      highlightColor === color ? 'border-white scale-110' : 'border-transparent opacity-70'
                    }`}
                    style={{ backgroundColor: color === 'yellow' ? '#EAB308' : color === 'green' ? '#22C55E' : color === 'blue' ? '#3B82F6' : color === 'pink' ? '#EC4899' : '#A855F7' }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1">Ghi chú cá nhân (tùy chọn):</label>
              <textarea
                value={highlightNote}
                onChange={(e) => setHighlightNote(e.target.value)}
                placeholder="Ghi chú suy nghĩ, công thức liên quan hoặc câu hỏi cần hỏi lại thầy cô..."
                rows={3}
                className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-3 text-xs text-slate-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowHighlightModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveHighlight}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
