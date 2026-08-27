import { test, expect } from '@playwright/test';

test.describe('Task Execution, AI Guide & Reflection E2E Suite', () => {
  test('creates task, views details, generates AI guide, toggles checklist, runs guided modal, and submits reflection', async ({ page }) => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    const testEmail = `task_e2e_${timestamp}@example.test`;
    const testPassword = 'Password123!';
    const testName = 'Lê Hải Đăng';

    // 1. Register & Login
    await page.goto('/signup');
    await page.fill('#displayName', testName);
    await page.fill('#signup-email', testEmail);
    await page.fill('#signup-password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.check('#termsAccepted');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/today/);

    // 2. Navigate to Tasks page
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: /Quản Lý & Phân Tích Công Việc/i })).toBeVisible();

    // 3. Create a new task
    await page.click('button:has-text("Thêm nhiệm vụ mới")');
    await page.fill('input[placeholder*="Ví dụ: Ôn tập"]', 'Ôn tập Phương trình Hóa học Lớp 9');
    await page.fill('textarea[placeholder*="Ghi chú mục tiêu"]', 'Nắm vững các dạng phương trình ion rút gọn và cân bằng nhanh.');
    await page.click('button[type="submit"]:has-text("Tạo nhiệm vụ")');

    // Verify task is visible in list
    await expect(page.getByText('Ôn tập Phương trình Hóa học Lớp 9')).toBeVisible();

    // 4. Click into Task Detail
    await page.click('text=Ôn tập Phương trình Hóa học Lớp 9');
    await expect(page).toHaveURL(/\/tasks\//);

    // 5. Generate AI Guide
    const generateBtn = page.getByRole('button', { name: /Tạo hướng dẫn từng bước/i });
    await expect(generateBtn).toBeVisible({ timeout: 15000 });
    await generateBtn.click();

    // Verify guide rendered
    await expect(page.getByText(/Lộ trình từng bước/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Chuẩn bị trước khi học/i)).toBeVisible();

    // 6. Toggle preparation checklist item
    const firstChecklist = page.locator('button:has(svg)').filter({ hasText: /Chuẩn bị|Mở sách|Đặt mục tiêu/i }).first();
    if (await firstChecklist.isVisible()) {
      await firstChecklist.click();
    }

    // 7. Open Guided Execution Modal
    await page.click('button:has-text("Bắt đầu Chế độ Hướng dẫn Từng bước")');
    await expect(page.getByText(/Chế độ đồng hành từng bước/i)).toBeVisible();

    // 8. Progress through steps
    for (let i = 0; i < 10; i++) {
      const stepBtn = page.getByRole('button', { name: /Hoàn thành bước này|Tổng kết phiên học/i });
      if (await stepBtn.isVisible()) {
        const responsePromise = page.waitForResponse(
          (resp) => resp.url().includes('/complete') && resp.status() === 200,
          { timeout: 10000 }
        );
        await stepBtn.click();
        await responsePromise;
        await page.waitForTimeout(300);
      }
      if (await page.getByText(/Chúc mừng em đã hoàn thành/i).isVisible()) {
        break;
      }
    }

    // 9. Submit final reflection
    await expect(page.getByText(/Chúc mừng em đã hoàn thành/i)).toBeVisible({ timeout: 15000 });
    await page.fill('textarea[placeholder*="Ghi chú các bài tập"]', 'Đã hiểu và làm đúng toàn bộ bài tập phương trình ion.');
    await page.click('button:has-text("Lưu kết quả & Hoàn tất nhiệm vụ")');

    // 10. Verify task is completed
    await expect(page.getByText(/Đã hoàn thành 100%/i)).toBeVisible({ timeout: 15000 });
  });
});
