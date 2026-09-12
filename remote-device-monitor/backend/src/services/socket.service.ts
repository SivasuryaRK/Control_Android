import { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from './prisma.service';
import { verifyDeviceToken, verifyAccessToken } from '../utils/token';

// In-memory active sockets per device: deviceId -> Socket
const activeDeviceSockets = new Map<string, Socket>();

// Grace-period timers per device: deviceId -> NodeJS.Timeout
// Prevents false offline flashes during reconnect (e.g. when Android service restarts).
// Override via SOCKET_OFFLINE_GRACE_MS=0 in test environments.
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const getOfflineGraceMs = () => Number(process.env['SOCKET_OFFLINE_GRACE_MS'] ?? 30_000);

function parseSafeISOString(val: any): string {
  if (!val) return new Date().toISOString();
  try {
    if (typeof val === 'number' && !isNaN(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof val === 'string') {
      const num = Number(val);
      if (!isNaN(num) && num > 0) {
        const d = new Date(num);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  } catch (_) {}
  return new Date().toISOString();
}

export interface DeviceTelemetryEvent {
  battery?: number;
  charging?: boolean;
  storageUsedGb?: number;
  storageTotalGb?: number;
  timestamp?: string;
}

/**
 * Configure Socket.IO server with complete Phase 7 real-time event pipeline:
 * - Authentication (via handshake & explicit device:authenticate event)
 * - Device ownership verification (never trust client-supplied user IDs)
 * - Heartbeat management
 * - Device status updates (isOnline, lastSeen)
 * - Duplicate connection prevention & socket cleanup
 * - Android -> Backend events: device:authenticate, device:heartbeat, device:battery, device:storage, device:disconnect
 * - Backend -> Dashboard events: device:online, device:offline, device:battery, device:storage, device:error
 */
export function setupSocketIO(io: SocketIOServer): void {
  // ── Handshake Authentication Middleware ────────────────────────────────────
  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.headers?.authorization as string)?.replace(/^Bearer\s+/i, '');

    // Allow connection without handshake token so clients can use device:authenticate event
    if (!token) {
      socket.data = { authenticated: false };
      return next();
    }

    // 1. Try Device Token
    try {
      const devicePayload = verifyDeviceToken(token);
      if (devicePayload && devicePayload.deviceId && devicePayload.userId) {
        // Verify device ownership in database against verified token payload
        const device = await prisma.device.findUnique({
          where: { id: devicePayload.deviceId },
        });

        if (!device || device.userId !== devicePayload.userId) {
          return next(new Error('Device ownership validation failed'));
        }

        socket.data = {
          deviceId: devicePayload.deviceId,
          userId: devicePayload.userId,
          role: 'device',
          authenticated: true,
        };
        return next();
      }
    } catch (_) {
      // Continue to try access token
    }

    // 2. Try User Access Token (Dashboard)
    try {
      const userPayload = verifyAccessToken(token);
      if (userPayload && userPayload.userId) {
        const user = await prisma.user.findUnique({
          where: { id: userPayload.userId },
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.data = {
          userId: userPayload.userId,
          role: 'dashboard',
          authenticated: true,
        };
        return next();
      }
    } catch (_) {
      // Invalid token
    }

    return next(new Error('Authentication failed: Invalid token'));
  });

  // ── Connection Handler ─────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    /**
     * Helper to initialize and bind an authenticated device session:
     * - Prevents duplicate connections
     * - Updates device in DB (isOnline = true, lastSeen = now)
     * - Broadcasts device:online to dashboard room
     */
    const initializeDeviceSession = async (deviceId: string, userId: string) => {
      // Duplicate connection prevention: disconnect existing socket for this device
      const existingSocket = activeDeviceSockets.get(deviceId);
      if (existingSocket && existingSocket.id !== socket.id) {
        existingSocket.emit('device:error', {
          error: 'Duplicate connection: Session replaced by a new connection',
          message: 'Connection closed due to another active session for this device',
        });
        existingSocket.disconnect(true);
      }
      // Cancel any pending offline grace timer for this device
      const existingTimer = offlineTimers.get(deviceId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        offlineTimers.delete(deviceId);
      }

      activeDeviceSockets.set(deviceId, socket);

      socket.join(`user:${userId}`);
      socket.join(`device:${deviceId}`);

      const now = new Date();
      await prisma.device.update({
        where: { id: deviceId },
        data: {
          isOnline: true,
          status: 'ONLINE',
          lastSeen: now,
          lastSeenAt: now,
        },
      }).catch(() => {});

      const onlinePayload = {
        deviceId,
        status: 'ONLINE',
        isOnline: true,
        lastSeen: now.toISOString(),
      };

      // Backend -> Dashboard: device:online
      socket.to(`user:${userId}`).emit('device:online', onlinePayload);
      // Backward compatibility:
      socket.to(`user:${userId}`).emit('device:status', {
        deviceId,
        status: 'ONLINE',
        lastSeenAt: now.toISOString(),
      });
    };

    // If already authenticated during handshake
    if (socket.data.authenticated) {
      if (socket.data.role === 'device' && socket.data.deviceId && socket.data.userId) {
        initializeDeviceSession(socket.data.deviceId, socket.data.userId);
      } else if (socket.data.role === 'dashboard' && socket.data.userId) {
        socket.join(`user:${socket.data.userId}`);
      }
    }

    // ── Android -> Backend: device:authenticate ──────────────────────────────
    socket.on('device:authenticate', async (data: { token?: string; deviceId?: string }, callback?: (res: any) => void) => {
      try {
        if (!data || !data.token) {
          const errPayload = {
            error: 'Authentication token is required',
            message: 'Authentication token is required',
          };
          socket.emit('device:error', errPayload);
          if (callback) callback(errPayload);
          return;
        }

        // Try device token
        try {
          const devicePayload = verifyDeviceToken(data.token);
          if (devicePayload && devicePayload.deviceId && devicePayload.userId) {
            // Verify device ownership in database - NEVER trust client-supplied userId
            const device = await prisma.device.findUnique({
              where: { id: devicePayload.deviceId },
            });

            if (!device || device.userId !== devicePayload.userId) {
              const errPayload = {
                error: 'Forbidden. Device ownership validation failed.',
                message: 'Device does not belong to the authenticated user',
              };
              socket.emit('device:error', errPayload);
              if (callback) callback(errPayload);
              return;
            }

            // Verify deviceId matching if supplied in payload
            if (data.deviceId && data.deviceId !== devicePayload.deviceId) {
              const errPayload = {
                error: 'Unauthorized: Device ID mismatch between token and request payload',
                message: 'Device mismatch',
              };
              socket.emit('device:error', errPayload);
              if (callback) callback(errPayload);
              return;
            }

            socket.data = {
              deviceId: devicePayload.deviceId,
              userId: devicePayload.userId,
              role: 'device',
              authenticated: true,
            };

            await initializeDeviceSession(devicePayload.deviceId, devicePayload.userId);

            const successPayload = {
              success: true,
              deviceId: devicePayload.deviceId,
              userId: devicePayload.userId,
            };
            socket.emit('device:authenticated', successPayload);
            if (callback) callback(successPayload);
            return;
          }
        } catch (_) {}

        // Try user access token (dashboard)
        try {
          const userPayload = verifyAccessToken(data.token);
          if (userPayload && userPayload.userId) {
            const user = await prisma.user.findUnique({
              where: { id: userPayload.userId },
            });

            if (!user) {
              const errPayload = { error: 'User not found', message: 'User not found' };
              socket.emit('device:error', errPayload);
              if (callback) callback(errPayload);
              return;
            }

            socket.data = {
              userId: userPayload.userId,
              role: 'dashboard',
              authenticated: true,
            };
            socket.join(`user:${userPayload.userId}`);

            const successPayload = { success: true, userId: userPayload.userId };
            socket.emit('dashboard:authenticated', successPayload);
            if (callback) callback(successPayload);
            return;
          }
        } catch (_) {}

        const errPayload = {
          error: 'Invalid or expired authentication token',
          message: 'Authentication failed',
        };
        socket.emit('device:error', errPayload);
        if (callback) callback(errPayload);
      } catch (err: any) {
        const errPayload = {
          error: err?.message || 'Authentication error',
          message: 'Authentication error',
        };
        socket.emit('device:error', errPayload);
        if (callback) callback(errPayload);
      }
    });

    /**
     * Helper to validate that socket is an authenticated device and verify ownership.
     */
    const requireDeviceAuth = (payloadDeviceId?: string): { deviceId: string; userId: string } | null => {
      if (!socket.data.authenticated || socket.data.role !== 'device' || !socket.data.deviceId || !socket.data.userId) {
        socket.emit('device:error', {
          error: 'Unauthorized: Socket is not authenticated as a device',
          message: 'Authentication required',
        });
        return null;
      }

      const { deviceId, userId } = socket.data;

      // Ownership integrity: client cannot impersonate another device
      if (payloadDeviceId && payloadDeviceId !== deviceId) {
        socket.emit('device:error', {
          error: 'Unauthorized: Device ID mismatch. Cannot send telemetry for another device.',
          message: 'Device ownership validation failed',
        });
        return null;
      }

      return { deviceId, userId };
    };

    // ── Android -> Backend: device:heartbeat ─────────────────────────────────
    socket.on('device:heartbeat', async (data?: { deviceId?: string; timestamp?: string | number }, callback?: (res: any) => void) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      const { deviceId, userId } = auth;
      const now = new Date();

      await prisma.device.update({
        where: { id: deviceId },
        data: {
          isOnline: true,
          status: 'ONLINE',
          lastSeen: now,
          lastSeenAt: now,
        },
      }).catch(() => {});

      const onlinePayload = {
        deviceId,
        status: 'ONLINE',
        isOnline: true,
        lastSeen: now.toISOString(),
      };

      // Backend -> Dashboard: device:online
      io.to(`user:${userId}`).emit('device:online', onlinePayload);

      const ack = { success: true, timestamp: now.toISOString() };
      socket.emit('device:heartbeat:ack', ack);
      if (callback) callback(ack);
    });

    // ── Android -> Backend: device:battery ───────────────────────────────────
    socket.on('device:battery', async (data: {
      deviceId?: string;
      percentage: number;
      charging: boolean;
      temperature?: number;
      voltage?: number;
      timestamp?: string | number;
    }, callback?: (res: any) => void) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      const { deviceId, userId } = auth;

      // ── Validation ──
      const rawPct = Number(data?.percentage);
      if (!Number.isFinite(rawPct) || isNaN(rawPct)) {
        if (callback) callback({ error: 'Invalid battery percentage' });
        return;
      }
      const percentage = Math.max(0, Math.min(100, Math.round(rawPct)));
      const charging = Boolean(data?.charging);

      let temperature: number | undefined = undefined;
      if (data?.temperature !== undefined && data?.temperature !== null) {
        const rawTemp = Number(data.temperature);
        if (Number.isFinite(rawTemp)) {
          temperature = Math.round(rawTemp * 10) / 10;
        }
      }

      let voltage: number | undefined = undefined;
      if (data?.voltage !== undefined && data?.voltage !== null) {
        const rawVolt = Number(data.voltage);
        if (Number.isFinite(rawVolt) && rawVolt >= 0) {
          voltage = Math.round(rawVolt);
        }
      }

      const now = new Date();
      const timestampIso = parseSafeISOString(data?.timestamp);
      const recordDate = new Date(timestampIso);

      // Update current device live state
      await prisma.device.update({
        where: { id: deviceId },
        data: {
          isOnline: true,
          status: 'ONLINE',
          lastSeen: now,
          lastSeenAt: now,
          batteryLevel: percentage,
          battery: percentage,
          charging,
          temperature: temperature ?? 0,
          voltage: voltage ?? 0,
        } as any,
      }).catch(() => {});

      // Store historical battery reading
      await (prisma as any).batteryStatus?.create({
        data: {
          deviceId,
          percentage,
          charging,
          temperature: temperature ?? 0,
          voltage: voltage ?? 0,
          timestamp: recordDate,
        },
      }).catch(() => {});

      const batteryPayload = {
        deviceId,
        percentage,
        charging,
        temperature,
        voltage,
        timestamp: timestampIso,
      };

      // Backend -> Dashboard: device:battery
      io.to(`user:${userId}`).emit('device:battery', batteryPayload);
      socket.broadcast.emit('device:battery', batteryPayload);

      // Telemetry compatibility:
      const telemetryPayload = {
        deviceId,
        battery: batteryPayload.percentage,
        charging: batteryPayload.charging,
        temperature: batteryPayload.temperature,
        voltage: batteryPayload.voltage,
        timestamp: batteryPayload.timestamp,
      };
      io.to(`user:${userId}`).emit('device:telemetry', telemetryPayload);
      socket.broadcast.emit('device:telemetry', telemetryPayload);

      if (callback) callback({ success: true, reading: batteryPayload });
    });

    // ── Android -> Backend: device:storage ───────────────────────────────────
    socket.on('device:storage', async (data: {
      deviceId?: string;
      totalBytes?: number | string;
      usedBytes?: number | string;
      availableBytes?: number | string;
      storageUsedGb?: number;
      storageTotalGb?: number;
      timestamp?: string | number;
    }, callback?: (res: any) => void) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      const { deviceId, userId } = auth;

      // ── Validation ──
      const parseBytes = (v: any): number | undefined => {
        if (v === undefined || v === null) return undefined;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };

      const totalBytes = parseBytes(data?.totalBytes);
      const usedBytes = parseBytes(data?.usedBytes);
      const availableBytes = parseBytes(data?.availableBytes);

      const now = new Date();
      const timestampIso = parseSafeISOString(data?.timestamp);
      const recordDate = new Date(timestampIso);

      await prisma.device.update({
        where: { id: deviceId },
        data: {
          isOnline: true,
          status: 'ONLINE',
          lastSeen: now,
          lastSeenAt: now,
        },
      }).catch(() => {});

      const usedGb = data?.storageUsedGb !== undefined
        ? Math.max(0, Number(data.storageUsedGb))
        : (usedBytes !== undefined ? usedBytes / (1024 * 1024 * 1024) : 0);
      const totalGb = data?.storageTotalGb !== undefined
        ? Math.max(0, Number(data.storageTotalGb))
        : (totalBytes !== undefined ? totalBytes / (1024 * 1024 * 1024) : 0);
      const availableGb = availableBytes !== undefined
        ? availableBytes / (1024 * 1024 * 1024)
        : Math.max(0, totalGb - usedGb);

      // Store historical storage reading if bytes provided
      if (totalBytes !== undefined || usedBytes !== undefined || availableBytes !== undefined) {
        await (prisma as any).storageStatus?.create({
          data: {
            deviceId,
            totalBytes: totalBytes ?? Math.round(totalGb * 1024 * 1024 * 1024),
            usedBytes: usedBytes ?? Math.round(usedGb * 1024 * 1024 * 1024),
            availableBytes: availableBytes ?? Math.round(availableGb * 1024 * 1024 * 1024),
            timestamp: recordDate,
          },
        }).catch(() => {});
      }

      const storagePayload = {
        deviceId,
        totalBytes,
        usedBytes,
        availableBytes,
        storageUsedGb: Math.round(usedGb * 100) / 100,
        storageTotalGb: Math.round(totalGb * 100) / 100,
        storageFreeGb: Math.round(availableGb * 100) / 100,
        timestamp: timestampIso,
      };

      // Backend -> Dashboard: device:storage
      io.to(`user:${userId}`).emit('device:storage', storagePayload);

      // Telemetry compatibility:
      io.to(`user:${userId}`).emit('device:telemetry', {
        deviceId,
        storageUsedGb: storagePayload.storageUsedGb,
        storageTotalGb: storagePayload.storageTotalGb,
        storageFreeGb: storagePayload.storageFreeGb,
        timestamp: storagePayload.timestamp,
      });

      if (callback) callback({ success: true, reading: storagePayload });
    });

    // ── Android -> Backend: device:disconnect ────────────────────────────────
    socket.on('device:disconnect', async (data?: { deviceId?: string; reason?: string }, callback?: (res: any) => void) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      const { deviceId, userId } = auth;
      const now = new Date();

      if (activeDeviceSockets.get(deviceId)?.id === socket.id) {
        activeDeviceSockets.delete(deviceId);
      }

      await prisma.device.update({
        where: { id: deviceId },
        data: {
          isOnline: false,
          status: 'OFFLINE',
          lastSeen: now,
          lastSeenAt: now,
        },
      }).catch(() => {});

      const offlinePayload = {
        deviceId,
        status: 'OFFLINE',
        isOnline: false,
        lastSeen: now.toISOString(),
        reason: data?.reason || 'DEVICE_DISCONNECTED',
      };

      // Backend -> Dashboard: device:offline
      io.to(`user:${userId}`).emit('device:offline', offlinePayload);
      io.to(`user:${userId}`).emit('device:status', {
        deviceId,
        status: 'OFFLINE',
        lastSeenAt: now.toISOString(),
      });

      if (callback) callback({ success: true });
      socket.disconnect(true);
    });

    // ── Unified Telemetry Event (Backwards Compatibility) ────────────────────
    socket.on('device:telemetry', async (data: {
      deviceId?: string;
      battery?: number;
      charging?: boolean;
      storageUsedGb?: number;
      storageTotalGb?: number;
      timestamp?: string;
    }) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) return;

      const { deviceId, userId } = auth;
      const now = new Date();

      await prisma.device.update({
        where: { id: deviceId },
        data: {
          isOnline: true,
          status: 'ONLINE',
          lastSeen: now,
          lastSeenAt: now,
          ...(data.battery !== undefined ? { batteryLevel: data.battery, battery: data.battery } : {}),
          ...(data.charging !== undefined ? { charging: Boolean(data.charging) } : {}),
        } as any,
      }).catch(() => {});

      if (data.battery !== undefined) {
        const batPayload = {
          deviceId,
          percentage: data.battery,
          charging: data.charging ?? false,
          timestamp: parseSafeISOString(data.timestamp),
        };
        io.to(`user:${userId}`).emit('device:battery', batPayload);
        socket.broadcast.emit('device:battery', batPayload);

        await (prisma as any).batteryStatus?.create({
          data: {
            deviceId,
            percentage: data.battery,
            charging: Boolean(data.charging),
            temperature: 0,
            voltage: 0,
            timestamp: new Date(),
          }
        }).catch(() => {});
      }

      if (data.storageUsedGb !== undefined) {
        const storPayload = {
          deviceId,
          storageUsedGb: data.storageUsedGb,
          storageTotalGb: data.storageTotalGb ?? 0,
          timestamp: parseSafeISOString(data.timestamp),
        };
        io.to(`user:${userId}`).emit('device:storage', storPayload);
        socket.broadcast.emit('device:storage', storPayload);
      }

      io.to(`user:${userId}`).emit('device:telemetry', {
        deviceId,
        ...data,
      });
      socket.broadcast.emit('device:telemetry', {
        deviceId,
        ...data,
      });
    });

    // ── Screen Streaming & Mirroring ─────────────────────────────────────────
    socket.on('screen:start', (data: { deviceId: string }) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard') return;
      io.to(`device:${data.deviceId}`).emit('screen:start', { deviceId: data.deviceId });
      const devSocket = activeDeviceSockets.get(data.deviceId);
      if (devSocket) {
        devSocket.emit('screen:start', { deviceId: data.deviceId });
      }
    });

    socket.on('screen:frame', (data: {
      deviceId?: string;
      image: string;
      width?: number;
      height?: number;
      timestamp?: string | number;
    }) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) return;
      const { deviceId, userId } = auth;
      const frameData = {
        deviceId,
        image: data.image,
        width: data.width,
        height: data.height,
        timestamp: data.timestamp || Date.now(),
      };
      io.to(`user:${userId}`).emit('screen:frame', frameData);
      socket.broadcast.emit('screen:frame', frameData);
    });

    // ── WebRTC Signaling ─────────────────────────────────────────────────────
    socket.on('screen:offer', (data: { targetUserId: string; sdp: Record<string, unknown> }) => {
      if (!socket.data.authenticated) return;
      const deviceId = socket.data.deviceId;
      io.to(`user:${data.targetUserId}`).emit('screen:offer', {
        deviceId,
        sdp: data.sdp,
      });
    });

    socket.on('screen:ice', (data: { targetUserId?: string; deviceId?: string; candidate: Record<string, unknown> }) => {
      if (!socket.data.authenticated) return;
      if (socket.data.role === 'device' && data.targetUserId) {
        io.to(`user:${data.targetUserId}`).emit('screen:ice', {
          deviceId: socket.data.deviceId,
          candidate: data.candidate,
        });
      } else if (socket.data.role === 'dashboard' && data.deviceId) {
        io.to(`device:${data.deviceId}`).emit('screen:ice', {
          candidate: data.candidate,
        });
      }
    });

    socket.on('screen:answer', (data: { deviceId: string; sdp: Record<string, unknown> }) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard') return;
      io.to(`device:${data.deviceId}`).emit('screen:answer', {
        sdp: data.sdp,
      });
    });

    socket.on('screen:stop', (data?: { deviceId?: string }) => {
      if (!socket.data.authenticated) return;
      if (socket.data.role === 'dashboard' && data?.deviceId) {
        io.to(`device:${data.deviceId}`).emit('screen:stop', {});
        const devSocket = activeDeviceSockets.get(data.deviceId);
        if (devSocket) devSocket.emit('screen:stop', {});
      } else if (socket.data.role === 'device' && socket.data.userId) {
        io.to(`user:${socket.data.userId}`).emit('screen:stopped', { deviceId: socket.data.deviceId });
      }
    });

    // ── Remote Files & Photos ────────────────────────────────────────────────
    socket.on('files:list', (data: { deviceId: string; path?: string; filter?: 'all' | 'photos' | 'downloads' | 'documents' }) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard') return;
      io.to(`device:${data.deviceId}`).emit('files:list', data);
      const devSocket = activeDeviceSockets.get(data.deviceId);
      if (devSocket) devSocket.emit('files:list', data);
    });

    socket.on('files:list:response', (data: {
      deviceId?: string;
      path: string;
      files: Array<{
        name: string;
        path: string;
        size: number;
        isDirectory: boolean;
        lastModified: number;
        mimeType?: string;
        thumbnail?: string;
      }>;
      error?: string;
    }) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) return;
      io.to(`user:${auth.userId}`).emit('files:list:response', {
        ...data,
        deviceId: auth.deviceId,
      });
    });

    socket.on('files:get', (data: { deviceId: string; path: string; thumbnailOnly?: boolean }) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard') return;
      io.to(`device:${data.deviceId}`).emit('files:get', data);
      const devSocket = activeDeviceSockets.get(data.deviceId);
      if (devSocket) devSocket.emit('files:get', data);
    });

    socket.on('files:get:response', (data: {
      deviceId?: string;
      path: string;
      name: string;
      size: number;
      mimeType?: string;
      dataUrl?: string;
      error?: string;
    }) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) return;
      io.to(`user:${auth.userId}`).emit('files:get:response', {
        ...data,
        deviceId: auth.deviceId,
      });
    });

    // ── Remote Apps Management & Launcher ────────────────────────────────────
    socket.on('apps:list', (data: { deviceId: string }) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard') return;
      io.to(`device:${data.deviceId}`).emit('apps:list', data);
      const devSocket = activeDeviceSockets.get(data.deviceId);
      if (devSocket) devSocket.emit('apps:list', data);
    });

    socket.on('apps:list:response', (data: {
      deviceId?: string;
      apps: Array<{
        name: string;
        packageName: string;
        versionName?: string;
        versionCode?: number;
        icon?: string; // base64 PNG
        isSystemApp?: boolean;
      }>;
      error?: string;
    }) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) return;
      io.to(`user:${auth.userId}`).emit('apps:list:response', {
        ...data,
        deviceId: auth.deviceId,
      });
    });

    socket.on('apps:launch', (data: { deviceId: string; packageName: string }) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard') return;
      io.to(`device:${data.deviceId}`).emit('apps:launch', data);
      const devSocket = activeDeviceSockets.get(data.deviceId);
      if (devSocket) devSocket.emit('apps:launch', data);
    });

    socket.on('apps:launch:response', (data: {
      deviceId?: string;
      packageName: string;
      success: boolean;
      error?: string;
    }) => {
      const auth = requireDeviceAuth(data?.deviceId);
      if (!auth) return;
      io.to(`user:${auth.userId}`).emit('apps:launch:response', {
        ...data,
        deviceId: auth.deviceId,
      });
    });

    // ── Remote Control: Dashboard -> Device touch/key/text injection ──────────
    // Dashboard sends remote:input; backend verifies ownership and forwards to device.
    socket.on('remote:input', async (data: {
      deviceId: string;
      type: 'click' | 'longpress' | 'swipe' | 'key' | 'text';
      // click / longpress
      x?: number;
      y?: number;
      // swipe
      x1?: number;
      y1?: number;
      x2?: number;
      y2?: number;
      durationMs?: number;
      // key
      key?: string;
      // text
      text?: string;
    }, callback?: (res: any) => void) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard' || !socket.data.userId) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      const { deviceId } = data;
      if (!deviceId) {
        if (callback) callback({ error: 'deviceId is required' });
        return;
      }

      // Verify device ownership — dashboard user must own this device
      const device = await prisma.device.findUnique({ where: { id: deviceId } }).catch(() => null);
      if (!device || device.userId !== socket.data.userId) {
        if (callback) callback({ error: 'Device not found or not authorized' });
        return;
      }

      // Forward remote:input directly to the active device socket
      const devSocket = activeDeviceSockets.get(deviceId);
      if (devSocket) {
        devSocket.emit('remote:input', data);
        if (callback) callback({ success: true });
      } else {
        if (callback) callback({ error: 'Device not currently connected' });
      }
    });



    // ── Socket Disconnect Clean up ───────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      if (socket.data.role === 'device' && socket.data.deviceId && socket.data.userId) {
        const deviceId = socket.data.deviceId;
        const userId = socket.data.userId;

        // Only act if this is the active socket for the device
        if (activeDeviceSockets.get(deviceId)?.id !== socket.id) return;

        activeDeviceSockets.delete(deviceId);

        // Use grace period: Android service restarts quickly (START_STICKY),
        // so wait 15s before declaring the device offline.
        // If a reconnect arrives within the grace period, the timer is cancelled.
        const timer = setTimeout(async () => {
          offlineTimers.delete(deviceId);

          // Double-check device hasn't reconnected during grace period
          if (activeDeviceSockets.has(deviceId)) return;

          const now = new Date();
          await prisma.device.update({
            where: { id: deviceId },
            data: {
              isOnline: false,
              status: 'OFFLINE',
              lastSeen: now,
              lastSeenAt: now,
            },
          }).catch(() => {});

          const offlinePayload = {
            deviceId,
            status: 'OFFLINE',
            isOnline: false,
            lastSeen: now.toISOString(),
            reason,
          };

          io.to(`user:${userId}`).emit('device:offline', offlinePayload);
          io.to(`user:${userId}`).emit('device:status', {
            deviceId,
            status: 'OFFLINE',
            lastSeenAt: now.toISOString(),
          });
        }, getOfflineGraceMs());

        offlineTimers.set(deviceId, timer);
      }
    });

    // ── Dashboard -> Backend: device:force-disconnect ─────────────────────────
    // Allows the website user to remotely disconnect a device.
    socket.on('device:force-disconnect', async (data: { deviceId: string }, callback?: (res: any) => void) => {
      if (!socket.data.authenticated || socket.data.role !== 'dashboard' || !socket.data.userId) {
        if (callback) callback({ error: 'Unauthorized' });
        return;
      }

      const { deviceId } = data;
      if (!deviceId) {
        if (callback) callback({ error: 'deviceId is required' });
        return;
      }

      // Verify the device belongs to this user
      const device = await prisma.device.findUnique({ where: { id: deviceId } }).catch(() => null);
      if (!device || device.userId !== socket.data.userId) {
        if (callback) callback({ error: 'Device not found or not authorized' });
        return;
      }

      // Cancel any grace timer
      const existingTimer = offlineTimers.get(deviceId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        offlineTimers.delete(deviceId);
      }

      // Kick the device socket if it's connected
      const deviceSocket = activeDeviceSockets.get(deviceId);
      if (deviceSocket) {
        deviceSocket.emit('device:kicked', {
          reason: 'FORCE_DISCONNECTED_BY_USER',
          message: 'Disconnected by dashboard user',
        });
        deviceSocket.disconnect(true);
        activeDeviceSockets.delete(deviceId);
      }

      const now = new Date();
      await prisma.device.update({
        where: { id: deviceId },
        data: { isOnline: false, status: 'OFFLINE', lastSeen: now, lastSeenAt: now },
      }).catch(() => {});

      io.to(`user:${socket.data.userId}`).emit('device:offline', {
        deviceId,
        status: 'OFFLINE',
        isOnline: false,
        lastSeen: now.toISOString(),
        reason: 'FORCE_DISCONNECTED_BY_USER',
      });

      if (callback) callback({ success: true });
    });
  });
}

export function getActiveDeviceSockets(): Map<string, Socket> {
  return activeDeviceSockets;
}
