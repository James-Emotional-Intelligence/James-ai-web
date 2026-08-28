import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { NotificationItem, NotificationPreferences } from '../../shared/types';
import { api } from '../lib/api-client';

export function playJamiNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.1); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.2); // D6

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch {}
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  isPreferencesLoading: boolean;
  error: string | null;
  hasMore: boolean;
  fetchNotifications: (reset?: boolean, filterType?: string, filterStatus?: string) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  fetchPreferences: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<boolean>;
  playNotificationSound: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const activeFilterRef = useRef<{ type?: string; status?: string }>({});

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.getUnreadNotificationCount();
      setUnreadCount(res.unreadCount);
    } catch {
      // Background count fetch failure handled silently
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    setIsPreferencesLoading(true);
    try {
      const res = await api.getNotificationPreferences();
      setPreferences(res.preferences);
    } catch (err: any) {
      console.warn('[NotificationContext] Failed to fetch preferences:', err.message);
    } finally {
      setIsPreferencesLoading(false);
    }
  }, []);

  const fetchNotifications = useCallback(
    async (reset: boolean = true, filterType?: string, filterStatus?: string) => {
      setIsLoading(true);
      setError(null);

      if (filterType !== undefined) activeFilterRef.current.type = filterType;
      if (filterStatus !== undefined) activeFilterRef.current.status = filterStatus;

      const cursor = reset ? undefined : nextCursor;

      try {
        const res = await api.getNotifications({
          type: activeFilterRef.current.type === 'all' ? undefined : activeFilterRef.current.type,
          status: activeFilterRef.current.status === 'all' ? undefined : activeFilterRef.current.status,
          cursor,
          limit: 20,
        });

        if (reset) {
          setNotifications(res.notifications);
        } else {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const newItems = res.notifications.filter((n) => !existingIds.has(n.id));
            return [...prev, ...newItems];
          });
        }

        setUnreadCount(res.unreadCount);
        setNextCursor(res.nextCursor);
        setHasMore(Boolean(res.nextCursor));
      } catch (err: any) {
        setError(err.message || 'Không thể tải danh sách thông báo.');
      } finally {
        setIsLoading(false);
      }
    },
    [nextCursor]
  );

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update with functional state
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'read' } : item))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await api.markNotificationRead(id);
      if (typeof res.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      // Rollback on network failure
      console.warn('[NotificationContext] Failed to mark as read, rolling back:', err);
      fetchNotifications(true);
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((item) => ({ ...item, status: 'read' })));
    setUnreadCount(0);

    try {
      const res = await api.markAllNotificationsRead();
      if (typeof res.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark all as read:', err);
      fetchNotifications(true);
    }
  }, [fetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    // Optimistic delete
    setNotifications((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await api.deleteNotification(id);
      if (typeof res.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to delete notification:', err);
      fetchNotifications(true);
    }
  }, [fetchNotifications]);

  const updatePreferences = useCallback(
    async (updates: Partial<NotificationPreferences>): Promise<boolean> => {
      const previous = preferences;
      if (previous) {
        setPreferences({ ...previous, ...updates });
      }

      try {
        const res = await api.updateNotificationPreferences(updates);
        setPreferences(res.preferences);
        return true;
      } catch (err: any) {
        // Rollback
        if (previous) setPreferences(previous);
        setError(err.message || 'Không thể lưu cài đặt thông báo.');
        return false;
      }
    },
    [preferences]
  );

  // Initial load
  useEffect(() => {
    fetchUnreadCount();
    fetchPreferences();
  }, [fetchUnreadCount, fetchPreferences]);

  // Window Focus Refetch & Backoff Polling
  useEffect(() => {
    const handleFocus = () => {
      fetchUnreadCount();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    });

    // Polling interval: 60s
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    }, 60000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(timer);
    };
  }, [fetchUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        preferences,
        isLoading,
        isPreferencesLoading,
        error,
        hasMore,
        fetchNotifications,
        fetchUnreadCount,
        fetchPreferences,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        updatePreferences,
        playNotificationSound: playJamiNotificationSound,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    // Fallback safe default
    return {
      notifications: [],
      unreadCount: 0,
      preferences: null,
      isLoading: false,
      isPreferencesLoading: false,
      error: null,
      hasMore: false,
      fetchNotifications: async () => {},
      fetchUnreadCount: async () => {},
      fetchPreferences: async () => {},
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      deleteNotification: async () => {},
      updatePreferences: async () => false,
      playNotificationSound: () => {},
    };
  }
  return context;
};
