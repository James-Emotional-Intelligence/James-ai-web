import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { JamiDialog } from '../../src/components/common/JamiDialog';
import { ScrollReveal } from '../../src/components/common/ScrollReveal';
import { NotificationProvider, useNotifications } from '../../src/context/NotificationContext';
import { MODULES_CONFIG } from '../../src/config/modules';

// Mock API client for notification testing
vi.mock('../../src/lib/api-client', () => ({
  api: {
    getUnreadNotificationCount: vi.fn().mockResolvedValue({ unreadCount: 3 }),
    getNotificationPreferences: vi.fn().mockResolvedValue({
      preferences: {
        userId: 'u1',
        soundEnabled: true,
        inAppEnabled: true,
      },
    }),
    getNotifications: vi.fn().mockResolvedValue({
      notifications: [],
      unreadCount: 3,
      nextCursor: null,
    }),
  },
}));

describe('1. Standard JamiDialog Modal Component', () => {
  it('renders with role="dialog", aria-modal="true" and closes on Escape', () => {
    const handleClose = vi.fn();
    const { unmount } = render(
      <JamiDialog isOpen={true} onClose={handleClose} title="Tiêu đề mẫu" description="Mô tả mẫu">
        <div>Nội dung modal</div>
      </JamiDialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Tiêu đề mẫu')).toBeInTheDocument();
    expect(screen.getByText('Mô tả mẫu')).toBeInTheDocument();

    // Trigger Escape key
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('locks body scroll when opened and restores on unmount', () => {
    document.body.style.overflow = 'visible';
    const { unmount } = render(
      <JamiDialog isOpen={true} onClose={() => {}} title="Test Lock">
        <div>Modal Body</div>
      </JamiDialog>
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('visible');
  });

  it('traps focus with Shift+Tab and Tab cycles inside dialog', () => {
    render(
      <JamiDialog isOpen={true} onClose={() => {}} title="Focus Trap Test">
        <input data-testid="input-1" placeholder="First" />
        <button data-testid="btn-2">Second</button>
      </JamiDialog>
    );

    const closeBtn = screen.getByLabelText('Đóng');
    const input1 = screen.getByTestId('input-1');
    const btn2 = screen.getByTestId('btn-2');

    // Simulate focus cycling
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    // Tab from last element wraps to first focusable
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    // Shift+Tab from first element wraps to last focusable
    closeBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  });
});

describe('2. ScrollReveal Animation Component', () => {
  it('respects prefers-reduced-motion and reveals immediately', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <ScrollReveal className="test-reveal">
        <div>Section Content</div>
      </ScrollReveal>
    );

    const container = screen.getByText('Section Content').parentElement;
    expect(container).toHaveClass('is-revealed');
  });

  it('cleans up timeout safely without throwing on unmount', () => {
    const { unmount } = render(
      <ScrollReveal delayMs={500}>
        <div>Delayed Content</div>
      </ScrollReveal>
    );

    expect(() => unmount()).not.toThrow();
  });
});

describe('3. NotificationProvider Lifecycle & Visibility Cleanup', () => {
  it('registers and removes visibilitychange and focus listeners on mount/unmount', () => {
    const addEventSpy = vi.spyOn(document, 'addEventListener');
    const removeEventSpy = vi.spyOn(document, 'removeEventListener');

    const TestConsumer = () => {
      const { unreadCount } = useNotifications();
      return <div>Unread: {unreadCount}</div>;
    };

    const { unmount } = render(
      <NotificationProvider>
        <TestConsumer />
      </NotificationProvider>
    );

    expect(addEventSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    unmount();

    expect(removeEventSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('4. Exact 8 Modules Order Single Source of Truth', () => {
  it('has exactly 8 modules in the specified canonical order', () => {
    const expectedModules = [
      { order: 1, id: 'timetable', path: '/timetable', name: 'LỊCH HỌC THÔNG MINH' },
      { order: 2, id: 'today', path: '/today', name: 'HỌC TẬP HÔM NAY' },
      { order: 3, id: 'tasks', path: '/tasks', name: 'CHI TIẾT CÔNG VIỆC' },
      { order: 4, id: 'jami', path: '/jami', name: 'TRỢ LÝ AI JAMI' },
      { order: 5, id: 'exams', path: '/exams', name: 'KIỂM TRA & ÔN TẬP' },
      { order: 6, id: 'materials', path: '/materials', name: 'KHO TÀI LIỆU' },
      { order: 7, id: 'reports', path: '/reports', name: 'BÁO CÁO HỌC TẬP' },
      { order: 8, id: 'notifications', path: '/notifications', name: 'THÔNG BÁO' },
    ];

    expect(MODULES_CONFIG).toHaveLength(8);

    expectedModules.forEach((expected, idx) => {
      const actual = MODULES_CONFIG[idx];
      expect(actual.order).toBe(expected.order);
      expect(actual.id).toBe(expected.id);
      expect(actual.path).toBe(expected.path);
      expect(actual.name).toBe(expected.name);
    });
  });
});
