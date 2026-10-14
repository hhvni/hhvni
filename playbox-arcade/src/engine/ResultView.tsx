import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { feedback } from '../audio/sounds';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ArcadeButton } from '../components/ArcadeButton';
import { Gradient } from '../components/Gradient';
import { Icon } from '../components/Icon';
import { ParticleBurst } from '../components/Particles';
import { TKey, useT } from '../i18n';
import { ACHIEVEMENTS } from '../store/achievements';
import { CHALLENGE_POOL } from '../store/daily';
import type { GameResult, RewardSummary } from '../store/types';
import { CategoryTheme, palette, radius, spacing, type } from '../theme';

interface Props {
  result: GameResult;
  reward: RewardSummary;
  theme: CategoryTheme;
  scored: boolean;
  onReplay: () => void;
  onOtherGames: () => void;
  onHome: () => void;
}

export function ResultView({ result, reward, theme, scored, onReplay, onOtherGames, onHome }: Props) {
  const t = useT();
  const { width } = useWindowDimensions();
  const enter = useRef(new Animated.Value(0)).current;
  const good = result.performance >= 0.5 || reward.newBest || result.won;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, bounciness: 10, speed: 10 }).start();
    feedback(good ? 'victory' : 'impact', good ? 'success' : 'medium');
  }, [enter, good]);

  const headline = result.headline ?? (result.won ? t('result.victory') : good ? t('result.great') : t('result.finished'));

  return (
    <View style={StyleSheet.absoluteFill}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.card,
            { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }] },
          ]}
        >
          <Gradient colors={theme.gradient} radius={radius.xl} glow style={styles.banner}>
            <View style={styles.trophy}>
              <Icon name={good ? 'trophy' : 'star'} size={40} color={palette.yellow} />
            </View>
            <Text style={[type.display, styles.center, { color: palette.offWhite }]}>{headline}</Text>
            {scored && (
              <>
                <Text style={[type.tiny, { color: 'rgba(255,255,255,0.8)', marginTop: 6 }]}>{t('result.score').toUpperCase()}</Text>
                <AnimatedNumber value={result.score} duration={900} style={[type.score, { color: palette.offWhite, fontSize: 54 }]} />
                {reward.newBest ? (
                  <View style={styles.bestBadge}>
                    <Icon name="crown" size={16} color={palette.night} />
                    <Text style={[type.small, { color: palette.night }]}>{t('result.newBest')}</Text>
                  </View>
                ) : reward.previousBest > 0 ? (
                  <Text style={[type.small, { color: 'rgba(255,255,255,0.8)' }]}>{t('result.previousBest', { n: reward.previousBest })}</Text>
                ) : null}
              </>
            )}
          </Gradient>

          {result.summary.length > 0 && (
            <View style={styles.summary}>
              {result.summary.map((row, i) => (
                <View key={i} style={[styles.row, i > 0 && styles.divider]}>
                  <Text style={[type.body, { color: palette.textMuted, flex: 1 }]}>{row.label}</Text>
                  <Text style={[type.heading, { color: palette.text }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[type.tiny, { color: palette.textMuted, alignSelf: 'flex-start' }]}>{t('result.rewards').toUpperCase()}</Text>
          <View style={styles.rewards}>
            <View style={[styles.reward, { backgroundColor: 'rgba(63,184,255,0.14)' }]}>
              <Icon name="star" size={22} color={palette.sky} />
              <Text style={[type.heading, { color: palette.sky }]}>{t('result.xp', { n: reward.xp })}</Text>
            </View>
            <View style={[styles.reward, { backgroundColor: 'rgba(255,210,63,0.14)' }]}>
              <Icon name="coin" size={22} color={palette.yellow} accent="#B8860B" />
              <Text style={[type.heading, { color: palette.yellow }]}>{t('result.coins', { n: reward.coins })}</Text>
            </View>
          </View>

          {reward.levelAfter > reward.levelBefore && (
            <Highlight icon="crown" color={palette.yellow} title={t('result.levelUp', { n: reward.levelAfter })} />
          )}
          {reward.newAchievements.map((id) => {
            const def = ACHIEVEMENTS.find((a) => a.id === id);
            return (
              <Highlight
                key={id}
                icon={def?.icon ?? 'trophy'}
                color={palette.mint}
                title={t(`achievements.${id}.name` as TKey)}
                subtitle={t('result.achievement')}
              />
            );
          })}
          {reward.completedChallenges.map((id) => (
            <Highlight key={id} icon="bolt" color={palette.coral} title={t('result.challengeDone')} subtitle={t(`challenges.${id}` as TKey, { n: CHALLENGE_POOL.find((c) => c.id === id)?.target ?? '' })} />
          ))}

          <View style={{ gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.sm }}>
            <ArcadeButton label={t('result.replay')} icon="refresh" size="lg" colors={theme.gradient} onPress={onReplay} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <ArcadeButton label={t('result.otherGames')} variant="surface" onPress={onOtherGames} style={{ flex: 1 }} size="sm" />
              <ArcadeButton label={t('result.home')} icon="home" variant="surface" onPress={onHome} style={{ flex: 1 }} size="sm" />
            </View>
          </View>
        </Animated.View>
      </ScrollView>
      {good && <ParticleBurst burstKey={1} x={width / 2} y={170} count={28} spread={180} />}
    </View>
  );
}

function Highlight({ icon, color, title, subtitle }: { icon: React.ComponentProps<typeof Icon>['name']; color: string; title: string; subtitle?: string }) {
  return (
    <View style={[styles.highlight, { borderColor: color }]}>
      <View style={[styles.hIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={20} color={palette.night} accent={color} />
      </View>
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={[type.tiny, { color }]}>{subtitle.toUpperCase()}</Text> : null}
        <Text style={[type.heading, { color: palette.text }]}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: 48, alignItems: 'center' },
  card: { width: '100%', maxWidth: 480, gap: spacing.md, alignItems: 'center' },
  banner: { alignSelf: 'stretch', alignItems: 'center', padding: spacing.xl, paddingTop: spacing.xl + 8 },
  trophy: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(5,7,26,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  center: { textAlign: 'center', fontSize: 30 },
  bestBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.yellow, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 4 },
  summary: { alignSelf: 'stretch', backgroundColor: palette.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderWidth: 1, borderColor: palette.border },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  rewards: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  reward: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.md, borderRadius: radius.lg },
  highlight: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: palette.surface },
  hIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
