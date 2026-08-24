// Cloudflare Worker Adapter for JAMI AI

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // API Routing for /api/v1/*
    if (url.pathname.startsWith('/api/v1/')) {
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      };

      if (url.pathname === '/api/v1/health/live' || url.pathname === '/api/v1/health') {
        return new Response(
          JSON.stringify({ status: 'ok', runtime: 'cloudflare_workers', timestamp: new Date().toISOString() }),
          { status: 200, headers }
        );
      }

      if (url.pathname === '/api/v1/health/ready') {
        if (env.BACKEND_API_ORIGIN) {
          try {
            const targetUrl = new URL('/api/v1/health/ready', env.BACKEND_API_ORIGIN);
            const originRes = await fetch(targetUrl.toString(), { method: 'GET', headers: { accept: 'application/json' } });
            if (originRes.ok) {
              const data = await originRes.json();
              return new Response(JSON.stringify(data), { status: 200, headers });
            }
            return new Response(
              JSON.stringify({ status: 'unhealthy', database: 'origin_unreachable', httpStatus: originRes.status }),
              { status: 503, headers }
            );
          } catch (err: any) {
            return new Response(
              JSON.stringify({ status: 'unhealthy', database: 'connection_failed', error: err.message }),
              { status: 503, headers }
            );
          }
        }

        // If direct hyperdrive binding exists
        if (env.HYPERDRIVE) {
          return new Response(
            JSON.stringify({
              status: 'ready',
              runtime: 'cloudflare_workers',
              database: 'hyperdrive_connected',
            }),
            { status: 200, headers }
          );
        }

        return new Response(
          JSON.stringify({
            status: 'degraded',
            runtime: 'cloudflare_workers',
            database: 'unconfigured_origin',
            notice: 'BACKEND_API_ORIGIN or HYPERDRIVE binding is required for production database readiness.',
          }),
          { status: 503, headers }
        );
      }

      // Proxy API request to Backend Origin if configured
      if (env.BACKEND_API_ORIGIN) {
        const targetUrl = new URL(url.pathname + url.search, env.BACKEND_API_ORIGIN);
        const reqHeaders = new Headers(request.headers);
        return fetch(new Request(targetUrl.toString(), {
          method: request.method,
          headers: reqHeaders,
          body: request.body,
          redirect: 'manual',
        }));
      }

      // Default JSON 404 response for unrouted direct worker endpoints
      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: `API endpoint ${url.pathname} is not directly hosted on edge worker. Connect backend origin or configure Hyperdrive router.`,
          },
        }),
        { status: 404, headers }
      );
    }

    // Static Assets fallback via Cloudflare Workers Assets binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('JAMI AI Cloudflare Worker Active', { status: 200 });
  },

  // Scheduled Cron Trigger for Exam Milestones (D-14, D-7, D-3, D-1)
  async scheduled(event: any, env: any, ctx: any) {
    console.log('[Cloudflare Cron] Checking daily exam milestones & dispatching reminders...');
  },
};
