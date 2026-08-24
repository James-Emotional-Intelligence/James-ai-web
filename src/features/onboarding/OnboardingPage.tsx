import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Sparkles,
  GraduationCap,
  Target,
  BookOpen,
  Clock,
  ArrowRight,
  CheckCircle2,
  Bot,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import confetti from 'canvas-confetti';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [grade, setGrade] = useState(9);
  const [curriculum, setCurriculum] = useState('gdpt_2018');
  const [targetGoal, setTargetGoal] = useState('Thi đỗ vào lớp 10 Chuyên Toán / THPT Top 1');
  const [weakSubjects, setWeakSubjects] = useState<string[]>(['Toán học']);
  const [preferredName, setPreferredName] = useState('Minh');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subjectsList = ['Toán học', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử & Địa lý'];

  const toggleSubject = (s: string) => {
    if (weakSubjects.includes(s)) {
      setWeakSubjects(weakSubjects.filter((item) => item !== s));
    } else {
      setWeakSubjects([...weakSubjects, s]);
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      await api.updateProfile({
        gradeLevel: grade,
        goals: [targetGoal],
      });
      confetti({ particleCount: 100, spread: 70 });
      navigate('/today');
    } catch (err) {
      console.error(err);
      navigate('/today');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/40 to-blue-50/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black text-xl shadow-md">
            J
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800">Thiết Lập Hồ Sơ Học Sinh Cùng Jami</h1>
            <p className="text-xs text-slate-500">Bước {step}/3: Cá nhân hóa lộ trình học theo chuẩn GDPT 2018</p>
          </div>
        </div>

        {/* Step 1: Grade & Curriculum */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Em đang học khối lớp nào?
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(g)}
                    className={`py-3 rounded-2xl text-xs font-black border transition-all ${
                      grade === g
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Lớp {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Tên thân mật em muốn Jami gọi:
              </label>
              <input
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                placeholder="Ví dụ: Minh, Hà, Bống..."
                className="w-full text-xs sm:text-sm p-3.5 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                <span>Tiếp theo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Weak Subjects */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Các môn học em muốn Jami tập trung hỗ trợ nhiều nhất:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {subjectsList.map((s) => {
                  const isChecked = weakSubjects.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSubject(s)}
                      className={`p-3 rounded-2xl text-left text-xs font-bold border transition-all flex items-center justify-between ${
                        isChecked
                          ? 'bg-cyan-50 border-cyan-400 text-cyan-900 ring-2 ring-cyan-200'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{s}</span>
                      {isChecked && <CheckCircle2 className="w-4 h-4 text-cyan-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Quay lại
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                <span>Tiếp theo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Target Goal & Complete */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Mục tiêu học tập lớn nhất của em trong kỳ này:
              </label>
              <input
                type="text"
                value={targetGoal}
                onChange={(e) => setTargetGoal(e.target.value)}
                placeholder="Ví dụ: Đạt điểm 9 môn Toán, thi đỗ lớp 10 trường Chuyên..."
                className="w-full text-xs sm:text-sm p-3.5 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
              />
            </div>

            <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-200 text-xs text-cyan-900 leading-relaxed flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
              <div>
                <strong>Jami đã sẵn sàng đồng hành: </strong>
                Lịch học thông minh và các bài tập chia nhỏ sẽ được tự động đồng bộ theo thời khóa biểu của em.
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Quay lại
              </button>
              <button
                onClick={handleFinish}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Hoàn tất & Khám phá JAMI AI</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
