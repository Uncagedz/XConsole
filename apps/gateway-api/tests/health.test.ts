import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readEnv } from '../src/env.js';

const env = readEnv({
  NODE_ENV: 'test',
  XCONSOLE_API_TOKEN: 'test-dashboard-token-at-least-24-characters',
  XCONSOLE_DEVICE_REGISTRATION_CODE: 'test-registration-code',
  CORS_ORIGINS: 'http://localhost:5173',
});

describe('gateway API', () => {
  it('serves health and protects connector data', async () => {
    const app = createApp(env);
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/api/connectors')).status).toBe(401);
    const response = await request(app)
      .get('/api/connectors')
      .set('authorization', `Bearer ${env.XCONSOLE_API_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(4);
  });

  it('exchanges the dashboard token for a signed HTTP-only session that can be cleared', async () => {
    const app = createApp(env);
    const agent = request.agent(app);
    const rejected = await agent.post('/api/session').send({ token: 'wrong-token-that-is-at-least-24-characters' });
    expect(rejected.status).toBe(401);

    const login = await agent.post('/api/session').send({ token: env.XCONSOLE_API_TOKEN });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie']?.[0]).toContain('xconsole_dashboard_session=');
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect((await agent.get('/api/connectors')).status).toBe(200);

    const cookie = login.headers['set-cookie']?.[0]?.split(';', 1)[0] ?? '';
    const tamperedCookie = `${cookie.slice(0, -1)}${cookie.endsWith('a') ? 'b' : 'a'}`;
    expect((await request(app).get('/api/connectors').set('cookie', tamperedCookie)).status).toBe(401);

    expect((await agent.delete('/api/session')).status).toBe(200);
    expect((await agent.get('/api/connectors')).status).toBe(401);
  });

  it('serves the normalized inventory contract through both compatibility routes', async () => {
    const app = createApp(env);
    const authorization = `Bearer ${env.XCONSOLE_API_TOKEN}`;
    const inventory = await request(app).get('/api/inventory/active').set('authorization', authorization);
    const vehicles = await request(app).get('/api/vehicles').set('authorization', authorization);
    expect(inventory.status).toBe(200);
    expect(inventory.body.source.mode).toBe('fixture');
    expect(inventory.body.source.warning).toContain('Live inventory is not connected');
    expect(vehicles.body).toEqual(inventory.body);
  });

  it('requires a real boolean when changing connector state', async () => {
    const app = createApp(env);
    const authorization = `Bearer ${env.XCONSOLE_API_TOKEN}`;
    const invalid = await request(app)
      .patch('/api/connectors/vauto')
      .set('authorization', authorization)
      .send({ enabled: 'false' });
    const valid = await request(app)
      .patch('/api/connectors/vauto')
      .set('authorization', authorization)
      .send({ enabled: true });
    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(valid.body.connector.enabled).toBe(true);
  });

  it('does not grant CORS access to arbitrary Chrome extensions', async () => {
    const app = createApp(env);
    const response = await request(app)
      .options('/api/connectors')
      .set('origin', 'chrome-extension://untrusted-extension');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('registers a device and accepts its heartbeat', async () => {
    const app = createApp(env);
    const registration = await request(app).post('/api/devices/register').send({
      name: 'Synthetic Windows Agent',
      platform: 'windows',
      registrationCode: env.XCONSOLE_DEVICE_REGISTRATION_CODE,
      capabilities: ['recording'],
    });
    expect(registration.status).toBe(201);
    const heartbeat = await request(app)
      .post('/api/agent/heartbeat')
      .set('authorization', `Device ${registration.body.deviceToken}`)
      .send({
        deviceId: registration.body.deviceId,
        agentVersion: '0.1.0',
        sentAt: new Date().toISOString(),
        status: 'online',
        capabilities: ['recording'],
      });
    expect(heartbeat.status).toBe(200);
    const devices = await request(app)
      .get('/api/devices')
      .set('authorization', `Bearer ${env.XCONSOLE_API_TOKEN}`);
    expect(devices.body.items[0].lastHeartbeat.status).toBe('online');
    expect(devices.body.items[0].deviceToken).toBeUndefined();
  });
});
