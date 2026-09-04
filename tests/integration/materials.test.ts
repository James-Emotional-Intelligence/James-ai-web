import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { materialRepo } from '../../server/repositories/material-repository';
import { quizRepo } from '../../server/repositories/quiz-repository';

describe('Learning Materials & R2 Subsystem Integration Tests', () => {
  const app = createApp();
  let userAId: string;
  let userASession: string;
  let userBId: string;
  let userBSession: string;

  beforeAll(async () => {
    // Register User A
    const regA = await authService.registerAtomic({
      email: `user.material.a.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh A',
      preferredName: 'An',
      gradeLevel: 10,
    });
    userAId = regA.user.id;
    userASession = `jami_session=${regA.rawToken}`;

    // Register User B
    const regB = await authService.registerAtomic({
      email: `user.material.b.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh B',
      preferredName: 'Bình',
      gradeLevel: 10,
    });
    userBId = regB.user.id;
    userBSession = `jami_session=${regB.rawToken}`;
  });

  it('1. Upload Flow: Intent -> Direct Upload with Magic Bytes -> Finalize', async () => {
    // 1. Create Upload Intent
    const intentRes = await request(app)
      .post('/api/v1/materials/upload-intent')
      .set('Cookie', [userASession])
      .send({
        title: 'Đề cương Ôn tập Hình học 10',
        subjectId: 'subj-math',
        fileName: 'de_cuong_hinh_hoc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024 * 15,
      });

    expect(intentRes.status).toBe(200);
    expect(intentRes.body.material).toBeDefined();
    expect(intentRes.body.uploadUrl).toBeDefined();
    expect(intentRes.body.r2ObjectKey).toMatch(/^materials\/[a-f0-9]{16}\/mat_/);

    const materialId = intentRes.body.material.id;
    const r2Key = intentRes.body.r2ObjectKey;

    // 2. Direct binary upload with valid PDF magic bytes
    const mockPdfBuffer = Buffer.from('%PDF-1.7\nBT (Công thức tính diện tích tam giác và định lý Sin) Tj ET\n%%EOF');
    const uploadRes = await request(app)
      .post(`/api/v1/materials/upload-direct?key=${encodeURIComponent(r2Key)}`)
      .set('Cookie', [userASession])
      .set('Content-Type', 'application/pdf')
      .send(mockPdfBuffer);

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);

    // 3. Finalize
    const finalizeRes = await request(app)
      .post(`/api/v1/materials/${materialId}/finalize`)
      .set('Cookie', [userASession])
      .send({ sizeBytes: mockPdfBuffer.length });

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.material.processingStatus).toBe('queued');

    // 4. Stream content back
    const contentRes = await request(app)
      .get(`/api/v1/materials/${materialId}/content`)
      .set('Cookie', [userASession]);

    expect(contentRes.status).toBe(200);
    expect(contentRes.headers['content-type']).toContain('application/pdf');
    expect(contentRes.headers['x-content-type-options']).toBe('nosniff');
  });

  it('2. Direct Notes Creation & AI Quiz Generation', async () => {
    // 1. Create text note
    const noteRes = await request(app)
      .post('/api/v1/materials/note')
      .set('Cookie', [userASession])
      .send({
        title: 'Tóm tắt Động lực học chất điểm',
        subjectId: 'subj-phy',
        contentText: 'Định luật I Newton: Quán tính. Định luật II Newton: F = m*a. Định luật III Newton: F_AB = -F_BA.',
      });

    expect(noteRes.status).toBe(200);
    expect(noteRes.body.material.type).toBe('notes');
    expect(noteRes.body.material.title).toBe('Tóm tắt Động lực học chất điểm');

    const noteId = noteRes.body.material.id;

    // 2. Generate practice quiz from note
    const quizRes = await request(app)
      .post(`/api/v1/materials/${noteId}/quizzes/generate`)
      .set('Cookie', [userASession])
      .send({ questionCount: 3, difficulty: 'medium' });

    expect(quizRes.status).toBe(200);
    expect(quizRes.body.success).toBe(true);
    expect(quizRes.body.quizId).toBeDefined();

    // Verify Quiz row persisted
    const savedQuiz = await quizRepo.getById(userAId, quizRes.body.quizId);
    expect(savedQuiz).toBeDefined();
    expect(savedQuiz?.questions.length).toBe(3);
  });

  it('3. Security & Isolation: User B cannot access or tamper with User A materials', async () => {
    // Create material for User A
    const matA = await materialRepo.createNote(userAId, {
      title: 'Bí kíp thi chuyên Toán của User A',
      subjectId: 'subj-math',
      contentText: 'Tuyệt mật...',
    });

    // User B tries to view content -> 404 Not Found
    const viewRes = await request(app)
      .get(`/api/v1/materials/${matA.id}/content`)
      .set('Cookie', [userBSession]);

    expect(viewRes.status).toBe(404);

    // User B tries to generate quiz from User A material -> 400
    const quizRes = await request(app)
      .post(`/api/v1/materials/${matA.id}/quizzes/generate`)
      .set('Cookie', [userBSession])
      .send({ questionCount: 5 });

    expect(quizRes.status).toBe(400);

    // User B tries to upload direct with User A key -> 403 Forbidden
    const hijackRes = await request(app)
      .post(`/api/v1/materials/upload-direct?key=materials/${userAId}/2026/08/hijack.pdf`)
      .set('Cookie', [userBSession])
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.7\n'));

    expect(hijackRes.status).toBe(403);
  });

  it('4. Outlines CRUD and Material Management (Rename, Download, Generate Outline)', async () => {
    // 1. Get Outlines (returns 200 with outlines list)
    const listRes = await request(app)
      .get('/api/v1/outlines')
      .set('Cookie', [userASession]);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.outlines)).toBe(true);

    // 2. Create Outline
    const createOutRes = await request(app)
      .post('/api/v1/outlines')
      .set('Cookie', [userASession])
      .send({
        title: 'Đề cương Phương trình Lượng giác',
        subjectId: 'subj-math',
        chapter: 'Chương 1: Hàm số lượng giác',
        contentMarkdown: '# Công thức biến đổi lượng giác\n\n- sin(a+b) = sin a cos b + cos a sin b',
      });

    expect(createOutRes.status).toBe(201);
    expect(createOutRes.body.outline.id).toBeDefined();
    const outlineId = createOutRes.body.outline.id;

    // 3. Rename Material
    const note = await materialRepo.createNote(userAId, {
      title: 'Tên gốc',
      subjectId: 'subj-math',
      contentText: 'Nội dung ghi chú',
    });

    const renameRes = await request(app)
      .patch(`/api/v1/materials/${note.id}`)
      .set('Cookie', [userASession])
      .send({ title: 'Tên mới sau khi đổi' });

    expect(renameRes.status).toBe(200);
    expect(renameRes.body.material.title).toBe('Tên mới sau khi đổi');

    // 4. Download Note
    const dlRes = await request(app)
      .get(`/api/v1/materials/${note.id}/download`)
      .set('Cookie', [userASession]);

    expect(dlRes.status).toBe(200);
    expect(dlRes.headers['content-disposition']).toContain('attachment');

    // 5. Delete Outline
    const delRes = await request(app)
      .delete(`/api/v1/outlines/${outlineId}`)
      .set('Cookie', [userASession]);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });
});
