import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
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
  SubjectQuizGenerateSchema,
  QuizRetakeWrongSchema,
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
  TimetableExceptionCreateSchema,
  ClassSessionCheckinSubmitSchema,
  TomorrowPlanGenerateRequestSchema,
  TomorrowPlanEnergyUpdateRequestSchema,
  TomorrowPlanItemUpdateRequestSchema,
  ExamStudyPlanGenerateSchema,
  ExamStudyPlanItemUpdateSchema,
  ExamStudyPlanReplanConfirmSchema,
  MistakeCreateSchema,
  MistakeUpdateSchema,
  MistakeReviewSubmitSchema,
  BusyEventExceptionCreateSchema,
  BookUploadIntentSchema,
  BookProgressUpdateSchema,
  BookBookmarkCreateSchema,
  BookHighlightCreateSchema,
  BookStudyAidRequestSchema,
  AdminTopUpWalletSchema,
  AdminDeductWalletSchema,
  AdminSetUnlimitedWalletSchema,
  AdminSetWalletStatusSchema,
  AdminCreateRegistrationCodeSchema,
  AdminRevokeRegistrationCodeSchema,
} from '../../shared/schemas';
import { env, isProduction, isProductionRuntime, isDatabaseRequired, isDemoMode } from '../config/env';
import { createRateLimiter, aiRateLimiter, authRateLimiter } from '../middleware/rate-limit';
import { z } from 'zod';
import { StudyTask, StudentProfile, Material } from '../../shared/types';
import {
  EmailAlreadyExistsError,
  DatabaseUnavailableError,
  DbSchemaIncompatibleError,
} from '../errors/app-errors';

import { db } from '../db/mysql';
import { subjectRepo } from '../repositories/subject-repository';
import { timetableRepo } from '../repositories/timetable-repository';
import { sessionCheckinRepo } from '../repositories/session-checkin-repository';
import { tomorrowPlanRepo } from '../repositories/tomorrow-plan-repository';
import { tomorrowPlanService } from '../services/tomorrow-plan-service';
import { examStudyPlanRepo } from '../repositories/exam-study-plan-repository';
import { examStudyPlanService } from '../services/exam-study-plan-service';
import { mistakeRepo } from '../repositories/mistake-repository';
import { taskRepo } from '../repositories/task-repository';
import { bookRepo } from '../repositories/book-repository';
import { bookParserService } from '../services/book-parser-service';
import { bookStudyAidService } from '../services/book-study-aid-service';
import { materialWorker } from '../services/material-worker-service';
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
import { jamiOrchestrator } from '../services/jami-orchestrator';
import { executeRegisteredTool } from '../ai/tool-registry';
import { notificationScheduler } from '../services/notification-scheduler-service';
import {
  storageService,
  validateMagicBytes,
  getSafeExtension,
  generateMaterialStorageKey,
  getUserDirHash,
  sanitizeFileName,
} from '../services/storage-service';
import { materialProcessor } from '../services/material-processor';
import { aiBillingService } from '../services/ai-billing-service';
import { registrationCodeService } from '../services/registration-code-service';
import { aiWalletRepo } from '../repositories/ai-wallet-repository';

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

const lastTouchMap = new Map<string, number>();
function maybeTouchLastActive(userId: string) {
  const now = Date.now();
  const last = lastTouchMap.get(userId) || 0;
  if (now - last > 60000) {
    lastTouchMap.set(userId, now);
    userRepo.touchLastActive(userId).catch(() => {});
  }
}

// Auth Middleware
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
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
    maybeTouchLastActive(user.id);
    next();
  } catch (err: any) {
    console.error('[API requireAuth ERROR]:', err.message);
    return sendError(
      req,
      res,
      503,
      'DATABASE_UNAVAILABLE',
      'Kết nối cơ sở dữ liệu tạm thời gián đoạn. Vui lòng tải lại trang hoặc thử lại.'
    );
  }
}

// Admin Protection Middleware (Timing safe ADMIN_SECRET_KEY or role === 'admin' session check)
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Check x-admin-key header first
  const adminKey = req.headers['x-admin-key'];
  if (env.ADMIN_SECRET_KEY && adminKey && typeof adminKey === 'string') {
    try {
      const keyBuf = Buffer.from(adminKey);
      const expectedBuf = Buffer.from(env.ADMIN_SECRET_KEY);
      if (keyBuf.length === expectedBuf.length && crypto.timingSafeEqual(keyBuf, expectedBuf)) {
        return next();
      }
    } catch {}
  }

  // 2. Check authenticated session user role
  const sessionToken = getSessionToken(req);
  if (sessionToken) {
    try {
      const session = await authService.getSession(sessionToken);
      if (session) {
        const user = await userRepo.findById(session.userId);
        if (user && user.status === 'active' && user.role === 'admin') {
          (req as any).user = user;
          (req as any).userId = user.id;
          (req as any).session = session;
          return next();
        }
      }
    } catch {}
  }

  return sendError(req, res, 403, 'FORBIDDEN', 'Yêu cầu quyền quản trị viên (Admin)');
}

// Multer Disk Storage Configuration (Streaming directly to storage/temporary)
const tempUploadDir = path.resolve(process.cwd(), env.LOCAL_STORAGE_ROOT || './storage', 'temporary');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const uploadDisk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, tempUploadDir);
    },
    filename: (_req, _file, cb) => {
      const uniqueName = `upload-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.tmp`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: Math.max(env.MATERIAL_MAX_UPLOAD_MB || 25, env.BOOK_MAX_UPLOAD_MB || 100) * 1024 * 1024,
  },
});

// ==========================================
// Health & Diagnostic Routes
// ==========================================

apiRouter.get(['/meta/version', '/version'], (_req: Request, res: Response) => {
  res.json({
    appVersion: '1.0.0',
    commitSha: process.env.GIT_COMMIT_SHA || 'local-dev',
    buildTime: process.env.BUILD_TIME || new Date().toISOString(),
    runtime: 'node',
    storageDriver: env.STORAGE_DRIVER || 'local',
  });
});

apiRouter.get('/health/live', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.get('/health/ready', asyncHandler(async (req: Request, res: Response) => {
  const doctor = await runDbDoctor();
  const isHealthy = doctor.status === 'healthy';
  const storageCheck = await storageService.checkStorageReady();

  if ((!isHealthy || !storageCheck.ready) && isProduction) {
    return res.status(503).json({
      status: 'unhealthy',
      database: doctor.status,
      storage: storageCheck.ready ? 'ready' : (storageCheck.details || 'unhealthy'),
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    status: 'ready',
    mode: env.APP_MODE,
    database: doctor.status,
    aiConfigured: AiAdapter.isConfigured(),
    storage: {
      driver: storageCheck.driver,
      ready: storageCheck.ready,
      freeMb: storageCheck.freeMb,
    },
    timestamp: new Date().toISOString(),
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
// Admin User Management Routes
// ==========================================

apiRouter.get('/admin/users', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';

  const result = await userRepo.getAllUsers({ search: q, status });
  res.json(result);
}));

apiRouter.post('/admin/users/:id/ban', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const currentAdminId = (req as any).userId;

  if (userId === currentAdminId) {
    return sendError(req, res, 400, 'CANNOT_BAN_SELF', 'Không thể tự khóa tài khoản quản trị viên của chính mình.');
  }

  const targetUser = await userRepo.findById(userId);
  if (!targetUser) {
    return sendError(req, res, 404, 'USER_NOT_FOUND', 'Người dùng không tồn tại.');
  }

  if (targetUser.role === 'admin') {
    const activeAdmins = await userRepo.countActiveAdmins();
    if (activeAdmins <= 1) {
      return sendError(req, res, 400, 'CANNOT_BAN_LAST_ADMIN', 'Không thể khóa tài khoản quản trị viên duy nhất của hệ thống.');
    }
  }

  const updated = await userRepo.setUserStatus(userId, 'banned');
  res.json({ success: true, user: updated, message: `Đã khóa tài khoản ${updated.email} thành công.` });
}));

apiRouter.post('/admin/users/:id/unban', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const targetUser = await userRepo.findById(userId);
  if (!targetUser) {
    return sendError(req, res, 404, 'USER_NOT_FOUND', 'Người dùng không tồn tại.');
  }

  const updated = await userRepo.setUserStatus(userId, 'active');
  res.json({ success: true, user: updated, message: `Đã mở khóa tài khoản ${updated.email} thành công.` });
}));

apiRouter.post('/admin/users/:id/role', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const { role } = req.body;

  if (role !== 'admin' && role !== 'user') {
    return sendError(req, res, 400, 'INVALID_ROLE', 'Vai trò chỉ có thể là admin hoặc user.');
  }

  const currentAdminId = (req as any).userId;
  if (userId === currentAdminId && role !== 'admin') {
    return sendError(req, res, 400, 'CANNOT_DEMOTE_SELF', 'Không thể tự gỡ bỏ quyền admin của chính mình.');
  }

  const targetUser = await userRepo.findById(userId);
  if (!targetUser) {
    return sendError(req, res, 404, 'USER_NOT_FOUND', 'Người dùng không tồn tại.');
  }

  if (targetUser.role === 'admin' && role !== 'admin') {
    const activeAdmins = await userRepo.countActiveAdmins();
    if (activeAdmins <= 1) {
      return sendError(req, res, 400, 'CANNOT_DEMOTE_LAST_ADMIN', 'Không thể hạ quyền quản trị viên duy nhất của hệ thống.');
    }
  }

  const updated = await userRepo.setUserRole(userId, role);
  res.json({ success: true, user: updated, message: `Đã cập nhật quyền thành công.` });
}));

apiRouter.delete('/admin/users/:id', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const currentAdminId = (req as any).userId;

  if (userId === currentAdminId) {
    return sendError(req, res, 400, 'CANNOT_DELETE_SELF', 'Không thể tự xóa tài khoản quản trị viên của chính mình.');
  }

  const targetUser = await userRepo.findById(userId);
  if (!targetUser) {
    return sendError(req, res, 404, 'USER_NOT_FOUND', 'Người dùng không tồn tại.');
  }

  if (targetUser.role === 'admin') {
    const activeAdmins = await userRepo.countActiveAdmins();
    if (activeAdmins <= 1) {
      return sendError(req, res, 400, 'CANNOT_DELETE_LAST_ADMIN', 'Không thể xóa tài khoản quản trị viên duy nhất của hệ thống.');
    }
  }

  await userRepo.deleteUser(userId);
  res.json({ success: true, message: `Đã xóa tài khoản ${targetUser.email} thành công.` });
}));

