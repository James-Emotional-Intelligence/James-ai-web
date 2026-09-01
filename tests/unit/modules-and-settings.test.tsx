import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPage } from '../../src/features/settings/SettingsPage';
import { NotificationProvider } from '../../src/context/NotificationContext';
import { api } from '../../src/lib/api-client';

vi.mock('../../src/lib/api-client', () => ({
  api: {
    getJamiPreferences: vi.fn().mockResolvedValue({
      preferences: {
        voiceEnabled: true,
        soundEffects: true,
      },
    }),
    updateJamiPreferences: vi.fn(),
    exportMyData: vi.fn(),
    getUnreadNotificationCount: vi.fn().mockResolvedValue({ unreadCount: 0 }),
    getNotificationPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
  },
}));

describe('SettingsPage Rollback & Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls back checkbox state when api update fails', async () => {
    (api.updateJamiPreferences as any).mockRejectedValueOnce(new Error('Network offline'));

    render(
      <NotificationProvider>
        <SettingsPage />
      </NotificationProvider>
    );

    const voiceCheckbox = (await screen.findByLabelText(/Giọng nói Jami/i)) as HTMLInputElement;
    expect(voiceCheckbox.checked).toBe(true);

    // Toggle off
    fireEvent.click(voiceCheckbox);

    // After failure, it should rollback to checked = true
    await waitFor(() => {
      expect(voiceCheckbox.checked).toBe(true);
    });

    expect(screen.getByText(/Lỗi: Không thể lưu cài đặt/i)).toBeInTheDocument();
  });
});
