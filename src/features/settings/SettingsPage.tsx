import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Volume2,
  Download,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useNotifications } from '../../context/NotificationContext';
import confetti from 'canvas-confetti';

export const SettingsPage: React.FC = () => {
  const { showToast } = useNotifications();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    api
      .getJamiPreferences()
      .then((res) => {
        if (res.preferences) {
          setVoiceEnabled(Boolean(res.preferences.voiceEnabled));
          setSoundEffects(Boolean(res.preferences.soundEffects));
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleVoice = async (checked: boolean) => {
    const previous = voiceEnabled;
    setVoiceEnabled(checked);
    setIsSavingPrefs(true);
    setSaveStatus('Đang lưu cài đặt...');
    try {
      await api.updateJamiPreferences({ voiceEnabled: checked, soundEffects });
      setSaveStatus('Đã lưu thay đổi.');
      showToast('Đã lưu cài đặt', checked ? 'Đã bật giọng nói Jami' : 'Đã tắt giọng nói Jami', 'success');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err: any) {
      // Rollback on failure
      setVoiceEnabled(previous);
      setSaveStatus('Lỗi: Không thể lưu cài đặt.');
      showToast('Không thể lưu cài đặt', err.message || 'Vui lòng kiểm tra kết nối mạng và thử lại.', 'error');
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleToggleSound = async (checked: boolean) => {
    const previous = soundEffects;
    setSoundEffects(checked);
    setIsSavingPrefs(true);
    setSaveStatus('Đang lưu cài đặt...');
    try {
      await api.updateJamiPreferences({ voiceEnabled, soundEffects: checked });
      setSaveStatus('Đã lưu thay đổi.');
      showToast('Đã lưu cài đặt', checked ? 'Đã bật âm thanh hẹn giờ' : 'Đã tắt âm thanh hẹn giờ', 'success');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err: any) {
      // Rollback on failure
      setSoundEffects(previous);
      setSaveStatus('Lỗi: Không thể lưu cài đặt.');
      showToast('Không thể lưu cài đặt', err.message || 'Vui lòng kiểm tra kết nối mạng và thử lại.', 'error');
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `jami_data_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      window.URL.revokeObjectURL(url);

      setExported(true);
      confetti({ particleCount: 60, spread: 50 });
      setTimeout(() => setExported(false), 4000);
    } catch (err: any) {
      alert(err.message || 'Không thể xuất dữ liệu.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl">
        <h1 className="text-xl font-black text-[#F3FAF5] flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#22C55E]" />
          <span>Cài Đặt & Quyền Riêng Tư</span>
        </h1>
        <p className="text-xs text-[#A9B8AE] mt-0.5">
          Quản lý tài khoản, âm thanh AI Jami, quyền riêng tư dữ liệu và an toàn học sinh
        </p>
      </div>

      <div className="space-y-6">
        {/* Safety & Privacy Notice */}
        <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#22C55E]" />
            <span>Cam Kết An Toàn & Bảo Mật Học Sinh</span>
          </h2>

          <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] space-y-2">
            <div className="font-bold text-[#86EFAC]">Chính sách bảo mật cho học sinh:</div>
            <ul className="list-disc pl-4 space-y-1 text-[#A9B8AE]">
              <li>
                <strong className="text-[#F3FAF5]">Không lưu trữ âm thanh thô:</strong> Bản ghi âm giọng nói chỉ được chuyển thành văn bản tức thời và lập tức bị xóa khỏi bộ nhớ tạm.
              </li>
              <li>
                <strong className="text-[#F3FAF5]">Bảo vệ đáp án kiểm tra:</strong> Toàn bộ đáp án và lời giải được lưu trữ an toàn trên máy chủ, chỉ hiển thị sau khi học sinh bấm nộp bài.
              </li>
              <li>
                <strong className="text-[#F3FAF5]">Không chia sẻ dữ liệu:</strong> Dữ liệu học tập chỉ phục vụ cá nhân hóa cho học sinh và phụ huynh.
              </li>
            </ul>
          </div>
        </div>

        {/* AI & Audio Settings */}
        <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#22C55E]" />
              <span>Âm Thanh & Giọng Nói AI</span>
            </h2>
            <div aria-live="polite" className="text-[11px] text-[#22C55E]">
              {isSavingPrefs ? (
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Đang lưu...
                </span>
              ) : saveStatus ? (
                <span>{saveStatus}</span>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)]">
              <label htmlFor="setting-voice-enabled" className="cursor-pointer flex-1 mr-4">
                <div className="text-xs font-bold text-[#F3FAF5]">Giọng nói Jami (Tiếng Việt)</div>
                <div className="text-[11px] text-[#A9B8AE]">Cho phép Jami phát âm thanh phản hồi và cổ vũ</div>
              </label>
              <input
                id="setting-voice-enabled"
                type="checkbox"
                disabled={isSavingPrefs}
                checked={voiceEnabled}
                onChange={(e) => handleToggleVoice(e.target.checked)}
                className="w-5 h-5 accent-[#16A34A] rounded cursor-pointer disabled:opacity-50"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)]">
              <label htmlFor="setting-sound-effects" className="cursor-pointer flex-1 mr-4">
                <div className="text-xs font-bold text-[#F3FAF5]">Âm thanh chuông báo Hẹn giờ tập trung</div>
                <div className="text-[11px] text-[#A9B8AE]">Phát chuông nhẹ nhàng khi hết giờ học và giờ nghỉ</div>
              </label>
              <input
                id="setting-sound-effects"
                type="checkbox"
                disabled={isSavingPrefs}
                checked={soundEffects}
                onChange={(e) => handleToggleSound(e.target.checked)}
                className="w-5 h-5 accent-[#16A34A] rounded cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Data Export & Account */}
        <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
            <Download className="w-4 h-4 text-[#22C55E]" />
            <span>Quản Lý Dữ Liệu Học Tập</span>
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              {isExporting ? (
                <RefreshCw className="w-4 h-4 text-[#22C55E] animate-spin" />
              ) : exported ? (
                <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
              ) : (
                <Download className="w-4 h-4 text-[#22C55E]" />
              )}
              <span>
                {isExporting
                  ? 'Đang kết xuất dữ liệu...'
                  : exported
                  ? 'Đã tải xuống file jami_data_export.json'
                  : 'Xuất toàn bộ dữ liệu học tập (JSON)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
