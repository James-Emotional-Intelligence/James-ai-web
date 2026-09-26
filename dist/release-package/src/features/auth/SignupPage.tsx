import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RegisterRequestSchema } from '../../../shared/schemas';
import { useAuth } from './AuthProvider';
import { Eye, EyeOff, Lock, Mail, User as UserIcon, GraduationCap, ArrowRight, AlertCircle, Check } from 'lucide-react';
import { ApiError } from '../../lib/api-client';

type SignupFormData = z.infer<typeof RegisterRequestSchema>;

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConflict409, setIsConflict409] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(RegisterRequestSchema) as any,
    defaultValues: {
      displayName: '',
      preferredName: '',
      email: '',
      gradeLevel: 9,
      password: '',
      confirmPassword: '',
      termsAccepted: false, // Default is false per security requirements
    },
  });

  const currentEmail = watch('email');
  const passwordVal = watch('password') || '';
  const hasMinLen = passwordVal.length >= 6;
  const hasNum = /\d/.test(passwordVal);

  const onSubmit = async (data: SignupFormData) => {
    setErrorMessage(null);
    setIsConflict409(false);
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        preferredName: data.preferredName?.trim() || data.displayName.trim().split(/\s+/).pop() || 'Học sinh',
      };
      await registerUser(payload);
      navigate('/onboarding', { replace: true });
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.code === 'EMAIL_ALREADY_EXISTS') {
          setIsConflict409(true);
          setErrorMessage('Email này đã được đăng ký. Vui lòng chuyển sang trang Đăng nhập.');
          // Clear sensitive password fields for safety while retaining name, email, gradeLevel, and terms
          setValue('password', '');
          setValue('confirmPassword', '');
        } else if (err.status === 429 || err.code === 'RATE_LIMITED') {
          setErrorMessage(err.message || 'Thao tác quá nhiều lần. Vui lòng thử lại sau.');
        } else if (err.status === 503 || err.code === 'DATABASE_UNAVAILABLE') {
          const reqId = err.data?.error?.requestId ? ` (Mã yêu cầu: ${err.data.error.requestId})` : '';
          setErrorMessage(`Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.${reqId}`);
        } else {
          setErrorMessage(err.message || 'Đăng ký không thành công. Vui lòng kiểm tra lại thông tin.');
        }
      } else {
        setErrorMessage('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNavigateToLogin = () => {
    navigate('/login', {
      state: { prefillEmail: currentEmail },
    });
  };

  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] py-10 px-4 sm:px-6 flex flex-col justify-center items-center font-sans">
      <div className="w-full max-w-lg bg-[#0B120D] border border-[rgba(34,197,94,0.25)] rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] font-black text-xl shadow-lg shadow-[#16A34A]/25 border border-[#22C55E]/40">
              J
            </div>
            <span className="font-black text-2xl text-[#F3FAF5]">
              JAMI <span className="text-[#22C55E]">AI</span>
            </span>
          </Link>
          <h1 className="text-2xl font-black text-[#F3FAF5]">Tạo tài khoản học sinh</h1>
          <p className="text-xs text-[#A9B8AE]">
            Trợ lý AI đồng hành lập kế hoạch và tối ưu thời gian học tập cho học sinh Lớp 6 — 12.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div>{errorMessage}</div>
              {isConflict409 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={handleNavigateToLogin}
                    className="px-3 py-1.5 rounded-lg bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] font-bold text-xs transition-all inline-flex items-center gap-1 cursor-pointer border border-[#22C55E]/30"
                  >
                    <span>Đi đến Đăng nhập</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Display Name & Preferred Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="displayName" className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-[#A9B8AE]" />
                <span>Họ và tên</span>
              </label>
              <input
                id="displayName"
                type="text"
                autoComplete="name"
                placeholder="Nguyễn Văn Minh"
                {...register('displayName')}
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#050806] text-sm text-[#F3FAF5] focus:outline-none ${
                  errors.displayName
                    ? 'border-rose-500'
                    : 'border-[rgba(34,197,94,0.25)] focus:border-[#22C55E]'
                }`}
              />
              {errors.displayName && (
                <p className="text-[11px] text-rose-400">{errors.displayName.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="preferredName" className="text-xs font-bold text-[#F3FAF5]">Tên Jami gọi em (tùy chọn)</label>
              <input
                id="preferredName"
                type="text"
                autoComplete="nickname"
                placeholder="Ví dụ: Minh"
                {...register('preferredName')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[rgba(34,197,94,0.25)] bg-[#050806] text-sm text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label htmlFor="signup-email" className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-[#A9B8AE]" />
              <span>Email học sinh</span>
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="minh.hocsinh@gmail.com"
              {...register('email')}
              className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#050806] text-sm text-[#F3FAF5] focus:outline-none ${
                errors.email
                  ? 'border-rose-500'
                  : 'border-[rgba(34,197,94,0.25)] focus:border-[#22C55E]'
              }`}
            />
            {errors.email && (
              <p className="text-[11px] text-rose-400">{errors.email.message}</p>
            )}
          </div>

          {/* Grade Level Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-[#A9B8AE]" />
              <span>Khối lớp hiện tại (GDPT 2018)</span>
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                <label
                  key={g}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                    Number(watch('gradeLevel')) === g
                      ? 'bg-[#16A34A] text-[#050806] border-[#22C55E] shadow-sm shadow-[#16A34A]/25'
                      : 'bg-[#101A13] text-[#A9B8AE] border-[rgba(34,197,94,0.18)] hover:bg-[#142219]'
                  }`}
                >
                  <input
                    type="radio"
                    value={g}
                    {...register('gradeLevel', { valueAsNumber: true })}
                    className="sr-only"
                  />
                  <span>Lớp</span>
                  <span className="text-sm font-black">{g}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Password & Confirm Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="signup-password" className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-[#A9B8AE]" />
                <span>Mật khẩu</span>
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Tối thiểu 6 ký tự"
                  {...register('password')}
                  className={`w-full px-3.5 py-2.5 pr-10 rounded-xl border bg-[#050806] text-sm text-[#F3FAF5] focus:outline-none ${
                    errors.password
                      ? 'border-rose-500'
                      : 'border-[rgba(34,197,94,0.25)] focus:border-[#22C55E]'
                  }`}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-[#A9B8AE] hover:text-[#F3FAF5] absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] text-rose-400">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="text-xs font-bold text-[#F3FAF5]">Xác nhận mật khẩu</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                {...register('confirmPassword')}
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#050806] text-sm text-[#F3FAF5] focus:outline-none ${
                  errors.confirmPassword
                    ? 'border-rose-500'
                    : 'border-[rgba(34,197,94,0.25)] focus:border-[#22C55E]'
                }`}
              />
              {errors.confirmPassword && (
                <p className="text-[11px] text-rose-400">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          {/* Password Validation Hints */}
          <div className="flex items-center gap-4 text-[11px] text-[#A9B8AE] px-1">
            <span className={`flex items-center gap-1 ${hasMinLen ? 'text-[#86EFAC]' : ''}`}>
              <Check className="w-3 h-3" /> Ít nhất 6 ký tự
            </span>
            <span className={`flex items-center gap-1 ${hasNum ? 'text-[#86EFAC]' : ''}`}>
              <Check className="w-3 h-3" /> Có chứa số
            </span>
          </div>

          {/* Optional Registration / Promotion Code */}
          <div className="space-y-1 pt-1">
            <label htmlFor="registrationCode" className="text-xs font-bold text-[#F3FAF5] flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="text-[#22C55E]">🎁</span>
                <span>Mã kích hoạt / Ưu đãi (tùy chọn)</span>
              </span>
              <span className="text-[10px] text-[#86EFAC] font-normal">Được tặng sẵn 25.000đ khi đăng ký</span>
            </label>
            <input
              id="registrationCode"
              type="text"
              placeholder="JAMI-XXXX-XXXX-XXXX-XXXX"
              {...register('registrationCode')}
              className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#050806] text-sm text-[#F3FAF5] uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal focus:outline-none ${
                errors.registrationCode
                  ? 'border-rose-500'
                  : 'border-[rgba(34,197,94,0.25)] focus:border-[#22C55E]'
              }`}
            />
            {errors.registrationCode && (
              <p className="text-[11px] text-rose-400">{errors.registrationCode.message}</p>
            )}
            <p className="text-[10px] text-[#A9B8AE]">
              Nhập mã giới thiệu của giáo viên hoặc nhà trường để nhận thêm ngân sách AI học tập.
            </p>
          </div>

          {/* Terms & Conditions */}
          <div className="flex items-start gap-2 pt-1">
            <input
              type="checkbox"
              id="termsAccepted"
              {...register('termsAccepted')}
              className="w-4 h-4 rounded mt-0.5 text-[#16A34A] focus:ring-[#22C55E] accent-[#16A34A]"
            />
            <label htmlFor="termsAccepted" className="text-xs text-[#A9B8AE] leading-relaxed cursor-pointer select-none">
              Em đồng ý với{' '}
              <span className="text-[#86EFAC] font-semibold underline">Điều khoản sử dụng</span>{' '}
              và{' '}
              <span className="text-[#86EFAC] font-semibold underline">Chính sách bảo mật</span>{' '}
              dành cho học sinh.
            </label>
          </div>
          {errors.termsAccepted && (
            <p className="text-[11px] text-rose-400">{errors.termsAccepted.message}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-extrabold text-sm shadow-lg shadow-[#16A34A]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký & Bắt đầu học'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center pt-2 border-t border-[rgba(34,197,94,0.18)]">
          <p className="text-xs text-[#A9B8AE]">
            Đã có tài khoản JAMI?{' '}
            <Link to="/login" className="font-extrabold text-[#22C55E] hover:underline">
              Đăng nhập ngay &rarr;
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
