import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, StudentProfile } from '../../../shared/types';
import { api, ApiError } from '../../lib/api-client';
import { LoginRequestSchema, RegisterRequestSchema } from '../../../shared/schemas';
import { z } from 'zod';
import { RefreshCw, ServerOff } from 'lucide-react';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable';

interface AuthContextType {
  user: User | null;
  profile: StudentProfile | null;
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemo: boolean;
  serverErrorDetails?: string;
  login: (data: z.infer<typeof LoginRequestSchema>) => Promise<void>;
  loginDemo: () => Promise<void>;
  register: (data: z.infer<typeof RegisterRequestSchema>) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryAuthInit: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [serverErrorDetails, setServerErrorDetails] = useState<string | undefined>(undefined);

  const initAuth = async () => {
    setAuthStatus('loading');
    setServerErrorDetails(undefined);
    try {
      const res = await api.getMe();
      setUser(res.user);
      setProfile(res.profile);
      setIsDemo(Boolean(res.isDemo));
      setAuthStatus('authenticated');
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setUser(null);
          setProfile(null);
          setIsDemo(false);
          setAuthStatus('unauthenticated');
          return;
        }
      }
      // 503, Network error, or server misconfiguration -> unavailable
      setUser(null);
      setProfile(null);
      setIsDemo(false);
      setAuthStatus('unavailable');
      setServerErrorDetails(err.message || 'Không thể kết nối dịch vụ xác thực.');
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = async (data: z.infer<typeof LoginRequestSchema>) => {
    setAuthStatus('loading');
    try {
      await api.login(data);
      // Verify session via /me after login
      const meRes = await api.getMe();
      setUser(meRes.user);
      setProfile(meRes.profile);
      setIsDemo(Boolean(meRes.isDemo));
      setAuthStatus('authenticated');
    } catch (err: any) {
      setAuthStatus('unauthenticated');
      throw err;
    }
  };

  const loginDemo = async () => {
    setAuthStatus('loading');
    try {
      await api.loginDemo();
      const meRes = await api.getMe();
      setUser(meRes.user);
      setProfile(meRes.profile);
      setIsDemo(true);
      setAuthStatus('authenticated');
    } catch (err: any) {
      setAuthStatus('unauthenticated');
      throw err;
    }
  };

  const register = async (data: z.infer<typeof RegisterRequestSchema>) => {
    setAuthStatus('loading');
    try {
      await api.register(data);
      const meRes = await api.getMe();
      setUser(meRes.user);
      setProfile(meRes.profile);
      setIsDemo(false);
      setAuthStatus('authenticated');
    } catch (err: any) {
      setAuthStatus('unauthenticated');
      throw err;
    }
  };

  const logout = async () => {
    setAuthStatus('loading');
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setProfile(null);
      setIsDemo(false);
      setAuthStatus('unauthenticated');
    }
  };

  const refreshProfile = async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
      setProfile(res.profile);
      setIsDemo(Boolean(res.isDemo));
    } catch {}
  };

  if (authStatus === 'unavailable') {
    return (
      <div className="min-h-screen bg-[#050806] text-[#F3FAF5] flex flex-col justify-center items-center p-6 font-sans">
        <div className="max-w-md w-full bg-[#0B120D] border border-rose-500/30 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <ServerOff className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-[#F3FAF5]">Máy chủ chưa sẵn sàng</h1>
            <p className="text-xs text-[#A9B8AE] leading-relaxed">
              {serverErrorDetails || 'Hệ thống backend hoặc cơ sở dữ liệu MySQL hiện không thể kết nối. Vui lòng thử lại sau.'}
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={initAuth}
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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authStatus,
        isAuthenticated: authStatus === 'authenticated' && Boolean(user),
        isLoading: authStatus === 'loading',
        isDemo,
        serverErrorDetails,
        login,
        loginDemo,
        register,
        logout,
        refreshProfile,
        retryAuthInit: initAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
