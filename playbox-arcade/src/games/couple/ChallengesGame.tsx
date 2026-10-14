import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { feedback } from '../../audio/sounds';
import { ArcadeButton } from '../../components/ArcadeButton';
import { Hud } from '../../engine/Hud';
import type { GameProps } from '../../engine/types';
import { useLocale, useT } from '../../i18n';
import { categoryThemes, palette, spacing, type } from '../../theme';
import { coupleContent, shuffle } from './content';
import { CoupleLayout, Dots, Enter, QuestionCard } from './ui';

const ROUNDS = 8;

export default function ChallengesGame({ paused, onFinish }: GameProps) {
  const t = useT();
  const locale = useLocale();
  const cards = useMemo(() => shuffle(coupleContent(locale).CHALLENGES).slice(0, ROUNDS), [locale]);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(cards[0].seconds);
  const [results, setResults] = useState<boolean[]>([]);
  const [bonus, setBonus] = useState(0);
  const card = cards[index];
  const doneCount = results.filter(Boolean).length;
  const leftRef = useRef(left);
  leftRef.current = left;

  const ticking = running && !paused && left > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      const v = leftRef.current;
      // Bips des dernières secondes, signal de fin à zéro.
      if (v === 1) feedback('wrong', 'heavy');
      else if (v <= 4) feedback('click', 'light');
      setLeft(Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const resolve = (ok: boolean) => {
    const nextResults = [...results, ok];
    const nextBonus = bonus + (ok ? leftRef.current * 2 : 0);
    setResults(nextResults);
    setBonus(nextBonus);
    setRunning(false);
    feedback(ok ? 'correct' : 'wrong', ok ? 'success' : 'light');
    if (index + 1 >= ROUNDS) {
      const done = nextResults.filter(Boolean).length;
      onFinish({
        score: done * 100 + nextBonus,
        performance: done / ROUNDS,
        won: done >= ROUNDS / 2,
        stats: { challengesDone: done },
        summary: [{ label: t('couple.completed'), value: `${done} / ${ROUNDS}` }],
      });
      return;
    }
    setIndex(index + 1);
    setLeft(cards[index + 1].seconds);
  };

  const progress = left / card.seconds;
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <CoupleLayout
      top={
        <Hud
          items={[
            { label: t('couple.challengeShort'), value: `${index + 1}/${ROUNDS}` },
            { label: t('couple.completed'), value: doneCount, color: palette.mint },
            { label: t('play.score'), value: doneCount * 100 + bonus, color: palette.yellow },
          ]}
        />
      }
    >
      <Dots total={ROUNDS} current={index} results={results} />
      <Enter id={index}>
        <QuestionCard label={t('couple.challenge', { n: index + 1, total: ROUNDS })} text={card.text} icon="cards" />
        <View style={styles.timer} accessibilityRole="timer" accessibilityLabel={t('couple.timeLeft', { n: left })}>
          <Svg width={120} height={120} viewBox="0 0 120 120">
            <Circle cx={60} cy={60} r={R} stroke="rgba(255,255,255,0.12)" strokeWidth={10} fill="none" />
            <Circle
              cx={60}
              cy={60}
              r={R}
              stroke={left <= 5 ? palette.coral : palette.pink}
              strokeWidth={10}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${C * progress} ${C}`}
              transform="rotate(-90 60 60)"
            />
          </Svg>
          <Text style={[type.score, styles.timerText, { color: left <= 5 ? palette.coral : palette.text }]}>{left}</Text>
        </View>
        {!running ? (
          <ArcadeButton label={t('couple.startTimer')} icon="clock" size="lg" colors={categoryThemes.couple.gradient} onPress={() => setRunning(true)} />
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ArcadeButton label={t('couple.done')} icon="check" colors={[palette.mint, '#14B886']} onPress={() => resolve(true)} style={{ flex: 1 }} />
            <ArcadeButton label={t('couple.failed')} icon="close" variant="surface" onPress={() => resolve(false)} style={{ flex: 1 }} />
          </View>
        )}
      </Enter>
    </CoupleLayout>
  );
}

const styles = StyleSheet.create({
  timer: { alignSelf: 'center', width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  timerText: { position: 'absolute', fontSize: 38 },
});
