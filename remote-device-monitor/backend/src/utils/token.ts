import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-for-dev-environment-12345';
const ACCESS_TOKEN_EXPIRATION = '15m'; // 15 minutes

export interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * Generate a short-lived JWT access token for a user.
 */
export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRATION });
};

/**
 * Verify and decode a JWT access token.
 */
export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};

/**
 * Generate a raw secure refresh token string.
 */
export const generateRefreshToken = (): string => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * Compute SHA-256 hash of a refresh token to safely store in the database.
 */
export const hashRefreshToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export interface DeviceJwtPayload {
  deviceId: string;
  userId: string;
  role: 'device';
}

/**
 * Generate a long-lived JWT credential for a paired Android device.
 */
export const generateDeviceToken = (payload: DeviceJwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '365d' });
};

/**
 * Verify and decode a device credential token.
 */
export const verifyDeviceToken = (token: string): DeviceJwtPayload => {
  return jwt.verify(token, JWT_SECRET) as DeviceJwtPayload;
};