// ==========================================
// Admin AI Wallet & Registration Code Routes
// ==========================================

apiRouter.get('/admin/users/:id/ai-wallet', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const targetUser = await userRepo.findById(userId);
  if (!targetUser) {
    return sendError(req, res, 404, 'USER_NOT_FOUND', 'Người dùng không tồn tại.');
  }
  const wallet = await aiWalletRepo.getWallet(userId);
  const view = await aiBillingService.getWalletView(userId);
  res.json({ user: targetUser, wallet, view });
}));

apiRouter.get('/admin/users/:id/ai-wallet/transactions', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const resData = await aiBillingService.getTransactions(userId, { limit });
  res.json(resData);
}));

apiRouter.post('/admin/users/:id/ai-wallet/top-up', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const adminUserId = (req as any).userId || 'system_admin';
  const validated = AdminTopUpWalletSchema.safeParse(req.body);
  if (!validated.success) {
    return sendError(req, res, 400, 'INVALID_INPUT', 'Dữ liệu nạp ngân sách không hợp lệ.', validated.error.flatten());
  }

  const result = await aiBillingService.adminTopUp({
    targetUserId: userId,
    actorUserId: adminUserId,
    amountVnd: validated.data.amountVnd,
    reason: validated.data.reason,
    idempotencyKey: validated.data.idempotencyKey,
  });

  res.json({ success: true, ...result, message: `Đã nạp ${validated.data.amountVnd.toLocaleString('vi-VN')}đ thành công.` });
}));

apiRouter.post('/admin/users/:id/ai-wallet/deduct', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const adminUserId = (req as any).userId || 'system_admin';
  const validated = AdminDeductWalletSchema.safeParse(req.body);
  if (!validated.success) {
    return sendError(req, res, 400, 'INVALID_INPUT', 'Dữ liệu trừ ngân sách không hợp lệ.', validated.error.flatten());
  }

  const result = await aiBillingService.adminDeduct({
    targetUserId: userId,
    actorUserId: adminUserId,
    amountVnd: validated.data.amountVnd,
    reason: validated.data.reason,
    idempotencyKey: validated.data.idempotencyKey,
  });

  res.json({ success: true, ...result, message: `Đã trừ ${validated.data.amountVnd.toLocaleString('vi-VN')}đ thành công.` });
}));

apiRouter.patch('/admin/users/:id/ai-wallet/unlimited', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const adminUserId = (req as any).userId || 'system_admin';
  const validated = AdminSetUnlimitedWalletSchema.safeParse(req.body);
  if (!validated.success) {
    return sendError(req, res, 400, 'INVALID_INPUT', 'Dữ liệu gói không giới hạn không hợp lệ.', validated.error.flatten());
  }

  await aiBillingService.adminSetUnlimited({
    targetUserId: userId,
    actorUserId: adminUserId,
    unlimitedForever: validated.data.unlimitedForever,
    unlimitedUntil: validated.data.unlimitedUntil,
    reason: validated.data.reason,
    idempotencyKey: validated.data.idempotencyKey,
  });

  res.json({ success: true, message: `Đã cập nhật trạng thái không giới hạn thành công.` });
}));

apiRouter.patch('/admin/users/:id/ai-wallet/status', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const adminUserId = (req as any).userId || 'system_admin';
  const validated = AdminSetWalletStatusSchema.safeParse(req.body);
  if (!validated.success) {
    return sendError(req, res, 400, 'INVALID_INPUT', 'Dữ liệu trạng thái ví không hợp lệ.', validated.error.flatten());
  }

  await aiBillingService.adminSetStatus({
    targetUserId: userId,
    actorUserId: adminUserId,
    aiEnabled: validated.data.aiEnabled,
    reason: validated.data.reason,
    idempotencyKey: validated.data.idempotencyKey,
  });

  res.json({ success: true, message: `Đã cập nhật trạng thái hoạt động của ví AI thành công.` });
}));

apiRouter.get('/admin/registration-codes', requireAdmin, asyncHandler(async (_req: Request, res: Response) => {
  const codes = await registrationCodeService.listCodes();
  res.json({ codes });
}));

apiRouter.post('/admin/registration-codes', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const adminUserId = (req as any).userId || 'system_admin';
  const validated = AdminCreateRegistrationCodeSchema.safeParse(req.body);
  if (!validated.success) {
    return sendError(req, res, 400, 'INVALID_INPUT', 'Dữ liệu tạo mã đăng ký không hợp lệ.', validated.error.flatten());
  }

  const created = await registrationCodeService.createCode(adminUserId, {
    rewardType: validated.data.rewardType,
    creditVnd: validated.data.creditVnd,
    unlimitedForever: validated.data.unlimitedForever,
    unlimitedUntil: validated.data.unlimitedUntil,
    maxRedemptions: validated.data.maxRedemptions,
    startsAt: validated.data.startsAt,
    expiresAt: validated.data.expiresAt,
    note: validated.data.note,
  });

  res.json({
    success: true,
    code: created,
    message: 'Đã tạo mã đăng ký thành công. Hãy sao chép và lưu mã ngay vì mã chỉ hiển thị một lần duy nhất.',
  });
}));

apiRouter.post('/admin/registration-codes/:id/revoke', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const codeId = req.params.id;
  const adminUserId = (req as any).userId || 'system_admin';
  const validated = AdminRevokeRegistrationCodeSchema.safeParse(req.body);
  const reason = validated.success ? validated.data.reason : 'Quản trị viên thu hồi mã';

  await registrationCodeService.revokeCode(adminUserId, codeId, reason);
  res.json({ success: true, message: 'Đã thu hồi mã đăng ký thành công.' });
}));

// ==========================================
// User AI Wallet Endpoints
// ==========================================

apiRouter.get('/ai-wallet/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const walletView = await aiBillingService.getWalletView(userId);
  res.json({
    wallet: walletView,
    usdToVndRate: env.AI_USD_TO_VND_RATE || 26000,
    lowBalanceWarningVnd: env.AI_LOW_BALANCE_WARNING_VND || 2000,
  });
}));

