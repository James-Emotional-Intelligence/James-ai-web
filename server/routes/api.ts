import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { UserRepository } from '../repositories/user-repository';
import { AuthService } from '../services/auth-service';
import { AiAdapter } from '../services/ai-adapter';
import { DeterministicScheduler } from '../services/scheduler';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  SchoolTimetableInputSchema,
  TimetableEntryInputSchema,
  BusyEventInputSchema,
  AvailabilityRuleInputSchema,
  ReplanPreviewRequestSchema,
  ProposalConfirmRequestSchema,
  NotificationPreferencesUpdateSchema,
  NotificationFilterQuerySchema,
  MaterialUploadIntentSchema,
  MaterialFinalizeSchema,
  MaterialNoteCreateSchema,
  MaterialQuizGenerateSchema,
  ReportOverviewQuerySchema,
  ExamCreateSchema,
  ExamUpdateSchema,
  ExamQuizGenerateSchema,
  QuizAttemptSubmitSchema,
  JamiChatRequestSchema,
  JamiConversationCreateSchema,
  JamiConversationUpdateSchema,
  JamiMessageConfirmSchema,
  FocusSessionStartSchema,
  FocusSessionActionSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
  ExecutionGuideGenerateSchema,
  ChecklistItemUpdateSchema,
  StepActionSchema,
  TaskEvidenceSubmitSchema,
} from '../../shared/schemas';
import { env, isProduction, isProductionRuntime, isDatabaseRequired, isDemoMode } from '../config/env';
import { createRateLimiter } from '../middleware/rate-limit';
import { z } from 'zod';
import { StudyTask, StudentProfile } from '../../shared/types';
import {
  EmailAlreadyExistsError,
  DatabaseUnavailableError,
  DbSchemaIncompatibleError,
} from '../errors/app-errors';

import { subjectRepo } from '../repositories/subject-repository';
import { timetableRepo } from '../repositories/timetable-repository';
import { taskRepo } from '../repositories/task-repository';
import { focusRepo } from '../repositories/focus-repository';
import { examRepo } from '../repositories/exam-repository';
import { quizRepo } from '../repositories/quiz-repository';
import { materialRepo } from '../repositories/material-repository';
import { reportRepo } from '../repositories/report-repository';
import { notificationRepo } from '../repositories/notification-repository';
import { jamiRepo } from '../repositories/jami-repository';
import { plannerRepo } from '../repositories/planner-repository';
import { runDbDoctor } from '../db/doctor';
import { Migrator } from '../db/migrator';
import { voiceSessionService } from '../services/voice-session-service';
import { jamiActionService } from '../services/jami-action-service';
import { notificationScheduler } from '../services/notification-scheduler-service';
import { storageService, validateMagicBytes } from '../services/storage-service';
import { materialProcessor } from '../services/material-processor';

export const apiRouter = Router();
const userRepo = UserRepository.getInstance();
const authService = AuthService.getInstance();

// Async route wrapper to prevent unhandled rejections
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Session Extraction Helper (Strict HttpOnly Cookie ONLY)
function getSessionToken(req: Request): string | undefined {
  return req.cookies?.jami_session;
}

// Standard JSON error response helper
function sendError(req: Request, res: Response, status: number, code: string, message: string, details?: any) {
  const requestId = (req as any).requestId || 'req_' + crypto.randomUUID().substring(0, 16);
  return res.status(status).json({
    error: {
      code,
      message,
      requestId,
      ...(details ? { details } : {}),
    },
    message,
  });
}

// Auth Middleware
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return sendError(req, res, 401, 'UNAUTHORIZED', 'Chưa xác thực đăng nhập');
  }

  const session = await authService.getSession(sessionToken);
  if (!session) {
    authService.clearAuthCookie(res);
    return sendError(req, res, 401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ');
  }

  const user = await userRepo.findById(session.userId);
  if (!user || user.status !== 'active') {
    authService.clearAuthCookie(res);
    return sendError(req, res, 401, 'USER_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
  }

  (req as any).user = user;
  (req as any).userId = user.id;
  (req as any).session = session;
  next();
}

// Admin Protection Middleware (Timing safe ADMIN_SECRET_KEY check)
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminKey = req.headers['x-admin-key'];
  if (!env.ADMIN_SECRET_KEY || !adminKey || typeof adminKey !== 'string') {
    return sendError(req, res, 403, 'FORBIDDEN', 'Yêu cầu quyền quản trị viên');
  }

  try {
    const keyBuf = Buffer.from(adminKey);
    const expectedBuf = Buffer.from(env.ADMIN_SECRET_KEY);
    if (keyBuf.length === expectedBuf.length && crypto.timingSafeEqual(keyBuf, expectedBuf)) {
      return next();
    }
  } catch {}

  return sendError(req, res, 403, 'FORBIDDEN', 'Yêu cầu quyền quản trị viên');
}

// Rate limiters
const authRateLimiter = createRateLimiter(60 * 1000, 5, 'auth_limit');

// ==========================================
// Health & Diagnostic Routes
// ==========================================

apiRouter.get('/health/live', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.get('/health/ready', asyncHandler(async (req: Request, res: Response) => {
  const doctor = await runDbDoctor();
  const isHealthy = doctor.status === 'healthy';

  if (!isHealthy) {
    return res.status(503).json({
      status: 'unhealthy',
      database: doctor.status,
      details: doctor,
    });
  }

  res.json({
    status: 'ready',
    mode: AiAdapter.isConfigured() ? 'production_openai' : 'demo_mode',
    database: doctor.status,
    details: doctor,
  });
}));

apiRouter.get('/admin/db-doctor', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const report = await runDbDoctor();
  res.json(report);
}));

apiRouter.post('/admin/db-migrate', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await Migrator.run();
    res.json({ success: true, ...result });
  } catch (err: any) {
    sendError(req, res, 500, 'MIGRATION_ERROR', err.message);
  }
}));

// ==========================================
// Authentication & User Identity Routes
// ==========================================

/**
 * Bootstrap Session Endpoint
 * Safe unauthenticated bootstrap without triggering noisy 401 console errors.
 * Returns 200 { authenticated: false, demoLoginEnabled } for unauthenticated visits.
 */
apiRouter.get('/auth/session', asyncHandler(async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const demoLoginEnabled = Boolean(env.DEMO_LOGIN_ENABLED && !isProductionRuntime);
  const sessionToken = getSessionToken(req);

  if (!sessionToken) {
    return res.status(200).json({
      authenticated: false,
      demoLoginEnabled,
    });
  }

  let session;
  try {
    session = await authService.getSession(sessionToken);
  } catch (err: any) {
    if (isDatabaseRequired || isProductionRuntime) {
      return sendError(req, res, 503, 'DATABASE_UNAVAILABLE', 'Cơ sở dữ liệu đang tạm gián đoạn. Vui lòng thử lại sau.');
    }
    authService.clearAuthCookie(res);
    return res.status(200).json({
      authenticated: false,
      demoLoginEnabled,
    });
  }

  if (!session) {
    authService.clearAuthCookie(res);
    return res.status(200).json({
      authenticated: false,
      demoLoginEnabled,
    });
  }

  let user;
  try {
    user = await userRepo.findById(session.userId);
  } catch (err: any) {
    if (isDatabaseRequired || isProductionRuntime) {
      return sendError(req, res, 503, 'DATABASE_UNAVAILABLE', 'Cơ sở dữ liệu đang tạm gián đoạn. Vui lòng thử lại sau.');
    }
  }

  if (!user || user.status !== 'active') {
    authService.clearAuthCookie(res);
    return res.status(200).json({
      authenticated: false,
      demoLoginEnabled,
    });
  }

  const profile = await userRepo.getProfile(user.id);
  const { passwordHash, passwordSalt, passwordScheme, ...safeUser } = user;

  return res.status(200).json({
    authenticated: true,
    user: safeUser,
    profile,
    isDemo: Boolean(session.isDemo),
    demoLoginEnabled,
  });
}));

apiRouter.get('/me', asyncHandler(async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return sendError(req, res, 401, 'UNAUTHORIZED', 'Chưa đăng nhập');
  }

  const session = await authService.getSession(sessionToken);
  if (!session) {
    authService.clearAuthCookie(res);
    return sendError(req, res, 401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn');
  }

  const user = await userRepo.findById(session.userId);
  if (!user || user.status !== 'active') {
    authService.clearAuthCookie(res);
    return sendError(req, res, 401, 'USER_NOT_FOUND', 'Người dùng không tồn tại hoặc đã bị khóa');
  }

  const profile = await userRepo.getProfile(user.id);
  const { passwordHash, passwordSalt, passwordScheme, ...safeUser } = user;

  res.json({
    user: safeUser,
    profile,
    isDemo: Boolean(session.isDemo),
  });
}));

