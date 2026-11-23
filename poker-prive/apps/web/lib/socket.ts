'use client';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Connexion Socket.IO unique, partagée par toute l'application. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}

export interface Ack {
  ok: boolean;
  error?: string;
  code?: string;
  [k: string]: unknown;
}

export function emit<T extends Ack = Ack>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve) => {
    getSocket()
      .timeout(timeoutMs)
      .emit(event, payload, (err: Error | null, res: T) => {
        if (err) resolve({ ok: false, error: 'Le serveur ne répond pas' } as T);
        else resolve(res);
      });
  });
}
