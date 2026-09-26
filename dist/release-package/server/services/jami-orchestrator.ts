import { jamiRepo } from '../repositories/jami-repository';
import { timetableRepo } from '../repositories/timetable-repository';
import { taskRepo } from '../repositories/task-repository';
import { examRepo } from '../repositories/exam-repository';
import { materialRepo } from '../repositories/material-repository';
import { sessionCheckinRepo } from '../repositories/session-checkin-repository';
import { UserRepository } from '../repositories/user-repository';
import { AiAdapter } from './ai-adapter';
import { executeRegisteredTool } from '../ai/tool-registry';
import { JamiActionService, ActionResult } from './jami-action-service';
import { getNowInTimeZone, getZonedDateParts, resolveUserTimeZone } from '../lib/date-time';
import { AppError } from '../errors/app-errors';
import { StoredTurnResponse } from '../repositories/jami-repository';
import { ALLOWED_NAVIGATE_ROUTES } from './jami-action-service';
import { z } from 'zod';

const userRepo = UserRepository.getInstance();
const jamiActionService = JamiActionService.getInstance();

export interface ProcessTurnInput {
  userId: string;
  message: string;
  conversationId?: string;
  clientMessageId?: string;
  source: 'text' | 'voice' | 'realtime';
  materialId?: string;
  voiceOptions?: {
    speed?: number;
    emotion?: string;
  };
}

export interface ProcessTurnOutput {
  userMessage?: any;
  replyMessage: any;
  clientAction?: any;
  proposal?: any;
  actionResult?: ActionResult;
  isDemoMode: boolean;
}

export class JamiOrchestrator {
  private static instance: JamiOrchestrator;

  private constructor() {}

  public static getInstance(): JamiOrchestrator {
    if (!JamiOrchestrator.instance) {
      JamiOrchestrator.instance = new JamiOrchestrator();
    }
    return JamiOrchestrator.instance;
  }

