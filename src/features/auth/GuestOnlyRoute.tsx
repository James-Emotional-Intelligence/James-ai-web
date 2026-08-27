import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const GuestOnlyRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, bootstrapStatus } = useAuth();

  if (bootstrapStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#050806] flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#16A34A] to-[#22C55E] flex items-center justify-center text-[#050806] font-black text-xl shadow-lg shadow-[#16A34A]/25 animate-pulse mb-4">
          J
        </div>
        <div className="text-[#F3FAF5] text-sm font-semibold tracking-wide">Đang tải JAMI AI...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/today" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
