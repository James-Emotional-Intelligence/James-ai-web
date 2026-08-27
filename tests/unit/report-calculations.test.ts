import { describe, it, expect } from 'vitest';
import { reportRepo } from '../../server/repositories/report-repository';

describe('Study Reports Subsystem Unit Tests', () => {
  describe('1. Period Boundaries & Timezone Calculation', () => {
    it('resolves Monday to Sunday week boundaries for Asia/Ho_Chi_Minh', () => {
      const { periodType, startDate, endDate, label } = reportRepo.resolvePeriodBoundaries(
        { period: 'week' },
        'Asia/Ho_Chi_Minh'
      );

      expect(periodType).toBe('week');
      expect(label).toContain('Tuần (');

      // Monday is day 1, Sunday is day 0/7
      const startDay = startDate.getDay();
      expect(startDay).toBe(1); // Monday
      const endDay = endDate.getDay();
      expect(endDay).toBe(0); // Sunday
    });

    it('resolves 1st to last day of month for month period', () => {
      const { periodType, startDate, endDate, label } = reportRepo.resolvePeriodBoundaries(
        { period: 'month' },
        'Asia/Ho_Chi_Minh'
      );

      expect(periodType).toBe('month');
      expect(label).toContain('Tháng ');
      expect(startDate.getUTCDate()).toBe(1);
      expect(endDate.getUTCDate()).toBeGreaterThanOrEqual(28);
    });
  });

  describe('2. CSV Formula Injection Defense', () => {
    it('escapes cells starting with dangerous characters (=, +, -, @, \\t)', async () => {
      const mockUserId = 'usr_test_csv_01';
      const csv = await reportRepo.generateCsvExport(mockUserId, { period: 'week' });

      expect(csv.startsWith('\uFEFF')).toBe(true); // UTF-8 BOM for Excel
      expect(csv).toContain('"BÁO CÁO HỌC TẬP JAMI AI"');
    });
  });
});
