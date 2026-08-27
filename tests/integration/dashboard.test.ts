import { describe, it, expect } from 'vitest';
import { jamiRepo } from '../../server/repositories/jami-repository';
import { MODULES_CONFIG } from '../../src/config/modules';

describe('Dashboard & Jami Chat History Integration Tests', () => {
  it('verifies 8 modules configuration completeness and order', () => {
    expect(MODULES_CONFIG).toHaveLength(8);
    expect(MODULES_CONFIG[0].path).toBe('/timetable');
    expect(MODULES_CONFIG[1].path).toBe('/today');
    expect(MODULES_CONFIG[2].path).toBe('/tasks');
    expect(MODULES_CONFIG[3].path).toBe('/jami');
    expect(MODULES_CONFIG[4].path).toBe('/exams');
    expect(MODULES_CONFIG[5].path).toBe('/materials');
    expect(MODULES_CONFIG[6].path).toBe('/reports');
    expect(MODULES_CONFIG[7].path).toBe('/notifications');
  });

  it('saves and retrieves chat messages per user', async () => {
    const userId = 'usr_test_chat_01';
    const msg = await jamiRepo.saveMessage(userId, {
      sender: 'user',
      text: 'Xin chào Jami!',
    });

    expect(msg.id).toBeDefined();
    expect(msg.text).toBe('Xin chào Jami!');

    const history = await jamiRepo.getMessages(userId);
    expect(history.some((m) => m.id === msg.id)).toBe(true);
  });
});
