import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DeterministicScheduler, getLocalParts } from '../server/services/scheduler';
import type { BusyEvent, StudyTask, StudentProfile } from '../shared/types';
import { equivalentObjectiveAnswer } from '../server/services/short-answer-normalizer';

const timezone = 'Asia/Ho_Chi_Minh';
const knowledgeFixture = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/jami-quality-knowledge-7.json'), 'utf8')) as { version: string; questions: { id: string; expected_answer: string }[] };
const knowledgeFixtureValid = knowledgeFixture.questions.length === 10 && knowledgeFixture.questions.every((q) => q.id && q.expected_answer && equivalentObjectiveAnswer(q.expected_answer, q.expected_answer));
const base = new Date('2026-10-19T00:00:00.000Z');
const at = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, day, h - 7, m)).toISOString();
};
const profile: StudentProfile = {
  userId: 'quality-fixture', gradeLevel: 7, schoolName: 'Trường giả lập', goals: [],
  preferredSessionMinutes: 45, maxDailyStudyMinutes: 90,
  energyPreferences: { morning: 'medium', afternoon: 'medium', evening: 'medium' },
  sleepSchedule: { wakeTime: '06:00', bedTime: '21:30' },
  mealTimes: { lunch: '12:00', dinner: '18:00' },
};
const task = (id: string, title: string, dueAt = at(19, '21:30')): StudyTask => ({
  id, userId: profile.userId, subjectId: 'fixture-math', title, dueAt,
  status: 'pending', priority: 'high', difficulty: 'medium', estimatedMinutes: 45,
  minSessionMinutes: 45, maxSessionMinutes: 45, splittable: false, locked: false, completionPercent: 0,
});
const busy = (id: string, day: number, start: string, end: string): BusyEvent => ({
  id, userId: profile.userId, type: 'personal', title: id,
  startsAt: at(day, start), endsAt: at(day, end), timezone, isFixed: true,
});
const scenarios = [
  { id: 'P01', tasks: [task('math', 'Ôn Toán')], existing: [], busy: [busy('school', 19, '07:00', '11:30'), busy('extra', 19, '16:00', '17:30')], days: 1 },
  { id: 'P02', tasks: [task('math', 'Ôn Toán'), task('english', 'Ôn Anh')], existing: [], busy: [busy('locked', 19, '19:00', '20:00')], days: 1 },
  { id: 'P03', tasks: [task('english', 'Bài Anh', at(20, '20:00'))], existing: [], busy: [busy('busy', 20, '18:30', '21:00'), busy('school', 19, '07:00', '21:30'), busy('school-next', 20, '07:00', '18:30')], days: 2 },
  { id: 'P04', tasks: [task('homework', 'Bài tập về nhà', at(21, '20:00')), task('exam', 'Ôn kiểm tra', at(22, '20:00'))], existing: [], busy: [], days: 3 },
  { id: 'P05', tasks: [task('missed', 'Ôn lại phiên bỏ lỡ', at(21, '20:00'))], existing: [{ ...task('done', 'Phiên đã chốt'), locked: true, scheduledStartAt: at(19, '19:00'), scheduledEndAt: at(19, '19:45'), status: 'completed' as const }], busy: [busy('new-class', 19, '16:00', '18:00')], days: 2 },
];
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const results = scenarios.map((scenario) => {
  const existingBefore = JSON.stringify(scenario.existing);
  const proposal = DeterministicScheduler.generateScheduleProposal(scenario.tasks, scenario.existing, scenario.busy, [], profile, base, scenario.days, scenario.id, [], timezone);
  const placed = proposal.tasksToSchedule.map((item) => ({ id: item.taskId, start: Date.parse(item.proposedStart), end: Date.parse(item.proposedEnd) }));
  const blocked = [...scenario.busy.map((b) => ({ start: Date.parse(b.startsAt), end: Date.parse(b.endsAt) })), ...scenario.existing.filter((t) => t.locked && t.scheduledStartAt && t.scheduledEndAt).map((t) => ({ start: Date.parse(t.scheduledStartAt!), end: Date.parse(t.scheduledEndAt!) }))];
  const overlapCount = placed.reduce((sum, item, index) => sum + blocked.filter((b) => overlap(item, b)).length + placed.slice(index + 1).filter((other) => overlap(item, other)).length, 0);
  const scheduledIds = new Set(placed.map((p) => p.id.replace(/_p\d+$/, '')));
  const unscheduledTitles = new Set(proposal.unscheduledItems.map((item) => item.title));
  const forgottenTaskCount = scenario.tasks.filter((t) => !scheduledIds.has(t.id) && !unscheduledTitles.has(t.title)).length;
  const duplicateTaskCount = placed.length - scheduledIds.size;
  const deadlineFailures = placed.filter((p) => p.end > Date.parse(scenario.tasks.find((t) => t.id === p.id)?.dueAt || '')).length;
  const pastCount = placed.filter((p) => p.start < base.getTime()).length;
  const sleepOverlapCount = placed.filter((p) => {
    const start = getLocalParts(new Date(p.start), timezone);
    const end = getLocalParts(new Date(p.end), timezone);
    return start.hour * 60 + start.minute < 7 * 60 || end.hour * 60 + end.minute > 21 * 60 + 30;
  }).length;
  const byDay = new Map<string, number>();
  for (const p of placed) {
    const day = getLocalParts(new Date(p.start), timezone).dateKey;
    byDay.set(day, (byDay.get(day) || 0) + (p.end - p.start) / 60_000);
  }
  const dailyLimitExceeded = [...byDay.values()].filter((minutes) => minutes > profile.maxDailyStudyMinutes).length;
  const totalMinutes = placed.reduce((sum, p) => sum + (p.end - p.start) / 60_000, 0);
  const existingPreserved = JSON.stringify(scenario.existing) === existingBefore;
  const unscheduledWithReasonCount = proposal.unscheduledItems.filter((item) => item.reason.trim().length > 0).length;
  const pass = overlapCount === 0 && forgottenTaskCount === 0 && duplicateTaskCount === 0 && deadlineFailures === 0 && pastCount === 0 && sleepOverlapCount === 0 && dailyLimitExceeded === 0 && existingPreserved && (scenario.id !== 'P03' || unscheduledWithReasonCount === 1);
  return { id: scenario.id, status: pass ? 'PASS' : 'FAIL', overlap_count: overlapCount, forgotten_task_count: forgottenTaskCount, duplicate_task_count: duplicateTaskCount, deadline_failures: deadlineFailures, past_count: pastCount, sleep_overlap_count: sleepOverlapCount, daily_limit_exceeded: dailyLimitExceeded, existing_preserved: existingPreserved, total_minutes: totalMinutes, unscheduled_with_reason_count: unscheduledWithReasonCount, scheduled_count: placed.length, input_count: scenario.tasks.length };
});
const report = {
  version: 1, mode: 'OFFLINE_DETERMINISTIC', timestamp: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  fixture_timezone: timezone, fixture_start: '2026-10-19',
  knowledge: { status: 'NOT_RUN', correct_count: null, total: knowledgeFixture.questions.length,
    fixture_version: knowledgeFixture.version, fixture_valid: knowledgeFixtureValid,
    reason: 'Chưa chạy 10 câu với provider AI thật; fixture cần giáo viên duyệt.' },
  planning: { status: results.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL', scenarios_passed: results.filter((r) => r.status === 'PASS').length, total: 5, scenarios: results },
  generated_questions: { status: 'NOT_RUN', generated: 0, target: 20, teacher_approved: 0, reason: 'Chưa bật LIVE-AI và chưa có giáo viên duyệt.' },
  live_ai: { status: 'NOT_RUN', reason: process.env.JAMI_QUALITY_LIVE === '1' ? 'Chế độ live chưa được triển khai an toàn với giới hạn chi phí.' : 'Chưa bật JAMI_QUALITY_LIVE=1.' },
};
const outputDir = path.resolve('test-results/jami-quality');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outputDir, 'report.csv'), ['scenario,status,overlap_count,forgotten_task_count,duplicate_task_count,deadline_failures,past_count,sleep_overlap_count,daily_limit_exceeded,total_minutes,unscheduled_with_reason_count,scheduled_count,input_count', ...results.map((r) => [r.id, r.status, r.overlap_count, r.forgotten_task_count, r.duplicate_task_count, r.deadline_failures, r.past_count, r.sleep_overlap_count, r.daily_limit_exceeded, r.total_minutes, r.unscheduled_with_reason_count, r.scheduled_count, r.input_count].join(','))].join('\n') + '\n');
console.log(JSON.stringify({ planning: report.planning.status, scenarios_passed: report.planning.scenarios_passed, knowledge: report.knowledge.status, generated_questions: report.generated_questions.status, live_ai: report.live_ai.status }));
if (report.planning.status === 'FAIL' || !knowledgeFixtureValid || process.env.JAMI_QUALITY_LIVE === '1') process.exitCode = 1;
