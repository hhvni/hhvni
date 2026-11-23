'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageView, GameView, LogLine } from '@poker/engine';
import { emit, getSocket, type Ack } from './socket';

export interface Reaction {
  id: number;
  userId: string;
  seat: number;
  emoji: string;
}

/**
 * Abonnement temps réel à une table : état filtré (fourni par le serveur),
 * journal, chat, réactions, reconnexion automatique et horloge synchronisée.
 */
export function useGame(gameId: string) {
  const [state, setState] = useState<GameView | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const clockOffset = useRef(0);

  useEffect(() => {
    const s = getSocket();
    const join = async () => {
      const r = await emit<Ack & { logs: LogLine[]; messages: ChatMessageView[] }>('game:join', { gameId });
      if (!r.ok) {
        setError(r.error ?? 'Accès impossible');
        return;
      }
      setError(null);
      setJoined(true);
      setLogs(r.logs);
      setMessages(r.messages);
    };
    const onState = (v: GameView) => {
      if (v.gameId !== gameId) return;
      clockOffset.current = v.serverTime - Date.now();
      setState(v);
    };
    const onLog = (p: { gameId: string; line: LogLine }) => p.gameId === gameId && setLogs((l) => [...l.slice(-199), p.line]);
    const onMsg = (p: { gameId: string | null; message: ChatMessageView }) => p.gameId === gameId && setMessages((m) => [...m.slice(-99), p.message]);
    const onReact = (p: { gameId: string; userId: string; seat: number; emoji: string }) => {
      if (p.gameId !== gameId) return;
      const id = Date.now() + Math.random();
      setReactions((r) => [...r, { id, userId: p.userId, seat: p.seat, emoji: p.emoji }]);
      setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2600);
    };
    const onConnect = () => {
      setConnected(true);
      void join();
    };
    const onDisconnect = () => setConnected(false);
    s.on('game:state', onState);
    s.on('game:log', onLog);
    s.on('chat:message', onMsg);
    s.on('chat:reaction', onReact);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) void join();
    return () => {
      void emit('game:leave', { gameId });
      s.off('game:state', onState);
      s.off('game:log', onLog);
      s.off('chat:message', onMsg);
      s.off('chat:reaction', onReact);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [gameId]);

  const send = useCallback((event: string, payload: Record<string, unknown> = {}) => emit(event, { gameId, ...payload }), [gameId]);
  const now = useCallback(() => Date.now() + clockOffset.current, []);

  return { state, logs, messages, reactions, connected, error, joined, send, now };
}