apiRouter.post('/auth/login', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const parseResult = LoginRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const { email, password, rememberMe } = parseResult.data;
  let user;
  try {
    user = await userRepo.findByEmail(email);
  } catch (dbErr: any) {
    if (isProductionRuntime || isDatabaseRequired) {
      return sendError(req, res, 503, 'DATABASE_UNAVAILABLE', 'Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.');
    }
  }

  if (!user) {
    return sendError(req, res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác');
  }

  const { isValid, needsRehash } = await userRepo.verifyPassword(
    password,
    user.passwordSalt,
    user.passwordHash,
    user.passwordScheme
  );

  if (!isValid) {
    return sendError(req, res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác');
  }

  if (user.status !== 'active') {
    return sendError(req, res, 403, 'ACCOUNT_INACTIVE', 'Tài khoản của bạn đã bị khóa hoặc chưa kích hoạt');
  }

  // Automatic password rehash upgrade if legacy hash format was detected
  if (needsRehash) {
    try {
      await userRepo.rehashUserPassword(user.id, password);
    } catch (err: any) {
      console.warn('[JAMI Auth] Background password rehash warning:', err.message);
    }
  }

  let sessionToken: string;
  try {
    sessionToken = await authService.createSession(user.id, false, Boolean(rememberMe));
  } catch (sessErr: any) {
    if (isProductionRuntime || isDatabaseRequired) {
      return sendError(req, res, 503, 'DATABASE_UNAVAILABLE', 'Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.');
    }
    return sendError(req, res, 500, 'SESSION_CREATE_FAILED', 'Không thể tạo phiên đăng nhập. Vui lòng thử lại.');
  }

  authService.setAuthCookie(res, sessionToken, Boolean(rememberMe));

  const profile = await userRepo.getProfile(user.id);
  const { passwordHash, passwordSalt, passwordScheme, ...safeUser } = user;

  res.json({
    user: safeUser,
    profile,
    isDemo: false,
    message: 'Đăng nhập thành công',
  });
}));

apiRouter.post('/auth/demo-login', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  if (isProductionRuntime || !env.DEMO_LOGIN_ENABLED) {
    return sendError(req, res, 403, 'DEMO_DISABLED', 'Tài khoản demo đã bị vô hiệu hóa trên môi trường này.');
  }

  let demoUser = await userRepo.findByEmail('minh.hocsinh@jami.edu.vn');
  if (!demoUser) {
    demoUser = await userRepo.findById('usr_student_demo_01');
  }

  if (!demoUser) {
    return sendError(req, res, 500, 'DEMO_USER_MISSING', 'Không tìm thấy tài khoản demo');
  }

  const sessionToken = await authService.createSession(demoUser.id, true, true);
  authService.setAuthCookie(res, sessionToken, true);

  const profile = await userRepo.getProfile(demoUser.id);
  const { passwordHash, passwordSalt, passwordScheme, ...safeUser } = demoUser;

  res.json({
    user: safeUser,
    profile,
    isDemo: true,
    message: 'Đăng nhập tài khoản Demo thành công',
  });
}));

apiRouter.post('/auth/register', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const parseResult = RegisterRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    const errorMsg = issue?.message || 'Dữ liệu đăng ký không hợp lệ';
    return sendError(req, res, 400, 'VALIDATION_ERROR', errorMsg);
  }

  const { email, password, displayName, preferredName, gradeLevel } = parseResult.data;
  const userAgent = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket?.remoteAddress;

  try {
    const { user, profile, rawToken } = await authService.registerAtomic({
      email,
      password,
      displayName,
      preferredName: preferredName || undefined,
      gradeLevel: Number(gradeLevel) || 9,
      userAgent,
      ipAddress,
    });

    authService.setAuthCookie(res, rawToken, true);

    res.status(201).json({
      user,
      profile,
      isDemo: false,
      message: 'Tạo tài khoản thành công',
    });
  } catch (err: any) {
    if (err instanceof EmailAlreadyExistsError || err.code === 'EMAIL_ALREADY_EXISTS' || err.message?.includes('đã được đăng ký')) {
      return sendError(req, res, 409, 'EMAIL_ALREADY_EXISTS', 'Email này đã được đăng ký. Vui lòng chuyển sang trang Đăng nhập.');
    }
    if (
      err instanceof DatabaseUnavailableError ||
      err instanceof DbSchemaIncompatibleError ||
      err.code === 'DATABASE_UNAVAILABLE' ||
      err.code === 'DB_SCHEMA_INCOMPATIBLE' ||
      err.message?.includes('không khả dụng') ||
      err.message?.includes('tạm gián đoạn')
    ) {
      return sendError(req, res, 503, 'DATABASE_UNAVAILABLE', 'Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.');
    }
    sendError(req, res, 400, 'REGISTRATION_FAILED', err.message || 'Đăng ký thất bại');
  }
}));

apiRouter.post('/auth/logout', asyncHandler(async (req: Request, res: Response) => {
  const sessionToken = getSessionToken(req);
  if (sessionToken) {
    try {
      await authService.revokeSession(sessionToken);
    } catch {}
  }
  authService.clearAuthCookie(res);
  res.json({ success: true, message: 'Đăng xuất thành công' });
}));

// Password Reset Routes
apiRouter.post('/auth/forgot-password', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Vui lòng nhập địa chỉ email hợp lệ');
  }

  const user = await userRepo.findByEmail(email);
  if (user) {
    const rawToken = await userRepo.createPasswordResetToken(user.id);
    if (!isProduction) {
      console.log(`[JAMI Auth Dev Notice] Password reset link for ${email}: ${env.APP_BASE_URL}/reset-password?token=${rawToken}`);
    }
  }

  // Always return identical success response to prevent email enumeration
  res.json({
    success: true,
    message: 'Nếu email tồn tại trong hệ thống, liên kết khôi phục mật khẩu đã được gửi.',
    emailServiceConfigured: env.PASSWORD_RESET_ENABLED,
  });
}));

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Mã khôi phục không được để trống'),
  newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
});

apiRouter.post('/auth/reset-password', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const parseResult = ResetPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const { token, newPassword } = parseResult.data;
  const success = await userRepo.resetPasswordWithToken(token, newPassword);

  if (!success) {
    return sendError(req, res, 400, 'INVALID_RESET_TOKEN', 'Mã khôi phục mật khẩu không hợp lệ hoặc đã hết hạn.');
  }

  authService.clearAuthCookie(res);

  res.json({
    success: true,
    message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
  });
}));

// User Profile Update
apiRouter.patch('/profile', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const updated = await userRepo.updateProfile(userId, req.body);
  res.json({ profile: updated });
}));

apiRouter.post('/onboarding/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const updated = await userRepo.updateProfile(userId, {
    ...req.body,
    onboardingCompletedAt: new Date().toISOString(),
  });
  res.json({ success: true, profile: updated });
}));

// Export My Data Route
apiRouter.post('/me/export', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const profile = await userRepo.getProfile(userId);
  const subjects = await subjectRepo.getByUserId(userId);
  const tasks = await taskRepo.getByUserId(userId);
  const timetables = await timetableRepo.getTimetables(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  const exams = await examRepo.getByUserId(userId);
  const materials = await materialRepo.getByUserId(userId);
  const focusSessions = await focusRepo.getSessionsByUserId(userId);
  const notifications = await notificationRepo.getByUserId(userId);

  const safeUser = user ? {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    preferredName: user.preferredName,
    role: user.role,
    timezone: user.timezone,
    createdAt: user.createdAt,
  } : null;

  res.json({
    exportedAt: new Date().toISOString(),
    system: 'JAMI AI Personalized Study Companion',
    user: safeUser,
    profile,
    subjects,
    tasks,
    timetables,
    busyEvents,
    exams,
    materials,
    focusSessions,
    notifications,
  });
}));

// ==========================================
// Dashboard Overview
// ==========================================

