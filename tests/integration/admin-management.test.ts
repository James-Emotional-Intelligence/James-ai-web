import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { UserRepository } from '../../server/repositories/user-repository';
import { resetRateLimits } from '../../server/middleware/rate-limit';

describe('Admin User Management & Ban/Delete Integration Tests', () => {
  const app = createApp();
  const userRepo = UserRepository.getInstance();

  beforeEach(() => {
    resetRateLimits();
  });

  it('1. Admin can log in with james.admin@gmail.com / Minhtriet14 and receive role: admin', async () => {
    const agent = request.agent(app);

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({
        email: 'james.admin@gmail.com',
        password: 'Minhtriet14',
      })
      .expect(200);

    expect(loginRes.body.user).toBeDefined();
    expect(loginRes.body.user.email).toBe('james.admin@gmail.com');
    expect(loginRes.body.user.role).toBe('admin');
    expect(loginRes.body.user.status).toBe('active');

    // Check GET /api/v1/me returns admin role
    const meRes = await agent.get('/api/v1/me').expect(200);
    expect(meRes.body.user.role).toBe('admin');
  });

  it('2. Regular student user cannot access GET /api/v1/admin/users (403 Forbidden)', async () => {
    const studentAgent = request.agent(app);

    // Register normal student
    const studentEmail = `student_${Date.now()}@jami.edu.vn`;
    await studentAgent
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Học sinh Test',
        preferredName: 'Minh',
        email: studentEmail,
        gradeLevel: 9,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        termsAccepted: true,
      })
      .expect(201);

    // Attempt to access admin users endpoint
    const forbiddenRes = await studentAgent.get('/api/v1/admin/users').expect(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');
  });

  it('3. Admin can list users with statistics and filter by search query', async () => {
    const adminAgent = request.agent(app);
    await adminAgent
      .post('/api/v1/auth/login')
      .send({
        email: 'james.admin@gmail.com',
        password: 'Minhtriet14',
      })
      .expect(200);

    const listRes = await adminAgent.get('/api/v1/admin/users').expect(200);
    expect(Array.isArray(listRes.body.users)).toBe(true);
    expect(listRes.body.totalCount).toBeGreaterThanOrEqual(1);
    expect(listRes.body.activeCount).toBeGreaterThanOrEqual(1);
    expect(listRes.body.adminCount).toBeGreaterThanOrEqual(1);

    // Filter by query
    const searchRes = await adminAgent.get('/api/v1/admin/users?q=james.admin').expect(200);
    expect(searchRes.body.users.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.body.users[0].email).toBe('james.admin@gmail.com');
  });

  it('4. Admin can ban a user, blocking them from logging in, then unban them', async () => {
    // 1. Create a target user
    const targetEmail = `target_${Date.now()}@test.com`;
    const targetAgent = request.agent(app);
    const regRes = await targetAgent
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Target User',
        preferredName: 'Target',
        email: targetEmail,
        gradeLevel: 10,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        termsAccepted: true,
      })
      .expect(201);

    const targetUserId = regRes.body.user.id;

    // 2. Admin logs in and bans the target user
    const adminAgent = request.agent(app);
    await adminAgent
      .post('/api/v1/auth/login')
      .send({
        email: 'james.admin@gmail.com',
        password: 'Minhtriet14',
      })
      .expect(200);

    const banRes = await adminAgent.post(`/api/v1/admin/users/${targetUserId}/ban`).expect(200);
    expect(banRes.body.success).toBe(true);
    expect(banRes.body.user.status).toBe('banned');

    // 3. Banned user tries to log in -> Expect 403 ACCOUNT_INACTIVE
    const newTargetAgent = request.agent(app);
    const failedLoginRes = await newTargetAgent
      .post('/api/v1/auth/login')
      .send({
        email: targetEmail,
        password: 'Password123!',
      })
      .expect(403);

    expect(failedLoginRes.body.error.code).toBe('ACCOUNT_INACTIVE');

    // 4. Admin unbans the target user
    const unbanRes = await adminAgent.post(`/api/v1/admin/users/${targetUserId}/unban`).expect(200);
    expect(unbanRes.body.success).toBe(true);
    expect(unbanRes.body.user.status).toBe('active');

    // 5. User can now log in again
    await newTargetAgent
      .post('/api/v1/auth/login')
      .send({
        email: targetEmail,
        password: 'Password123!',
      })
      .expect(200);
  });

  it('5. Admin can change user role and delete a user', async () => {
    // 1. Create a user to delete
    const deleteEmail = `to_delete_${Date.now()}@test.com`;
    const deleteAgent = request.agent(app);
    const regRes = await deleteAgent
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Delete Me',
        preferredName: 'Delete',
        email: deleteEmail,
        gradeLevel: 11,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        termsAccepted: true,
      })
      .expect(201);

    const deleteUserId = regRes.body.user.id;

    // 2. Admin promotes user to admin then demotes back to user
    const adminAgent = request.agent(app);
    await adminAgent
      .post('/api/v1/auth/login')
      .send({
        email: 'james.admin@gmail.com',
        password: 'Minhtriet14',
      })
      .expect(200);

    const roleRes1 = await adminAgent
      .post(`/api/v1/admin/users/${deleteUserId}/role`)
      .send({ role: 'admin' })
      .expect(200);
    expect(roleRes1.body.user.role).toBe('admin');

    const roleRes2 = await adminAgent
      .post(`/api/v1/admin/users/${deleteUserId}/role`)
      .send({ role: 'user' })
      .expect(200);
    expect(roleRes2.body.user.role).toBe('user');

    // 3. Admin deletes user
    const delRes = await adminAgent.delete(`/api/v1/admin/users/${deleteUserId}`).expect(200);
    expect(delRes.body.success).toBe(true);

    // 4. Deleted user can no longer log in
    await deleteAgent
      .post('/api/v1/auth/login')
      .send({
        email: deleteEmail,
        password: 'Password123!',
      })
      .expect(401);
  });

  it('6. Admin cannot ban or delete their own admin account', async () => {
    const adminAgent = request.agent(app);
    const loginRes = await adminAgent
      .post('/api/v1/auth/login')
      .send({
        email: 'james.admin@gmail.com',
        password: 'Minhtriet14',
      })
      .expect(200);

    const adminId = loginRes.body.user.id;

    // Self ban attempt -> 400 CANNOT_BAN_SELF
    const banSelfRes = await adminAgent.post(`/api/v1/admin/users/${adminId}/ban`).expect(400);
    expect(banSelfRes.body.error.code).toBe('CANNOT_BAN_SELF');

    // Self delete attempt -> 400 CANNOT_DELETE_SELF
    const delSelfRes = await adminAgent.delete(`/api/v1/admin/users/${adminId}`).expect(400);
    expect(delSelfRes.body.error.code).toBe('CANNOT_DELETE_SELF');
  });
});
