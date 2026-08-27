import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { TopAppBar } from './TopAppBar';
import { TopModuleNav } from './TopModuleNav';
import { MobileTopMenu } from './MobileTopMenu';
import { RobotJami, JamiState } from '../jami/RobotJami';
import { VoiceGoalModal } from '../../features/planner/VoiceGoalModal';
import { useAuth } from '../../features/auth/AuthProvider';
import { VoiceJamiProvider, useVoiceJami } from '../../context/VoiceJamiContext';
import { NotificationProvider } from '../../context/NotificationContext';

const AppLayoutContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, logout } = useAuth();
  const voice = useVoiceJami();

  const [jamiState, setJamiState] = useState<JamiState>('idle');
  const [bubbleMessage, setBubbleMessage] = useState<string | undefined>('Chào bạn! Nói "Jami ơi" khi bạn cần hỗ trợ.');
  const [bubbleActions, setBubbleActions] = useState<string[]>(['Lịch học', 'Hẹn giờ tập trung']);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const studentName = user?.preferredName || user?.displayName || 'bạn';

  // Update default bubble message based on route if handsfree is not active
  useEffect(() => {
    if (!voice.isHandsFreeEnabled) {
      if (location.pathname.startsWith('/focus')) {
        setJamiState('focus');
        setBubbleMessage('Giữ tâm trí thư thái và tập trung nào!');
        setBubbleActions([]);
      } else if (location.pathname.startsWith('/tasks')) {
        setJamiState('guiding');
        setBubbleMessage('Jami đã chia nhỏ từng bước để bạn hoàn thành xuất sắc.');
        setBubbleActions(['Xem bước 1', 'Bắt đầu Hẹn giờ']);
      } else if (location.pathname.startsWith('/exams')) {
        setJamiState('encouraging');
        setBubbleMessage('Luyện tập đều đặn là bí quyết đạt điểm cao!');
        setBubbleActions(['Làm bài kiểm tra D-7']);
      } else {
        setJamiState('idle');
        setBubbleMessage(`Chào ${studentName}! Bạn cần Jami hỗ trợ lập lịch hay giải thích bài học nào?`);
        setBubbleActions(['Lịch học thông minh', 'Nói mục tiêu']);
      }
    }
  }, [location.pathname, studentName, voice.isHandsFreeEnabled]);

  const handleBubbleAction = (action: string) => {
    if (action.includes('Lịch')) navigate('/timetable');
    else if (action.includes('Hẹn giờ')) navigate('/focus');
    else if (action.includes('mục tiêu')) setIsVoiceModalOpen(true);
    else if (action.includes('kiểm tra')) navigate('/exams');
    else if (action.includes('bước 1')) navigate('/tasks');
  };

  const handleLogout = async () => {
    try {
      voice.disableHandsFree();
      await logout();
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#050806] text-[#F3FAF5] flex flex-col font-sans selection:bg-[#16A34A] selection:text-[#050806]">
      {/* 2-Tier Sticky Top Navigation */}
      <div className="sticky top-0 z-40 bg-[#050806] shadow-xl">
        {/* Tier 1: Brand, Hands-Free Voice Status, Voice CTA, Notifications, Profile */}
        <TopAppBar
          user={user || undefined}
          profile={profile || undefined}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          onLogout={handleLogout}
        />

        {/* Tier 2: 8 Strict Modules Horizontal Navigation */}
        <TopModuleNav />
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 p-3.5 sm:p-5 lg:p-7 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>

      {/* Floating Robot Jami Widget in Bottom-Right */}
      {!location.pathname.startsWith('/jami') && !location.pathname.startsWith('/focus') && (
        <div className="fixed bottom-6 right-4 sm:right-8 z-40">
          <RobotJami
            state={jamiState}
            size="md"
            bubbleMessage={bubbleMessage}
            bubbleActions={bubbleActions}
            onActionClick={handleBubbleAction}
            onClick={() => navigate('/jami')}
          />
        </div>
      )}

      {/* Mobile Top Menu Full Sheet */}
      <MobileTopMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        user={user || undefined}
        profile={profile || undefined}
        onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Voice Goal Input & Proposal Modal */}
      <VoiceGoalModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onProposalConfirmed={() => {
          setIsVoiceModalOpen(false);
          navigate('/timetable');
        }}
      />
    </div>
  );
};

export const AppLayout: React.FC = () => {
  return (
    <VoiceJamiProvider>
      <NotificationProvider>
        <AppLayoutContent />
      </NotificationProvider>
    </VoiceJamiProvider>
  );
};