apiRouter.get('/dashboard/overview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const profile = await userRepo.getProfile(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  // 1. Timezone-aware date calculations
  const now = new Date();
  const todayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const todayDateStr = todayFormatter.format(now); // YYYY-MM-DD in user timezone

  // Get local day of week: 1=Monday ... 7=Sunday
  const localDayOfWeek = (() => {
    const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, weekday: 'short' }).format(now);
    const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return map[dayStr] || 1;
  })();

  const currentTimeStr = new Intl.DateTimeFormat('en-GB', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

  // 2. Timetable and busy events today
  const timetableEntries = await timetableRepo.getTimetableEntries(userId);
  const todayTimetable = timetableEntries.filter((e) => e.dayOfWeek === localDayOfWeek);
  
  const todayBusyEvents = await timetableRepo.getBusyEvents(userId, `${todayDateStr}T00:00:00.000Z`, `${todayDateStr}T23:59:59.999Z`);
  
  const combinedTodaySessions = [
    ...todayTimetable.map((e) => ({
      title: e.title,
      time: `${e.startLocalTime} - ${e.endLocalTime}`,
      start: e.startLocalTime,
      end: e.endLocalTime,
      subject: e.subjectName,
      isBusyEvent: false,
    })),
    ...todayBusyEvents.map((b) => {
      const startTime = b.startsAt ? new Intl.DateTimeFormat('en-GB', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(b.startsAt)) : '00:00';
      const endTime = b.endsAt ? new Intl.DateTimeFormat('en-GB', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(b.endsAt)) : '23:59';
      return {
        title: b.title,
        time: `${startTime} - ${endTime}`,
        start: startTime,
        end: endTime,
        subject: 'Lịch bận',
        isBusyEvent: true,
      };
    }),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const nextSession = combinedTodaySessions.find((s) => s.end > currentTimeStr) || combinedTodaySessions[0] || null;

  // 3. Tasks today, overdue, and pending
  const tasks = await taskRepo.getByUserId(userId);
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const priorityTask = pendingTasks.find((t) => t.priority === 'high') || pendingTasks[0] || null;

  const todayTasks = tasks.filter((t) => {
    const isScheduledToday = t.scheduledStartAt ? t.scheduledStartAt.startsWith(todayDateStr) : false;
    const isDueToday = t.dueAt ? t.dueAt.startsWith(todayDateStr) : false;
    return isScheduledToday || isDueToday;
  });

  const overdueTasks = tasks.filter((t) => {
    if (t.status === 'completed' || t.status === 'cancelled') return false;
    if (!t.dueAt) return false;
    return t.dueAt < `${todayDateStr}T00:00:00.000Z`;
  });

  const completedTodayTasks = todayTasks.filter((t) => t.status === 'completed');
  const plannedMinutes = todayTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 30), 0);
  const completedMinutes = completedTodayTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 30), 0);

  // 4. Focus Sessions & Actual Focus Time
  const focusSessions = await focusRepo.getSessionsByUserId(userId);
  const completedTodaySessions = focusSessions.filter((s) => {
    if (s.state !== 'completed') return false;
    const dateStr = s.startedAt || s.createdAt;
    return dateStr ? dateStr.startsWith(todayDateStr) : false;
  });
  const actualFocusMinutes = completedTodaySessions.reduce((acc, s) => acc + (s.actualMinutes || Math.round((s.actualFocusSeconds || 0) / 60)), 0);

  const completedPercent = plannedMinutes > 0
    ? Math.min(100, Math.round((completedMinutes / plannedMinutes) * 100))
    : (completedMinutes > 0 ? 100 : 0);

  // 5. Real Streak Days Calculation
  const studyDates = new Set<string>();
  for (const s of focusSessions) {
    if (s.state === 'completed' && s.startedAt) {
      studyDates.add(s.startedAt.split('T')[0]);
    }
  }
  let streakDays = 0;
  let checkDate = new Date(todayDateStr);
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (studyDates.has(dateStr)) {
      streakDays++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    } else {
      break;
    }
  }

  // 6. 7-Day Trend Comparison
  const msInDay = 86400000;
  const nowMs = now.getTime();
  const last7DaysMs = nowMs - 7 * msInDay;
  const prev7DaysMs = nowMs - 14 * msInDay;

  const focus7Days = focusSessions.filter((s) => {
    if (s.state !== 'completed' || !s.startedAt) return false;
    const t = new Date(s.startedAt).getTime();
    return t >= last7DaysMs && t <= nowMs;
  });
  const totalFocusMinutes7Days = focus7Days.reduce((acc, s) => acc + (s.actualMinutes || Math.round((s.actualFocusSeconds || 0) / 60)), 0);

  const focusPrev7Days = focusSessions.filter((s) => {
    if (s.state !== 'completed' || !s.startedAt) return false;
    const t = new Date(s.startedAt).getTime();
    return t >= prev7DaysMs && t < last7DaysMs;
  });
  const totalFocusMinutesPrev7Days = focusPrev7Days.reduce((acc, s) => acc + (s.actualMinutes || Math.round((s.actualFocusSeconds || 0) / 60)), 0);

  let trendLabel = 'Tuần đầu tiên ghi nhận';
  if (totalFocusMinutesPrev7Days > 0) {
    const diff = Math.round(((totalFocusMinutes7Days - totalFocusMinutesPrev7Days) / totalFocusMinutesPrev7Days) * 100);
    trendLabel = diff >= 0 ? `+${diff}% so với tuần trước` : `${diff}% so với tuần trước`;
  } else if (totalFocusMinutes7Days > 0) {
    trendLabel = `Đạt ${totalFocusMinutes7Days} phút tuần này`;
  }

  // 7. Exams, Materials, Notifications
  const exams = await examRepo.getByUserId(userId);
  const upcomingExam = exams
    .filter((e) => e.status === 'upcoming' && new Date(e.examAt).getTime() >= nowMs)
    .sort((a, b) => new Date(a.examAt).getTime() - new Date(b.examAt).getTime())[0] || null;

  let daysRemaining = 0;
  if (upcomingExam?.examAt) {
    const diffMs = new Date(upcomingExam.examAt).getTime() - nowMs;
    daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 3600 * 24)));
  }

  const materials = await materialRepo.getByUserId(userId);
  const notifications = await notificationRepo.getByUserId(userId);
  const unreadNotifs = notifications.filter((n) => n.status === 'unread');
  const jamiMessages = await jamiRepo.getMessages(userId);
  const latestMessage = jamiMessages[jamiMessages.length - 1]?.text || 'Chào mừng em đến với Jami!';

  res.json({
    studentName: user?.preferredName || user?.displayName || 'học sinh',
    gradeLevel: profile?.gradeLevel || 9,
    todayDateFormatted: todayDateStr,
    timetable: {
      nextSessionTitle: nextSession?.title || undefined,
      nextSessionTime: nextSession?.time || undefined,
      todaySessionsCount: combinedTodaySessions.length,
      todaySessions: combinedTodaySessions,
    },
    tasks: {
      priorityTaskTitle: priorityTask?.title,
      priorityTaskId: priorityTask?.id,
      pendingCount: pendingTasks.length,
      todayTasksCount: todayTasks.length,
      overdueCount: overdueTasks.length,
    },
    todayStudy: {
      actualFocusMinutes,
      completedMinutes,
      plannedMinutes,
      completedPercent,
      streakDays,
    },
    jami: {
      latestMessage,
      conversationStatus: 'active',
    },
    exams: {
      upcomingTitle: upcomingExam?.title,
      daysRemaining,
    },
    reports: {
      totalFocusMinutes7Days,
      totalFocusMinutesPrev7Days,
      trendLabel,
    },
    materials: {
      totalMaterialsCount: materials.length,
      latestMaterialTitle: materials[0]?.title,
    },
    notifications: {
      unreadCount: unreadNotifs.length,
      latestTitle: unreadNotifs[0]?.title,
    },
  });
}));

// ==========================================
// Feature Endpoints
// ==========================================

apiRouter.get('/subjects', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const subjects = await subjectRepo.getByUserId(userId);
  res.json({ subjects });
}));

// ==========================================
// School Timetables & Entries
// ==========================================

apiRouter.get('/timetables', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { from, to } = req.query as { from?: string; to?: string };

  const timetables = await timetableRepo.getTimetables(userId);
  const activeTimetable = timetables.find((t) => t.isActive) || timetables[0] || null;
  const entries = await timetableRepo.getTimetableEntries(userId, activeTimetable?.id);
  const busyEvents = await timetableRepo.getBusyEvents(userId, from, to);
  const availabilityRules = await timetableRepo.getAvailabilityRules(userId);

  res.json({
    timetables,
    activeTimetable,
    entries,
    busyEvents,
    availabilityRules,
  });
}));

apiRouter.post('/timetables', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = SchoolTimetableInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const timetable = await timetableRepo.createTimetable(userId, parseResult.data);
  res.status(201).json({ timetable });
}));

apiRouter.patch('/timetables/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const timetable = await timetableRepo.updateTimetable(userId, req.params.id, req.body);
  if (!timetable) return sendError(req, res, 404, 'TIMETABLE_NOT_FOUND', 'Không tìm thấy thời khóa biểu');
  res.json({ timetable });
}));

apiRouter.delete('/timetables/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await timetableRepo.deleteTimetable(userId, req.params.id);
  if (!success) return sendError(req, res, 404, 'TIMETABLE_NOT_FOUND', 'Không tìm thấy thời khóa biểu cần xóa');
  res.json({ success });
}));

apiRouter.post('/timetables/entries', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = TimetableEntryInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu tiết học không hợp lệ');
  }

  const entry = await timetableRepo.createTimetableEntry(userId, parseResult.data);
  res.status(201).json({ entry });
}));

