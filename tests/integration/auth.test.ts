import { describe, it, expect, beforeAll } from 'vitest';
import { UserRepository } from '../../server/repositories/user-repository';
import { AuthService } from '../../server/services/auth-service';
import { env } from '../../server/config/env';

describe('Auth Integration Tests', () => {
  beforeAll(() => {
    (env as any).APP_MODE = 'demo';
  });

  const userRepo = UserRepository.getInstance();
  const authService = AuthService.getInstance();

  it('registers a new user and generates hashed password with salt', async () => {
    const testEmail = `test_${Date.now()}@jami.edu.vn`;
    const { user, profile } = await userRepo.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      displayName: 'Học sinh Thử nghiệm',
      preferredName: 'Minh',
      gradeLevel: 9,
    });

    expect(user).toBeDefined();
    expect(user.email).toBe(testEmail);
    expect(profile.gradeLevel).toBe(9);

    // Verify password verification logic
    const foundUser = await userRepo.findByEmail(testEmail);
    expect(foundUser).toBeDefined();

    if (foundUser) {
      const isValid = userRepo.verifyPassword('TestPassword123!', foundUser.passwordSalt, foundUser.passwordHash);
      expect(isValid).toBe(true);

      const isInvalid = userRepo.verifyPassword('WrongPassword', foundUser.passwordSalt, foundUser.passwordHash);
      expect(isInvalid).toBe(false);
    }
  });

  it('creates and verifies session token', async () => {
    const rawToken = await authService.createSession('usr_student_demo_01', false, true);
    expect(rawToken).toBeDefined();

    const session = await authService.getSession(rawToken);
    expect(session).toBeDefined();
    expect(session?.userId).toBe('usr_student_demo_01');

    await authService.revokeSession(rawToken);
    const revokedSession = await authService.getSession(rawToken);
    expect(revokedSession).toBeNull();
  });
});
