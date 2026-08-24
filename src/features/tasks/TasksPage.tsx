import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { StudyTask } from '../../../shared/types';

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  useEffect(() => {
    api
      .getTasks()
      .then((res) => setTasks(res.tasks))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return t.status !== 'completed';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0B120D] p-6 sm:p-8 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14532D] text-xs font-bold text-[#86EFAC] border border-[#22C55E]/30 mb-2">
            <CheckSquare className="w-3.5 h-3.5 text-[#22C55E]" />
            <span>Module 2: Chi Tiết Công Việc</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F3FAF5]">
            Danh Sách Nhiệm Vụ Học Tập Chi Tiết
          </h1>
          <p className="text-xs sm:text-sm text-[#A9B8AE] mt-1">
            Mỗi nhiệm vụ được Jami AI phân tích và chia nhỏ thành từng bước cụ thể.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/focus')}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-extrabold text-xs sm:text-sm shadow-lg shadow-[#16A34A]/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-[#050806]" />
            <span>Chế độ Tập trung</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-[#0B120D] p-1.5 rounded-2xl border border-[rgba(34,197,94,0.2)]">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            Tất cả ({tasks.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === 'pending'
                ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            Đang chờ ({tasks.filter((t) => t.status !== 'completed').length})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === 'completed'
                ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
            }`}
          >
            Đã xong ({tasks.filter((t) => t.status === 'completed').length})
          </button>
        </div>
      </div>

      {/* Task Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-[#A9B8AE]">Đang tải danh sách nhiệm vụ...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="p-12 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE]">
          Không có nhiệm vụ nào trong mục này.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/tasks/${t.id}`)}
              className="bg-[#0B120D] hover:bg-[#101A13] border border-[rgba(34,197,94,0.22)] hover:border-[#22C55E]/60 rounded-3xl p-6 shadow-xl transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                    {t.subjectName || 'Toán học'}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-bold text-[#86EFAC] bg-[#101A13] px-2.5 py-1 rounded-full border border-[rgba(34,197,94,0.2)]">
                    <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>{t.estimatedMinutes}p</span>
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-[#F3FAF5] group-hover:text-[#86EFAC] transition-colors">
                    {t.title}
                  </h3>
                  <p className="text-xs text-[#A9B8AE] mt-1 line-clamp-2 leading-relaxed">
                    {t.objective}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[rgba(34,197,94,0.15)] flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#86EFAC]">
                  {t.status === 'completed' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                      <span>Đã hoàn thành</span>
                    </>
                  ) : (
                    <>
                      <ListTodo className="w-4 h-4 text-[#22C55E]" />
                      <span>Xem hướng dẫn từng bước</span>
                    </>
                  )}
                </div>

                <ArrowRight className="w-4 h-4 text-[#A9B8AE] group-hover:text-[#22C55E] group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
