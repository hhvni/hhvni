import React from 'react';
import { StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { palette, radius, type } from '../theme';
import { Gradient } from './Gradient';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

interface Props {
  label: string;
  onPress: () => void;
  colors?: [string, string];
  icon?: IconName;
  variant?: 'solid' | 'ghost' | 'surface';
  size?: 'lg' | 'md' | 'sm';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textColor?: string;
  accessibilityHint?: string;
}

/** Bouton arcade : dégradé, rebord 3D, animation de pression. */
export function ArcadeButton({
  label,
  onPress,
  colors = [palette.coral, '#FF3D7F'],
  icon,
  variant = 'solid',
  size = 'md',
  disabled,
  style,
  textColor,
  accessibilityHint,
}: Props) {
  const h = size === 'lg' ? 60 : size === 'md' ? 50 : 40;
  const fs = size === 'lg' ? 19 : size === 'md' ? 16 : 14;
  const fg = textColor ?? (variant === 'solid' ? palette.offWhite : palette.text);
  const content = (
    <View style={[styles.row, { height: h, paddingHorizontal: size === 'sm' ? 14 : 22 }]}>
      {icon && <Icon name={icon} size={fs + 4} color={fg} />}
      <Text style={[type.heading, { color: fg, fontSize: fs, letterSpacing: 0.6 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
    >
      {variant === 'solid' ? (
        <View style={[styles.lip, { backgroundColor: shade(colors[1]), borderRadius: radius.lg }]}>
          <Gradient colors={colors} direction="horizontal" radius={radius.lg} glow>
            {content}
          </Gradient>
        </View>
      ) : (
        <View
          style={[
            styles.base,
            { borderRadius: radius.lg },
            variant === 'ghost' ? styles.ghost : styles.surface,
          ]}
        >
          {content}
        </View>
      )}
    </PressableScale>
  );
}

/** Assombrit une couleur hexadécimale (rebord du bouton). */
export function shade(hex: string, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  lip: { paddingBottom: 4 },
  base: { overflow: 'hidden' },
  ghost: { borderWidth: 2, borderColor: palette.border, backgroundColor: 'transparent' },
  surface: { backgroundColor: palette.surface2, borderWidth: 1, borderColor: palette.border },
});