apiRouter.patch('/timetables/entries/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const entry = await timetableRepo.updateTimetableEntry(userId, req.params.id, req.body);
  if (!entry) return sendError(req, res, 404, 'ENTRY_NOT_FOUND', 'Không tìm thấy tiết học cần sửa');
  res.json({ entry });
}));

apiRouter.delete('/timetables/entries/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await timetableRepo.deleteTimetableEntry(userId, req.params.id);
  if (!success) return sendError(req, res, 404, 'ENTRY_NOT_FOUND', 'Không tìm thấy tiết học cần xóa');
  res.json({ success });
}));

apiRouter.delete('/timetables/entries-by-day/:dayOfWeek', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const dayOfWeek = parseInt(req.params.dayOfWeek, 10);
  if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Thứ trong tuần không hợp lệ (1 = Thứ 2 ... 7 = Chủ Nhật)');
  }
  const timetableId = req.query.timetableId as string | undefined;
  const deletedCount = await timetableRepo.deleteEntriesByDay(userId, dayOfWeek, timetableId);
  res.json({ success: true, deletedCount });
}));

apiRouter.delete('/timetables-all-entries', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const timetableId = req.query.timetableId as string | undefined;
  const deletedCount = await timetableRepo.deleteAllEntries(userId, timetableId);
  res.json({ success: true, deletedCount });
}));

// Timetable CSV Export Route
apiRouter.get('/timetables/export/csv', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const csv = await timetableRepo.generateTimetableCsv(userId);
  const dateStr = new Date().toISOString().split('T')[0];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jami_timetable_${dateStr}.csv"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
}));

// ==========================================
// Busy Events
// ==========================================

apiRouter.get('/busy-events', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { from, to } = req.query as { from?: string; to?: string };
  const events = await timetableRepo.getBusyEvents(userId, from, to);
  res.json({ events });
}));

apiRouter.post('/busy-events', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = BusyEventInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu sự kiện bận không hợp lệ');
  }

  const event = await timetableRepo.createBusyEvent(userId, parseResult.data);
  res.status(201).json({ event });
}));

apiRouter.patch('/busy-events/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const event = await timetableRepo.updateBusyEvent(userId, req.params.id, req.body);
  if (!event) return sendError(req, res, 404, 'BUSY_EVENT_NOT_FOUND', 'Không tìm thấy sự kiện bận cần sửa');
  res.json({ event });
}));

apiRouter.delete('/busy-events/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await timetableRepo.deleteBusyEvent(userId, req.params.id);
  if (!success) return sendError(req, res, 404, 'BUSY_EVENT_NOT_FOUND', 'Không tìm thấy sự kiện bận cần xóa');
  res.json({ success });
}));

// ==========================================
// Availability Rules
// ==========================================

apiRouter.get('/availability-rules', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const rules = await timetableRepo.getAvailabilityRules(userId);
  res.json({ rules });
}));

apiRouter.put('/availability-rules', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const rulesArray = Array.isArray(req.body?.rules) ? req.body.rules : req.body;
  if (!Array.isArray(rulesArray)) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Dữ liệu quy tắc phải là mảng');
  }

  for (const r of rulesArray) {
    const parseResult = AvailabilityRuleInputSchema.safeParse(r);
    if (!parseResult.success) {
      return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu quy tắc không hợp lệ');
    }
  }

  const saved = await timetableRepo.saveAvailabilityRules(userId, rulesArray);
  res.json({ rules: saved });
}));

// ==========================================
// Study Tasks
// ==========================================

apiRouter.get('/tasks', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { status, subjectId } = req.query;
  const tasks = await taskRepo.getByUserId(userId, {
    status: status as string | undefined,
    subjectId: subjectId as string | undefined,
  });
  res.json({ tasks });
}));

apiRouter.post('/tasks', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = TaskCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu nhiệm vụ không hợp lệ');
  }

  const task = await taskRepo.create(userId, parsed.data);
  res.status(201).json({ task });
}));

apiRouter.get('/tasks/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.getById(userId, req.params.id);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  const guide = await taskRepo.getExecutionGuide(userId, req.params.id);
  const evidence = await taskRepo.getEvidenceByTaskId(userId, req.params.id);

  res.json({
    task,
    executionGuide: guide || undefined,
    evidence,
  });
}));

apiRouter.patch('/tasks/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = TaskUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu cập nhật không hợp lệ');
  }

  const task = await taskRepo.update(userId, req.params.id, parsed.data);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');
  res.json({ task });
}));

apiRouter.delete('/tasks/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const deleted = await taskRepo.deleteTask(userId, req.params.id);
  if (!deleted) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập để xóa');
  res.json({ success: true });
}));

apiRouter.post('/tasks/:id/execution-guide/generate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.getById(userId, req.params.id);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  const parsed = ExecutionGuideGenerateSchema.safeParse(req.body || {});
  const additionalNotes = parsed.success ? parsed.data.additionalNotes : undefined;

  const profile = await userRepo.getProfile(userId);
  const generatedGuide = await AiAdapter.generateExecutionGuide(
    task,
    profile?.gradeLevel || 9,
    task.subjectName,
    additionalNotes
  );

  const savedGuide = await taskRepo.saveExecutionGuide(userId, task.id, generatedGuide);
  const isDemo = !AiAdapter.isConfigured();

  res.json({
    guide: savedGuide,
    isDemoMode: isDemo,
  });
}));

apiRouter.patch('/tasks/:taskId/checklist/:itemId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = ChecklistItemUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Trạng thái checklist không hợp lệ');
  }

  const updated = await taskRepo.updateChecklistItem(userId, req.params.taskId, req.params.itemId, parsed.data.checked);
  if (!updated) {
    return sendError(req, res, 404, 'CHECKLIST_ITEM_NOT_FOUND', 'Không tìm thấy mục checklist');
  }
  res.json({ success: true, checked: parsed.data.checked });
}));

apiRouter.post('/tasks/:taskId/steps/:stepId/start', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await taskRepo.updateExecutionStep(userId, req.params.taskId, req.params.stepId, 'in_progress');
  if (!result.task) {
    return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ hoặc bước thực hiện');
  }
  res.json(result);
}));

apiRouter.post('/tasks/:taskId/steps/:stepId/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = StepActionSchema.safeParse(req.body || { status: 'completed' });
  const actualMinutes = parsed.success ? parsed.data.actualMinutes : undefined;

  const result = await taskRepo.completeStep(userId, req.params.taskId, req.params.stepId, actualMinutes);
  if (!result.task) {
    return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ hoặc bước thực hiện');
  }
  res.json(result);
}));

apiRouter.post('/tasks/:taskId/evidence', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.getById(userId, req.params.taskId);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  const parsed = TaskEvidenceSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu minh chứng không hợp lệ');
  }

  const evidence = await taskRepo.addEvidence(userId, {
    taskId: task.id,
    type: parsed.data.type,
    textValue: parsed.data.evidenceNote,
    scoreValue: parsed.data.rating,
    fileUrl: parsed.data.fileUrl,
    r2ObjectKey: parsed.data.r2ObjectKey,
    notes: `Tự đánh giá: ${parsed.data.rating}/5 sao`,
  });

  res.status(201).json({ evidence });
}));

apiRouter.post('/tasks/:taskId/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.completeTask(userId, req.params.taskId);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');
  res.json({ task });
}));

apiRouter.post('/tasks/:taskId/unschedule', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.unscheduleTask(userId, req.params.taskId);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');
  res.json({ task });
}));

// Tasks CSV Export Route
apiRouter.get('/tasks/export/csv', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const csv = await taskRepo.generateTasksCsv(userId);
  const dateStr = new Date().toISOString().split('T')[0];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jami_tasks_${dateStr}.csv"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
}));

// ==========================================
// Focus Sessions
// ==========================================

apiRouter.get('/focus-sessions/current', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.getCurrentSession(userId);
  res.json({ session });
}));

apiRouter.post('/focus-sessions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = FocusSessionStartSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu phiên tập trung không hợp lệ');
  }

  const { taskId, mode, minutes, breakMinutes, idempotencyKey } = parsed.data;
  const session = await focusRepo.startSession(userId, taskId, mode, minutes, breakMinutes, idempotencyKey);
  res.json({ session });
}));

apiRouter.post('/focus-sessions/:id/pause', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const session = await focusRepo.pauseSession(userId, req.params.id);
    res.json({ session });
  } catch (err: any) {
    sendError(req, res, 400, 'PAUSE_FAILED', err.message || 'Không thể tạm dừng phiên tập trung.');
  }
}));

apiRouter.post('/focus-sessions/:id/resume', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const session = await focusRepo.resumeSession(userId, req.params.id);
    res.json({ session });
  } catch (err: any) {
    sendError(req, res, 400, 'RESUME_FAILED', err.message || 'Không thể tiếp tục phiên tập trung.');
  }
}));

