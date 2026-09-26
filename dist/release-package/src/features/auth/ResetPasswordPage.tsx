import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ (thiếu token).');
      return;
    }

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, newPassword);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể kết nối máy chủ. Vui lòng thử lại sau.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] py-12 px-4 sm:px-6 flex flex-col justify-center items-center font-sans">
      <div className="w-full max-w-md bg-[#0B120D] border border-[rgba(34,197,94,0.25)] rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] font-black text-xl shadow-lg shadow-[#16A34A]/25 border border-[#22C55E]/40">
            J
          </div>
          <h1 className="text-2xl font-black text-[#F3FAF5]">Đặt lại mật khẩu mới</h1>
          <p className="text-xs text-[#A9B8AE]">
            Tạo mật khẩu mới an toàn cho tài khoản học sinh của bạn.
          </p>
        </div>

        {error && (
          <div aria-live="polite" className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#14532D] text-[#86EFAC] flex items-center justify-center border border-[#22C55E]/40">
              <CheckCircle2 className="w-6 h-6 text-[#22C55E]" />
            </div>
            <div className="text-sm font-bold text-[#F3FAF5]">
              Đặt lại mật khẩu thành công!
            </div>
            <p className="text-xs text-[#A9B8AE]">
              Hệ thống sẽ tự động chuyển hướng em sang trang Đăng nhập trong 3 giây...
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                <span>Chuyển sang trang Đăng nhập ngay</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="reset-new-password" className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#A9B8AE]" />
                <span>Mật khẩu mới</span>
              </label>
              <div className="relative">
                <input
                  id="reset-new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-[rgba(34,197,94,0.25)] bg-[#050806] text-sm text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
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
            </div>

            <div className="space-y-1">
              <label htmlFor="reset-confirm-password" className="text-xs font-bold text-[#F3FAF5]">Nhập lại mật khẩu mới</label>
              <input
                id="reset-confirm-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[rgba(34,197,94,0.25)] bg-[#050806] text-sm text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-bold text-xs shadow-md shadow-[#16A34A]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
