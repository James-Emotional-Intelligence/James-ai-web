import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes/api';
import { db } from './server/db/mysql';
import { UserRepository } from './server/repositories/user-repository';
import { Migrator } from './server/db/migrator';
import { DemoRepository } from './server/repositories/demo-repository';
import { env } from './server/config/env';

async function startServer() {
  const app = express();
  const PORT = env.PORT || 3000;

  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  // Initialize demo data for memory fallback ONLY if demo mode enabled
  if (env.DEMO_LOGIN_ENABLED) {
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
        if (env.APP_MODE === 'production' || env.NODE_ENV === 'production') {
          throw new Error(`[JAMI AI Startup] Migration failed in Production mode: ${migErr.message}`);
        }
      }
      await UserRepository.getInstance().syncWithMySQL();
      console.log('[JAMI AI] MySQL Database fully integrated and active.');
    } else {
      if (env.APP_MODE === 'production' || env.NODE_ENV === 'production') {
        throw new Error('[JAMI AI Startup] Failed to connect to MySQL database in Production mode.');
      }
      console.warn('[JAMI AI] Running in standalone demo mode.');
    }
  } catch (err: any) {
    console.error('[JAMI AI] MySQL initialization error:', err.message);
    if (env.APP_MODE === 'production' || env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  // Mount API routes
  app.use('/api/v1', apiRouter);

  // Vite middleware for development
  if (env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[JAMI AI] Server running on http://0.0.0.0:${PORT} (Mode: ${env.APP_MODE}, Demo: ${env.DEMO_LOGIN_ENABLED})`);
  });
}

startServer();
