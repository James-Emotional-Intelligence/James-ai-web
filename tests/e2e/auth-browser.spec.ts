import { test, expect } from '@playwright/test';

test.describe('JAMI AI Browser E2E Authentication Flow & Video Regression Suite', () => {
  test('executes complete authentication lifecycle: registration, reload persistence, logout, login, 409 conflict prefill, 401 invalid credentials, and 503 resilience', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `test_${timestamp}@example.test`;
    const testPassword = 'Password123!';
    const testName = 'Nguyễn Văn Minh';

    // Track console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Initial Load: Unauthenticated user visit /signup
    // Verify no 401 console errors on initial load
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /Tạo tài khoản học sinh/i })).toBeVisible();

    // Verify /api/v1/auth/session was called instead of /api/v1/me returning 401
    const has401ConsoleError = consoleErrors.some((e) => e.includes('401') && e.includes('/me'));
    expect(has401ConsoleError).toBe(false);

    // 2. Register New User
    await page.fill('#displayName', testName);
    await page.fill('#signup-email', testEmail);
    await page.fill('#signup-password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.check('#termsAccepted');

    // Submit registration
    await page.click('button[type="submit"]');

    // Should navigate to /today
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText(/JAMI AI/i).first()).toBeVisible();

    // 3. Reload Page -> Session is preserved via HttpOnly cookie
    await page.reload();
    await expect(page).toHaveURL(/\/today/);

    // 4. Logout
    // If logout button exists in UI, click it, or call POST /api/v1/auth/logout and reload
    await page.evaluate(async () => {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Đăng nhập/i })).toBeVisible();

    // 5. Login with Correct Credentials
    await page.fill('#login-email', testEmail);
    await page.fill('#login-password', testPassword);
    await page.click('button[type="submit"]');

    // Should navigate to /today
    await expect(page).toHaveURL(/\/today/);

    // 6. Logout again for regression testing
    await page.evaluate(async () => {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    });

    // 7. Video Scenario Reproduction: Register with DUPLICATE Email (409 Conflict)
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /Tạo tài khoản học sinh/i })).toBeVisible();

    await page.fill('#displayName', testName);
    await page.fill('#signup-email', testEmail);
    await page.fill('#signup-password', testPassword);
    await page.fill('#confirmPassword', testPassword);
    await page.check('#termsAccepted');

    // Submit duplicate registration
    await page.click('button[type="submit"]');

    // Form must NOT unmount to full-screen loader or reset to blank!
    // 409 Alert must be visible
    const alert409 = page.locator('[role="alert"]');
    await expect(alert409).toBeVisible();
    await expect(alert409).toContainText(/Email này đã được đăng ký/i);

    // Non-sensitive fields are preserved
    await expect(page.locator('#displayName')).toHaveValue(testName);
    await expect(page.locator('#signup-email')).toHaveValue(testEmail);
    await expect(page.locator('#termsAccepted')).toBeChecked();

    // Click "Đi đến Đăng nhập" button inside alert
    const toLoginBtn = page.getByRole('button', { name: /Đi đến Đăng nhập/i });
    await expect(toLoginBtn).toBeVisible();
    await toLoginBtn.click();

    // Navigated to /login and email is prefilled from router state
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#login-email')).toHaveValue(testEmail);

    // 8. Invalid Password Login (401 Unauthorized)
    await page.fill('#login-password', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    const alert401 = page.locator('[role="alert"]');
    await expect(alert401).toBeVisible();
    await expect(alert401).toContainText(/Email hoặc mật khẩu không chính xác/i);
    // Email is NOT wiped out
    await expect(page.locator('#login-email')).toHaveValue(testEmail);

    // 9. Simulated 503 Database Interruption Resilience
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.',
            requestId: 'req_test_e2e_503',
          },
          message: 'Hệ thống đăng nhập đang tạm gián đoạn. Vui lòng thử lại sau.',
        }),
      });
    });

    await page.fill('#login-password', testPassword);
    await page.click('button[type="submit"]');

    const alert503 = page.locator('[role="alert"]');
    await expect(alert503).toBeVisible();
    await expect(alert503).toContainText(/Hệ thống đăng nhập đang tạm gián đoạn/i);
    // Form and email remain intact
    await expect(page.locator('#login-email')).toHaveValue(testEmail);
  });
});
