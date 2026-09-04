import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { RefreshCw, ServerOff } from 'lucide-react';

export const RequireAuth: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, bootstrapStatus, serverErrorDetails, retryAuthInit } = useAuth();
  const location = useLocation();

  if (bootstrapStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#050806] flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#16A34A] to-[#22C55E] flex items-center justify-center text-[#050806] font-black text-xl shadow-lg shadow-[#16A34A]/25 animate-bounce mb-4">
          J
        </div>
        <div className="text-[#F3FAF5] text-sm font-semibold tracking-wide">Đang xác thực bảo mật...</div>
        <div className="text-[#A9B8AE] text-xs mt-1">JAMI AI • Trợ lý học tập thông minh</div>
      </div>
    );
  }

  if (bootstrapStatus === 'unavailable') {
    return (
      <div className="min-h-screen bg-[#050806] text-[#F3FAF5] flex flex-col justify-center items-center p-6 font-sans">
        <div className="max-w-md w-full bg-[#0B120D] border border-rose-500/30 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <ServerOff className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-[#F3FAF5]">Máy chủ chưa sẵn sàng</h1>
            <p className="text-xs text-[#A9B8AE] leading-relaxed">
              {serverErrorDetails || 'Hệ thống máy chủ hiện không thể kết nối. Vui lòng thử lại sau ít phút.'}
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={retryAuthInit}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs rounded-xl shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử kết nối lại</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export const RequireAdmin: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, bootstrapStatus } = useAuth();
  const location = useLocation();

  if (bootstrapStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#050806] flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#16A34A] to-[#22C55E] flex items-center justify-center text-[#050806] font-black text-xl shadow-lg shadow-[#16A34A]/25 animate-bounce mb-4">
          J
        </div>
        <div className="text-[#F3FAF5] text-sm font-semibold tracking-wide">Đang kiểm tra quyền quản trị...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/today" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
