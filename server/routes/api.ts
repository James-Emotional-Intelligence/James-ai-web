import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { UserRepository } from '../repositories/user-repository';
import { AuthService } from '../services/auth-service';
import { AiAdapter } from '../services/ai-adapter';
import { DeterministicScheduler } from '../services/scheduler';
import { LoginRequestSchema, RegisterRequestSchema } from '../../shared/schemas';
import { env } from '../config/env';

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
import { db } from '../db/mysql';

export const apiRouter = Router();
const userRepo = UserRepository.getInstance();
const authService = AuthService.getInstance();

// Async route wrapper to prevent unhandled rejections
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Session Extraction Helper (supports Authorization: Bearer <token> & Cookie)
function getSessionToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) return bearerToken;
  }
  return req.cookies?.jami_session;
}

// Standard JSON error response helper
function sendError(res: Response, status: number, code: string, message: string, details?: any) {
  const requestId = 'req_' + crypto.randomUUID().substring(0, 16);
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
    return sendError(res, 401, 'UNAUTHORIZED', 'Chưa xác thực đăng nhập');
  }

  const session = await authService.getSession(sessionToken);
  if (!session) {
    authService.clearAuthCookie(res);
    return sendError(res, 401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ');
  }

  const user = await userRepo.findById(session.userId);
  if (!user || user.status !== 'active') {
    authService.clearAuthCookie(res);
    return sendError(res, 401, 'USER_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
  }

  (req as any).user = user;
  (req as any).userId = user.id;
  (req as any).session = session;
  next();
}

// Admin Protection Middleware (Independent admin secret key)
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (env.NODE_ENV !== 'production' && !env.ADMIN_SECRET_KEY) {
    return next();
  }
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = env.ADMIN_SECRET_KEY || env.SESSION_SECRET;
  if (adminKey && adminKey === expectedKey && adminKey !== 'jami-ai-production-secret-key-32-chars-min') {
    return next();
  }
  return sendError(res, 403, 'FORBIDDEN', 'Yêu cầu quyền quản trị viên');
}

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
    sendError(res, 500, 'MIGRATION_ERROR', err.message);
  }
}));

// ==========================================
// Authentication & User Identity Routes
// ==========================================

apiRouter.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Chưa đăng nhập');
  }

  const session = await authService.getSession(sessionToken);
  if (!session) {
    authService.clearAuthCookie(res);
    return sendError(res, 401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn');
  }

  const user = await userRepo.findById(session.userId);
  if (!user || user.status !== 'active') {
    authService.clearAuthCookie(res);
    return sendError(res, 401, 'USER_NOT_FOUND', 'Người dùng không tồn tại hoặc đã bị khóa');
  }

  const profile = await userRepo.getProfile(user.id);
  const { passwordHash, passwordSalt, ...safeUser } = user;

  res.json({
    user: safeUser,
    profile,
    isDemo: session.isDemo,
  });
}));

apiRouter.post('/auth/login', asyncHandler(async (req: Request, res: Response) => {
  const parseResult = LoginRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const { email, password, rememberMe } = parseResult.data;
  let user;
  try {
    user = await userRepo.findByEmail(email);
  } catch (dbErr: any) {
    if (env.APP_MODE === 'production') {
      return sendError(res, 503, 'DATABASE_UNAVAILABLE', 'Cơ sở dữ liệu đang bảo trì hoặc không thể kết nối');
    }
  }

  if (!user) {
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác');
  }

  const isPasswordValid = userRepo.verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!isPasswordValid) {
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác');
  }

  if (user.status !== 'active') {
    return sendError(res, 403, 'ACCOUNT_INACTIVE', 'Tài khoản của bạn đã bị khóa hoặc chưa kích hoạt');
  }

  let sessionToken: string;
  try {
    sessionToken = await authService.createSession(user.id, false, Boolean(rememberMe));
  } catch (sessErr: any) {
    return sendError(res, 500, 'SESSION_CREATE_FAILED', 'Không thể tạo phiên đăng nhập. Vui lòng thử lại.');
  }

  authService.setAuthCookie(res, sessionToken, Boolean(rememberMe));

  const profile = await userRepo.getProfile(user.id);
  const { passwordHash, passwordSalt, ...safeUser } = user;

  res.json({
    user: safeUser,
    profile,
    isDemo: false,
    token: sessionToken,
    message: 'Đăng nhập thành công',
  });
}));

