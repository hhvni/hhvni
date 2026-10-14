import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Sons générés par scripts/generate-sounds.mjs. Ajouter un son :
 * 1. le générer (ou déposer un WAV libre de droits) dans assets/sounds/
 * 2. l'ajouter à SOURCES ci-dessous.
 */
const SOURCES = {
  click: require('../../assets/sounds/click.wav'),
  throw: require('../../assets/sounds/throw.wav'),
  impact: require('../../assets/sounds/impact.wav'),
  kick: require('../../assets/sounds/kick.wav'),
  goal: require('../../assets/sounds/goal.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  victory: require('../../assets/sounds/victory.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const VOLUMES: Partial<Record<SoundName, number>> = { click: 0.5, throw: 0.7, goal: 0.9 };

class SoundManager {
  private players = new Map<SoundName, AudioPlayer>();
  private music: AudioPlayer | null = null;
  private sfxEnabled = true;
  private musicEnabled = true;
  private hapticsEnabled = true;
  private initialized = false;
  private musicWanted = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
  }

  configure(opts: { sound: boolean; music: boolean; haptics: boolean }) {
    this.sfxEnabled = opts.sound;
    this.hapticsEnabled = opts.haptics;
    if (this.musicEnabled !== opts.music) {
      this.musicEnabled = opts.music;
      this.syncMusic();
    }
  }

  private player(name: SoundName): AudioPlayer | null {
    let p = this.players.get(name);
    if (!p) {
      try {
        p = createAudioPlayer(SOURCES[name]);
        p.volume = VOLUMES[name] ?? 0.8;
        this.players.set(name, p);
      } catch {
        return null;
      }
    }
    return p;
  }

  play(name: SoundName) {
    if (!this.sfxEnabled) return;
    const p = this.player(name);
    if (!p) return;
    try {
      p.seekTo(0).catch(() => {});
      p.play();
    } catch {
      // L'audio ne doit jamais casser une partie.
    }
  }

  /** La musique ne démarre qu'après une interaction (contrainte des navigateurs / autoplay). */
  startMusic() {
    this.musicWanted = true;
    this.syncMusic();
  }

  private syncMusic() {
    try {
      if (this.musicEnabled && this.musicWanted) {
        if (!this.music) {
          this.music = createAudioPlayer(require('../../assets/sounds/music.wav'));
          this.music.loop = true;
          this.music.volume = 0.35;
        }
        this.music.play();
      } else if (this.music) {
        this.music.pause();
      }
    } catch {
      this.music = null;
    }
  }

  haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
    if (!this.hapticsEnabled || Platform.OS === 'web') return;
    const run = async () => {
      if (kind === 'success') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (kind === 'error') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const style =
        kind === 'heavy'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : kind === 'medium'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light;
      return Haptics.impactAsync(style);
    };
    run().catch(() => {});
  }
}

export const sounds = new SoundManager();

/** Raccourci : son + vibration. */
export function feedback(sound: SoundName | null, haptic?: Parameters<SoundManager['haptic']>[0]) {
  if (sound) sounds.play(sound);
  if (haptic) sounds.haptic(haptic);
}
