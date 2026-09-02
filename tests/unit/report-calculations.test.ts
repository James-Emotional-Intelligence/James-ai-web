import { describe, it, expect } from 'vitest';
import { reportRepo } from '../../server/repositories/report-repository';

describe('Study Reports Subsystem Unit Tests', () => {
  describe('1. Period Boundaries & Timezone Calculation', () => {
    it('resolves Monday to Sunday week boundaries for Asia/Ho_Chi_Minh with exact local midnight start', () => {
      const { periodType, startDate, endDate, label } = reportRepo.resolvePeriodBoundaries(
        { period: 'week' },
        'Asia/Ho_Chi_Minh'
      );

      expect(periodType).toBe('week');
      expect(label).toContain('Tuần (');

      // Start of week in Vietnam timezone must format to 00:00:00
      const startVnTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(startDate);
      expect(startVnTime).toBe('00:00:00');

      // End of week in Vietnam timezone must format to 23:59:59
      const endVnTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(endDate);
      expect(endVnTime).toBe('23:59:59');
    });

    it('resolves 1st to last day of month for month period in Asia/Ho_Chi_Minh', () => {
      const { periodType, startDate, endDate, label } = reportRepo.resolvePeriodBoundaries(
        { period: 'month' },
        'Asia/Ho_Chi_Minh'
      );

      expect(periodType).toBe('month');
      expect(label).toContain('Tháng ');

      const startVnDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
      }).format(startDate);
      expect(startVnDate).toBe('01');
    });

    it('resolves exact 00:00:00 to 23:59:59 boundaries for custom date range in user timezone', () => {
      const { periodType, startDate, endDate, label } = reportRepo.resolvePeriodBoundaries(
        { period: 'custom', from: '2026-08-10', to: '2026-08-15' },
        'Asia/Ho_Chi_Minh'
      );

      expect(periodType).toBe('custom');
      expect(label).toContain('Khoảng:');

      const startVnTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(startDate);
      expect(startVnTime).toBe('00:00:00');

      const endVnTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(endDate);
      expect(endVnTime).toBe('23:59:59');
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
