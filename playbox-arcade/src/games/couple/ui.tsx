import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArcadeButton } from '../../components/ArcadeButton';
import { Gradient } from '../../components/Gradient';
import { Icon, IconName } from '../../components/Icon';
import { PressableScale } from '../../components/PressableScale';
import { useT } from '../../i18n';
import { categoryThemes, palette, radius, spacing, type } from '../../theme';

const theme = categoryThemes.couple;

/** Conteneur des jeux de couple : zone défilante centrée. */
export function CoupleLayout({ children, top }: { children: React.ReactNode; top?: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {top}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** Animation d'entrée commune (glissement + fondu) déclenchée à chaque changement de `id`. */
export function Enter({ id, children }: { id: string | number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 14 }).start();
  }, [id, anim]);
  return (
    <Animated.View
      style={{
        gap: spacing.lg,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Écran « passe le téléphone » pour garder les réponses secrètes. */
export function PassScreen({ name, color, onReady }: { name: string; color: string; onReady: () => void }) {
  const t = useT();
  return (
    <View style={styles.pass}>
      <View style={[styles.passAvatar, { borderColor: color }]}>
        <Text style={[type.display, { color: palette.offWhite }]}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={[type.title, styles.center]}>{t('couple.passTo', { name })}</Text>
      <View style={styles.passHint}>
        <Icon name="eye" size={18} color={palette.rose} />
        <Text style={[type.small, { color: palette.rose }]}>{t('couple.passHint')}</Text>
      </View>
      <ArcadeButton label={t('couple.ready')} icon="check" size="lg" colors={theme.gradient} onPress={onReady} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

/** Grande carte de question au dégradé de l'univers. */
export function QuestionCard({ label, text, icon = 'heart' }: { label: string; text: string; icon?: IconName }) {
  return (
    <Gradient colors={theme.gradient} radius={radius.xl} glow style={styles.card}>
      <View style={styles.cardIcon}>
        <Icon name={icon} size={22} color={palette.offWhite} accent={palette.night} />
      </View>
      <Text style={[type.tiny, { color: 'rgba(255,255,255,0.8)' }]}>{label.toUpperCase()}</Text>
      <Text style={[type.title, { color: palette.offWhite, textAlign: 'center', fontSize: 23, lineHeight: 30 }]}>{text}</Text>
    </Gradient>
  );
}

export function OptionButton({ label, onPress, state = 'idle', badge }: { label: string; onPress?: () => void; state?: 'idle' | 'correct' | 'wrong' | 'dim' | 'selected'; badge?: string }) {
  const border =
    state === 'correct' ? palette.mint : state === 'wrong' ? palette.red : state === 'selected' ? palette.pink : palette.border;
  const bg = state === 'correct' ? 'rgba(46,230,168,0.15)' : state === 'wrong' ? 'rgba(255,77,109,0.15)' : state === 'selected' ? 'rgba(255,95,162,0.15)' : palette.surface;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      style={[styles.option, { borderColor: border, backgroundColor: bg, opacity: state === 'dim' ? 0.45 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[type.heading, { color: palette.text, flex: 1 }]}>{label}</Text>
      {badge ? <Text style={[type.tiny, { color: palette.textMuted }]}>{badge}</Text> : null}
      {state === 'correct' && <Icon name="check" size={20} color={palette.mint} />}
      {state === 'wrong' && <Icon name="close" size={20} color={palette.red} />}
    </PressableScale>
  );
}

/** Points de progression (questions passées / restantes). */
export function Dots({ total, current, results }: { total: number; current: number; results?: (boolean | undefined)[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
      {Array.from({ length: total }, (_, i) => {
        const r = results?.[i];
        return (
          <View
            key={i}
            style={{
              width: i === current ? 22 : 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: r === true ? palette.mint : r === false ? palette.red : i === current ? palette.pink : 'rgba(255,255,255,0.15)',
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  pass: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  passAvatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 4, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  passHint: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(255,95,162,0.12)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  center: { color: palette.text, textAlign: 'center' },
  card: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, minHeight: 200, justifyContent: 'center' },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(5,7,26,0.25)', alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 58, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 2 },
});
