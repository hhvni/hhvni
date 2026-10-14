import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSave } from '../store/SaveProvider';
import { hashString, seededRandom } from '../store/random';
import { palette } from '../theme';

interface Props {
  /** Changer cette clé relance l'explosion. */
  burstKey: number | string;
  x: number;
  y: number;
  colors?: string[];
  count?: number;
  spread?: number;
}

/** Explosion de confettis légère (Animated, driver natif). Désactivée si « réduire les animations ». */
export function ParticleBurst({ burstKey, x, y, colors = [palette.yellow, palette.coral, palette.mint, palette.sky, palette.pink], count = 16, spread = 110 }: Props) {
  const { settings } = useSave();
  const progress = useRef(new Animated.Value(0)).current;
  const parts = useMemo(() => {
    // Aléatoire reproductible : le rendu reste pur pour une même clé.
    const rnd = seededRandom(hashString(String(burstKey)));
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + rnd() * 0.4;
      const dist = spread * (0.55 + rnd() * 0.6);
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 20,
        size: 5 + rnd() * 6,
        color: colors[i % colors.length],
        round: i % 3 !== 0,
        rot: rnd() * 360,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey, count, spread]);
  useEffect(() => {
    if (settings.reduceMotion) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, [burstKey, progress, settings.reduceMotion]);
  if (settings.reduceMotion || !burstKey) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {parts.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: x - p.size / 2,
            top: y - p.size / 2,
            width: p.size,
            height: p.size,
            borderRadius: p.round ? p.size : 2,
            backgroundColor: p.color,
            opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy + 40] }) },
              { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot}deg`] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