apiRouter.post('/auth/demo-login', asyncHandler(async (req: Request, res: Response) => {
  if (!env.DEMO_LOGIN_ENABLED) {
    return sendError(res, 403, 'DEMO_DISABLED', 'Tài khoản demo đã bị vô hiệu hóa trên môi trường này.');
  }

  let demoUser = await userRepo.findByEmail('minh.hocsinh@jami.edu.vn');
  if (!demoUser) {
    demoUser = await userRepo.findById('usr_student_demo_01');
  }

  if (!demoUser) {
    return sendError(res, 500, 'DEMO_USER_MISSING', 'Không tìm thấy tài khoản demo');
  }

  const sessionToken = await authService.createSession(demoUser.id, true, true);
  authService.setAuthCookie(res, sessionToken, true);

  const profile = await userRepo.getProfile(demoUser.id);
  const { passwordHash, passwordSalt, ...safeUser } = demoUser;

  res.json({
    user: safeUser,
    profile,
    isDemo: true,
    token: sessionToken,
    message: 'Đăng nhập tài khoản Demo thành công',
  });
}));

apiRouter.post('/auth/register', asyncHandler(async (req: Request, res: Response) => {
  const parseResult = RegisterRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const issue = parseResult.error.issues[0];
    const errorMsg = issue?.message || 'Dữ liệu đăng ký không hợp lệ';
    return sendError(res, 400, 'VALIDATION_ERROR', errorMsg);
  }

  const { email, password, displayName, preferredName, gradeLevel } = parseResult.data;

  try {
    const { user, profile } = await userRepo.createUser({
      email,
      password,
      displayName,
      preferredName: preferredName || undefined,
      gradeLevel: Number(gradeLevel) || 9,
    });

    const sessionToken = await authService.createSession(user.id, false, true);
    authService.setAuthCookie(res, sessionToken, true);

    res.status(201).json({
      user,
      profile,
      isDemo: false,
      message: 'Tạo tài khoản thành công',
    });
  } catch (err: any) {
    if (err.message?.includes('đã được đăng ký')) {
      return sendError(res, 409, 'EMAIL_ALREADY_EXISTS', 'Email này đã được đăng ký. Vui lòng chuyển sang trang Đăng nhập.');
    }
    if (err.message?.includes('Cơ sở dữ liệu đang không khả dụng')) {
      return sendError(res, 503, 'DATABASE_UNAVAILABLE', 'Cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau.');
    }
    sendError(res, 400, 'REGISTRATION_FAILED', err.message || 'Đăng ký thất bại');
  }
}));

apiRouter.post('/auth/logout', asyncHandler(async (req: Request, res: Response) => {
  const sessionToken = getSessionToken(req);
  if (sessionToken) {
    await authService.revokeSession(sessionToken);
  }
  authService.clearAuthCookie(res);
  res.json({ success: true, message: 'Đăng xuất thành công' });
}));