apiRouter.post('/focus-sessions/:id/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = FocusSessionActionSchema.safeParse(req.body || {});
  const notes = parsed.success ? parsed.data.notes : undefined;

  try {
    const session = await focusRepo.completeSession(userId, req.params.id, notes);
    res.json({ session });
  } catch (err: any) {
    sendError(req, res, 400, 'COMPLETE_FAILED', err.message || 'Không thể hoàn tất phiên tập trung.');
  }
}));

apiRouter.post('/focus-sessions/:id/abandon', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = FocusSessionActionSchema.safeParse(req.body || {});
  const notes = parsed.success ? parsed.data.notes : undefined;

  try {
    const session = await focusRepo.abandonSession(userId, req.params.id, notes);
    res.json({ session });
  } catch (err: any) {
    sendError(req, res, 400, 'ABANDON_FAILED', err.message || 'Không thể hủy phiên tập trung.');
  }
}));

// ==========================================
// AI Planner & Voice Goal
// ==========================================

apiRouter.post('/planner/voice-goal/preview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { transcript } = req.body;

  let extraction: any;
  let isDemoMode = true;

  if (AiAdapter.isConfigured()) {
    try {
      extraction = await AiAdapter.extractGoalFromText(transcript);
      isDemoMode = false;
    } catch {
      extraction = { subjectName: 'Toán học', goalText: transcript, targetDate: new Date().toISOString() };
    }
  } else {
    extraction = { subjectName: 'Toán học', goalText: transcript, targetDate: new Date().toISOString() };
  }

  const subjects = await subjectRepo.getByUserId(userId);
  const matchedSubject = subjects.find((s) => s.name.toLowerCase().includes((extraction.subjectName || '').toLowerCase())) || subjects[0];

  const profile = await userRepo.getProfile(userId);
  const currentTasks = await taskRepo.getByUserId(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  const timetableEntries = await timetableRepo.getTimetableEntries(userId);
  const availabilityRules = await timetableRepo.getAvailabilityRules(userId);

  const defaultProfile: StudentProfile = profile || {
    userId,
    gradeLevel: 9,
    schoolName: 'THCS',
    goals: [],
    preferredSessionMinutes: 45,
    maxDailyStudyMinutes: 180,
    energyPreferences: { morning: 'high', afternoon: 'medium', evening: 'high' },
    sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
    mealTimes: { lunch: '12:00', dinner: '18:30' },
  };

  const sampleTasksToDecompose: StudyTask[] = [
    {
      id: 'task_prep_' + Date.now(),
      userId,
      subjectId: matchedSubject?.id || 'subj_toan',
      subjectName: matchedSubject?.name || 'Toán học',
      title: `${matchedSubject?.name || 'Môn học'} — Ôn tập lý thuyết & các công thức cốt lõi`,
      objective: 'Nắm vững kiến thức nền tảng',
      status: 'pending',
      priority: 'high',
      difficulty: 'medium',
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      estimatedMinutes: 45,
      minSessionMinutes: 20,
      maxSessionMinutes: 60,
      splittable: true,
      locked: false,
      completionPercent: 0,
      source: 'planner',
    },
  ];

  const proposal = DeterministicScheduler.generateScheduleProposal(
    sampleTasksToDecompose,
    currentTasks,
    busyEvents,
    timetableEntries,
    defaultProfile,
    new Date(),
    7,
    'Tối ưu hóa lịch học từ mục tiêu giọng nói',
    availabilityRules,
    (req as any).user?.timezone || 'Asia/Ho_Chi_Minh',
    extraction.preferredWindows || []
  );

  await plannerRepo.saveProposal(proposal);

  res.json({ extraction, proposal, isDemoMode });
}));

// Replan Preview
apiRouter.post('/planner/replan/preview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const currentTasks = await taskRepo.getByUserId(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  const timetableEntries = await timetableRepo.getTimetableEntries(userId);
  const availabilityRules = await timetableRepo.getAvailabilityRules(userId);
  const profile = await userRepo.getProfile(userId);

  const defaultProfile: StudentProfile = profile || {
    userId,
    gradeLevel: 9,
    schoolName: 'THCS',
    goals: [],
    preferredSessionMinutes: 45,
    maxDailyStudyMinutes: 180,
    energyPreferences: { morning: 'high', afternoon: 'medium', evening: 'high' },
    sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
    mealTimes: { lunch: '12:00', dinner: '18:30' },
  };

  const startDate = req.body?.startDate ? new Date(req.body.startDate) : new Date();
  const daysCount = Number(req.body?.daysCount) || 7;
  const reason = req.body?.reason || 'Tự động sắp xếp lại các bài tập chưa hoàn thành';

  const proposal = DeterministicScheduler.generateScheduleProposal(
    currentTasks,
    currentTasks,
    busyEvents,
    timetableEntries,
    defaultProfile,
    startDate,
    daysCount,
    reason,
    availabilityRules,
    (req as any).user?.timezone || 'Asia/Ho_Chi_Minh'
  );

  // Crucial fix: Persist proposal in database so confirmation succeeds!
  await plannerRepo.saveProposal(proposal);

  res.json({ proposal });
}));

// Proposal Confirmation
apiRouter.post('/planner/proposals/:proposalId/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const proposalId = req.params.proposalId;
  const idempotencyKey = req.body?.idempotencyKey;

  try {
    const result = await plannerRepo.confirmProposal(userId, proposalId, idempotencyKey);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'PROPOSAL_NOT_FOUND') {
      return sendError(req, res, 404, 'PROPOSAL_NOT_FOUND', 'Không tìm thấy đề xuất lịch học');
    }
    if (err.code === 'PROPOSAL_ALREADY_CONFIRMED' || err.code === 'PROPOSAL_INVALID_STATUS') {
      return sendError(req, res, 409, err.code, err.message || 'Đề xuất không thể xác nhận.');
    }
    if (err.code === 'PROPOSAL_EXPIRED') {
      return sendError(req, res, 410, 'PROPOSAL_EXPIRED', err.message || 'Đề xuất lịch học đã hết hạn.');
    }
    sendError(req, res, 400, 'CONFIRMATION_FAILED', err.message || 'Xác nhận đề xuất thất bại');
  }
}));

// Proposal Cancellation
apiRouter.post('/planner/proposals/:proposalId/cancel', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await plannerRepo.cancelProposal(userId, req.params.proposalId);
  res.json({ success });
}));

apiRouter.get('/exams', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const exams = await examRepo.getByUserId(userId);
  res.json({ exams });
}));

apiRouter.get('/exams/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const exam = await examRepo.getById(userId, req.params.id);
  if (!exam) {
    return sendError(req, res, 404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ kiểm tra.');
  }
  res.json({ exam });
}));

apiRouter.post('/exams', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = ExamCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu kỳ kiểm tra không hợp lệ');
  }

  const exam = await examRepo.create(userId, parsed.data);
  res.json({ exam });
}));

apiRouter.patch('/exams/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = ExamUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu cập nhật không hợp lệ');
  }

  const exam = await examRepo.update(userId, req.params.id, parsed.data);
  if (!exam) {
    return sendError(req, res, 404, 'EXAM_NOT_FOUND', 'Không tìm thấy kỳ kiểm tra để cập nhật.');
  }
  res.json({ exam });
}));

apiRouter.delete('/exams/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await examRepo.delete(userId, req.params.id);
  res.json({ success });
}));

apiRouter.post('/exams/:id/quizzes/generate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = ExamQuizGenerateSchema.safeParse(req.body || {});
  const options = parsed.success ? parsed.data : {};

  try {
    const quiz = await quizRepo.generateQuizForExam(userId, req.params.id, options);
    res.json({ success: true, quiz });
  } catch (err: any) {
    sendError(req, res, 400, 'QUIZ_GENERATION_FAILED', err.message || 'Không thể tạo đề ôn tập.');
  }
}));

apiRouter.get('/quizzes', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const examId = req.query.examId as string | undefined;
  const quizzes = await quizRepo.getByUserId(userId, examId);
  res.json({ quizzes });
}));

apiRouter.get('/quizzes/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  // includeAnswers is FALSE before submission to ensure security!
  const quiz = await quizRepo.getById(userId, req.params.id, false);
  if (!quiz) return sendError(req, res, 404, 'QUIZ_NOT_FOUND', 'Không tìm thấy đề thi');
  res.json({ quiz });
}));

apiRouter.post('/quizzes/:id/attempts', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const attempt = await quizRepo.startAttempt(userId, req.params.id);
    res.json({ attempt });
  } catch (err: any) {
    sendError(req, res, 400, 'ATTEMPT_START_FAILED', err.message || 'Không thể bắt đầu làm bài.');
  }
}));

