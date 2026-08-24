import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const RequireAuth: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-400 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-cyan-500/25 animate-bounce mb-4">
          J
        </div>
        <div className="text-white text-sm font-semibold tracking-wide">Đang xác thực bảo mật...</div>
        <div className="text-slate-400 text-xs mt-1">JAMI AI • Trợ lý học tập thông minh</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
