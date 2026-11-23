'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessageView } from '@poker/engine';
import { Avatar, cx } from '../ui';

const QUICK_EMOJIS = ['😂', '🔥', '👍', '😮', '😭', '🤔', '👏', '🍀'];

/** Fil de discussion avec saisie, émojis rapides et défilement automatique. */
export function ChatBox({ messages, onSend, compact }: { messages: ChatMessageView[]; onSend: (text: string) => Promise<void> | void; compact?: boolean }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onSend(t);
      setText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1 scroll-thin">
        {messages.length === 0 && <p className="py-6 text-center text-xs text-faint">Aucun message pour l&apos;instant. Dites bonjour !</p>}
        {messages.map((m) =>
          m.kind === 'SYSTEM' ? (
            <p key={m.id} className="text-center text-xs italic text-faint">{m.text}</p>
          ) : (
            <div key={m.id} className="flex gap-2">
              {!compact && <Avatar name={m.username ?? '?'} url={m.avatarUrl} size={26} className="mt-0.5" />}
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gold-300">{m.username}</span>
                  <span className="text-[10px] text-faint">{new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {/* Texte affiché tel quel : React échappe le HTML (aucune injection possible) */}
                <p className="break-words text-sm text-ink/90">{m.text}</p>
              </div>
            </div>
          ),
        )}
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto scroll-thin">
        {QUICK_EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => setText((t) => t + e)} className="rounded-md px-1.5 py-0.5 text-base hover:bg-white/8" aria-label={`Ajouter ${e}`}>{e}</button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Écrire un message…"
          className={cx('h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-night-950/60 px-3 text-sm outline-none focus:border-gold-400/60')}
          aria-label="Message"
        />
        <button type="submit" disabled={!text.trim() || sending} className="h-10 rounded-xl bg-gold-400 px-3 text-sm font-bold text-night-950 disabled:opacity-40" aria-label="Envoyer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </form>
    </div>
  );
}
