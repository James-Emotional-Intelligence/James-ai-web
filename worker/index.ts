// Cloudflare Worker Reverse-Proxy Adapter for JAMI AI

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // API Routing for /api/v1/*
    if (url.pathname.startsWith('/api/v1/')) {
      const defaultHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      };

      if (url.pathname === '/api/v1/health/live' || url.pathname === '/api/v1/health') {
        return new Response(
          JSON.stringify({ status: 'ok', runtime: 'cloudflare_workers', timestamp: new Date().toISOString() }),
          { status: 200, headers: defaultHeaders }
        );
      }

      // Validate BACKEND_API_ORIGIN
      const backendOrigin = (env.BACKEND_API_ORIGIN || '').trim();
      let targetOriginUrl: URL | null = null;

      if (backendOrigin && !backendOrigin.includes('your-backend-api.example.com')) {
        try {
          targetOriginUrl = new URL(backendOrigin);
          if (targetOriginUrl.host === url.host) {
            return new Response(
              JSON.stringify({
                error: {
                  code: 'PROXY_LOOP_DETECTED',
                  message: 'BACKEND_API_ORIGIN không được trỏ về chính Worker/Pages domain hiện tại.',
                },
              }),
              { status: 502, headers: defaultHeaders }
            );
          }
        } catch {
          return new Response(
            JSON.stringify({
              error: {
                code: 'INVALID_BACKEND_ORIGIN_URL',
                message: 'BACKEND_API_ORIGIN được cung cấp không phải là một URL hợp lệ.',
              },
            }),
            { status: 502, headers: defaultHeaders }
          );
        }
      }

      if (url.pathname === '/api/v1/health/ready') {
        if (targetOriginUrl) {
          try {
            const targetUrl = new URL('/api/v1/health/ready', targetOriginUrl);
            const originRes = await fetch(targetUrl.toString(), {
              method: 'GET',
              headers: { accept: 'application/json' },
            });
            if (originRes.ok) {
              const data = await originRes.json();
              return new Response(JSON.stringify(data), { status: 200, headers: defaultHeaders });
            }
            return new Response(
              JSON.stringify({ status: 'unhealthy', database: 'origin_unreachable', httpStatus: originRes.status }),
              { status: 503, headers: defaultHeaders }
            );
          } catch (err: any) {
            return new Response(
              JSON.stringify({ status: 'unhealthy', database: 'connection_failed', error: err.message }),
              { status: 503, headers: defaultHeaders }
            );
          }
        }

        return new Response(
          JSON.stringify({
            status: 'unhealthy',
            runtime: 'cloudflare_workers',
            database: 'unconfigured_origin',
            notice: 'BACKEND_API_ORIGIN environment variable is required for production database readiness and routing.',
          }),
          { status: 503, headers: defaultHeaders }
        );
      }

      // Reverse-Proxy API request to Backend Origin if configured
      if (targetOriginUrl) {
        try {
          const targetUrl = new URL(url.pathname + url.search, targetOriginUrl);
          const reqHeaders = new Headers(request.headers);
          reqHeaders.set('X-Forwarded-Proto', 'https');
          reqHeaders.set('X-Forwarded-Host', url.host);

          const reqInit: any = {
            method: request.method,
            headers: reqHeaders,
            body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
            redirect: 'manual',
          };
          if (!['GET', 'HEAD'].includes(request.method) && request.body) {
            reqInit.duplex = 'half';
          }

          const backendResponse = await fetch(new Request(targetUrl.toString(), reqInit));

          const resHeaders = new Headers(backendResponse.headers);
          resHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

          return new Response(backendResponse.body, {
            status: backendResponse.status,
            statusText: backendResponse.statusText,
            headers: resHeaders,
          });
        } catch (fetchErr: any) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'BACKEND_FETCH_FAILED',
                message: `Không thể kết nối đến máy chủ Backend tại ${targetOriginUrl.origin}: ${fetchErr.message}`,
              },
            }),
            { status: 502, headers: defaultHeaders }
          );
        }
      }

      return new Response(
        JSON.stringify({
          error: {
            code: 'BACKEND_NOT_CONFIGURED',
            message: `API endpoint ${url.pathname} chưa có Backend URL. Vui lòng cấu hình biến BACKEND_API_ORIGIN trong Cloudflare Settings > Variables (ví dụ: https://your-backend.example.com).`,
          },
        }),
        { status: 503, headers: defaultHeaders }
      );
    }

    // Static Assets fallback with SPA routing via Cloudflare Workers Assets binding
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404 && !url.pathname.startsWith('/api/') && !url.pathname.includes('.')) {
        // SPA Fallback: Serve index.html for client routes like /login, /today, etc.
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return env.ASSETS.fetch(indexRequest);
      }
      return assetResponse;
    }

    return new Response('JAMI AI Cloudflare Worker Active', { status: 200 });
  },

  async scheduled(event: any, env: any, ctx: any) {
    const requestId = `cron_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[Cloudflare Cron ${requestId}] Running automated timetable & exam notification scheduler...`);

    if (!env.BACKEND_API_ORIGIN) {
      console.warn(`[Cloudflare Cron ${requestId}] Skipped: BACKEND_API_ORIGIN is not configured.`);
      return;
    }

    const cronSecret = env.INTERNAL_CRON_SECRET || env.ADMIN_SECRET_KEY;
    const targetUrl = new URL('/api/v1/internal/notifications/run', env.BACKEND_API_ORIGIN);

    ctx.waitUntil(
      (async () => {
        try {
          const res = await fetch(targetUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-cron-secret': cronSecret || '',
              'X-Request-Id': requestId,
              'User-Agent': 'JAMI-Cloudflare-Cron/1.0',
            },
            body: JSON.stringify({
              triggeredBy: 'cloudflare_cron',
              cronTime: event.cron || '*/5 * * * *',
              scheduledTime: event.scheduledTime || Date.now(),
            }),
          });

          if (res.ok) {
            const data = await res.json();
            console.log(`[Cloudflare Cron ${requestId}] Successfully dispatched notifications:`, JSON.stringify(data));
          } else {
            const errText = await res.text();
            console.error(`[Cloudflare Cron ${requestId}] Backend returned error ${res.status}:`, errText);
          }
        } catch (err: any) {
          console.error(`[Cloudflare Cron ${requestId}] Failed to reach backend API origin:`, err.message);
        }
      })()
    );
  },
};