  /**
   * Unified turn processor for Text chat, Web Speech voice commands, and Realtime sessions
   */
  public async processTurn(input: ProcessTurnInput): Promise<ProcessTurnOutput> {
    const { userId, message, clientMessageId, source, materialId } = input;
    let conversationId = input.conversationId;

    // 1. Resolve or create conversation with strict ownership check
    if (conversationId) {
      const existingConv = await jamiRepo.getConversation(userId, conversationId);
      if (!existingConv) {
        throw new AppError('Conversation not found or forbidden', 404, 'CONVERSATION_NOT_FOUND_OR_FORBIDDEN');
      }
      conversationId = existingConv.id;
    } else {
      const existingList = await jamiRepo.getConversations(userId);
      if (existingList.length > 0) {
        conversationId = existingList[0].id;
      } else {
        const newConv = await jamiRepo.createConversation(userId, 'Hội thoại chính');
        conversationId = newConv.id;
      }
    }

    // Distributed Turn Claiming
    if (clientMessageId) {
      const claimResult = await jamiRepo.claimTurn(userId, clientMessageId, conversationId);
      if (claimResult.state === 'completed') {
        const stored = claimResult.responseJson;
        if (!stored?.replyMessageId || !stored.replyText) {
          throw new AppError('Stored turn response is unavailable', 409, 'TURN_RESPONSE_UNAVAILABLE');
        }
        return {
          userMessage: stored.userMessage,
          replyMessage: {
            id: stored.replyMessageId, text: stored.replyText, emotion: stored.emotion,
            suggestedActions: stored.suggestedActions, requiresConfirmation: stored.requiresConfirmation,
            confirmationSummary: stored.confirmationSummary, proposalId: stored.proposalId,
          },
          clientAction: stored.clientAction,
          proposal: stored.proposal,
          actionResult: stored.actionResult as ActionResult | undefined,
          isDemoMode: !AiAdapter.isConfigured(),
        };
      } else if (claimResult.state === 'processing') {
        throw new AppError('This turn is already being processed', 409, 'TURN_IN_PROGRESS');
      } else if (claimResult.state === 'failed') {
        throw new Error(claimResult.errorMessage || 'Lượt tương tác trước đó đã thất bại.');
      }
    }

    try {
      // Load history before inserting the current message so the prompt carries it exactly once.
      const conversationHistory = buildRecentHistory(await jamiRepo.getMessages(userId, conversationId, 20));
      // 2. Save user message to MySQL (idempotent if clientMessageId is present)
      const userMsg = await jamiRepo.saveMessage(userId, {
        conversationId,
        sender: 'user',
        text: message.trim(),
        clientMessageId,
      });
      if (clientMessageId) {
        await jamiRepo.attachTurnUserMessage(userId, clientMessageId, userMsg.id);
      }

    // 3. Build rich real user context from MySQL & Date/Time helper
    const user = await userRepo.findById(userId);
    const profile = await userRepo.getProfile(userId);
    const studentName = user?.preferredName || user?.displayName || 'bạn';
    const userTz = resolveUserTimeZone(user?.timezone);
    const timeInfo = getNowInTimeZone(userTz);

    const activeTimetable = await timetableRepo.getActiveTimetable(userId);
    const timetableEntries = activeTimetable?.id
      ? await timetableRepo.getTimetableEntries(userId, activeTimetable.id)
      : await timetableRepo.getTimetableEntries(userId);

    const tasks = await taskRepo.getByUserId(userId);
    const exams = await examRepo.getByUserId(userId);
    const materials = await materialRepo.getByUserId(userId);

    const pendingTasks = tasks
      .filter((t) => t.status === 'pending' || t.status === 'in_progress')
      .map((t) => ({
        id: t.id,
        title: t.title,
        subject: t.subjectName,
        estimatedMinutes: t.estimatedMinutes,
        dueAt: t.dueAt,
      }));

    const todayParts = getZonedDateParts(timeInfo.now, userTz);
    const todayStartMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);

    const upcomingExams = exams
      .filter((e) => {
        const examDate = new Date(e.examAt);
        const examParts = getZonedDateParts(examDate, userTz);
        const examDayMs = Date.UTC(examParts.year, examParts.month - 1, examParts.day);
        return e.status === 'upcoming' && examDayMs >= todayStartMs;
      })
      .map((e) => {
        const examDate = new Date(e.examAt);
        const examParts = getZonedDateParts(examDate, userTz);
        const examDayMs = Date.UTC(examParts.year, examParts.month - 1, examParts.day);
        const daysLeft = Math.max(0, Math.round((examDayMs - todayStartMs) / (1000 * 3600 * 24)));
        return {
          id: e.id,
          title: e.title,
          subject: e.subjectName,
          daysLeft,
          examAt: e.examAt,
        };
      });

    const todayExceptions = await timetableRepo.getExceptions(userId, timeInfo.currentDateStr, timeInfo.currentDateStr);
    const skippedEntryIds = new Set(todayExceptions.map((exc) => exc.timetableEntryId));

    const todaySessions = timetableEntries
      .filter((e) => Number(e.dayOfWeek) === timeInfo.currentDayOfWeek && !skippedEntryIds.has(e.id))
      .map((e) => ({
        title: e.title,
        time: `${e.startLocalTime} - ${e.endLocalTime}`,
        subject: e.subjectName,
      }));

    const recentCheckins = await sessionCheckinRepo.getCheckins(userId);
    const recentCheckinSummary = recentCheckins.slice(-5).map((c) => ({
      date: c.occurrenceDate,
      learnedContent: c.learnedContent,
      homework: c.homework,
      reflection: c.reflection,
      understandingLevel: c.understandingLevel,
      attendanceStatus: c.attendanceStatus,
    }));

    let attachedMaterialInfo: { id: string; title: string; summary?: string; contentText?: string } | undefined = undefined;
    if (materialId) {
      const mat = await materialRepo.getById(userId, materialId);
      if (mat) {
        attachedMaterialInfo = {
          id: mat.id,
          title: mat.title,
          summary: mat.summary,
          contentText: mat.contentText ? mat.contentText.slice(0, 4000) : undefined,
        };
      }
    }

    const context = {
      userId,
      conversationId,
      studentName,
      gradeLevel: profile?.gradeLevel ?? undefined,
      todaySessions,
      pendingTasks,
      upcomingExams,
      latestMaterialTitle: materials[0]?.title,
      attachedMaterial: attachedMaterialInfo,
      history: conversationHistory,
      recentCheckins: recentCheckinSummary,
      currentTimeVn: timeInfo.now.toLocaleString('vi-VN', {
        timeZone: userTz,
        dateStyle: 'full',
        timeStyle: 'medium',
      }),
      currentIso: timeInfo.currentIso,
      currentDayOfWeek: `${timeInfo.currentDayOfWeekVn} (dayOfWeek: ${timeInfo.currentDayOfWeek})`,
    };

    // 4. Generate Jami chat response
    const chatRes = await AiAdapter.generateJamiChat(message.trim(), context);

    let proposal = chatRes.proposal;
    let clientAction = chatRes.clientAction;
    let actionResult: ActionResult | undefined = undefined;
    let requiresConfirmation = Boolean(chatRes.requiresConfirmation);
    const confirmationSummary = chatRes.confirmationSummary;

    // 5. Execute actionIntent via canonical Tool Registry
    if (chatRes.actionIntent && chatRes.actionIntent.kind !== 'none') {
      const { toolName, arguments: toolArgs } = chatRes.actionIntent;
      if (toolName) {
        const toolRes = await executeRegisteredTool(
          {
            userId,
            conversationId,
            source,
            clientTurnId: clientMessageId,
            timezone: userTz,
            now: timeInfo.now,
          },
          toolName,
          toolArgs || {}
        );
        actionResult = toolRes;

        if (toolRes.success) {
          if (toolRes.proposal) {
            proposal = toolRes.proposal;
            requiresConfirmation = Boolean(proposal && proposal.id);
          }
          if (toolRes.message && (!chatRes.message || chatRes.message.length < 20)) {
            chatRes.message = toolRes.message;
          }
          if (toolRes.clientAction) {
            clientAction = toolRes.clientAction;
          }
        }
      }
    }

    // 6. Save Jami reply message with strict fail-closed proposal verification
    const hasRealProposal = Boolean(proposal && proposal.id);
    const jamiMsg = await jamiRepo.saveMessage(userId, {
      conversationId,
      sender: 'jami',
      text: chatRes.message,
      emotion: chatRes.emotion || 'speaking',
      suggestedActions: normalizeSuggestedActions(chatRes.suggestedActions),
      requiresConfirmation: hasRealProposal,
      confirmationSummary: hasRealProposal ? (confirmationSummary || chatRes.message) : undefined,
      proposalId: proposal?.id,
      proposal,
    });

    if (clientMessageId) {
      const storedResponse: StoredTurnResponse = {
        replyMessageId: jamiMsg.id,
        replyText: jamiMsg.text,
        emotion: jamiMsg.emotion,
        suggestedActions: jamiMsg.suggestedActions,
        requiresConfirmation: jamiMsg.requiresConfirmation,
        confirmationSummary: jamiMsg.confirmationSummary,
        proposalId: proposal?.id,
        clientAction,
        userMessage: userMsg,
        proposal,
        actionResult,
        isDemoMode: !AiAdapter.isConfigured(),
      };
      await jamiRepo.completeTurn(userId, clientMessageId, userMsg.id, jamiMsg.id, proposal?.id, storedResponse);
    }

    const isDemo = !AiAdapter.isConfigured();

    return {
      userMessage: userMsg,
      replyMessage: jamiMsg,
      clientAction,
      proposal,
      actionResult,
      isDemoMode: isDemo,
    };
    } catch (err: any) {
      if (clientMessageId) {
        await jamiRepo.failTurn(userId, clientMessageId, 'TURN_PROCESSING_FAILED');
      }
      throw err;
    }
  }
}

