import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Compass, Sparkles } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#0B120D] border border-[rgba(34,197,94,0.25)] rounded-3xl p-8 shadow-2xl text-center space-y-6 jami-modal-animate">
        <div className="w-16 h-16 rounded-2xl bg-[#14532D]/60 border border-[#22C55E]/40 flex items-center justify-center mx-auto text-[#86EFAC] shadow-lg">
          <Compass className="w-8 h-8 text-[#22C55E]" />
        </div>

        <div className="space-y-2">
          <div className="text-4xl font-black text-[#22C55E] tracking-tight">404</div>
          <h1 className="text-lg font-black text-[#F3FAF5]">Không tìm thấy trang yêu cầu</h1>
          <p className="text-xs text-[#A9B8AE] leading-relaxed">
            Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi. Hãy quay lại trang học tập hôm nay cùng JAMI nhé!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            to="/today"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs rounded-xl shadow-lg transition-all jami-btn-glow"
          >
            <Sparkles className="w-4 h-4" />
            <span>Học Tập Hôm Nay</span>
          </Link>

          <Link
            to="/"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] font-bold text-xs rounded-xl transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Trang chủ</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
