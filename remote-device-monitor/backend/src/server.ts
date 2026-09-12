// Backend server for Remote Device Monitor
import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './services/prisma.service';
import authRoutes from './routes/auth.routes';
import deviceRoutes from './routes/device.routes';
import { errorHandler } from './middleware/error.middleware';
import { verifyDeviceToken, verifyAccessToken } from './utils/token';

const app = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 3000;

// ── Socket.IO ─────────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  transports: ['websocket', 'polling'],
});

import { setupSocketIO } from './services/socket.service';
setupSocketIO(io);

// ── HTTP Middleware ────────────────────────────────────────────────────────
app.use(helmet());

// Allow all origins (mobile app + web dashboard through tunnel)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Health check ──────────────────────────────────────────────────────────
const healthCheckHandler = async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'OK', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ status: 'ERROR', database: 'disconnected', error: error?.message });
  }
};

// ── Routes ────────────────────────────────────────────────────────────────
app.get('/health', healthCheckHandler);
app.get('/api/health', healthCheckHandler);
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello from Remote Device Monitor Backend! (DevicePulse)');
});

app.use(errorHandler);

import os from 'os';

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
    console.log(`Local access:   http://localhost:${port}`);
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`Network access: http://${iface.address}:${port}  ← use this on your phone`);
        }
      }
    }
  });
}

export { app, httpServer };


