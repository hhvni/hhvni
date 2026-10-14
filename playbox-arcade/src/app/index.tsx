import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArcadeButton } from '../components/ArcadeButton';
import { Gradient } from '../components/Gradient';
import { Icon } from '../components/Icon';
import { CategoryArt } from '../components/Illustrations';
import { LogoMark } from '../components/Logo';
import { PressableScale } from '../components/PressableScale';
import { ProgressBar } from '../components/ProgressBar';
import { Screen, SectionTitle } from '../components/Screen';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { APP_NAME } from '../config/app';
import { TKey, useT } from '../i18n';
import { CATEGORIES, gamesOf, getGame } from '../games/registry';
import { ACHIEVEMENTS } from '../store/achievements';
import { challengesForDate } from '../store/daily';
import { levelInfo } from '../store/level';
import { todayKey } from '../store/random';
import { useSave } from '../store/SaveProvider';
import { categoryThemes, palette, radius, spacing, type } from '../theme';

export default function Home() {
  const t = useT();
  const { profile, claim } = useSave();
  const lvl = levelInfo(profile.xp);
  const today = todayKey();
  const daily = profile.daily.date === today ? profile.daily : { date: today, progress: {}, claimed: [] as string[] };
  const challenges = challengesForDate(today);
  const recent = profile.recent.map(getGame).filter((g): g is NonNullable<typeof g> => !!g && g.status === 'available');
  const lastGame = recent[0];

  return (
    <Screen
      header={
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <LogoMark size={38} />
            <Text style={[type.title, { color: palette.text, fontSize: 20, letterSpacing: 2 }]}>{APP_NAME}</Text>
          </View>
          <PressableScale onPress={() => router.push('/profile')} style={styles.pill} accessibilityRole="button" accessibilityLabel={t('home.profile')}>
            <View style={styles.levelBadge}>
              <Text style={[type.tiny, { color: palette.night, fontSize: 12 }]}>{lvl.level}</Text>
            </View>
            <View style={{ width: 44 }}>
              <ProgressBar progress={lvl.progress} height={6} colors={[palette.yellow, palette.coral]} />
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push('/profile')} style={styles.pill} accessibilityRole="button" accessibilityLabel={t('common.coins', { n: profile.coins })}>
            <Icon name="coin" size={20} color={palette.yellow} accent="#B8860B" />
            <AnimatedNumber value={profile.coins} style={[type.small, { color: palette.text, fontVariant: ['tabular-nums'] }]} />
          </PressableScale>
          <PressableScale onPress={() => router.push('/settings')} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('home.settings')}>
            <Icon name="gear" size={22} />
          </PressableScale>
        </View>
      }
    >
      <View>
        <Text style={[type.small, { color: palette.textMuted }]}>{t('home.hello', { name: profile.name })}</Text>
        <Text style={[type.display, { color: palette.text, fontSize: 30 }]}>{t('home.pickWorld')}</Text>
      </View>

      {CATEGORIES.map((c) => {
        const theme = categoryThemes[c.id];
        const games = gamesOf(c.id);
        const playable = games.filter((g) => g.status === 'available').length;
        return (
          <PressableScale
            key={c.id}
            onPress={() => router.push({ pathname: '/category/[id]', params: { id: c.id } })}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel={t(`categories.${c.id}.name`)}
          >
            <View style={[styles.catLip, { backgroundColor: theme.soft }]}>
              <Gradient colors={theme.gradient} radius={radius.xl} glow style={styles.catCard}>
                <View style={{ flex: 1, gap: 6, zIndex: 1, paddingRight: 92 }}>
                  <View style={styles.catIcon}>
                    <Icon name={c.icon} size={20} color={palette.offWhite} accent={theme.primary} />
                  </View>
                  <Text style={[type.title, { color: palette.offWhite, fontSize: 25, textTransform: 'uppercase' }]}>
                    {t(`categories.${c.id}.name`)}
                  </Text>
                  <Text style={[type.small, { color: 'rgba(255,255,255,0.85)' }]}>{t(`categories.${c.id}.tagline`)}</Text>
                  <View style={styles.catFooter}>
                    <View style={styles.countPill}>
                      <Text style={[type.tiny, { color: palette.offWhite }]}>{t('home.gamesCount', { n: playable })}</Text>
                    </View>
                    <View style={styles.playRound}>
                      <Icon name="play" size={18} color={theme.primary} />
                    </View>
                  </View>
                </View>
                <View style={styles.catArt} pointerEvents="none">
                  <CategoryArt id={c.id} size={128} />
                </View>
              </Gradient>
            </View>
          </PressableScale>
        );
      })}

      {lastGame && (
        <ArcadeButton
          label={t('home.quickPlay', { game: t(lastGame.title) })}
          icon="refresh"
          colors={[palette.violet, palette.electric]}
          onPress={() => router.push({ pathname: '/game/[id]', params: { id: lastGame.id } })}
        />
      )}

      <SectionTitle>{t('home.recent')}</SectionTitle>
      {recent.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="sparkle" size={22} color={palette.violetLight} />
          <Text style={[type.small, { color: palette.textMuted, flex: 1 }]}>{t('home.recentEmpty')}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}>
          {recent.map((g) => {
            const theme = categoryThemes[g.category];
            const best = profile.perGame[g.id]?.best;
            return (
              <PressableScale
                key={g.id}
                onPress={() => router.push({ pathname: '/game/[id]', params: { id: g.id } })}
                style={styles.recentCard}
                accessibilityRole="button"
                accessibilityLabel={t(g.title)}
              >
                <Gradient colors={theme.gradient} radius={16} style={styles.recentIcon}>
                  <Icon name={g.icon} size={28} color={palette.offWhite} accent={palette.yellow} />
                </Gradient>
                <Text style={[type.small, { color: palette.text }]} numberOfLines={1}>
                  {t(g.title)}
                </Text>
                {g.scored && best ? (
                  <Text style={[type.tiny, { color: palette.yellow }]}>
                    {t('common.best')} {best}
                  </Text>
                ) : null}
              </PressableScale>
            );
          })}
        </ScrollView>
      )}

      <SectionTitle right={<Text style={[type.tiny, { color: palette.textDim }]}>{t('home.dailyReset')}</Text>}>{t('home.daily')}</SectionTitle>
      <View style={styles.panel}>
        {challenges.map((c, i) => {
          const value = Math.min(c.target, daily.progress[c.id] ?? 0);
          const done = value >= c.target;
          const claimed = daily.claimed.includes(c.id);
          const theme = categoryThemes[c.group];
          return (
            <View key={c.id} style={[styles.challenge, i > 0 && styles.divider]}>
              <View style={[styles.challengeIcon, { backgroundColor: theme.soft }]}>
                <Icon name={claimed ? 'check' : 'bolt'} size={18} color={claimed ? palette.mint : theme.primary} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[type.small, { color: palette.text }]}>{t(`challenges.${c.id}` as TKey, { n: c.target })}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ProgressBar progress={value / c.target} height={7} colors={theme.gradient} style={{ flex: 1 }} />
                  <Text style={[type.tiny, { color: palette.textMuted, fontVariant: ['tabular-nums'] }]}>
                    {value}/{c.target}
                  </Text>
                </View>
              </View>
              {done && !claimed ? (
                <PressableScale onPress={() => claim(c.id)} style={styles.claimBtn} accessibilityRole="button" accessibilityLabel={t('home.claim')}>
                  <Icon name="coin" size={16} color={palette.yellow} accent="#B8860B" />
                  <Text style={[type.tiny, { color: palette.night }]}>+{c.reward}</Text>
                </PressableScale>
              ) : (
                <View style={[styles.rewardTag, claimed && { opacity: 0.5 }]}>
                  <Icon name="coin" size={14} color={palette.yellow} accent="#B8860B" />
                  <Text style={[type.tiny, { color: palette.textMuted }]}>{claimed ? t('home.claimed') : c.reward}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <SectionTitle>{t('home.progress')}</SectionTitle>
      <PressableScale onPress={() => router.push('/profile')} style={styles.panel} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={t('home.profile')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Gradient colors={[palette.yellow, palette.coral]} radius={20} style={styles.bigLevel}>
            <Text style={[type.title, { color: palette.night }]}>{lvl.level}</Text>
          </Gradient>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[type.heading, { color: palette.text }]}>{t('common.level', { n: lvl.level })}</Text>
            <ProgressBar progress={lvl.progress} colors={[palette.yellow, palette.coral]} />
            <Text style={[type.tiny, { color: palette.textMuted }]}>{t('home.xpToNext', { n: lvl.needed - lvl.current, level: lvl.level + 1 })}</Text>
          </View>
        </View>
        <Text style={[type.small, { color: palette.textMuted, marginTop: spacing.md }]}>
          {t('home.stats', { games: profile.gamesPlayed, achievements: Object.keys(profile.achievements).length, total: ACHIEVEMENTS.length })}
        </Text>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, maxWidth: 592, width: '100%', alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, height: 36, borderRadius: 18 },
  levelBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.yellow, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  catLip: { borderRadius: radius.xl, paddingBottom: 5 },
  catCard: { minHeight: 168, padding: spacing.lg, flexDirection: 'row' },
  catIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  catFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 'auto', paddingTop: spacing.sm },
  countPill: { backgroundColor: 'rgba(5,7,26,0.3)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  playRound: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.offWhite, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  catArt: { position: 'absolute', right: -6, bottom: -4, opacity: 0.95 },
  empty: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: palette.border },
  recentCard: { width: 112, padding: spacing.sm, gap: 6, borderRadius: radius.lg, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  recentIcon: { height: 64, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.border },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  challengeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  claimBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.yellow, paddingHorizontal: 10, height: 32, borderRadius: 16 },
  rewardTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  bigLevel: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
