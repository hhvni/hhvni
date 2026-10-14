import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArcadeButton } from '../../components/ArcadeButton';
import { Chip } from '../../components/Chip';
import { Gradient } from '../../components/Gradient';
import { Icon } from '../../components/Icon';
import { CategoryArt } from '../../components/Illustrations';
import { Header, Screen, SectionTitle } from '../../components/Screen';
import type { GameDefinition } from '../../engine/types';
import { gamesOf } from '../../games/registry';
import { useT } from '../../i18n';
import { useSave } from '../../store/SaveProvider';
import { CategoryId, categoryThemes, palette, radius, spacing, type } from '../../theme';

const IDS: CategoryId[] = ['precision', 'football', 'couple'];

export default function CategoryScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ id: string }>();
  const id = IDS.includes(params.id as CategoryId) ? (params.id as CategoryId) : 'precision';
  const theme = categoryThemes[id];
  const games = gamesOf(id);
  const available = games.filter((g) => g.status === 'available');
  const upcoming = games.filter((g) => g.status === 'soon');

  return (
    <Screen tint={theme.primary} tint2={theme.secondary} header={<Header title={t(`categories.${id}.name`)} />}>
      <Gradient colors={theme.gradient} radius={radius.xl} glow style={styles.hero}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[type.title, { color: palette.offWhite, textTransform: 'uppercase' }]}>{t(`categories.${id}.name`)}</Text>
          <Text style={[type.body, { color: 'rgba(255,255,255,0.88)' }]}>{t(`categories.${id}.tagline`)}</Text>
        </View>
        <CategoryArt id={id} size={110} />
      </Gradient>

      <SectionTitle>{t('category.available')}</SectionTitle>
      {available.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}

      {upcoming.length > 0 && <SectionTitle>{t('category.upcoming')}</SectionTitle>}
      {upcoming.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
    </Screen>
  );
}

function GameCard({ game }: { game: GameDefinition }) {
  const t = useT();
  const { profile } = useSave();
  const theme = categoryThemes[game.category];
  const soon = game.status !== 'available';
  const best = profile.perGame[game.id]?.best;
  return (
    <View style={[styles.card, soon && styles.cardSoon]}>
      <View style={styles.cardTop}>
        <Gradient colors={soon ? [palette.surface2, palette.border] : theme.gradient} radius={18} style={styles.gameIcon}>
          <Icon name={game.icon} size={34} color={soon ? palette.textMuted : palette.offWhite} accent={soon ? palette.textDim : palette.yellow} />
        </Gradient>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.heading, { color: palette.text }]}>{t(game.title)}</Text>
          <Text style={[type.small, { color: palette.textMuted }]}>{t(game.description)}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        {game.modes.map((m) => (
          <Chip key={m} icon={m === 'solo' ? 'user' : 'users'} label={t(`common.${m}`)} color={palette.textMuted} />
        ))}
        {!soon && game.scored && (
          <Chip
            icon="trophy"
            label={best ? `${t('common.best')} ${best}` : t('common.noBest')}
            color={best ? palette.yellow : palette.textDim}
          />
        )}
      </View>
      {soon ? (
        <View style={styles.soonBadge}>
          <Icon name="lock" size={16} color={palette.textMuted} />
          <Text style={[type.small, { color: palette.textMuted }]}>{t('common.soon')}</Text>
        </View>
      ) : (
        <ArcadeButton
          label={t('common.play')}
          icon="play"
          colors={theme.gradient}
          onPress={() => router.push({ pathname: '/game/[id]', params: { id: game.id } })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, minHeight: 130 },
  card: { backgroundColor: palette.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: palette.border },
  cardSoon: { opacity: 0.75, backgroundColor: palette.night2 },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  gameIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  soonBadge: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.border,
  },
});
