import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { sounds } from '../audio/sounds';
import { palette, spacing, type } from '../theme';
import { Icon, IconName } from './Icon';

interface Props {
  icon: IconName;
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: string;
}

/** Ligne de réglage avec interrupteur animé. */
export function ToggleRow({ icon, label, description, value, onChange, disabled, color = palette.mint }: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, bounciness: 8, speed: 20 }).start();
  }, [value, anim]);
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        sounds.play('click');
        onChange(!value);
      }}
      style={[styles.row, disabled && { opacity: 0.45 }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
    >
      <View style={styles.icon}>
        <Icon name={icon} size={20} color={palette.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: palette.text, fontWeight: '700' }]}>{label}</Text>
        {description ? <Text style={[type.small, { color: palette.textMuted, fontWeight: '500' }]}>{description}</Text> : null}
      </View>
      <Animated.View
        style={[
          styles.track,
          { backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.15)', color] }) },
        ]}
      >
        <Animated.View style={[styles.knob, { transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] }) }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 52 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  track: { width: 50, height: 30, borderRadius: 15, justifyContent: 'center' },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.offWhite },
});
