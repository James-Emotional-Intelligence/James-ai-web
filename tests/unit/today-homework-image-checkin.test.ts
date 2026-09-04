import { describe, it, expect } from 'vitest';
import { ClassSessionCheckinSubmitSchema } from '../../shared/schemas';
import { sessionCheckinRepo } from '../../server/repositories/session-checkin-repository';

describe('Homework Image and Check-in Subsystem', () => {
  it('validates schema with valid homework image material id and homework text', () => {
    const result = ClassSessionCheckinSubmitSchema.safeParse({
      timetableEntryId: 'entry_123',
      occurrenceDate: '2026-09-04',
      learnedContent: 'Toán hình học',
      homework: 'Làm bài 1, 2, 3',
      homeworkImageMaterialId: 'mat_img_456',
      hasNoHomework: false,
      attendanceStatus: 'attended',
      createTaskForHomework: true,
    });

    expect(result.success).toBe(true);
  });

  it('validates schema when only homework image material id is provided without text', () => {
    const result = ClassSessionCheckinSubmitSchema.safeParse({
      timetableEntryId: 'entry_123',
      occurrenceDate: '2026-09-04',
      learnedContent: 'Toán đại số',
      homework: '',
      homeworkImageMaterialId: 'mat_img_456',
      hasNoHomework: false,
      attendanceStatus: 'attended',
      createTaskForHomework: true,
    });

    expect(result.success).toBe(true);
  });

  it('rejects schema if hasNoHomework is true but homeworkImageMaterialId is provided', () => {
    const result = ClassSessionCheckinSubmitSchema.safeParse({
      timetableEntryId: 'entry_123',
      occurrenceDate: '2026-09-04',
      learnedContent: 'Toán đại số',
      homework: '',
      homeworkImageMaterialId: 'mat_img_456',
      hasNoHomework: true,
      attendanceStatus: 'attended',
      createTaskForHomework: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Không thể vừa tích "Không có BTVN"');
    }
  });

  it('rejects createTaskForHomework if both homework text and image are empty', () => {
    const result = ClassSessionCheckinSubmitSchema.safeParse({
      timetableEntryId: 'entry_123',
      occurrenceDate: '2026-09-04',
      learnedContent: 'Toán đại số',
      homework: '',
      homeworkImageMaterialId: null,
      hasNoHomework: false,
      attendanceStatus: 'attended',
      createTaskForHomework: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Chỉ có thể tạo nhiệm vụ khi có nội dung hoặc hình ảnh BTVN');
    }
  });

  it('stores and retrieves homeworkImageMaterialId in demo/in-memory mode', async () => {
    const userId = 'user_test_hw_img_' + Date.now();
    const entryId = 'entry_hw_img_1';

    const checkin = await sessionCheckinRepo.createOrUpdateCheckin(userId, {
      timetableEntryId: entryId,
      occurrenceDate: '2026-09-04',
      learnedContent: 'Bài tập Sinh học',
      homework: 'Xem sơ đồ di truyền',
      homeworkImageMaterialId: 'mat_bio_photo_1',
      hasNoHomework: false,
      attendanceStatus: 'attended',
    });

    expect(checkin.homeworkImageMaterialId).toBe('mat_bio_photo_1');

    const checkins = await sessionCheckinRepo.getCheckins(userId, '2026-09-04', '2026-09-04');
    expect(checkins.length).toBe(1);
    expect(checkins[0].homeworkImageMaterialId).toBe('mat_bio_photo_1');
  });
});
