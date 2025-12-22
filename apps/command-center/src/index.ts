import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { env } from './config/env';
import { RepoStore } from './store/repoStore';
import { commandCenterRoutes } from './routes/commandCenter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(','),
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'command-center',
    });
  });

  const store = new RepoStore(env.COMMAND_CENTER_STORE_PATH);
  app.use('/api/v1/command-center', commandCenterRoutes(store));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function start() {
  const app = createApp();
  const port = Number(env.PORT);
  app.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`Command Center API listening on ${port}`);
  });
}

// Avoid listening during tests
if (process.env.NODE_ENV !== 'test') {
  void start();
}