apiRouter.get('/ai-wallet/me/transactions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const resData = await aiBillingService.getTransactions(userId, { limit });
  res.json(resData);
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
    if (dbErr instanceof DbSchemaIncompatibleError || dbErr.code === 'DB_SCHEMA_INCOMPATIBLE') {
      return sendError(req, res, 503, 'DB_SCHEMA_INCOMPATIBLE', 'Cơ sở dữ liệu chưa đồng bộ lược đồ phiên bản mới nhất.');
    }
    if (dbErr instanceof DatabaseUnavailableError || dbErr.code === 'DATABASE_UNAVAILABLE') {
      return sendError(req, res, 503, 'DATABASE_UNAVAILABLE', 'Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.');
    }
    return sendError(req, res, 503, 'DATABASE_UNAVAILABLE', 'Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.');
  }

  if (!user) {
    return sendError(req, res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác');
  }

  if (user.passwordScheme === 'legacy_unknown') {
    return sendError(
      req,
      res,
      400,
      'PASSWORD_RESET_REQUIRED',
      'Định dạng mật khẩu cũ cần được cập nhật. Vui lòng sử dụng tính năng Quên mật khẩu để thiết lập mật khẩu mới an toàn.'
    );
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

  const { email, password, displayName, preferredName, gradeLevel, registrationCode } = parseResult.data;
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
      registrationCode: registrationCode ? registrationCode.trim() : undefined,
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
      err.name === 'InvalidRegistrationCodeError' ||
      err.code === 'INVALID_REGISTRATION_CODE' ||
      err.message?.includes('Mã không hợp lệ') ||
      err.message?.includes('không còn khả dụng')
    ) {
      return sendError(req, res, 400, 'INVALID_REGISTRATION_CODE', 'Mã ưu đãi không hợp lệ, đã hết hạn hoặc hết lượt sử dụng. Bạn có thể xóa mã để đăng ký nhận 25.000đ mặc định.');
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
  const activeTimetable = await timetableRepo.getActiveTimetable(userId);
  const timetableEntries = activeTimetable?.id
    ? await timetableRepo.getTimetableEntries(userId, activeTimetable.id, todayDateStr)
    : await timetableRepo.getTimetableEntries(userId, undefined, todayDateStr);
  const todayTimetable = timetableEntries.filter((e) => Number(e.dayOfWeek) === localDayOfWeek && !e.isSkippedThisWeek);
  
  const allBusyEvents = await timetableRepo.getBusyEvents(userId);
  const currentDayDate = new Date(`${todayDateStr}T00:00:00`);

  const filteredTodayBusyEvents = allBusyEvents.filter((b) => {
    if (b.recurrenceRule) {
      const rule = b.recurrenceRule;
      const start = new Date(b.startsAt);

      // Check UNTIL date if present
      const untilMatch = rule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
      if (untilMatch) {
        const untilDate = new Date(Number(untilMatch[1]), Number(untilMatch[2]) - 1, Number(untilMatch[3]), 23, 59, 59);
        if (currentDayDate > untilDate) return false;
      }

      // Check not before start date
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      if (currentDayDate < startDay) return false;

      if (rule.includes('FREQ=DAILY')) return true;

      if (rule.includes('FREQ=WEEKLY')) {
        if (rule.includes('INTERVAL=2')) {
          const diffMs = currentDayDate.getTime() - startDay.getTime();
          const diffWeeks = Math.floor(diffMs / (7 * 86400000));
          if (diffWeeks % 2 !== 0) return false;
        }

        const jsDayMap: Record<number, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };
        const target = jsDayMap[localDayOfWeek];
        const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/);
        if (byDayMatch) {
          const days = byDayMatch[1].split(',');
          return days.includes(target);
        }
        return false;
      }

      if (rule.includes('FREQ=MONTHLY')) {
        return currentDayDate.getDate() === start.getDate();
      }
    }

    const eventDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(b.startsAt));
    return eventDateStr === todayDateStr;
  });
  
  const combinedTodaySessions = [
    ...todayTimetable.map((e) => ({
      title: e.title,
      time: `${e.startLocalTime} - ${e.endLocalTime}`,
      start: e.startLocalTime,
      end: e.endLocalTime,
      subject: e.subjectName,
      isBusyEvent: false,
    })),
    ...filteredTodayBusyEvents.map((b) => {
      const startTime = b.startsAt ? new Intl.DateTimeFormat('en-GB', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(b.startsAt)) : '00:00';
      const endTime = b.endsAt ? new Intl.DateTimeFormat('en-GB', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(b.endsAt)) : '23:59';
      return {
        title: b.title,
        time: `${startTime} - ${endTime}`,
        start: startTime,
        end: endTime,
        subject: b.subjectName || 'Lịch bận',
        isBusyEvent: true,
      };
    }),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const nextSession = combinedTodaySessions.find((s) => s.end > currentTimeStr) || null;

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

  // 4b. Yesterday Focus Comparison Calculation
  const yesterdayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: userTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterdayDateStr = yesterdayFormatter.format(yesterdayDate);

  const completedYesterdaySessions = focusSessions.filter((s) => {
    if (s.state !== 'completed') return false;
    const dateStr = s.startedAt || s.createdAt;
    return dateStr ? dateStr.startsWith(yesterdayDateStr) : false;
  });
  const yesterdayFocusMinutes = completedYesterdaySessions.reduce(
    (acc, s) => acc + (s.actualMinutes || Math.round((s.actualFocusSeconds || 0) / 60)),
    0
  );

  const yesterdayDiffMinutes = actualFocusMinutes - yesterdayFocusMinutes;
  let yesterdayComparisonLabel = 'Chưa có dữ liệu hôm qua';
  if (yesterdayFocusMinutes > 0) {
    const pct = Math.round((Math.abs(yesterdayDiffMinutes) / yesterdayFocusMinutes) * 100);
    if (yesterdayDiffMinutes > 0) {
      yesterdayComparisonLabel = `+${yesterdayDiffMinutes} phút (+${pct}%) so với hôm qua ↗️`;
    } else if (yesterdayDiffMinutes < 0) {
      yesterdayComparisonLabel = `${yesterdayDiffMinutes} phút (-${pct}%) so với hôm qua ↘️`;
    } else {
      yesterdayComparisonLabel = `Bằng thời gian hôm qua (${actualFocusMinutes} phút)`;
    }
  } else if (actualFocusMinutes > 0) {
    yesterdayComparisonLabel = `+${actualFocusMinutes} phút (hôm qua chưa ghi nhận) ↗️`;
  }

  const dailyGoalMinutes = profile?.maxDailyStudyMinutes || 120;

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
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const upcomingExam = exams
    .filter((e) => {
      const examDate = new Date(e.examAt);
      const examDayMs = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
      return e.status === 'upcoming' && examDayMs >= todayStartMs;
    })
    .sort((a, b) => new Date(a.examAt).getTime() - new Date(b.examAt).getTime())[0] || null;

  let daysRemaining = 0;
  if (upcomingExam?.examAt) {
    const examDate = new Date(upcomingExam.examAt);
    const examDayMs = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
    daysRemaining = Math.max(0, Math.round((examDayMs - todayStartMs) / (1000 * 3600 * 24)));
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
      dailyGoalMinutes,
      completedTasksCount: completedTodayTasks.length,
      totalTasksCount: todayTasks.length,
      yesterdayFocusMinutes,
      yesterdayComparisonLabel,
      yesterdayDiffMinutes,
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
  const { from, to, forDate } = req.query as { from?: string; to?: string; forDate?: string };

  const timetables = await timetableRepo.getTimetables(userId);
  const activeTimetable = timetables.find((t) => t.isActive) || timetables[0] || null;
  const entries = await timetableRepo.getTimetableEntries(userId, activeTimetable?.id, forDate);
  const busyEvents = await timetableRepo.getBusyEvents(userId, from, to);
  const availabilityRules = await timetableRepo.getAvailabilityRules(userId);
  const exceptions = await timetableRepo.getExceptions(userId, from, to);
  const busyExceptions = await timetableRepo.getBusyEventExceptions(userId, from, to);

  res.json({
    timetables,
    activeTimetable,
    entries,
    busyEvents,
    availabilityRules,
    exceptions,
    busyExceptions,
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

// Timetable Exceptions (Nghỉ tuần này)
apiRouter.post('/timetables/entries/:id/exceptions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = TimetableExceptionCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }
  const { occurrenceDate, exceptionType, reason } = parseResult.data;
  const exception = await timetableRepo.createException(userId, req.params.id, occurrenceDate, reason || undefined, exceptionType);
  res.status(201).json({ success: true, exception });
}));

apiRouter.delete('/timetables/entries/:id/exceptions/:occurrenceDate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await timetableRepo.deleteException(userId, req.params.id, req.params.occurrenceDate);
  res.json({ success });
}));

apiRouter.get('/timetables/exceptions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { from, to } = req.query as { from?: string; to?: string };
  const exceptions = await timetableRepo.getExceptions(userId, from, to);
  res.json({ exceptions });
}));

// Offline Missed Sessions & Check-ins
apiRouter.get('/timetables/missed-sessions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const missedSessions = await sessionCheckinRepo.getMissedSessions(userId, user?.timezone || 'Asia/Ho_Chi_Minh');
  res.json({ missedSessions });
}));

apiRouter.post('/timetables/dismiss-missed-sessions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  await userRepo.touchLastOfflineScan(userId);
  res.json({ success: true });
}));

apiRouter.get('/timetables/today-lesson-logs', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const data = await sessionCheckinRepo.getTodayClassesAndLogs(userId, user?.timezone || 'Asia/Ho_Chi_Minh');
  res.json(data);
}));

apiRouter.post('/timetables/session-checkins', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = ClassSessionCheckinSubmitSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu check-in không hợp lệ');
  }
  const data = parseResult.data;

  // Validate homework image material ownership and format if provided
  if (data.homeworkImageMaterialId) {
    const hwMaterial = await materialRepo.getById(userId, data.homeworkImageMaterialId);
    if (!hwMaterial) {
      return sendError(req, res, 400, 'INVALID_HOMEWORK_IMAGE', 'Tệp đính kèm bài tập về nhà không tồn tại hoặc không thuộc quyền sở hữu của bạn.');
    }
    const isImage = (hwMaterial.mimeType && hwMaterial.mimeType.startsWith('image/')) || ['image', 'photo'].includes(hwMaterial.type);
    if (!isImage) {
      return sendError(req, res, 400, 'INVALID_HOMEWORK_IMAGE', 'Tệp đính kèm bài tập về nhà phải là hình ảnh (JPEG, PNG, WEBP).');
    }
  }

  const checkin = await sessionCheckinRepo.createOrUpdateCheckin(userId, data);

  let task: any = null;
  const stableSource = `homework_${data.timetableEntryId}_${data.occurrenceDate}`;

  // Find existing task if any
  const userTasks = await taskRepo.getByUserId(userId);
  const existingTask = userTasks.find((t) => t.source === stableSource || (data.taskId && t.id === data.taskId));

  const hasHomeworkContent = Boolean((data.homework && data.homework.trim()) || data.homeworkImageMaterialId);

  if (data.createTaskForHomework && hasHomeworkContent && data.attendanceStatus === 'attended' && !data.hasNoHomework) {
    const entry = await timetableRepo.getEntryById(userId, data.timetableEntryId);
    const subjectName = entry?.subjectName || entry?.title || 'Môn học';
    const title = data.homework && data.homework.trim()
      ? `BTVN: ${subjectName} - ${data.homework.slice(0, 80)}`
      : `BTVN: ${subjectName} (ảnh đính kèm)`;
    const dueAt = data.dueAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const estimatedMinutes = data.estimatedMinutes || 45;
    const hwObjectiveText = data.homework && data.homework.trim()
      ? `Bài tập về nhà buổi học ngày ${data.occurrenceDate}:\n${data.homework}`
      : `Bài tập về nhà (ảnh đính kèm) buổi học ngày ${data.occurrenceDate}`;

    if (existingTask) {
      task = await taskRepo.update(userId, existingTask.id, {
        title,
        subjectId: entry?.subjectId || existingTask.subjectId,
        subjectName: subjectName || existingTask.subjectName,
        dueAt,
        estimatedMinutes,
        objective: hwObjectiveText,
      });
    } else {
      task = await taskRepo.create(userId, {
        title,
        subjectId: entry?.subjectId,
        subjectName,
        status: 'pending',
        priority: 'high',
        estimatedMinutes,
        dueAt,
        source: stableSource,
        objective: hwObjectiveText,
      });
    }
  } else if (existingTask && (data.hasNoHomework || !hasHomeworkContent || data.attendanceStatus === 'absent')) {
    // If the task was auto-generated from this checkin and is still pending, cancel/delete it so no orphan task remains
    if (existingTask.source === stableSource && existingTask.status === 'pending') {
      await taskRepo.delete(userId, existingTask.id);
      task = null;
    } else {
      task = existingTask;
    }
  } else if (existingTask) {
    task = existingTask;
  }

  res.status(201).json({ success: true, checkin, task, createdTask: task });
}));

apiRouter.get('/timetables/session-checkins', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { from, to } = req.query as { from?: string; to?: string };
  const checkins = await sessionCheckinRepo.getCheckins(userId, from, to);
  res.json({ checkins });
}));

// User Heartbeat
apiRouter.post('/users/heartbeat', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  await userRepo.touchLastActive(userId);
  res.json({ success: true });
}));

// ==========================================
// Tomorrow Preparation Plan ("Jami chuẩn bị ngày mai")
// ==========================================

apiRouter.get('/tomorrow-plan/overview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = await userRepo.findById(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  const overview = await tomorrowPlanService.getPlanOverview(userId, userTimezone);
  res.json(overview);
}));

