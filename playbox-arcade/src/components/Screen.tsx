import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { palette, spacing, type } from '../theme';
import { Backdrop } from './Backdrop';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  tint?: string;
  tint2?: string;
  contentStyle?: StyleProp<ViewStyle>;
  header?: React.ReactNode;
}

export function Screen({ children, scroll = true, tint, tint2, contentStyle, header }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Backdrop tint={tint} tint2={tint2} />
      <View style={{ paddingTop: insets.top }}>{header}</View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingBottom: insets.bottom }, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

export function Header({ title, subtitle, right, onBack }: { title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void }) {
  const t = useT();
  return (
    <View style={styles.header}>
      <PressableScale
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        hitSlop={10}
      >
        <Icon name="back" size={22} />
      </PressableScale>
      <View style={{ flex: 1 }}>
        <Text style={[type.title, { color: palette.text, fontSize: 22 }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={[type.small, { color: palette.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.tiny, { color: palette.textMuted, textTransform: 'uppercase', fontSize: 12 }]} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.night },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: 592, width: '100%', alignSelf: 'center' },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: -spacing.xs },
});
