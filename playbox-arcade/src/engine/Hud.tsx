import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { palette, radius, type } from '../theme';

export interface HudItem {
  label: string;
  value: string | number;
  color?: string;
  active?: boolean;
}

/** Bandeau d'informations de partie (score, manche, joueur actif…). */
export function Hud({ items }: { items: HudItem[] }) {
  return (
    <View style={styles.row}>
      {items.map((it, i) => (
        <View
          key={i}
          style={[styles.cell, it.active && { borderColor: it.color ?? palette.yellow, backgroundColor: 'rgba(255,255,255,0.12)' }]}
        >
          <Text style={[type.tiny, { color: palette.textMuted }]} numberOfLines={1}>
            {it.label.toUpperCase()}
          </Text>
          <PopValue value={it.value} color={it.color ?? palette.text} />
        </View>
      ))}
    </View>
  );
}

function PopValue({ value, color }: { value: string | number; color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scale.setValue(1.35);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 12 }).start();
  }, [value, scale]);
  return (
    <Animated.Text style={[type.heading, { color, fontSize: 20, fontVariant: ['tabular-nums'], transform: [{ scale }] }]} numberOfLines={1}>
      {value}
    </Animated.Text>
  );
}

/** Texte flottant (« +60 », « BUT ! ») positionné en pixels écran. */
export function FloatText({ text, x, y, color = palette.yellow, size = 30, id }: { text: string; x: number; y: number; color?: string; size?: number; id: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 1100, useNativeDriver: true }).start();
  }, [id, anim]);
  if (!id) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - 150,
        top: y - size,
        width: 300,
        alignItems: 'center',
        opacity: anim.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, -50] }) },
          { scale: anim.interpolate({ inputRange: [0, 0.15, 0.3, 1], outputRange: [0.4, 1.25, 1, 1] }) },
        ],
      }}
    >
      <Text style={[type.display, { fontSize: size, color, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } }]}>
        {text}
      </Text>
    </Animated.View>
  );
}

/** Bandeau d'aide contextuelle en bas de scène. */
export function HintBar({ text }: { text: string }) {
  return (
    <View style={styles.hint} pointerEvents="none">
      <Text style={[type.small, { color: palette.text, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  cell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  hint: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(5,7,26,0.55)',
  },
});
