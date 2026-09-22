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
import { getNowInTimeZone, resolveUserTimeZone } from '../lib/date-time';

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

    // 1. Resolve or create conversation
    if (!conversationId) {
      const existingList = await jamiRepo.getConversations(userId);
      if (existingList.length > 0) {
        conversationId = existingList[0].id;
      } else {
        const newConv = await jamiRepo.createConversation(userId, 'Hội thoại chính');
        conversationId = newConv.id;
      }
    }

    // 2. Save user message to MySQL (idempotent if clientMessageId is present)
    const userMsg = await jamiRepo.saveMessage(userId, {
      conversationId,
      sender: 'user',
      text: message.trim(),
      clientMessageId,
    });

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

    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const upcomingExams = exams
      .filter((e) => {
        const examDate = new Date(e.examAt);
        const examDayMs = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
        return e.status === 'upcoming' && examDayMs >= todayStartMs;
      })
      .map((e) => {
        const examDate = new Date(e.examAt);
        const examDayMs = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
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
      gradeLevel: profile?.gradeLevel || 9,
      todaySessions,
      pendingTasks,
      upcomingExams,
      latestMaterialTitle: materials[0]?.title,
      attachedMaterial: attachedMaterialInfo,
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
          userId,
          toolName,
          toolArgs || {},
          { conversationId }
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
      suggestedActions: [
        { label: 'Xem lịch học hôm nay', action: 'navigate', route: '/today' },
        { label: 'Bắt đầu Hẹn giờ tập trung', action: 'navigate', route: '/focus' },
        { label: 'Làm bài luyện tập AI', action: 'navigate', route: '/exams' },
      ],
      requiresConfirmation: hasRealProposal,
      confirmationSummary: hasRealProposal ? (confirmationSummary || chatRes.message) : undefined,
      proposalId: proposal?.id,
      proposal,
    });

    const isDemo = !AiAdapter.isConfigured();

    return {
      userMessage: userMsg,
      replyMessage: jamiMsg,
      clientAction,
      proposal,
      actionResult,
      isDemoMode: isDemo,
    };
  }
}

export const jamiOrchestrator = JamiOrchestrator.getInstance();