apiRouter.post('/quizzes/:quizId/attempts/submit', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = QuizAttemptSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu bài nộp không hợp lệ');
  }

  const attemptId = req.body.attemptId;
  const result = await quizRepo.submitAttempt(userId, req.params.quizId, parsed.data.answers, attemptId);
  res.json(result);
}));

// Learning Materials Subsystem Routes
apiRouter.get('/materials', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const materials = await materialRepo.getByUserId(userId);
  res.json({ materials });
}));

apiRouter.get('/materials/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const material = await materialRepo.getById(userId, req.params.id);
  if (!material) {
    return res.status(404).json({
      error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu học tập.' },
    });
  }
  res.json({ material });
}));

apiRouter.post('/materials/upload-intent', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = MaterialUploadIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Thông tin tải lên không hợp lệ.',
        details: parsed.error.issues,
      },
    });
  }

  const intent = await materialRepo.createUploadIntent(userId, parsed.data);
  res.json(intent);
}));

apiRouter.post('/materials/upload-direct', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const key = req.query.key as string;
  if (!key || !key.startsWith(`materials/${userId}/`)) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Khóa lưu trữ không hợp lệ hoặc không thuộc quyền sở hữu.' },
    });
  }

  const contentType = req.headers['content-type'] || 'application/pdf';

  // Read raw body buffer
  let bodyBuffer: Buffer;
  if (Buffer.isBuffer(req.body)) {
    bodyBuffer = req.body;
  } else if (req.body && typeof req.body === 'object') {
    // If parsed as json or base64
    const base64Data = (req.body as any).fileBase64 || (req.body as any).data;
    if (base64Data) {
      bodyBuffer = Buffer.from(base64Data.replace(/^data:.*?;base64,/, ''), 'base64');
    } else {
      bodyBuffer = Buffer.from(JSON.stringify(req.body));
    }
  } else {
    bodyBuffer = Buffer.from(String(req.body || ''));
  }

  // Magic bytes security verification
  const magicCheck = validateMagicBytes(bodyBuffer, contentType);
  if (!magicCheck.isValid) {
    return res.status(400).json({
      error: { code: 'INVALID_FILE_BYTES', message: magicCheck.error || 'Nội dung tệp không hợp lệ.' },
    });
  }

  // Put object in storage
  const putResult = await storageService.putObject(key, bodyBuffer, contentType);

  // Find corresponding material record
  const materials = await materialRepo.getByUserId(userId);
  const material = materials.find((m) => m.r2ObjectKey === key);

  if (material) {
    await materialRepo.finalizeUpload(userId, material.id, {
      sizeBytes: putResult.size,
      sha256: putResult.sha256,
    });
    // Trigger asynchronous AI processing
    materialProcessor.processMaterial(userId, material.id).catch((err) => {
      console.error('[API] Error processing material after upload:', err);
    });
  }

  res.json({
    success: true,
    key,
    sizeBytes: putResult.size,
    sha256: putResult.sha256,
    materialId: material?.id,
  });
}));

apiRouter.post('/materials/note', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = MaterialNoteCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Nội dung ghi chú không hợp lệ.',
        details: parsed.error.issues,
      },
    });
  }

  const note = await materialRepo.createNote(userId, parsed.data);
  // Asynchronously trigger AI processing for note
  materialProcessor.processMaterial(userId, note.id).catch((err) => {
    console.error('[API] Error processing note:', err);
  });

  res.json({ success: true, material: note });
}));

apiRouter.post('/materials/:id/finalize', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = MaterialFinalizeSchema.safeParse(req.body || {});
  const meta = parsed.success ? parsed.data : undefined;

  const finalized = await materialRepo.finalizeUpload(userId, req.params.id, meta);
  if (!finalized) {
    return res.status(404).json({
      error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu cần hoàn tất.' },
    });
  }

  // Trigger processing
  materialProcessor.processMaterial(userId, finalized.id).catch((err) => {
    console.error('[API] Error processing finalized material:', err);
  });

  res.json({ success: true, material: finalized });
}));

apiRouter.get('/materials/:id/content', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const material = await materialRepo.getById(userId, req.params.id);
  if (!material) {
    return res.status(404).json({
      error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu.' },
    });
  }

  if (material.type === 'notes' && material.contentText) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(material.contentText);
  }

  if (material.r2ObjectKey) {
    const obj = await storageService.getObject(material.r2ObjectKey);
    if (obj) {
      res.setHeader('Content-Type', obj.contentType || material.mimeType || 'application/pdf');
      res.setHeader('Content-Length', obj.size);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const safeName = (material.fileName || material.title).replace(/[^\w.-]/g, '_');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      return res.send(obj.body);
    }
  }

  res.status(404).json({
    error: { code: 'CONTENT_NOT_FOUND', message: 'Chưa có nội dung tệp cho tài liệu này.' },
  });
}));

apiRouter.post('/materials/:id/reprocess', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const material = await materialRepo.getById(userId, req.params.id);
  if (!material) {
    return res.status(404).json({
      error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu.' },
    });
  }

  const result = await materialProcessor.processMaterial(userId, material.id);
  res.json(result);
}));

apiRouter.post('/materials/:id/quizzes/generate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = MaterialQuizGenerateSchema.safeParse(req.body);
  const options = parsed.success ? parsed.data : {};

  const result = await materialProcessor.generateQuizFromMaterial(userId, req.params.id, options);
  if (!result.success) {
    return res.status(400).json({
      error: { code: 'QUIZ_GENERATION_FAILED', message: result.error || 'Không thể tạo đề luyện tập từ tài liệu.' },
    });
  }

  res.json(result);
}));

apiRouter.delete('/materials/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await materialRepo.delete(userId, req.params.id);
  res.json({ success });
}));

apiRouter.get('/reports/overview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = ReportOverviewQuerySchema.safeParse(req.query);
  const options = parsed.success ? parsed.data : {};

  const overview = await reportRepo.getOverview(userId, options);
  res.json(overview);
}));

apiRouter.get('/reports/export', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = ReportOverviewQuerySchema.safeParse(req.query);
  const options = parsed.success ? parsed.data : {};

  const csv = await reportRepo.generateCsvExport(userId, options);
  const dateStr = new Date().toISOString().split('T')[0];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="jami_report_${dateStr}.csv"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
}));

// Notifications Subsystem Routes
apiRouter.get('/notifications', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = NotificationFilterQuerySchema.safeParse(req.query);
  const options = parsed.success ? parsed.data : {};

  const result = await notificationRepo.getPaginated(userId, options);
  res.json(result);
}));

apiRouter.get('/notifications/unread-count', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const unreadCount = await notificationRepo.getUnreadCount(userId);
  res.json({ unreadCount });
}));

apiRouter.get('/notifications/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const preferences = await notificationRepo.getPreferences(userId);
  res.json({ preferences });
}));

apiRouter.patch('/notifications/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = NotificationPreferencesUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu tùy chọn thông báo không hợp lệ',
        details: parsed.error.issues,
      },
    });
  }

  const preferences = await notificationRepo.updatePreferences(userId, parsed.data);
  res.json({ preferences });
}));

apiRouter.post('/notifications/:id/read', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await notificationRepo.markAsRead(userId, req.params.id);
  const unreadCount = await notificationRepo.getUnreadCount(userId);
  res.json({ success, unreadCount });
}));

apiRouter.post('/notifications/read-all', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const count = await notificationRepo.markAllAsRead(userId);
  res.json({ success: true, count, unreadCount: 0 });
}));

apiRouter.delete('/notifications/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await notificationRepo.delete(userId, req.params.id);
  const unreadCount = await notificationRepo.getUnreadCount(userId);
  res.json({ success, unreadCount });
}));

// Internal Server-to-Server Cron Endpoint for Automated Notification Generation
apiRouter.post('/internal/notifications/run', asyncHandler(async (req: Request, res: Response) => {
  const cronSecret = req.headers['x-internal-cron-secret'] || req.headers['authorization'];
  const expectedSecret = env.INTERNAL_CRON_SECRET || env.ADMIN_SECRET_KEY || 'jami-cron-internal-secret-key-32-chars';

  // Server-to-server authorization check
  const provided = typeof cronSecret === 'string' && cronSecret.startsWith('Bearer ')
    ? cronSecret.substring(7)
    : cronSecret;

  if (!provided || provided !== expectedSecret) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED_CRON',
        message: 'Yêu cầu không hợp lệ hoặc thiếu internal cron secret.',
      },
    });
  }

  const targetUserId = req.query.userId as string | undefined;
  const targetDate = req.body?.targetDate ? new Date(req.body.targetDate) : new Date();

  if (targetUserId) {
    const stats = await notificationScheduler.scanAndGenerateForUser(targetUserId, targetDate);
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      mode: 'single_user',
      userId: targetUserId,
      stats,
    });
  }

  const stats = await notificationScheduler.scanAllUsers(targetDate);
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    mode: 'all_users',
    stats,
  });
}));

