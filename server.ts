import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app';
import { db } from './server/db/mysql';
import { UserRepository } from './server/repositories/user-repository';
import { Migrator } from './server/db/migrator';
import { DemoRepository } from './server/repositories/demo-repository';
import { env, isProduction } from './server/config/env';

async function startServer() {
  const app = createApp();
  const PORT = env.PORT || 3000;

  // Initialize demo data for memory fallback ONLY if demo mode enabled and not in production
  if (!isProduction && env.DEMO_LOGIN_ENABLED) {
    DemoRepository.seedUser('usr_student_demo_01');
  }

  // Initialize MySQL Connection & run migrations
  try {
    const isConnected = await db.init();
    if (isConnected) {
      try {
        await Migrator.run();
        console.log('[JAMI AI] Schema migrations verified.');
      } catch (migErr: any) {
        console.error('[JAMI AI] Migration failure:', migErr.message);
        if (isProduction) {
          throw new Error(`[JAMI AI Startup] Migration failed in Production mode: ${migErr.message}`, { cause: migErr });
        }
      }
      await UserRepository.getInstance().syncWithMySQL();
      console.log('[JAMI AI] MySQL Database fully integrated and active.');
    } else {
      if (isProduction) {
        throw new Error('[JAMI AI Startup] Failed to connect to MySQL database in Production mode.');
      }
      console.warn('[JAMI AI] Running in standalone demo mode.');
    }
  } catch (err: any) {
    console.error('[JAMI AI] MySQL initialization error:', err.message);
    if (isProduction) {
      process.exit(1);
    }
  }

  // Vite middleware for development vs static serve for production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    let distPath = path.join(process.cwd(), 'dist', 'client');
    if (!fs.existsSync(distPath)) {
      distPath = path.join(process.cwd(), 'dist');
    }
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));
    app.get('/assets/*', (_req, res) => {
      res.status(404).send('Asset not found');
    });
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[JAMI AI] Server running on http://0.0.0.0:${PORT} (Mode: ${env.APP_MODE}, Demo: ${env.DEMO_LOGIN_ENABLED})`);
  });
}

startServer();
