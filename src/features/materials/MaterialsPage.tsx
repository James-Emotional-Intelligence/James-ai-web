import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { LearningMaterial } from '../../../shared/types';
import confetti from 'canvas-confetti';

export const MaterialsPage: React.FC = () => {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState<LearningMaterial | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState<string | null>(null);

  // Form states for adding material
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('Toán học');
  const [materialType, setMaterialType] = useState<'pdf' | 'image' | 'notes'>('pdf');
  const [contentText, setContentText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchMaterials = async () => {
    try {
      const res = await api.getMaterials();
      setMaterials(res.materials);
    } catch {}
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const filteredMaterials =
    selectedFilter === 'all'
      ? materials
      : materials.filter((m) =>
          (m.subjectName || '').toLowerCase().includes(selectedFilter.toLowerCase())
        );

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const res = await api.addMaterial({
        title: title.trim(),
        type: materialType,
        summary: contentText.trim() || 'Tài liệu tóm tắt công thức và phương pháp ôn tập.',
        subjectName,
      });
      setMaterials([res.material, ...materials]);
      setTitle('');
      setContentText('');
      setIsAddModalOpen(false);
      confetti({ particleCount: 70, spread: 50 });
    } catch (err: any) {
      alert(err.message || 'Không thể thêm tài liệu.');
    } finally {
      setIsSaving(false);
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

  const handleGenerateQuizFromMaterial = async (matId: string) => {
    setIsGeneratingQuiz(matId);
    try {
      await api.getQuizzes();
      confetti({ particleCount: 80, spread: 60 });
      setShowSummaryModal(null);
      navigate('/exams');
    } catch (err: any) {
      alert(err.message || 'Không thể tạo đề luyện tập.');
    } finally {
      setIsGeneratingQuiz(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-[#F3FAF5] flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-[#22C55E]" />
            <span>Kho Tài Liệu & Đề Cương Ôn Tập</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-0.5">
            Lưu trữ tài liệu học tập, ảnh chụp bảng và hỗ trợ tóm tắt kiến thức trọng tâm
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] text-xs font-black shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Thêm tài liệu mới</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: 'Tất cả môn' },
          { id: 'toán', label: 'Toán học' },
          { id: 'tiếng anh', label: 'Tiếng Anh' },
          { id: 'ngữ văn', label: 'Ngữ văn' },
          { id: 'vật lý', label: 'Vật lý' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setSelectedFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedFilter === f.id
                ? 'bg-[#16A34A] text-[#050806] shadow-sm shadow-[#16A34A]/25'
                : 'bg-[#0B120D] text-[#A9B8AE] border border-[rgba(34,197,94,0.18)] hover:bg-[#101A13]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Materials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMaterials.map((mat) => (
          <div
            key={mat.id}
            className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50 shadow-xl transition-all space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-2xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center shrink-0 border border-[#22C55E]/30">
                  {mat.type === 'image' ? <FileImage className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-[#101A13] text-[#86EFAC] border border-[rgba(34,197,94,0.2)]">
                    {mat.subjectName || 'Tài liệu'}
                  </span>
                  <button
                    onClick={() => handleDeleteMaterial(mat.id)}
                    className="p-1 text-[#A9B8AE] hover:text-rose-400 cursor-pointer"
                    title="Xóa tài liệu"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#F3FAF5] line-clamp-2">{mat.title}</h3>
                <div className="text-[11px] text-[#A9B8AE] mt-1">
                  {(mat.sizeBytes ? (mat.sizeBytes / 1024 / 1024).toFixed(1) + ' MB' : '2.4 MB')} • {new Date(mat.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] text-xs text-[#A9B8AE] line-clamp-2">
                {mat.summary}
              </div>
            </div>

            <div className="pt-3 border-t border-[rgba(34,197,94,0.15)] flex items-center justify-between gap-2">
              <button
                onClick={() => setShowSummaryModal(mat)}
                className="text-xs font-bold text-[#86EFAC] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Xem tóm tắt AI</span>
              </button>

              <button
                onClick={() => handleGenerateQuizFromMaterial(mat.id)}
                disabled={isGeneratingQuiz === mat.id}
                className="flex items-center gap-1 text-xs font-bold text-[#F3FAF5] bg-[#101A13] hover:bg-[#142219] px-3 py-1.5 rounded-xl border border-[rgba(34,197,94,0.2)] cursor-pointer"
              >
                <Play className="w-3 h-3 text-[#22C55E]" />
                <span>Ôn đề</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Material Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Plus className="w-4 h-4 text-[#22C55E]" />
                <span>Thêm tài liệu học tập mới</span>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Tên tài liệu / đề cương:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Đề cương ôn tập Văn 9 - Học kỳ 1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs p-3 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Môn học:</label>
                  <select
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  >
                    <option value="Toán học">Toán học</option>
                    <option value="Tiếng Anh">Tiếng Anh</option>
                    <option value="Ngữ văn">Ngữ văn</option>
                    <option value="Vật lý">Vật lý</option>
                    <option value="Hóa học">Hóa học</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Loại định dạng:</label>
                  <select
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value as any)}
                    className="w-full text-xs p-2.5 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                  >
                    <option value="pdf">Tài liệu PDF</option>
                    <option value="image">Ảnh chụp bài học</option>
                    <option value="notes">Ghi chú văn bản</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#F3FAF5] mb-1">Tóm tắt / Nội dung chính:</label>
                <textarea
                  rows={3}
                  placeholder="Nhập nội dung tóm tắt kiến thức trọng tâm..."
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  className="w-full text-xs p-3 border border-[rgba(34,197,94,0.25)] bg-[#050806] text-[#F3FAF5] rounded-xl focus:border-[#22C55E] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-bold rounded-xl shadow cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu tài liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-4 text-[#F3FAF5]">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold text-sm">
                <Sparkles className="w-4 h-4 text-[#22C55E]" />
                <span>Tóm Tắt Kiến Thức Trọng Tâm</span>
              </div>
              <button
                onClick={() => setShowSummaryModal(null)}
                className="text-xs text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-[#F3FAF5]">{showSummaryModal.title}</h3>
              <div className="text-xs text-[#86EFAC] font-semibold mt-0.5">{showSummaryModal.subjectName}</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] leading-relaxed space-y-2">
              <div className="font-bold text-[#F3FAF5]">Nội dung cốt lõi:</div>
              <p>{showSummaryModal.summary}</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSummaryModal(null)}
                className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
              >
                Đóng
              </button>
              <button
                onClick={() => handleGenerateQuizFromMaterial(showSummaryModal.id)}
                className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow cursor-pointer"
              >
                Tạo đề ôn tập từ tài liệu này
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
