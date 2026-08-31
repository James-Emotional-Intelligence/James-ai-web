import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarDays,
  Mic,
  GraduationCap,
  Clock,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Menu,
  X,
  Lock,
  Flame,
  ChevronRight,
  BookOpen,
  Zap,
  FolderArchive,
  BarChart3,
  Bell,
  CheckSquare,
  Bot,
} from 'lucide-react';
import { RobotJami, JamiState } from '../../components/jami/RobotJami';
import { useAuth } from '../auth/AuthProvider';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginDemo } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [spotlightState, setSpotlightState] = useState<JamiState>('speaking');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const featureTabs = [
    {
      id: 'timetable',
      order: 1,
      title: 'Lịch học thông minh',
      icon: CalendarDays,
      tag: 'Tự động & Không xung đột',
      headline: 'Xếp lịch học tự động không trùng lịch học thêm hay giờ sinh hoạt',
      description:
        'Tự động tích hợp thời khóa biểu trên lớp, ca học thêm, thời gian di chuyển và giờ sinh hoạt gia đình để tạo ra lịch học tối ưu nhất cho từng ngày.',
      highlights: [
        'Thuật toán xếp lịch thích ứng chương trình học',
        'Tự động bù ca học khi có việc đột xuất',
        'Chặn hoàn toàn tình trạng quá tải (tối đa 180 phút/ngày)',
      ],
      previewCard: {
        subject: 'Toán học — Lớp 9',
        time: '19:00 - 19:45 (Tối nay)',
        badge: 'Đã tối ưu không trùng lịch',
        steps: '3 bước • 45 phút',
      },
    },
    {
      id: 'tasks',
      order: 2,
      title: 'Chi tiết công việc',
      icon: CheckSquare,
      tag: 'Triển khai thực tế',
      headline: 'Chi tiết từng bước cụ thể giúp hoàn thành xuất sắc nhiệm vụ',
      description:
        'Mỗi công việc được Jami phân rã theo thứ tự thực tế: chuẩn bị tài liệu, các bước triển khai chi tiết, tiêu chí hoàn thành xuất sắc và mẹo khi gặp bài khó.',
      highlights: [
        'Hướng dẫn từng bước kèm thời gian dự kiến',
        'Tiêu chí đánh giá chất lượng hoàn thành xuất sắc',
        'Ghi chú kết quả & bằng chứng bài làm',
      ],
      previewCard: {
        subject: 'Bài tập Hình học 9',
        time: 'Bước 1: Vẽ hình & Ghi giả thiết',
        badge: 'Hướng dẫn chi tiết',
        steps: 'Mục tiêu: Đạt điểm tối đa',
      },
    },
    {
      id: 'today',
      order: 3,
      title: 'Học tập hôm nay & Hẹn giờ tập trung',
      icon: Clock,
      tag: 'Chu kỳ 45/10 & 25/5',
      headline: 'Không gian học tập yên tĩnh, rèn luyện thói quen tập trung sâu',
      description:
        'Phương pháp học ngắt quãng khoa học với giao diện tối giản, đếm ngược chính xác từ máy chủ và chuông báo nhẹ nhàng giúp duy trì sự bền bỉ.',
      highlights: [
        'Chu kỳ học 45 phút / nghỉ 10 phút phù hợp học sinh',
        'Đồng bộ tiến độ trực tiếp với từng bước công việc',
        'Tích lũy chuỗi ngày tập trung liên tục',
      ],
      previewCard: {
        subject: 'Phiên tập trung: Vẽ đồ thị hàm số',
        time: 'Còn lại 24:18',
        badge: 'Đang đếm ngược',
        steps: 'Trạng thái: Tập trung cao độ',
      },
    },
    {
      id: 'jami',
      order: 4,
      title: 'Trợ lý AI Robot Jami',
      icon: Bot,
      tag: 'Đồng hành thông minh',
      headline: 'Người bạn đồng hành AI thấu hiểu và hướng dẫn phương pháp học',
      description:
        'Jami giao tiếp tự nhiên qua văn bản hoặc giọng nói, giải thích phương pháp giải toán, gợi ý cách tư duy mà không giải bài hộ.',
      highlights: [
        'Hỗ trợ hỏi đáp phương pháp học tập 24/7',
        'Nhận diện mục tiêu giọng nói và lập đề xuất',
        'An toàn thông tin và tôn trọng quyền riêng tư học sinh',
      ],
      previewCard: {
        subject: 'Hỏi Jami: Phương pháp chứng minh tứ giác nội tiếp',
        time: 'Phản hồi tức thì',
        badge: 'Gợi ý tư duy',
        steps: '4 dấu hiệu nhận biết trọng tâm',
      },
    },
  ];

  const handleDemoAccess = async () => {
    setIsDemoLoading(true);
    try {
      await loginDemo();
      navigate('/today');
    } catch {
      navigate('/login');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] flex flex-col font-sans selection:bg-[#16A34A] selection:text-[#050806]">
      {/* 1. Top Brand Tagline Bar */}
      <div className="bg-[#080D09] border-b border-[rgba(34,197,94,0.18)] px-4 sm:px-8 py-1.5 text-xs text-[#A9B8AE] flex items-center justify-between z-50">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="font-extrabold text-[#F3FAF5]">JAMI AI</span>
          <span className="hidden sm:inline text-[#A9B8AE]">• LỚP 6 — 12</span>
        </div>
        <div className="text-[11px] font-medium text-[#86EFAC] truncate">
          TRỢ LÝ AI LẬP KẾ HOẠCH VÀ ĐỒNG HÀNH HỌC TẬP CÁ NHÂN HÓA
        </div>
      </div>

      {/* 2. Main Sticky Navigation */}
      <header className="sticky top-0 z-40 bg-[#0B120D]/95 backdrop-blur-md border-b border-[rgba(34,197,94,0.22)] text-[#F3FAF5] shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-18 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] font-black text-xl shadow-lg shadow-[#16A34A]/25 border border-[#22C55E]/40 group-hover:scale-105 transition-transform">
              J
            </div>
            <div>
              <div className="font-black text-xl tracking-tight text-[#F3FAF5]">
                JAMI <span className="text-[#22C55E]">AI</span>
              </div>
              <div className="text-[10px] font-bold text-[#86EFAC] uppercase tracking-wider -mt-1">
                Kế Hoạch & Đồng Hành
              </div>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#A9B8AE]">
            <a href="#features" className="hover:text-[#22C55E] transition-colors">
              8 Mô-đun Học Tập
            </a>
            <a href="#how-it-works" className="hover:text-[#22C55E] transition-colors">
              Cách hoạt động
            </a>
            <a href="#robot-jami" className="hover:text-[#22C55E] transition-colors">
              Robot Jami
            </a>
            <a href="#safety" className="hover:text-[#22C55E] transition-colors">
              An toàn & Bảo mật
            </a>
          </nav>

          {/* Right Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl transition-colors"
            >
              Đăng nhập
            </Link>
            <Link
              to="/signup"
              className="px-5 py-2.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-extrabold text-xs rounded-xl shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
            >
              <span>Đăng ký tài khoản</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="p-2 text-[#A9B8AE] md:hidden rounded-xl hover:bg-[#101A13]"
            aria-label="Toggle navigation menu"
          >
            {isMobileNavOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileNavOpen && (
          <div className="md:hidden bg-[#0B120D] border-b border-[rgba(34,197,94,0.22)] px-6 py-5 space-y-4 shadow-2xl">
            <nav className="flex flex-col space-y-3 text-sm font-bold text-[#F3FAF5]">
              <a
                href="#features"
                onClick={() => setIsMobileNavOpen(false)}
                className="py-1 hover:text-[#22C55E]"
              >
                8 Mô-đun Học Tập
              </a>
              <a
                href="#how-it-works"
                onClick={() => setIsMobileNavOpen(false)}
                className="py-1 hover:text-[#22C55E]"
              >
                Cách hoạt động
              </a>
              <a
                href="#robot-jami"
                onClick={() => setIsMobileNavOpen(false)}
                className="py-1 hover:text-[#22C55E]"
              >
                Robot Jami
              </a>
              <a
                href="#safety"
                onClick={() => setIsMobileNavOpen(false)}
                className="py-1 hover:text-[#22C55E]"
              >
                An toàn & Bảo mật
              </a>
            </nav>
            <div className="pt-3 border-t border-[rgba(34,197,94,0.18)] flex flex-col gap-2.5">
              <Link
                to="/login"
                onClick={() => setIsMobileNavOpen(false)}
                className="w-full py-2.5 text-center font-bold text-xs text-[#F3FAF5] border border-[rgba(34,197,94,0.25)] rounded-xl"
              >
                Đăng nhập
              </Link>
              <Link
                to="/signup"
                onClick={() => setIsMobileNavOpen(false)}
                className="w-full py-2.5 text-center font-bold text-xs bg-[#16A34A] text-[#050806] rounded-xl shadow-md"
              >
                Đăng ký ngay
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* 3. Hero Section */}
      <section className="relative overflow-hidden bg-[#050806] py-16 sm:py-24 border-b border-[rgba(34,197,94,0.2)]">
        {/* Subtle mesh background lights */}
        <div className="absolute inset-0 jami-mesh-gradient opacity-90 pointer-events-none" />
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#16A34A]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-0 w-96 h-96 bg-[#14532D]/30 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#101A13] border border-[rgba(34,197,94,0.3)] text-[#86EFAC] text-xs font-bold tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>DÀNH RIÊNG CHO HỌC SINH LỚP 6 — 12</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[#F3FAF5] leading-[1.15]">
                Biến mục tiêu học tập thành kế hoạch{' '}
                <span className="bg-gradient-to-r from-[#22C55E] via-[#86EFAC] to-[#4ADE80] bg-clip-text text-transparent">
                  rõ ràng mỗi ngày.
                </span>
              </h1>

              <p className="text-[#A9B8AE] text-base sm:text-lg max-w-2xl leading-relaxed font-normal">
                JAMI AI tự động phân tích thời khóa biểu, lịch học thêm và bài tập để tạo lộ trình
                từng bước không xung đột, giúp học sinh chủ động và tự tin học tập hiệu quả.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to="/signup"
                  className="px-7 py-3.5 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-black text-sm rounded-xl shadow-xl shadow-[#16A34A]/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  <span>Bắt đầu cùng Jami</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <button
                  type="button"
                  onClick={handleDemoAccess}
                  disabled={isDemoLoading}
                  className="px-6 py-3.5 bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.25)] font-bold text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#86EFAC]" />
                  <span>{isDemoLoading ? 'Đang khởi tạo...' : 'Khám phá chế độ Dùng thử (Demo)'}</span>
                </button>
              </div>

              {/* Trust Indicators */}
              <div className="pt-4 flex flex-wrap items-center gap-6 text-xs text-[#A9B8AE]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                  <span>Lịch học không xung đột</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                  <span>Chi tiết công việc từng bước</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                  <span>Bảo mật dữ liệu học sinh</span>
                </div>
              </div>
            </div>

            {/* Right Hero Graphic: Robot Jami Interactive Card */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#86EFAC]">
                    <Sparkles className="w-4 h-4 text-[#22C55E]" />
                    <span>TRỢ LÝ ĐỒNG HÀNH</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#14532D] text-[#86EFAC] text-[10px] font-extrabold border border-[#22C55E]/30">
                    Trực tuyến 24/7
                  </span>
                </div>

                <div className="flex flex-col items-center justify-center py-2 space-y-3">
                  <RobotJami
                    state={spotlightState}
                    size="lg"
                    bubbleMessage="Chào bạn! Nói mục tiêu của bạn cho Jami, mình sẽ cùng lên lịch nhé."
                    bubbleActions={['Lịch học', 'Hẹn giờ tập trung']}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-[rgba(34,197,94,0.18)]">
                  <div className="text-xs font-bold text-[#F3FAF5]">Trạng thái tương tác của Jami:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(['idle', 'speaking', 'guiding', 'focus'] as JamiState[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => setSpotlightState(st)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          spotlightState === st
                            ? 'bg-[#16A34A] text-[#050806]'
                            : 'bg-[#101A13] text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#142219] border border-[rgba(34,197,94,0.15)]'
                        }`}
                      >
                        {st === 'idle' ? 'Sẵn sàng' : st === 'speaking' ? 'Đang nói' : st === 'guiding' ? 'Hướng dẫn' : 'Tập trung'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 8 Core Modules Overview */}
      <section id="features" className="py-20 bg-[#080D09] border-b border-[rgba(34,197,94,0.2)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#101A13] border border-[rgba(34,197,94,0.3)] text-xs font-bold text-[#86EFAC]">
              <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>HỆ THỐNG TOÀN DIỆN</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-[#F3FAF5] tracking-tight">
              8 Mô-đun Học Tập Cá Nhân Hóa
            </h2>
            <p className="text-xs sm:text-sm text-[#A9B8AE]">
              Được thiết kế đồng bộ từ lập lịch, hướng dẫn từng bước đến ôn tập và kiểm tra định kỳ.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              {
                num: 1,
                title: 'LỊCH HỌC THÔNG MINH',
                desc: 'Tự động tích hợp thời khóa biểu, lịch học thêm & khung học không trùng lặp.',
                icon: CalendarDays,
              },
              {
                num: 2,
                title: 'CHI TIẾT CÔNG VIỆC',
                desc: 'Phân rã từng bước thực tế, tiêu chí hoàn thành xuất sắc và tài liệu chuẩn bị.',
                icon: CheckSquare,
              },
              {
                num: 3,
                title: 'HỌC TẬP HÔM NAY',
                desc: 'Bảng điều khiển ngày học kết hợp Hẹn giờ tập trung khoa học.',
                icon: Clock,
              },
              {
                num: 4,
                title: 'TRỢ LÝ AI (ROBOT JAMI)',
                desc: 'Robot Jami đồng hành giải thích phương pháp và nhận diện mục tiêu qua giọng nói.',
                icon: Bot,
              },
              {
                num: 5,
                title: 'KIỂM TRA & ÔN TẬP',
                desc: 'Lộ trình nước rút D-14, D-7, D-3, D-1 kèm đề thi trắc nghiệm & tự luận.',
                icon: GraduationCap,
              },
              {
                num: 6,
                title: 'BÁO CÁO HỌC TẬP',
                desc: 'Thống kê thời lượng thực tế, xu hướng điểm và chủ đề kiến thức mạnh/yếu.',
                icon: BarChart3,
              },
              {
                num: 7,
                title: 'KHO TÀI LIỆU',
                desc: 'Lưu trữ tài liệu học tập và hỗ trợ trích xuất kiến thức trọng tâm.',
                icon: FolderArchive,
              },
              {
                num: 8,
                title: 'THÔNG BÁO',
                desc: 'Nhắc nhở kịp thời trước giờ học, hạn chót công việc và mốc kiểm tra.',
                icon: Bell,
              },
            ].map((m) => (
              <div
                key={m.num}
                className="p-5 rounded-2xl bg-[#0B120D] border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/50 transition-all space-y-3 group hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-[#14532D] text-[#86EFAC] font-bold text-xs flex items-center justify-center border border-[#22C55E]/30">
                    {m.num}
                  </div>
                  <m.icon className="w-5 h-5 text-[#22C55E] group-hover:scale-110 transition-transform" />
                </div>
                <div className="font-extrabold text-sm text-[#F3FAF5]">{m.title}</div>
                <div className="text-xs text-[#A9B8AE] leading-relaxed">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Safety & Privacy Section */}
      <section id="safety" className="py-16 bg-[#050806]">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="p-8 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.25)] space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center border border-[#22C55E]/40">
                <ShieldCheck className="w-6 h-6 text-[#22C55E]" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#F3FAF5]">An Toàn Dữ Liệu & Quyền Riêng Tư Học Sinh</h3>
                <p className="text-xs text-[#A9B8AE]">Cam kết không chia sẻ dữ liệu cá nhân cho bên thứ ba</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-[#A9B8AE]">
              <div className="p-4 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] space-y-1.5">
                <div className="font-bold text-[#F3FAF5]">Mã Hóa Đăng Nhập</div>
                <p>Mật khẩu được băm an toàn và bảo vệ qua phiên cookie HttpOnly bảo mật.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] space-y-1.5">
                <div className="font-bold text-[#F3FAF5]">Cách Ly Dữ Liệu</div>
                <p>Toàn bộ kế hoạch, điểm số và bài tập được phân quyền chặt chẽ theo từng tài khoản.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] space-y-1.5">
                <div className="font-bold text-[#F3FAF5]">Quyền Xuất & Xóa</div>
                <p>Học sinh có toàn quyền xuất bản sao dữ liệu hoặc yêu cầu xóa tài khoản bất kỳ lúc nào.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-[#050806] border-t border-[rgba(34,197,94,0.18)] text-center text-xs text-[#A9B8AE]">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <div className="font-black text-sm text-[#F3FAF5]">JAMI AI</div>
          <p>JAMI AI – TRỢ LÝ AI LẬP KẾ HOẠCH VÀ ĐỒNG HÀNH HỌC TẬP CÁ NHÂN HÓA</p>
          <div className="text-[11px] text-[#526356] pt-2">© 2026 JAMI AI. Mọi quyền được bảo lưu.</div>
        </div>
      </footer>
    </div>
  );
};
