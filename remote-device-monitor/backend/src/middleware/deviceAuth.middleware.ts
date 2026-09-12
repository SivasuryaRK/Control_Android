import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { prisma, Device } from '../services/prisma.service';

export interface DeviceAuthenticatedRequest extends AuthenticatedRequest {
  device?: Device;
}

/**
 * Middleware ensuring:
 * 1. User is authenticated.
 * 2. Device exists.
 * 3. Device strictly belongs to the authenticated user.
 * Prevents User A from accessing or modifying User B's devices.
 */
export const authorizeDeviceOwnership = async (
  req: DeviceAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const deviceId = req.params.deviceId || req.body.deviceId;
    if (!deviceId) {
      res.status(400).json({ error: 'Device ID is required' });
      return;
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId }
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Ownership check: User A -> User B prevention
    if (device.userId !== req.user.id) {
      res.status(403).json({
        error: 'Forbidden. You do not have permission to access this device.'
      });
      return;
    }

    req.device = device;
    next();
  } catch (error) {
    next(error);
  }
};
