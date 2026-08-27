import { test, expect } from '@playwright/test';

test.describe('Robot Jami Voice & Hands-free E2E Suite', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant microphone permission in browser context
    await context.grantPermissions(['microphone']);

    // Register authentic student account
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    await page.goto('/signup');
    await page.fill('#displayName', 'Học sinh E2E Robot');
    await page.fill('#signup-email', `robot_${timestamp}@example.test`);
    await page.fill('#signup-password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.check('#termsAccepted');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/today/);
  });

  test('1. AppLayout displays Hands-Free toggle button and floating Robot Jami', async ({ page }) => {
    await page.goto('/today');

    // Verify "Bật Jami rảnh tay" button is in top nav
    const handsFreeBtn = page.getByRole('button', { name: /Bật Jami rảnh tay|Rảnh tay/i });
    await expect(handsFreeBtn).toBeVisible();

    // Verify floating Robot Jami avatar is visible
    const robotAvatar = page.getByRole('button', { name: /Trợ lý Robot Jami/i });
    await expect(robotAvatar).toBeVisible();
  });

  test('2. Navigates to /jami Assistant Page and interacts with chat input', async ({ page }) => {
    await page.goto('/jami');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Trợ Lý Jami AI')).toBeVisible();

    // Send a message through chat input
    const input = page.locator('input[placeholder*="Nhắn tin với Jami"]');
    await expect(input).toBeVisible();
    await input.fill('Chào Jami, hôm nay có bài tập gì không?');
    await page.click('form button[type="submit"]');

    // Verify user message appears in thread
    await expect(page.getByText('Chào Jami, hôm nay có bài tập gì không?')).toBeVisible({ timeout: 10000 });
  });
});