apiRouter.get('/tomorrow-plan/current', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const user = await userRepo.findById(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  const dates = tomorrowPlanService.getPlanDates(userTimezone);
  const plan = await tomorrowPlanRepo.getPlanByDate(userId, dates.planDate);
  res.json({ plan });
}));

apiRouter.post('/tomorrow-plan/generate', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = TomorrowPlanGenerateRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const user = await userRepo.findById(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  const plan = await tomorrowPlanService.generatePlan(userId, {
    energyLevel: parseResult.data.energyLevel,
    customAvailableMinutes: parseResult.data.customAvailableMinutes,
    timezone: userTimezone,
  });

  res.status(201).json({ plan });
}));

apiRouter.patch('/tomorrow-plan/:id/energy', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const planId = req.params.id;
  const parseResult = TomorrowPlanEnergyUpdateRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Mức năng lượng không hợp lệ');
  }

  const user = await userRepo.findById(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  const plan = await tomorrowPlanService.updateEnergyAndRegenerate(userId, planId, parseResult.data.energyLevel, userTimezone);
  res.json({ plan });
}));

apiRouter.post('/tomorrow-plan/:id/accept', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const planId = req.params.id;
  const plan = await tomorrowPlanService.acceptPlan(userId, planId);
  res.json({ success: true, plan });
}));

apiRouter.post('/tomorrow-plan/:id/dismiss', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const planId = req.params.id;
  const success = await tomorrowPlanService.dismissPlan(userId, planId);
  res.json({ success });
}));

apiRouter.patch('/tomorrow-plan/:id/items/:itemId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { id: planId, itemId } = req.params;
  const parseResult = TomorrowPlanItemUpdateRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const item = await tomorrowPlanService.updateItem(userId, planId, itemId, parseResult.data);
  res.json({ item });
}));

apiRouter.delete('/tomorrow-plan/:id/items/:itemId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { id: planId, itemId } = req.params;
  const success = await tomorrowPlanService.deleteItem(userId, planId, itemId);
  res.json({ success });
}));

apiRouter.post('/tomorrow-plan/:id/items/:itemId/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { id: planId, itemId } = req.params;
  const item = await tomorrowPlanService.completeItem(userId, planId, itemId);
  res.json({ item });
}));

// ==========================================
// Exam Study Planner ("Lập kế hoạch ôn kiểm tra tự động")
// ==========================================

apiRouter.get('/exams/:id/study-plan', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const examId = req.params.id;
  const plan = await examStudyPlanRepo.getPlanByExamId(userId, examId);
  res.json({ plan });
}));

apiRouter.post('/exams/:id/study-plan/generate', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const examId = req.params.id;
  const parseResult = ExamStudyPlanGenerateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const user = await userRepo.findById(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  const plan = await examStudyPlanService.generatePlanForExam(userId, examId, {
    startDate: parseResult.data.startDate,
    dailyMinutes: parseResult.data.dailyMinutes,
    blackoutDates: parseResult.data.blackoutDates,
    timezone: userTimezone,
  });

  res.status(201).json({ plan });
}));

apiRouter.post('/exams/study-plans/:planId/accept', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const planId = req.params.planId;
  const plan = await examStudyPlanService.acceptPlan(userId, planId);
  res.json({ success: true, plan });
}));

apiRouter.post('/exams/study-plans/:planId/dismiss', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const planId = req.params.planId;
  const success = await examStudyPlanService.dismissPlan(userId, planId);
  res.json({ success });
}));

apiRouter.get('/exams/:id/study-plan/missed-proposal', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const examId = req.params.id;
  const user = await userRepo.findById(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  const proposal = await examStudyPlanService.detectMissedSessions(userId, examId, userTimezone);
  res.json({ proposal });
}));

apiRouter.post('/exams/study-plans/:planId/replan-confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const planId = req.params.planId;
  const parseResult = ExamStudyPlanReplanConfirmSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const user = await userRepo.findById(userId);
  const userTimezone = user?.timezone || 'Asia/Ho_Chi_Minh';

  const plan = await examStudyPlanService.confirmReplan(
    userId,
    planId,
    parseResult.data.action,
    parseResult.data.customSlot,
    userTimezone
  );

  res.json({ success: true, plan });
}));

apiRouter.post('/exams/study-plans/:planId/undo', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const planId = req.params.planId;
  const plan = await examStudyPlanService.undoPlanVersion(userId, planId);
  res.json({ success: true, plan });
}));

apiRouter.patch('/exams/study-plans/:planId/items/:itemId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { planId, itemId } = req.params;
  const parseResult = ExamStudyPlanItemUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const item = await examStudyPlanRepo.updatePlanItem(userId, planId, itemId, parseResult.data);
  res.json({ item });
}));

apiRouter.delete('/exams/study-plans/:planId/items/:itemId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { planId, itemId } = req.params;
  const success = await examStudyPlanRepo.deletePlanItem(userId, planId, itemId);
  res.json({ success });
}));

apiRouter.post('/exams/study-plans/:planId/items/:itemId/complete', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { planId, itemId } = req.params;
  const item = await examStudyPlanService.completePlanItem(userId, planId, itemId);
  res.json({ item });
}));

// ==========================================
// Mistake Notebook ("Sổ lỗi sai cá nhân")
// ==========================================

apiRouter.get('/mistakes', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { subjectId, topic, status, difficulty, dueOnly, search } = req.query as any;

  const mistakes = await mistakeRepo.getByUserId(userId, {
    subjectId,
    topic,
    status,
    difficulty,
    dueOnly: dueOnly === 'true' || dueOnly === true,
    search,
  });

  res.json({ mistakes });
}));

apiRouter.post('/mistakes', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = MistakeCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const mistake = await mistakeRepo.create(userId, parseResult.data);
  res.status(201).json({ success: true, mistake });
}));

apiRouter.get('/mistakes/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const mistake = await mistakeRepo.getById(userId, req.params.id);
  if (!mistake) {
    return sendError(req, res, 404, 'NOT_FOUND', 'Không tìm thấy mục lỗi sai.');
  }
  res.json({ mistake });
}));

apiRouter.patch('/mistakes/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = MistakeUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
  }

  const mistake = await mistakeRepo.update(userId, req.params.id, parseResult.data);
  res.json({ success: true, mistake });
}));

apiRouter.delete('/mistakes/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await mistakeRepo.delete(userId, req.params.id);
  res.json({ success });
}));

apiRouter.post('/mistakes/:id/review', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = MistakeReviewSubmitSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Vui lòng nhập câu trả lời');
  }

  const mistake = await mistakeRepo.getById(userId, req.params.id);
  if (!mistake) {
    return sendError(req, res, 404, 'NOT_FOUND', 'Không tìm thấy mục lỗi sai.');
  }

  // Evaluate correctness (case-insensitive trim or exact match)
  const isCorrect = parseResult.data.answer.trim().toLowerCase() === mistake.correctAnswer.trim().toLowerCase();

  const result = await mistakeRepo.recordReviewAttempt(userId, req.params.id, parseResult.data.answer, isCorrect);
  res.json({ success: true, isCorrect, entry: result.entry, attempt: result.attempt });
}));

apiRouter.post('/mistakes/:id/similar', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const mistake = await mistakeRepo.getById(userId, req.params.id);
  if (!mistake) {
    return sendError(req, res, 404, 'NOT_FOUND', 'Không tìm thấy mục lỗi sai.');
  }

  const similarQuestion = await AiAdapter.generateSimilarMistakeQuestion({
    subjectName: mistake.subjectName,
    topic: mistake.topic,
    originalQuestion: mistake.questionText,
    correctAnswer: mistake.correctAnswer,
    difficulty: mistake.difficulty,
  }, userId);

  res.json({ similarQuestion });
}));

apiRouter.post('/mistakes/:id/explain', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const mistake = await mistakeRepo.getById(userId, req.params.id);
  if (!mistake) {
    return sendError(req, res, 404, 'NOT_FOUND', 'Không tìm thấy mục lỗi sai.');
  }

  const explanation = await AiAdapter.explainMistake({
    questionText: mistake.questionText,
    selectedAnswer: mistake.selectedAnswer,
    correctAnswer: mistake.correctAnswer,
    mistakeReason: mistake.mistakeReason,
  }, userId);

  res.json(explanation);
}));

// Timetable OCR Import from Image (Preview)
apiRouter.post('/timetables/import-ocr', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Vui lòng cung cấp dữ liệu hình ảnh thời khóa biểu.');
  }

  const result = await AiAdapter.extractTimetableFromImage(imageBase64, mimeType || 'image/jpeg', userId);
  res.json({
    success: true,
    timetableName: result.timetableName,
    entries: result.entries,
  });
}));

// Timetable OCR Confirm & Save
apiRouter.post('/timetables/import-ocr/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { timetableName, replaceExisting, entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Danh sách tiết học không được để trống');
  }

  let activeTimetable = await timetableRepo.getActiveTimetable(userId);
  if (!activeTimetable) {
    activeTimetable = await timetableRepo.createTimetable(userId, {
      name: timetableName || 'Thời khóa biểu chính khóa',
      isActive: true,
    });
  } else if (timetableName) {
    await timetableRepo.updateTimetable(userId, activeTimetable.id, { name: timetableName });
  }

  let savedEntries: any[];
  if (replaceExisting) {
    savedEntries = await timetableRepo.replaceTimetableEntries(userId, activeTimetable.id, entries);
  } else {
    savedEntries = [];
    for (const item of entries) {
      if (!item.title) continue;
      const entry = await timetableRepo.createTimetableEntry(userId, {
        timetableId: activeTimetable.id,
        dayOfWeek: Number(item.dayOfWeek) || 1,
        title: item.title.trim(),
        startLocalTime: item.startLocalTime || '07:30',
        endLocalTime: item.endLocalTime || '08:15',
        room: item.room?.trim() || undefined,
        location: item.room?.trim() || undefined,
        commuteBeforeMinutes: 15,
        commuteAfterMinutes: 15,
      });
      savedEntries.push(entry);
    }
  }

  res.status(201).json({
    success: true,
    timetable: activeTimetable,
    savedCount: savedEntries.length,
    entries: savedEntries,
  });
}));

