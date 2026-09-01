import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  FolderArchive,
  Search,
  Check,
  FileText,
  Image as ImageIcon,
  BookOpen,
  Sparkles,
  Layers,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { LearningMaterial, Subject } from '../../../shared/types';
import { formatBytes } from '../../lib/utils';

export interface SelectedFileResult {
  source: 'upload' | 'material';
  file?: File;
  base64?: string;
  mimeType: string;
  fileName: string;
  materialId?: string;
  materialTitle?: string;
  savedToMaterials?: boolean;
  material?: LearningMaterial;
}

interface MaterialFilePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  accept?: string;
  defaultTab?: 'material' | 'upload';
  defaultSubjectId?: string;
  onFileSelected: (result: SelectedFileResult) => Promise<void> | void;
}

export const MaterialFilePickerModal: React.FC<MaterialFilePickerModalProps> = ({
  isOpen,
  onClose,
  title = 'Chọn hoặc Tải lên Tài liệu',
  description = 'Chọn tài liệu có sẵn trong Kho hoặc tải file mới từ thiết bị',
  accept = 'image/*,application/pdf,.doc,.docx,.txt',
  defaultTab = 'upload',
  defaultSubjectId,
  onFileSelected,
}) => {
  const [activeTab, setActiveTab] = useState<'material' | 'upload'>(defaultTab);

  // Existing Materials Tab State
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [selectedMaterial, setSelectedMaterial] = useState<LearningMaterial | null>(null);

  // Upload New File Tab State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [customTitle, setCustomTitle] = useState('');
  const [uploadSubjectId, setUploadSubjectId] = useState(defaultSubjectId || '');

  // Submitting state
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load materials & subjects when modal opens (without uploadSubjectId in deps)
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsLoadingMaterials(true);
      Promise.all([
        api.getMaterials().catch(() => ({ materials: [] })),
        api.getSubjects().catch(() => ({ subjects: [] })),
      ])
        .then(([matRes, subjRes]) => {
          setMaterials(matRes.materials || []);
          setSubjects(subjRes.subjects || []);
          setUploadSubjectId((prev) => prev || defaultSubjectId || subjRes.subjects?.[0]?.id || '');
        })
        .finally(() => {
          setIsLoadingMaterials(false);
        });
    } else {
      // Reset state and revoke object URL when closed
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedFile(null);
      setPreviewUrl(null);
      setBase64Data(null);
      setErrorMessage(null);
      setIsProcessing(false);
      setSelectedMaterial(null);
    }
  }, [isOpen, defaultSubjectId]);

  // Clean up object URL when component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!isOpen) return null;

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.txt'];

  const handleFileChange = (file: File) => {
    setErrorMessage(null);

    // Validate size limit (25MB)
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(`Dung lượng tệp (${formatBytes(file.size)}) vượt quá giới hạn tối đa 25MB.`);
      return;
    }

    // Validate file extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
    const isAllowedMime =
      file.type.startsWith('image/') ||
      file.type === 'application/pdf' ||
      file.type.includes('word') ||
      file.type.includes('document') ||
      file.type === 'text/plain';

    if (!isAllowedExt && !isAllowedMime) {
      setErrorMessage('Định dạng tệp không được hỗ trợ. Vui lòng chọn tệp PDF, ảnh (PNG, JPG, WEBP), Word hoặc TXT.');
      return;
    }

    // Revoke previous preview URL
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    if (!customTitle) setCustomTitle(cleanName);

    // Use URL.createObjectURL for fast image previews without bloating memory
    if (file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleConfirmSelect = async () => {
    setErrorMessage(null);
    setIsProcessing(true);

    try {
      if (activeTab === 'material') {
        if (!selectedMaterial) {
          setErrorMessage('Vui lòng chọn một tài liệu từ danh sách.');
          setIsProcessing(false);
          return;
        }

        await onFileSelected({
          source: 'material',
          mimeType: selectedMaterial.mimeType || 'application/pdf',
          fileName: selectedMaterial.fileName || selectedMaterial.title,
          materialId: selectedMaterial.id,
          materialTitle: selectedMaterial.title,
          material: selectedMaterial,
        });
        onClose();
      } else {
        if (!selectedFile) {
          setErrorMessage('Vui lòng chọn hoặc kéo thả tệp từ máy tính.');
          setIsProcessing(false);
          return;
        }

        let createdMaterial: LearningMaterial | undefined = undefined;

        // If user chose to save to library
        if (saveToLibrary) {
          const mimeType = selectedFile.type || 'application/octet-stream';
          const title = customTitle.trim() || selectedFile.name.replace(/\.[^/.]+$/, '');
          const subjId = uploadSubjectId || (subjects[0]?.id || 'subj_toan');

          const intent = await api.createMaterialUploadIntent({
            title,
            subjectId: subjId,
            fileName: selectedFile.name,
            mimeType,
            sizeBytes: selectedFile.size,
          });

          await api.uploadMaterialDirect(intent.r2ObjectKey, selectedFile, mimeType);
          const finalized = await api.finalizeMaterialUpload(intent.material.id, {
            sizeBytes: selectedFile.size,
          });
          createdMaterial = finalized.material || intent.material;
        }

        await onFileSelected({
          source: 'upload',
          file: selectedFile,
          base64: base64Data || undefined,
          mimeType: selectedFile.type || 'application/octet-stream',
          fileName: selectedFile.name,
          materialTitle: customTitle.trim() || selectedFile.name,
          savedToMaterials: saveToLibrary,
          material: createdMaterial,
          materialId: createdMaterial?.id,
        });
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Xảy ra lỗi khi xử lý tệp.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
      (m.fileName && m.fileName.toLowerCase().includes(materialSearchQuery.toLowerCase()));
    const matchesSubject = selectedSubjectFilter === 'all' || m.subjectId === selectedSubjectFilter;
    return matchesSearch && matchesSubject;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl max-w-2xl w-full shadow-2xl space-y-4 text-[#F3FAF5] my-auto max-h-[90vh] flex flex-col jami-modal-animate">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(34,197,94,0.18)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] shadow-md">
              <FolderArchive className="w-4 h-4 text-[#86EFAC]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#F3FAF5]">{title}</h3>
              <p className="text-[11px] text-[#A9B8AE]">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A9B8AE] hover:text-white bg-[#101A13] border border-[rgba(34,197,94,0.15)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-5 pt-1 shrink-0">
          <div className="grid grid-cols-2 p-1 bg-[#050806] rounded-xl border border-[rgba(34,197,94,0.2)] text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-[#16A34A] text-[#050806] shadow-sm font-extrabold'
                  : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Tải file mới từ máy</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('material')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === 'material'
                  ? 'bg-[#16A34A] text-[#050806] shadow-sm font-extrabold'
                  : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>Chọn từ Kho tài liệu ({materials.length})</span>
            </button>
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mx-5 p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="px-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: UPLOAD NEW FILE */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              {/* Dropzone with keyboard accessibility */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Kéo thả hoặc bấm để chọn tệp từ thiết bị"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileChange(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-[rgba(34,197,94,0.35)] hover:border-[#22C55E] focus:border-[#22C55E] focus:outline-none bg-[#050806] p-6 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-[#101A13]/40 group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={accept}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                />

                {selectedFile ? (
                  <div className="space-y-2.5 w-full flex flex-col items-center">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-36 rounded-xl object-contain border border-[rgba(34,197,94,0.25)] shadow-md"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] flex items-center justify-center text-[#22C55E]">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}
                    <div className="text-xs font-bold text-[#86EFAC] flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-[#22C55E]" />
                      <span>{selectedFile.name} ({formatBytes(selectedFile.size)})</span>
                    </div>
                    <span className="text-[11px] text-[#A9B8AE] underline group-hover:text-white">
                      Bấm để đổi tệp khác
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                      <Upload className="w-5 h-5 text-[#22C55E]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#F3FAF5]">
                        Kéo thả hoặc bấm để chọn tệp từ thiết bị
                      </div>
                      <div className="text-[11px] text-[#A9B8AE] mt-0.5">
                        Hỗ trợ hình ảnh (PNG, JPG, WEBP), PDF, Word, TXT
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Save to Materials Checkbox & Details */}
              <div className="bg-[#050806] p-4 rounded-2xl border border-[rgba(34,197,94,0.2)] space-y-3">
                <label className="flex items-center gap-2.5 text-xs text-[#F3FAF5] font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveToLibrary}
                    onChange={(e) => setSaveToLibrary(e.target.checked)}
                    className="w-4 h-4 rounded text-[#16A34A] focus:ring-[#22C55E] bg-[#101A13] border-[rgba(34,197,94,0.3)] cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    <FolderArchive className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>Đồng thời lưu tệp này vào Kho tài liệu</span>
                  </span>
                </label>

                {saveToLibrary && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 pl-6">
                    <div>
                      <label className="block text-[11px] font-bold text-[#A9B8AE] mb-1">Tên lưu trong kho:</label>
                      <input
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="Tên tài liệu"
                        className="w-full p-2 bg-[#101A13] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#A9B8AE] mb-1">Môn học:</label>
                      <select
                        value={uploadSubjectId}
                        onChange={(e) => setUploadSubjectId(e.target.value)}
                        className="w-full p-2 bg-[#101A13] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                      >
                        {subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SELECT FROM EXISTING MATERIALS */}
          {activeTab === 'material' && (
            <div className="space-y-3">
              {/* Search & Subject Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2 relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#A9B8AE]" />
                  <input
                    type="text"
                    value={materialSearchQuery}
                    onChange={(e) => setMaterialSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên tài liệu..."
                    className="w-full pl-9 pr-3 py-2 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                  />
                </div>
                <div>
                  <select
                    value={selectedSubjectFilter}
                    onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                    className="w-full p-2 bg-[#050806] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="all">Tất cả môn</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Material List */}
              <div className="max-h-60 overflow-y-auto space-y-1.5 border border-[rgba(34,197,94,0.18)] bg-[#050806] p-2 rounded-2xl">
                {isLoadingMaterials ? (
                  <div className="py-8 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#22C55E]" />
                    <span>Đang tải danh sách tài liệu...</span>
                  </div>
                ) : filteredMaterials.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#A9B8AE]">
                    {materials.length === 0
                      ? 'Kho tài liệu hiện đang trống. Hãy chuyển sang tab "Tải file mới" để tải lên tài liệu đầu tiên.'
                      : 'Không tìm thấy tài liệu phù hợp với từ khóa.'}
                  </div>
                ) : (
                  filteredMaterials.map((m) => {
                    const isSelected = selectedMaterial?.id === m.id;
                    const subjectName = subjects.find((s) => s.id === m.subjectId)?.name || 'Chung';
                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMaterial(m)}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#14532D]/70 border-[#22C55E] text-[#F3FAF5] shadow-sm'
                            : 'bg-[#101A13] border-[rgba(34,197,94,0.15)] text-[#A9B8AE] hover:text-[#F3FAF5] hover:border-[rgba(34,197,94,0.3)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-[#22C55E] text-[#050806]' : 'bg-[#050806] text-[#22C55E]'}`}>
                            {m.type === 'notes' ? (
                              <FileText className="w-4 h-4" />
                            ) : m.mimeType?.startsWith('image/') ? (
                              <ImageIcon className="w-4 h-4" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#F3FAF5] truncate">{m.title}</div>
                            <div className="text-[10px] text-[#A9B8AE] flex items-center gap-2 mt-0.5">
                              <span className="px-1.5 py-0.2 bg-[#050806] rounded border border-[rgba(34,197,94,0.2)] text-[#86EFAC]">
                                {subjectName}
                              </span>
                              {m.sizeBytes && <span>{formatBytes(m.sizeBytes)}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full bg-[#22C55E] text-[#050806] flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-[rgba(34,197,94,0.3)]" />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[rgba(34,197,94,0.18)] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
          >
            Hủy
          </button>

          <button
            type="button"
            disabled={isProcessing || (activeTab === 'upload' ? !selectedFile : !selectedMaterial)}
            onClick={handleConfirmSelect}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-[#16A34A]/25 cursor-pointer disabled:opacity-40 transition-all"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>
                  {activeTab === 'upload'
                    ? saveToLibrary
                      ? 'Lưu Vào Kho & Chọn Tệp'
                      : 'Chọn Tệp Này'
                    : 'Xác Nhận Chọn Tài Liệu'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
