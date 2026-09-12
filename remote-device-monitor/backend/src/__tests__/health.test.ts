import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { prisma } from '../services/prisma.service';

describe('Backend Database & Health Checks', () => {
  it('should return 200 OK for root endpoint', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hello from Remote Device Monitor Backend!');
  });

  it('should respond to /health endpoint', async () => {
    const res = await request(app).get('/health');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.status).toBe('OK');
      expect(res.body.database).toBe('connected');
    } else {
      expect(res.body.status).toBe('ERROR');
      expect(res.body.database).toBe('disconnected');
    }
  });

  it('should respond to /api/health endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 500]).toContain(res.status);
  });

  it('should verify PrismaClient service instance is initialized', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$queryRaw).toBe('function');
  });
});
