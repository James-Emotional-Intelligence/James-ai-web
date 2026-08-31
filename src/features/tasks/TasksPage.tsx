import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Clock,
  Play,
  CheckCircle2,
  ListTodo,
  Plus,
  ArrowRight,
  Filter,
  Search,
  Trash2,
  Edit2,
  Calendar,
  AlertCircle,
  X,
  RefreshCw,
  Download,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { StudyTask, Subject } from '../../../shared/types';
import confetti from 'canvas-confetti';

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formObjective, setFormObjective] = useState('');
  const [formEstimatedMinutes, setFormEstimatedMinutes] = useState(45);
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formDifficulty, setFormDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [formDueAt, setFormDueAt] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchTasksAndSubjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, subjectsRes] = await Promise.all([
        api.getTasks(),
        api.getSubjects(),
      ]);
      setTasks(tasksRes.tasks || []);
      setSubjects(subjectsRes.subjects || []);
      if (subjectsRes.subjects && subjectsRes.subjects.length > 0 && !formSubjectId) {
        setFormSubjectId(subjectsRes.subjects[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách nhiệm vụ.');
    } finally {
      setLoading(false);
    }
  }, [formSubjectId]);

  useEffect(() => {
    fetchTasksAndSubjects();
  }, [fetchTasksAndSubjects]);

  const openCreateModal = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormObjective('');
    setFormEstimatedMinutes(45);
    setFormPriority('medium');
    setFormDifficulty('medium');
    setFormDueAt('');
    if (subjects.length > 0) setFormSubjectId(subjects[0].id);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (t: StudyTask, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTask(t);
    setFormTitle(t.title);
    setFormObjective(t.objective || '');
    setFormEstimatedMinutes(t.estimatedMinutes);
    setFormPriority(t.priority);
    setFormDifficulty(t.difficulty);
    setFormDueAt(t.dueAt ? t.dueAt.substring(0, 16) : '');
    setFormSubjectId(t.subjectId);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError('Vui lòng nhập tiêu đề nhiệm vụ.');
      return;
    }
    if (!formSubjectId) {
      setFormError('Vui lòng chọn môn học.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    const payload = {
      title: formTitle.trim(),
      subjectId: formSubjectId,
      objective: formObjective.trim() || undefined,
      estimatedMinutes: formEstimatedMinutes,
      priority: formPriority,
      difficulty: formDifficulty,
      dueAt: formDueAt ? new Date(formDueAt).toISOString() : undefined,
    };

    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, payload);
      } else {
        await api.createTask(payload);
        confetti({ particleCount: 50, spread: 40 });
      }
      setIsModalOpen(false);
      await fetchTasksAndSubjects();
    } catch (err: any) {
      setFormError(err.message || 'Không thể lưu nhiệm vụ. Vui lòng kiểm tra lại.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmDelete = window.confirm('Bạn có chắc chắn muốn xóa nhiệm vụ học tập này không?');
    if (!confirmDelete) return;

    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      alert(err.message || 'Không thể xóa nhiệm vụ.');
    }
  };

  const handleCompleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.completeTask(taskId);
      confetti({ particleCount: 60, spread: 50 });
      await fetchTasksAndSubjects();
    } catch (err: any) {
      alert(err.message || 'Không thể đánh dấu hoàn tất.');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === 'pending' && t.status === 'completed') return false;
    if (filterStatus === 'completed' && t.status !== 'completed') return false;
    if (filterSubject !== 'all' && t.subjectId !== filterSubject) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.objective && t.objective.toLowerCase().includes(q)) ||
        (t.subjectName && t.subjectName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const [isExporting, setIsExporting] = useState(false);
  const handleDownloadTasksCsv = async () => {
    setIsExporting(true);
    try {
      await api.downloadTasksCsv();
    } catch (err: any) {
      alert(err.message || 'Không thể xuất danh sách nhiệm vụ.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0B120D] p-6 sm:p-8 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14532D] text-xs font-bold text-[#86EFAC] border border-[#22C55E]/30 mb-2">
            <CheckSquare className="w-3.5 h-3.5 text-[#22C55E]" />
            <span>Nhiệm Vụ Học Tập</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F3FAF5]">
            Quản Lý & Phân Tích Công Việc
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadTasksCsv}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.25)] font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50"
            title="Xuất danh sách nhiệm vụ ra file CSV"
          >
            <Download className={`w-4 h-4 text-[#22C55E] ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Đang xuất...' : 'Xuất CSV'}</span>
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-extrabold text-xs sm:text-sm shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Thêm nhiệm vụ mới</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0B120D] p-4 rounded-3xl border border-[rgba(34,197,94,0.2)] flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterStatus === 'all'
                ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            Tất cả ({tasks.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterStatus === 'pending'
                ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            Đang chờ ({tasks.filter((t) => t.status !== 'completed').length})
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterStatus === 'completed'
                ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            Đã xong ({tasks.filter((t) => t.status === 'completed').length})
          </button>
        </div>

        {/* Subject Filter & Search Input */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5]"
          >
            <option value="all">Tất cả môn học</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 text-[#A9B8AE] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm bài tập..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] placeholder-[#A9B8AE]/50 focus:outline-none focus:border-[#22C55E]"
            />
          </div>
        </div>
      </div>

      {/* Task Cards Grid */}
      {loading ? (
        <div className="h-44 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.2)] animate-pulse flex items-center justify-center text-xs text-[#A9B8AE]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#22C55E] mr-2" />
          <span>Đang tải danh sách nhiệm vụ...</span>
        </div>
      ) : error ? (
        <div className="p-8 bg-[#0B120D] border border-rose-900/60 rounded-3xl text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <h2 className="text-sm font-bold text-[#F3FAF5]">{error}</h2>
          <button
            onClick={fetchTasksAndSubjects}
            className="px-4 py-2 rounded-xl bg-[#14532D] text-[#86EFAC] text-xs font-bold hover:bg-[#16A34A] hover:text-[#050806]"
          >
            Thử lại
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-12 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] space-y-2">
          <ListTodo className="w-8 h-8 text-[#22C55E] opacity-40 mx-auto" />
          <p className="font-bold text-[#F3FAF5]">Không có nhiệm vụ nào phù hợp với bộ lọc.</p>
          <p>Em có thể bấm "Thêm nhiệm vụ mới" để tạo bài tập cần làm nhé.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((t) => {
            const isDone = t.status === 'completed';

            return (
              <div
                key={t.id}
                onClick={() => navigate(`/tasks/${t.id}`)}
                className={`bg-[#0B120D] hover:bg-[#101A13] border rounded-3xl p-6 shadow-xl transition-all cursor-pointer flex flex-col justify-between group ${
                  isDone
                    ? 'border-[rgba(34,197,94,0.12)] opacity-80'
                    : 'border-[rgba(34,197,94,0.25)] hover:border-[#22C55E]/60'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                      {t.subjectName || 'Môn học'}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-[#86EFAC] bg-[#101A13] px-2.5 py-1 rounded-full border border-[rgba(34,197,94,0.2)]">
                      <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span>{t.estimatedMinutes}p</span>
                    </span>
                  </div>

                  <div>
                    <h3
                      className={`text-base font-bold transition-colors line-clamp-1 ${
                        isDone ? 'line-through text-[#A9B8AE]' : 'text-[#F3FAF5] group-hover:text-[#86EFAC]'
                      }`}
                    >
                      {t.title}
                    </h3>
                    <p className="text-xs text-[#A9B8AE] mt-1 line-clamp-2 leading-relaxed">
                      {t.objective || 'Chưa có ghi chú mục tiêu.'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[rgba(34,197,94,0.15)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#86EFAC]">
                    {isDone ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                        <span>Đã hoàn thành</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span>Tiến độ: {t.completionPercent}%</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => openEditModal(t, e)}
                      className="p-1.5 rounded-lg bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[#A9B8AE] hover:text-[#F3FAF5] transition-colors"
                      title="Sửa nhiệm vụ"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteTask(t.id, e)}
                      className="p-1.5 rounded-lg bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-rose-400 hover:bg-rose-950 transition-colors"
                      title="Xóa nhiệm vụ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {!isDone && (
                      <button
                        onClick={(e) => handleCompleteTask(t.id, e)}
                        className="p-1.5 rounded-lg bg-[#14532D] text-[#86EFAC] hover:bg-[#16A34A] hover:text-[#050806] transition-colors"
                        title="Đánh dấu hoàn thành"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden text-[#F3FAF5]">
            <div className="px-6 py-4 border-b border-[rgba(34,197,94,0.18)] flex items-center justify-between bg-[#101A13]">
              <h2 className="text-sm font-bold text-[#F3FAF5]">
                {editingTask ? 'Chỉnh sửa nhiệm vụ' : 'Thêm nhiệm vụ học tập mới'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-[#A9B8AE] hover:text-[#F3FAF5] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-2xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-[#A9B8AE]">Tiêu đề bài học / nhiệm vụ *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ví dụ: Ôn tập Hình học chương 3, Giải bài tập 1-5"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-[#A9B8AE]">Môn học *</label>
                  <select
                    value={formSubjectId}
                    onChange={(e) => setFormSubjectId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5]"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-[#A9B8AE]">Thời lượng ước tính (phút)</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={formEstimatedMinutes}
                    onChange={(e) => setFormEstimatedMinutes(parseInt(e.target.value, 10) || 45)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-[#A9B8AE]">Mức độ ưu tiên</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="high">Cao</option>
                    <option value="medium">Trung bình</option>
                    <option value="low">Thấp</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-[#A9B8AE]">Độ khó</label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer [&>option]:bg-[#101A13] [&>option]:text-[#F3FAF5]"
                  >
                    <option value="easy">Dễ</option>
                    <option value="medium">Vừa sức</option>
                    <option value="hard">Nâng cao</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-[#A9B8AE]">Mục tiêu bài học (tùy chọn)</label>
                <textarea
                  value={formObjective}
                  onChange={(e) => setFormObjective(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú mục tiêu cần đạt được sau khi làm xong..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-[#A9B8AE]">Hạn hoàn thành (tùy chọn)</label>
                <input
                  type="datetime-local"
                  value={formDueAt}
                  onChange={(e) => setFormDueAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
              </div>

              <div className="pt-3 border-t border-[rgba(34,197,94,0.18)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#101A13] text-[#A9B8AE] hover:text-[#F3FAF5] font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {formSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{editingTask ? 'Lưu thay đổi' : 'Tạo nhiệm vụ'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