// Aliases for /schedules/import-ocr
apiRouter.post('/schedules/import-ocr', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Vui lòng cung cấp dữ liệu hình ảnh thời khóa biểu.');
  }

  const result = await AiAdapter.extractTimetableFromImage(imageBase64, mimeType || 'image/jpeg', userId);
  res.json({
    success: true,
    timetableName: result.timetableName,
    entries: result.entries,
  });
}));

apiRouter.post('/schedules/import-ocr/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { timetableName, replaceExisting, entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Danh sách tiết học không được để trống');
  }

  let activeTimetable = await timetableRepo.getActiveTimetable(userId);
  if (!activeTimetable) {
    activeTimetable = await timetableRepo.createTimetable(userId, {
      name: timetableName || 'Thời khóa biểu chính khóa',
      isActive: true,
    });
  } else if (timetableName) {
    await timetableRepo.updateTimetable(userId, activeTimetable.id, { name: timetableName });
  }

  let savedEntries: any[];
  if (replaceExisting) {
    savedEntries = await timetableRepo.replaceTimetableEntries(userId, activeTimetable.id, entries);
  } else {
    savedEntries = [];
    for (const item of entries) {
      if (!item.title) continue;
      const entry = await timetableRepo.createTimetableEntry(userId, {
        timetableId: activeTimetable.id,
        dayOfWeek: Number(item.dayOfWeek) || 1,
        title: item.title.trim(),
        startLocalTime: item.startLocalTime || '07:30',
        endLocalTime: item.endLocalTime || '08:15',
        room: item.room?.trim() || undefined,
        location: item.room?.trim() || undefined,
        commuteBeforeMinutes: 15,
        commuteAfterMinutes: 15,
      });
      savedEntries.push(entry);
    }
  }

  res.status(201).json({
    success: true,
    timetable: activeTimetable,
    savedCount: savedEntries.length,
    entries: savedEntries,
  });
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

// Busy Event Exceptions routes (must place static /exceptions before /:id)
apiRouter.get('/busy-events/exceptions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { from, to } = req.query as { from?: string; to?: string };
  const exceptions = await timetableRepo.getBusyEventExceptions(userId, from, to);
  res.json({ exceptions });
}));

apiRouter.get('/timetables/busy-events/exceptions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { from, to } = req.query as { from?: string; to?: string };
  const exceptions = await timetableRepo.getBusyEventExceptions(userId, from, to);
  res.json({ exceptions });
}));

apiRouter.post('/busy-events/:id/exceptions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = BusyEventExceptionCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu ngoại lệ không hợp lệ');
  }

  const { occurrenceDate, reason, exceptionType } = parseResult.data;
  try {
    const exception = await timetableRepo.createBusyEventException(
      userId,
      req.params.id,
      occurrenceDate,
      reason,
      exceptionType
    );
    res.status(201).json({ success: true, exception });
  } catch (err: any) {
    if (err.message?.includes('không tồn tại')) {
      return sendError(req, res, 404, 'BUSY_EVENT_NOT_FOUND', err.message);
    }
    throw err;
  }
}));

apiRouter.post('/timetables/busy-events/:id/exceptions', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parseResult = BusyEventExceptionCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parseResult.error.issues[0]?.message || 'Dữ liệu ngoại lệ không hợp lệ');
  }

  const { occurrenceDate, reason, exceptionType } = parseResult.data;
  try {
    const exception = await timetableRepo.createBusyEventException(
      userId,
      req.params.id,
      occurrenceDate,
      reason,
      exceptionType
    );
    res.status(201).json({ success: true, exception });
  } catch (err: any) {
    if (err.message?.includes('không tồn tại')) {
      return sendError(req, res, 404, 'BUSY_EVENT_NOT_FOUND', err.message);
    }
    throw err;
  }
}));

apiRouter.delete('/busy-events/:id/exceptions/:occurrenceDate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await timetableRepo.deleteBusyEventException(userId, req.params.id, req.params.occurrenceDate);
  if (!success) {
    return sendError(req, res, 404, 'EXCEPTION_NOT_FOUND', 'Không tìm thấy ngoại lệ sự kiện bận cần xóa');
  }
  res.json({ success: true, message: 'Đã hoàn tác nghỉ sự kiện bận' });
}));

apiRouter.delete('/timetables/busy-events/:id/exceptions/:occurrenceDate', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await timetableRepo.deleteBusyEventException(userId, req.params.id, req.params.occurrenceDate);
  if (!success) {
    return sendError(req, res, 404, 'EXCEPTION_NOT_FOUND', 'Không tìm thấy ngoại lệ sự kiện bận cần xóa');
  }
  res.json({ success: true, message: 'Đã hoàn tác nghỉ sự kiện bận' });
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

apiRouter.post('/tasks/:id/execution-guide/generate', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
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
    additionalNotes,
    userId
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

// Generate Steps / Guide alias
apiRouter.post('/tasks/:taskId/generate-steps', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const task = await taskRepo.getById(userId, req.params.taskId);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  const profile = await userRepo.getProfile(userId);
  const guide = await AiAdapter.generateExecutionGuide(task, profile?.gradeLevel || 9, task.subjectName, req.body?.additionalNotes, userId);
  const savedGuide = await taskRepo.saveExecutionGuide(userId, task.id, guide);

  res.json({ guide: savedGuide, isDemoMode: !AiAdapter.isConfigured() });
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

apiRouter.patch('/tasks/:taskId/steps/:stepId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { title, instruction, expectedOutput, plannedMinutes, status } = req.body || {};
  const guide = await taskRepo.updateExecutionStepDetails(userId, req.params.taskId, req.params.stepId, {
    title,
    instruction,
    expectedOutput,
    plannedMinutes,
    status,
  });
  if (!guide) {
    return sendError(req, res, 404, 'STEP_NOT_FOUND', 'Không tìm thấy bước thực hiện');
  }
  res.json({ success: true, guide });
}));

apiRouter.patch('/task-steps/:stepId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const taskId = req.body?.taskId;
  if (!taskId) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Yêu cầu taskId khi cập nhật bước');
  }
  const { title, instruction, expectedOutput, plannedMinutes, status } = req.body || {};
  const guide = await taskRepo.updateExecutionStepDetails(userId, taskId, req.params.stepId, {
    title,
    instruction,
    expectedOutput,
    plannedMinutes,
    status,
  });
  res.json({ success: true, guide });
}));

apiRouter.post('/tasks/:taskId/steps/reorder', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { orderedStepIds } = req.body || {};
  if (!Array.isArray(orderedStepIds) || orderedStepIds.length === 0) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Danh sách thứ tự các bước không hợp lệ');
  }

  const guide = await taskRepo.reorderExecutionSteps(userId, req.params.taskId, orderedStepIds);
  res.json({ success: true, guide });
}));

apiRouter.post('/tasks/:taskId/explain-step', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { stepId, stepTitle, instruction, expectedOutput, plannedMinutes, studentQuestion } = req.body || {};
  const task = await taskRepo.getById(userId, req.params.taskId);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  const explanation = await AiAdapter.explainStep(
    {
      title: stepTitle || 'Bước học tập',
      instruction: instruction || '',
      expectedOutput: expectedOutput || '',
      plannedMinutes: Number(plannedMinutes) || 15,
    },
    task.title,
    task.subjectName || 'Môn học',
    studentQuestion,
    userId
  );

  res.json({ explanation });
}));

