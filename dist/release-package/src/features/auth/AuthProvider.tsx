import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, StudentProfile } from '../../../shared/types';
import { api, ApiError } from '../../lib/api-client';
import { LoginRequestSchema, RegisterRequestSchema } from '../../../shared/schemas';
import { z } from 'zod';

export type BootstrapStatus = 'checking' | 'ready' | 'unavailable';
export type AuthStatus = 'authenticated' | 'unauthenticated';

interface AuthContextType {
  user: User | null;
  profile: StudentProfile | null;
  bootstrapStatus: BootstrapStatus;
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoSession: boolean;
  isDemo: boolean;
  demoLoginEnabled: boolean;
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
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [demoLoginEnabled, setDemoLoginEnabled] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>('checking');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unauthenticated');
  const [serverErrorDetails, setServerErrorDetails] = useState<string | undefined>(undefined);

  const initAuth = async () => {
    setBootstrapStatus('checking');
    setServerErrorDetails(undefined);
    try {
      const res = await api.getSession();
      setDemoLoginEnabled(Boolean(res.demoLoginEnabled));

      if (res.authenticated && res.user) {
        setUser(res.user);
        setProfile(res.profile || null);
        setIsDemoSession(Boolean(res.isDemo));
        setAuthStatus('authenticated');
      } else {
        setUser(null);
        setProfile(null);
        setIsDemoSession(false);
        setAuthStatus('unauthenticated');
      }
      setBootstrapStatus('ready');
    } catch (err: any) {
      setUser(null);
      setProfile(null);
      setIsDemoSession(false);
      setAuthStatus('unauthenticated');

      if (err instanceof ApiError) {
        if (err.status === 503 || err.code === 'DATABASE_UNAVAILABLE') {
          setBootstrapStatus('unavailable');
          setServerErrorDetails(err.message || 'Cơ sở dữ liệu đang bảo trì hoặc không khả dụng.');
          return;
        }
      }

      // Network or unhandled errors during boot -> default to ready & unauthenticated
      setBootstrapStatus('ready');
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = async (data: z.infer<typeof LoginRequestSchema>) => {
    const loginRes = await api.login(data);
    setUser(loginRes.user);
    setProfile(loginRes.profile);
    setIsDemoSession(Boolean(loginRes.isDemo));
    setAuthStatus('authenticated');
  };

  const loginDemo = async () => {
    const demoRes = await api.loginDemo();
    setUser(demoRes.user);
    setProfile(demoRes.profile);
    setIsDemoSession(true);
    setAuthStatus('authenticated');
  };

  const register = async (data: z.infer<typeof RegisterRequestSchema>) => {
    const regRes = await api.register(data);
    setUser(regRes.user);
    setProfile(regRes.profile);
    setIsDemoSession(false);
    setAuthStatus('authenticated');
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setProfile(null);
      setIsDemoSession(false);
      setAuthStatus('unauthenticated');
    }
  };

  const refreshProfile = async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
      setProfile(res.profile);
      setIsDemoSession(Boolean(res.isDemo));
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        bootstrapStatus,
        authStatus,
        isAuthenticated: authStatus === 'authenticated' && Boolean(user),
        isLoading: bootstrapStatus === 'checking',
        isDemoSession,
        isDemo: isDemoSession,
        demoLoginEnabled,
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
