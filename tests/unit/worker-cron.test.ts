import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../worker/index';

describe('Cloudflare Worker Scheduled Cron Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scheduled() dispatches request to backend internal endpoint with secret and request ID', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = {};
    let capturedBody: any = {};

    const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ success: true, stats: { created: 2 } }), { status: 200 });
    });

    global.fetch = mockFetch;

    const env = {
      BACKEND_API_ORIGIN: 'https://backend.jami.internal',
      INTERNAL_CRON_SECRET: 'test_cron_secret_12345',
    };

    let waitUntilPromise: Promise<any> | null = null;
    const ctx = {
      waitUntil: vi.fn().mockImplementation((promise) => {
        waitUntilPromise = promise;
      }),
    };

    await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() }, env, ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
    if (waitUntilPromise) {
      await waitUntilPromise;
    }

    expect(mockFetch).toHaveBeenCalled();
    expect(capturedUrl).toBe('https://backend.jami.internal/api/v1/internal/notifications/run');
    expect(capturedHeaders['x-internal-cron-secret']).toBe('test_cron_secret_12345');
    expect(capturedHeaders['X-Request-Id']).toBeDefined();
    expect(capturedBody.triggeredBy).toBe('cloudflare_cron');
  });

  it('scheduled() skips cleanly without throwing if BACKEND_API_ORIGIN is missing', async () => {
    const ctx = {
      waitUntil: vi.fn(),
    };

    await expect(
      worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now() }, {}, ctx)
    ).resolves.not.toThrow();

    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});
