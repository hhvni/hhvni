'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Avatar, cx } from '../ui';

/** Élément <video> lié à un MediaStream. */
export function StreamVideo({ stream, muted, mirror, className, version }: { stream: MediaStream; muted?: boolean; mirror?: boolean; className?: string; version?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream, version]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={cx('h-full w-full object-cover', mirror && '-scale-x-100', className)} />;
}

/** Lecture audio des pairs distants (indépendante de l'affichage vidéo). */
export function StreamAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

/**
 * Vignette d'un joueur : vidéo en direct si sa caméra est active, sinon avatar.
 * Indicateurs micro coupé / caméra coupée, halo quand il parle.
 */
export function VideoTile({
  name, avatarUrl, stream, camOn, micOn, speaking, size, isLocal, version, rtcActive, link,
}: {
  link?: 'connecting' | 'direct' | 'relay' | 'failed';
  name: string;
  avatarUrl: string | null;
  stream: MediaStream | null;
  camOn: boolean;
  micOn: boolean;
  speaking: boolean;
  size: number;
  isLocal?: boolean;
  version?: number;
  rtcActive: boolean;
}) {
  const showVideo = !!stream && camOn && stream.getVideoTracks().some((t) => t.readyState === 'live');
  return (
    <div
      className={cx('relative overflow-hidden rounded-full bg-night-800 transition-shadow duration-200', speaking && 'animate-pulse-ring')}
      style={{ width: size, height: size, boxShadow: speaking ? '0 0 0 2px #3ccf8e' : undefined }}
    >
      <AnimatePresence initial={false} mode="wait">
        {showVideo ? (
          <motion.div key="v" className="h-full w-full" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <StreamVideo stream={stream!} muted mirror={isLocal} version={version} />
          </motion.div>
        ) : (
          <motion.div key="a" className="h-full w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Avatar name={name} url={avatarUrl} size={size} />
          </motion.div>
        )}
      </AnimatePresence>
      {link === 'connecting' && (camOn || micOn) && (
        <span className="absolute right-0.5 top-0.5 h-3 w-3 animate-pulse rounded-full bg-gold-400 ring-2 ring-night-900" title="Connexion vidéo en cours…" />
      )}
      {link === 'failed' && (camOn || micOn) && (
        <span className="absolute inset-x-0 bottom-0 bg-danger/90 py-0.5 text-center text-[8px] font-bold leading-tight text-white" title="La vidéo ne passe pas entre vos deux réseaux : un serveur relais (TURN) est nécessaire">
          ⚠ réseau
        </span>
      )}
      {rtcActive && (camOn || micOn) && !micOn && (
        <span className="absolute bottom-0.5 left-1/2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-danger text-white" title="Micro coupé">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M3 3l18 18M9 9v3a3 3 0 0 0 5 2.2M15 10V5a3 3 0 0 0-5.7-1.3M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11 5.7M12 19v3" /></svg>
        </span>
      )}
    </div>
  );
}
