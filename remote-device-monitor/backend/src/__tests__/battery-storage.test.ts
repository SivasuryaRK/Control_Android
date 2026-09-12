import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { app, httpServer } from '../server';
import { prisma } from '../services/prisma.service';
import { hashPassword } from '../utils/password';
import { generateAccessToken, generateDeviceToken } from '../utils/token';

describe('Phase 8: Real-time Battery & Storage Monitoring', () => {
  let serverUrl: string;
  let user1: any;
  let user1Token: string;
  let device1: any;
  let device1Token: string;
  let dashboardSocket: ClientSocket;
  let deviceSocket: ClientSocket;
  const socketsToCleanup: ClientSocket[] = [];

  const createSocket = (token?: string): ClientSocket => {
    const socket = Client(serverUrl, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    socketsToCleanup.push(socket);
    return socket;
  };

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const port = (httpServer.address() as AddressInfo).port;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const s of socketsToCleanup) {
      if (s.connected) s.disconnect();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  beforeEach(async () => {
    await prisma.device.deleteMany();
    await (prisma as any).batteryStatus?.deleteMany();
    await (prisma as any).storageStatus?.deleteMany();

    user1 = await prisma.user.create({
      data: {
        email: `battery-test-${Date.now()}@example.com`,
        passwordHash: await hashPassword('Password123!'),
        name: 'Battery Test User',
      },
    });
    user1Token = generateAccessToken({ userId: user1.id, email: user1.email });

    device1 = await prisma.device.create({
      data: {
        userId: user1.id,
        deviceName: 'Pixel 8 Test',
        deviceIdentifier: `ident-${Date.now()}`,
        manufacturer: 'Google',
        model: 'Pixel 8',
        androidVersion: '14',
        appVersion: '1.0.0',
        isOnline: true,
        status: 'ONLINE',
        lastSeen: new Date(),
        lastSeenAt: new Date(),
      },
    });
    device1Token = generateDeviceToken({ deviceId: device1.id, userId: user1.id, role: 'device' });
  });

  it('validates and stores incoming battery telemetry', async () => {
    dashboardSocket = createSocket(user1Token);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const batteryPromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:battery', resolve);
    });

    deviceSocket.emit('device:battery', {
      percentage: 78,
      charging: true,
      temperature: 32.4,
      voltage: 3950,
      timestamp: new Date().toISOString(),
    });

    const received = await batteryPromise;
    expect(received.deviceId).toBe(device1.id);
    expect(received.percentage).toBe(78);
    expect(received.charging).toBe(true);
    expect(received.temperature).toBe(32.4);
    expect(received.voltage).toBe(3950);

    // Verify historical persistence
    const history = await (prisma as any).batteryStatus.findMany({
      where: { deviceId: device1.id },
    });
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].percentage).toBe(78);
    expect(history[0].charging).toBe(true);
  });

  it('rejects invalid battery percentage', async () => {
    deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const ack = await new Promise<any>((resolve) => {
      deviceSocket.emit('device:battery', {
        percentage: 'not-a-number',
        charging: false,
      }, resolve);
    });

    expect(ack.error).toBeDefined();
    expect(ack.error).toContain('Invalid battery percentage');
  });

  it('validates and stores incoming storage telemetry', async () => {
    dashboardSocket = createSocket(user1Token);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const storagePromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:storage', resolve);
    });

    deviceSocket.emit('device:storage', {
      totalBytes: 128_000_000_000,
      usedBytes: 64_000_000_000,
      availableBytes: 64_000_000_000,
      timestamp: new Date().toISOString(),
    });

    const received = await storagePromise;
    expect(received.deviceId).toBe(device1.id);
    expect(received.storageUsedGb).toBeGreaterThan(50);
    expect(received.storageTotalGb).toBeGreaterThan(100);
    expect(received.storageFreeGb).toBeGreaterThan(50);

    const history = await (prisma as any).storageStatus.findMany({
      where: { deviceId: device1.id },
    });
    expect(history.length).toBeGreaterThan(0);
  });

  it('fetches battery history via REST endpoint', async () => {
    await (prisma as any).batteryStatus.create({
      data: {
        deviceId: device1.id,
        percentage: 85,
        charging: false,
        temperature: 30.1,
        voltage: 4000,
      },
    });
    await (prisma as any).batteryStatus.create({
      data: {
        deviceId: device1.id,
        percentage: 80,
        charging: false,
        temperature: 31.0,
        voltage: 3950,
      },
    });

    const res = await request(app)
      .get(`/api/devices/${device1.id}/battery-history`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.history).toBeDefined();
    expect(res.body.history.length).toBe(2);
    expect(res.body.history[0].percentage).toBe(85);
    expect(res.body.history[1].percentage).toBe(80);
  });

  it('fetches storage history via REST endpoint', async () => {
    await (prisma as any).storageStatus.create({
      data: {
        deviceId: device1.id,
        totalBytes: 128000000000,
        usedBytes: 50000000000,
        availableBytes: 78000000000,
      },
    });

    const res = await request(app)
      .get(`/api/devices/${device1.id}/storage-history`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.history).toBeDefined();
    expect(res.body.history.length).toBe(1);
  });

  it('fetches fleet telemetry summary', async () => {
    const res = await request(app)
      .get('/api/devices/telemetry/fleet')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalDevices).toBe(1);
    expect(res.body.onlineDevices).toBe(1);
    expect(res.body.batteryHistory).toBeDefined();
  });
});
