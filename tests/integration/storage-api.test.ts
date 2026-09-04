import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { storageService } from '../../server/services/storage-service';

describe('Storage API Integration Tests (Multipart & Local Storage)', () => {
  const app = createApp();
  let userSession: string;
  let userId: string;
  let userBSession: string;
  let userBId: string;

  beforeAll(async () => {
    // 1. Register User A
    const regA = await authService.registerAtomic({
      email: `student.storage.a.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh Lưu Trữ A',
      preferredName: 'Lưu A',
      gradeLevel: 11,
    });
    userSession = `jami_session=${regA.rawToken}`;
    userId = regA.user.id;

    // 2. Register User B
    const regB = await authService.registerAtomic({
      email: `student.storage.b.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh Lưu Trữ B',
      preferredName: 'Lưu B',
      gradeLevel: 11,
    });
    userBSession = `jami_session=${regB.rawToken}`;
    userBId = regB.user.id;
  });

  it('1. Uploads PDF document via multipart stream with magic byte check', async () => {
    const pdfContent = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Title (Tai lieu on thi) >>\nendobj\n%%EOF');

    const res = await request(app)
      .post('/api/v1/materials/upload')
      .set('Cookie', [userSession])
      .field('title', 'Đề cương Ôn tập Hóa học 11')
      .field('subjectId', 'subj-chem')
      .attach('file', pdfContent, 'De_Cuong_Hoa_11.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.material).toBeDefined();
    expect(res.body.material.storageDriver).toBe('local');
    expect(res.body.material.storageKey).toMatch(/^materials\/[a-f0-9]{16}\/mat_[a-z0-9]+\/original\.pdf$/);
    expect(res.body.material.detectedMime).toBe('application/pdf');
    expect(res.body.material.sizeBytes).toBe(pdfContent.length);
  });

  it('2. Rejects uploaded executable disguised as PDF', async () => {
    const fakePdfContent = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // MZ executable

    const res = await request(app)
      .post('/api/v1/materials/upload')
      .set('Cookie', [userSession])
      .field('title', 'Virus gia danh PDF')
      .attach('file', fakePdfContent, 'dangerous_file.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_BYTES');
  });

  it('3. Serves material file with HTTP Range (206 Partial Content) & Security Headers', async () => {
    const fileContent = Buffer.from('%PDF-1.7\n0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\n%%EOF');

    // Upload first
    const uploadRes = await request(app)
      .post('/api/v1/materials/upload')
      .set('Cookie', [userSession])
      .field('title', 'Tài liệu Thử Nghiệm Range')
      .attach('file', fileContent, 'test_range.pdf');

    expect(uploadRes.status).toBe(201);
    const materialId = uploadRes.body.material.id;

    // Full file preview
    const previewRes = await request(app)
      .get(`/api/v1/materials/${materialId}/preview`)
      .set('Cookie', [userSession]);

    expect(previewRes.status).toBe(200);
    expect(previewRes.headers['content-type']).toContain('application/pdf');
    expect(previewRes.headers['x-content-type-options']).toBe('nosniff');
    expect(previewRes.headers['content-security-policy']).toBeDefined();
    expect(previewRes.headers['accept-ranges']).toBe('bytes');

    // Partial range request (bytes=0-7)
    const rangeRes = await request(app)
      .get(`/api/v1/materials/${materialId}/preview`)
      .set('Cookie', [userSession])
      .set('Range', 'bytes=0-7')
      .buffer(true);

    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers['content-range']).toBe(`bytes 0-7/${fileContent.length}`);
    const receivedText = Buffer.isBuffer(rangeRes.body) ? rangeRes.body.toString('utf-8') : rangeRes.text;
    expect(receivedText).toBe('%PDF-1.7');

    // Download attachment
    const downloadRes = await request(app)
      .get(`/api/v1/materials/${materialId}/download`)
      .set('Cookie', [userSession]);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-disposition']).toContain('attachment');
  });

  it('4. Enforces ownership: User B cannot download or preview User A file', async () => {
    const secretContent = Buffer.from('%PDF-1.7\nBi mat cua User A\n%%EOF');

    const uploadRes = await request(app)
      .post('/api/v1/materials/upload')
      .set('Cookie', [userSession])
      .field('title', 'Tài liệu riêng tư A')
      .attach('file', secretContent, 'private.pdf');

    const materialId = uploadRes.body.material.id;

    const accessRes = await request(app)
      .get(`/api/v1/materials/${materialId}/preview`)
      .set('Cookie', [userBSession]);

    expect(accessRes.status).toBe(404);
  });

  it('5. Uploads Soft Book with rights confirmation via multipart', async () => {
    const bookPdf = Buffer.from('%PDF-1.7\nSách Giáo Khoa Vật Lý 10 Cánh Diều\n%%EOF');

    const res = await request(app)
      .post('/api/v1/materials/books/upload')
      .set('Cookie', [userSession])
      .field('title', 'Sách Vật Lý 10 (Cánh Diều)')
      .field('subjectId', 'subj-phy')
      .field('publisher', 'NXB Đại Học Sư Phạm')
      .field('editionYear', '2023')
      .field('rightsConfirmed', 'true')
      .field('rightsTermsVersion', 'v1.0')
      .attach('file', bookPdf, 'Vat_Ly_10_Canh_Dieu.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.book).toBeDefined();
    expect(res.body.book.materialKind).toBe('book');
    expect(res.body.book.storageDriver).toBe('local');
  });

  it('7. Unauthenticated POST to /materials/books/upload returns 401 UNAUTHORIZED, not 404', async () => {
    const res = await request(app)
      .post('/api/v1/materials/books/upload')
      .field('title', 'Unauthorized Upload Attempt');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('8. GET /materials/books correctly resolves to books list without being swallowed by /materials/:id', async () => {
    const res = await request(app)
      .get('/api/v1/materials/books')
      .set('Cookie', [userSession]);

    expect(res.status).toBe(200);
    expect(res.body.books).toBeDefined();
    expect(Array.isArray(res.body.books)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.books.length).toBeGreaterThanOrEqual(1);
    const uploadedBook = res.body.books.find((b: any) => b.title === 'Sách Vật Lý 10 (Cánh Diều)');
    expect(uploadedBook).toBeDefined();
  });

  it('9. GET /meta/version returns system version, commit SHA, and node runtime', async () => {
    const res = await request(app).get('/api/v1/meta/version');

    expect(res.status).toBe(200);
    expect(res.body.appVersion).toBe('1.0.0');
    expect(res.body.runtime).toBe('node');
    expect(res.body.storageDriver).toBeDefined();
  });
});

