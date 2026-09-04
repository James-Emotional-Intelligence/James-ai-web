import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTimetableHtml, exportTimetableToPdf, TimetablePdfExportOptions } from '../../src/lib/timetable-pdf-export';
import type { TimetableEntry, BusyEvent } from '../../shared/types';

describe('timetable-pdf-export utility', () => {
  const sampleWeekDays = [
    { dayOfWeek: 1, date: new Date('2026-08-31T00:00:00Z'), dateStr: '2026-08-31', label: 'Thứ 2', isToday: true },
    { dayOfWeek: 2, date: new Date('2026-09-01T00:00:00Z'), dateStr: '2026-09-01', label: 'Thứ 3', isToday: false },
    { dayOfWeek: 3, date: new Date('2026-09-02T00:00:00Z'), dateStr: '2026-09-02', label: 'Thứ 4', isToday: false },
    { dayOfWeek: 4, date: new Date('2026-09-03T00:00:00Z'), dateStr: '2026-09-03', label: 'Thứ 5', isToday: false },
    { dayOfWeek: 5, date: new Date('2026-09-04T00:00:00Z'), dateStr: '2026-09-04', label: 'Thứ 6', isToday: false },
    { dayOfWeek: 6, date: new Date('2026-09-05T00:00:00Z'), dateStr: '2026-09-05', label: 'Thứ 7', isToday: false },
    { dayOfWeek: 7, date: new Date('2026-09-06T00:00:00Z'), dateStr: '2026-09-06', label: 'Chủ Nhật', isToday: false },
  ];

  const sampleEntries: TimetableEntry[] = [
    {
      id: 'entry-1',
      title: 'Toán học',
      dayOfWeek: 1,
      startLocalTime: '07:30',
      endLocalTime: '08:15',
      teacher: 'Cô Thu Hương',
      location: 'Phòng 201',
      commuteBeforeMinutes: 0,
      commuteAfterMinutes: 0,
    },
    {
      id: 'entry-2',
      title: 'Ngữ văn',
      dayOfWeek: 1,
      startLocalTime: '08:20',
      endLocalTime: '09:05',
      teacher: 'Thầy Minh',
      location: 'Phòng 201',
      commuteBeforeMinutes: 0,
      commuteAfterMinutes: 0,
      isSkippedThisWeek: true,
    },
    {
      id: 'entry-3',
      title: 'Tiếng Anh',
      dayOfWeek: 2,
      startLocalTime: '07:30',
      endLocalTime: '09:00',
      commuteBeforeMinutes: 0,
      commuteAfterMinutes: 0,
    },
  ];

  const sampleBusyEvents: BusyEvent[] = [
    {
      id: 'busy-1',
      userId: 'user-1',
      title: 'Học bơi nâng cao',
      type: 'club',
      startsAt: '2026-09-02T17:00:00.000Z',
      endsAt: '2026-09-02T18:30:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      isFixed: true,
      location: 'Hồ bơi Cung Thiếu Nhi',
    },
  ];

  it('generates well-formatted HTML with school timetable and extra activities', () => {
    const options: TimetablePdfExportOptions = {
      timetableName: 'Thời khóa biểu Lớp 7A',
      weekDays: sampleWeekDays,
      timetableEntries: sampleEntries,
      busyEvents: sampleBusyEvents,
      studentName: 'Nguyễn Văn An',
      className: '7A1',
    };

    const html = generateTimetableHtml(options);

    expect(html).toContain('Thời khóa biểu Lớp 7A');
    expect(html).toContain('JAMI AI');
    expect(html).toContain('Nguyễn Văn An');
    expect(html).toContain('7A1');
    expect(html).toContain('Toán học');
    expect(html).toContain('Cô Thu Hương');
    expect(html).toContain('Phòng 201');
    expect(html).toContain('Ngữ văn');
    expect(html).toContain('Nghỉ tuần này');
    expect(html).toContain('Tiếng Anh');
    expect(html).toContain('Thứ 2');
    expect(html).toContain('Thứ 7');
    expect(html).toContain('Chủ Nhật');
    expect(html).toContain('Học bơi nâng cao');
    expect(html).toContain('Hồ bơi Cung Thiếu Nhi');
    expect(html).toContain('size: A4 landscape');
  });

  it('handles empty entries gracefully with placeholder', () => {
    const options: TimetablePdfExportOptions = {
      weekDays: sampleWeekDays,
      timetableEntries: [],
      busyEvents: [],
    };

    const html = generateTimetableHtml(options);

    expect(html).toContain('Thời khóa biểu chính khóa');
    expect(html).toContain('— Nghỉ —');
    expect(html).not.toContain('II. Lịch Học Thêm');
  });

  it('triggers exportTimetableToPdf using iframe in browser-like environment', async () => {
    const mockPrint = vi.fn();
    const mockFocus = vi.fn();

    // Mock iframe creation in jsdom
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'iframe') {
        const iframe = element as HTMLIFrameElement;
        Object.defineProperty(iframe, 'contentWindow', {
          value: {
            focus: mockFocus,
            print: mockPrint,
            document: {
              open: vi.fn(),
              write: vi.fn(),
              close: vi.fn(),
            },
          },
          writable: true,
        });
        Object.defineProperty(iframe, 'contentDocument', {
          value: {
            open: vi.fn(),
            write: vi.fn(),
            close: vi.fn(),
            readyState: 'complete',
          },
          writable: true,
        });
      }
      return element;
    });

    const options: TimetablePdfExportOptions = {
      weekDays: sampleWeekDays,
      timetableEntries: sampleEntries,
    };

    await exportTimetableToPdf(options);

    expect(mockFocus).toHaveBeenCalled();
    expect(mockPrint).toHaveBeenCalled();
  });
});
