import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

let _socket: Socket | null = null;

/**
 * Returns a singleton Socket.IO client authenticated with the user's access token.
 * Re-connects automatically when the token changes.
 */
export function useSocket(token: string | null): Socket | null {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        _socket = null;
      }
      return;
    }

    // Reuse existing authenticated socket
    if (socketRef.current?.connected) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
    });
    socket.on('connect_error', (err) => {
      console.error('[Socket] Error:', err.message);
    });

    socketRef.current = socket;
    _socket = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      _socket = null;
    };
  }, [token]);

  return socketRef.current;
}

/** Get the current singleton socket (for use outside hooks) */
export function getSocket(): Socket | null {
  return _socket;
}
