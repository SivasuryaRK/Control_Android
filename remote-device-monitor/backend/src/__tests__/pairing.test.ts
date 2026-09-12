import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { prisma } from '../services/prisma.service';
import { generateAccessToken } from '../utils/token';
import { hashPassword } from '../utils/password';

describe('Secure Android-to-Account Pairing & Authorization Suite', () => {
  let userA: any;
  let userB: any;
  let tokenUserA: string;
  let tokenUserB: string;

  beforeEach(async () => {
    // Reset databases
    await prisma.device.deleteMany();
    await prisma.pairingCode.deleteMany();
    await prisma.auditLog.deleteMany();

    // Create User A
    const passHashA = await hashPassword('Password123!');
    userA = await prisma.user.create({
      data: {
        name: 'User A',
        email: `user_a_${Date.now()}@example.com`,
        passwordHash: passHashA
      }
    });
    tokenUserA = generateAccessToken({ userId: userA.id, email: userA.email });

    // Create User B
    const passHashB = await hashPassword('Password123!');
    userB = await prisma.user.create({
      data: {
        name: 'User B',
        email: `user_b_${Date.now()}@example.com`,
        passwordHash: passHashB
      }
    });
    tokenUserB = generateAccessToken({ userId: userB.id, email: userB.email });
  });

  describe('1. Pairing Code Generation', () => {
    it('should reject unauthenticated pairing code generation with 401', async () => {
      const res = await request(app).post('/api/devices/pairing-code');
      expect(res.status).toBe(401);
    });

    it('should generate a 6-char cryptographically secure code with 5-minute TTL', async () => {
      const res = await request(app)
        .post('/api/devices/pairing-code')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(201);
      expect(res.body.code).toBeDefined();
      expect(res.body.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
      expect(res.body.expiresInSeconds).toBe(300);

      // Verify ONLY hash is stored in database, not plaintext
      const storedCodes = await prisma.pairingCode.findMany({ where: { userId: userA.id } });
      expect(storedCodes.length).toBe(1);
      expect(storedCodes[0].codeHash).not.toBe(res.body.code);
      expect(storedCodes[0].codeHash.length).toBe(64); // SHA-256 hex string

      // Verify audit log: pairing created
      const logs = await prisma.auditLog.findMany({ where: { userId: userA.id } });
      const createdLog = logs.find(l => l.action === 'PAIRING_CODE_CREATED');
      expect(createdLog).toBeDefined();
    });

    it('should supersede previous active codes when a new code is generated', async () => {
      const res1 = await request(app)
        .post('/api/devices/pairing-code')
        .set('Authorization', `Bearer ${tokenUserA}`);
      const code1 = res1.body.code;

      const res2 = await request(app)
        .post('/api/devices/pairing-code')
        .set('Authorization', `Bearer ${tokenUserA}`);
      const code2 = res2.body.code;

      expect(code1).not.toBe(code2);

      // Code 1 should now be invalidated
      const pairRes = await request(app)
        .post('/api/devices/pair')
        .send({
          pairingCode: code1,
          deviceIdentifier: 'hw-pixel-7',
          deviceName: 'Pixel 7',
          manufacturer: 'Google',
          model: 'Pixel 7'
        });
      expect(pairRes.status).toBe(400);
    });
  });

  describe('2. Pairing Verification & Credential Issuance', () => {
    it('should reject invalid or malformed pairing codes and create PAIRING_FAILED audit log', async () => {
      const res = await request(app)
        .post('/api/devices/pair')
        .send({
          pairingCode: 'INVALID-CODE',
          deviceIdentifier: 'hw-pixel-bad',
          deviceName: 'Bad Device'
        });

      expect(res.status).toBe(400);

      const logs = await prisma.auditLog.findMany();
      const failedLog = logs.find(l => l.action === 'PAIRING_FAILED');
      expect(failedLog).toBeDefined();
    });

    it('should reject expired pairing codes (> 5 mins old)', async () => {
      const genRes = await request(app)
        .post('/api/devices/pairing-code')
        .set('Authorization', `Bearer ${tokenUserA}`);
      const code = genRes.body.code;

      // Artificially expire the code in DB
      const stored = await prisma.pairingCode.findMany({ where: { userId: userA.id } });
      await prisma.pairingCode.update({
        where: { id: stored[0].id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      const pairRes = await request(app)
        .post('/api/devices/pair')
        .send({
          pairingCode: code,
          deviceIdentifier: 'hw-pixel-expired',
          deviceName: 'Pixel Expired'
        });

      expect(pairRes.status).toBe(400);
      expect(pairRes.body.error).toMatch(/expired/i);
    });

    it('should successfully pair device, generate credentials, and create PAIRING_SUCCESSFUL audit log', async () => {
      const genRes = await request(app)
        .post('/api/devices/pairing-code')
        .set('Authorization', `Bearer ${tokenUserA}`);
      const code = genRes.body.code;

      const pairRes = await request(app)
        .post('/api/devices/pair')
        .send({
          pairingCode: code,
          deviceIdentifier: 'hw-pixel-success',
          deviceName: 'Google Pixel 8',
          manufacturer: 'Google',
          model: 'Pixel 8',
          androidVersion: '14',
          appVersion: '1.0.0'
        });

      expect(pairRes.status).toBe(200);
      expect(pairRes.body.deviceId).toBeDefined();
      expect(pairRes.body.deviceToken).toBeDefined();
      expect(pairRes.body.userId).toBe(userA.id);

      // Verify code cannot be used again (one-time use)
      const secondPairRes = await request(app)
        .post('/api/devices/pair')
        .send({
          pairingCode: code,
          deviceIdentifier: 'hw-pixel-replay',
          deviceName: 'Pixel Replay'
        });
      expect(secondPairRes.status).toBe(400);

      // Verify audit log: pairing successful
      const logs = await prisma.auditLog.findMany({ where: { userId: userA.id } });
      const successLog = logs.find(l => l.action === 'PAIRING_SUCCESSFUL');
      expect(successLog).toBeDefined();
      expect(successLog?.deviceId).toBe(pairRes.body.deviceId);
    });
  });

  describe('3. Multi-Tenant Authorization (User A vs User B)', () => {
    let deviceAId: string;

    beforeEach(async () => {
      // Pair a device for User A
      const genRes = await request(app)
        .post('/api/devices/pairing-code')
        .set('Authorization', `Bearer ${tokenUserA}`);

      const pairRes = await request(app)
        .post('/api/devices/pair')
        .send({
          pairingCode: genRes.body.code,
          deviceIdentifier: 'hw-device-a-1',
          deviceName: "User A's Phone",
          manufacturer: 'Samsung',
          model: 'Galaxy S23'
        });

      deviceAId = pairRes.body.deviceId;
    });

    it("should allow User A to access User A's device", async () => {
      const res = await request(app)
        .get(`/api/devices/${deviceAId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.device.id).toBe(deviceAId);
      expect(res.body.device.userId).toBe(userA.id);
    });

    it("should PREVENT User B from accessing User A's device (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/devices/${deviceAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/forbidden|permission/i);
    });

    it("should PREVENT User B from disconnecting User A's device (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceAId}/disconnect`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(403);
    });

    it('should only return devices belonging to the authenticated user on GET /api/devices', async () => {
      // User B has no devices yet
      const resB = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${tokenUserB}`);
      expect(resB.status).toBe(200);
      expect(resB.body.devices.length).toBe(0);

      // User A sees Device A
      const resA = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${tokenUserA}`);
      expect(resA.status).toBe(200);
      expect(resA.body.devices.length).toBe(1);
      expect(resA.body.devices[0].id).toBe(deviceAId);
    });
  });

  describe('4. Device Disconnect & Audit Logs', () => {
    it('should disconnect device and create DEVICE_DISCONNECTED audit log', async () => {
      const genRes = await request(app)
        .post('/api/devices/pairing-code')
        .set('Authorization', `Bearer ${tokenUserA}`);

      const pairRes = await request(app)
        .post('/api/devices/pair')
        .send({
          pairingCode: genRes.body.code,
          deviceIdentifier: 'hw-disconnect-test',
          deviceName: 'Phone to Disconnect'
        });
      const deviceId = pairRes.body.deviceId;

      // Disconnect
      const disRes = await request(app)
        .post(`/api/devices/${deviceId}/disconnect`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(disRes.status).toBe(200);
      expect(disRes.body.device.status).toBe('DISCONNECTED');

      // Check audit logs
      const auditRes = await request(app)
        .get('/api/devices/audit-logs')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(auditRes.status).toBe(200);
      const actions = auditRes.body.logs.map((l: any) => l.action);
      expect(actions).toContain('PAIRING_CODE_CREATED');
      expect(actions).toContain('PAIRING_SUCCESSFUL');
      expect(actions).toContain('DEVICE_DISCONNECTED');
    });
  });
});