apiRouter.post('/tasks/:taskId/evaluate-evidence', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { textValue, fileUrl, type } = req.body || {};
  const task = await taskRepo.getById(userId, req.params.taskId);
  if (!task) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  const guide = await taskRepo.getExecutionGuide(userId, task.id);
  const criteria = [
    ...(guide?.successCriteria || []),
    ...(guide?.excellentCriteria || []),
  ];

  const evaluation = await AiAdapter.evaluateEvidence(
    task.title,
    task.subjectName || 'Môn học',
    textValue || `Đã đính kèm tệp ${type}: ${fileUrl}`,
    criteria,
    userId
  );

  res.json({ evaluation });
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

apiRouter.post('/tasks/:taskId/postpone', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { postponeMinutes, newScheduledStartAt } = req.body || {};
  const currentTask = await taskRepo.getById(userId, req.params.taskId);
  if (!currentTask) return sendError(req, res, 404, 'TASK_NOT_FOUND', 'Không tìm thấy nhiệm vụ học tập');

  let nextStart: string;
  if (newScheduledStartAt) {
    nextStart = new Date(newScheduledStartAt).toISOString();
  } else {
    const baseDate = currentTask.scheduledStartAt ? new Date(currentTask.scheduledStartAt) : new Date();
    const addMins = typeof postponeMinutes === 'number' ? postponeMinutes : 60;
    nextStart = new Date(baseDate.getTime() + addMins * 60 * 1000).toISOString();
  }

  const duration = currentTask.estimatedMinutes || 45;
  const nextEnd = new Date(new Date(nextStart).getTime() + duration * 60 * 1000).toISOString();

  const task = await taskRepo.update(userId, req.params.taskId, {
    scheduledStartAt: nextStart,
    scheduledEndAt: nextEnd,
    status: 'pending',
  });
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
  try {
    const session = await focusRepo.startSession(userId, taskId, mode, minutes, breakMinutes, idempotencyKey);
    res.json({ session });
  } catch (err: any) {
    console.error('[API] POST /focus-sessions error:', err);
    sendError(req, res, 400, 'FOCUS_START_ERROR', err.message || 'Không thể tạo phiên tập trung.');
  }
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

apiRouter.post('/planner/voice-goal/preview', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { transcript } = req.body;

  let extraction: any;
  let isDemoMode = true;

  if (AiAdapter.isConfigured()) {
    try {
      extraction = await AiAdapter.extractGoalFromText(transcript, userId);
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

// Static route MUST come before dynamic parameter route /exams/:id
apiRouter.get('/exams/upcoming', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const exams = await examRepo.getByUserId(userId);
  const upcoming = exams.filter((e) => e.status === 'upcoming' || new Date(e.examAt).getTime() >= Date.now());
  res.json({ exams: upcoming });
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

apiRouter.post('/exams/:id/quizzes/generate', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
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

apiRouter.post('/quizzes/generate', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = SubjectQuizGenerateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Thông tin sinh đề không hợp lệ');
  }

  try {
    const quiz = await quizRepo.generateSubjectQuiz(userId, parsed.data);
    res.json({ success: true, quiz });
  } catch (err: any) {
    sendError(req, res, 400, 'QUIZ_GENERATION_FAILED', err.message || 'Không thể tạo đề ôn tập theo môn.');
  }
}));

apiRouter.post('/quizzes/retake-wrong', requireAuth, createRateLimiter(60000, 15, 'quiz_retake', { useUserId: true }), asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = QuizRetakeWrongSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu yêu cầu làm lại câu sai không hợp lệ');
  }

  try {
    const quiz = await quizRepo.generateRetakeWrongQuestionsQuiz(userId, parsed.data.originalQuizId, parsed.data.wrongQuestionIds);
    res.json({ success: true, quiz });
  } catch (err: any) {
    const status = err.message?.includes('Không tìm thấy') ? 404 : 400;
    sendError(req, res, status, 'QUIZ_RETAKE_FAILED', err.message || 'Không thể tạo đề làm lại câu sai.');
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

apiRouter.get('/quiz-attempts/:id/result', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await quizRepo.getAttemptResult(userId, req.params.id);
  if (!result) {
    return sendError(req, res, 404, 'ATTEMPT_NOT_FOUND', 'Không tìm thấy kết quả bài làm.');
  }
  res.json(result);
}));

// ==========================================
// Learning Materials Subsystem Routes
// ==========================================

async function serveMaterialFile(
  req: Request,
  res: Response,
  material: Material,
  mode: 'inline' | 'attachment' | 'raw' = 'raw'
) {
  const effectiveKey = material.storageKey || material.r2ObjectKey;
  if (!effectiveKey) {
    if (material.type === 'notes' && material.contentText) {
      const safeFilename = sanitizeFileName(material.title || 'note') + '.txt';
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (mode === 'attachment') {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
        );
      } else {
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
        );
      }
      return res.send(material.contentText);
    }
    return res.status(404).json({
      error: { code: 'FILE_NOT_FOUND', message: 'Tài liệu này chưa có tệp đính kèm.' },
    });
  }

  const adapter = storageService.getAdapter(material.storageDriver);
  const exists = await adapter.exists(effectiveKey);
  if (!exists) {
    return res.status(404).json({
      error: { code: 'FILE_NOT_FOUND', message: 'Không tìm thấy tệp trên ổ đĩa lưu trữ.' },
    });
  }

  const stat = await adapter.stat(effectiveKey);
  const totalSize = stat.size;
  const mimeType = material.detectedMime || material.mimeType || stat.contentType || 'application/octet-stream';
  const originalName = material.originalFilename || material.fileName || material.title || 'document';
  const safeFilename = sanitizeFileName(originalName);

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType);

  if (mode === 'attachment') {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
    );
  } else if (mode === 'inline') {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
    );
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox;");
  }

  // Handle HTTP Range Requests (RFC 7233)
  const rangeHeader = req.headers.range;
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (isNaN(start) || isNaN(end) || start >= totalSize || end >= totalSize || start > end) {
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      return res.status(416).json({
        error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Phạm vi yêu cầu vượt quá kích thước tệp.' },
      });
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    res.setHeader('Content-Length', chunkSize);

    const stream = await adapter.createReadStream(effectiveKey, { start, end });
    return (stream as any).pipe(res);
  }

  // Full response
  res.setHeader('Content-Length', totalSize);
  const stream = await adapter.createReadStream(effectiveKey);
  return (stream as any).pipe(res);
}

// ==========================================
// Sách Mềm (Soft Books) Subsystem Routes
// (Defined before general /materials/:id to prevent route shadowing)
// ==========================================

