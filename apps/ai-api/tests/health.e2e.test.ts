import request from 'supertest';
import { beforeAll, describe, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

describe('API e2e smoke', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/drivecentric_ai?schema=public');
    vi.stubEnv('JWT_ACCESS_SECRET', 'test-access-secret-at-least-32-characters');
    vi.stubEnv('JWT_REFRESH_PEPPER', 'test-refresh-pepper-at-least-32-characters');
    vi.stubEnv('LLM_PROVIDER', 'mock');
  });

  it('serves health', async () => {
    const { createApp } = await import('../src/app.js');
    await request(createApp()).get('/health').expect(200).expect({ ok: true, service: 'drivecentric-ai-api' });
  });

  it('returns 401 for an expired access token so clients can refresh', async () => {
    const { createApp } = await import('../src/app.js');
    const token = jwt.sign(
      {
        sub: 'user-expired',
        userId: 'owner',
        role: 'owner',
        dealershipId: 'dealer-expired',
        sessionId: 'session-expired',
      },
      'test-access-secret-at-least-32-characters',
      {
        audience: 'drivecentric-ai',
        issuer: 'drivecentric-ai-api',
        expiresIn: '-1s',
      },
    );

    await request(createApp())
      .get('/admin/summary')
      .set('authorization', `Bearer ${token}`)
      .expect(401)
      .expect(({ body }) => {
        if (body.error?.code !== 'unauthorized') {
          throw new Error(`Expected unauthorized response, got ${JSON.stringify(body)}`);
        }
      });
  });
});
