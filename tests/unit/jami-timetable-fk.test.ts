import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewAddTimetableEntryArgsSchema } from '../../shared/schemas';
import { TOOL_REGISTRY } from '../../server/ai/tool-registry';
import type { DbExecutor } from '../../server/db/mysql';
import { timetableRepo } from '../../server/repositories/timetable-repository';

describe('Jami timetable entry foreign-key safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose or retain an AI-supplied timetableId', () => {
    expect('timetableId' in PreviewAddTimetableEntryArgsSchema.shape).toBe(false);

    const publicArgs = PreviewAddTimetableEntryArgsSchema.parse({
      timetableId: 'tt_fake_does_not_exist',
      title: 'Toán',
      dayOfWeek: 1,
      startLocalTime: '07:00',
      endLocalTime: '07:45',
      commuteBeforeMinutes: 0,
      commuteAfterMinutes: 0,
    });
    expect(publicArgs).not.toHaveProperty('timetableId');

    const tool = TOOL_REGISTRY.preview_add_timetable_entry;
    const legacyPayload = tool.proposalSchema.parse({
      timetableId: 'tt_old_invalid',
      title: 'Toán',
      dayOfWeek: 1,
      startLocalTime: '07:00',
      endLocalTime: '07:45',
      commuteBeforeMinutes: 0,
      commuteAfterMinutes: 0,
    });
    expect(legacyPayload).not.toHaveProperty('timetableId');
  });

  it('confirms with the timetable resolved by the server, ignoring a legacy fake id', async () => {
    const getOrCreate = vi.spyOn(timetableRepo, 'getOrCreateActiveTimetable').mockResolvedValue({
      id: 'tt_owned',
      userId: 'user_a',
      name: 'Thời khóa biểu chính khóa',
      timezone: 'Asia/Ho_Chi_Minh',
      isActive: true,
      entries: [],
    });
    const createEntry = vi.spyOn(timetableRepo, 'createTimetableEntry').mockImplementation(async (_userId, data) => ({
      id: 'entry_1',
      timetableId: data.timetableId!,
      title: data.title!,
      dayOfWeek: data.dayOfWeek!,
      startLocalTime: data.startLocalTime!,
      endLocalTime: data.endLocalTime!,
      commuteBeforeMinutes: data.commuteBeforeMinutes ?? 0,
      commuteAfterMinutes: data.commuteAfterMinutes ?? 0,
    }));
    const executor = { query: vi.fn(), execute: vi.fn() } as unknown as DbExecutor;
    const tool = TOOL_REGISTRY.preview_add_timetable_entry;
    const payload = tool.proposalSchema.parse({
      timetableId: 'tt_old_invalid',
      title: 'Toán',
      dayOfWeek: 1,
      startLocalTime: '07:00',
      endLocalTime: '07:45',
      commuteBeforeMinutes: 0,
      commuteAfterMinutes: 0,
    });

    const result = await tool.confirmExecutor({
      userId: 'user_a',
      source: 'text',
      timezone: 'Asia/Ho_Chi_Minh',
      now: new Date('2026-09-25T00:00:00.000Z'),
    }, payload, executor);

    expect(result.success).toBe(true);
    expect(getOrCreate).toHaveBeenCalledWith('user_a', executor);
    expect(createEntry).toHaveBeenCalledWith(
      'user_a',
      expect.objectContaining({ timetableId: 'tt_owned', title: 'Toán' }),
      executor
    );
  });

  it('creates the parent and child through the same executor when no timetable exists', async () => {
    const timetableIds = new Set<string>();
    const insertedEntries: Array<{ timetableId: string }> = [];
    const executor = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('WHERE user_id = ?') && sql.includes('ORDER BY is_active')) return [[], []];
        if (sql.includes('WHERE id = ? AND user_id = ?')) {
          return [timetableIds.has(String(params[0])) ? [{ id: params[0] }] : [], []];
        }
        if (sql.includes('FROM subjects')) return [[], []];
        return [[], []];
      }),
      execute: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('INSERT INTO school_timetables')) timetableIds.add(String(params[0]));
        if (sql.includes('INSERT INTO school_timetable_entries')) {
          insertedEntries.push({ timetableId: String(params[1]) });
        }
        return [{ affectedRows: 1 }, []];
      }),
    } as unknown as DbExecutor;

    const parent = await timetableRepo.getOrCreateActiveTimetable('user_new', executor);
    const entry = await timetableRepo.createTimetableEntry('user_new', {
      timetableId: parent.id,
      title: 'Tiếng Anh',
      dayOfWeek: 3,
      startLocalTime: '08:00',
      endLocalTime: '08:45',
      commuteBeforeMinutes: 0,
      commuteAfterMinutes: 0,
    }, executor);

    expect(timetableIds.has(parent.id)).toBe(true);
    expect(entry.timetableId).toBe(parent.id);
    expect(insertedEntries).toEqual([{ timetableId: parent.id }]);
  });

  it('reuses and locks an existing active timetable without creating another parent', async () => {
    const executor = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('ORDER BY is_active')) {
          return [[{
            id: 'tt_active',
            user_id: 'user_existing',
            name: 'Lịch đang dùng',
            timezone: 'Asia/Ho_Chi_Minh',
            is_active: 1,
          }], []];
        }
        return [[], []];
      }),
      execute: vi.fn(),
    } as unknown as DbExecutor;

    const timetable = await timetableRepo.getOrCreateActiveTimetable('user_existing', executor);

    expect(timetable.id).toBe('tt_active');
    expect(executor.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), ['user_existing']);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('rejects a missing or cross-user timetable before inserting a child', async () => {
    const executor = {
      query: vi.fn(async () => [[], []]),
      execute: vi.fn(),
    } as unknown as DbExecutor;

    await expect(timetableRepo.createTimetableEntry('user_b', {
      timetableId: 'tt_owned_by_user_a',
      title: 'Toán',
      dayOfWeek: 1,
      startLocalTime: '07:00',
      endLocalTime: '07:45',
    }, executor)).rejects.toMatchObject({
      code: 'TIMETABLE_NOT_FOUND_OR_NOT_OWNED',
      statusCode: 404,
    });
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
