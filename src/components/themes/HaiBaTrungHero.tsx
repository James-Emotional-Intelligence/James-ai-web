import React, { useState, useEffect } from 'react';
import { Sparkles, BookOpen, PenLine, Shield, Compass, Printer } from 'lucide-react';
import { HAI_BA_TRUNG_ASSETS } from '../../assets/themes/hai-ba-trung';

interface HaiBaTrungHeroProps {
  studentName: string;
  greetingMessage?: string;
  todayDateFormatted?: string;
  onOpenStoryModal: () => void;
  onScrollToLessonLogs?: () => void;
  onExportPdf?: () => void;
  interactionSlot?: React.ReactNode;
}

export const HaiBaTrungHero: React.FC<HaiBaTrungHeroProps> = ({
  studentName,
  greetingMessage,
  todayDateFormatted,
  onOpenStoryModal,
  onScrollToLessonLogs,
  onExportPdf,
  interactionSlot,
}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);


  return (
    <div
      className="relative w-full rounded-3xl overflow-hidden border border-[#D2A84A]/35 bg-gradient-to-br from-[#06130E] via-[#0B2118] to-[#102B20] shadow-2xl transition-all duration-300 group"
      data-testid="hai-ba-trung-hero"
    >
      {/* Subtle Radial Glow Behind Elephant Statue Art */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_50%,rgba(25,199,111,0.12),transparent_70%)] pointer-events-none"
        aria-hidden="true"
      />

      {/* Subtle Bronze Corner Accents */}
      <div
        className="absolute top-0 right-0 w-32 h-32 bg-[radial-gradient(circle_at_top_right,rgba(210,168,74,0.12),transparent_70%)] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between p-6 sm:p-8 md:p-9 gap-6 md:gap-8 min-h-[340px] md:min-h-[360px]">
        {/* Left Content (Text & Actions) */}
        <div className="w-full md:w-[42%] lg:w-[38%] space-y-4 text-left z-10">
          {/* Heritage Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#102B20]/90 border border-[#D2A84A]/40 text-[#E8C66A] shadow-sm">
            <Shield className="w-3.5 h-3.5 text-[#D2A84A]" />
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider">
              Chủ đề Di Sản Việt Nam
            </span>
          </div>

          {/* Title & Quote */}
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#FFF5C2] tracking-tight leading-tight">
              Khí Phách Hai Bà Trưng
            </h2>
            <p className="text-xs sm:text-sm text-[#E8C66A] font-semibold italic">
              "Vung gươm dệt cội nguồn sông núi • Vững chí vươn tầm tri thức tương lai"
            </p>
          </div>

          {/* Greeting & Date */}
          {interactionSlot ? (
            <div className="pt-1">{interactionSlot}</div>
          ) : (
            <div className="text-xs text-[#B9C8BE] space-y-0.5 pt-1">
              <div className="font-bold text-[#F5F4EF]">
                {greetingMessage || `Xin chào, ${studentName}!`}
              </div>
              {todayDateFormatted && (
                <div className="text-[11px] text-[#B9C8BE]/80">
                  {todayDateFormatted}
                </div>
              )}
            </div>
          )}

          {/* Hero Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onOpenStoryModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D2A84A] to-[#B8860B] hover:from-[#E8C66A] hover:to-[#D2A84A] text-[#06130E] text-xs font-black shadow-md shadow-[#D2A84A]/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer min-h-[44px]"
              aria-label="Khám phá câu chuyện Hai Bà Trưng"
            >
              <Compass className="w-4 h-4 text-[#06130E]" />
              <span>Khám phá câu chuyện</span>
            </button>

            {onScrollToLessonLogs && (
              <button
                type="button"
                onClick={onScrollToLessonLogs}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#102B20] hover:bg-[#163B2C] text-[#E8C66A] hover:text-[#FFF5C2] border border-[#D2A84A]/30 text-xs font-bold transition-all cursor-pointer min-h-[44px]"
                aria-label="Nhập bài học và bài tập về nhà hôm nay"
              >
                <PenLine className="w-3.5 h-3.5 text-[#D2A84A]" />
                <span>Nhập bài học & BTVN</span>
              </button>
            )}

            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#102B20] hover:bg-[#163B2C] text-[#E8C66A] hover:text-[#FFF5C2] border border-[#D2A84A]/30 text-xs font-bold transition-all cursor-pointer min-h-[44px]"
                aria-label="In kế hoạch học tập PDF"
              >
                <Printer className="w-3.5 h-3.5 text-[#D2A84A]" />
                <span>In kế hoạch (PDF)</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Art Content (Hai Ba Trung Riding Elephants) */}
        <div className="w-full md:w-[58%] lg:w-[62%] flex items-center justify-center md:justify-end relative self-stretch overflow-visible">
          {!imageError ? (
            <div className="relative w-full h-[220px] sm:h-[270px] md:h-[320px] lg:h-[340px] flex items-center justify-center md:justify-end">
              {prefersReducedMotion ? (
                <img
                  src={HAI_BA_TRUNG_ASSETS.ridingElephantsPoster}
                  alt="Hai Bà Trưng cưỡi hai voi, phất cờ và cầm kiếm"
                  width={1920}
                  height={1080}
                  loading="eager"
                  decoding="async"
                  onError={() => setImageError(true)}
                  className="w-full h-full object-contain object-center md:object-right select-none pointer-events-none drop-shadow-[0_16px_32px_rgba(0,0,0,0.7)] transition-transform duration-500 hover:scale-[1.01]"
                  style={{
                    maxWidth: '100%',
                    aspectRatio: '16/9',
                  }}
                />
              ) : (
                <video
                  src={HAI_BA_TRUNG_ASSETS.ridingElephantsMp4}
                  poster={HAI_BA_TRUNG_ASSETS.ridingElephantsPoster}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  onError={() => setImageError(true)}
                  className="w-full h-full object-contain object-center md:object-right select-none pointer-events-none drop-shadow-[0_16px_32px_rgba(0,0,0,0.7)] transition-transform duration-500 hover:scale-[1.01]"
                  style={{
                    maxWidth: '100%',
                    aspectRatio: '16/9',
                  }}
                  aria-label="Hai Bà Trưng cưỡi hai voi, phất cờ và cầm kiếm"
                />
              )}
            </div>
          ) : (
            /* Elegant vector fallback if image/video decoding fails */
            <div className="w-full h-[200px] flex flex-col items-center justify-center rounded-2xl bg-[#102B20]/60 border border-[#D2A84A]/30 text-center p-4 space-y-2">
              <img
                src={HAI_BA_TRUNG_ASSETS.statueTransparent}
                alt="Tượng Hai Bà Trưng"
                className="w-24 h-24 object-contain opacity-80"
              />
              <span className="text-xs font-bold text-[#E8C66A]">
                Tượng Đài Hai Bà Trưng – Khí Phách Trưng Vương
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
