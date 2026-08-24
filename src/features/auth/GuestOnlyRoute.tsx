import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const GuestOnlyRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-400 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-cyan-500/25 animate-pulse mb-4">
          J
        </div>
        <div className="text-white text-sm font-semibold tracking-wide">Đang tải JAMI AI...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/today" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
