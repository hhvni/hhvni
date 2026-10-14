import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { feedback, sounds } from '../audio/sounds';

/** Propriétés de placement appliquées au conteneur tactile (le reste va à la vue animée). */
const LAYOUT_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom', 'zIndex'] as const;

function splitStyle(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    if ((LAYOUT_KEYS as readonly string[]).includes(k)) outer[k] = v;
    else inner[k] = v;
  }
  if (outer.flex !== undefined || outer.width !== undefined || outer.flexGrow !== undefined) inner.flexGrow = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  /** Son joué à l'appui ; null pour aucun. */
  sound?: 'click' | null;
  children?: React.ReactNode;
}

/** Zone tactile avec animation d'enfoncement, son et vibration légère. */
export function PressableScale({ style, scaleTo = 0.95, sound = 'click', onPressIn, onPressOut, onPress, disabled, children, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: to === 1 ? 10 : 0 }).start();
  const { outer, inner } = splitStyle(style);
  return (
    <Pressable
      {...rest}
      style={outer}
      disabled={disabled}
      onPressIn={(e) => {
        animate(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        sounds.startMusic();
        feedback(sound, 'light');
        onPress?.(e);
      }}
    >
      <Animated.View style={[inner, { transform: [{ scale }] }, disabled && { opacity: 0.45 }]}>{children}</Animated.View>
    </Pressable>
  );
}
