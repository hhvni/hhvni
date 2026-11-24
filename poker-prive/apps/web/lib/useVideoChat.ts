'use client';
/**
 * Visio de table en WebRTC (maillage pair à pair) avec signalisation Socket.IO.
 *
 * - Les flux audio/vidéo vont directement de navigateur à navigateur (via
 *   TURN si nécessaire) : ils ne transitent jamais par le serveur de jeu.
 * - Rien n'est activé sans action explicite du joueur ; couper caméra/micro
 *   arrête réellement les pistes (le voyant de la caméra s'éteint).
 * - Rien n'est enregistré.
 * - Le débit vidéo s'adapte au nombre de pairs et au type d'appareil.
 * - Négociation « perfect negotiation » (W3C) pour éviter les collisions d'offres.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { emit, getSocket, type Ack } from './socket';

interface PeerState {
  socketId: string;
  userId: string;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  stream: MediaStream;
  cam: boolean;
  mic: boolean;
  senders: { audio?: RTCRtpSender; video?: RTCRtpSender };
  state: PeerLink;
}

/** État de la liaison vidéo avec un joueur (pour le diagnostic affiché). */
export type PeerLink = 'connecting' | 'direct' | 'relay' | 'failed';

export interface RemoteMedia {
  userId: string;
  stream: MediaStream;
  cam: boolean;
  mic: boolean;
  state: PeerLink;
}

const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

function maxBitrate(peers: number): number {
  const base = peers <= 1 ? 600_000 : peers <= 3 ? 350_000 : peers <= 6 ? 200_000 : 130_000;
  return isMobile() ? Math.round(base * 0.6) : base;
}

