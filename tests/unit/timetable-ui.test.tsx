import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TimetablePage } from '../../src/features/timetable/TimetablePage';
import { api } from '../../src/lib/api-client';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

vi.mock('../../src/lib/api-client', () => ({
  api: {
    getTimetable: vi.fn(),
    getTasks: vi.fn(),
    getSubjects: vi.fn(),
    addBusyEvent: vi.fn(),
    updateBusyEvent: vi.fn(),
    deleteBusyEvent: vi.fn(),
    createTimetableEntry: vi.fn(),
    updateTimetableEntry: vi.fn(),
    deleteTimetableEntry: vi.fn(),
    previewReplan: vi.fn(),
    confirmProposal: vi.fn(),
    updateTask: vi.fn(),
    getMaterials: vi.fn().mockResolvedValue({ materials: [] }),
  },
  ApiError: class ApiError extends Error {
    public status: number;
    public code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

describe('TimetablePage React UI Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.getTimetable).mockResolvedValue({
      timetables: [
        {
          id: 'tt_01',
          userId: 'usr_01',
          name: 'Thời khóa biểu Học kỳ 1',
          timezone: 'Asia/Ho_Chi_Minh',
          isActive: true,
        },
      ],
      activeTimetable: {
        id: 'tt_01',
        userId: 'usr_01',
        name: 'Thời khóa biểu Học kỳ 1',
        timezone: 'Asia/Ho_Chi_Minh',
        isActive: true,
      },
      entries: [
        {
          id: 'entry_math_01',
          timetableId: 'tt_01',
          subjectId: 'subj_math',
          subjectName: 'Toán học Chuyên',
          title: 'Đại số 9 - Tiết 1 & 2',
          dayOfWeek: 1, // Monday
          startLocalTime: '07:30',
          endLocalTime: '09:00',
          location: 'Phòng 9A1',
          commuteBeforeMinutes: 15,
          commuteAfterMinutes: 15,
        },
      ],
      busyEvents: [
        {
          id: 'busy_01',
          userId: 'usr_01',
          type: 'extra_class',
          title: 'Học thêm Tiếng Anh IELTS',
          startsAt: '2026-08-25T17:30:00.000+07:00',
          endsAt: '2026-08-25T19:00:00.000+07:00',
          timezone: 'Asia/Ho_Chi_Minh',
          isFixed: true,
        },
      ],
      availabilityRules: [],
    });

    vi.mocked(api.getTasks).mockResolvedValue({
      tasks: [
        {
          id: 'task_01',
          userId: 'usr_01',
          subjectId: 'subj_math',
          title: 'Làm bài tập phương trình bậc hai',
          status: 'pending',
          priority: 'high',
          difficulty: 'medium',
          splittable: false,
          estimatedMinutes: 45,
          scheduledStartAt: '2026-08-25T19:30:00.000+07:00',
          scheduledEndAt: '2026-08-25T20:15:00.000+07:00',
          locked: false,
          completionPercent: 0,
          source: 'planner',
        },
      ],
    });

    vi.mocked(api.getSubjects).mockResolvedValue({
      subjects: [
        { id: 'subj_math', name: 'Toán học', color: '#16A34A', icon: 'BookOpen' },
        { id: 'subj_eng', name: 'Tiếng Anh', color: '#3B82F6', icon: 'BookOpen' },
      ],
    });
  });

  it('renders TimetablePage with real dynamic data across separated Timetable and Schedule boards', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TimetablePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Thời khóa biểu Học kỳ 1/i)).toBeInTheDocument();
    });

    // Should NOT contain the old hardcoded school name
    expect(screen.queryByText(/Trường THCS Lê Quý Đôn/i)).not.toBeInTheDocument();

    // Board 1: Should contain real dynamic school entries
    expect(screen.getByText(/Đại số 9 - Tiết 1 & 2/i)).toBeInTheDocument();

    // Switch to Board 2: Thời gian biểu (Sinh hoạt & Tự học)
    const scheduleTabBtn = screen.getByRole('button', { name: /THỜI GIAN BIỂU/i });
    await user.click(scheduleTabBtn);

    // Board 2: Should contain busy events & tasks
    await waitFor(() => {
      expect(screen.getByText(/Học thêm Tiếng Anh IELTS/i)).toBeInTheDocument();
    });
  });

  it('switches between Week and Day views and renders day-filtered content', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TimetablePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Thời khóa biểu Học kỳ 1/i)).toBeInTheDocument();
    });

    // Switch to Day view
    const dayBtn = screen.getByRole('button', { name: 'Ngày' });
    await user.click(dayBtn);

    await waitFor(() => {
      expect(screen.getByText(/Tiết học ngày/i)).toBeInTheDocument();
    });
  });

  it('triggers Replan and displays Proposal Diff modal with confirm button', async () => {
    const user = userEvent.setup();

    vi.mocked(api.previewReplan).mockResolvedValue({
      proposal: {
        id: 'prop_test_123',
        userId: 'usr_01',
        reason: 'Tự động sắp xếp lại 1 bài tập vào khung giờ rảnh',
        tasksToSchedule: [
          {
            taskId: 'task_01',
            title: 'Làm bài tập phương trình bậc hai',
            subjectId: 'subj_math',
            estimatedMinutes: 45,
            proposedStart: '2026-08-25T19:30:00.000+07:00',
            proposedEnd: '2026-08-25T20:15:00.000+07:00',
            reason: 'Khung giờ tối yêu thích',
          },
        ],
        unscheduledItems: [],
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    vi.mocked(api.confirmProposal).mockResolvedValue({
      success: true,
      tasks: [],
      proposal: {} as any,
    });

    render(
      <MemoryRouter>
        <TimetablePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Thời khóa biểu Học kỳ 1/i)).toBeInTheDocument();
    });

    // Switch to Board 2 (Thời gian biểu)
    const scheduleTabBtn = screen.getByRole('button', { name: /THỜI GIAN BIỂU/i });
    await user.click(scheduleTabBtn);

    const replanBtn = screen.getByRole('button', { name: /Tự động sắp xếp lại/i });
    await user.click(replanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Xem trước đề xuất tối ưu lịch học/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Xác nhận cập nhật lịch/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.confirmProposal).toHaveBeenCalledWith('prop_test_123');
    });
  });
});
