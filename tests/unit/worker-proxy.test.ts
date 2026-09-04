import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../worker/index';

describe('Cloudflare Worker Reverse-Proxy', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 for health live directly without hitting backend', async () => {
    const request = new Request('https://jami.ai/api/v1/health/live', { method: 'GET' });
    const response = await worker.fetch(request, {}, {});
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('ok');
    expect(json.runtime).toBe('cloudflare_workers');
  });

  it('returns 503 BACKEND_NOT_CONFIGURED when BACKEND_API_ORIGIN is unset', async () => {
    const request = new Request('https://jami.ai/api/v1/materials/books/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=xyz' },
      body: 'mock-body',
    });
    const response = await worker.fetch(request, {}, {});
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.error.code).toBe('BACKEND_NOT_CONFIGURED');
  });

  it('detects proxy loops when BACKEND_API_ORIGIN points to the same host', async () => {
    const request = new Request('https://jami.ai/api/v1/materials/books', { method: 'GET' });
    const response = await worker.fetch(request, { BACKEND_API_ORIGIN: 'https://jami.ai' }, {});
    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error.code).toBe('PROXY_LOOP_DETECTED');
  });

  it('proxies request with headers, method, and raw body to backend origin', async () => {
    const mockBackendResponse = new Response(JSON.stringify({ success: true, book: { id: 'book_123' } }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'jami_session=abc; Path=/; HttpOnly; SameSite=Lax',
        'X-Request-Id': 'req_test123',
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue(mockBackendResponse);
    global.fetch = fetchSpy;

    const request = new Request('https://jami.ai/api/v1/materials/books/upload', {
      method: 'POST',
      headers: {
        'Cookie': 'jami_session=user_cookie_123',
        'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryXYZ',
      },
      body: 'mock-multipart-payload',
    });

    const response = await worker.fetch(request, { BACKEND_API_ORIGIN: 'https://api-internal.jami.ai' }, {});

    expect(response.status).toBe(201);
    expect(response.headers.get('Set-Cookie')).toBe('jami_session=abc; Path=/; HttpOnly; SameSite=Lax');
    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');

    expect(fetchSpy).toHaveBeenCalled();
    const [targetReq] = fetchSpy.mock.calls[0];
    const targetUrl = typeof targetReq === 'string' ? targetReq : targetReq.url;
    expect(targetUrl).toBe('https://api-internal.jami.ai/api/v1/materials/books/upload');

    global.fetch = originalFetch;
  });

  it('handles backend connection failure with 502 BACKEND_FETCH_FAILED', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const request = new Request('https://jami.ai/api/v1/materials/books', { method: 'GET' });
    const response = await worker.fetch(request, { BACKEND_API_ORIGIN: 'https://broken-backend.jami.ai' }, {});

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error.code).toBe('BACKEND_FETCH_FAILED');

    global.fetch = originalFetch;
  });
});