export function useVideoChat(gameId: string, enabled: boolean) {
  const peers = useRef(new Map<string, PeerState>());
  const local = useRef<MediaStream>(typeof window !== 'undefined' ? new MediaStream() : (null as unknown as MediaStream));
  const iceServers = useRef<RTCIceServer[]>([]);
  const selfId = useRef<string | null>(null);
  const [remote, setRemote] = useState<RemoteMedia[]>([]);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [localVersion, setLocalVersion] = useState(0);
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] });
  const [camId, setCamId] = useState<string | undefined>();
  const [micId, setMicId] = useState<string | undefined>();
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [hasTurn, setHasTurn] = useState(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const analysers = useRef(new Map<string, { an: AnalyserNode; src: MediaStreamAudioSourceNode; trackId: string }>());
  const camOnRef = useRef(false);
  const micOnRef = useRef(false);

  const publish = useCallback(() => {
    setRemote([...peers.current.values()].map((p) => ({ userId: p.userId, stream: p.stream, cam: p.cam, mic: p.mic, state: p.state })));
  }, []);

  /** Ajuste le débit d'envoi vidéo selon le nombre de pairs. */
  const tuneBitrates = useCallback(() => {
    const n = peers.current.size;
    for (const p of peers.current.values()) {
      for (const sender of p.pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0]!.maxBitrate = maxBitrate(n);
        params.encodings[0]!.maxFramerate = isMobile() ? 12 : 15;
        sender.setParameters(params).catch(() => undefined);
      }
    }
  }, []);

  const createPeer = useCallback((socketId: string, userId: string): PeerState => {
    const existing = peers.current.get(socketId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceServers.current, bundlePolicy: 'max-bundle' });
    const peer: PeerState = {
      socketId, userId, pc, polite: (selfId.current ?? '') < socketId, makingOffer: false, ignoreOffer: false,
      stream: new MediaStream(), cam: false, mic: false, senders: {}, state: 'connecting',
    };
    peers.current.set(socketId, peer);
    for (const track of local.current.getTracks()) peer.senders[track.kind as 'audio' | 'video'] = pc.addTrack(track, local.current);
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        void emit('rtc:signal', { to: socketId, data: { description: pc.localDescription?.toJSON() } });
      } catch {
        /* nouvelle tentative à la prochaine négociation */
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) void emit('rtc:signal', { to: socketId, data: { candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => {
      // Nouveau MediaStream à chaque piste : l'élément <video> est rebranché
      // (certains navigateurs, dont Firefox, n'affichent pas une piste ajoutée après coup)
      const tracks = peer.stream.getTracks().filter((t) => t.kind !== e.track.kind && t.readyState === 'live');
      peer.stream = new MediaStream([...tracks, e.track]);
      e.track.onended = () => {
        peer.stream = new MediaStream(peer.stream.getTracks().filter((t) => t !== e.track));
        publish();
      };
      e.track.onunmute = () => publish();
      publish();
    };
    let restarts = 0;
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        // Liaison directe ou via un serveur relais (TURN) ?
        void pc.getStats().then((stats) => {
          let relay = false;
          stats.forEach((r) => {
            if (r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') {
              const local = stats.get(r.localCandidateId);
              if (local?.candidateType === 'relay') relay = true;
            }
          });
          peer.state = relay ? 'relay' : 'direct';
          publish();
        });
      } else if (st === 'failed') {
        peer.state = 'failed';
        publish();
        if (restarts++ < 2) pc.restartIce();
      } else if (st === 'connecting' || st === 'new') {
        if (peer.state !== 'failed') peer.state = 'connecting';
        publish();
      }
    };
    publish();
    tuneBitrates();
    return peer;
  }, [publish, tuneBitrates]);

  const closePeer = useCallback((socketId: string) => {
    const p = peers.current.get(socketId);
    if (!p) return;
    p.pc.close();
    peers.current.delete(socketId);
    publish();
    tuneBitrates();
  }, [publish, tuneBitrates]);

  // Connexion à la salle vidéo de la table
  useEffect(() => {
    if (!enabled || typeof RTCPeerConnection === 'undefined') return;
    const s = getSocket();
    let cancelled = false;
    const join = async () => {
      try {
        const ice = await api<{ iceServers: RTCIceServer[] }>(`/games/${gameId}/ice`);
        iceServers.current = ice.iceServers;
        setHasTurn(ice.iceServers.some((s) => !!s.credential));
      } catch {
        iceServers.current = [];
      }
      const r = await emit<Ack & { peers: { socketId: string; userId: string }[]; selfId: string }>('rtc:join', { gameId });
      if (!r.ok || cancelled) return;
      selfId.current = r.selfId;
      for (const p of peers.current.keys()) closePeer(p);
      for (const p of r.peers) createPeer(p.socketId, p.userId);
      void emit('rtc:media', { cam: camOnRef.current, mic: micOnRef.current });
    };
    const onJoined = (p: { socketId: string; userId: string }) => {
      createPeer(p.socketId, p.userId);
      void emit('rtc:media', { cam: camOnRef.current, mic: micOnRef.current });
    };
    const onLeft = (p: { socketId: string }) => closePeer(p.socketId);
    const onMedia = (p: { socketId: string; cam: boolean; mic: boolean }) => {
      const peer = peers.current.get(p.socketId);
      if (peer) {
        peer.cam = p.cam;
        peer.mic = p.mic;
        publish();
      }
    };
    const onSignal = async (msg: { from: string; userId: string; data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      const peer = peers.current.get(msg.from) ?? createPeer(msg.from, msg.userId);
      const { pc } = peer;
      try {
        if (msg.data.description) {
          const desc = msg.data.description;
          const collision = desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          await pc.setRemoteDescription(desc);
          if (desc.type === 'offer') {
            await pc.setLocalDescription();
            void emit('rtc:signal', { to: msg.from, data: { description: pc.localDescription?.toJSON() } });
          }
        } else if (msg.data.candidate) {
          try {
            await pc.addIceCandidate(msg.data.candidate);
          } catch (e) {
            if (!peer.ignoreOffer) throw e;
          }
        }
      } catch {
        /* signal invalide ignoré */
      }
    };
    s.on('rtc:peer-joined', onJoined);
    s.on('rtc:peer-left', onLeft);
    s.on('rtc:media', onMedia);
    s.on('rtc:signal', onSignal);
    s.on('connect', join);
    if (s.connected) void join();
    return () => {
      cancelled = true;
      s.off('rtc:peer-joined', onJoined);
      s.off('rtc:peer-left', onLeft);
      s.off('rtc:media', onMedia);
      s.off('rtc:signal', onSignal);
      s.off('connect', join);
      void emit('rtc:leave', {});
      for (const id of [...peers.current.keys()]) closePeer(id);
    };
  }, [enabled, gameId, createPeer, closePeer, publish]);

  /** Remplace (ou ajoute) la piste locale d'un type donné sur toutes les connexions. */
  const setLocalTrack = useCallback((kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
    for (const old of local.current.getTracks().filter((t) => t.kind === kind)) {
      old.stop(); // libère réellement le périphérique
      local.current.removeTrack(old);
    }
    if (track) local.current.addTrack(track);
    for (const p of peers.current.values()) {
      const sender = p.senders[kind];
      if (sender) void sender.replaceTrack(track);
      else if (track) p.senders[kind] = p.pc.addTrack(track, local.current);
    }
    tuneBitrates();
    setLocalVersion((v) => v + 1);
  }, [tuneBitrates]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices({ cams: list.filter((d) => d.kind === 'videoinput'), mics: list.filter((d) => d.kind === 'audioinput') });
  }, []);

  const ensureAudioCtx = () => {
    if (!audioCtx.current && typeof AudioContext !== 'undefined') audioCtx.current = new AudioContext();
    void audioCtx.current?.resume();
  };

  const enableCam = useCallback(async (on: boolean, deviceId?: string) => {
    setError(null);
    if (!on) {
      setLocalTrack('video', null);
      camOnRef.current = false;
      setCamOn(false);
      void emit('rtc:media', { cam: false, mic: micOnRef.current });
      return;
    }
    try {
      const mobile = isMobile();
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: mobile ? 240 : 320 }, height: { ideal: mobile ? 180 : 240 },
          frameRate: { ideal: mobile ? 12 : 15, max: 20 }, facingMode: deviceId ? undefined : 'user',
        },
      });
      const track = media.getVideoTracks()[0]!;
      track.contentHint = 'motion';
      setLocalTrack('video', track);
      camOnRef.current = true;
      setCamOn(true);
      setCamId(track.getSettings().deviceId);
      void emit('rtc:media', { cam: true, mic: micOnRef.current });
      void refreshDevices();
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? "Accès à la caméra refusé par le navigateur" : 'Caméra indisponible');
    }
  }, [setLocalTrack, refreshDevices]);

  const enableMic = useCallback(async (on: boolean, deviceId?: string) => {
    setError(null);
    ensureAudioCtx();
    if (!on) {
      setLocalTrack('audio', null);
      micOnRef.current = false;
      setMicOn(false);
      void emit('rtc:media', { cam: camOnRef.current, mic: false });
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = media.getAudioTracks()[0]!;
      setLocalTrack('audio', track);
      micOnRef.current = true;
      setMicOn(true);
      setMicId(track.getSettings().deviceId);
      void emit('rtc:media', { cam: camOnRef.current, mic: true });
      void refreshDevices();
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Accès au micro refusé par le navigateur' : 'Micro indisponible');
    }
  }, [setLocalTrack, refreshDevices]);

  // Libère caméra et micro en quittant la page
  useEffect(() => () => {
    for (const t of local.current?.getTracks() ?? []) t.stop();
    void audioCtx.current?.close();
  }, []);

  // Détection de la parole (niveau RMS) pour l'animation « en train de parler »
  useEffect(() => {
    const id = setInterval(() => {
      const ctx = audioCtx.current;
      if (!ctx) return;
      const sources: [string, MediaStream][] = [['__local__', local.current], ...remote.filter((r) => r.mic).map((r) => [r.userId, r.stream] as [string, MediaStream])];
      const next = new Set<string>();
      const buf = new Uint8Array(256);
      for (const [key, stream] of sources) {
        const track = stream.getAudioTracks()[0];
        if (!track || track.readyState !== 'live' || !track.enabled) continue;
        let a = analysers.current.get(key);
        if (!a || a.trackId !== track.id) {
          a?.src.disconnect();
          const src = ctx.createMediaStreamSource(new MediaStream([track]));
          const an = ctx.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          a = { an, src, trackId: track.id };
          analysers.current.set(key, a);
        }
        a.an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        if (Math.sqrt(sum / buf.length) > 0.045) next.add(key);
      }
      setSpeaking((prev) => (prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next));
    }, 160);
    return () => clearInterval(id);
  }, [remote]);

  return {
    local: local.current, localVersion, camOn, micOn, remote, speaking, devices, camId, micId, error, hasTurn,
    enableCam, enableMic, refreshDevices, ensureAudioCtx,
  };
}

export type VideoChat = ReturnType<typeof useVideoChat>;