// ==========================================
// Jami Assistant & Conversations
// ==========================================

apiRouter.get('/jami/conversations', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const conversations = await jamiRepo.getConversations(userId);
  res.json({ conversations });
}));

apiRouter.post('/jami/conversations', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = JamiConversationCreateSchema.safeParse(req.body || {});
  const title = parsed.success ? parsed.data.title : 'Hội thoại với Jami';
  const conversation = await jamiRepo.createConversation(userId, title);
  res.json({ conversation });
}));

apiRouter.patch('/jami/conversations/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = JamiConversationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Tiêu đề không hợp lệ');
  }

  const updated = await jamiRepo.updateConversation(userId, req.params.id, parsed.data.title);
  if (!updated) {
    return sendError(req, res, 404, 'CONVERSATION_NOT_FOUND', 'Không tìm thấy cuộc hội thoại.');
  }
  res.json({ conversation: updated });
}));

apiRouter.delete('/jami/conversations/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await jamiRepo.archiveConversation(userId, req.params.id);
  res.json({ success });
}));

apiRouter.get('/jami/conversations/:id/messages', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const messages = await jamiRepo.getMessages(userId, req.params.id);
  res.json({ messages });
}));

apiRouter.get('/jami/messages', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const conversationId = req.query.conversationId as string | undefined;
  const messages = await jamiRepo.getMessages(userId, conversationId);
  res.json({ messages });
}));

apiRouter.post('/jami/chat', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = JamiChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Nội dung tin nhắn không hợp lệ');
  }

  const { message, clientMessageId } = parsed.data;
  let conversationId = parsed.data.conversationId;

  // Resolve or create conversation
  if (!conversationId) {
    const existingList = await jamiRepo.getConversations(userId);
    if (existingList.length > 0) {
      conversationId = existingList[0].id;
    } else {
      const newConv = await jamiRepo.createConversation(userId, 'Hội thoại chính');
      conversationId = newConv.id;
    }
  }

  // 1. Save user message to MySQL
  const userMsg = await jamiRepo.saveMessage(userId, {
    conversationId,
    sender: 'user',
    text: message.trim(),
    clientMessageId,
  });

  // 2. Build real user context from MySQL
  const user = (req as any).user;
  const profile = await userRepo.getProfile(userId);
  const studentName = user.preferredName || user.displayName || 'bạn';
  const timetableEntries = await timetableRepo.getTimetableEntries(userId);
  const tasks = await taskRepo.getByUserId(userId);
  const exams = await examRepo.getByUserId(userId);
  const materials = await materialRepo.getByUserId(userId);

  const pendingTasks = tasks
    .filter((t) => t.status === 'pending')
    .map((t) => ({
      id: t.id,
      title: t.title,
      subject: t.subjectName,
      estimatedMinutes: t.estimatedMinutes,
      dueAt: t.dueAt,
    }));

  const upcomingExams = exams
    .filter((e) => e.status === 'upcoming')
    .map((e) => {
      const diffMs = new Date(e.examAt).getTime() - Date.now();
      const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 3600 * 24)));
      return {
        id: e.id,
        title: e.title,
        subject: e.subjectName,
        daysLeft,
        examAt: e.examAt,
      };
    });

  const todaySessions = timetableEntries.map((e) => ({
    title: e.title,
    time: `${e.startLocalTime} - ${e.endLocalTime}`,
    subject: e.subjectName,
  }));

  const context = {
    userId,
    conversationId,
    studentName,
    gradeLevel: profile?.gradeLevel || 9,
    todaySessions,
    pendingTasks,
    upcomingExams,
    latestMaterialTitle: materials[0]?.title,
  };

  // 3. Process chat message with real context
  const chatRes = await AiAdapter.generateJamiChat(message.trim(), context);

  let proposal = chatRes.proposal;
  const requiresConfirmation = chatRes.requiresConfirmation;
  const confirmationSummary = chatRes.confirmationSummary;

  // If rescheduling or mutation is needed, generate a real proposal in DB
  if (requiresConfirmation && !proposal) {
    const proposalRes = await jamiActionService.executeTool(
      userId,
      'preview_replan',
      { reason: `Dời và tối ưu lại các nhiệm vụ học tập của ${studentName}` },
      conversationId
    );
    proposal = proposalRes.proposal;
  }

  // 4. Save Jami reply message to MySQL with full proposal metadata
  const jamiMsg = await jamiRepo.saveMessage(userId, {
    conversationId,
    sender: 'jami',
    text: chatRes.message,
    emotion: chatRes.emotion || 'speaking',
    suggestedActions: [
      { label: 'Xem lịch học hôm nay', action: 'navigate', route: '/today' },
      { label: 'Bắt đầu Hẹn giờ tập trung', action: 'navigate', route: '/focus' },
      { label: 'Làm bài luyện tập AI', action: 'navigate', route: '/exams' },
    ],
    requiresConfirmation,
    confirmationSummary: confirmationSummary || (requiresConfirmation ? chatRes.message : undefined),
    proposalId: proposal?.id,
    proposal,
  });

  const isDemo = !AiAdapter.isConfigured();

  res.json({
    userMessage: userMsg,
    replyMessage: jamiMsg,
    clientAction: chatRes.clientAction,
    proposal,
    isDemoMode: isDemo,
  });
}));

apiRouter.post('/jami/messages/:id/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = JamiMessageConfirmSchema.safeParse(req.body || {});
  const decision = parsed.success ? parsed.data.decision : 'confirm';

  try {
    const confirmationResult = await jamiRepo.confirmMessageAction(userId, req.params.id, decision);
    res.json({
      success: true,
      ...confirmationResult,
    });
  } catch (err: any) {
    sendError(req, res, 400, 'CONFIRMATION_FAILED', err.message || 'Không thể thực hiện xác nhận.');
  }
}));

apiRouter.post('/jami/voice/command', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { transcript, clientTurnId, mode, conversationId } = req.body;

  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Transcript giọng nói không được để trống');
  }

  const result = await voiceSessionService.processVoiceCommand(userId, transcript.trim(), {
    clientTurnId,
    mode: mode || 'web_speech',
    conversationId,
  });

  res.json(result);
}));

apiRouter.post('/jami/voice/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { decision, proposalId, conversationId } = req.body;

  const validDecision = decision === 'reject' ? 'reject' : 'confirm';
  const result = await jamiActionService.handleProposalDecision(userId, validDecision, proposalId, conversationId);

  // Synchronize confirmation in Jami messages
  if (result.success) {
    await jamiRepo.saveMessage(userId, {
      conversationId,
      sender: 'jami',
      text: result.message,
      emotion: validDecision === 'confirm' ? 'celebrating' : 'speaking',
    });
  }

  res.json(result);
}));

apiRouter.post('/jami/voice/log', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const log = await voiceSessionService.logVoiceRequest(userId, req.body || {});
  res.json({ success: true, log });
}));

apiRouter.post('/jami/messages/:messageId/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const messages = await jamiRepo.getMessages(userId);
  const targetMsg = messages.find((m) => m.id === req.params.messageId);

  const actionResult = targetMsg?.proposalId
    ? await jamiActionService.handleProposalDecision(userId, 'confirm', targetMsg.proposalId)
    : await jamiActionService.handleProposalDecision(userId, 'confirm');

  const updatedMsg = await jamiRepo.confirmMessageAction(userId, req.params.messageId);
  res.json({
    success: true,
    message: updatedMsg,
    actionResult,
  });
}));

apiRouter.post('/jami/realtime/client-secret', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await voiceSessionService.createRealtimeClientSecret(userId);
  res.json(result);
}));

apiRouter.post('/jami/realtime/session', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await voiceSessionService.createRealtimeClientSecret(userId);
  res.json(result);
}));

apiRouter.get('/jami/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const preferences = await jamiRepo.getPreferences(userId);
  const memories = await jamiRepo.getMemories(userId);
  res.json({ preferences, memories });
}));

apiRouter.patch('/jami/preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const preferences = await jamiRepo.updatePreferences(userId, req.body);
  res.json({ preferences });
}));

apiRouter.delete('/jami/memory/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await jamiRepo.deleteMemory(userId, req.params.id);
  res.json({ success });
}));

apiRouter.post('/me/export', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const profile = await userRepo.getProfile(userId);
  const tasks = await taskRepo.getByUserId(userId);
  const exams = await examRepo.getByUserId(userId);
  const materials = await materialRepo.getByUserId(userId);

  res.json({
    exportedAt: new Date().toISOString(),
    user,
    profile,
    tasks,
    exams,
    materials,
  });
}));

// =========================================================
// Canonical API Specification Aliases (8 Core System Modules)
// =========================================================

