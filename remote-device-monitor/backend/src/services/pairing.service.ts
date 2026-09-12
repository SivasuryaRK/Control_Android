import crypto from 'crypto';
import { prisma, Device } from './prisma.service';
import { generateDeviceToken } from '../utils/token';

const PAIRING_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_GENERATIONS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_GENERATIONS_PER_WINDOW = 20; // raised for dev/testing
const MAX_FAILED_ATTEMPTS = 10;

// In-memory tracker for failed verification attempts by IP
const failedAttemptsByIp: Map<string, { count: number; resetAt: number }> = new Map();

export interface DeviceMetadataDto {
  deviceName?: string;
  deviceIdentifier: string;
  manufacturer?: string;
  model?: string;
  androidVersion?: string;
  appVersion?: string;
}

export interface PairingCodeResult {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface PairingSuccessResult {
  message: string;
  deviceId: string;
  deviceToken: string;
  deviceName: string;
  userId: string;
}

/**
 * Hash raw pairing code string using SHA-256
 */
export const hashPairingCode = (code: string): string => {
  const normalized = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

/**
 * Generate cryptographically secure pairing code for authenticated user
 */
export const generatePairingCode = async (userId: string): Promise<PairingCodeResult> => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - MAX_GENERATIONS_WINDOW_MS);

  // 1. Rate limiting check per user
  const recentCodes = await prisma.pairingCode.findMany({
    where: { userId }
  });
  const recentCount = recentCodes.filter(c => c.createdAt >= windowStart).length;

  if (recentCount >= MAX_GENERATIONS_PER_WINDOW) {
    const error: any = new Error('Rate limit exceeded. Too many pairing codes generated. Please try again later.');
    error.statusCode = 429;
    throw error;
  }

  // 2. Cryptographically secure random 6-character code
  // Example format: 3 chars - 3 chars (e.g. 7K2-9M4)
  const bytes = crypto.randomBytes(4);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing chars like 0, O, 1, I
  let rawCode = '';
  for (let i = 0; i < 6; i++) {
    rawCode += chars[bytes[i % bytes.length] % chars.length];
  }
  const formattedCode = `${rawCode.slice(0, 3)}-${rawCode.slice(3)}`;
  const codeHash = hashPairingCode(formattedCode);
  const expiresAt = new Date(now.getTime() + PAIRING_EXPIRY_MS);

  // 3. Invalidate previous un-used pairing codes for this user
  await prisma.pairingCode.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: now }
  });

  // 4. Store ONLY hash in DB
  await prisma.pairingCode.create({
    data: {
      userId,
      codeHash,
      expiresAt,
    }
  });

  // 5. Create audit log: pairing created
  await prisma.auditLog.create({
    data: {
      userId,
      deviceId: null,
      action: 'PAIRING_CODE_CREATED',
      metadata: {
        expiresAt: expiresAt.toISOString(),
        codePrefix: formattedCode.slice(0, 3)
      }
    }
  });

  return {
    code: formattedCode,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: Math.floor(PAIRING_EXPIRY_MS / 1000)
  };
};

/**
 * Verify pairing code and register Android device with account
 */
