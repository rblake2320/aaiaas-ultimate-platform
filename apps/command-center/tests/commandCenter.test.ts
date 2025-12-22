import { promises as fs } from 'fs';
import request from 'supertest';

function freshApp() {
  process.env.NODE_ENV = 'test';
  process.env.COMMAND_CENTER_STORE_PATH = `/tmp/command-center-store-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}.json`;

  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../src/index') as { createApp: () => any };
  return { app: mod.createApp(), storePath: process.env.COMMAND_CENTER_STORE_PATH! };
}

describe('Command Center API', () => {
  test('health endpoint works', async () => {
    const { app } = freshApp();
    try {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('command-center');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('health test error:', e);
      throw e;
    }
  });

  test('can register and list repos', async () => {
    const { app, storePath } = freshApp();

    try {
      await request(app)
        .post('/api/v1/command-center/repos')
        .send({
          name: 'local-ai',
          orchestratorBaseUrl: 'http://localhost:5000',
        })
        .expect(201);

      const list = await request(app).get('/api/v1/command-center/repos').expect(200);
      expect(list.body.repos).toHaveLength(1);
      expect(list.body.repos[0].name).toBe('local-ai');
      expect(list.body.repos[0].orchestratorBaseUrl).toBe('http://localhost:5000');

      const raw = JSON.parse(await fs.readFile(storePath, 'utf8')) as { repos: unknown[] };
      expect(raw.repos).toHaveLength(1);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('repos test error:', e);
      throw e;
    }
  });
});

