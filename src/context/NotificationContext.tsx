import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { NotificationItem, NotificationPreferences } from '../../shared/types';
import { api } from '../lib/api-client';

let audioContextSingleton: AudioContext | null = null;

export function playJamiNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextSingleton || audioContextSingleton.state === 'closed') {
      audioContextSingleton = new AudioContextClass();
    }

    const ctx = audioContextSingleton;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

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

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {}
    };

    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // Gracefully handle any browser audio policy or autoplay rejections
  }
}

import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  isExiting?: boolean;
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
  showToast: (title: string, message?: string, type?: 'info' | 'success' | 'warning' | 'error', durationMs?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isMountedRef = useRef<boolean>(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const activeFilterRef = useRef<{ type?: string; status?: string }>({});
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const toastExitTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevUnreadCountRef = useRef<number>(-1);

  // Mount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear all toast timers on unmount
      toastTimersRef.current.forEach((t) => clearTimeout(t));
      toastTimersRef.current.clear();
      toastExitTimersRef.current.forEach((t) => clearTimeout(t));
      toastExitTimersRef.current.clear();
    };
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.getUnreadNotificationCount();
      if (isMountedRef.current) {
        const newCount = Number(res.unreadCount || 0);
        if (prevUnreadCountRef.current !== -1 && newCount > prevUnreadCountRef.current) {
          if (preferences?.soundEnabled !== false) {
            playJamiNotificationSound();
          }
        }
        prevUnreadCountRef.current = newCount;
        setUnreadCount(newCount);
      }
    } catch {
      // Background count fetch failure handled silently
    }
  }, [preferences?.soundEnabled]);

  const fetchPreferences = useCallback(async () => {
    if (isMountedRef.current) setIsPreferencesLoading(true);
    try {
      const res = await api.getNotificationPreferences();
      if (isMountedRef.current && res?.preferences) {
        setPreferences(res.preferences);
      }
    } catch (err: any) {
      console.warn('[NotificationContext] Failed to fetch preferences, using cached/defaults:', err.message);
      if (isMountedRef.current) {
        setPreferences((prev) => prev || {
          userId: '',
          upcomingClass: true,
          upcomingExam: true,
          incompleteTask: true,
          soundEnabled: true,
          leadMinutes: 15,
          classLeadMinutes: 15,
          taskLeadMinutes: 30,
          examLeadDays: 1,
          quietHoursStart: '22:30',
          quietHoursEnd: '06:30',
          timezone: 'Asia/Ho_Chi_Minh',
          inAppEnabled: true,
          webPushEnabled: false,
        });
      }
    } finally {
      if (isMountedRef.current) {
        setIsPreferencesLoading(false);
      }
    }
  }, []);

  const fetchNotifications = useCallback(
    async (reset: boolean = true, filterType?: string, filterStatus?: string) => {
      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

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

        if (!isMountedRef.current) return;

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
        if (isMountedRef.current) {
          setError(err.message || 'Không thể tải danh sách thông báo.');
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [nextCursor]
  );

  const markAsRead = useCallback(async (id: string) => {
    if (!isMountedRef.current) return;
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'read' } : item))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await api.markNotificationRead(id);
      if (isMountedRef.current && typeof res.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark as read, rolling back:', err);
      if (isMountedRef.current) fetchNotifications(true);
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (!isMountedRef.current) return;
    setNotifications((prev) => prev.map((item) => ({ ...item, status: 'read' })));
    setUnreadCount(0);

    try {
      const res = await api.markAllNotificationsRead();
      if (isMountedRef.current && typeof res.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark all as read:', err);
      if (isMountedRef.current) fetchNotifications(true);
    }
  }, [fetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!isMountedRef.current) return;
    setNotifications((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await api.deleteNotification(id);
      if (isMountedRef.current && typeof res.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to delete notification:', err);
      if (isMountedRef.current) fetchNotifications(true);
    }
  }, [fetchNotifications]);

  const updatePreferences = useCallback(
    async (updates: Partial<NotificationPreferences>): Promise<boolean> => {
      const previous = preferences;
      if (previous && isMountedRef.current) {
        setPreferences({ ...previous, ...updates });
      }

      try {
        const res = await api.updateNotificationPreferences(updates);
        if (isMountedRef.current) {
          setPreferences(res.preferences);
        }
        return true;
      } catch (err: any) {
        if (isMountedRef.current) {
          if (previous) setPreferences(previous);
          setError(err.message || 'Không thể lưu cài đặt thông báo.');
        }
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

  // Window Focus Refetch & Backoff Polling with named handlers
  useEffect(() => {
    const handleFocus = () => {
      fetchUnreadCount();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Polling interval: 60s
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    }, 60000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(timer);
    };
  }, [fetchUnreadCount]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    if (!isMountedRef.current) return;
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );

    // Clear any previous exit timer for this toast
    if (toastExitTimersRef.current.has(id)) {
      clearTimeout(toastExitTimersRef.current.get(id)!);
    }

    const exitTimer = setTimeout(() => {
      if (isMountedRef.current) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }
      toastExitTimersRef.current.delete(id);
    }, 250);

    toastExitTimersRef.current.set(id, exitTimer);
  }, []);

  const showToast = useCallback(
    (
      title: string,
      message?: string,
      type: 'info' | 'success' | 'warning' | 'error' = 'info',
      durationMs: number = 4000
    ) => {
      if (!isMountedRef.current) return;
      const id = 'toast_' + Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, title, message, type };

      setToasts((prev) => [...prev.slice(-4), newToast]); // Keep at most 5 toasts

      const timer = setTimeout(() => {
        dismissToast(id);
        toastTimersRef.current.delete(id);
      }, durationMs);

      toastTimersRef.current.set(id, timer);
    },
    [dismissToast]
  );

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
        showToast,
      }}
    >
      {children}

      {/* PlayStation-Inspired In-App Toast Container */}
      <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const typeStyles = {
            success: {
              border: 'border-[#22C55E]/40',
              bg: 'bg-[#0B120D]/95',
              icon: CheckCircle2,
              iconColor: 'text-[#22C55E]',
            },
            error: {
              border: 'border-rose-500/40',
              bg: 'bg-[#150a0c]/95',
              icon: AlertCircle,
              iconColor: 'text-rose-400',
            },
            warning: {
              border: 'border-amber-500/40',
              bg: 'bg-[#161005]/95',
              icon: AlertCircle,
              iconColor: 'text-amber-400',
            },
            info: {
              border: 'border-[#16A34A]/30',
              bg: 'bg-[#0B120D]/95',
              icon: Info,
              iconColor: 'text-[#86EFAC]',
            },
          }[toast.type || 'info'];

          const IconComp = typeStyles.icon;

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border ${typeStyles.border} ${typeStyles.bg} backdrop-blur-xl shadow-2xl transition-all ${
                toast.isExiting ? 'jami-toast-exit' : 'jami-toast-enter'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                <IconComp className={`w-4 h-4 ${typeStyles.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-[#F3FAF5] leading-tight">{toast.title}</h4>
                {toast.message && (
                  <p className="text-[11px] text-[#A9B8AE] mt-0.5 leading-snug">{toast.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 p-1 text-[#A9B8AE] hover:text-[#F3FAF5] rounded cursor-pointer"
                title="Đóng thông báo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
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
      showToast: () => {},
    };
  }
  return context;
};
