import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { userRepo } from '../../server/repositories/user-repository';

describe('Auth Conflict Resolution & Database Error Handling Integration Tests', () => {
  const app = createApp();
  const testEmail = `user.auth.test.${Date.now()}@jami.edu.vn`;
  const testPassword = 'Password123!Secure';
  let createdUserId: string;

  beforeAll(async () => {
    const reg = await authService.registerAtomic({
      email: testEmail,
      password: testPassword,
      displayName: 'Nguyen Van Test',
      preferredName: 'Van',
      gradeLevel: 10,
    });
    createdUserId = reg.user.id;
  });

  it('1. Registering with an existing email returns 409 EMAIL_ALREADY_EXISTS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: 'AnotherPassword123!',
        confirmPassword: 'AnotherPassword123!',
        displayName: 'Duplicate User',
        gradeLevel: 10,
        termsAccepted: true,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('2. Logging in with that existing email and correct password succeeds with 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
        rememberMe: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail.toLowerCase());

    const cookies = res.headers['set-cookie'] as string[] | string | undefined;
    expect(cookies).toBeDefined();
    const isCookiePresent = Array.isArray(cookies)
      ? cookies.some((c: string) => c.includes('jami_session='))
      : typeof cookies === 'string' && cookies.includes('jami_session=');
    expect(isCookiePresent).toBe(true);
  });

  it('3. Logging in with mixed case email and whitespace succeeds with 200', async () => {
    const mixedEmail = `  ${testEmail.toUpperCase()}  `;
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: mixedEmail,
        password: testPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail.toLowerCase());
  });

  it('4. Logging in with incorrect password returns 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'CompletelyWrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('5. Logging in with non-existent email returns 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'truly_nonexistent_email_9999@domain.com',
        password: 'SomePassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
