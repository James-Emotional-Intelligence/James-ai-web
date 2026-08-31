import React, { useState } from 'react';
import { RobotJami, JamiState } from './RobotJami';

export const RobotJamiLab: React.FC = () => {
  const [selectedState, setSelectedState] = useState<JamiState>('idle');
  const [selectedSize, setSelectedSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [selectedMode, setSelectedMode] = useState<'full' | 'head'>('full');
  const [selectedRenderer, setSelectedRenderer] = useState<'premium' | 'legacy'>('premium');
  const [selectedFaceMode, setSelectedFaceMode] = useState<'source' | 'mouth-only' | 'clean-dynamic'>('source');
  const [bgMode, setBgMode] = useState<'dark' | 'gray' | 'light'>('dark');
  const [showBubble, setShowBubble] = useState(true);
  const [bubbleText, setBubbleText] = useState('Chào bạn! Mình là Robot Jami 2D phiên bản nâng cấp.');

  const states: JamiState[] = [
    'idle',
    'listening_command',
    'thinking',
    'speaking',
    'confirmation_pending',
    'executing',
    'celebrating',
    'encouraging',
    'guiding',
    'focus',
    'sleeping',
    'error',
    'disabled',
  ];

  const bgColor = {
    dark: 'bg-[#050806] text-[#F3FAF5]',
    gray: 'bg-zinc-800 text-zinc-100',
    light: 'bg-zinc-100 text-zinc-900',
  }[bgMode];

  return (
    <div className={`p-6 min-h-screen ${bgColor} space-y-6 font-sans select-none transition-colors`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-700/40 pb-4">
          <div>
            <h1 className="text-xl font-bold">Robot Jami 2D Visual Studio Lab</h1>
            <p className="text-xs opacity-75">Kiểm tra tỷ lệ, chuyển động, khớp xoay và lip-sync đa nền</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBgMode('dark')}
              className={`px-3 py-1 text-xs rounded-lg border cursor-pointer ${
                bgMode === 'dark' ? 'bg-zinc-900 border-[#22C55E] text-[#86EFAC]' : 'border-zinc-700'
              }`}
            >
              Nền Tối
            </button>
            <button
              onClick={() => setBgMode('gray')}
              className={`px-3 py-1 text-xs rounded-lg border cursor-pointer ${
                bgMode === 'gray' ? 'bg-zinc-700 border-[#22C55E] text-[#86EFAC]' : 'border-zinc-700'
              }`}
            >
              Nền Xám
            </button>
            <button
              onClick={() => setBgMode('light')}
              className={`px-3 py-1 text-xs rounded-lg border cursor-pointer ${
                bgMode === 'light' ? 'bg-white border-[#22C55E] text-zinc-900 font-bold' : 'border-zinc-700'
              }`}
            >
              Nền Sáng
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-black/20 p-4 rounded-2xl border border-zinc-700/30 text-xs">
          <div>
            <div className="font-bold mb-1.5 opacity-90">Trạng thái (State):</div>
            <div className="flex flex-wrap gap-1.5">
              {states.map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedState(st)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                    selectedState === st
                      ? 'bg-[#16A34A] text-black font-bold'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-bold mb-1.5 opacity-90">Kích thước & Chế độ:</div>
            <div className="flex gap-2 mb-3">
              {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => setSelectedSize(sz)}
                  className={`px-3 py-1 rounded-md cursor-pointer uppercase ${
                    selectedSize === sz
                      ? 'bg-[#16A34A] text-black font-bold'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-3">
              {(['full', 'head'] as const).map((md) => (
                <button
                  key={md}
                  onClick={() => setSelectedMode(md)}
                  className={`px-3 py-1 rounded-md cursor-pointer capitalize ${
                    selectedMode === md
                      ? 'bg-[#16A34A] text-black font-bold'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {md === 'full' ? 'Toàn thân' : 'Đầu avatar'}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-3">
              {(['premium', 'legacy'] as const).map((ren) => (
                <button
                  key={ren}
                  onClick={() => setSelectedRenderer(ren)}
                  className={`px-3 py-1 rounded-md cursor-pointer capitalize ${
                    selectedRenderer === ren
                      ? 'bg-cyan-500 text-black font-bold'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {ren === 'premium' ? 'Premium 2D' : 'Legacy SVG'}
                </button>
              ))}
            </div>

            {selectedRenderer === 'premium' && (
              <div className="space-y-1">
                <div className="font-bold opacity-80">Face Mode:</div>
                <div className="flex flex-wrap gap-1.5">
                  {(['source', 'mouth-only', 'clean-dynamic'] as const).map((fm) => (
                    <button
                      key={fm}
                      onClick={() => setSelectedFaceMode(fm)}
                      className={`px-2.5 py-0.5 rounded text-[11px] cursor-pointer ${
                        selectedFaceMode === fm
                          ? 'bg-emerald-400 text-black font-bold'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {fm}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="font-bold mb-1.5 opacity-90">Speech Bubble:</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBubble}
                  onChange={(e) => setShowBubble(e.target.checked)}
                />
                <span>Hiển thị bong bóng thoại</span>
              </label>
              <input
                type="text"
                value={bubbleText}
                onChange={(e) => setBubbleText(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200"
              />
            </div>
          </div>
        </div>

        {/* Main Stage Preview */}
        <div className="flex flex-col items-center justify-center min-h-[460px] p-8 rounded-3xl border border-zinc-700/30 bg-black/10 relative overflow-hidden">
          <RobotJami
            state={selectedState}
            size={selectedSize}
            displayMode={selectedMode}
            renderer={selectedRenderer}
            faceMode={selectedFaceMode}
            showBubble={showBubble}
            bubbleMessage={bubbleText}
            bubbleActions={['Thử giọng nói', 'Hẹn giờ tập trung']}
          />
        </div>

        {/* Multi-instance Collision Verification */}
        <div className="border-t border-zinc-700/30 pt-6 space-y-3">
          <h2 className="text-sm font-bold">Kiểm tra nhiều Robot cùng xuất hiện (Multi-Instance SVG ID Isolation):</h2>
          <div className="flex flex-wrap items-center justify-around gap-6 p-6 rounded-2xl bg-black/20">
            <RobotJami state="idle" size="sm" showBubble={false} />
            <RobotJami state="speaking" size="sm" showBubble={false} />
            <RobotJami state="thinking" size="sm" showBubble={false} />
            <RobotJami state="celebrating" size="sm" showBubble={false} />
            <RobotJami state="listening_command" size="sm" displayMode="head" showBubble={false} />
          </div>
        </div>
      </div>
    </div>
  );
};
