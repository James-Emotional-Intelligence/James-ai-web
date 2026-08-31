import { db } from '../db/mysql';
import { Quiz, QuizQuestion, QuizSubmission, QuizAttemptResult, QuizAttempt } from '../../shared/types';
import { examRepo } from './exam-repository';
import { subjectRepo } from './subject-repository';
import { AiAdapter } from '../services/ai-adapter';
import crypto from 'crypto';

/**
 * Sanitizes quiz object so correctAnswer and explanation are never leaked before submit
 */
export function toPublicQuiz<T extends Quiz & { questions?: QuizQuestion[] }>(quiz: T): T {
  if (!quiz) return quiz;
  return {
    ...quiz,
    questions: quiz.questions?.map((q) => {
      const { correctAnswer: _ca, explanation: _ex, ...publicQ } = q;
      return publicQ as QuizQuestion;
    }),
  };
}

export class QuizRepository {
  private static instance: QuizRepository;
  private demoQuizzes: Map<string, Quiz[]> = new Map();
  private demoQuestions: Map<string, QuizQuestion[]> = new Map();
  private demoAttempts: Map<string, QuizAttemptResult[]> = new Map();
  private demoActiveAttempts: Map<string, QuizAttempt> = new Map();

  private constructor() {}

  public static getInstance(): QuizRepository {
    if (!QuizRepository.instance) {
      QuizRepository.instance = new QuizRepository();
    }
    return QuizRepository.instance;
  }