// Multipart streaming upload for soft books (PDF/EPUB/DOCX/TXT)
apiRouter.post(['/materials/books/upload', '/books/upload'], requireAuth, uploadDisk.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      error: { code: 'MISSING_FILE', message: 'Vui lòng chọn tệp sách mềm để tải lên.' },
    });
  }

  const cleanupTemp = () => {
    if (file.path && fs.existsSync(file.path)) {
      fs.promises.unlink(file.path).catch(() => {});
    }
  };

  try {
    const title = (req.body?.title || file.originalname || 'Sách giáo khoa').trim();
    const subjectId = (req.body?.subjectId || 'subj-math').trim();
    const publisher = req.body?.publisher ? String(req.body.publisher).trim() : undefined;
    const editionYear = req.body?.editionYear ? Number(req.body.editionYear) : undefined;
    const language = req.body?.language ? String(req.body.language).trim() : 'vi';
    const rightsConfirmed = req.body?.rightsConfirmed === true || req.body?.rightsConfirmed === 'true';

    if (!rightsConfirmed) {
      cleanupTemp();
      return res.status(400).json({
        error: { code: 'RIGHTS_REQUIRED', message: 'Bạn cần xác nhận cam kết bản quyền học tập cá nhân đối với sách mềm này.' },
      });
    }

    // 1. Quota Check
    const maxFileSizeMb = env.BOOK_MAX_UPLOAD_MB || 100;
    const maxSizeBytes = maxFileSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      cleanupTemp();
      return res.status(413).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Dung lượng sách (${Math.round(file.size / 1024 / 1024)}MB) vượt quá giới hạn ${maxFileSizeMb}MB.`,
        },
      });
    }

    const currentUsage = await storageService.getUserStorageUsage(userId);
    const quotaMb = env.BOOK_STORAGE_QUOTA_MB || env.LOCAL_STORAGE_QUOTA_MB_PER_USER || 1000;
    const quotaBytes = quotaMb * 1024 * 1024;
    if (currentUsage + file.size > quotaBytes) {
      cleanupTemp();
      return res.status(413).json({
        error: {
          code: 'STORAGE_QUOTA_EXCEEDED',
          message: `Bạn đã sử dụng hết hạn mức lưu trữ (${quotaMb}MB). Vui lòng xóa bớt tài liệu cũ.`,
        },
      });
    }

    // 2. Magic bytes verification
    const headerBuffer = Buffer.alloc(4096);
    const fd = await fs.promises.open(file.path, 'r');
    const bytesRead = (await fd.read(headerBuffer, 0, 4096, 0)).bytesRead;
    await fd.close();

    const actualHeader = headerBuffer.subarray(0, bytesRead);
    const magicCheck = validateMagicBytes(actualHeader, file.mimetype, file.originalname);
    if (!magicCheck.isValid) {
      cleanupTemp();
      return res.status(400).json({
        error: {
          code: 'INVALID_FILE_BYTES',
          message: magicCheck.error || 'Nội dung tệp không hợp lệ hoặc bị từ chối.',
        },
      });
    }

    // 3. Save via StorageAdapter
    const materialId = 'book_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const safeExt = getSafeExtension(file.originalname, magicCheck.detectedMime);
    const storageKey = generateMaterialStorageKey(userId, materialId, file.originalname, magicCheck.detectedMime);
    const adapter = storageService.getAdapter();

    const storedFile = await adapter.save({
      key: storageKey,
      filePath: file.path,
      contentType: magicCheck.detectedMime,
      originalFilename: file.originalname,
    });

    // 4. Save Book in database
    const book = await bookRepo.createUploadedBook(userId, {
      materialId,
      title,
      subjectId,
      fileName: sanitizeFileName(file.originalname),
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      detectedMime: magicCheck.detectedMime,
      extension: safeExt,
      sizeBytes: storedFile.size,
      sha256: storedFile.sha256,
      storageDriver: adapter.driverName,
      storageKey,
      publisher,
      editionYear,
      language,
      rightsConfirmed: true,
      rightsTermsVersion: 'v1.0',
    });

    // 5. Create processing job & poll worker
    if (db.isHealthy()) {
      const jobId = 'job_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      await db.execute(
        `INSERT INTO material_processing_jobs (
          id, material_id, user_id, job_type, status, progress_percent, created_at
        ) VALUES (?, ?, ?, 'extract_and_chunk', 'queued', 10, NOW(3))`,
        [jobId, book.id, userId]
      ).catch(() => {});
    }

    materialWorker.pollJobs().catch(() => {});

    return res.status(201).json({
      success: true,
      book,
    });
  } catch (err: any) {
    cleanupTemp();
    return res.status(500).json({
      error: { code: 'UPLOAD_FAILED', message: err.message || 'Tải sách mềm lên thất bại.' },
    });
  }
}));

apiRouter.post(['/materials/books/upload-intent', '/books/upload-intent'], requireAuth, createRateLimiter(60000, 20, 'book_upload', { useUserId: true }), asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = BookUploadIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Thông tin sách không hợp lệ.', details: parsed.error.issues },
    });
  }

  const intent = await bookRepo.createBookUploadIntent(userId, parsed.data);
  res.json(intent);
}));

apiRouter.post(['/materials/books/:id/finalize', '/books/:id/finalize'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { sizeBytes, sha256, detectedMime } = req.body || {};

  try {
    const ok = await bookRepo.finalizeUpload(userId, req.params.id, {
      sizeBytes: sizeBytes !== undefined ? Number(sizeBytes) : undefined,
      sha256,
      detectedMime,
    });
    if (!ok) {
      return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm để hoàn tất tải lên.' } });
    }

    materialWorker.pollJobs().catch(() => {});

    const book = await bookRepo.getBookById(userId, req.params.id);
    res.json({ success: true, book });
  } catch (err: any) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message || 'Xác thực tệp sách tải lên thất bại.',
      },
    });
  }
}));

apiRouter.get(['/materials/books/:id/file', '/books/:id/file'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  return serveMaterialFile(req, res, book, 'raw');
}));

apiRouter.get(['/materials/books/:id/preview', '/books/:id/preview'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  return serveMaterialFile(req, res, book, 'inline');
}));

apiRouter.get(['/materials/books/:id/download', '/books/:id/download'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  return serveMaterialFile(req, res, book, 'attachment');
}));

apiRouter.get(['/materials/books', '/books'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { search, subjectId, status, limit, offset } = req.query;
  const result = await bookRepo.getBooksByUserId(userId, {
    search: search ? String(search) : undefined,
    subjectId: subjectId ? String(subjectId) : undefined,
    status: status ? String(status) : undefined,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });
  res.json(result);
}));

apiRouter.get(['/materials/books/:id', '/books/:id'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const progress = await bookRepo.getProgress(userId, req.params.id);
  res.json({ book, progress });
}));

apiRouter.delete(['/materials/books/:id', '/books/:id'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await bookRepo.deleteBook(userId, req.params.id);
  res.json({ success });
}));

apiRouter.get(['/materials/books/:id/status', '/books/:id/status'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  res.json({
    status: book.processingStatus,
    progress: book.processingProgress,
    pageCount: book.pageCount,
    chapterCount: book.chapterCount,
    errorMessage: book.errorMessage,
  });
}));

apiRouter.post(['/materials/books/:id/retry-processing', '/books/:id/retry-processing'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await materialWorker.retryJob(userId, req.params.id);
  if (!success) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách để xử lý lại.' } });
  }
  materialWorker.pollJobs().catch(() => {});
  res.json({ success: true, message: 'Đã đưa sách vào hàng đợi xử lý lại.' });
}));

apiRouter.get(['/materials/books/:id/chapters', '/books/:id/chapters'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const chapters = await bookRepo.getChapters(req.params.id);
  res.json({ chapters });
}));

apiRouter.get(['/materials/books/:id/read', '/books/:id/read'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const page = Number(req.query.page) || 1;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;
  const chunks = await bookRepo.getChunks(req.params.id, { chapterId, startPage: page, endPage: page });
  res.json({ page, chunks, pageCount: book.pageCount || 1 });
}));

apiRouter.get(['/materials/books/:id/search', '/books/:id/search'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.json({ results: [] });
  }
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;
  const page = req.query.page ? Number(req.query.page) : undefined;
  const results = await bookRepo.searchChunks(userId, req.params.id, q, chapterId, page);
  res.json({ results });
}));

apiRouter.get(['/materials/books/:id/progress', '/books/:id/progress'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const progress = await bookRepo.getProgress(userId, req.params.id);
  res.json({ progress });
}));

apiRouter.put(['/materials/books/:id/progress', '/books/:id/progress'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const parsed = BookProgressUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.issues } });
  }
  const progress = await bookRepo.saveProgress(userId, req.params.id, parsed.data.page, parsed.data.chapterId || undefined, parsed.data.percentage);
  res.json({ progress });
}));

apiRouter.get(['/materials/books/:id/bookmarks', '/books/:id/bookmarks'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const bookmarks = await bookRepo.getBookmarks(userId, req.params.id);
  res.json({ bookmarks });
}));

apiRouter.post(['/materials/books/:id/bookmarks', '/books/:id/bookmarks'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const parsed = BookBookmarkCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.issues } });
  }
  const bookmark = await bookRepo.createBookmark(userId, req.params.id, parsed.data);
  res.json({ bookmark });
}));

apiRouter.delete(['/materials/books/:id/bookmarks/:bookmarkId', '/books/:id/bookmarks/:bookmarkId'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await bookRepo.deleteBookmark(userId, req.params.bookmarkId);
  res.json({ success });
}));

apiRouter.get(['/materials/books/:id/highlights', '/books/:id/highlights'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const highlights = await bookRepo.getHighlights(userId, req.params.id);
  res.json({ highlights });
}));

apiRouter.post(['/materials/books/:id/highlights', '/books/:id/highlights'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const book = await bookRepo.getBookById(userId, req.params.id);
  if (!book) {
    return res.status(404).json({ error: { code: 'BOOK_NOT_FOUND', message: 'Không tìm thấy sách mềm.' } });
  }
  const parsed = BookHighlightCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.issues } });
  }
  const highlight = await bookRepo.createHighlight(userId, req.params.id, parsed.data as any);
  res.json({ highlight });
}));

apiRouter.delete(['/materials/books/:id/highlights/:highlightId', '/books/:id/highlights/:highlightId'], requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await bookRepo.deleteHighlight(userId, req.params.highlightId);
  res.json({ success });
}));

apiRouter.post(
  ['/materials/books/:id/study-aids', '/books/:id/study-aids'],
  requireAuth,
  createRateLimiter(60000, 10, 'book_study_aid', { useUserId: true, maxConcurrency: 3, dailyQuota: 100 }),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const parsed = BookStudyAidRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.issues } });
    }
    const result = await bookStudyAidService.generateStudyAid(userId, req.params.id, parsed.data);
    res.json(result);
  })
);

// ==========================================
// General Learning Materials Routes
// ==========================================

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

// Multipart streaming upload for documents/images/PDFs
apiRouter.post('/materials/upload', requireAuth, uploadDisk.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      error: { code: 'MISSING_FILE', message: 'Vui lòng chọn tệp tài liệu để tải lên.' },
    });
  }

  const cleanupTemp = () => {
    if (file.path && fs.existsSync(file.path)) {
      fs.promises.unlink(file.path).catch(() => {});
    }
  };

  try {
    const title = (req.body?.title || file.originalname || 'Tài liệu không tên').trim();
    const subjectId = (req.body?.subjectId || 'subj-math').trim();
    const materialKind = (req.body?.materialKind || 'document') as 'document' | 'book';

    // 1. Quota Check
    const maxFileSizeMb = materialKind === 'book' ? (env.BOOK_MAX_UPLOAD_MB || 100) : (env.MATERIAL_MAX_UPLOAD_MB || 25);
    const maxSizeBytes = maxFileSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      cleanupTemp();
      return res.status(413).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Dung lượng tệp (${Math.round(file.size / 1024 / 1024)}MB) vượt quá giới hạn ${maxFileSizeMb}MB.`,
        },
      });
    }

    const currentUsage = await storageService.getUserStorageUsage(userId);
    const quotaBytes = (env.LOCAL_STORAGE_QUOTA_MB_PER_USER || 1000) * 1024 * 1024;
    if (currentUsage + file.size > quotaBytes) {
      cleanupTemp();
      return res.status(413).json({
        error: {
          code: 'STORAGE_QUOTA_EXCEEDED',
          message: `Bạn đã sử dụng hết hạn mức lưu trữ (${env.LOCAL_STORAGE_QUOTA_MB_PER_USER}MB). Vui lòng xóa bớt tài liệu cũ.`,
        },
      });
    }

    // 2. Magic bytes verification (read header from temp file)
    const headerBuffer = Buffer.alloc(4096);
    const fd = await fs.promises.open(file.path, 'r');
    const bytesRead = (await fd.read(headerBuffer, 0, 4096, 0)).bytesRead;
    await fd.close();

    const actualHeader = headerBuffer.subarray(0, bytesRead);
    const magicCheck = validateMagicBytes(actualHeader, file.mimetype, file.originalname);
    if (!magicCheck.isValid) {
      cleanupTemp();
      return res.status(400).json({
        error: {
          code: 'INVALID_FILE_BYTES',
          message: magicCheck.error || 'Nội dung tệp không hợp lệ hoặc bị từ chối.',
        },
      });
    }

    // 3. Generate canonical storage key & save via StorageAdapter
    const materialId = 'mat_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const safeExt = getSafeExtension(file.originalname, magicCheck.detectedMime);
    const storageKey = generateMaterialStorageKey(userId, materialId, file.originalname, magicCheck.detectedMime);
    const adapter = storageService.getAdapter();

    const storedFile = await adapter.save({
      key: storageKey,
      filePath: file.path,
      contentType: magicCheck.detectedMime,
      originalFilename: file.originalname,
    });

    // 4. Save record in database
    const material = await materialRepo.createUploadedMaterial(userId, {
      materialId,
      title,
      subjectId,
      fileName: sanitizeFileName(file.originalname),
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      detectedMime: magicCheck.detectedMime,
      extension: safeExt,
      sizeBytes: storedFile.size,
      sha256: storedFile.sha256,
      storageDriver: adapter.driverName,
      storageKey,
      materialKind,
    });

    // 5. Create processing job and trigger worker
    if (db.isHealthy()) {
      const jobId = 'job_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      await db.execute(
        `INSERT INTO material_processing_jobs (
          id, material_id, user_id, job_type, status, progress_percent, created_at
        ) VALUES (?, ?, ?, 'extract_and_chunk', 'queued', 10, NOW(3))`,
        [jobId, material.id, userId]
      ).catch(() => {});
      materialWorker.pollJobs().catch(() => {});
    } else {
      materialProcessor.processMaterial(userId, material.id).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      material,
    });
  } catch (err: any) {
    cleanupTemp();
    return res.status(500).json({
      error: { code: 'UPLOAD_FAILED', message: err.message || 'Tải tệp lên thất bại.' },
    });
  }
}));

// Backward compatibility: upload-intent
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

