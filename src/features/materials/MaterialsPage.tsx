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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { LearningMaterial, Subject, Outline } from '../../../shared/types';
import confetti from 'canvas-confetti';

type ActiveTab = 'materials' | 'outlines';
type ModalMode = 'upload' | 'note' | 'create_outline' | null;

export const MaterialsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ActiveTab>('materials');
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
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
        if (!noteSubjectId) setNoteSubjectId(res.subjects[0].id);
        if (!outlineSubjectId) setOutlineSubjectId(res.subjects[0].id);
      }
    } catch {
      setSubjects([
        { id: 'subj-math', userId: 'default', name: 'Toán học', color: '#22C55E' },
        { id: 'subj-eng', userId: 'default', name: 'Tiếng Anh', color: '#3B82F6' },
        { id: 'subj-lit', userId: 'default', name: 'Ngữ văn', color: '#EC4899' },
        { id: 'subj-phy', userId: 'default', name: 'Vật lý', color: '#8B5CF6' },
      ]);
    }
  };

  const fetchMaterialsAndOutlines = useCallback(async () => {
    setError(null);
    try {
      const [matRes, outRes] = await Promise.all([
        api.getMaterials(),
        api.getOutlines(),
      ]);
      setMaterials(matRes.materials || []);
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

  // Polling with backoff for materials currently processing
  useEffect(() => {
    const hasProcessing = materials.some(
      (m) => m.processingStatus === 'processing' || m.processingStatus === 'queued' || m.processingStatus === 'uploading'
    );

    if (!hasProcessing) return;

    const timer = setTimeout(() => {
      fetchMaterialsAndOutlines();
    }, 4000);

    return () => clearTimeout(timer);
  }, [materials, fetchMaterialsAndOutlines]);

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

    const validMimes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ];
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

      // 2. Direct upload file to R2 storage
      await api.uploadMaterialDirect(intent.r2ObjectKey, selectedFile, mimeType);
      setUploadProgress(80);

      // 3. Finalize upload metadata
      const finalized = await api.finalizeMaterialUpload(intent.material.id, {
        sizeBytes: selectedFile.size,
      });

      setUploadProgress(100);
      setMaterials([finalized.material, ...materials]);

      // Reset form
      setSelectedFile(null);
      setUploadTitle('');
      setModalMode(null);
      confetti({ particleCount: 70, spread: 50 });

      fetchMaterialsAndOutlines();
    } catch (err: any) {
      alert(err.message || 'Tải lên tài liệu thất bại.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) {
      alert('Vui lòng nhập tiêu đề ghi chú.');
      return;
    }
    if (!noteContent.trim()) {
      alert('Vui lòng nhập nội dung ghi chú.');
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
      setOutlineTitle('');
      setOutlineChapter('');
      setOutlineMarkdown('');
      setModalMode(null);
      confetti({ particleCount: 60, spread: 50 });
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề cương.');
    } finally {
      setIsSavingOutline(false);
    }
  };

  const handleDeleteOutline = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đề cương này?')) return;
    try {
      await api.deleteOutline(id);
      setOutlines((prev) => prev.filter((o) => o.id !== id));
      if (editingOutline?.id === id) setEditingOutline(null);
    } catch (err: any) {
      alert(err.message || 'Không thể xóa đề cương.');
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
    if (!bytes || bytes <= 0) return 'Ghi chú văn bản';
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
            <span>Đã trích xuất AI</span>
          </span>
        );
      case 'processing':
      case 'queued':
      case 'uploading':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-800/40 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>Đang OCR / Phân tích...</span>
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

  const filteredMaterials =
    selectedSubjectFilter === 'all'
      ? materials
      : materials.filter(
          (m) =>
            m.subjectId === selectedSubjectFilter ||
            (m.subjectName || '').toLowerCase().includes(selectedSubjectFilter.toLowerCase())
        );

  const filteredOutlines =
    selectedSubjectFilter === 'all'
      ? outlines
      : outlines.filter(
          (o) =>
            o.subjectId === selectedSubjectFilter ||
            (o.subjectName || '').toLowerCase().includes(selectedSubjectFilter.toLowerCase())
        );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#F3FAF5] flex items-center gap-2.5">
            <FolderKanban className="w-6 h-6 text-[#22C55E]" />
            <span>Kho Tài Liệu & Đề Cương Ôn Tập</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-1">
            Lưu trữ PDF & hình ảnh an toàn trên R2, tự động trích xuất đề cương và tạo câu hỏi luyện thi bám sát tài liệu
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalMode('create_outline')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-all cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#22C55E]" />
            <span>Tạo đề cương</span>
          </button>

          <button
            onClick={() => setModalMode('note')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-all cursor-pointer"
          >
            <FileCode className="w-4 h-4 text-[#22C55E]" />
            <span>Ghi chú</span>
          </button>

          <button
            onClick={() => setModalMode('upload')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Tải lên tệp</span>
          </button>
        </div>
      </div>

      {/* Main Tabs: Materials vs Outlines */}
      <div className="flex items-center justify-between border-b border-[rgba(34,197,94,0.18)] pb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('materials')}
            className={`pb-2 text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'materials'
                ? 'border-[#22C55E] text-[#86EFAC]'
                : 'border-transparent text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Tài liệu & Tệp đã tải lên ({materials.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('outlines')}
            className={`pb-2 text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'outlines'
                ? 'border-[#22C55E] text-[#86EFAC]'
                : 'border-transparent text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Đề cương kiến thức ({outlines.length})</span>
          </button>
        </div>

        {/* Subject Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedSubjectFilter('all')}
            className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedSubjectFilter === 'all'
                ? 'bg-[#16A34A] text-[#050806]'
                : 'bg-[#0B120D] text-[#A9B8AE] border border-[rgba(34,197,94,0.18)] hover:bg-[#101A13]'
            }`}
          >
            Tất cả
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSubjectFilter(s.id)}
              className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedSubjectFilter === s.id
                  ? 'bg-[#16A34A] text-[#050806]'
                  : 'bg-[#0B120D] text-[#A9B8AE] border border-[rgba(34,197,94,0.18)] hover:bg-[#101A13]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchMaterialsAndOutlines} className="px-3 py-1 bg-rose-900 text-white font-bold rounded-lg cursor-pointer">
            Thử lại
          </button>
        </div>
      )}

      {/* TAB 1: MATERIALS & FILES (6.1 & 6.3) */}
      {activeTab === 'materials' && (
        <>
          {isLoading ? (
            <div className="p-16 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2.5">
              <RefreshCw className="w-5 h-5 animate-spin text-[#22C55E]" />
              <span>Đang tải kho tài liệu...</span>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="p-16 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] space-y-3">
              <FolderKanban className="w-10 h-10 text-[#22C55E] mx-auto opacity-60" />
              <p className="font-bold text-sm text-[#F3FAF5]">Chưa có tài liệu nào</p>
              <p className="text-[11px] max-w-sm mx-auto">
                Bấm <strong>"Tải lên tệp"</strong> để lưu trữ PDF, hình ảnh bài giảng và tự động trích xuất kiến thức.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaterials.map((mat) => {
                const isRenaming = renamingMaterialId === mat.id;
                const isGenOutline = generatingOutlineMatId === mat.id;

                return (
                  <div
                    key={mat.id}
                    className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50 shadow-xl transition-all space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-2xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center shrink-0 border border-[#22C55E]/30 shadow-sm">
                          {mat.type === 'image' ? (
                            <FileImage className="w-5 h-5 text-[#22C55E]" />
                          ) : mat.type === 'notes' ? (
                            <FileCode className="w-5 h-5 text-[#22C55E]" />
                          ) : (
                            <FileText className="w-5 h-5 text-[#22C55E]" />
                          )}
                        </div>
                        {getStatusBadge(mat.processingStatus)}
                      </div>

                      <div>
                        {isRenaming ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={renamingTitle}
                              onChange={(e) => setRenamingTitle(e.target.value)}
                              className="text-xs p-1.5 bg-[#050806] border border-[#22C55E] text-[#F3FAF5] rounded-lg w-full focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleRenameMaterial(mat.id)}
                              className="px-2 py-1 bg-[#16A34A] text-[#050806] rounded font-bold text-[10px]"
                            >
                              Lưu
                            </button>
                            <button
                              onClick={() => setRenamingMaterialId(null)}
                              className="p-1 text-[#A9B8AE] hover:text-[#F3FAF5]"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between group">
                            <h3 className="text-sm font-bold text-[#F3FAF5] truncate flex-1" title={mat.title}>
                              {mat.title}
                            </h3>
                            <button
                              onClick={() => {
                                setRenamingMaterialId(mat.id);
                                setRenamingTitle(mat.title);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#A9B8AE] hover:text-[#86EFAC] transition-opacity cursor-pointer"
                              title="Đổi tên tài liệu"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[11px] text-[#A9B8AE] mt-1">
                          <span className="font-semibold text-[#86EFAC]">{mat.subjectName}</span>
                          <span>•</span>
                          <span>{formatFileSize(mat.sizeBytes)}</span>
                        </div>
                        <div className="text-[10px] text-[#A9B8AE]/60 mt-0.5">
                          Tải lên: {new Date(mat.createdAt).toLocaleDateString('vi-VN')}
                        </div>
                      </div>

                      {mat.summary && (
                        <p className="text-xs text-[#A9B8AE] line-clamp-2 leading-relaxed bg-[#101A13] p-2.5 rounded-xl border border-[rgba(34,197,94,0.15)]">
                          {mat.summary}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-[rgba(34,197,94,0.15)] space-y-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowPreviewModal(mat)}
                          className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] text-xs font-bold border border-[rgba(34,197,94,0.2)] transition-all cursor-pointer"
                          title="Xem trước nội dung hoặc tóm tắt"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem trước</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadMaterial(mat)}
                          className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] text-xs font-bold border border-[rgba(34,197,94,0.2)] transition-all cursor-pointer"
                          title="Tải xuống tệp riêng tư có chữ ký an toàn"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải xuống</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleGenerateOutlineFromMaterial(mat)}
                          disabled={isGenOutline || mat.processingStatus !== 'ready'}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-[#14532D] hover:bg-[#16A34A] hover:text-[#050806] text-[#86EFAC] text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
                          title="Tạo đề cương kiến thức bằng AI"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isGenOutline ? 'Đang tạo...' : 'Tạo đề cương AI'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setQuizGenModalMaterial(mat)}
                          disabled={mat.processingStatus !== 'ready'}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow transition-all cursor-pointer disabled:opacity-40"
                          title="Tạo câu hỏi luyện tập dựa trên tài liệu"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Tạo đề ôn</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteMaterial(mat.id)}
                          className="p-2 rounded-xl text-[#A9B8AE] hover:text-rose-400 hover:bg-rose-950/30 transition-all cursor-pointer"
                          title="Xóa tài liệu"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: OUTLINES (6.2) */}
      {activeTab === 'outlines' && (
        <div className="space-y-4">
          {filteredOutlines.length === 0 ? (
            <div className="p-16 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] space-y-3">
              <BookOpen className="w-10 h-10 text-[#22C55E] mx-auto opacity-60" />
              <p className="font-bold text-sm text-[#F3FAF5]">Chưa có đề cương nào</p>
              <p className="text-[11px] max-w-sm mx-auto">
                Bấm <strong>"Tạo đề cương"</strong> hoặc chuyển sang tab Tài liệu và chọn <strong>"Tạo đề cương AI"</strong>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredOutlines.map((ot) => (
                <div
                  key={ot.id}
                  className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40 shadow-xl space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                        {ot.subjectName} • {ot.chapter || 'Chương tổng hợp'}
                      </span>
                      <button
                        onClick={() => handleDeleteOutline(ot.id)}
                        className="text-[#A9B8AE] hover:text-rose-400 p-1"
                        title="Xóa đề cương"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="text-sm font-bold text-[#F3FAF5]">{ot.title}</h3>

                    <div className="p-3 bg-[#101A13] rounded-2xl border border-[rgba(34,197,94,0.15)] text-xs text-[#A9B8AE] max-h-40 overflow-y-auto whitespace-pre-line leading-relaxed font-mono">
                      {ot.contentMarkdown}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#A9B8AE] pt-2 border-t border-[rgba(34,197,94,0.15)]">
                    <span>Cập nhật: {new Date(ot.updatedAt || ot.createdAt).toLocaleDateString('vi-VN')}</span>
                    <button
                      onClick={() => setEditingOutline(ot)}
                      className="text-xs font-bold text-[#86EFAC] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem toàn bộ</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Material Modal (6.1) */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-2xl w-full shadow-2xl space-y-4 text-[#F3FAF5] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Eye className="w-4 h-4 text-[#22C55E]" />
                <span>Xem Trước: {showPreviewModal.title}</span>
              </div>
              <button onClick={() => setShowPreviewModal(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-[#101A13] rounded-xl border border-[rgba(34,197,94,0.15)] flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#F3FAF5]">Môn học: </span>
                  <span className="text-[#86EFAC]">{showPreviewModal.subjectName}</span>
                  <span className="mx-2">•</span>
                  <span className="text-[#A9B8AE]">Dung lượng: {formatFileSize(showPreviewModal.sizeBytes)}</span>
                </div>
                <button
                  onClick={() => handleDownloadMaterial(showPreviewModal)}
                  className="flex items-center gap-1 px-3 py-1 bg-[#14532D] text-[#86EFAC] rounded-lg font-bold hover:bg-[#16A34A] hover:text-[#050806] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải file</span>
                </button>
              </div>

              {/* Text / Summary View */}
              <div className="p-4 bg-[#050806] rounded-2xl border border-[rgba(34,197,94,0.2)] max-h-72 overflow-y-auto whitespace-pre-line text-[#A9B8AE] leading-relaxed">
                {showPreviewModal.contentText || showPreviewModal.summary || 'Chưa có nội dung văn bản được trích xuất.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal (6.1) */}
      {modalMode === 'upload' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Upload className="w-4 h-4 text-[#22C55E]" />
                <span>Tải lên tài liệu học tập (PDF & Ảnh)</span>
              </div>
              <button onClick={() => setModalMode(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-[#22C55E] bg-[#14532D]/30'
                    : selectedFile
                    ? 'border-[#22C55E]/60 bg-[#101A13]'
                    : 'border-[rgba(34,197,94,0.25)] hover:border-[#22C55E]/40 bg-[#050806]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-[#22C55E] mx-auto" />
                    <div className="font-bold text-[#F3FAF5] truncate max-w-xs mx-auto">{selectedFile.name}</div>
                    <div className="text-[11px] text-[#A9B8AE]">{formatFileSize(selectedFile.size)}</div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Upload className="w-8 h-8 text-[#22C55E] mx-auto opacity-70" />
                    <div className="font-bold text-[#F3FAF5]">Kéo thả file PDF hoặc ảnh vào đây</div>
                    <div className="text-[11px] text-[#A9B8AE]">Hỗ trợ PDF, PNG, JPG, JPEG, WebP (Tối đa 25MB)</div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Tên tài liệu:</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Ví dụ: Đề cương Toán học kỳ 1"
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Môn học:</label>
                  <select
                    value={uploadSubjectId}
                    onChange={(e) => setUploadSubjectId(e.target.value)}
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isUploading && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#86EFAC]">
                    <span>Đang tải lên Cloudflare R2...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-[#101A13] rounded-full h-2 overflow-hidden">
                    <div className="bg-[#22C55E] h-2 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  disabled={isUploading}
                  className="px-4 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-40"
                >
                  {isUploading ? 'Đang tải lên...' : 'Tải lên & Phân tích'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Outline Modal (6.2) */}
      {modalMode === 'create_outline' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <BookOpen className="w-4 h-4 text-[#22C55E]" />
                <span>Tạo đề cương ôn tập</span>
              </div>
              <button onClick={() => setModalMode(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualOutlineSubmit} className="space-y-4 text-xs">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Tiêu đề đề cương:</label>
                  <input
                    type="text"
                    value={outlineTitle}
                    onChange={(e) => setOutlineTitle(e.target.value)}
                    placeholder="Ví dụ: Đề cương ôn thi giữa kỳ 1 - Toán 9"
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Môn học:</label>
                    <select
                      value={outlineSubjectId}
                      onChange={(e) => setOutlineSubjectId(e.target.value)}
                      className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5]"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Chương / Phạm vi:</label>
                    <input
                      type="text"
                      value={outlineChapter}
                      onChange={(e) => setOutlineChapter(e.target.value)}
                      placeholder="Ví dụ: Chương 1 Căn bậc hai"
                      className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Nội dung đề cương (Markdown):</label>
                  <textarea
                    rows={6}
                    value={outlineMarkdown}
                    onChange={(e) => setOutlineMarkdown(e.target.value)}
                    placeholder="Nhập kiến thức trọng tâm, công thức và dạng bài tập..."
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl p-3 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] resize-none font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingOutline}
                  className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-40"
                >
                  {isSavingOutline ? 'Đang lưu...' : 'Lưu đề cương'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {modalMode === 'note' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <FileCode className="w-4 h-4 text-[#22C55E]" />
                <span>Tạo ghi chú học tập</span>
              </div>
              <button onClick={() => setModalMode(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleNoteSubmit} className="space-y-4 text-xs">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Tiêu đề ghi chú:</label>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Nội dung:</label>
                  <textarea
                    rows={6}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl p-3 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] resize-none"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalMode(null)} className="px-4 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs cursor-pointer">Hủy</button>
                <button type="submit" disabled={isSavingNote} className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-40">Lưu ghi chú</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quiz Generation Modal (6.3) */}
      {quizGenModalMaterial && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Play className="w-4 h-4 text-[#22C55E]" />
                <span>Tạo câu hỏi từ tài liệu</span>
              </div>
              <button onClick={() => setQuizGenModalMaterial(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleGenerateQuizSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-[#101A13] rounded-2xl border border-[rgba(34,197,94,0.15)] space-y-1">
                <div className="font-bold text-[#F3FAF5] text-xs truncate">{quizGenModalMaterial.title}</div>
                <div className="text-[11px] text-[#A9B8AE]">Môn: {quizGenModalMaterial.subjectName || 'Tài liệu'}</div>
              </div>
              <div>
                <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Số lượng câu hỏi:</label>
                <select value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))} className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] cursor-pointer">
                  <option value={3}>3 câu hỏi ngắn (Khởi động)</option>
                  <option value={5}>5 câu hỏi trắc nghiệm (Tiêu chuẩn)</option>
                  <option value={10}>10 câu hỏi tổng hợp</option>
                  <option value={15}>15 câu hỏi chuyên sâu</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Mức độ độ khó:</label>
                <div className="grid grid-cols-3 gap-2">
                  {['easy', 'medium', 'hard'].map((d) => (
                    <button key={d} type="button" onClick={() => setQuizDifficulty(d as any)} className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${quizDifficulty === d ? 'bg-[#16A34A] text-[#050806]' : 'bg-[#101A13] text-[#A9B8AE] border border-[rgba(34,197,94,0.2)]'}`}>{d === 'easy' ? 'Cơ bản' : d === 'medium' ? 'Vận dụng' : 'Nâng cao'}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setQuizGenModalMaterial(null)} disabled={isGeneratingQuiz} className="px-4 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs cursor-pointer">Hủy</button>
                <button
                  type="submit"
                  disabled={isGeneratingQuiz}
                  className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                >
                  {isGeneratingQuiz && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isGeneratingQuiz ? 'Đang trích xuất & tạo đề...' : 'Bắt đầu luyện tập'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Full Outline Modal */}
      {editingOutline && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-2xl w-full shadow-2xl space-y-4 text-[#F3FAF5] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <BookOpen className="w-4 h-4 text-[#22C55E]" />
                <span>{editingOutline.title}</span>
              </div>
              <button onClick={() => setEditingOutline(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-[#050806] rounded-2xl border border-[rgba(34,197,94,0.2)] max-h-96 overflow-y-auto whitespace-pre-line text-[#F3FAF5] leading-relaxed">
                {editingOutline.contentMarkdown}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
