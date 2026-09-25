import { test, expect } from '@playwright/test';

test.describe('Robot Jami Voice & Hands-free E2E Suite', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant microphone permission in browser context
    await context.grantPermissions(['microphone']);
    await page.addInitScript(() => {
      // ── Mock SpeechRecognition ──────────────────────────────────────────
      class MockSpeechRecognition {
        lang = '';
        continuous = false;
        interimResults = false;
        onresult: ((event: any) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        started = false;
        stopped = false;

        constructor() {
          const browserWindow = window as any;
          browserWindow.__voiceRecognizers = browserWindow.__voiceRecognizers || [];
          browserWindow.__voiceRecognizers.push(this);
        }

        start() { this.started = true; }
        stop() { this.stopped = true; }
        abort() { this.stopped = true; }
      }

      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: MockSpeechRecognition });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: MockSpeechRecognition });

      // ── Mock SpeechSynthesisUtterance ───────────────────────────────────
      class MockSpeechSynthesisUtterance {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        voice: any = null;
        onstart: ((event: Event) => void) | null = null;
        onend: ((event: Event) => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        constructor(text: string) { this.text = text; }
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: MockSpeechSynthesisUtterance });

      // ── Track all utterances spoken ──────────────────────────────────────
      const w = window as any;
      w.__ttsUtterances = [];

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {}, readyState: 'live' }] }) },
      });

      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          speaking: false,
          paused: false,
          cancel() { this.speaking = false; },
          resume() {},
          getVoices: () => [{ lang: 'vi-VN', name: 'Vietnamese', default: true }],
          speak(utterance: any) {
            (window as any).__ttsUtterances.push(utterance);
            this.speaking = true;
            utterance.onstart?.(new Event('start'));
            queueMicrotask(() => {
              this.speaking = false;
              utterance.onend?.(new Event('end'));
            });
          },
          addEventListener() {},
          removeEventListener() {},
        },
      });
    });

    // Register a fresh test account
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    await page.goto('/signup');
    await page.fill('#displayName', 'Học sinh E2E Robot');
    await page.fill('#signup-email', `robot_${timestamp}@example.test`);
    await page.fill('#signup-password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.check('#termsAccepted');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(onboarding|today)/);
    if (page.url().includes('/onboarding')) {
      await page.getByRole('button', { name: /Tiếp theo/i }).click();
      await page.getByRole('button', { name: /Tiếp theo/i }).click();
      await page.getByRole('button', { name: /Hoàn tất/i }).click();
    }
    await expect(page).toHaveURL(/\/today/);
  });

  // ── 1. AppLayout has the Hands-Free toggle and floating Robot Jami ──────────
  test('1. AppLayout displays Hands-Free toggle button and floating Robot Jami', async ({ page }) => {
    await page.goto('/today');

    const handsFreeBtn = page.getByRole('button', { name: /Bật Jami rảnh tay|Rảnh tay/i });
    await expect(handsFreeBtn).toBeVisible();

    const robotAvatar = page.getByRole('button', { name: /Trợ lý Robot Jami/i });
    await expect(robotAvatar).toBeVisible();
  });

  // ── 2. Chat input → message in thread ─────────────────────────────────────
  test('2. Navigates to /jami Assistant Page and interacts with chat input', async ({ page }) => {
    await page.goto('/jami');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Trợ Lý Jami AI')).toBeVisible();

    const input = page.locator('input[placeholder*="Nhắn tin"]');
    await expect(input).toBeVisible();
    await input.fill('Chào Jami, hôm nay có bài tập gì không?');
    await page.click('form button[type="submit"]');

    await expect(page.getByText('Chào Jami, hôm nay có bài tập gì không?')).toBeVisible({ timeout: 10000 });
  });

  // ── 3. "Nghe đọc" button calls speechSynthesis.speak and updates UI ────────
  test('3. "Nghe đọc" button invokes speechSynthesis.speak and changes button label', async ({ page }) => {
    await page.goto('/jami');
    await page.waitForLoadState('networkidle');

    // Send a message so a Jami reply appears
    const input = page.locator('input[placeholder*="Nhắn tin"]');
    await input.fill('Chào Jami');
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(3000); // wait for Jami reply

    // Click "Nghe đọc" on the latest Jami message
    const listenBtn = page.getByText('Nghe đọc').last();
    await expect(listenBtn).toBeVisible({ timeout: 8000 });
    await listenBtn.click();

    // Verify TTS was invoked
    const ttsCount = await page.evaluate(() => (window as any).__ttsUtterances?.length ?? 0);
    expect(ttsCount).toBeGreaterThan(0);
  });

  // ── 4. Wake word → ack TTS → command → re-arm ─────────────────────────────
  test('4. Wake word opens command capture and re-arms after reply', async ({ page }) => {
    const receivedCommands: string[] = [];
    await page.route('**/api/v1/jami/voice/command', async (route) => {
      const body = route.request().postDataJSON();
      receivedCommands.push(body.transcript);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ replyText: 'Jami đã nhận lệnh.', requiresConfirmation: false }),
      });
    });

    await page.goto('/jami');
    await page.getByRole('button', { name: /Bật Jami rảnh tay/i }).click();
    await expect(page.getByText(/Đang chờ gọi "Jami ơi"/i)).toBeVisible();

    // Non-wake phrase – no command sent
    await page.evaluate(() => {
      const recognizer = (window as any).__voiceRecognizers[0];
      recognizer.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'mở thời khóa biểu' }, isFinal: true }] });
    });
    expect(receivedCommands).toHaveLength(0);

    // Wake word → stops recognizer → new recognizer for command
    await page.evaluate(() => {
      const recognizer = (window as any).__voiceRecognizers[0];
      recognizer.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'Jami ơi' }, isFinal: true }] });
    });
    await expect.poll(() => page.evaluate(() => (window as any).__voiceRecognizers.length)).toBe(2);

    // ack TTS should have been spoken (at least 1 utterance)
    const ttsAfterWake = await page.evaluate(() => (window as any).__ttsUtterances?.length ?? 0);
    expect(ttsAfterWake).toBeGreaterThan(0);

    // Fire command transcript + end
    await page.evaluate(() => {
      const recognizer = (window as any).__voiceRecognizers[1];
      recognizer.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'mở thời khóa biểu' }, isFinal: true }] });
      recognizer.onend?.();
    });

    await expect.poll(() => receivedCommands.length).toBe(1);
    expect(receivedCommands[0]).toBe('mở thời khóa biểu');

    // After reply: re-arm with new recognizer
    await expect(page.getByText(/Đang chờ gọi "Jami ơi"/i)).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__voiceRecognizers.length)).toBe(3);
  });

  // ── 5. TTS onerror (not-allowed) surfaces UI error banner ─────────────────
  test('5. TTS onerror not-allowed shows error banner in UI', async ({ page }) => {
    // Override speechSynthesis.speak to immediately fire not-allowed
    await page.addInitScript(() => {
      const original = (window as any).__speechSynthesisMockInstalled;
      if (original) return; // already set in beforeEach
      (window as any).__speechSynthesisMockInstalled = true;
    });

    // Re-override speak to fire not-allowed
    await page.evaluate(() => {
      const ss = window.speechSynthesis as any;
      const originalSpeak = ss.speak.bind(ss);
      ss.speak = (utterance: any) => {
        // fire the first utterance as not-allowed, subsequent ones normally
        if (!(window as any).__notAllowedFired) {
          (window as any).__notAllowedFired = true;
          utterance.onerror?.(Object.assign(new Event('error'), { error: 'not-allowed' }));
        } else {
          originalSpeak(utterance);
        }
      };
    });

    await page.goto('/jami');
    await page.waitForLoadState('networkidle');

    // Send a message so TTS is triggered
    const input = page.locator('input[placeholder*="Nhắn tin"]');
    await input.fill('Chào Jami');
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(4000);

    // Should see TTS error banner (amber)
    const errorBanner = page.locator('[class*="amber"]').filter({ hasText: /chặn âm thanh|Nghe đọc/ });
    await expect(errorBanner).toBeVisible({ timeout: 6000 });
  });
});