export const jamiOrchestrator = JamiOrchestrator.getInstance();

export const SuggestedActionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  action: z.enum(['message', 'navigate', 'confirm', 'reject']),
  route: z.string().nullable(),
}).strict();

function normalizeSuggestedActions(actions: unknown): Array<z.infer<typeof SuggestedActionSchema>> {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((item) => typeof item === 'string' || (item && typeof item === 'object'))
    .slice(0, 5)
    .map((item) => {
      if (typeof item === 'string') {
        return SuggestedActionSchema.parse({ label: item.slice(0, 80), action: 'message', route: null });
      }
      const value = item as any;
      const action = String(value.action || 'message');
      const route = typeof value.route === 'string' && ALLOWED_NAVIGATE_ROUTES.includes(value.route as (typeof ALLOWED_NAVIGATE_ROUTES)[number])
        ? value.route
        : null;
      const parsed = SuggestedActionSchema.safeParse({
        label: String(value.label || value.title || value.action || '').slice(0, 80),
        action,
        route: action === 'navigate' ? route : null,
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((item) => Boolean(item && item.label.length > 0));
}

export function buildRecentHistory(
  messages: Array<{ sender: string; text?: string }>,
  maxMessages = 20,
  maxChars = 12000
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const newest = messages.slice(-maxMessages).reverse();
  const selected: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let remaining = maxChars;
  for (const message of newest) {
    const content = (message.text || '').trim();
    if (!content || remaining <= 0) continue;
    const bounded = content.slice(0, Math.min(1200, remaining));
    selected.push({ role: message.sender === 'user' ? 'user' : 'assistant', content: bounded });
    remaining -= bounded.length;
  }
  return selected.reverse();
}

