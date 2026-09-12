import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { app, httpServer, io } from '../server';
import { prisma } from '../services/prisma.service';
import { generateAccessToken, generateDeviceToken } from '../utils/token';

// Disable the offline grace period in tests so disconnect tests don't time out
process.env['SOCKET_OFFLINE_GRACE_MS'] = '0';

describe('Phase 7: Real-Time Communication with Socket.IO', () => {

  let serverUrl: string;
  let user1: any;
  let user2: any;
  let device1: any;
  let device2: any;
  let user1AccessToken: string;
  let device1Token: string;
  let user2AccessToken: string;
  let device2Token: string;
  const socketsToCleanup: ClientSocket[] = [];

  const createSocket = (token?: string, queryOpts: Record<string, any> = {}): ClientSocket => {
    const socket = Client(serverUrl, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      ...queryOpts,
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

    // Create test users
    user1 = await prisma.user.create({
      data: {
        email: 'alice@example.com',
        name: 'Alice',
        passwordHash: 'hash123',
      },
    });

    user2 = await prisma.user.create({
      data: {
        email: 'bob@example.com',
        name: 'Bob',
        passwordHash: 'hash456',
      },
    });

    // Create test devices
    device1 = await prisma.device.create({
      data: {
        userId: user1.id,
        deviceName: 'Pixel 8',
        deviceIdentifier: 'ident_pixel_8',
        manufacturer: 'Google',
        model: 'Pixel 8',
        androidVersion: '14',
        appVersion: '1.0.0',
        status: 'OFFLINE',
        isOnline: false,
      },
    });

    device2 = await prisma.device.create({
      data: {
        userId: user2.id,
        deviceName: 'Galaxy S24',
        deviceIdentifier: 'ident_galaxy_s24',
        manufacturer: 'Samsung',
        model: 'S24',
        androidVersion: '14',
        appVersion: '1.0.0',
        status: 'OFFLINE',
        isOnline: false,
      },
    });

    user1AccessToken = generateAccessToken({ userId: user1.id, email: user1.email });
    user2AccessToken = generateAccessToken({ userId: user2.id, email: user2.email });

    device1Token = generateDeviceToken({
      deviceId: device1.id,
      userId: user1.id,
      role: 'device',
    });

    device2Token = generateDeviceToken({
      deviceId: device2.id,
      userId: user2.id,
      role: 'device',
    });
  });

  afterAll(async () => {
    for (const s of socketsToCleanup) {
      if (s.connected) s.disconnect();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  beforeEach(() => {
    // Reset sockets list between tests
    while (socketsToCleanup.length > 0) {
      const s = socketsToCleanup.pop();
      if (s?.connected) s.disconnect();
    }
  });

  // ── 1. Authenticated Socket ────────────────────────────────────────────────
  it('should authenticate device and dashboard sockets successfully', async () => {
    // 1. Connect dashboard
    const dashboardSocket = createSocket(user1AccessToken);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    // Listen for device:online on dashboard
    const onlinePromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:online', resolve);
    });

    // 2. Connect device with valid deviceToken in handshake
    const deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const onlineEvent = await onlinePromise;
    expect(onlineEvent.deviceId).toBe(device1.id);
    expect(onlineEvent.status).toBe('ONLINE');
    expect(onlineEvent.isOnline).toBe(true);

    // Verify DB updated
    const updatedDevice = await prisma.device.findUnique({ where: { id: device1.id } });
    expect(updatedDevice?.isOnline).toBe(true);
    expect(updatedDevice?.status).toBe('ONLINE');
  });

  // ── 2. Authenticate via device:authenticate event ─────────────────────────
  it('should authenticate via explicit device:authenticate event', async () => {
    const unauthSocket = createSocket();
    await new Promise<void>((resolve) => unauthSocket.on('connect', resolve));

    const authPromise = new Promise<any>((resolve) => {
      unauthSocket.on('device:authenticated', resolve);
    });

    unauthSocket.emit('device:authenticate', { token: device1Token });
    const authResult = await authPromise;

    expect(authResult.success).toBe(true);
    expect(authResult.deviceId).toBe(device1.id);
  });

  // ── 3. Unauthenticated Socket ─────────────────────────────────────────────
  it('should reject unauthenticated actions with device:error', async () => {
    const socket = createSocket();
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    const errorPromise = new Promise<any>((resolve) => {
      socket.on('device:error', resolve);
    });

    socket.emit('device:heartbeat');
    const err = await errorPromise;
    expect(err.error || err.message).toBeDefined();
    expect(err.error).toContain('Unauthorized');
  });

  it('should reject invalid handshake tokens', async () => {
    const socket = createSocket('invalid-garbage-token');
    const errorPromise = new Promise<Error>((resolve) => {
      socket.on('connect_error', resolve);
    });

    const err = await errorPromise;
    expect(err.message).toContain('Authentication failed');
  });

  // ── 4. Wrong Device & Ownership Validation ────────────────────────────────
  it('should reject socket with device token for non-existent device', async () => {
    const fakeDeviceToken = generateDeviceToken({
      deviceId: '00000000-0000-0000-0000-000000000000',
      userId: user1.id,
      role: 'device',
    });

    const socket = createSocket(fakeDeviceToken);
    const errorPromise = new Promise<Error>((resolve) => {
      socket.on('connect_error', resolve);
    });

    const err = await errorPromise;
    expect(err.message).toContain('Device ownership validation failed');
  });

  it('should reject device attempting to send events with another deviceId', async () => {
    const deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const errorPromise = new Promise<any>((resolve) => {
      deviceSocket.on('device:error', resolve);
    });

    // Device 1 authenticated, but attempts to send telemetry claiming to be Device 2
    deviceSocket.emit('device:battery', {
      deviceId: device2.id,
      percentage: 95,
      charging: true,
    });

    const err = await errorPromise;
    expect(err.error).toContain('Device ID mismatch');
  });

  it('should prevent cross-user device access (ownership validation)', async () => {
    // Token claims device1 belongs to user2 (tampered/invalid ownership)
    const forgedToken = generateDeviceToken({
      deviceId: device1.id,
      userId: user2.id,
      role: 'device',
    });

    const socket = createSocket(forgedToken);
    const errorPromise = new Promise<Error>((resolve) => {
      socket.on('connect_error', resolve);
    });

    const err = await errorPromise;
    expect(err.message).toContain('Device ownership validation failed');
  });

  // ── 5. Heartbeat ──────────────────────────────────────────────────────────
  it('should handle device:heartbeat and update lastSeen & isOnline', async () => {
    const dashboardSocket = createSocket(user1AccessToken);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    const deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const ackPromise = new Promise<any>((resolve) => {
      deviceSocket.on('device:heartbeat:ack', resolve);
    });

    const onlinePromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:online', resolve);
    });

    deviceSocket.emit('device:heartbeat', { timestamp: Date.now() });

    const ack = await ackPromise;
    expect(ack.success).toBe(true);

    const onlineEvent = await onlinePromise;
    expect(onlineEvent.deviceId).toBe(device1.id);
    expect(onlineEvent.isOnline).toBe(true);

    const updated = await prisma.device.findUnique({ where: { id: device1.id } });
    expect(updated?.isOnline).toBe(true);
    expect(updated?.lastSeen).toBeDefined();
  });

  // ── 6. Battery & Storage Events ───────────────────────────────────────────
  it('should handle device:battery and broadcast to dashboard', async () => {
    const dashboardSocket = createSocket(user1AccessToken);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    const deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const batteryPromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:battery', resolve);
    });

    deviceSocket.emit('device:battery', {
      percentage: 82,
      charging: true,
      temperature: 31.5,
      voltage: 4120,
    });

    const data = await batteryPromise;
    expect(data.deviceId).toBe(device1.id);
    expect(data.percentage).toBe(82);
    expect(data.charging).toBe(true);
    expect(data.temperature).toBe(31.5);
    expect(data.voltage).toBe(4120);
  });

  it('should handle device:storage and broadcast to dashboard', async () => {
    const dashboardSocket = createSocket(user1AccessToken);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    const deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const storagePromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:storage', resolve);
    });

    deviceSocket.emit('device:storage', {
      totalBytes: 128_000_000_000,
      usedBytes: 64_000_000_000,
      availableBytes: 64_000_000_000,
    });

    const data = await storagePromise;
    expect(data.deviceId).toBe(device1.id);
    expect(data.storageUsedGb).toBeGreaterThan(0);
    expect(data.storageTotalGb).toBeGreaterThan(0);
  });

  // ── 7. Disconnect ─────────────────────────────────────────────────────────
  it('should handle device:disconnect event and mark device offline', async () => {
    const dashboardSocket = createSocket(user1AccessToken);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    const deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const offlinePromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:offline', resolve);
    });

    deviceSocket.emit('device:disconnect', { reason: 'APP_STOPPED' });

    const offlineData = await offlinePromise;
    expect(offlineData.deviceId).toBe(device1.id);
    expect(offlineData.status).toBe('OFFLINE');
    expect(offlineData.isOnline).toBe(false);

    // Verify DB update
    const updated = await prisma.device.findUnique({ where: { id: device1.id } });
    expect(updated?.isOnline).toBe(false);
    expect(updated?.status).toBe('OFFLINE');
  });

  it('should handle socket transport disconnection and mark device offline', async () => {
    const dashboardSocket = createSocket(user1AccessToken);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    const deviceSocket = createSocket(device1Token);
    await new Promise<void>((resolve) => deviceSocket.on('connect', resolve));

    const offlinePromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:offline', resolve);
    });

    deviceSocket.disconnect();

    const offlineData = await offlinePromise;
    expect(offlineData.deviceId).toBe(device1.id);
    expect(offlineData.status).toBe('OFFLINE');
    expect(offlineData.isOnline).toBe(false);
  });

  // ── 8. Reconnect ──────────────────────────────────────────────────────────
  it('should handle reconnection and restore online status', async () => {
    const dashboardSocket = createSocket(user1AccessToken);
    await new Promise<void>((resolve) => dashboardSocket.on('connect', resolve));

    // 1st connection
    const socket1 = createSocket(device1Token);
    await new Promise<void>((resolve) => socket1.on('connect', resolve));
    socket1.disconnect();

    await new Promise((r) => setTimeout(r, 100));

    // Reconnect
    const onlinePromise = new Promise<any>((resolve) => {
      dashboardSocket.on('device:online', resolve);
    });

    const socket2 = createSocket(device1Token);
    await new Promise<void>((resolve) => socket2.on('connect', resolve));

    const onlineData = await onlinePromise;
    expect(onlineData.deviceId).toBe(device1.id);
    expect(onlineData.isOnline).toBe(true);

    const dev = await prisma.device.findUnique({ where: { id: device1.id } });
    expect(dev?.isOnline).toBe(true);
  });

  // ── 9. Duplicate Connections Prevention ───────────────────────────────────
  it('should replace duplicate socket connection for the same device', async () => {
    const socket1 = createSocket(device1Token);
    await new Promise<void>((resolve) => socket1.on('connect', resolve));

    const socket1DisconnectPromise = new Promise<void>((resolve) => {
      socket1.on('disconnect', () => resolve());
    });

    // 2nd socket connects for the same device
    const socket2 = createSocket(device1Token);
    await new Promise<void>((resolve) => socket2.on('connect', resolve));

    // socket1 should be disconnected
    await socket1DisconnectPromise;
    expect(socket1.connected).toBe(false);
    expect(socket2.connected).toBe(true);
  });
});
