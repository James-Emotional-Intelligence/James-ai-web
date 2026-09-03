import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderKanban,
  FileText,
  Upload,
  Sparkles,
  Play,
  FileImage,
  Trash2,
  X,
  Plus,
  Download,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  BookOpen,
  HelpCircle,
  FileCode,
  File,
  Edit2,
  Pin,
  Eye,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { LearningMaterial, Subject, Outline, BookProgress } from '../../../shared/types';
import confetti from 'canvas-confetti';

type ActiveTab = 'materials' | 'books' | 'outlines';
type ModalMode = 'upload' | 'upload_book' | 'note' | 'create_outline' | null;

export const MaterialsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ActiveTab>('books');
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [books, setBooks] = useState<LearningMaterial[]>([]);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal controls
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [showSummaryModal, setShowSummaryModal] = useState<LearningMaterial | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<LearningMaterial | null>(null);
  const [quizGenModalMaterial, setQuizGenModalMaterial] = useState<LearningMaterial | null>(null);
  const [editingOutline, setEditingOutline] = useState<Outline | null>(null);

  // Rename Material state
  const [renamingMaterialId, setRenamingMaterialId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState('');

  // Upload state (6.1)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadSubjectId, setUploadSubjectId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Book Upload State
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [bookTitle, setBookTitle] = useState('');
  const [bookSubjectId, setBookSubjectId] = useState('');
  const [bookPublisher, setBookPublisher] = useState('');
  const [bookEditionYear, setBookEditionYear] = useState('2024');
  const [bookRightsConfirmed, setBookRightsConfirmed] = useState(false);
  const [bookUploadProgress, setBookUploadProgress] = useState(0);
  const [isUploadingBook, setIsUploadingBook] = useState(false);
  const bookFileInputRef = useRef<HTMLInputElement>(null);

  // Note state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteSubjectId, setNoteSubjectId] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Manual Outline Form State (6.2)
  const [outlineTitle, setOutlineTitle] = useState('');
  const [outlineSubjectId, setOutlineSubjectId] = useState('');
  const [outlineChapter, setOutlineChapter] = useState('');
  const [outlineMarkdown, setOutlineMarkdown] = useState('');
  const [isSavingOutline, setIsSavingOutline] = useState(false);

  // Quiz Generation state (6.3)
  const [quizCount, setQuizCount] = useState(5);
  const [quizDifficulty, setQuizDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [generatingOutlineMatId, setGeneratingOutlineMatId] = useState<string | null>(null);

  const fetchSubjects = async () => {
    try {
      const res = await api.getSubjects();
      setSubjects(res.subjects || []);
      if (res.subjects?.length > 0) {
        if (!uploadSubjectId) setUploadSubjectId(res.subjects[0].id);
        if (!bookSubjectId) setBookSubjectId(res.subjects[0].id);
        if (!noteSubjectId) setNoteSubjectId(res.subjects[0].id);
        if (!outlineSubjectId) setOutlineSubjectId(res.subjects[0].id);
      }
    } catch {
      setSubjects([
        { id: 'subj-math', userId: 'default', name: 'Toán học', color: '#22C55E', icon: 'calculator' },
        { id: 'subj-eng', userId: 'default', name: 'Tiếng Anh', color: '#3B82F6', icon: 'globe' },
        { id: 'subj-lit', userId: 'default', name: 'Ngữ văn', color: '#EC4899', icon: 'book' },
        { id: 'subj-phy', userId: 'default', name: 'Vật lý', color: '#8B5CF6', icon: 'atom' },
      ]);
    }
  };

  const fetchMaterialsAndOutlines = useCallback(async () => {
    setError(null);
    try {
      const [matRes, bookRes, outRes] = await Promise.all([
        api.getMaterials().catch(() => ({ materials: [] })),
        api.getBooks().catch(() => ({ books: [], total: 0 })),
        api.getOutlines().catch(() => ({ outlines: [] })),
      ]);
      setMaterials(matRes.materials || []);
      setBooks(bookRes.books || []);
      setOutlines(outRes.outlines || []);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách tài liệu.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
    fetchMaterialsAndOutlines();
  }, [fetchMaterialsAndOutlines]);

  // Polling for books/materials currently processing
  useEffect(() => {
    const hasProcessing =
      materials.some((m) => m.processingStatus === 'processing' || m.processingStatus === 'queued' || m.processingStatus === 'uploading') ||
      books.some((b) => b.processingStatus === 'processing' || b.processingStatus === 'queued' || b.processingStatus === 'uploading');

    if (!hasProcessing) return;

    const timer = setTimeout(() => {
      fetchMaterialsAndOutlines();
    }, 4000);

    return () => clearTimeout(timer);
  }, [materials, books, fetchMaterialsAndOutlines]);

  // File Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      alert('Dung lượng tệp vượt quá giới hạn 25MB.');
      return;
    }

    const validMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validMimes.includes(file.type) && !file.name.match(/\.(pdf|png|jpe?g|webp)$/i)) {
      alert('Định dạng tệp không được hỗ trợ. Vui lòng chọn tệp PDF, PNG, JPG/JPEG hoặc WebP.');
      return;
    }

    setSelectedFile(file);
    if (!uploadTitle.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setUploadTitle(cleanName);
    }
  };

  const handleBookFileSelected = (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      alert('Dung lượng sách mềm vượt quá giới hạn 100MB.');
      return;
    }

    const validExts = /\.(pdf|epub|docx|txt|md)$/i;
    if (!file.name.match(validExts)) {
      alert('Định dạng sách không được hỗ trợ. Vui lòng chọn tệp PDF, EPUB, DOCX, TXT hoặc Markdown.');
      return;
    }

    setBookFile(file);
    if (!bookTitle.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setBookTitle(cleanName);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Vui lòng chọn tệp PDF hoặc hình ảnh để tải lên.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const subjectId = uploadSubjectId || (subjects[0]?.id || 'subj-math');
      const mimeType = selectedFile.type || (selectedFile.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      // 1. Create Upload Intent
      const intent = await api.createMaterialUploadIntent({
        title: uploadTitle.trim() || selectedFile.name,
        subjectId,
        fileName: selectedFile.name,
        mimeType,
        sizeBytes: selectedFile.size,
      });

      setUploadProgress(40);

      // 2. Direct upload to storage
      await api.uploadMaterialDirect(intent.r2ObjectKey, selectedFile, mimeType);
      setUploadProgress(85);

      // 3. Finalize upload
      await api.finalizeMaterialUpload(intent.material.id, {
        sizeBytes: selectedFile.size,
      });

      setUploadProgress(100);
      confetti({ particleCount: 60, spread: 50 });

      // Refresh list
      await fetchMaterialsAndOutlines();
      setModalMode(null);
      setSelectedFile(null);
      setUploadTitle('');
    } catch (err: any) {
      alert(err.message || 'Tải lên tài liệu thất bại.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Sách Mềm Upload Handler
  const handleUploadBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookFile) {
      alert('Vui lòng chọn tệp sách mềm để tải lên.');
      return;
    }
    if (!bookRightsConfirmed) {
      alert('Vui lòng xác nhận quyền sử dụng tệp sách cho mục đích học tập cá nhân trước khi tiếp tục.');
      return;
    }

    setIsUploadingBook(true);
    setBookUploadProgress(10);

    try {
      const subjectId = bookSubjectId || (subjects[0]?.id || 'subj-math');
      const ext = bookFile.name.split('.').pop()?.toLowerCase();
      let mimeType = bookFile.type;
      if (!mimeType) {
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (ext === 'epub') mimeType = 'application/epub+zip';
        else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === 'md') mimeType = 'text/markdown';
        else mimeType = 'text/plain';
      }

      // 1. Create Book Upload Intent
      const intent = await api.createBookUploadIntent({
        title: bookTitle.trim() || bookFile.name,
        subjectId,
        fileName: bookFile.name,
        mimeType,
        sizeBytes: bookFile.size,
        rightsConfirmed: true,
        rightsTermsVersion: 'v1.0',
        publisher: bookPublisher.trim() || undefined,
        editionYear: bookEditionYear ? parseInt(bookEditionYear, 10) : 2024,
      });

      setBookUploadProgress(40);

      // 2. Direct upload to storage
      await api.uploadMaterialDirect(intent.r2ObjectKey, bookFile, mimeType);
      setBookUploadProgress(85);

      // 3. Finalize upload & enqueue worker parsing
      await api.finalizeBookUpload(intent.book.id, {
        sizeBytes: bookFile.size,
      });

      setBookUploadProgress(100);
      confetti({ particleCount: 70, spread: 55 });

      await fetchMaterialsAndOutlines();
      setModalMode(null);
      setBookFile(null);
      setBookTitle('');
      setBookPublisher('');
      setBookRightsConfirmed(false);
      setActiveTab('books');
    } catch (err: any) {
      alert(err.message || 'Tải sách mềm thất bại.');
    } finally {
      setIsUploadingBook(false);
      setBookUploadProgress(0);
    }
  };

  const handleDeleteBook = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa cuốn sách mềm này khỏi kho tài liệu?')) return;
    try {
      await api.deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (err: any) {
      alert(err.message || 'Không thể xóa sách mềm.');
    }
  };

  const handleRetryBook = async (id: string) => {
    try {
      await api.retryBookProcessing(id);
      await fetchMaterialsAndOutlines();
    } catch (err: any) {
      alert(err.message || 'Không thể gửi lại yêu cầu xử lý sách.');
    }
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) {
      alert('Vui lòng nhập tiêu đề và nội dung ghi chú.');
      return;
    }

    setIsSavingNote(true);
    try {
      const subjectId = noteSubjectId || (subjects[0]?.id || 'subj-math');
      const res = await api.createMaterialNote({
        title: noteTitle.trim(),
        subjectId,
        contentText: noteContent.trim(),
      });

      setMaterials([res.material, ...materials]);
      setNoteTitle('');
      setNoteContent('');
      setModalMode(null);
      confetti({ particleCount: 50, spread: 40 });
    } catch (err: any) {
      alert(err.message || 'Lưu ghi chú thất bại.');
    } finally {
      setIsSavingNote(false);
    }
  };

  // 6.1 Download with Signed/Timed URL
  const handleDownloadMaterial = async (mat: LearningMaterial) => {
    try {
      const res = await api.getMaterialDownloadUrl(mat.id);
      if (res?.downloadUrl) {
        window.open(res.downloadUrl, '_blank');
      } else {
        alert('Không tìm thấy đường dẫn tải tệp.');
      }
    } catch (err: any) {
      alert(err.message || 'Không thể tạo liên kết tải xuống an toàn.');
    }
  };

  // 6.1 Rename Material
  const handleRenameMaterial = async (id: string) => {
    if (!renamingTitle.trim()) return;
    try {
      const res = await api.renameMaterial(id, renamingTitle.trim());
      setMaterials((prev) => prev.map((m) => (m.id === id ? res.material : m)));
      setRenamingMaterialId(null);
      setRenamingTitle('');
    } catch (err: any) {
      alert(err.message || 'Không thể đổi tên tài liệu.');
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này?')) return;
    try {
      await api.deleteMaterial(id);
      setMaterials(materials.filter((m) => m.id !== id));
      if (showSummaryModal?.id === id) setShowSummaryModal(null);
      if (showPreviewModal?.id === id) setShowPreviewModal(null);
    } catch (err: any) {
      alert(err.message || 'Không thể xóa tài liệu.');
    }
  };

  const handleReprocess = async (id: string) => {
    try {
      await api.reprocessMaterial(id);
      fetchMaterialsAndOutlines();
    } catch (err: any) {
      alert(err.message || 'Không thể xử lý lại tài liệu.');
    }
  };

  // 6.2 Generate AI Outline from Material
  const handleGenerateOutlineFromMaterial = async (mat: LearningMaterial) => {
    if (mat.processingStatus !== 'ready') {
      alert('Tài liệu đang trong quá trình xử lý nội dung. Vui lòng thử lại sau vài giây.');
      return;
    }

    setGeneratingOutlineMatId(mat.id);
    try {
      const res = await api.generateMaterialOutline(mat.id);
      setOutlines([res.outline, ...outlines]);
      confetti({ particleCount: 80, spread: 60 });
      setActiveTab('outlines');
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề cương AI từ tài liệu này.');
    } finally {
      setGeneratingOutlineMatId(null);
    }
  };

  // 6.2 Manual Outline Submission
  const handleManualOutlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outlineTitle.trim()) return;

    setIsSavingOutline(true);
    try {
      const subjectId = outlineSubjectId || (subjects[0]?.id || 'subj-math');
      const res = await api.createOutline({
        title: outlineTitle.trim(),
        subjectId,
        chapter: outlineChapter.trim() || 'Chương tổng hợp',
        contentMarkdown: outlineMarkdown.trim() || '# ' + outlineTitle,
      });

      setOutlines([res.outline, ...outlines]);
      setModalMode(null);
      setOutlineTitle('');
      setOutlineChapter('');
      setOutlineMarkdown('');
      confetti({ particleCount: 60, spread: 45 });
    } catch (err: any) {
      alert(err.message || 'Lưu đề cương thất bại.');
    } finally {
      setIsSavingOutline(false);
    }
  };

  // 6.3 Generate Quiz from Material
  const handleGenerateQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizGenModalMaterial) return;

    if (quizGenModalMaterial.processingStatus !== 'ready') {
      alert('Tài liệu chưa xử lý xong. Không thể tạo câu hỏi.');
      return;
    }

    setIsGeneratingQuiz(true);
    try {
      const res = await api.generateQuizFromMaterial(quizGenModalMaterial.id, {
        questionCount: quizCount,
        difficulty: quizDifficulty,
      });

      confetti({ particleCount: 90, spread: 65 });
      setQuizGenModalMaterial(null);
      setShowSummaryModal(null);

      if (res.quizId) {
        navigate(`/exams?quizId=${res.quizId}`);
      } else {
        navigate('/exams');
      }
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề luyện tập từ tài liệu.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Tệp văn bản';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
            <CheckCircle2 className="w-3 h-3 text-[#22C55E]" />
            <span>Đã sẵn sàng</span>
          </span>
        );
      case 'processing':
      case 'queued':
      case 'uploading':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-800/40 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>Đang trích xuất mục lục & OCR...</span>
          </span>
        );
      case 'needs_ocr':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-800/40">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>Bản scan (Cần OCR)</span>
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/70 text-rose-300 border border-rose-800/40">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>Lỗi xử lý</span>
          </span>
        );
      default:
        return null;
    }
  };

  const filteredBooks = books.filter((b) => {
    const matchSubj = selectedSubjectFilter === 'all' || b.subjectId === selectedSubjectFilter;
    const matchSearch = !searchFilter.trim() || b.title.toLowerCase().includes(searchFilter.toLowerCase()) || b.publisher?.toLowerCase().includes(searchFilter.toLowerCase());
    return matchSubj && matchSearch;
  });

  const filteredMaterials = materials.filter((m) => {
    const matchSubj = selectedSubjectFilter === 'all' || m.subjectId === selectedSubjectFilter;
    const matchSearch = !searchFilter.trim() || m.title.toLowerCase().includes(searchFilter.toLowerCase());
    return matchSubj && matchSearch;
  });

  const filteredOutlines = outlines.filter((o) => {
    const matchSubj = selectedSubjectFilter === 'all' || o.subjectId === selectedSubjectFilter;
    const matchSearch = !searchFilter.trim() || o.title.toLowerCase().includes(searchFilter.toLowerCase()) || o.chapter.toLowerCase().includes(searchFilter.toLowerCase());
    return matchSubj && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#F3FAF5] flex items-center gap-2.5">
            <FolderKanban className="w-6 h-6 text-[#22C55E]" />
            <span>Kho Tài Liệu & Sách Mềm Ôn Tập</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Đọc SGK, tài liệu tham khảo, trích xuất mục lục tự động và ôn tập chuẩn GDPT 2018.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setModalMode('upload_book')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-900/30 transition-all cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>Tải Sách mềm lên</span>
          </button>

          <button
            onClick={() => setModalMode('create_outline')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-all cursor-pointer"
          >
            <Layers className="w-4 h-4 text-[#22C55E]" />
            <span>Tạo đề cương</span>
          </button>

          <button
            onClick={() => setModalMode('upload')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#22C55E]" />
            <span>Tải tệp nhỏ</span>
          </button>
        </div>
      </div>

      {/* Main Tabs: Books vs Materials vs Outlines */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[rgba(34,197,94,0.18)] pb-2 gap-3">
        <div className="flex items-center gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('books')}
            className={`pb-2 text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === 'books'
                ? 'border-[#22C55E] text-[#86EFAC]'
                : 'border-transparent text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Sách mềm SGK / Tham khảo ({books.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('materials')}
            className={`pb-2 text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === 'materials'
                ? 'border-[#22C55E] text-[#86EFAC]'
                : 'border-transparent text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Tài liệu & Tệp khác ({materials.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('outlines')}
            className={`pb-2 text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === 'outlines'
                ? 'border-[#22C55E] text-[#86EFAC]'
                : 'border-transparent text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Đề cương kiến thức ({outlines.length})</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Tìm kiếm..."
              className="pl-8 pr-3 py-1.5 bg-[#0B120D] border border-emerald-900/40 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#0B120D] border border-emerald-900/40 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Tất cả môn học</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: SÁCH MỀM */}
      {activeTab === 'books' && (
        <div className="space-y-4">
          {filteredBooks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBooks.map((book) => (
                <div
                  key={book.id}
                  className="bg-[#0B140E] border border-emerald-900/40 hover:border-emerald-500/50 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-800/40 text-emerald-300">
                        {book.subjectName || 'Môn học'}
                      </span>
                      {getStatusBadge(book.processingStatus || 'ready')}
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition line-clamp-2">
                        {book.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {book.publisher ? `${book.publisher} • ` : ''}Năm {book.editionYear || 2024}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-black/30 p-2.5 rounded-xl border border-emerald-950">
                      <div>
                        <span className="block text-slate-500 text-[10px]">Số trang:</span>
                        <span className="font-mono text-emerald-200 font-bold">{book.pageCount || 100} trang</span>
                      </div>
                      <div>
                        <span className="block text-slate-500 text-[10px]">Số chương:</span>
                        <span className="font-mono text-emerald-200 font-bold">{book.chapterCount || 4} chương</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-emerald-950/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/materials/books/${book.id}`)}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow transition"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Đọc sách & Ôn tập</span>
                    </button>

                    {book.processingStatus === 'error' && (
                      <button
                        onClick={() => handleRetryBook(book.id)}
                        className="p-2 text-amber-400 hover:bg-amber-950/40 border border-amber-800/30 rounded-xl text-xs transition"
                        title="Xử lý lại"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteBook(book.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 border border-transparent hover:border-rose-900/40 rounded-xl text-xs transition"
                      title="Xóa sách"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-[#0B120D] border border-emerald-900/30 rounded-3xl space-y-3">
              <BookOpen className="w-10 h-10 text-emerald-500/50 mx-auto" />
              <h3 className="text-sm font-bold text-white">Chưa có cuốn sách mềm nào</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Tải lên sách giáo khoa hoặc sách tham khảo định dạng PDF, EPUB, DOCX để Jami hỗ trợ bạn đọc, tra cứu và ôn tập.
              </p>
              <button
                onClick={() => setModalMode('upload_book')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tải sách mềm đầu tiên</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TÀI LIỆU & TỆP KHÁC */}
      {activeTab === 'materials' && (
        <div className="space-y-4">
          {filteredMaterials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map((mat) => (
                <div
                  key={mat.id}
                  className="bg-[#0B140E] border border-emerald-900/40 hover:border-emerald-500/50 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-800/40 text-emerald-300">
                        {mat.subjectName || 'Môn học'}
                      </span>
                      {getStatusBadge(mat.processingStatus || 'ready')}
                    </div>

                    <h3 className="text-sm font-bold text-white line-clamp-2">{mat.title}</h3>
                    <p className="text-[11px] text-slate-400">Dung lượng: {formatFileSize(mat.sizeBytes)}</p>
                  </div>

                  <div className="pt-2 border-t border-emerald-950/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleDownloadMaterial(mat)}
                      className="flex-1 py-1.5 px-3 bg-[#101A13] hover:bg-[#142219] border border-emerald-900/40 text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải xuống</span>
                    </button>
                    <button
                      onClick={() => handleGenerateOutlineFromMaterial(mat)}
                      disabled={generatingOutlineMatId === mat.id}
                      className="p-2 text-emerald-400 hover:bg-emerald-950 border border-emerald-800/30 rounded-xl text-xs transition"
                      title="Tạo đề cương AI"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteMaterial(mat.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 rounded-xl text-xs transition"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-[#0B120D] border border-emerald-900/30 rounded-3xl space-y-3">
              <FileText className="w-10 h-10 text-emerald-500/50 mx-auto" />
              <p className="text-xs text-slate-400">Chưa có tệp tài liệu nào.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ĐỀ CƯƠNG KIẾN THỨC */}
      {activeTab === 'outlines' && (
        <div className="space-y-4">
          {filteredOutlines.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredOutlines.map((out) => (
                <div
                  key={out.id}
                  className="bg-[#0B140E] border border-emerald-900/40 rounded-2xl p-5 space-y-3 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-800/40 text-emerald-300">
                      {out.subjectName || 'Môn học'}
                    </span>
                    <span className="text-[10px] text-slate-500">{out.chapter}</span>
                  </div>

                  <h3 className="text-sm font-bold text-white">{out.title}</h3>
                  <div className="text-xs text-slate-300 line-clamp-4 font-mono bg-black/30 p-3 rounded-xl border border-emerald-950">
                    {out.contentMarkdown}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-[#0B120D] border border-emerald-900/30 rounded-3xl space-y-3">
              <Sparkles className="w-10 h-10 text-emerald-500/50 mx-auto" />
              <p className="text-xs text-slate-400">Chưa có đề cương ôn tập nào.</p>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: TẢI SÁCH MỀM LÊN (CÓ BẢO ĐẢM QUYỀN HỢP PHÁP) */}
      {modalMode === 'upload_book' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0B1F17] border border-emerald-700/60 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-emerald-900/50 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                Tải Sách Mềm Lên Kho Tài Liệu
              </h2>
              <button onClick={() => setModalMode(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadBookSubmit} className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => bookFileInputRef.current?.click()}
                className="border-2 border-dashed border-emerald-800/60 hover:border-emerald-500/80 bg-black/30 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center gap-2"
              >
                <input
                  ref={bookFileInputRef}
                  type="file"
                  accept=".pdf,.epub,.docx,.txt,.md"
                  onChange={(e) => e.target.files?.[0] && handleBookFileSelected(e.target.files[0])}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">
                  {bookFile ? bookFile.name : 'Chọn hoặc kéo thả tệp sách (PDF, EPUB, DOCX, TXT)'}
                </span>
                <span className="text-[10px] text-slate-500">Giới hạn tối đa: 100MB</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tên cuốn sách:</label>
                <input
                  type="text"
                  required
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder="VD: Toán 9 Tập 1 (Kết nối tri thức)"
                  className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Môn học:</label>
                  <select
                    value={bookSubjectId}
                    onChange={(e) => setBookSubjectId(e.target.value)}
                    className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nhà xuất bản:</label>
                  <input
                    type="text"
                    value={bookPublisher}
                    onChange={(e) => setBookPublisher(e.target.value)}
                    placeholder="VD: NXB Giáo Dục Việt Nam"
                    className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                  />
                </div>
              </div>

              {/* Rights confirmation checkbox */}
              <div className="p-3 bg-emerald-950/60 border border-emerald-800/40 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="bookRightsCheck"
                  checked={bookRightsConfirmed}
                  onChange={(e) => setBookRightsConfirmed(e.target.checked)}
                  className="mt-0.5 accent-emerald-500 cursor-pointer"
                  required
                />
                <label htmlFor="bookRightsCheck" className="text-[11px] text-slate-300 leading-tight cursor-pointer select-none">
                  <span className="font-bold text-emerald-300 flex items-center gap-1 mb-0.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Cam kết bản quyền học tập:
                  </span>
                  Tôi có quyền sử dụng tệp này cho mục đích học tập cá nhân và không phân phối trái phép.
                </label>
              </div>

              {/* Progress */}
              {isUploadingBook && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Đang tải lên...</span>
                    <span>{bookUploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${bookUploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-emerald-900/40">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploadingBook || !bookRightsConfirmed}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5"
                >
                  {isUploadingBook ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>Tải lên sách</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TẢI LÊN TỆP NHỎ */}
      {modalMode === 'upload' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0B1F17] border border-emerald-700/60 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-emerald-900/50 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                Tải Lên Tệp Tài Liệu
              </h2>
              <button onClick={() => setModalMode(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-emerald-800/60 hover:border-emerald-500/80 bg-black/30 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">
                  {selectedFile ? selectedFile.name : 'Chọn hoặc kéo thả tệp (PDF, Ảnh)'}
                </span>
                <span className="text-[10px] text-slate-500">Giới hạn tối đa: 25MB</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tiêu đề tài liệu:</label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="VD: Đề thi thử Toán học kì 1"
                  className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Môn học:</label>
                <select
                  value={uploadSubjectId}
                  onChange={(e) => setUploadSubjectId(e.target.value)}
                  className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-emerald-900/40">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5"
                >
                  {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>Tải lên</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TẠO ĐỀ CƯƠNG THỦ CÔNG */}
      {modalMode === 'create_outline' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0B1F17] border border-emerald-700/60 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-emerald-900/50 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                Tạo Đề Cương Ôn Tập Mới
              </h2>
              <button onClick={() => setModalMode(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualOutlineSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tiêu đề đề cương:</label>
                <input
                  type="text"
                  required
                  value={outlineTitle}
                  onChange={(e) => setOutlineTitle(e.target.value)}
                  placeholder="VD: Trọng tâm Chương 1 - Hệ phương trình"
                  className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Môn học:</label>
                  <select
                    value={outlineSubjectId}
                    onChange={(e) => setOutlineSubjectId(e.target.value)}
                    className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Chương / Chủ đề:</label>
                  <input
                    type="text"
                    value={outlineChapter}
                    onChange={(e) => setOutlineChapter(e.target.value)}
                    placeholder="VD: Chương 1"
                    className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-2.5 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nội dung đề cương (Markdown):</label>
                <textarea
                  rows={6}
                  value={outlineMarkdown}
                  onChange={(e) => setOutlineMarkdown(e.target.value)}
                  placeholder="Nhập các ý chính, công thức cần ghi nhớ..."
                  className="w-full bg-[#050F0B] border border-emerald-900/50 rounded-xl p-3 text-xs text-slate-200 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-emerald-900/40">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingOutline}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow transition"
                >
                  Lưu đề cương
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
