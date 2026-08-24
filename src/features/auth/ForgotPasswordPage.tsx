import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailServiceConfigured, setEmailServiceConfigured] = useState<boolean>(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.forgotPassword(email);
      setEmailServiceConfigured(Boolean(res.emailServiceConfigured));
      setIsSubmitted(true);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
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
          <h1 className="text-2xl font-black text-[#F3FAF5]">Khôi phục mật khẩu</h1>
          <p className="text-xs text-[#A9B8AE]">
            Nhập email tài khoản học sinh đã đăng ký để nhận hướng dẫn đặt lại mật khẩu.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isSubmitted ? (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#14532D] text-[#86EFAC] flex items-center justify-center border border-[#22C55E]/40">
              <CheckCircle2 className="w-6 h-6 text-[#22C55E]" />
            </div>
            <div className="text-sm font-bold text-[#F3FAF5]">
              Yêu cầu đã được ghi nhận cho {email}
            </div>

            {!emailServiceConfigured ? (
              <div className="p-3.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-amber-200 text-xs leading-relaxed space-y-1">
                <div className="font-bold flex items-center justify-center gap-1.5 text-amber-300">
                  <AlertCircle className="w-4 h-4" />
                  <span>Dịch vụ Email chưa được cấu hình</span>
                </div>
                <p>
                  Hệ thống chưa kết nối SMTP/SendGrid. Mã/token khôi phục đã được tạo an toàn trong cơ sở dữ liệu. Quản trị viên hệ thống có thể liên hệ trực tiếp để cấp lại.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#A9B8AE] leading-relaxed">
                Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu trong hộp thư đến trong ít phút.
              </p>
            )}

            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại trang Đăng nhập</span>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#A9B8AE]" />
                <span>Email tài khoản</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vidu@hocsinh.edu.vn"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[rgba(34,197,94,0.25)] bg-[#050806] text-sm text-[#F3FAF5] focus:border-[#22C55E] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-bold text-xs shadow-md shadow-[#16A34A]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'Đang kiểm tra email...' : 'Gửi liên kết khôi phục'}</span>
            </button>

            <div className="text-center pt-2">
              <Link
                to="/login"
                className="text-xs font-bold text-[#A9B8AE] hover:text-[#22C55E] inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay lại Đăng nhập</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