export const verifyAndPairDevice = async (
  rawCode: string,
  deviceData: DeviceMetadataDto,
  clientIp: string = '127.0.0.1'
): Promise<PairingSuccessResult> => {
  const now = new Date();

  // Rate limiting on failed verification attempts by IP
  const attemptRecord = failedAttemptsByIp.get(clientIp);
  if (attemptRecord && attemptRecord.resetAt > Date.now()) {
    if (attemptRecord.count >= MAX_FAILED_ATTEMPTS) {
      const error: any = new Error('Too many failed pairing attempts. Please wait 15 minutes.');
      error.statusCode = 429;
      throw error;
    }
  }

  const cleanCode = rawCode ? rawCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
  if (!cleanCode || cleanCode.length < 6) {
    recordFailedAttempt(clientIp);
    await logPairingFailed(null, 'INVALID_CODE_FORMAT', deviceData, clientIp);
    const error: any = new Error('Invalid pairing code format');
    error.statusCode = 400;
    throw error;
  }

  const codeHash = hashPairingCode(cleanCode);

  // Look up pairing code record
  const pairingRecord = await prisma.pairingCode.findFirst({
    where: { codeHash, usedAt: null }
  });

  // Check existence and expiration
  if (!pairingRecord) {
    recordFailedAttempt(clientIp);
    await logPairingFailed(null, 'CODE_NOT_FOUND_OR_USED', deviceData, clientIp);
    const error: any = new Error('Invalid or already used pairing code');
    error.statusCode = 400;
    throw error;
  }

  if (pairingRecord.expiresAt < now) {
    recordFailedAttempt(clientIp);
    await logPairingFailed(pairingRecord.userId, 'CODE_EXPIRED', deviceData, clientIp);
    const error: any = new Error('Pairing code has expired. Please generate a new code.');
    error.statusCode = 400;
    throw error;
  }

  // Code is valid! Invalidate immediately (one-time use)
  await prisma.pairingCode.update({
    where: { id: pairingRecord.id },
    data: { usedAt: now }
  });

  // Reset IP rate limit on success
  failedAttemptsByIp.delete(clientIp);

  // Associate device with user
  const userId = pairingRecord.userId;
  const deviceIdentifier = deviceData.deviceIdentifier || `dev_${crypto.randomUUID()}`;

  // Find or create device
  let device = await prisma.device.findFirst({
    where: { userId, deviceIdentifier }
  });

  if (device) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: {
        deviceName: deviceData.deviceName || device.deviceName,
        manufacturer: deviceData.manufacturer || device.manufacturer,
        model: deviceData.model || device.model,
        androidVersion: deviceData.androidVersion || device.androidVersion,
        appVersion: deviceData.appVersion || device.appVersion,
        status: 'ONLINE',
        lastSeenAt: now
      }
    });
  } else {
    device = await prisma.device.create({
      data: {
        userId,
        deviceName: deviceData.deviceName || `${deviceData.manufacturer || 'Android'} ${deviceData.model || 'Device'}`.trim(),
        deviceIdentifier,
        manufacturer: deviceData.manufacturer || 'Unknown',
        model: deviceData.model || 'Generic',
        androidVersion: deviceData.androidVersion || 'Unknown',
        appVersion: deviceData.appVersion || '1.0.0',
        status: 'ONLINE',
        lastSeenAt: now
      }
    });
  }

  // Generate secure device credentials
  const deviceToken = generateDeviceToken({
    deviceId: device.id,
    userId: device.userId,
    role: 'device'
  });

  // Create audit log: pairing successful
  await prisma.auditLog.create({
    data: {
      userId: device.userId,
      deviceId: device.id,
      action: 'PAIRING_SUCCESSFUL',
      metadata: {
        deviceName: device.deviceName,
        deviceIdentifier: device.deviceIdentifier,
        manufacturer: device.manufacturer,
        model: device.model,
        ip: clientIp
      }
    }
  });

  return {
    message: 'Device paired successfully',
    deviceId: device.id,
    deviceToken,
    deviceName: device.deviceName,
    userId: device.userId
  };
};

/**
 * Disconnect/unpair a device and record audit log
 */
export const disconnectDevice = async (
  userId: string,
  deviceId: string,
  reason: string = 'USER_INITIATED'
): Promise<Device> => {
  const device = await prisma.device.findUnique({
    where: { id: deviceId }
  });

  if (!device) {
    const error: any = new Error('Device not found');
    error.statusCode = 404;
    throw error;
  }

  if (device.userId !== userId) {
    const error: any = new Error('Forbidden. Device does not belong to this account.');
    error.statusCode = 403;
    throw error;
  }

  // Update status to DISCONNECTED
  const updated = await prisma.device.update({
    where: { id: deviceId },
    data: { status: 'DISCONNECTED', lastSeenAt: new Date() }
  });

  // Create audit log: device disconnected
  await prisma.auditLog.create({
    data: {
      userId,
      deviceId,
      action: 'DEVICE_DISCONNECTED',
      metadata: {
        deviceName: device.deviceName,
        reason
      }
    }
  });

  return updated;
};

// Helper to record failed verification attempts
function recordFailedAttempt(ip: string) {
  const current = failedAttemptsByIp.get(ip);
  const now = Date.now();
  if (!current || current.resetAt <= now) {
    failedAttemptsByIp.set(ip, { count: 1, resetAt: now + MAX_GENERATIONS_WINDOW_MS });
  } else {
    current.count += 1;
  }
}

// Helper to record pairing failed audit log
async function logPairingFailed(
  userId: string | null,
  reason: string,
  deviceData: DeviceMetadataDto,
  ip: string
) {
  await prisma.auditLog.create({
    data: {
      userId,
      deviceId: null,
      action: 'PAIRING_FAILED',
      metadata: {
        reason,
        deviceIdentifier: deviceData?.deviceIdentifier || 'unknown',
        ip
      }
    }
  });
}
