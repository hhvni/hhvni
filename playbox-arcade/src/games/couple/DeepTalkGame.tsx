import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { feedback } from '../../audio/sounds';
import { ArcadeButton } from '../../components/ArcadeButton';
import { Gradient } from '../../components/Gradient';
import { Icon } from '../../components/Icon';
import { PressableScale } from '../../components/PressableScale';
import { Hud } from '../../engine/Hud';
import type { GameProps } from '../../engine/types';
import { useLocale, useT } from '../../i18n';
import { categoryThemes, palette, radius, spacing, type } from '../../theme';
import { coupleContent, shuffle } from './content';
import type { TalkLevel } from './content.fr';
import { CoupleLayout, Enter } from './ui';

const LEVELS: { id: TalkLevel; colors: [string, string] }[] = [
  { id: 'light', colors: ['#FF9A7E', '#FF5FA2'] },
  { id: 'deep', colors: ['#7B2FF7', '#3D5AFE'] },
  { id: 'spicy', colors: ['#E2468E', '#9B1F5E'] },
];

export default function DeepTalkGame({ players, onFinish }: GameProps) {
  const t = useT();
  const locale = useLocale();
  const [level, setLevel] = useState<TalkLevel | null>(null);
  const [deck, setDeck] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const flip = useRef(new Animated.Value(0)).current;
  const names = [players[0], players[1] ?? t('common.player', { n: 2 })];

  useEffect(() => {
    flip.setValue(0);
    Animated.spring(flip, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 10 }).start();
  }, [index, level, flip]);

  const end = (count = answered) => {
    onFinish({
      score: count,
      performance: Math.min(1, count / 8),
      scored: false,
      headline: t('couple.together'),
      stats: { questionsAnswered: count },
      summary: [
        { label: t('couple.questionsShared'), value: String(count) },
        { label: t('couple.skip'), value: String(skipped) },
      ],
    });
  };

  const advance = (didAnswer: boolean) => {
    const count = answered + (didAnswer ? 1 : 0);
    if (didAnswer) setAnswered(count);
    else setSkipped((v) => v + 1);
    feedback(didAnswer ? 'correct' : 'click', didAnswer ? 'success' : 'light');
    if (index + 1 >= deck.length) end(count);
    else setIndex(index + 1);
  };

  if (!level) {
    return (
      <CoupleLayout>
        <Enter id="levels">
          <Text style={[type.title, { color: palette.text, textAlign: 'center' }]}>{t('couple.pickLevel')}</Text>
          {LEVELS.map((l) => (
            <PressableScale
              key={l.id}
              onPress={() => {
                setLevel(l.id);
                setDeck(shuffle(coupleContent(locale).DEEP_TALK[l.id]));
                setIndex(0);
              }}
              accessibilityRole="button"
              accessibilityLabel={t(`couple.level.${l.id}`)}
            >
              <Gradient colors={l.colors} radius={radius.xl} glow style={styles.level}>
                <View style={styles.levelIcon}>
                  <Icon name={l.id === 'light' ? 'sparkle' : l.id === 'deep' ? 'chat' : 'heart'} size={26} color={palette.offWhite} accent={palette.night} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.title, { color: palette.offWhite }]}>{t(`couple.level.${l.id}`)}</Text>
                  <Text style={[type.small, { color: 'rgba(255,255,255,0.85)' }]}>{t(`couple.levelDesc.${l.id}`)}</Text>
                </View>
                <Icon name="play" size={22} color={palette.offWhite} />
              </Gradient>
            </PressableScale>
          ))}
        </Enter>
      </CoupleLayout>
    );
  }

  const colors = LEVELS.find((l) => l.id === level)!.colors;
  const starter = names[index % 2];
  return (
    <CoupleLayout
      top={
        <Hud
          items={[
            { label: t('couple.cardShort'), value: `${index + 1}/${deck.length}` },
            { label: t('couple.questionsShared'), value: answered, color: palette.mint },
          ]}
        />
      }
    >
      <Animated.View
        style={{
          opacity: flip,
          transform: [{ perspective: 800 }, { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['80deg', '0deg'] }) }],
        }}
      >
        <Gradient colors={colors} radius={radius.xl} glow style={styles.card}>
          <Text style={[type.tiny, { color: 'rgba(255,255,255,0.8)' }]}>{t(`couple.level.${level}`).toUpperCase()}</Text>
          <Text style={[type.title, { color: palette.offWhite, textAlign: 'center', fontSize: 25, lineHeight: 33 }]}>{deck[index]}</Text>
          <View style={styles.starter}>
            <Icon name="user" size={16} color={palette.offWhite} />
            <Text style={[type.small, { color: palette.offWhite }]}>{t('couple.starts', { name: starter })}</Text>
          </View>
        </Gradient>
      </Animated.View>
      <Text style={[type.small, { color: palette.textMuted, textAlign: 'center' }]}>{t('couple.cardsLeft', { n: deck.length - index - 1 })}</Text>
      <ArcadeButton label={t('couple.answered')} icon="check" size="lg" colors={categoryThemes.couple.gradient} onPress={() => advance(true)} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <ArcadeButton label={t('couple.skip')} icon="refresh" variant="surface" onPress={() => advance(false)} style={{ flex: 1 }} />
        <ArcadeButton label={t('couple.endSession')} icon="close" variant="ghost" onPress={() => end()} style={{ flex: 1 }} />
      </View>
    </CoupleLayout>
  );
}

const styles = StyleSheet.create({
  level: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, minHeight: 96 },
  levelIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(5,7,26,0.25)', alignItems: 'center', justifyContent: 'center' },
  card: { minHeight: 300, padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  starter: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(5,7,26,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
