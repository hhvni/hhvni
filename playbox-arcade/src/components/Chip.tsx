import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, type } from '../theme';
import { Icon, IconName } from './Icon';

export function Chip({ icon, label, color = palette.text, iconColor, accent, bg = 'rgba(255,255,255,0.08)' }: { icon?: IconName; label: string; color?: string; iconColor?: string; accent?: string; bg?: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon && <Icon name={icon} size={16} color={iconColor ?? color} accent={accent} />}
      <Text style={[type.small, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