// Backward compatibility: upload-direct
apiRouter.post('/materials/upload-direct', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const userHash = getUserDirHash(userId);
  const key = req.query.key as string;
  if (!key || (!key.startsWith(`materials/${userHash}/`) && !key.startsWith(`materials/${userId}/`))) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Khóa lưu trữ không hợp lệ hoặc không thuộc quyền sở hữu.' },
    });
  }

  const contentType = req.headers['content-type'] || 'application/pdf';

  let bodyBuffer: Buffer;
  if (Buffer.isBuffer(req.body)) {
    bodyBuffer = req.body;
  } else if (req.body && typeof req.body === 'object') {
    const base64Data = (req.body as any).fileBase64 || (req.body as any).data;
    if (base64Data) {
      bodyBuffer = Buffer.from(base64Data.replace(/^data:.*?;base64,/, ''), 'base64');
    } else {
      bodyBuffer = Buffer.from(JSON.stringify(req.body));
    }
  } else {
    bodyBuffer = Buffer.from(String(req.body || ''));
  }

  const magicCheck = validateMagicBytes(bodyBuffer, contentType);
  if (!magicCheck.isValid) {
    return res.status(400).json({
      error: { code: 'INVALID_FILE_BYTES', message: magicCheck.error || 'Nội dung tệp không hợp lệ.' },
    });
  }

  const putResult = await storageService.putObject(key, bodyBuffer, contentType);

  const materials = await materialRepo.getByUserId(userId);
  const material = materials.find((m) => m.r2ObjectKey === key || m.storageKey === key);

  if (material) {
    await materialRepo.finalizeUpload(userId, material.id, {
      sizeBytes: putResult.size,
      sha256: putResult.sha256,
    });
    if (db.isHealthy()) {
      const jobId = 'job_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      await db.execute(
        `INSERT INTO material_processing_jobs (
          id, material_id, user_id, job_type, status, progress_percent, created_at
        ) VALUES (?, ?, ?, 'extract_and_chunk', 'queued', 10, NOW(3))`,
        [jobId, material.id, userId]
      ).catch(() => {});
      materialWorker.pollJobs().catch(() => {});
    } else {
      materialProcessor.processMaterial(userId, material.id).catch((err) => {
        console.error('[API] Error processing material after upload:', err);
      });
    }
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

  if (db.isHealthy()) {
    const jobId = 'job_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    await db.execute(
      `INSERT INTO material_processing_jobs (
        id, material_id, user_id, job_type, status, progress_percent, created_at
      ) VALUES (?, ?, ?, 'extract_and_chunk', 'queued', 10, NOW(3))`,
      [jobId, finalized.id, userId]
    ).catch(() => {});
    materialWorker.pollJobs().catch(() => {});
  } else {
    materialProcessor.processMaterial(userId, finalized.id).catch((err) => {
      console.error('[API] Error processing finalized material:', err);
    });
  }

  res.json({ success: true, material: finalized });
}));

// Streaming file endpoints with range support
apiRouter.get('/materials/:id/file', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const material = await materialRepo.getById(userId, req.params.id);
  if (!material) {
    return res.status(404).json({ error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu.' } });
  }
  return serveMaterialFile(req, res, material, 'raw');
}));

apiRouter.get('/materials/:id/preview', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const material = await materialRepo.getById(userId, req.params.id);
  if (!material) {
    return res.status(404).json({ error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu.' } });
  }
  return serveMaterialFile(req, res, material, 'inline');
}));

apiRouter.get('/materials/:id/download', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const material = await materialRepo.getById(userId, req.params.id);
  if (!material) {
    return res.status(404).json({ error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu.' } });
  }
  return serveMaterialFile(req, res, material, 'attachment');
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

  return serveMaterialFile(req, res, material, 'inline');
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

apiRouter.post('/materials/:id/quizzes/generate', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
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

apiRouter.patch('/materials/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const title = (req.body?.title || '').trim();
  if (!title) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Tên tài liệu không được để trống.' } });
  }
  const updated = await materialRepo.rename(userId, req.params.id, title);
  if (!updated) {
    return res.status(404).json({ error: { code: 'MATERIAL_NOT_FOUND', message: 'Không tìm thấy tài liệu.' } });
  }
  res.json({ material: updated });
}));

apiRouter.post('/materials/:id/outline', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const outline = await materialProcessor.generateOutlineFromMaterial(userId, req.params.id, {
    chapter: req.body?.chapter,
    customPrompt: req.body?.customPrompt,
  });
  res.json({ outline });
}));

apiRouter.delete('/materials/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await materialRepo.delete(userId, req.params.id);
  res.json({ success });
}));

// Outlines Subsystem Routes (6.2)
apiRouter.get('/outlines', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const subjectId = req.query.subjectId as string | undefined;
  const outlines = await materialRepo.getOutlines(userId, subjectId);
  res.json({ outlines });
}));

apiRouter.get('/outlines/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const outline = await materialRepo.getOutline(userId, req.params.id);
  if (!outline) {
    return res.status(404).json({ error: { code: 'OUTLINE_NOT_FOUND', message: 'Không tìm thấy đề cương.' } });
  }
  res.json({ outline });
}));

apiRouter.post('/outlines', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const outline = await materialRepo.createOutline(userId, req.body || {});
  res.status(201).json({ outline });
}));

apiRouter.patch('/outlines/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const updated = await materialRepo.updateOutline(userId, req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: { code: 'OUTLINE_NOT_FOUND', message: 'Không tìm thấy đề cương.' } });
  }
  res.json({ outline: updated });
}));

apiRouter.delete('/outlines/:id', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const success = await materialRepo.deleteOutline(userId, req.params.id);
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

apiRouter.delete('/jami/messages', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const conversationId = req.query.conversationId as string | undefined;
  const success = await jamiRepo.clearMessages(userId, conversationId);
  res.json({ success });
}));

apiRouter.post('/jami/chat', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = JamiChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Nội dung tin nhắn không hợp lệ');
  }

  const { message, clientMessageId, conversationId, materialId } = parsed.data;

  const result = await jamiOrchestrator.processTurn({
    userId,
    message,
    conversationId,
    clientMessageId,
    source: 'text',
    materialId,
  });

  res.json(result);
}));

apiRouter.post('/jami/messages/:id/confirm', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const parsed = JamiMessageConfirmSchema.safeParse(req.body || {});
  const decision = parsed.success ? parsed.data.decision : 'confirm';

  try {
    const confirmationResult = await jamiRepo.confirmMessageAction(userId, req.params.id, decision);
    if (confirmationResult.actionResult && confirmationResult.actionResult.success === false) {
      return sendError(req, res, 400, 'CONFIRMATION_FAILED', confirmationResult.actionResult.message || 'Không thể thực hiện xác nhận.');
    }
    res.json({
      success: true,
      ...confirmationResult,
    });
  } catch (err: any) {
    const isMissingProposal = err.message?.includes('PROPOSAL_MISSING');
    const status = isMissingProposal ? 409 : 400;
    const code = isMissingProposal ? 'PROPOSAL_MISSING' : 'CONFIRMATION_FAILED';
    sendError(req, res, status, code, err.message || 'Không thể thực hiện xác nhận.');
  }
}));

apiRouter.post('/jami/voice/command', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
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

apiRouter.post('/jami/realtime/client-secret', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await voiceSessionService.createRealtimeClientSecret(userId);
  res.json(result);
}));

apiRouter.post('/jami/realtime/calls', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const sdpOffer = req.body?.sdpOffer || req.body?.sdp || (typeof req.body === 'string' ? req.body : '');
  if (!sdpOffer) {
    return sendError(req, res, 400, 'INVALID_SDP', 'Thiếu nội dung SDP offer');
  }
  const result = await voiceSessionService.exchangeRealtimeSdp(userId, sdpOffer);
  res.json(result);
}));

apiRouter.post('/voice/realtime/calls', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const sdpOffer = req.body?.sdpOffer || req.body?.sdp || (typeof req.body === 'string' ? req.body : '');
  if (!sdpOffer) {
    return sendError(req, res, 400, 'INVALID_SDP', 'Thiếu nội dung SDP offer');
  }
  const result = await voiceSessionService.exchangeRealtimeSdp(userId, sdpOffer);
  res.json(result);
}));

apiRouter.post('/jami/realtime/session', requireAuth, aiRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const result = await voiceSessionService.createRealtimeClientSecret(userId);
  res.json(result);
}));

apiRouter.post('/voice/realtime/sessions/:id/finalize', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const sessionId = req.params.id;
  const { reason } = req.body || {};
  const result = await voiceSessionService.finalizeRealtimeSession(userId, sessionId, {
    reason,
  });
  if (!result.success) {
    return sendError(req, res, 400, 'FINALIZE_SESSION_FAILED', result.message);
  }
  res.json(result);
}));

apiRouter.post('/jami/realtime/sessions/:id/finalize', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const sessionId = req.params.id;
  const { reason } = req.body || {};
  const result = await voiceSessionService.finalizeRealtimeSession(userId, sessionId, {
    reason,
  });
  if (!result.success) {
    return sendError(req, res, 400, 'FINALIZE_SESSION_FAILED', result.message);
  }
  res.json(result);
}));

apiRouter.post('/jami/realtime/tool-call', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { name, arguments: toolArgs, conversationId } = req.body || {};
  if (!name || typeof name !== 'string') {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Tên công cụ (tool name) không được để trống.');
  }
  const parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs || '{}') : (toolArgs || {});
  const result = await executeRegisteredTool(userId, name, parsedArgs, { conversationId });
  res.json(result);
}));

apiRouter.post('/voice/realtime/tool-call', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { name, arguments: toolArgs, conversationId } = req.body || {};
  if (!name || typeof name !== 'string') {
    return sendError(req, res, 400, 'VALIDATION_ERROR', 'Tên công cụ (tool name) không được để trống.');
  }
  const parsedArgs = typeof toolArgs === 'string' ? JSON.parse(toolArgs || '{}') : (toolArgs || {});
  const result = await executeRegisteredTool(userId, name, parsedArgs, { conversationId });
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

// ==========================================
// 404 & Centralized JSON Error Handling Middleware
// ==========================================

apiRouter.use((req: Request, res: Response) => {
  const requestId = (req as any).requestId || 'req_' + crypto.randomUUID().substring(0, 16);
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Đường dẫn API "${req.method} ${req.path}" không tồn tại.`,
      requestId,
    },
    message: `Đường dẫn API "${req.method} ${req.path}" không tồn tại.`,
  });
});

apiRouter.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err.status || err.statusCode || 500);
  const code =
    err.code ||
    (status === 404
      ? 'NOT_FOUND'
      : status === 400
      ? 'VALIDATION_ERROR'
      : status === 401
      ? 'UNAUTHORIZED'
      : status === 403
      ? 'FORBIDDEN'
      : status === 409
      ? 'CONFLICT'
      : 'INTERNAL_SERVER_ERROR');
  const message =
    isProduction && status >= 500
      ? 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.'
      : err.message || 'Lỗi xử lý yêu cầu';
  const requestId = (req as any).requestId || 'req_' + crypto.randomUUID().substring(0, 16);

  if (!isProduction) {
    console.error(`[API Error] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      requestId,
      ...(err.details ? { details: err.details } : {}),
      ...(!isProduction && err.stack ? { stack: err.stack } : {}),
    },
    message,
  });
});
