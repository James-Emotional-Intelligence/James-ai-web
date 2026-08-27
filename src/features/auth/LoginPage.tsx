import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LoginRequestSchema } from '../../../shared/schemas';
import { useAuth } from './AuthProvider';
import { RobotJami } from '../../components/jami/RobotJami';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import { ApiError } from '../../lib/api-client';

type LoginFormData = z.infer<typeof LoginRequestSchema>;

export function getSafeReturnUrl(rawPath: string | undefined, defaultPath = '/today'): string {
  if (!rawPath || typeof rawPath !== 'string') return defaultPath;
  const trimmed = rawPath.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('://') &&
    !trimmed.toLowerCase().startsWith('/javascript:')
  ) {
    return trimmed;
  }
  return defaultPath;
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginDemo, demoLoginEnabled } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginRequestSchema) as any,
    defaultValues: {
      email: '',
      password: '',
      rememberMe: true,
    },
  });

  // Pre-fill email if passed from SignupPage state (e.g. on 409 conflict)
  React.useEffect(() => {
    const prefill = (location.state as any)?.prefillEmail;
    if (prefill && typeof prefill === 'string') {
      setValue('email', prefill);
    }
  }, [location.state, setValue]);

  const fromPath = getSafeReturnUrl((location.state as any)?.from?.pathname);

  const fillDemoCredentials = () => {
    setValue('email', 'minh.hocsinh@jami.edu.vn');
    setValue('password', 'Demo1234!');
  };

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login(data);
      navigate(fromPath, { replace: true });
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'INVALID_CREDENTIALS') {
          setErrorMessage('Email hoặc mật khẩu không chính xác.');
        } else if (err.status === 429 || err.code === 'RATE_LIMITED') {
          setErrorMessage(err.message || 'Thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.');
        } else if (err.status === 503 || err.code === 'DATABASE_UNAVAILABLE') {
          const reqId = err.data?.error?.requestId ? ` (Mã yêu cầu: ${err.data.error.requestId})` : '';
          setErrorMessage(`Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.${reqId}`);
        } else {
          setErrorMessage(err.message || 'Đăng nhập không thành công.');
        }
      } else {
        setErrorMessage('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setErrorMessage(null);
    setIsDemoLoading(true);
    try {
      await loginDemo();
      navigate('/today', { replace: true });
    } catch (err: any) {
      setErrorMessage(err.message || 'Tài khoản Demo hiện không khả dụng.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] flex flex-col md:flex-row font-sans">
      {/* Left Panel: Showcase */}
      <div className="hidden md:flex md:w-1/2 bg-[#080D09] p-8 lg:p-12 flex-col justify-between relative overflow-hidden border-r border-[rgba(34,197,94,0.18)]">
        <div className="absolute inset-0 jami-mesh-gradient opacity-70 pointer-events-none" />

        {/* Top Logo */}
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] font-black text-xl shadow-lg shadow-[#16A34A]/25 border border-[#22C55E]/40">
              J
            </div>
            <div>
              <div className="font-black text-xl text-[#F3FAF5] tracking-tight">
                JAMI <span className="text-[#22C55E]">AI</span>
              </div>
              <div className="text-[10px] font-bold text-[#86EFAC] tracking-wider">HỌC TẬP THÔNG MINH</div>
            </div>
          </Link>
        </div>

        {/* Robot Visual and Value Prop */}
        <div className="relative z-10 py-8 space-y-6 flex flex-col items-center text-center">
          <RobotJami
            state="speaking"
            size="lg"
            showBubble={true}
            bubbleMessage="Chào bạn! Đăng nhập để Jami đồng hành cùng bạn hôm nay nhé!"
          />

          <div className="space-y-2 max-w-sm">
            <h2 className="text-xl font-bold text-[#F3FAF5]">
              Lập kế hoạch & Đồng hành học tập
            </h2>
            <p className="text-xs text-[#A9B8AE] leading-relaxed">
              Tối ưu lịch học cá nhân, chia nhỏ nhiệm vụ từng bước và luyện tập nước rút trước kỳ kiểm tra.
            </p>
          </div>
        </div>

        {/* Bottom Security Note */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-[#A9B8AE]">
          <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
          <span>Bảo mật an toàn cho học sinh Lớp 6 — 12</span>
        </div>
      </div>

      {/* Right Panel: Clean Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 bg-[#0B120D]">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Brand Top */}
          <div className="md:hidden flex items-center justify-between pb-4 border-b border-[rgba(34,197,94,0.18)]">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#16A34A] flex items-center justify-center text-[#050806] font-black">
                J
              </div>
              <span className="font-black text-lg text-[#F3FAF5]">JAMI AI</span>
            </Link>
            <span className="text-xs font-bold text-[#86EFAC]">Lớp 6 — 12</span>
          </div>

          {/* Form Header */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F3FAF5]">Đăng nhập</h1>
            <p className="text-xs text-[#A9B8AE]">
              Chào mừng bạn quay trở lại với không gian học tập Jami.
            </p>
          </div>

          {/* Quick Demo Fill Banner (Only rendered when demo mode is active) */}
          {demoLoginEnabled && (
            <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.25)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#86EFAC] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                  Tài khoản Dùng thử (Demo)
                </span>
                <button
                  type="button"
                  onClick={fillDemoCredentials}
                  className="text-[11px] font-bold text-[#22C55E] hover:underline cursor-pointer"
                >
                  Tự động điền &rarr;
                </button>
              </div>
              <p className="text-[11px] text-[#A9B8AE]">
                Tài khoản mẫu: <strong>minh.hocsinh@jami.edu.vn</strong>
              </p>
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={isDemoLoading}
                className="w-full py-2 px-3 rounded-xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-[#22C55E]/30"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isDemoLoading ? 'Đang vào Demo...' : 'Đăng nhập nhanh một chạm vào Demo'}</span>
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1">
              <label htmlFor="login-email" className="text-xs font-bold text-[#F3FAF5]">Email học sinh</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#A9B8AE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="minh.hocsinh@jami.edu.vn"
                  {...register('email')}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border bg-[#050806] text-sm text-[#F3FAF5] focus:outline-none ${
                    errors.email
                      ? 'border-rose-500'
                      : 'border-[rgba(34,197,94,0.25)] focus:border-[#22C55E]'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-[11px] text-rose-400">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-bold text-[#F3FAF5]">Mật khẩu</label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] font-bold text-[#22C55E] hover:underline"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#A9B8AE] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className={`w-full pl-10 pr-11 py-2.5 rounded-xl border bg-[#050806] text-sm text-[#F3FAF5] focus:outline-none ${
                    errors.password
                      ? 'border-rose-500'
                      : 'border-[rgba(34,197,94,0.25)] focus:border-[#22C55E]'
                  }`}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-[#A9B8AE] hover:text-[#F3FAF5] absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] text-rose-400">{errors.password.message}</p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberMe"
                {...register('rememberMe')}
                className="w-4 h-4 rounded text-[#16A34A] focus:ring-[#22C55E] accent-[#16A34A]"
              />
              <label htmlFor="rememberMe" className="text-xs text-[#A9B8AE] select-none cursor-pointer">
                Ghi nhớ đăng nhập trên thiết bị này
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-extrabold text-sm shadow-lg shadow-[#16A34A]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập vào Jami'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Footer CTA */}
          <div className="text-center pt-2 border-t border-[rgba(34,197,94,0.18)]">
            <p className="text-xs text-[#A9B8AE]">
              Chưa có tài khoản học sinh?{' '}
              <Link to="/signup" className="font-extrabold text-[#22C55E] hover:underline">
                Đăng ký tài khoản mới &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
