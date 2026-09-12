import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { prisma } from '../services/prisma.service';
import { hashPassword } from '../utils/password';

// In-memory mock store for tests to ensure fast & reliable test suite run
let usersDb: any[] = [];
let refreshTokensDb: any[] = [];

vi.mock('../services/prisma.service', () => {
  return {
    prisma: {
      $queryRaw: vi.fn().mockImplementation(async () => [{ 1: 1 }]),
      user: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id) return usersDb.find((u) => u.id === where.id) || null;
          if (where.email) return usersDb.find((u) => u.email === where.email.toLowerCase()) || null;
          return null;
        }),
        create: vi.fn().mockImplementation(async ({ data, select }) => {
          const newUser = {
            id: `uuid-${Date.now()}-${Math.random()}`,
            email: data.email.toLowerCase(),
            passwordHash: data.passwordHash,
            name: data.name,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          usersDb.push(newUser);
          if (select) {
            const selected: any = {};
            Object.keys(select).forEach((key) => {
              if (select[key] && key !== 'passwordHash') {
                selected[key] = (newUser as any)[key];
              }
            });
            return selected;
          }
          return newUser;
        }),
      },
      refreshToken: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          const tokenRecord = {
            id: `token-uuid-${Date.now()}-${Math.random()}`,
            userId: data.userId,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            revokedAt: null,
            createdAt: new Date(),
          };
          refreshTokensDb.push(tokenRecord);
          return tokenRecord;
        }),
        findUnique: vi.fn().mockImplementation(async ({ where, include }) => {
          const record = refreshTokensDb.find((r) => r.tokenHash === where.tokenHash);
          if (!record) return null;
          if (include && include.user) {
            const user = usersDb.find((u) => u.id === record.userId);
            return { ...record, user };
          }
          return record;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const record = refreshTokensDb.find((r) => r.id === where.id);
          if (record) {
            Object.assign(record, data);
          }
          return record;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          refreshTokensDb.forEach((r) => {
            if (r.tokenHash === where.tokenHash && (!where.revokedAt || r.revokedAt === where.revokedAt)) {
              Object.assign(r, data);
              count++;
            }
          });
          return { count };
        }),
      },
    },
  };
});

describe('Authentication Endpoints & Security Suite', () => {
  beforeEach(() => {
    usersDb = [];
    refreshTokensDb = [];
    vi.clearAllMocks();
  });

  const validUserData = {
    email: 'test@example.com',
    password: 'Password123!',
    name: 'Test User',
  };

  it('1. Registration: creates user successfully and does NOT return passwordHash', async () => {
    const res = await request(app).post('/api/auth/register').send(validUserData);

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('2. Registration: prevents duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send(validUserData);

    const res = await request(app).post('/api/auth/register').send(validUserData);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('3. Registration: rejects invalid / weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'weak@example.com',
      password: '123',
      name: 'Weak User',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('4. Login: authenticates user with correct password', async () => {
    await request(app).post('/api/auth/register').send(validUserData);

    const res = await request(app).post('/api/auth/login').send({
      email: validUserData.email,
      password: validUserData.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('5. Login: rejects login with wrong password', async () => {
    await request(app).post('/api/auth/register').send(validUserData);

    const res = await request(app).post('/api/auth/login').send({
      email: validUserData.email,
      password: 'WrongPassword123!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid credentials');
  });

  it('6. Authenticated request: GET /api/auth/me returns user profile with valid Bearer token', async () => {
    const regRes = await request(app).post('/api/auth/register').send(validUserData);
    const token = regRes.body.accessToken;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toBeDefined();
    expect(meRes.body.user.email).toBe('test@example.com');
  });

  it('7. Unauthorized request: GET /api/auth/me fails without token', async () => {
    const meRes = await request(app).get('/api/auth/me');
    expect(meRes.status).toBe(401);
  });

  it('8. Refresh token: issues new access token with valid refresh token', async () => {
    const regRes = await request(app).post('/api/auth/register').send(validUserData);
    const refreshToken = regRes.body.refreshToken;

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
  });

  it('9. Refresh-token rotation: revokes previous refresh token so reuse fails', async () => {
    const regRes = await request(app).post('/api/auth/register').send(validUserData);
    const initialRefreshToken = regRes.body.refreshToken;

    // First refresh succeeds and rotates token
    const firstRefreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefreshToken });
    expect(firstRefreshRes.status).toBe(200);

    // Reusing initial refresh token must fail
    const secondRefreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: initialRefreshToken });
    expect(secondRefreshRes.status).toBe(401);
    expect(secondRefreshRes.body.error).toContain('revoked');
  });

  it('10. Logout: revokes refresh token so subsequent refresh fails', async () => {
    const regRes = await request(app).post('/api/auth/register').send(validUserData);
    const refreshToken = regRes.body.refreshToken;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});
