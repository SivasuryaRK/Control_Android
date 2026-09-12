/**
 * In-Memory Data Store
 * Replaces Prisma/PostgreSQL so the app works without a database.
 * Data is persisted to a JSON file on disk so it survives restarts.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_FILE = path.join(__dirname, '../../data/db.json');

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  user?: User;
}

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  deviceIdentifier: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  appVersion: string;
  status: 'ONLINE' | 'OFFLINE' | 'DISCONNECTED';
  isOnline: boolean;
  lastSeen: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PairingCode {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  createdAt: Date;
}

export interface BatteryStatus {
  id: string;
  deviceId: string;
  percentage: number;
  charging: boolean;
  temperature: number;
  voltage: number;
  timestamp: Date;
}

export interface StorageStatus {
  id: string;
  deviceId: string;
  totalBytes: bigint | number;
  usedBytes: bigint | number;
  availableBytes: bigint | number;
  timestamp: Date;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  deviceId: string | null;
  action: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

interface DbShape {
  users: User[];
  refreshTokens: RefreshToken[];
  auditLogs: AuditLog[];
  devices: Device[];
  pairingCodes: PairingCode[];
  batteryStatus: BatteryStatus[];
  storageStatus: StorageStatus[];
}

// ── Load or initialise DB ──────────────────────────────────────────
function loadDb(): DbShape {
  let loaded: DbShape = { users: [], refreshTokens: [], auditLogs: [], devices: [], pairingCodes: [], batteryStatus: [], storageStatus: [] };
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DbShape>;
      loaded = {
        users: (parsed.users || []).map(u => ({
          ...u,
          createdAt: new Date(u.createdAt),
          updatedAt: new Date(u.updatedAt),
        })),
        refreshTokens: (parsed.refreshTokens || []).map(t => ({
          ...t,
          expiresAt: new Date(t.expiresAt),
          revokedAt: t.revokedAt ? new Date(t.revokedAt) : null,
          createdAt: new Date(t.createdAt),
        })),
        devices: (parsed.devices || []).map((d: any) => {
          const isOnline = d.isOnline !== undefined ? Boolean(d.isOnline) : d.status === 'ONLINE';
          const lastSeenDate = d.lastSeen ? new Date(d.lastSeen) : (d.lastSeenAt ? new Date(d.lastSeenAt) : new Date());
          return {
            ...d,
            status: d.status || (isOnline ? 'ONLINE' : 'OFFLINE'),
            isOnline,
            lastSeen: lastSeenDate,
            lastSeenAt: lastSeenDate,
            createdAt: new Date(d.createdAt),
            updatedAt: new Date(d.updatedAt),
          };
        }),
        pairingCodes: (parsed.pairingCodes || []).map(p => ({
          ...p,
          expiresAt: new Date(p.expiresAt),
          usedAt: p.usedAt ? new Date(p.usedAt) : null,
          createdAt: new Date(p.createdAt),
        })),
        auditLogs: (parsed.auditLogs || []).map(a => ({
          ...a,
          timestamp: new Date(a.timestamp),
        })),
        batteryStatus: (parsed.batteryStatus || []).map((b: any) => ({
          ...b,
          timestamp: new Date(b.timestamp),
        })),
        storageStatus: (parsed.storageStatus || []).map((s: any) => ({
          ...s,
          timestamp: new Date(s.timestamp),
        })),
      };
    }
  } catch {
    // ignore corrupt file
  }

  // Auto-seed default operator account if no users exist
  if (!loaded.users || loaded.users.length === 0) {
    const defaultUser: User = {
      id: '996816b9-32bb-461f-9ba4-888cb73f3611',
      email: 'admin@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$ra+Lwd/xTnW1jpsXZ8GGfA$i2Wzo4H73a0N6EhyML5npmEXNjDjr+xEa/Swzb4JcNE', // Password@123
      name: 'Admin Operator',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    loaded.users = [defaultUser];
  }

  return loaded;
}

function saveDb(): void {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch {
    // non-fatal
  }
}

const db = loadDb();
saveDb();

// ── Prisma-compatible API surface ─────────────────────────────────
export const prisma = {
  $queryRaw: async (..._args: any[]): Promise<any> => {
    return Promise.resolve([{ 1: 1 }]);
  },

  user: {
    findUnique({ where, select }: { where: { email?: string; id?: string }; select?: Record<string, boolean> }) {
      const user = db.users.find(u =>
        (where.email && u.email.toLowerCase() === where.email.toLowerCase()) ||
        (where.id    && u.id    === where.id)
      ) ?? null;
      if (!user) return Promise.resolve(null);
      if (select) {
        const result: any = {};
        for (const key of Object.keys(select)) {
          if (select[key]) result[key] = (user as any)[key];
        }
        return Promise.resolve(result);
      }
      return Promise.resolve(user);
    },

    create({ data, select }: {
      data: { email: string; passwordHash: string; name: string };
      select?: Record<string, boolean>;
    }): Promise<User> {
      const now = new Date();
      const user: User = {
        id: crypto.randomUUID(),
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        name: data.name,
        createdAt: now,
        updatedAt: now,
      };
      db.users.push(user);
      saveDb();

      if (select) {
        const result: Partial<User> = {};
        for (const key of Object.keys(select) as (keyof User)[]) {
          if (select[key]) (result as Record<string, unknown>)[key] = user[key];
        }
        return Promise.resolve(result as User);
      }
      return Promise.resolve(user);
    },

    update({ where, data }: { where: { id: string }; data: Partial<User> }): Promise<User> {
      const idx = db.users.findIndex(u => u.id === where.id);
      if (idx === -1) return Promise.reject(new Error('User not found'));
      db.users[idx] = { ...db.users[idx], ...data, updatedAt: new Date() };
      saveDb();
      return Promise.resolve(db.users[idx]);
    },
  },

  refreshToken: {
    findUnique({ where, include }: {
      where: { tokenHash?: string; id?: string };
      include?: { user?: boolean };
    }): Promise<(RefreshToken & { user?: User }) | null> {
      const token = db.refreshTokens.find(t =>
        (where.tokenHash && t.tokenHash === where.tokenHash) ||
        (where.id        && t.id        === where.id)
      ) ?? null;

      if (!token) return Promise.resolve(null);

      if (include?.user) {
        const user = db.users.find(u => u.id === token.userId);
        return Promise.resolve({ ...token, user });
      }
      return Promise.resolve(token);
    },

    create({ data }: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }): Promise<RefreshToken> {
      const token: RefreshToken = {
        id: crypto.randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      db.refreshTokens.push(token);
      saveDb();
      return Promise.resolve(token);
    },

    update({ where, data }: {
      where: { id: string };
      data: { revokedAt?: Date | null };
    }): Promise<RefreshToken> {
      const idx = db.refreshTokens.findIndex(t => t.id === where.id);
      if (idx === -1) return Promise.reject(new Error('Token not found'));
      db.refreshTokens[idx] = { ...db.refreshTokens[idx], ...data };
      saveDb();
      return Promise.resolve(db.refreshTokens[idx]);
    },

    updateMany({ where, data }: {
      where: { tokenHash?: string; revokedAt?: null };
      data: { revokedAt: Date };
    }): Promise<{ count: number }> {
      let count = 0;
      db.refreshTokens = db.refreshTokens.map(t => {
        const matchHash     = !where.tokenHash || t.tokenHash === where.tokenHash;
        const matchRevoked  = where.revokedAt === undefined || t.revokedAt === null;
        if (matchHash && matchRevoked) {
          count++;
          return { ...t, ...data };
        }
        return t;
      });
      saveDb();
      return Promise.resolve({ count });
    },

    deleteMany({ where }: { where: { expiresAt?: { lt: Date } } }): Promise<{ count: number }> {
      const before = db.refreshTokens.length;
      if (where.expiresAt?.lt) {
        db.refreshTokens = db.refreshTokens.filter(t => t.expiresAt >= where.expiresAt!.lt!);
      }
      saveDb();
      return Promise.resolve({ count: before - db.refreshTokens.length });
    },
  },

  device: {
    findUnique({ where }: { where: { id?: string } }): Promise<Device | null> {
      const device = db.devices.find(d => where.id && d.id === where.id) ?? null;
      return Promise.resolve(device);
    },

    findFirst({ where }: {
      where: { userId?: string; deviceIdentifier?: string; id?: string };
    }): Promise<Device | null> {
      const device = db.devices.find(d => {
        if (where.id && d.id !== where.id) return false;
        if (where.userId && d.userId !== where.userId) return false;
        if (where.deviceIdentifier && d.deviceIdentifier !== where.deviceIdentifier) return false;
        return true;
      }) ?? null;
      return Promise.resolve(device);
    },

    findMany({ where, orderBy, include }: {
      where?: { userId?: string; status?: string };
      orderBy?: { createdAt?: 'desc' | 'asc' };
      include?: Record<string, any>;
    } = {}): Promise<any[]> {
      let results = [...db.devices];
      if (where?.userId) results = results.filter(d => d.userId === where.userId);
      if (where?.status) results = results.filter(d => d.status === where.status);
      if (orderBy?.createdAt === 'desc') results.sort((a, b) => +b.createdAt - +a.createdAt);
      if (orderBy?.createdAt === 'asc')  results.sort((a, b) => +a.createdAt - +b.createdAt);

      if (include) {
        results = results.map(d => {
          const enriched: any = { ...d };
          if (include['batteryStatus']) {
            let batts = (db.batteryStatus || []).filter(b => b.deviceId === d.id);
            batts.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
            if (include['batteryStatus']?.take) {
              batts = batts.slice(0, include['batteryStatus'].take);
            }
            enriched.batteryStatus = batts;
          }
          if (include['storageStatus']) {
            let stor = (db.storageStatus || []).filter(s => s.deviceId === d.id);
            stor.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
            if (include['storageStatus']?.take) {
              stor = stor.slice(0, include['storageStatus'].take);
            }
            enriched.storageStatus = stor;
          }
          return enriched;
        });
      }

      return Promise.resolve(results);
    },

    create({ data }: {
      data: any;
    }): Promise<Device> {
      const now = new Date();
      const isOnline = data.isOnline !== undefined ? Boolean(data.isOnline) : (data.status === 'ONLINE');
      const status = data.status || (isOnline ? 'ONLINE' : 'OFFLINE');
      const lastSeen = data.lastSeen ? new Date(data.lastSeen) : (data.lastSeenAt ? new Date(data.lastSeenAt) : now);
      const lastSeenAt = data.lastSeenAt ? new Date(data.lastSeenAt) : lastSeen;

      const device: Device = {
        id: data.id || crypto.randomUUID(),
        userId: data.userId || '',
        deviceName: data.deviceName || '',
        deviceIdentifier: data.deviceIdentifier || '',
        manufacturer: data.manufacturer || 'Unknown',
        model: data.model || 'Generic',
        androidVersion: data.androidVersion || 'Unknown',
        appVersion: data.appVersion || '1.0.0',
        status,
        isOnline,
        lastSeen,
        lastSeenAt,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      device.isOnline = isOnline;
      device.status = status;
      device.lastSeen = lastSeen;
      device.lastSeenAt = lastSeenAt;
      db.devices.push(device);
      saveDb();
      return Promise.resolve(device);
    },

    update({ where, data }: {
      where: { id: string };
      data: Partial<Device>;
    }): Promise<Device> {
      const idx = db.devices.findIndex(d => d.id === where.id);
      if (idx === -1) return Promise.reject(new Error('Device not found'));
      const updatedData: any = { ...data };
      if (updatedData.isOnline !== undefined && updatedData.status === undefined) {
        updatedData.status = updatedData.isOnline ? 'ONLINE' : 'OFFLINE';
      }
      if (updatedData.status !== undefined && updatedData.isOnline === undefined) {
        updatedData.isOnline = updatedData.status === 'ONLINE';
      }
      if (updatedData.lastSeen && !updatedData.lastSeenAt) {
        updatedData.lastSeenAt = new Date(updatedData.lastSeen);
      }
      if (updatedData.lastSeenAt && !updatedData.lastSeen) {
        updatedData.lastSeen = new Date(updatedData.lastSeenAt);
      }
      db.devices[idx] = { ...db.devices[idx], ...updatedData, updatedAt: new Date() };
      saveDb();
      return Promise.resolve(db.devices[idx]);
    },

    delete({ where }: { where: { id: string } }): Promise<Device> {
      const idx = db.devices.findIndex(d => d.id === where.id);
      if (idx === -1) return Promise.reject(new Error('Device not found'));
      const [removed] = db.devices.splice(idx, 1);
      saveDb();
      return Promise.resolve(removed);
    },

    deleteMany({ where }: { where?: { userId?: string } } = {}): Promise<{ count: number }> {
      const before = db.devices.length;
      if (where?.userId) {
        db.devices = db.devices.filter(d => d.userId !== where.userId);
      } else {
        db.devices = [];
      }
      saveDb();
      return Promise.resolve({ count: before - db.devices.length });
    },
  },

  pairingCode: {
    findFirst({ where }: {
      where: { codeHash?: string; userId?: string; usedAt?: null };
    }): Promise<PairingCode | null> {
      const record = db.pairingCodes.find(p => {
        if (where.codeHash && p.codeHash !== where.codeHash) return false;
        if (where.userId && p.userId !== where.userId) return false;
        if (where.usedAt === null && p.usedAt !== null) return false;
        return true;
      }) ?? null;
      return Promise.resolve(record);
    },

    findMany({ where, orderBy }: {
      where?: { userId?: string };
      orderBy?: { createdAt?: 'desc' | 'asc' };
    } = {}): Promise<PairingCode[]> {
      let results = [...db.pairingCodes];
      if (where?.userId) results = results.filter(p => p.userId === where.userId);
      if (orderBy?.createdAt === 'desc') results.sort((a, b) => +b.createdAt - +a.createdAt);
      return Promise.resolve(results);
    },

    create({ data }: {
      data: { userId: string; codeHash: string; expiresAt: Date };
    }): Promise<PairingCode> {
      const record: PairingCode = {
        id: crypto.randomUUID(),
        userId: data.userId,
        codeHash: data.codeHash,
        expiresAt: data.expiresAt,
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
      };
      db.pairingCodes.push(record);
      saveDb();
      return Promise.resolve(record);
    },

    update({ where, data }: {
      where: { id: string };
      data: Partial<PairingCode>;
    }): Promise<PairingCode> {
      const idx = db.pairingCodes.findIndex(p => p.id === where.id);
      if (idx === -1) return Promise.reject(new Error('Pairing code not found'));
      db.pairingCodes[idx] = { ...db.pairingCodes[idx], ...data };
      saveDb();
      return Promise.resolve(db.pairingCodes[idx]);
    },

    updateMany({ where, data }: {
      where: { userId?: string; usedAt?: null };
      data: Partial<PairingCode>;
    }): Promise<{ count: number }> {
      let count = 0;
      db.pairingCodes = db.pairingCodes.map(p => {
        const matchUser = !where.userId || p.userId === where.userId;
        const matchUsed = where.usedAt === undefined || p.usedAt === null;
        if (matchUser && matchUsed) {
          count++;
          return { ...p, ...data };
        }
        return p;
      });
      saveDb();
      return Promise.resolve({ count });
    },

    deleteMany({ where }: { where?: { expiresAt?: { lt: Date } } } = {}): Promise<{ count: number }> {
      const before = db.pairingCodes.length;
      if (where?.expiresAt?.lt) {
        db.pairingCodes = db.pairingCodes.filter(p => p.expiresAt >= where.expiresAt!.lt!);
      } else {
        db.pairingCodes = [];
      }
      saveDb();
      return Promise.resolve({ count: before - db.pairingCodes.length });
    },
  },

  auditLog: {
    create({ data }: { data: Omit<AuditLog, 'id' | 'timestamp'> }): Promise<AuditLog> {
      const log: AuditLog = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        ...data,
      };
      db.auditLogs.push(log);
      saveDb();
      return Promise.resolve(log);
    },

    findMany({ where, orderBy, take }: {
      where?: { userId?: string };
      orderBy?: { timestamp?: 'desc' | 'asc' };
      take?: number;
    } = {}): Promise<AuditLog[]> {
      let results = [...db.auditLogs];
      if (where?.userId) results = results.filter(l => l.userId === where.userId);
      if (orderBy?.timestamp === 'desc') results.sort((a, b) => +b.timestamp - +a.timestamp);
      if (orderBy?.timestamp === 'asc')  results.sort((a, b) => +a.timestamp - +b.timestamp);
      if (take) results = results.slice(0, take);
      return Promise.resolve(results);
    },

    deleteMany(): Promise<{ count: number }> {
      const count = db.auditLogs.length;
      db.auditLogs = [];
      saveDb();
      return Promise.resolve({ count });
    }
  },

  batteryStatus: {
    create({ data }: { data: { deviceId: string; percentage: number; charging: boolean; temperature?: number; voltage?: number; timestamp?: Date } }): Promise<BatteryStatus> {
      const record: BatteryStatus = {
        id: crypto.randomUUID(),
        deviceId: data.deviceId,
        percentage: Math.round(data.percentage),
        charging: Boolean(data.charging),
        temperature: data.temperature !== undefined ? Number(data.temperature) : 0,
        voltage: data.voltage !== undefined ? Number(data.voltage) : 0,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };
      db.batteryStatus.push(record);
      // Keep reasonable max history in memory (e.g. last 1000 items per device)
      if (db.batteryStatus.length > 5000) {
        db.batteryStatus = db.batteryStatus.slice(-4000);
      }
      saveDb();
      return Promise.resolve(record);
    },

    findMany({ where, orderBy, take }: {
      where?: { deviceId?: string };
      orderBy?: { timestamp?: 'desc' | 'asc' };
      take?: number;
    } = {}): Promise<BatteryStatus[]> {
      let results = [...db.batteryStatus];
      if (where?.deviceId) results = results.filter(b => b.deviceId === where.deviceId);
      if (orderBy?.timestamp === 'desc') results.sort((a, b) => +b.timestamp - +a.timestamp);
      if (orderBy?.timestamp === 'asc')  results.sort((a, b) => +a.timestamp - +b.timestamp);
      if (take) results = results.slice(0, take);
      return Promise.resolve(results);
    },

    deleteMany({ where }: { where?: { deviceId?: string } } = {}): Promise<{ count: number }> {
      const before = db.batteryStatus.length;
      if (where?.deviceId) {
        db.batteryStatus = db.batteryStatus.filter(b => b.deviceId !== where.deviceId);
      } else {
        db.batteryStatus = [];
      }
      saveDb();
      return Promise.resolve({ count: before - db.batteryStatus.length });
    },
  },

  storageStatus: {
    create({ data }: { data: { deviceId: string; totalBytes: bigint | number | string; usedBytes: bigint | number | string; availableBytes: bigint | number | string; timestamp?: Date } }): Promise<StorageStatus> {
      const record: StorageStatus = {
        id: crypto.randomUUID(),
        deviceId: data.deviceId,
        totalBytes: typeof data.totalBytes === 'string' ? Number(data.totalBytes) : (data.totalBytes as any),
        usedBytes: typeof data.usedBytes === 'string' ? Number(data.usedBytes) : (data.usedBytes as any),
        availableBytes: typeof data.availableBytes === 'string' ? Number(data.availableBytes) : (data.availableBytes as any),
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };
      db.storageStatus.push(record);
      if (db.storageStatus.length > 5000) {
        db.storageStatus = db.storageStatus.slice(-4000);
      }
      saveDb();
      return Promise.resolve(record);
    },

    findMany({ where, orderBy, take }: {
      where?: { deviceId?: string };
      orderBy?: { timestamp?: 'desc' | 'asc' };
      take?: number;
    } = {}): Promise<StorageStatus[]> {
      let results = [...db.storageStatus];
      if (where?.deviceId) results = results.filter(s => s.deviceId === where.deviceId);
      if (orderBy?.timestamp === 'desc') results.sort((a, b) => +b.timestamp - +a.timestamp);
      if (orderBy?.timestamp === 'asc')  results.sort((a, b) => +a.timestamp - +b.timestamp);
      if (take) results = results.slice(0, take);
      return Promise.resolve(results);
    },

    deleteMany({ where }: { where?: { deviceId?: string } } = {}): Promise<{ count: number }> {
      const before = db.storageStatus.length;
      if (where?.deviceId) {
        db.storageStatus = db.storageStatus.filter(s => s.deviceId !== where.deviceId);
      } else {
        db.storageStatus = [];
      }
      saveDb();
      return Promise.resolve({ count: before - db.storageStatus.length });
    },
  },

  $disconnect(): Promise<void> {
    return Promise.resolve();
  },
};