  public async getByUserId(userId: string, examId?: string): Promise<Quiz[]> {
    if (db.isHealthy()) {
      let sql = `
        SELECT q.id, q.user_id, q.exam_id, q.subject_id, q.title, q.type, q.milestone, q.difficulty, q.status, q.created_at,
               s.name as subject_name,
               (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count,
               (SELECT MAX(score) FROM quiz_attempts WHERE quiz_id = q.id AND user_id = q.user_id AND status = 'submitted') as last_score
        FROM quizzes q
        JOIN subjects s ON q.subject_id = s.id
        WHERE q.user_id = ?
      `;
      const params: any[] = [userId];

      if (examId) {
        sql += ` AND q.exam_id = ?`;
        params.push(examId);
      }

      sql += ` ORDER BY q.created_at DESC`;

      const rows = await db.query<any>(sql, params);

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        examId: r.exam_id,
        subjectId: r.subject_id,
        subjectName: r.subject_name || 'Môn học',
        title: r.title,
        type: r.type,
        milestone: r.milestone,
        difficulty: r.difficulty,
        status: r.status,
        questionCount: Number(r.question_count) || 5,
        lastScore: r.last_score !== null ? Number(r.last_score) : undefined,
        createdAt: r.created_at?.toISOString?.() || String(r.created_at),
      }));
    }

    const list = this.demoQuizzes.get(userId) || [];
    if (examId) {
      return list.filter((q) => q.examId === examId);
    }
    return list;
  }

  public async getAttemptsByUserId(userId: string): Promise<QuizAttemptResult[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT qa.id as attempt_id, qa.quiz_id, qa.score, qa.max_score, qa.status, qa.feedback_summary, qa.submitted_at
         FROM quiz_attempts qa
         WHERE qa.user_id = ? AND qa.status = 'submitted'
         ORDER BY qa.submitted_at DESC`,
        [userId]
      );
      return rows.map((r) => ({
        attemptId: r.attempt_id,
        quizId: r.quiz_id,
        score: Number(r.score) || 0,
        maxScore: Number(r.max_score) || 10,
        feedbackSummary: r.feedback_summary || '',
        submittedAt: r.submitted_at ? (r.submitted_at.toISOString?.() || String(r.submitted_at)) : new Date().toISOString(),
        answers: [],
      }));
    }

    const quizzes = this.demoQuizzes.get(userId) || [];
    const attempts: QuizAttemptResult[] = [];
    for (const q of quizzes) {
      const list = this.demoAttempts.get(q.id) || [];
      attempts.push(...list);
    }
    return attempts;
  }

  public async getById(userId: string, quizId: string, includeAnswers = false): Promise<(Quiz & { questions: QuizQuestion[] }) | null> {
    if (db.isHealthy()) {
      const [quizRow] = await db.query<any>(
        `SELECT q.id, q.user_id, q.exam_id, q.subject_id, q.title, q.type, q.milestone, q.difficulty, q.status, q.created_at,
                s.name as subject_name
         FROM quizzes q
         JOIN subjects s ON q.subject_id = s.id
         WHERE q.id = ? AND q.user_id = ?`,
        [quizId, userId]
      );

      if (!quizRow) return null;

      const questions = await this.getQuizQuestions(userId, quizId, includeAnswers);
      return {
        id: quizRow.id,
        userId: quizRow.user_id,
        examId: quizRow.exam_id,
        subjectId: quizRow.subject_id,
        subjectName: quizRow.subject_name || 'Môn học',
        title: quizRow.title,
        type: quizRow.type,
        milestone: quizRow.milestone,
        difficulty: quizRow.difficulty,
        status: quizRow.status,
        questionCount: questions.length,
        questions,
        createdAt: quizRow.created_at?.toISOString?.() || String(quizRow.created_at),
      };
    }

    const list = await this.getByUserId(userId);
    const quiz = list.find((q) => q.id === quizId);
    if (!quiz) return null;

    const questions = await this.getQuizQuestions(userId, quizId, includeAnswers);
    return {
      ...quiz,
      questions,
    };
  }

  public async getQuizQuestions(userId: string, quizId: string, includeAnswers = false): Promise<QuizQuestion[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT q.id, q.quiz_id, q.question_order, q.type, q.prompt, q.options_json,
                q.correct_answer_server_only, q.rubric_json, q.explanation_server_only,
                q.difficulty, q.topic_ref, q.source_reference
         FROM quiz_questions q
         JOIN quizzes z ON q.quiz_id = z.id
         WHERE q.quiz_id = ? AND z.user_id = ?
         ORDER BY q.question_order ASC`,
        [quizId, userId]
      );

      const parseJson = (v: any) => {
        if (!v) return undefined;
        if (typeof v === 'string') {
          try {
            return JSON.parse(v);
          } catch {
            return undefined;
          }
        }
        return v;
      };

      return rows.map((r) => ({
        id: r.id,
        quizId: r.quiz_id,
        order: r.question_order,
        type: r.type,
        prompt: r.prompt,
        options: parseJson(r.options_json),
        correctAnswer: includeAnswers ? r.correct_answer_server_only : undefined,
        explanation: includeAnswers ? r.explanation_server_only : undefined,
        difficulty: r.difficulty,
        topicRef: r.topic_ref,
        sourceReference: r.source_reference,
      }));
    }

    const questions = this.demoQuestions.get(quizId) || [];
    if (!includeAnswers) {
      return questions.map(({ correctAnswer, explanation, ...rest }) => ({
        ...rest,
      }));
    }
    return questions;
  }

  /**
   * Generates AI Quiz Draft for an Exam milestone and persists in MySQL transaction
   */
  public async generateQuizForExam(
    userId: string,
    examId: string,
    options: {
      milestone?: 'D-14' | 'D-7' | 'D-3' | 'D-1';
      questionCount?: number;
      difficulty?: 'easy' | 'medium' | 'hard';
      title?: string;
    } = {}
  ): Promise<Quiz> {
    const exam = await examRepo.getById(userId, examId);
    if (!exam) {
      throw new Error('Kỳ kiểm tra không tồn tại hoặc không thuộc quyền sở hữu');
    }

    const milestone = options.milestone || 'D-7';
    const questionCount = options.questionCount || 5;
    const difficulty = options.difficulty || 'medium';

    // 1. Generate structured draft via OpenAI
    const draft = await AiAdapter.generateQuizDraft({
      subject: exam.subjectName || 'Toán học',
      scope: exam.scopeText || '',
      topics: (exam.topics || []).map((t) => t.name),
      milestone,
      questionCount,
      difficulty,
    });

    const quizTitle = options.title || draft.title || `Đề Ôn Tập ${milestone} - ${exam.title}`;
    const quizId = 'quiz_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    const questions: QuizQuestion[] = (draft.questions || []).map((q, idx) => ({
      id: `q_${quizId}_${idx + 1}`,
      quizId,
      order: idx + 1,
      type: q.type || 'multiple_choice',
      prompt: q.prompt,
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty || difficulty,
      topicRef: q.topicRef || exam.topics?.[0]?.name || 'Kiến thức trọng tâm',
    }));

    const quiz: Quiz = {
      id: quizId,
      userId,
      examId,
      subjectId: exam.subjectId,
      subjectName: exam.subjectName,
      title: quizTitle,
      type: milestone === 'D-14' ? 'diagnostic' : milestone === 'D-7' ? 'practice' : milestone === 'D-3' ? 'simulation' : 'quick_review',
      milestone,
      difficulty,
      status: 'ready',
      questionCount: questions.length,
      questions,
      generatedByAi: true,
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO quizzes (id, user_id, exam_id, subject_id, title, type, milestone, difficulty, status, generated_by_ai, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', 1, NOW(3))`,
          [quiz.id, userId, examId, quiz.subjectId, quiz.title, quiz.type, milestone, quiz.difficulty]
        );

        for (const q of questions) {
          await conn.execute(
            `INSERT INTO quiz_questions (id, quiz_id, question_order, type, prompt, options_json, correct_answer_server_only, explanation_server_only, difficulty, topic_ref)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              q.id,
              quiz.id,
              q.order,
              q.type,
              q.prompt,
              JSON.stringify(q.options || []),
              q.correctAnswer || '',
              q.explanation || '',
              q.difficulty,
              q.topicRef || null,
            ]
          );
        }

        // Link to exam_milestones
        await conn.execute(
          `UPDATE exam_milestones 
           SET related_quiz_id = ?, updated_at = NOW(3)
           WHERE exam_id = ? AND user_id = ? AND milestone_type = ?`,
          [quiz.id, examId, userId, milestone]
        );
      });
    } else {
      const list = this.demoQuizzes.get(userId) || [];
      list.unshift(quiz);
      this.demoQuizzes.set(userId, list);
      this.demoQuestions.set(quiz.id, questions);
    }

    return quiz;
  }

  public async generateSubjectQuiz(
    userId: string,
    options: {
      subjectId?: string;
      subjectName?: string;
      topics?: string[];
      scope?: string;
      difficulty?: 'easy' | 'medium' | 'hard';
      questionCount?: number;
      format?: 'multiple_choice' | 'essay' | 'combined';
      title?: string;
    } = {}
  ): Promise<Quiz> {
    const subjects = await subjectRepo.getByUserId(userId);
    const targetSubject = subjects.find((s) => s.id === options.subjectId || s.name.toLowerCase().includes((options.subjectName || '').toLowerCase())) || subjects[0];
    const subjectId = targetSubject ? targetSubject.id : (options.subjectId || 'subj-math');
    const subjectName = targetSubject ? targetSubject.name : (options.subjectName || 'Toán học');

    const difficulty = options.difficulty || 'medium';
    const questionCount = Math.min(30, Math.max(3, options.questionCount || 5));
    const topics = options.topics && options.topics.length > 0 ? options.topics : [subjectName];

    const draft = await AiAdapter.generateQuizDraft({
      subject: subjectName,
      scope: options.scope || 'Kiến thức trọng tâm',
      topics,
      milestone: 'D-7',
      questionCount,
      difficulty,
    });

    const quizTitle = options.title || draft.title || `Đề Luyện Tập AI - Môn ${subjectName} (${difficulty.toUpperCase()})`;
    const quizId = 'quiz_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    const questions: QuizQuestion[] = (draft.questions || []).map((q, idx) => ({
      id: `q_${quizId}_${idx + 1}`,
      quizId,
      order: idx + 1,
      type: q.type || (options.format === 'essay' ? 'short_answer' : 'multiple_choice'),
      prompt: q.prompt,
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty || difficulty,
      topicRef: q.topicRef || topics[0] || subjectName,
    }));

    const quiz: Quiz = {
      id: quizId,
      userId,
      subjectId,
      subjectName,
      title: quizTitle,
      type: 'practice',
      difficulty,
      status: 'ready',
      questionCount: questions.length,
      questions,
      generatedByAi: true,
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO quizzes (id, user_id, exam_id, subject_id, title, type, milestone, difficulty, status, generated_by_ai, created_at)
           VALUES (?, ?, NULL, ?, ?, 'practice', 'D-7', ?, 'ready', 1, NOW(3))`,
          [quiz.id, userId, quiz.subjectId, quiz.title, quiz.difficulty]
        );

        for (const q of questions) {
          await conn.execute(
            `INSERT INTO quiz_questions (id, quiz_id, question_order, type, prompt, options_json, correct_answer_server_only, explanation_server_only, difficulty, topic_ref)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              q.id,
              quiz.id,
              q.order,
              q.type,
              q.prompt,
              JSON.stringify(q.options || []),
              q.correctAnswer || '',
              q.explanation || '',
              q.difficulty,
              q.topicRef || null,
            ]
          );
        }
      });
    } else {
      const list = this.demoQuizzes.get(userId) || [];
      list.unshift(quiz);
      this.demoQuizzes.set(userId, list);
      this.demoQuestions.set(quiz.id, questions);
    }

    return quiz;
  }

  public async generateRetakeWrongQuestionsQuiz(
    userId: string,
    originalQuizId: string,
    wrongQuestionIds: string[]
  ): Promise<Quiz> {
    const originalQuestions = await this.getQuizQuestions(userId, originalQuizId, true);
    const wrongQuestions = originalQuestions.filter((q) => wrongQuestionIds.includes(q.id));

    if (wrongQuestions.length === 0) {
      throw new Error('Không tìm thấy câu hỏi sai để làm lại.');
    }

    const quizId = 'quiz_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const quizTitle = `Luyện Lại Câu Sai - ${wrongQuestions.length} Câu`;

    const questions: QuizQuestion[] = wrongQuestions.map((q, idx) => ({
      ...q,
      id: `q_${quizId}_${idx + 1}`,
      quizId,
      order: idx + 1,
    }));

    const quiz: Quiz = {
      id: quizId,
      userId,
      subjectId: 'subj-math',
      subjectName: 'Ôn tập câu sai',
      title: quizTitle,
      type: 'weak_topic',
      difficulty: 'medium',
      status: 'ready',
      questionCount: questions.length,
      questions,
      generatedByAi: false,
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO quizzes (id, user_id, exam_id, subject_id, title, type, milestone, difficulty, status, generated_by_ai, created_at)
           VALUES (?, ?, NULL, ?, ?, 'weak_topic', NULL, 'medium', 'ready', 0, NOW(3))`,
          [quiz.id, userId, quiz.subjectId, quiz.title]
        );

        for (const q of questions) {
          await conn.execute(
            `INSERT INTO quiz_questions (id, quiz_id, question_order, type, prompt, options_json, correct_answer_server_only, explanation_server_only, difficulty, topic_ref)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              q.id,
              quiz.id,
              q.order,
              q.type,
              q.prompt,
              JSON.stringify(q.options || []),
              q.correctAnswer || '',
              q.explanation || '',
              q.difficulty,
              q.topicRef || null,
            ]
          );
        }
      });
    } else {
      const list = this.demoQuizzes.get(userId) || [];
      list.unshift(quiz);
      this.demoQuizzes.set(userId, list);
      this.demoQuestions.set(quiz.id, questions);
    }

    return quiz;
  }

  /**
   * Starts a new in-progress attempt for a quiz
   */
  public async startAttempt(userId: string, quizId: string): Promise<QuizAttempt> {
    const quiz = await this.getById(userId, quizId, false);
    if (!quiz) {
      throw new Error('Đề ôn tập không tồn tại hoặc không thuộc quyền sở hữu');
    }

    const attemptId = 'att_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const startedAt = new Date().toISOString();

    const attempt: QuizAttempt = {
      id: attemptId,
      quizId,
      userId,
      startedAt,
      maxScore: 10,
      status: 'in_progress',
      answers: [],
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO quiz_attempts (id, quiz_id, user_id, started_at, score, max_score, status)
         VALUES (?, ?, ?, NOW(3), NULL, 10.00, 'in_progress')`,
        [attemptId, quizId, userId]
      );
    } else {
      this.demoActiveAttempts.set(attemptId, attempt);
    }

    return attempt;
  }

  /**
   * Submits and grades quiz attempt, updates topic mastery per topic, and marks milestone completed
   */
  public async submitQuizAttempt(
    userId: string,
    submission: {
      attemptId?: string;
      quizId: string;
      answers: { questionId: string; answer: string }[];
    }
  ): Promise<QuizAttemptResult> {
    const questions = await this.getQuizQuestions(userId, submission.quizId, true);
    if (questions.length === 0) {
      const err: any = new Error('Đề thi không tồn tại hoặc không có câu hỏi');
      err.status = 404;
      err.code = 'QUIZ_NOT_FOUND';
      throw err;
    }

    if (submission.attemptId) {
      if (db.isHealthy()) {
        const attRows = await db.query<any>(
          'SELECT id, user_id, quiz_id, status, score, feedback_summary, submitted_at FROM quiz_attempts WHERE id = ?',
          [submission.attemptId]
        );
        if (attRows.length === 0 || attRows[0].user_id !== userId) {
          const err: any = new Error('Lượt làm bài không tồn tại hoặc không thuộc quyền sở hữu.');
          err.status = 404;
          err.code = 'ATTEMPT_NOT_FOUND';
          throw err;
        }
        const attRow = attRows[0];
        if (attRow.quiz_id !== submission.quizId) {
          const err: any = new Error('Lượt làm bài không khớp với đề thi tương ứng.');
          err.status = 400;
          err.code = 'ATTEMPT_QUIZ_MISMATCH';
          throw err;
        }
        // Idempotency: if already submitted, return previous result without re-inserting
        if (attRow.status === 'submitted') {
          const existingAnswers = await db.query<any>(
            'SELECT question_id, answer_json, is_correct, feedback FROM quiz_answers WHERE attempt_id = ?',
            [submission.attemptId]
          );
          return {
            attemptId: submission.attemptId,
            quizId: submission.quizId,
            score: Number(attRow.score) || 0,
            maxScore: 10,
            totalQuestions: questions.length,
            correctCount: existingAnswers.filter((a: any) => a.is_correct).length,
            feedbackSummary: attRow.feedback_summary || '',
            answers: existingAnswers.map((a: any) => ({
              questionId: a.question_id,
              userAnswer: typeof a.answer_json === 'string' ? JSON.parse(a.answer_json) : a.answer_json,
              correctAnswer: questions.find((q) => q.id === a.question_id)?.correctAnswer || '',
              isCorrect: Boolean(a.is_correct),
              explanation: a.feedback || '',
            })),
            submittedAt: attRow.submitted_at?.toISOString?.() || String(attRow.submitted_at),
          };
        }
      }
    }

    const [quizRow] = db.isHealthy()
      ? await db.query<any>('SELECT exam_id, subject_id, milestone FROM quizzes WHERE id = ? AND user_id = ?', [submission.quizId, userId])
      : [{ exam_id: null, subject_id: 'subj-math', milestone: null }];

    const answersMap: Record<string, string> = {};
    for (const a of submission.answers || []) {
      answersMap[a.questionId] = a.answer;
    }

    let correctCount = 0;
    const scoredAnswers: QuizAttemptResult['answers'] = [];
    const topicPerformance: Record<string, { total: number; correct: number }> = {};

    for (const q of questions) {
      const userAns = answersMap[q.id] || '';
      const topic = q.topicRef || 'Kiến thức chung';
      if (!topicPerformance[topic]) {
        topicPerformance[topic] = { total: 0, correct: 0 };
      }
      topicPerformance[topic].total++;

      let isCorrect: boolean;
      let explanation = q.explanation || 'Đáp án chính xác.';

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        const cleanUser = String(userAns).trim().toLowerCase();
        const cleanCorrect = String(q.correctAnswer || '').trim().toLowerCase();

        // Check ID match ("A") or option text match
        isCorrect = cleanUser === cleanCorrect;
        if (!isCorrect && Array.isArray(q.options)) {
          const matchedOpt = q.options.find(
            (o: any) =>
              (o.id && String(o.id).toLowerCase() === cleanCorrect && String(o.text || '').toLowerCase() === cleanUser) ||
              (o.id && String(o.id).toLowerCase() === cleanUser && String(o.text || '').toLowerCase() === cleanCorrect)
          );
          if (matchedOpt) isCorrect = true;
        }
      } else {
        // Short answer grading
        const gradeRes = await AiAdapter.gradeShortAnswer({
          questionPrompt: q.prompt,
          userAnswer: userAns,
          correctAnswer: q.correctAnswer || '',
        });
        isCorrect = gradeRes.isCorrect;
        if (gradeRes.feedback) {
          explanation += ` [Nhận xét: ${gradeRes.feedback}]`;
        }
      }

      if (isCorrect) {
        correctCount++;
        topicPerformance[topic].correct++;
      }

      scoredAnswers.push({
        questionId: q.id,
        userAnswer: userAns,
        correctAnswer: q.correctAnswer || '',
        isCorrect,
        explanation,
      });
    }

    const score = Number(((correctCount / questions.length) * 10).toFixed(2));
    const attemptId = submission.attemptId || 'att_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const submittedAt = new Date().toISOString();

    const feedbackSummary =
      score >= 8
        ? 'Xuất sắc! Em đã nắm rất vững kiến thức và làm chủ các dạng bài.'
        : score >= 6.5
        ? 'Khá tốt! Em hãy chú ý xem lại những câu sai và củng cố phương pháp giải.'
        : 'Cần ôn tập thêm! Hãy đọc lại tóm tắt tài liệu lý thuyết trọng tâm trước khi làm lại đề mới.';

    const result: QuizAttemptResult = {
      attemptId,
      quizId: submission.quizId,
      score,
      maxScore: 10,
      totalQuestions: questions.length,
      correctCount,
      feedbackSummary,
      answers: scoredAnswers,
      submittedAt,
    };

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        // Insert or update attempt
        if (submission.attemptId) {
          await conn.execute(
            `UPDATE quiz_attempts 
             SET score = ?, status = 'submitted', submitted_at = NOW(3), feedback_summary = ?
             WHERE id = ? AND user_id = ?`,
            [score, feedbackSummary, submission.attemptId, userId]
          );
        } else {
          await conn.execute(
            `INSERT INTO quiz_attempts (id, quiz_id, user_id, started_at, submitted_at, score, max_score, status, feedback_summary)
             VALUES (?, ?, ?, NOW(3), NOW(3), ?, 10.00, 'submitted', ?)`,
            [attemptId, submission.quizId, userId, score, feedbackSummary]
          );
        }

        // Save answers
        for (const ans of scoredAnswers) {
          const ansId = 'ans_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO quiz_answers (id, attempt_id, question_id, answer_json, is_correct, score, feedback, answered_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
            [
              ansId,
              attemptId,
              ans.questionId,
              JSON.stringify(ans.userAnswer),
              ans.isCorrect ? 1 : 0,
              ans.isCorrect ? 10 / questions.length : 0,
              ans.explanation,
            ]
          );
        }

        // Update Topic Mastery per topic
        const subjectId = quizRow?.subject_id || 'subj-math';
        for (const [topicKey, perf] of Object.entries(topicPerformance)) {
          const topicScore = Math.round((perf.correct / perf.total) * 100);
          const mastId = 'mast_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);

          await conn.execute(
            `INSERT INTO topic_mastery (id, user_id, subject_id, topic_key, mastery_score, confidence, evidence_count, last_practiced_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 80, 1, NOW(3), NOW(3))
             ON DUPLICATE KEY UPDATE 
               mastery_score = ROUND((mastery_score * evidence_count + VALUES(mastery_score)) / (evidence_count + 1)),
               evidence_count = evidence_count + 1,
               confidence = LEAST(95, confidence + 5),
               last_practiced_at = NOW(3),
               updated_at = NOW(3)`,
            [mastId, userId, subjectId, topicKey, topicScore]
          );
        }

        // Mark exam milestone completed
        if (quizRow?.exam_id && quizRow?.milestone) {
          await conn.execute(
            `UPDATE exam_milestones 
             SET status = 'completed', completed_at = NOW(3), updated_at = NOW(3)
             WHERE exam_id = ? AND user_id = ? AND milestone_type = ?`,
            [quizRow.exam_id, userId, quizRow.milestone]
          );
        }
      });
    } else {
      const list = this.demoAttempts.get(submission.quizId) || [];
      list.push(result);
      this.demoAttempts.set(submission.quizId, list);
    }

    return result;
  }

  public async getAttemptResult(
    userId: string,
    attemptId: string
  ): Promise<{ attempt: QuizAttemptResult; quiz: Quiz & { questions: QuizQuestion[] } } | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, quiz_id, started_at, submitted_at, score, max_score, status, feedback_summary
         FROM quiz_attempts
         WHERE id = ? AND user_id = ?`,
        [attemptId, userId]
      );

      if (rows.length === 0) return null;
      const attRow = rows[0];

      const quiz = await this.getById(userId, attRow.quiz_id, true);
      if (!quiz) return null;

      const answerRows = await db.query<any>(
        `SELECT id, attempt_id, question_id, answer_json, is_correct, feedback, score
         FROM quiz_answers
         WHERE attempt_id = ?`,
         [attemptId]
      );

      const parseAnswer = (val: any) => {
        if (!val) return '';
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch {
            return val;
          }
        }
        return val;
      };

      const answersFeedback = answerRows.map((a: any) => {
        const question = quiz.questions?.find((q) => q.id === a.question_id);
        return {
          questionId: a.question_id,
          userAnswer: parseAnswer(a.answer_json),
          correctAnswer: question?.correctAnswer || '',
          isCorrect: Boolean(a.is_correct),
          explanation: a.feedback || question?.explanation || '',
        };
      });

      const attemptResult: QuizAttemptResult = {
        attemptId: attRow.id,
        quizId: attRow.quiz_id,
        score: Number(attRow.score) || 0,
        maxScore: Number(attRow.max_score) || 10,
        totalQuestions: quiz.questions?.length || 0,
        correctCount: answersFeedback.filter((a: any) => a.isCorrect).length,
        feedbackSummary: attRow.feedback_summary || '',
        answers: answersFeedback,
        submittedAt: attRow.submitted_at?.toISOString?.() || String(attRow.submitted_at),
      };

      return {
        attempt: attemptResult,
        quiz,
      };
    }

    for (const [quizId, attempts] of this.demoAttempts.entries()) {
      const att = attempts.find((a) => a.attemptId === attemptId);
      if (att) {
        const quiz = await this.getById(userId, quizId, true);
        if (quiz) {
          return { attempt: att, quiz };
        }
      }
    }
    return null;
  }

  public async submitAttempt(
    userId: string,
    quizId: string,
    answers: { questionId: string; answer: string }[],
    attemptId?: string
  ) {
    const attemptResult = await this.submitQuizAttempt(userId, { quizId, attemptId, answers });
    return {
      attempt: {
        id: attemptResult.attemptId,
        quizId: attemptResult.quizId,
        userId,
        score: attemptResult.score,
        maxScore: attemptResult.maxScore,
        status: 'submitted' as const,
        submittedAt: attemptResult.submittedAt,
        feedbackSummary: attemptResult.feedbackSummary,
      },
      answersFeedback: attemptResult.answers,
    };
  }

  public async createQuizWithQuestions(userId: string, quizData: Partial<Quiz>, questions: Partial<QuizQuestion>[]): Promise<Quiz> {
    const id = quizData.id || 'quiz_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const formattedQuestions: QuizQuestion[] = questions.map((q, i) => ({
      id: q.id || `q_${id}_${i + 1}`,
      quizId: id,
      order: q.order || i + 1,
      type: q.type === 'true_false' || q.type === 'short_answer' ? q.type : 'multiple_choice',
      prompt: q.prompt || (q as any).questionText || 'Câu hỏi',
      options: q.options || [],
      correctAnswer: q.correctAnswer || '',
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'medium',
      topicRef: q.topicRef,
    }));

    const quiz: Quiz = {
      id,
      userId,
      examId: quizData.examId,
      subjectId: quizData.subjectId || 'subj-math',
      subjectName: quizData.subjectName || 'Toán học',
      title: (quizData.title || 'Đề luyện tập AI').trim(),
      type: quizData.type || 'practice',
      milestone: quizData.milestone,
      difficulty: quizData.difficulty || 'medium',
      status: 'ready',
      questionCount: formattedQuestions.length,
      questions: formattedQuestions,
    };

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO quizzes (id, user_id, exam_id, subject_id, title, type, milestone, difficulty, status, generated_by_ai, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', 1, NOW(3))`,
          [quiz.id, userId, quiz.examId || null, quiz.subjectId, quiz.title, quiz.type, quiz.milestone || null, quiz.difficulty]
        );

        for (let i = 0; i < formattedQuestions.length; i++) {
          const q = formattedQuestions[i];
          await conn.execute(
            `INSERT INTO quiz_questions (id, quiz_id, question_order, type, prompt, options_json, correct_answer_server_only, explanation_server_only, difficulty, topic_ref)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              q.id,
              quiz.id,
              i + 1,
              q.type,
              q.prompt,
              JSON.stringify(q.options || []),
              q.correctAnswer || '',
              q.explanation || '',
              q.difficulty || 'medium',
              q.topicRef || null,
            ]
          );
        }
      });
    } else {
      const list = this.demoQuizzes.get(userId) || [];
      list.unshift(quiz);
      this.demoQuizzes.set(userId, list);
      this.demoQuestions.set(quiz.id, formattedQuestions);
    }

    return quiz;
  }

  public seedDemo(userId: string, quizzes: Quiz[], questionMap: Map<string, QuizQuestion[]>) {
    this.demoQuizzes.set(userId, [...quizzes]);
    for (const [k, v] of questionMap.entries()) {
      this.demoQuestions.set(k, v);
    }
  }
}

export const quizRepo = QuizRepository.getInstance();
