import { test, expect } from '@playwright/test';

test.describe('Timetable & Scheduler Browser E2E Lifecycle', () => {
  test('complete flow: login -> navigate to timetable -> switch week/day views -> add timetable entry -> add busy event -> trigger replan -> confirm proposal -> verify UI persistence', async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testEmail = `tt_e2e_${timestamp}@example.test`;
    const testPassword = 'Password123!';
    const testName = 'Lê Thảo Nguyên';

    // 1. Register & Login
    await page.goto('/signup');
    await page.fill('#displayName', testName);
    await page.fill('#signup-email', testEmail);
    await page.fill('#signup-password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.check('#termsAccepted');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/today/);

    // 2. Navigate to Timetable Page
    await page.goto('/timetable');
    await expect(page.getByRole('heading', { name: /Lịch Học Thông Minh/i })).toBeVisible();

    // Verify no hardcoded mock school strings
    const content = await page.content();
    expect(content).not.toContain('Trường THCS Lê Quý Đôn');

    // 3. Switch between Week and Day views
    const dayBtn = page.getByRole('button', { name: 'Ngày' });
    await dayBtn.click();
    await expect(page.getByText(/Chi tiết ngày:/i)).toBeVisible();

    const weekBtn = page.getByRole('button', { name: 'Tuần', exact: true });
    await weekBtn.click();

    // 4. Add a Timetable Entry
    const addEntryBtn = page.getByRole('button', { name: /Thêm tiết học/i });
    await addEntryBtn.click();
    await expect(page.getByText(/Thêm tiết học chính khóa/i)).toBeVisible();

    await page.fill('input[placeholder*="Ví dụ: Toán học"]', 'Vật Lý 9 - Nhiệt học');
    await page.click('button:has-text("Lưu tiết học")');

    // Verify entry is displayed
    await expect(page.getByText(/Vật Lý 9 - Nhiệt học/i).first()).toBeVisible();

    // 5. Add a Busy Event
    const addEventBtn = page.getByRole('button', { name: /Thêm lịch bận/i });
    await addEventBtn.click();
    await expect(page.getByText(/Thêm lịch học thêm hoặc việc bận/i)).toBeVisible();

    await page.fill('input[placeholder*="Ví dụ: Học thêm Toán"]', 'Học thêm Hóa Học Thầy Đức');
    await page.click('button:has-text("Lưu vào lịch")');

    // Verify busy event is displayed
    await expect(page.getByText(/Học thêm Hóa Học Thầy Đức/i).first()).toBeVisible();

    // 6. Trigger Replan
    const replanBtn = page.getByRole('button', { name: /Tự động sắp xếp lại/i });
    await replanBtn.click();

    // Verify preview modal opens
    await expect(page.getByText(/Xem trước đề xuất tối ưu lịch học/i)).toBeVisible();

    // Confirm proposal
    const confirmBtn = page.getByRole('button', { name: /Xác nhận cập nhật lịch/i });
    await confirmBtn.click();

    // Verify proposal modal closed
    await expect(page.getByText(/Xem trước đề xuất tối ưu lịch học/i)).not.toBeVisible();

    // 7. Reload page -> verify persistence
    await page.reload();
    await expect(page.getByText(/Vật Lý 9 - Nhiệt học/i).first()).toBeVisible();
    await expect(page.getByText(/Học thêm Hóa Học Thầy Đức/i).first()).toBeVisible();
  });
});
