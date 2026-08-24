import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, User, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api-client';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState<'student' | 'parent'>('student');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      navigate('/today');
    }, 600);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-8 space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-400 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-lg shadow-cyan-500/25">
            J
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">JAMI AI</h1>
          <p className="text-xs text-slate-500">
            Trợ lý AI lập kế hoạch & đồng hành học tập cá nhân hóa
          </p>
        </div>

        {/* Role Selector */}
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setRole('student')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              role === 'student' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            Học sinh (Lớp 6 - 12)
          </button>
          <button
            type="button"
            onClick={() => setRole('parent')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              role === 'parent' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            Phụ huynh đồng hành
          </button>
        </div>

        {/* Demo Fast Access Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tài khoản học sinh:</label>
            <input
              type="text"
              readOnly
              value={role === 'student' ? 'minh.hocsinh@jami.edu.vn (Nguyễn Quang Minh)' : 'phuhuynh.minh@jami.edu.vn'}
              className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu:</label>
            <input
              type="password"
              readOnly
              value="••••••••••••"
              className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-semibold"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95"
          >
            <span>{isLoading ? 'Đang đăng nhập...' : 'Vào ngay (Tài khoản mẫu Minh - Lớp 9)'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Môi trường Demo an toàn cho học sinh</span>
          </div>
        </div>
      </div>
    </div>
  );
};
