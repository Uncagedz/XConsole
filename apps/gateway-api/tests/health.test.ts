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
