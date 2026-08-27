import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../server/app';
import { UserRepository } from '../../server/repositories/user-repository';
import { PasswordHasher } from '../../server/services/password-hasher';
import { resetRateLimits } from '../../server/middleware/rate-limit';

describe('HTTP Express Integration Tests for Authentication & Session Contract (Acceptance Matrix)', () => {
  const app = createApp();
  const userRepo = UserRepository.getInstance();

  beforeEach(() => {
    resetRateLimits();
  });

  it('1. GET /api/v1/auth/session when logged out returns 200 authenticated:false with no-store header (NO 401)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/session')
      .expect(200);

    expect(res.body.authenticated).toBe(false);
    expect(typeof res.body.demoLoginEnabled).toBe('boolean');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('2. POST /api/v1/auth/register creates user & atomic session, sets HttpOnly cookie, and exposes NO raw token in JSON', async () => {
    const agent = request.agent(app);
    const testEmail = `student_${Date.now()}@jami.edu.vn`;

    const res = await agent
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Nguyễn Văn Minh',
        preferredName: 'Minh',
        email: testEmail,
        gradeLevel: 10,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        termsAccepted: true,
      })
      .expect(201);

    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.token).toBeUndefined(); // Raw session token must NEVER be returned in response JSON
    expect(res.body.sessionToken).toBeUndefined();

    // Verify Set-Cookie header contains jami_session HttpOnly cookie
    const rawCookieHeader = res.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookieHeader) ? rawCookieHeader : typeof rawCookieHeader === 'string' ? [rawCookieHeader] : [];
    const hasSessionCookie = cookies.some((c: string) => c.includes('jami_session=') && c.includes('HttpOnly'));
    expect(hasSessionCookie).toBe(true);

    // Verify GET /api/v1/auth/session returns authenticated: true
    const sessionRes = await agent.get('/api/v1/auth/session').expect(200);
    expect(sessionRes.body.authenticated).toBe(true);
    expect(sessionRes.body.user.email).toBe(testEmail);

    // Verify GET /api/v1/me returns 200
    const meRes = await agent.get('/api/v1/me').expect(200);
    expect(meRes.body.user.email).toBe(testEmail);
    expect(meRes.headers['cache-control']).toContain('no-store');
  });

  it('3. POST /api/v1/auth/register with duplicate email returns 409 EMAIL_ALREADY_EXISTS', async () => {
    const testEmail = `dup_student_${Date.now()}@jami.edu.vn`;

    // First registration
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Học Sinh Một',
        email: testEmail,
        gradeLevel: 9,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        termsAccepted: true,
      })
      .expect(201);

    // Duplicate registration
    const dupRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Học Sinh Hai',
        email: testEmail,
        gradeLevel: 9,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        termsAccepted: true,
      })
      .expect(409);

    expect(dupRes.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(dupRes.body.error.message).toContain('đã được đăng ký');
  });

  it('4. POST /api/v1/auth/login with valid Scrypt credentials succeeds (200 + cookie)', async () => {
    const agent = request.agent(app);
    const testEmail = `scrypt_user_${Date.now()}@jami.edu.vn`;

    await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Học Sinh Scrypt',
        email: testEmail,
        gradeLevel: 11,
        password: 'ScryptPassword123!',
        confirmPassword: 'ScryptPassword123!',
        termsAccepted: true,
      })
      .expect(201);

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'ScryptPassword123!',
        rememberMe: true,
      })
      .expect(200);

    expect(loginRes.body.user.email).toBe(testEmail);
    expect(loginRes.body.token).toBeUndefined();

    // Subsequent authenticated request
    const meRes = await agent.get('/api/v1/me').expect(200);
    expect(meRes.body.user.email).toBe(testEmail);
  });

  it('5. POST /api/v1/auth/login with legacy PBKDF2 credentials succeeds and upgrades hash to Scrypt', async () => {
    const agent = request.agent(app);
    const testEmail = `legacy_pbkdf2_${Date.now()}@jami.edu.vn`;
    const password = 'LegacyPassword123!';
    const salt = crypto.randomBytes(16).toString('hex');
    const legacyPBKDF2Hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');

    // Insert legacy user directly into repository
    const userId = 'usr_legacy_' + Date.now();
    (userRepo as any).demoUsers.set(testEmail.toLowerCase(), {
      id: userId,
      email: testEmail.toLowerCase(),
      passwordHash: legacyPBKDF2Hash,
      passwordSalt: salt,
      passwordScheme: 'pbkdf2_sha512_10000_v1',
      displayName: 'Học Sinh Cũ PBKDF2',
      preferredName: 'Minh',
      locale: 'vi-VN',
      timezone: 'Asia/Ho_Chi_Minh',
      ageBand: '14-17',
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    (userRepo as any).demoProfiles.set(userId, {
      userId,
      gradeLevel: 9,
      schoolName: 'THCS',
      goals: [],
      preferredSessionMinutes: 45,
      maxDailyStudyMinutes: 180,
      energyPreferences: {},
      sleepSchedule: {},
      mealTimes: {},
      onboardingCompletedAt: new Date().toISOString(),
    });

    // Login with legacy credentials
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: password,
      })
      .expect(200);

    expect(loginRes.body.user.email).toBe(testEmail);

    // Verify user row in repository was automatically rehashed to scrypt
    const updatedUser = await userRepo.findByEmail(testEmail);
    expect(updatedUser?.passwordScheme).toBe('scrypt');
    expect(updatedUser?.passwordHash).toMatch(/^scrypt:\$16384\$8\$1\$/);
  });

  it('6. POST /api/v1/auth/login with incorrect password returns 401 INVALID_CREDENTIALS', async () => {
    const testEmail = `wrong_pass_${Date.now()}@jami.edu.vn`;

    await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Học Sinh Thử Sai',
        email: testEmail,
        gradeLevel: 8,
        password: 'CorrectPassword123!',
        confirmPassword: 'CorrectPassword123!',
        termsAccepted: true,
      })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword123!',
      })
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toContain('không chính xác');
  });

  it('7. POST /api/v1/auth/logout revokes session and clears cookie; subsequent /me returns 401', async () => {
    const agent = request.agent(app);
    const testEmail = `logout_user_${Date.now()}@jami.edu.vn`;

    await agent
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Học Sinh Đăng Xuất',
        email: testEmail,
        gradeLevel: 7,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        termsAccepted: true,
      })
      .expect(201);

    // User is logged in
    await agent.get('/api/v1/me').expect(200);

    // Logout
    const logoutRes = await agent.post('/api/v1/auth/logout').expect(200);
    expect(logoutRes.body.success).toBe(true);

    // Subsequent /me should return 401
    await agent.get('/api/v1/me').expect(401);

    // Subsequent /auth/session should return authenticated: false without error
    const sessionRes = await agent.get('/api/v1/auth/session').expect(200);
    expect(sessionRes.body.authenticated).toBe(false);
  });

  it('8. executes end-to-end password reset flow', async () => {
    const agent = request.agent(app);
    const testEmail = `reset_student_${Date.now()}@jami.edu.vn`;

    const { user } = await userRepo.createUser({
      email: testEmail,
      password: 'OldPassword123!',
      displayName: 'Học Sinh Đặt Mật Khẩu',
    });

    const forgotRes = await agent
      .post('/api/v1/auth/forgot-password')
      .send({ email: testEmail })
      .expect(200);

    expect(forgotRes.body.success).toBe(true);

    const rawResetToken = await userRepo.createPasswordResetToken(user.id);
    expect(rawResetToken).toBeDefined();

    const resetRes = await agent
      .post('/api/v1/auth/reset-password')
      .send({
        token: rawResetToken,
        newPassword: 'NewSecurePassword123!',
      })
      .expect(200);

    expect(resetRes.body.success).toBe(true);

    // Old password fails
    await agent
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'OldPassword123!' })
      .expect(401);

    // New password succeeds
    const newLoginRes = await agent
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'NewSecurePassword123!' })
      .expect(200);

    expect(newLoginRes.body.user.email).toBe(testEmail);
  });

  it('9. rate limits repeated failed login attempts (returns 429)', async () => {
    const agent = request.agent(app);
    const testEmail = `rate_limit_${Date.now()}@jami.edu.vn`;

    for (let i = 0; i < 5; i++) {
      await agent
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'WrongPassword' });
    }

    // 6th attempt should trigger 429 RATE_LIMITED
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'WrongPassword' })
      .expect(429);

    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });
});
