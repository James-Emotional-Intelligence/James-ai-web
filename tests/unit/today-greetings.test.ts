import { describe, it, expect } from 'vitest';
import {
  TODAY_GREETING_QUESTIONS,
  getCurrentTimeSlot,
  getRandomGreetingQuestion,
} from '../../src/features/today/today-greetings';

describe('Today Greeting System', () => {
  it('contains at least 12 greeting questions', () => {
    expect(TODAY_GREETING_QUESTIONS.length).toBeGreaterThanOrEqual(12);
  });

  it('contains questions for all 3 time slots: morning, afternoon, evening', () => {
    const morningList = TODAY_GREETING_QUESTIONS.filter((q) => q.timeSlot === 'morning');
    const afternoonList = TODAY_GREETING_QUESTIONS.filter((q) => q.timeSlot === 'afternoon');
    const eveningList = TODAY_GREETING_QUESTIONS.filter((q) => q.timeSlot === 'evening');

    expect(morningList.length).toBeGreaterThanOrEqual(4);
    expect(afternoonList.length).toBeGreaterThanOrEqual(4);
    expect(eveningList.length).toBeGreaterThanOrEqual(4);
  });

  it('all questions have non-empty question text and fallbackReply', () => {
    for (const item of TODAY_GREETING_QUESTIONS) {
      expect(item.id).toBeTruthy();
      expect(item.question.trim().length).toBeGreaterThan(10);
      expect(item.fallbackReply.trim().length).toBeGreaterThan(10);
      expect(item.placeholder.trim().length).toBeGreaterThan(5);
    }
  });

  it('correctly maps hour to time slots', () => {
    const morningDate = new Date('2026-09-04T07:30:00+07:00');
    expect(getCurrentTimeSlot(morningDate)).toBe('morning');

    const afternoonDate = new Date('2026-09-04T14:15:00+07:00');
    expect(getCurrentTimeSlot(afternoonDate)).toBe('afternoon');

    const eveningDate = new Date('2026-09-04T20:00:00+07:00');
    expect(getCurrentTimeSlot(eveningDate)).toBe('evening');
  });

  it('returns a valid question matching current time slot', () => {
    const question = getRandomGreetingQuestion(new Date('2026-09-04T08:00:00+07:00'));
    expect(question).toBeDefined();
    expect(question.timeSlot).toBe('morning');
    expect(question.question).toBeTruthy();
  });
});

import { renderHook, act } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import { useTodayGreetingConversation } from '../../src/features/today/useTodayGreetingConversation';
import * as VoiceJamiModule from '../../src/context/VoiceJamiContext';

describe('useTodayGreetingConversation Hook', () => {
  const mockSpeak = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(VoiceJamiModule, 'useVoiceJami').mockReturnValue({
      speak: mockSpeak,
      isSpeaking: false,
      stopSpeaking: vi.fn(),
    } as any);
  });

  it('does NOT speak when isReady is false (page data still loading)', () => {
    const { result } = renderHook(() =>
      useTodayGreetingConversation('Nguyễn An', { isReady: false })
    );

    expect(result.current.status).toBe('asking');
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('speaks question when isReady becomes true (after page data finishes loading)', () => {
    let isReadyState = false;
    const { rerender } = renderHook(() =>
      useTodayGreetingConversation('Nguyễn An', { isReady: isReadyState })
    );

    expect(mockSpeak).not.toHaveBeenCalled();

    // Data finishes loading:
    isReadyState = true;
    rerender();

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeak).toHaveBeenCalledWith(expect.any(String));
  });
});