apiRouter.post('/auth/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Vui lòng cung cấp địa chỉ email');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepo.findByEmail(normalizedEmail);

  if (user && db.isHealthy()) {
    try {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHmac('sha256', env.SESSION_SECRET).update(resetToken).digest('hex');
      const resetId = 'rst_' + crypto.randomUUID().substring(0, 24);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.execute(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, NOW(3))`,
        [resetId, user.id, tokenHash, expiresAt]
      );
    } catch (err: any) {
      console.warn('[JAMI Auth] Password reset token error:', err.message);
    }
  }

  res.json({
    success: true,
    message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được tạo.',
    emailServiceConfigured: Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY),
  });
}));

apiRouter.patch('/profile', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const updatedProfile = await userRepo.updateProfile(userId, req.body);
  res.json({ profile: updatedProfile });
}));

apiRouter.post('/onboarding/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const updatedProfile = await userRepo.updateProfile(userId, {
    ...req.body,
    onboardingCompletedAt: new Date().toISOString(),
  });
  res.json({ success: true, profile: updatedProfile });
}));

// ==========================================
// Dashboard Overview Aggregation Route
// ==========================================

apiRouter.get('/dashboard/overview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const profile = await userRepo.getProfile(userId);
  const timetables = await timetableRepo.getTimetableEntries(userId);
  const tasks = await taskRepo.getByUserId(userId);
  const exams = await examRepo.getByUserId(userId);
  const focusSessions = await focusRepo.getSessionsByUserId(userId);
  const materials = await materialRepo.getByUserId(userId);
  const notifications = await notificationRepo.getByUserId(userId);
  const chatMessages = await jamiRepo.getMessages(userId);

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const totalPlannedMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 45), 0);
  const completedMinutes = completedTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 45), 0);
  const completedPercent = totalPlannedMinutes > 0 ? Math.round((completedMinutes / totalPlannedMinutes) * 100) : 0;

  const totalFocusMinutes7Days = focusSessions.reduce((sum, s) => sum + (s.actualMinutes || s.durationMinutes || 0), 0);

  const upcomingExams = exams
    .filter((e) => e.status === 'upcoming')
    .sort((a, b) => new Date(a.examAt).getTime() - new Date(b.examAt).getTime());
  const nextExam = upcomingExams[0];
  let daysRemaining = 7;
  if (nextExam) {
    const diff = new Date(nextExam.examAt).getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const priorityTask = pendingTasks[0];
  const nextSession = timetables[0];
  const latestMessage = chatMessages[chatMessages.length - 1];

  res.json({
    studentName: user.preferredName || user.displayName || 'Học sinh',
    gradeLevel: profile?.gradeLevel || 9,
    timetable: {
      nextSessionTitle: nextSession ? `${nextSession.subjectName || nextSession.title}` : 'Ôn tập cá nhân',
      nextSessionTime: nextSession ? `${nextSession.startLocalTime} – ${nextSession.endLocalTime}` : '19:00 – 19:45',
      todaySessionsCount: timetables.length,
    },
    tasks: {
      priorityTaskTitle: priorityTask?.title || 'Chưa có nhiệm vụ ưu tiên',
      priorityTaskId: priorityTask?.id,
      pendingCount: pendingTasks.length,
    },
    todayStudy: {
      completedMinutes,
      plannedMinutes: totalPlannedMinutes,
      completedPercent,
      streakDays: 4,
    },
    jami: {
      latestMessage: latestMessage?.text || 'Chào bạn! Jami đã sẵn sàng đồng hành cùng bạn.',
      conversationStatus: 'active',
    },
    exams: {
      upcomingTitle: nextExam?.title || 'Kỳ kiểm tra sắp tới',
      daysRemaining,
    },
    reports: {
      totalFocusMinutes7Days,
      trendLabel: 'Duy trì nhịp độ học tập ổn định',
    },
    materials: {
      totalMaterialsCount: materials.length,
      latestMaterialTitle: materials[0]?.title || 'Tài liệu mới',
    },
    notifications: {
      unreadCount: notifications.filter((n) => n.status === 'unread').length,
      latestTitle: notifications[0]?.title || 'Thông báo hệ thống',
    },
  });
}));

// ==========================================
// 8 Modules Business Logic (Full MySQL Persistence)
// ==========================================

// 1. LỊCH HỌC THÔNG MINH (Timetable & Subjects)
apiRouter.get('/subjects', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const subjects = await subjectRepo.getByUserId(userId);
  res.json({ subjects });
}));

apiRouter.post('/subjects', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const subject = await subjectRepo.create(userId, req.body);
  res.json({ subject });
}));

apiRouter.delete('/subjects/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await subjectRepo.delete(userId, req.params.id);
  res.json({ success });
}));

apiRouter.get('/timetables', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const entries = await timetableRepo.getTimetableEntries(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  res.json({ entries, busyEvents });
}));

apiRouter.post('/busy-events', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const event = await timetableRepo.createBusyEvent(userId, req.body);
  res.json({ event });
}));

apiRouter.delete('/busy-events/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await timetableRepo.deleteBusyEvent(userId, req.params.id);
  res.json({ success });
}));

// 2. CHI TIẾT CÔNG VIỆC & NHIỆM VỤ HỌC TẬP (Tasks & Execution Guides)
apiRouter.get('/tasks', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const tasks = await taskRepo.getByUserId(userId);
  res.json({ tasks });
}));

apiRouter.get('/tasks/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.getById(userId, req.params.id);
  if (!task) return sendError(res, 404, 'NOT_FOUND', 'Nhiệm vụ không tồn tại');
  res.json({ task });
}));

apiRouter.patch('/tasks/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.update(userId, req.params.id, req.body);
  if (!task) return sendError(res, 404, 'NOT_FOUND', 'Nhiệm vụ không tồn tại');
  res.json({ task });
}));

apiRouter.post('/tasks/:id/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.completeTask(userId, req.params.id);
  if (!task) return sendError(res, 404, 'NOT_FOUND', 'Nhiệm vụ không tồn tại');
  res.json({ task });
}));

apiRouter.post('/tasks/:id/steps/:stepId/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.completeStep(userId, req.params.id, req.params.stepId);
  if (!task) return sendError(res, 404, 'NOT_FOUND', 'Nhiệm vụ không tồn tại');
  res.json({ task });
}));

apiRouter.post('/tasks/:id/evidence', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const evidence = await taskRepo.addEvidence(userId, {
    ...req.body,
    taskId: req.params.id,
  });
  res.json({ evidence });
}));

// 3. ĐỒNG HỒ TẬP TRUNG (Focus Sessions)
apiRouter.get('/focus-sessions/current', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.getCurrentActiveSession(userId);
  res.json({ session });
}));

apiRouter.post('/focus-sessions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { taskId, mode, minutes } = req.body;
  const session = await focusRepo.startSession(userId, taskId, mode, minutes);
  res.json({ session });
}));

apiRouter.post('/focus-sessions/:id/pause', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.pauseSession(userId, req.params.id);
  res.json({ session });
}));

apiRouter.post('/focus-sessions/:id/resume', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.resumeSession(userId, req.params.id);
  res.json({ session });
}));

apiRouter.post('/focus-sessions/:id/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.completeSession(userId, req.params.id, req.body.notes);
  res.json({ session });
}));

apiRouter.post('/focus-sessions/:id/abandon', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const session = await focusRepo.abandonSession(userId, req.params.id, req.body.notes);
  res.json({ session });
}));

// 4. KỲ THI & ĐỀ LUYỆN TẬP (Exams & Quizzes)
apiRouter.get('/exams', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const exams = await examRepo.getByUserId(userId);
  res.json({ exams });
}));

apiRouter.post('/exams', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const exam = await examRepo.create(userId, req.body);
  res.json({ exam });
}));

apiRouter.get('/quizzes', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const quizzes = await quizRepo.getByUserId(userId);
  res.json({ quizzes });
}));

apiRouter.get('/quizzes/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const quiz = await quizRepo.getById(userId, req.params.id);
  if (!quiz) return sendError(res, 404, 'NOT_FOUND', 'Đề kiểm tra không tồn tại');
  res.json({ quiz });
}));

apiRouter.post('/quizzes/:id/attempts/submit', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { answers } = req.body;
  const attemptResult = await quizRepo.submitAttempt(userId, req.params.id, answers || []);
  res.json(attemptResult);
}));

// 5. TÀI LIỆU HỌC TẬP (Learning Materials)
apiRouter.get('/materials', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const materials = await materialRepo.getByUserId(userId);
  res.json({ materials });
}));

apiRouter.post('/materials', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const material = await materialRepo.create(userId, req.body);
  res.json({ material });
}));

apiRouter.delete('/materials/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await materialRepo.delete(userId, req.params.id);
  res.json({ success });
}));

// 6. BÁO CÁO & PHÂN TÍCH TIẾN ĐỘ (Progress Reports)
apiRouter.get('/reports/overview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const overview = await reportRepo.getOverview(userId);
  res.json(overview);
}));

// 7. TRỢ LÝ ĐỒNG HÀNH JAMI AI & PLANNER (Real MySQL Chat & Action Confirmation)

apiRouter.get('/jami/messages', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  let messages = await jamiRepo.getMessages(userId);

  if (messages.length === 0) {
    const greeting = await jamiRepo.saveMessage(userId, {
      sender: 'jami',
      text: 'Chào bạn! Jami là trợ lý đồng hành học tập của bạn. Bạn cần Jami giải thích bài học, xem lịch hôm nay hay nhắc nhở mục tiêu gì nào?',
      emotion: 'idle',
      suggestedActions: [
        'Hôm nay có lịch học gì?',
        'Giải thích cách vẽ đồ thị hàm số y = ax + b',
        'Tôi bận tối nay, dời lịch học giúp tôi',
      ],
    });
    messages = [greeting];
  }

  res.json({ messages });
}));

apiRouter.post('/jami/chat', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Vui lòng cung cấp nội dung tin nhắn');
  }

  const user = (req as any).user;
  const profile = await userRepo.getProfile(userId);
  const tasks = await taskRepo.getByUserId(userId);
  const exams = await examRepo.getByUserId(userId);

  // 1. Save user message in MySQL
  const userMsgRecord = await jamiRepo.saveMessage(userId, {
    sender: 'user',
    text: message.trim(),
  });

  // 2. Query AI / AI Adapter
  const contextData = {
    userName: user.preferredName || user.displayName,
    gradeLevel: profile?.gradeLevel || 9,
    pendingTasksCount: tasks.filter((t) => t.status === 'pending').length,
    upcomingExamsCount: exams.filter((e) => e.status === 'upcoming').length,
  };

  const reply = await AiAdapter.generateJamiChat(message, contextData);

  let proposalId: string | undefined = undefined;
  let requiresConfirmation = Boolean(reply.requiresConfirmation);
  let confirmationSummary = reply.confirmationSummary;

  // Real Proposal trigger when replan or schedule adjustment is requested
  if (message.toLowerCase().includes('dời lịch') || message.toLowerCase().includes('bận') || reply.requiresConfirmation) {
    const proposal = DeterministicScheduler.generateProposal(
      userId,
      profile || ({} as any),
      tasks.filter((t) => t.status !== 'completed'),
      [],
      await timetableRepo.getBusyEvents(userId),
      await timetableRepo.getTimetableEntries(userId),
      new Date(),
      7,
      'Điều chỉnh lịch theo yêu cầu hội thoại Jami'
    );

    await plannerRepo.saveProposal(proposal);
    proposalId = proposal.id;
    requiresConfirmation = true;
    confirmationSummary = confirmationSummary || 'Jami đã tính toán lại khung thời gian tối ưu cho bạn. Bạn có muốn áp dụng lịch mới không?';
  }

  // 3. Save Jami response in MySQL
  const replyMsgRecord = await jamiRepo.saveMessage(userId, {
    sender: 'jami',
    text: reply.message,
    emotion: reply.emotion || 'idle',
    suggestedActions: reply.suggestedActions || [],
    requiresConfirmation,
    confirmationSummary,
    proposalId,
  });

  res.json({
    userMessage: userMsgRecord,
    replyMessage: replyMsgRecord,
    reply,
    isDemoMode: !AiAdapter.isConfigured(),
  });
}));

apiRouter.post('/jami/messages/:id/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const messageId = req.params.id;

  const messages = await jamiRepo.getMessages(userId);
  const targetMsg = messages.find((m) => m.id === messageId);

  if (!targetMsg) {
    return sendError(res, 404, 'NOT_FOUND', 'Không tìm thấy tin nhắn');
  }

  if (targetMsg.proposalId) {
    await plannerRepo.confirmProposal(userId, targetMsg.proposalId);
  }

  const updatedMsg = await jamiRepo.confirmMessageAction(userId, messageId);

  res.json({
    success: true,
    message: updatedMsg || { ...targetMsg, isConfirmed: true },
  });
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

apiRouter.post('/jami/realtime/session', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  if (AiAdapter.isConfigured()) {
    return res.json({
      mode: 'openai_realtime',
      clientSecret: process.env.OPENAI_API_KEY ? 'active_server_proxy' : undefined,
      message: 'Phiên thoại thời gian thực OpenAI Realtime đã sẵn sàng.',
    });
  }
  res.json({
    mode: 'demo_simulation',
    message: 'Đang chạy mô phỏng giọng nói Jami thông minh.',
  });
}));

apiRouter.post('/planner/voice-goal/preview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { transcript } = req.body;
  const profile = (await userRepo.getProfile(userId)) || {
    userId,
    gradeLevel: 9,
    schoolName: 'THCS',
    goals: [],
    preferredSessionMinutes: 45,
    maxDailyStudyMinutes: 180,
    energyPreferences: { morning: 'medium' as const, afternoon: 'medium' as const, evening: 'high' as const },
    sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
    mealTimes: { lunch: '11:45', dinner: '18:30' },
  };

  const extraction = await AiAdapter.extractGoalFromText(transcript || 'Lập kế hoạch ôn thi');
  const decomposition = await AiAdapter.decomposeTask(extraction.transcript, extraction.subject);

  const timetables = await timetableRepo.getTimetableEntries(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  const existingTasks = await taskRepo.getByUserId(userId);

  const proposalTasks = decomposition.tasks.map((t, idx) => ({
    id: `prop_task_${idx + 1}`,
    userId,
    subjectId: 'subj-math',
    subjectName: extraction.subject,
    title: t.title,
    objective: t.objective,
    status: 'pending' as const,
    priority: t.priority as any,
    difficulty: t.difficulty as any,
    estimatedMinutes: t.estimatedMinutes,
    minSessionMinutes: t.minSessionMinutes,
    maxSessionMinutes: t.maxSessionMinutes,
    splittable: t.splittable,
    locked: false,
    completionPercent: 0,
    source: 'voice_proposal',
  }));

  const proposal = DeterministicScheduler.generateProposal(
    userId,
    profile,
    proposalTasks,
    existingTasks,
    busyEvents,
    timetables,
    new Date(),
    7,
    `Lập kế hoạch ôn tập: ${extraction.subject}`
  );

  await plannerRepo.saveProposal(proposal);

  res.json({
    extraction,
    decomposition,
    proposal,
    isDemoMode: !AiAdapter.isConfigured(),
  });
}));

apiRouter.post('/planner/proposals/:id/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await plannerRepo.confirmProposal(userId, req.params.id);
  res.json(result);
}));

apiRouter.post('/planner/replan/preview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const profile = (await userRepo.getProfile(userId)) || {
    userId,
    gradeLevel: 9,
    schoolName: 'THCS',
    goals: [],
    preferredSessionMinutes: 45,
    maxDailyStudyMinutes: 180,
    energyPreferences: { morning: 'medium' as const, afternoon: 'medium' as const, evening: 'high' as const },
    sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
    mealTimes: { lunch: '11:45', dinner: '18:30' },
  };

  const existingTasks = await taskRepo.getByUserId(userId);
  const pendingTasks = existingTasks.filter((t) => t.status !== 'completed');
  const timetables = await timetableRepo.getTimetableEntries(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);

  const proposal = DeterministicScheduler.generateProposal(
    userId,
    profile,
    pendingTasks,
    [],
    busyEvents,
    timetables,
    new Date(),
    7,
    'Tối ưu hóa và sắp xếp lại lịch học thông minh'
  );

  await plannerRepo.saveProposal(proposal);

  res.json({ proposal });
}));

apiRouter.post('/materials/:id/generate-quiz', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const mat = await materialRepo.getById(userId, req.params.id);
  if (!mat) return sendError(res, 404, 'NOT_FOUND', 'Tài liệu không tồn tại');

  const questions = [
    {
      prompt: `Nội dung cốt lõi của tài liệu "${mat.title}" là gì?`,
      options: [
        'Hệ thống công thức và phương pháp giải phương trình',
        'Lịch sử hình thành các định lý toán học cổ đại',
        'Quy tắc chấm điểm bài tập làm văn',
        'Hướng dẫn thực hành thí nghiệm vật lý',
      ],
      correctAnswer: 'Hệ thống công thức và phương pháp giải phương trình',
      explanation: 'Tài liệu tập trung tóm tắt phương pháp giải và các dạng bài tập thực hành trọng tâm.',
      difficulty: 'medium' as const,
      type: 'multiple_choice' as const,
    },
    {
      prompt: 'Khi giải dạng toán rút gọn biểu thức chứa căn, điều kiện nào cần kiểm tra đầu tiên?',
      options: [
        'Điều kiện xác định của biểu thức (mẫu khác 0, biểu thức dưới căn không âm)',
        'Quy đồng mẫu số ngay lập tức',
        'Bình phương hai vế',
        'Đặt ẩn phụ không cần điều kiện',
      ],
      correctAnswer: 'Điều kiện xác định của biểu thức (mẫu khác 0, biểu thức dưới căn không âm)',
      explanation: 'Điều kiện xác định là bước bắt buộc để tránh mất điểm trình bày trong barem chấm thi.',
      difficulty: 'easy' as const,
      type: 'multiple_choice' as const,
    },
  ];

  const quiz = await quizRepo.createQuizWithQuestions(
    userId,
    {
      title: `Đề luyện tập từ: ${mat.title}`,
      subjectId: mat.subjectId,
      subjectName: mat.subjectName,
      type: 'practice',
      difficulty: 'medium',
    },
    questions
  );

  res.json({ quiz });
}));

// 8. THÔNG BÁO (Notifications)
apiRouter.get('/notifications', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const notifications = await notificationRepo.getByUserId(userId);
  res.json({ notifications });
}));

apiRouter.post('/notifications/:id/read', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await notificationRepo.markAsRead(userId, req.params.id);
  res.json({ success });
}));

apiRouter.post('/notifications/read-all', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  await notificationRepo.markAllAsRead(userId);
  res.json({ success: true });
}));

// Export User Data (Genuine JSON Export)
apiRouter.get('/me/export', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = await userRepo.findById(userId);
  const profile = await userRepo.getProfile(userId);
  const subjects = await subjectRepo.getByUserId(userId);
  const tasks = await taskRepo.getByUserId(userId);
  const exams = await examRepo.getByUserId(userId);
  const timetables = await timetableRepo.getTimetableEntries(userId);
  const busyEvents = await timetableRepo.getBusyEvents(userId);
  const focusSessions = await focusRepo.getSessionsByUserId(userId);
  const materials = await materialRepo.getByUserId(userId);
  const notifications = await notificationRepo.getByUserId(userId);
  const jamiPreferences = await jamiRepo.getPreferences(userId);

  const { passwordHash, passwordSalt, ...safeUser } = user || ({} as any);

  const exportData = {
    metadata: {
      platform: 'Jami AI Educational Platform',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
    },
    user: safeUser,
    profile,
    subjects,
    tasks,
    exams,
    timetables,
    busyEvents,
    focusSessions,
    materials,
    notifications,
    jamiPreferences,
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="jami_data_export.json"');
  res.send(JSON.stringify(exportData, null, 2));
}));

// API 404 Handler: Guaranteed JSON response for all /api/v1/* routes
apiRouter.use('*', (req: Request, res: Response) => {
  sendError(res, 404, 'NOT_FOUND', `Không tìm thấy API endpoint: ${req.method} ${req.originalUrl}`);
});

// Central Error Handler for /api/v1
apiRouter.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[JAMI API Error]:', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  const message = env.NODE_ENV === 'production' && status === 500
    ? 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.'
    : (err.message || 'Lỗi xử lý yêu cầu');
  sendError(res, status, err.code || 'INTERNAL_ERROR', message);
});
