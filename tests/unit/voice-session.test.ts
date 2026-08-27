import { describe, it, expect } from 'vitest';
import { voiceSessionService } from '../../server/services/voice-session-service';
import crypto from 'crypto';

describe('Voice Session Service Unit Tests', () => {
  const userId = 'usr_student_test_safety_01';

  it('generates a stable, non-reversible SHA-256 safety identifier from internal user ID without exposing raw email', () => {
    const expectedHash = crypto.createHash('sha256').update(`jami_safety_${userId}`).digest('hex');
    const safetyId = voiceSessionService.generateSafetyIdentifier(userId);

    expect(safetyId).toBe(expectedHash);
    expect(safetyId).toHaveLength(64);
    expect(safetyId).not.toContain('@');
    expect(safetyId).not.toContain('email');
    expect(safetyId).not.toContain(userId);
  });

  it('returns a structured response without hardcoding fake tokens when API key is unconfigured', async () => {
    const session = await voiceSessionService.createRealtimeClientSecret(userId);
    expect(session).toBeDefined();
    expect(session.mode).toBeDefined();

    if (session.mode === 'demo_fallback') {
      expect(session.clientSecret).toBeUndefined();
      expect(session.message).toBeDefined();
    } else if (session.mode === 'openai_realtime') {
      expect(session.clientSecret).toBeDefined();
      expect(session.clientSecret).not.toBe('realtime_ephemeral_token_sample');
    }
  });

  it('logs voice requests in memory and records metadata', async () => {
    const log = await voiceSessionService.logVoiceRequest(userId, {
      purpose: 'test_voice_command',
      transcript: 'Jami ơi',
      durationMs: 1500,
      mode: 'web_speech',
      clientTurnId: 'turn_unit_test_01',
    });

    expect(log).toBeDefined();
    expect(log.userId).toBe(userId);
    expect(log.transcript).toBe('Jami ơi');
    expect(log.durationMs).toBe(1500);
    expect(log.clientTurnId).toBe('turn_unit_test_01');
  });
});
