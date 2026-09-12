import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { DeviceAuthenticatedRequest } from '../middleware/deviceAuth.middleware';
import {
  generatePairingCode,
  verifyAndPairDevice,
  disconnectDevice
} from '../services/pairing.service';
import { prisma } from '../services/prisma.service';

/**
 * Generate a new secure pairing code for the authenticated user
 */
export const handleGeneratePairingCode = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await generatePairingCode(userId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Verify pairing code submitted by Android app and register device
 */
export const handlePairDevice = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { pairingCode, deviceName, deviceIdentifier, manufacturer, model, androidVersion, appVersion } = req.body;

    if (!pairingCode) {
      res.status(400).json({ error: 'Pairing code is required' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    const result = await verifyAndPairDevice(
      pairingCode,
      {
        deviceName,
        deviceIdentifier,
        manufacturer,
        model,
        androidVersion,
        appVersion
      },
      clientIp
    );

    res.status(200).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
};

/**
 * List all devices owned by the authenticated user
 */
export const handleGetDevices = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const devices = await prisma.device.findMany({
      where: { userId },
      include: {
        batteryStatus: {
          orderBy: { timestamp: 'desc' },
          take: 1
        },
        storageStatus: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const enrichedDevices = devices.map(d => {
      const latestBattery = (d as any).batteryStatus?.[0];
      const latestStorage = (d as any).storageStatus?.[0];
      const batteryPct = latestBattery !== undefined && latestBattery !== null
        ? latestBattery.percentage
        : ((d as any).batteryLevel !== undefined && (d as any).batteryLevel !== null ? (d as any).batteryLevel : ((d as any).battery ?? null));
      const isCharging = Boolean(latestBattery?.charging ?? (d as any).charging ?? false);
      const batteryTemp = latestBattery?.temperature ?? (d as any).temperature ?? undefined;
      const batteryVolt = latestBattery?.voltage ?? (d as any).voltage ?? undefined;

      let storageUsed = 0;
      let storageTotal = 128;
      if (latestStorage) {
        try {
          storageUsed = Number(latestStorage.usedBytes) / (1024 * 1024 * 1024);
          storageTotal = Number(latestStorage.totalBytes) / (1024 * 1024 * 1024);
        } catch (_) {}
      }

      const { batteryStatus, storageStatus, ...cleanDevice } = d as any;
      return {
        ...cleanDevice,
        batteryLevel: batteryPct,
        battery: batteryPct,
        charging: isCharging,
        temperature: batteryTemp,
        voltage: batteryVolt,
        storageUsedGb: parseFloat(storageUsed.toFixed(1)),
        storageTotalGb: parseFloat(storageTotal.toFixed(1))
      };
    });

    res.status(200).json({ devices: enrichedDevices });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single device details (authorized: user must own device)
 */
export const handleGetDeviceById = async (
  req: DeviceAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({ device: req.device });
  } catch (error) {
    next(error);
  }
};

/**
 * Disconnect a device (authorized: user must own device)
 */
export const handleDisconnectDevice = async (
  req: DeviceAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const deviceId = req.params.deviceId;
    const updated = await disconnectDevice(userId, deviceId, 'DASHBOARD_DISCONNECT');
    res.status(200).json({ message: 'Device disconnected successfully', device: updated });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
};

/**
 * Delete / unregister a device
 */
export const handleDeleteDevice = async (
  req: DeviceAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const deviceId = req.params.deviceId;
    await disconnectDevice(userId, deviceId, 'DEVICE_UNREGISTERED');
    await prisma.device.delete({ where: { id: deviceId } });
    res.status(200).json({ message: 'Device removed successfully' });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
};

/**
 * Retrieve audit logs for the authenticated user
 */
export const handleGetAuditLogs = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const allLogs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100
    });
    // Filter to user-owned logs and system/anonymous security events (such as failed pairing attempts)
    const logs = allLogs.filter(l => l.userId === userId || l.userId === null);
    res.status(200).json({ logs });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve historical battery readings for a device
 */
export const handleGetBatteryHistory = async (
  req: DeviceAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deviceId = req.params.deviceId;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const history = await (prisma as any).batteryStatus?.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    }) || [];
    res.status(200).json({ deviceId, history: history.reverse() });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve historical storage readings for a device
 */
export const handleGetStorageHistory = async (
  req: DeviceAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deviceId = req.params.deviceId;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const history = await (prisma as any).storageStatus?.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    }) || [];
    res.status(200).json({ deviceId, history: history.reverse() });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve fleet-wide telemetry summary
 */
export const handleGetFleetTelemetry = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const devices = await prisma.device.findMany({ where: { userId } });
    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.isOnline || d.status === 'ONLINE').length;
    const offlineDevices = totalDevices - onlineDevices;

    // Aggregate recent battery readings across all user's devices
    const deviceIds = devices.map(d => d.id);
    let allBatteryReadings: any[] = [];
    for (const devId of deviceIds) {
      const readings = await (prisma as any).batteryStatus?.findMany({
        where: { deviceId: devId },
        orderBy: { timestamp: 'desc' },
        take: 30,
      }) || [];
      allBatteryReadings.push(...readings);
    }
    allBatteryReadings.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));

    res.status(200).json({
      totalDevices,
      onlineDevices,
      offlineDevices,
      batteryHistory: allBatteryReadings,
      devices,
    });
  } catch (error) {
    next(error);
  }
};
