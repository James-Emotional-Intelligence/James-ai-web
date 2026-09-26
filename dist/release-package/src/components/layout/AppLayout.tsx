import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { TopAppBar } from './TopAppBar';
import { TopModuleNav } from './TopModuleNav';
import { MobileTopMenu } from './MobileTopMenu';
import { RobotJami, JamiState } from '../jami/RobotJami';
import { JamiFloatingRobotStage } from '../jami/floating/JamiFloatingRobotStage';
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
        setBubbleMessage('Giữ tâm trí thư thái và tập trung học tập nào!');
        setBubbleActions([]);
      } else if (location.pathname.startsWith('/tasks')) {
        setJamiState('guiding');
        setBubbleMessage('Chọn bài tập để bắt đầu hoặc tạo nhiệm vụ mới nhé.');
        setBubbleActions(['Hẹn giờ tập trung', 'Lịch học']);
      } else if (location.pathname.startsWith('/exams')) {
        setJamiState('encouraging');
        setBubbleMessage('Luyện tập đều đặn là bí quyết ghi nhớ kiến thức tốt nhất!');
        setBubbleActions(['Tạo đề ôn tập', 'Lịch học']);
      } else if (location.pathname.startsWith('/materials')) {
        setJamiState('guiding');
        setBubbleMessage('Bạn có thể tải đề cương hoặc tài liệu để tạo câu hỏi ôn tập.');
        setBubbleActions(['Kiểm tra & Ôn tập', 'Nhiệm vụ']);
      } else {
        setJamiState('idle');
        setBubbleMessage(`Chào ${studentName}! Bạn cần Jami hỗ trợ gì hôm nay?`);
        setBubbleActions(['Lịch học', 'Hẹn giờ tập trung']);
      }
    }
  }, [location.pathname, studentName, voice.isHandsFreeEnabled]);

  const handleBubbleAction = (action: string) => {
    if (action.includes('Lịch')) navigate('/timetable');
    else if (action.includes('Hẹn giờ') || action.includes('Tập trung')) navigate('/focus');
    else if (action.includes('mục tiêu')) setIsVoiceModalOpen(true);
    else if (action.includes('ôn tập') || action.includes('Kiểm tra')) navigate('/exams');
    else if (action.includes('Nhiệm vụ') || action.includes('bài tập')) navigate('/tasks');
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
      {/* Skip to Main Content Link for Keyboard Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:bg-[#16A34A] focus:text-[#050806] focus:font-black focus:rounded-xl focus:shadow-2xl focus:outline-none"
      >
        Bỏ qua đến nội dung chính
      </a>

      {/* Unified 2-Tier Sticky Top Navigation with Pixel-Perfect Grid Alignment */}
      <TopAppBar
        user={user || undefined}
        profile={profile || undefined}
        onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
        onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Viewport: Rộng rãi cho toàn bộ các trang và tính năng với hiệu ứng chuyển trang PlayStation-inspired */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 p-3.5 sm:p-5 lg:p-6 w-full max-w-[1750px] mx-auto px-3 sm:px-6 lg:px-8 transition-all overflow-x-hidden focus:outline-none"
      >
        <div key={location.pathname} className="jami-page-transition w-full">
          <Outlet />
        </div>
      </main>

      {/* Floating Draggable Robot Jami Widget */}
      {!location.pathname.startsWith('/jami') && !location.pathname.startsWith('/focus') && (
        <JamiFloatingRobotStage robotWidth={148} robotHeight={214}>
          {({ isDragging, dragVelocityX, dragVelocityY }) => (
            <RobotJami
              state={jamiState}
              size="md"
              bubbleMessage={bubbleMessage}
              bubbleActions={bubbleActions}
              onActionClick={handleBubbleAction}
              onClick={() => navigate('/jami')}
              isDragging={isDragging}
              dragVelocityX={dragVelocityX}
              dragVelocityY={dragVelocityY}
            />
          )}
        </JamiFloatingRobotStage>
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
