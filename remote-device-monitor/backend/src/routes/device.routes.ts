import { Router } from 'express';
import { authenticateRequest } from '../middleware/auth.middleware';
import { authorizeDeviceOwnership } from '../middleware/deviceAuth.middleware';
import {
  handleGeneratePairingCode,
  handlePairDevice,
  handleGetDevices,
  handleGetDeviceById,
  handleDisconnectDevice,
  handleDeleteDevice,
  handleGetAuditLogs,
  handleGetBatteryHistory,
  handleGetStorageHistory,
  handleGetFleetTelemetry
} from '../controllers/device.controller';

const router = Router();

// Pairing code endpoints
router.post('/pairing-code', authenticateRequest, handleGeneratePairingCode);
router.post('/pair', handlePairDevice);

// Audit logs
router.get('/audit-logs', authenticateRequest, handleGetAuditLogs);

// Fleet telemetry overview
router.get('/telemetry/fleet', authenticateRequest, handleGetFleetTelemetry);

// Device fleet management (scoped to authenticated user)
router.get('/', authenticateRequest, handleGetDevices);
router.get('/:deviceId', authenticateRequest, authorizeDeviceOwnership, handleGetDeviceById);
router.get('/:deviceId/battery-history', authenticateRequest, authorizeDeviceOwnership, handleGetBatteryHistory);
router.get('/:deviceId/storage-history', authenticateRequest, authorizeDeviceOwnership, handleGetStorageHistory);
router.post('/:deviceId/disconnect', authenticateRequest, authorizeDeviceOwnership, handleDisconnectDevice);
router.delete('/:deviceId', authenticateRequest, authorizeDeviceOwnership, handleDeleteDevice);

export default router;
