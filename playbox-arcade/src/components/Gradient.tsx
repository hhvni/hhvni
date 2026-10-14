import React, { useId } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

export function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

interface Props {
  colors: [string, string] | string[];
  /** Angle approximatif : 'vertical' (haut→bas) ou 'diagonal'. */
  direction?: 'vertical' | 'diagonal' | 'horizontal';
  style?: StyleProp<ViewStyle>;
  radius?: number;
  children?: React.ReactNode;
  /** Ajoute un halo lumineux en haut à gauche. */
  glow?: boolean;
}

export function Gradient({ colors, direction = 'diagonal', style, radius = 0, children, glow }: Props) {
  const id = useSvgId('g');
  const coords =
    direction === 'vertical'
      ? { x1: '0', y1: '0', x2: '0', y2: '1' }
      : direction === 'horizontal'
        ? { x1: '0', y1: '0', x2: '1', y2: '0' }
        : { x1: '0', y1: '0', x2: '1', y2: '1' };
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} {...coords}>
            {colors.map((c, i) => (
              <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
          {glow && (
            <RadialGradient id={`${id}glow`} cx="0.15" cy="0" r="0.9">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.28} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        {glow && <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}glow)`} />}
      </Svg>
      {children}
    </View>
  );
}