// Module 1: Lịch học thông minh
apiRouter.get('/schedules/week', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const activeTimetable = await timetableRepo.getActiveTimetable(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  const tasks = await taskRepo.getByUserId(userId);
  res.json({
    timetable: activeTimetable,
    entries: activeTimetable?.entries || [],
    busyEvents,
    scheduledTasks: tasks.filter((t) => t.scheduledStartAt),
  });
}));

apiRouter.post('/schedules', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  if (req.body.type && req.body.type !== 'school') {
    const event = await timetableRepo.createBusyEvent(userId, req.body);
    return res.status(201).json({ schedule: event, type: 'busy_event' });
  }
  const entry = await timetableRepo.createTimetableEntry(userId, req.body);
  res.status(201).json({ schedule: entry, type: 'school_entry' });
}));

apiRouter.patch('/schedules/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const entry = await timetableRepo.updateTimetableEntry(userId, req.params.id, req.body);
  if (entry) return res.json({ schedule: entry });
  const event = await timetableRepo.updateBusyEvent(userId, req.params.id, req.body);
  if (event) return res.json({ schedule: event });
  res.status(404).json({ error: 'Không tìm thấy lịch cần sửa.' });
}));

apiRouter.delete('/schedules/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const successEntry = await timetableRepo.deleteTimetableEntry(userId, req.params.id);
  if (successEntry) return res.json({ success: true });
  const successEvent = await timetableRepo.deleteBusyEvent(userId, req.params.id);
  res.json({ success: successEvent });
}));

apiRouter.post('/schedules/replan', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const currentTasks = await taskRepo.getByUserId(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  const timetableEntries = await timetableRepo.getTimetableEntries(userId);
  const availabilityRules = await timetableRepo.getAvailabilityRules(userId);
  const profile = await userRepo.getProfile(userId);

  const defaultProfile: StudentProfile = profile || {
    userId,
    gradeLevel: 9,
    schoolName: 'THCS',
    goals: [],
    preferredSessionMinutes: 45,
    maxDailyStudyMinutes: 180,
    energyPreferences: { morning: 'high', afternoon: 'medium', evening: 'high' },
    sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
    mealTimes: { lunch: '12:00', dinner: '18:30' },
  };

  const proposal = DeterministicScheduler.generateScheduleProposal(
    currentTasks,
    currentTasks,
    busyEvents,
    timetableEntries,
    defaultProfile,
    new Date(),
    7,
    req.body?.reason || 'Tự động tính toán và tối ưu lại lịch học',
    availabilityRules,
    (req as any).user?.timezone || 'Asia/Ho_Chi_Minh'
  );

  await plannerRepo.saveProposal(proposal);
  res.json({ proposal });
}));

apiRouter.post('/schedules/replan/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const proposalId = req.body?.proposalId;
  const result = await plannerRepo.confirmProposal(userId, proposalId);
  res.json(result);
}));

// Module 2: Học tập hôm nay
apiRouter.get('/today', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const profile = await userRepo.getProfile(userId);
  const tasks = await taskRepo.getByUserId(userId);
  const currentSession = await focusRepo.getCurrentSession(userId);
  res.json({
    user,
    profile,
    tasks,
    currentSession,
  });
}));

apiRouter.patch('/tasks/:id/status', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const status = req.body?.status || 'completed';
  const task = await taskRepo.update(userId, req.params.id, {
    status,
    completionPercent: status === 'completed' ? 100 : req.body?.completionPercent,
  });
  res.json({ task });
}));

apiRouter.post('/focus-sessions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.startSession(userId, req.body || {});
  res.status(201).json({ session });
}));

apiRouter.patch('/focus-sessions/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const action = req.body?.action;
  if (action === 'pause') {
    const session = await focusRepo.pauseSession(userId, req.params.id);
    return res.json({ session });
  } else if (action === 'resume') {
    const session = await focusRepo.resumeSession(userId, req.params.id);
    return res.json({ session });
  }
  const session = await focusRepo.getSessionById(userId, req.params.id);
  res.json({ session });
}));

apiRouter.post('/focus-sessions/:id/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.completeSession(userId, req.params.id);
  res.json({ session });
}));

apiRouter.get('/progress/today', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const overview = await reportRepo.getOverview(userId, { period: 'week' });
  res.json({
    summary: overview.summary,
    dailyStudy: overview.dailyStudy,
  });
}));

// Module 3: Chi tiết công việc
apiRouter.post('/tasks/:id/generate-steps', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.getById(userId, req.params.id);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  const profile = await userRepo.getProfile(userId);
  const generatedGuide = await AiAdapter.generateExecutionGuide(
    task,
    profile?.gradeLevel || 9,
    task.subjectName,
    req.body?.additionalNotes
  );

  const guide = await taskRepo.saveExecutionGuide(userId, task.id, generatedGuide);
  res.json({ guide });
}));

apiRouter.patch('/task-steps/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const status = req.body?.status === 'started' ? 'in_progress' : (req.body?.status || 'completed');
  const taskId = req.body?.taskId || '';
  const result = await taskRepo.updateExecutionStep(userId, taskId, req.params.id, status, req.body?.actualMinutes);
  res.json(result);
}));

// Module 4: Trợ lý AI Jami
apiRouter.post('/ai/chat', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const studentName = user?.preferredName || user?.displayName || 'Học sinh';
  const { message, conversationId } = req.body;

  const chatRes = await AiAdapter.generateJamiChat(message, {
    userId,
    conversationId,
    studentName,
  });
  res.json(chatRes);
}));

apiRouter.get('/ai/conversations', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const conversations = await jamiRepo.getConversations(userId);
  res.json({ conversations });
}));

apiRouter.post('/ai/actions/preview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await voiceSessionService.processVoiceCommand(userId, req.body?.command || req.body?.transcript || '');
  res.json(result);
}));

apiRouter.post('/ai/actions/:id/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const decision = req.body?.decision || 'confirm';
  const result = await jamiActionService.handleProposalDecision(userId, decision, req.params.id);
  res.json(result);
}));

apiRouter.post('/realtime/session', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await voiceSessionService.createRealtimeClientSecret(userId);
  res.json(result);
}));

// Module 5: Kiểm tra và ôn tập
apiRouter.get('/exams/upcoming', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const exams = await examRepo.getByUserId(userId);
  res.json({ exams });
}));

apiRouter.post('/quizzes/generate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const examId = req.body?.examId;
  if (examId) {
    const quiz = await quizRepo.generateQuizForExam(userId, examId, req.body);
    return res.json({ quiz });
  }
  const materialId = req.body?.materialId;
  if (materialId) {
    const result = await materialProcessor.generateQuizFromMaterial(userId, materialId, req.body);
    return res.json(result);
  }
  res.status(400).json({ error: 'Cần cung cấp examId hoặc materialId để tạo đề ôn tập.' });
}));

apiRouter.post('/quizzes/:id/start', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const attempt = await quizRepo.startAttempt(userId, req.params.id);
  res.json({ attempt });
}));

apiRouter.post('/quizzes/:id/submit', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await quizRepo.submitAttempt(userId, req.params.id, req.body?.answers, req.body?.attemptId);
  res.json(result);
}));

apiRouter.get('/quiz-attempts/:id/result', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const quiz = await quizRepo.getById(userId, req.params.id, true);
  if (!quiz) return res.status(404).json({ error: 'Không tìm thấy bài làm.' });
  res.json({ quiz });
}));

// Module 6: Kho tài liệu
apiRouter.post('/materials/upload', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const intent = await materialRepo.createUploadIntent(userId, req.body);
  res.json(intent);
}));

apiRouter.post('/materials/:id/summarize', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await materialProcessor.processMaterial(userId, req.params.id);
  res.json(result);
}));

apiRouter.post('/materials/:id/generate-quiz', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await materialProcessor.generateQuizFromMaterial(userId, req.params.id, req.body || {});
  res.json(result);
}));

// Module 7: Báo cáo học tập
apiRouter.get('/reports/study-time', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const overview = await reportRepo.getOverview(userId, req.query as any);
  res.json({ period: overview.period, dailyStudy: overview.dailyStudy, summary: overview.summary });
}));

apiRouter.get('/reports/subjects', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const overview = await reportRepo.getOverview(userId, req.query as any);
  res.json({ subjectBreakdown: overview.subjectBreakdown });
}));

apiRouter.get('/reports/test-results', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const overview = await reportRepo.getOverview(userId, req.query as any);
  res.json({ topicMastery: overview.topicMastery, summary: overview.summary });
}));

// Module 8: Thông báo
apiRouter.post('/push/subscribe', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  await notificationRepo.savePushSubscription(userId, req.body);
  res.json({ success: true });
}));

apiRouter.patch('/notification-preferences', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const preferences = await notificationRepo.updatePreferences(userId, req.body);
  res.json({ preferences });
}));
