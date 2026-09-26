import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  ArrowRight,
  Menu,
  X,
} from 'lucide-react';
import { RobotJami, JamiState } from '../../components/jami/RobotJami';

export const LandingPage: React.FC = () => {
  const [spotlightState, setSpotlightState] = useState<JamiState>('speaking');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);


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
          <div className="md:hidden bg-[#0B120D] border-b border-[rgba(34,197,94,0.22)] px-6 py-5 shadow-2xl">
            <div className="flex flex-col gap-2.5">
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
            <div className="lg:col-span-7 space-y-8 lg:space-y-10 py-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#101A13] border border-[rgba(34,197,94,0.3)] text-[#86EFAC] text-xs font-bold tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>DÀNH RIÊNG CHO HỌC SINH LỚP 6 — 12</span>
              </div>

              <h1 className="text-[32px] sm:text-5xl lg:text-[56px] font-black tracking-tight text-[#F3FAF5] leading-[1.25] lg:leading-[1.15] max-w-2xl">
                TỪ MỤC TIÊU ĐẾN <br className="hidden sm:block" />
                <span className="bg-gradient-to-r from-[#22C55E] via-[#86EFAC] to-[#4ADE80] bg-clip-text text-transparent">
                  LỘ TRÌNH HỌC TẬP
                </span> <br className="hidden sm:block" />
                ĐƯỢC THIẾT KẾ RIÊNG <br className="hidden lg:block" />
                CHO BẠN
              </h1>

              {/* Action Buttons */}
              <div className="flex pt-2">
                <Link
                  to="/signup"
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-black text-sm rounded-xl shadow-xl shadow-[#16A34A]/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>Bắt đầu cùng Jami</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
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


      {/* Footer */}
      <footer className="py-8 bg-[#050806] text-center text-xs text-[#A9B8AE]">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <div className="font-black text-sm text-[#F3FAF5]">JAMI AI</div>
          <p>JAMI AI – TRỢ LÝ AI LẬP KẾ HOẠCH VÀ ĐỒNG HÀNH HỌC TẬP CÁ NHÂN HÓA</p>
          <div className="text-[11px] text-[#526356] pt-2">© 2026 JAMI AI. Mọi quyền được bảo lưu.</div>
        </div>
      </footer>
    </div>
  );
};
