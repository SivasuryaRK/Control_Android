import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/prisma.service';
import { hashPassword, verifyPassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/token';
import { registerSchema, loginSchema, refreshSchema } from '../validations/auth.validation';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const REFRESH_TOKEN_DAYS = 7;

const setTokenCookie = (res: Response, name: string, value: string, maxAgeMs: number) => {
  res.cookie(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAgeMs,
  });
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email.toLowerCase() },
    });

    if (existingUser) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const passwordHash = await hashPassword(validatedData.password);

    const user = await prisma.user.create({
      data: {
        email: validatedData.email.toLowerCase(),
        passwordHash,
        name: validatedData.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    setTokenCookie(res, 'refreshToken', rawRefreshToken, REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    res.status(201).json({
      message: 'User registered successfully',
      user,
      accessToken,
      refreshToken: rawRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: validatedData.email.toLowerCase() },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials. Email or password incorrect.' });
      return;
    }

    const isValidPassword = await verifyPassword(user.passwordHash, validatedData.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials. Email or password incorrect.' });
      return;
    }

    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    setTokenCookie(res, 'refreshToken', rawRefreshToken, REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      message: 'Login successful',
      user: safeUser,
      accessToken,
      refreshToken: rawRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    refreshSchema.parse(req.body);

    const rawRefreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

    if (!rawRefreshToken) {
      res.status(401).json({ error: 'Refresh token required.' });
      return;
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken || !storedToken.user || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid, expired, or revoked refresh token.' });
      return;
    }

    // Revoke current token (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Issue new access and refresh token
    const newAccessToken = generateAccessToken({
      userId: storedToken.user.id,
      email: storedToken.user.email,
    });
    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        tokenHash: newTokenHash,
        expiresAt,
      },
    });

    setTokenCookie(res, 'refreshToken', newRawRefreshToken, REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawRefreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

    if (rawRefreshToken) {
      const tokenHash = hashRefreshToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    res.clearCookie('refreshToken');
    res.clearCookie('accessToken');

    res.status(200).json({ message: 'Successfully logged out.' });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.status(200).json({ user: req.user });
};
