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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { LearningMaterial, Subject } from '../../../shared/types';
import confetti from 'canvas-confetti';

type ModalMode = 'upload' | 'note' | null;

export const MaterialsPage: React.FC = () => {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal controls
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [showSummaryModal, setShowSummaryModal] = useState<LearningMaterial | null>(null);
  const [quizGenModalMaterial, setQuizGenModalMaterial] = useState<LearningMaterial | null>(null);

  // Upload state
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

  // Quiz Generation state
  const [quizCount, setQuizCount] = useState(5);
  const [quizDifficulty, setQuizDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  const fetchSubjects = async () => {
    try {
      const res = await api.getSubjects();
      setSubjects(res.subjects);
      if (res.subjects.length > 0) {
        if (!uploadSubjectId) setUploadSubjectId(res.subjects[0].id);
        if (!noteSubjectId) setNoteSubjectId(res.subjects[0].id);
      }
    } catch {
      // Default fallback subjects
      setSubjects([
        { id: 'subj-math', userId: 'default', name: 'Toán học', color: '#22C55E' },
        { id: 'subj-eng', userId: 'default', name: 'Tiếng Anh', color: '#3B82F6' },
        { id: 'subj-lit', userId: 'default', name: 'Ngữ văn', color: '#EC4899' },
        { id: 'subj-phy', userId: 'default', name: 'Vật lý', color: '#8B5CF6' },
      ]);
    }
  };

  const fetchMaterials = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getMaterials();
      setMaterials(res.materials);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách tài liệu.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
    fetchMaterials();
  }, [fetchMaterials]);

  // Polling with backoff for materials currently processing
  useEffect(() => {
    const hasProcessing = materials.some(
      (m) => m.processingStatus === 'processing' || m.processingStatus === 'queued' || m.processingStatus === 'uploading'
    );

    if (!hasProcessing) return;

    const timer = setTimeout(() => {
      fetchMaterials();
    }, 4000);

    return () => clearTimeout(timer);
  }, [materials, fetchMaterials]);

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
    // Validate size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      alert('Dung lượng tệp vượt quá giới hạn 25MB.');
      return;
    }

    // Validate MIME extension
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
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setUploadTitle(cleanName);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Vui lòng chọn tệp để tải lên.');
      return;
    }
    if (!uploadTitle.trim()) {
      alert('Vui lòng nhập tiêu đề tài liệu.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(15);

    try {
      const subjectId = uploadSubjectId || (subjects[0]?.id || 'subj-math');
      const mimeType = selectedFile.type || 'application/pdf';

      // 1. Create upload intent
      const intent = await api.createMaterialUploadIntent({
        title: uploadTitle.trim(),
        subjectId,
        fileName: selectedFile.name,
        mimeType,
        sizeBytes: selectedFile.size,
      });

      setUploadProgress(50);

      // 2. Direct upload bytes to server storage endpoint
      await api.uploadMaterialDirect(intent.r2ObjectKey, selectedFile, mimeType);

      setUploadProgress(90);

      // 3. Finalize upload
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

      // Refresh list to track processing
      fetchMaterials();
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

  const handleDownloadMaterial = async (mat: LearningMaterial) => {
    try {
      await api.downloadMaterialFile(mat.id, mat.fileName || mat.title);
    } catch (err: any) {
      alert(err.message || 'Không thể tải xuống nội dung tài liệu này.');
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này?')) return;
    try {
      await api.deleteMaterial(id);
      setMaterials(materials.filter((m) => m.id !== id));
      if (showSummaryModal?.id === id) setShowSummaryModal(null);
    } catch (err: any) {
      alert(err.message || 'Không thể xóa tài liệu.');
    }
  };

  const handleReprocess = async (id: string) => {
    try {
      await api.reprocessMaterial(id);
      fetchMaterials();
    } catch (err: any) {
      alert(err.message || 'Không thể xử lý lại tài liệu.');
    }
  };

  const handleGenerateQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizGenModalMaterial) return;

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
            <span>Đã xử lý AI</span>
          </span>
        );
      case 'processing':
      case 'queued':
      case 'uploading':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-800/40 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>Đang phân tích...</span>
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
            Lưu trữ tài liệu PDF, ảnh chụp bài giảng, ghi chú và tự động tạo tóm tắt cấu trúc & đề luyện tập
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalMode('note')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-all cursor-pointer"
          >
            <FileCode className="w-4 h-4 text-[#22C55E]" />
            <span>Tạo ghi chú</span>
          </button>

          <button
            onClick={() => setModalMode('upload')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Tải lên tệp</span>
          </button>
        </div>
      </div>

      {/* Subject Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedSubjectFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            selectedSubjectFilter === 'all'
              ? 'bg-[#16A34A] text-[#050806] shadow-sm shadow-[#16A34A]/25'
              : 'bg-[#0B120D] text-[#A9B8AE] border border-[rgba(34,197,94,0.18)] hover:bg-[#101A13]'
          }`}
        >
          Tất cả môn
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSubjectFilter(s.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              selectedSubjectFilter === s.id
                ? 'bg-[#16A34A] text-[#050806] shadow-sm shadow-[#16A34A]/25'
                : 'bg-[#0B120D] text-[#A9B8AE] border border-[rgba(34,197,94,0.18)] hover:bg-[#101A13]'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchMaterials} className="px-3 py-1 bg-rose-900 text-white font-bold rounded-lg cursor-pointer">
            Thử lại
          </button>
        </div>
      )}

      {/* Materials Grid */}
      {isLoading ? (
        <div className="p-16 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2.5">
          <RefreshCw className="w-5 h-5 animate-spin text-[#22C55E]" />
          <span>Đang tải kho tài liệu...</span>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="p-16 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] space-y-3">
          <FolderKanban className="w-10 h-10 text-[#22C55E] mx-auto opacity-60" />
          <p className="font-bold text-sm text-[#F3FAF5]">Chưa có tài liệu nào trong danh mục này</p>
          <p className="text-[11px] max-w-sm mx-auto">
            Bấm <strong>"Tải lên tệp"</strong> hoặc <strong>"Tạo ghi chú"</strong> để bắt đầu lưu trữ và phân tích kiến thức với AI.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map((mat) => (
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
                  <div className="flex items-center gap-1.5">
                    {getStatusBadge(mat.processingStatus)}
                    <button
                      onClick={() => handleDeleteMaterial(mat.id)}
                      className="p-1 text-[#526356] hover:text-rose-400 transition-colors cursor-pointer"
                      title="Xóa tài liệu"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#86EFAC] mb-1">
                    <span className="px-2 py-0.5 rounded-md bg-[#101A13] border border-[rgba(34,197,94,0.2)]">
                      {mat.subjectName || 'Môn học'}
                    </span>
                    <span>•</span>
                    <span className="text-[#A9B8AE] font-mono">{formatFileSize(mat.sizeBytes)}</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#F3FAF5] line-clamp-2" title={mat.title}>
                    {mat.title}
                  </h3>
                </div>

                {mat.summary ? (
                  <div className="p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] text-xs text-[#A9B8AE] line-clamp-3 leading-relaxed">
                    {mat.summary}
                  </div>
                ) : mat.processingStatus === 'error' ? (
                  <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300 flex items-center justify-between gap-2">
                    <span className="line-clamp-2">{mat.errorMessage || 'Không thể trích xuất nội dung'}</span>
                    <button
                      onClick={() => handleReprocess(mat.id)}
                      className="px-2 py-1 rounded-lg bg-rose-900 text-white font-bold text-[10px] shrink-0 cursor-pointer"
                    >
                      Thử lại
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] text-xs text-[#526356] italic">
                    AI đang trích xuất nội dung và tạo tóm tắt...
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[rgba(34,197,94,0.15)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSummaryModal(mat)}
                    disabled={mat.processingStatus !== 'ready'}
                    className="text-xs font-bold text-[#86EFAC] hover:text-[#22C55E] disabled:opacity-40 disabled:hover:text-[#86EFAC] flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>Tóm tắt AI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadMaterial(mat)}
                    className="text-xs font-medium text-[#A9B8AE] hover:text-[#F3FAF5] flex items-center gap-0.5 p-1 rounded hover:bg-[#101A13] cursor-pointer"
                    title="Tải xuống nội dung tệp gốc"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => setQuizGenModalMaterial(mat)}
                  disabled={mat.processingStatus !== 'ready'}
                  className="flex items-center gap-1 text-xs font-bold text-[#F3FAF5] bg-[#101A13] hover:bg-[#142219] disabled:opacity-40 px-3 py-1.5 rounded-xl border border-[rgba(34,197,94,0.2)] cursor-pointer"
                >
                  <Play className="w-3 h-3 text-[#22C55E]" />
                  <span>Tạo đề</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload File Modal */}
      {modalMode === 'upload' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Upload className="w-4 h-4 text-[#22C55E]" />
                <span>Tải lên tài liệu học tập (PDF / Ảnh)</span>
              </div>
              <button onClick={() => setModalMode(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              {/* Drag & Drop Area */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-[#22C55E] bg-[#14532D]/30'
                    : 'border-[rgba(34,197,94,0.25)] hover:border-[#22C55E]/60 bg-[#101A13]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-1 text-[#86EFAC]">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-[#22C55E]" />
                    <p className="font-bold text-sm text-[#F3FAF5] truncate max-w-xs mx-auto">{selectedFile.name}</p>
                    <p className="text-[11px] text-[#A9B8AE] font-mono">{formatFileSize(selectedFile.size)}</p>
                    <p className="text-[10px] text-[#22C55E] underline">Bấm để chọn tệp khác</p>
                  </div>
                ) : (
                  <div className="space-y-2 text-[#A9B8AE]">
                    <Upload className="w-8 h-8 mx-auto text-[#22C55E] opacity-80" />
                    <p className="font-bold text-[#F3FAF5] text-xs">Kéo thả tệp PDF hoặc ảnh chụp bài giảng vào đây</p>
                    <p className="text-[11px]">Hỗ trợ PDF, PNG, JPG, WebP (Tối đa 25MB)</p>
                  </div>
                )}
              </div>

              {/* Title & Subject */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Tiêu đề tài liệu:</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Ví dụ: Đề cương ôn tập Toán Chương 1 - Hàm số"
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Môn học:</label>
                  <select
                    value={uploadSubjectId}
                    onChange={(e) => setUploadSubjectId(e.target.value)}
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5]"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress Bar */}
              {isUploading && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#86EFAC]">
                    <span>Đang tải lên & mã hóa tệp...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-[#101A13] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#22C55E] h-2 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
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

      {/* Create Note Modal */}
      {modalMode === 'note' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <FileCode className="w-4 h-4 text-[#22C55E]" />
                <span>Tạo ghi chú học tập mới</span>
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
                    placeholder="Ví dụ: Công thức tính nhanh thể tích khối chóp"
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Môn học:</label>
                  <select
                    value={noteSubjectId}
                    onChange={(e) => setNoteSubjectId(e.target.value)}
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
                  <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Nội dung ghi chú:</label>
                  <textarea
                    rows={6}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Nhập nội dung bài học, định nghĩa hoặc công thức bạn muốn ghi nhớ..."
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl p-3 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] resize-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  disabled={isSavingNote}
                  className="px-4 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingNote}
                  className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-40"
                >
                  {isSavingNote ? 'Đang lưu...' : 'Lưu ghi chú & Tóm tắt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Structured AI Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-2xl w-full shadow-2xl space-y-4 text-[#F3FAF5] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Sparkles className="w-5 h-5 text-[#22C55E]" />
                <span>Tóm Tắt Cấu Trúc AI: {showSummaryModal.title}</span>
              </div>
              <button onClick={() => setShowSummaryModal(null)} className="text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Overview */}
              <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-1.5">
                <h4 className="font-bold text-[#86EFAC] flex items-center gap-1.5 text-xs">
                  <BookOpen className="w-4 h-4 text-[#22C55E]" />
                  <span>Tổng quan nội dung</span>
                </h4>
                <p className="text-[#F3FAF5] leading-relaxed">
                  {showSummaryModal.summaryJson?.overview || showSummaryModal.summary}
                </p>
              </div>

              {/* Key Points */}
              {showSummaryModal.summaryJson?.keyPoints && showSummaryModal.summaryJson.keyPoints.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-2">
                  <h4 className="font-bold text-[#86EFAC] text-xs">Điểm cốt lõi trọng tâm:</h4>
                  <ul className="space-y-1.5 list-disc list-inside text-[#A9B8AE]">
                    {showSummaryModal.summaryJson.keyPoints.map((point, idx) => (
                      <li key={idx} className="leading-relaxed">
                        <span className="text-[#F3FAF5]">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Concepts */}
              {showSummaryModal.summaryJson?.concepts && showSummaryModal.summaryJson.concepts.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-2">
                  <h4 className="font-bold text-[#86EFAC] text-xs">Thuật ngữ & Khái niệm:</h4>
                  <div className="space-y-2">
                    {showSummaryModal.summaryJson.concepts.map((concept, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-[#050806] border border-[rgba(34,197,94,0.15)]">
                        <div className="font-bold text-[#22C55E] text-xs">{concept.name}</div>
                        <div className="text-[11px] text-[#A9B8AE] mt-0.5">{concept.definition}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulas */}
              {showSummaryModal.summaryJson?.formulas && showSummaryModal.summaryJson.formulas.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-2">
                  <h4 className="font-bold text-[#86EFAC] text-xs">Công thức & Quy tắc ghi nhớ:</h4>
                  <div className="flex flex-wrap gap-2">
                    {showSummaryModal.summaryJson.formulas.map((formula, idx) => (
                      <span key={idx} className="px-3 py-1.5 rounded-xl bg-[#050806] border border-[#22C55E]/30 text-[#86EFAC] font-mono text-xs">
                        {formula}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[rgba(34,197,94,0.15)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDownloadMaterial(showSummaryModal)}
                className="text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.2)] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Tải xuống tệp gốc</span>
              </button>

              <button
                onClick={() => {
                  setQuizGenModalMaterial(showSummaryModal);
                  setShowSummaryModal(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs shadow-md cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Tạo đề ôn tập từ tài liệu này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Generation Modal */}
      {quizGenModalMaterial && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Play className="w-4 h-4 text-[#22C55E]" />
                <span>Tạo đề luyện tập từ tài liệu</span>
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
                <select
                  value={quizCount}
                  onChange={(e) => setQuizCount(Number(e.target.value))}
                  className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5]"
                >
                  <option value={3}>3 câu hỏi ngắn (Khởi động)</option>
                  <option value={5}>5 câu hỏi trắc nghiệm (Tiêu chuẩn)</option>
                  <option value={10}>10 câu hỏi tổng hợp</option>
                  <option value={15}>15 câu hỏi chuyên sâu</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#A9B8AE] mb-1 font-bold">Mức độ độ khó:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'easy', label: 'Cơ bản' },
                    { id: 'medium', label: 'Vận dụng' },
                    { id: 'hard', label: 'Nâng cao' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setQuizDifficulty(d.id as any)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        quizDifficulty === d.id
                          ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                          : 'bg-[#101A13] text-[#A9B8AE] border border-[rgba(34,197,94,0.2)]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuizGenModalMaterial(null)}
                  disabled={isGeneratingQuiz}
                  className="px-4 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingQuiz}
                  className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                >
                  {isGeneratingQuiz && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isGeneratingQuiz ? 'Đang tạo đề...' : 'Bắt đầu luyện tập'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
