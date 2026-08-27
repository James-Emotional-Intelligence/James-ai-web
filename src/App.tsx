import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { RequireAuth } from './features/auth/RequireAuth';
import { GuestOnlyRoute } from './features/auth/GuestOnlyRoute';
import { AppLayout } from './components/layout/AppLayout';
import { RefreshCw } from 'lucide-react';

// Lazy loaded page components for optimal bundle size
const LandingPage = lazy(() => import('./features/landing/LandingPage').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./features/auth/SignupPage').then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const TodayDashboard = lazy(() => import('./features/today/TodayDashboard').then((m) => ({ default: m.TodayDashboard })));
const TimetablePage = lazy(() => import('./features/timetable/TimetablePage').then((m) => ({ default: m.TimetablePage })));
const TasksPage = lazy(() => import('./features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const TaskDetailPage = lazy(() => import('./features/tasks/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })));
const FocusTimerPage = lazy(() => import('./features/focus/FocusTimerPage').then((m) => ({ default: m.FocusTimerPage })));
const JamiAssistantPage = lazy(() => import('./features/jami/JamiAssistantPage').then((m) => ({ default: m.JamiAssistantPage })));
const ExamsPage = lazy(() => import('./features/exams/ExamsPage').then((m) => ({ default: m.ExamsPage })));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const MaterialsPage = lazy(() => import('./features/materials/MaterialsPage').then((m) => ({ default: m.MaterialsPage })));
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const OnboardingPage = lazy(() => import('./features/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));

const PageLoader = () => (
  <div className="min-h-screen bg-[#050806] flex items-center justify-center text-[#86EFAC] text-xs gap-2">
    <RefreshCw className="w-5 h-5 text-[#22C55E] animate-spin" />
    <span>Đang tải JAMI AI...</span>
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Landing Page */}
            <Route path="/" element={<LandingPage />} />

            {/* Guest-Only Authentication Pages */}
            <Route
              path="/login"
              element={
                <GuestOnlyRoute>
                  <LoginPage />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <GuestOnlyRoute>
                  <SignupPage />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <GuestOnlyRoute>
                  <ForgotPasswordPage />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/reset-password"
              element={
                <GuestOnlyRoute>
                  <ResetPasswordPage />
                </GuestOnlyRoute>
              }
            />
            <Route path="/auth" element={<Navigate to="/login" replace />} />

            {/* Protected Onboarding */}
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <OnboardingPage />
                </RequireAuth>
              }
            />

            {/* Protected Core Application Shell (8 Modules) */}
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/today" element={<TodayDashboard />} />
              <Route path="/timetable" element={<TimetablePage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />
              <Route path="/focus" element={<FocusTimerPage />} />
              <Route path="/jami" element={<JamiAssistantPage />} />
              <Route path="/exams" element={<ExamsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all redirect to Landing or Today */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
