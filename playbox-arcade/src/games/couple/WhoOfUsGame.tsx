import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { feedback } from '../../audio/sounds';
import { ArcadeButton } from '../../components/ArcadeButton';
import { Icon } from '../../components/Icon';
import { Hud } from '../../engine/Hud';
import type { GameProps } from '../../engine/types';
import { useLocale, useT } from '../../i18n';
import { categoryThemes, palette, radius, spacing, type } from '../../theme';
import { coupleContent, shuffle } from './content';
import { CoupleLayout, Dots, Enter, OptionButton, PassScreen, QuestionCard } from './ui';

const ROUNDS = 10;
const COLORS = [palette.coral, palette.sky];

type Step = 'pass0' | 'vote0' | 'pass1' | 'vote1' | 'reveal';
/** Vote : 0 = joueur 1, 1 = joueur 2, 2 = les deux. */
type Vote = 0 | 1 | 2;

export default function WhoOfUsGame({ players, onFinish }: GameProps) {
  const t = useT();
  const locale = useLocale();
  const statements = useMemo(() => shuffle(coupleContent(locale).WHO_OF_US).slice(0, ROUNDS), [locale]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('pass0');
  const [votes, setVotes] = useState<[Vote | null, Vote | null]>([null, null]);
  const [results, setResults] = useState<boolean[]>([]);
  const names = [players[0], players[1] ?? t('common.player', { n: 2 })];
  const choices = [names[0], names[1], t('couple.both')];
  const agreements = results.filter(Boolean).length;

  const vote = (who: 0 | 1, v: Vote) => {
    const nextVotes: [Vote | null, Vote | null] = who === 0 ? [v, votes[1]] : [votes[0], v];
    setVotes(nextVotes);
    if (who === 0) setStep('pass1');
    else {
      const ok = nextVotes[0] === nextVotes[1];
      setResults((r) => [...r, ok]);
      feedback(ok ? 'correct' : 'wrong', ok ? 'success' : 'light');
      setStep('reveal');
    }
  };

  const next = () => {
    if (index + 1 >= ROUNDS) {
      onFinish({
        score: agreements * 100,
        performance: agreements / ROUNDS,
        won: agreements >= ROUNDS / 2,
        stats: { coupleMatches: agreements },
        summary: [{ label: t('couple.agreements'), value: `${agreements} / ${ROUNDS}` }],
      });
      return;
    }
    setIndex(index + 1);
    setVotes([null, null]);
    setStep('pass0');
  };

  const voter = step === 'vote0' ? 0 : step === 'vote1' ? 1 : null;

  return (
    <CoupleLayout
      top={
        <Hud
          items={[
            { label: names[0], value: votes[0] !== null && step !== 'reveal' ? '✓' : '·', color: COLORS[0], active: voter === 0 },
            { label: t('couple.agreements'), value: agreements, color: palette.mint },
            { label: names[1], value: votes[1] !== null && step !== 'reveal' ? '✓' : '·', color: COLORS[1], active: voter === 1 },
          ]}
        />
      }
    >
      <Dots total={ROUNDS} current={index} results={results} />
      <Enter id={`${index}-${step}`}>
        {step === 'pass0' && <PassScreen name={names[0]} color={COLORS[0]} onReady={() => setStep('vote0')} />}
        {step === 'pass1' && <PassScreen name={names[1]} color={COLORS[1]} onReady={() => setStep('vote1')} />}
        {voter !== null && (
          <>
            <QuestionCard label={t('couple.whoVote', { name: names[voter] })} text={statements[index]} icon="users" />
            {choices.map((c, i) => (
              <OptionButton key={i} label={c} onPress={() => vote(voter, i as Vote)} />
            ))}
          </>
        )}
        {step === 'reveal' && (
          <>
            <QuestionCard label={t('couple.reveal')} text={statements[index]} icon="sparkle" />
            <View style={styles.votes}>
              {[0, 1].map((p) => (
                <View key={p} style={[styles.vote, { borderColor: COLORS[p] }]}>
                  <Text style={[type.tiny, { color: COLORS[p] }]}>{names[p].toUpperCase()}</Text>
                  <Text style={[type.heading, { color: palette.text, textAlign: 'center' }]} numberOfLines={2}>
                    {choices[votes[p] ?? 2]}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[styles.verdict, { backgroundColor: results[index] ? 'rgba(46,230,168,0.15)' : 'rgba(255,107,74,0.15)' }]}>
              <Icon name={results[index] ? 'heart' : 'chat'} size={26} color={results[index] ? palette.mint : palette.coral} />
              <Text style={[type.title, { color: results[index] ? palette.mint : palette.coral }]}>
                {results[index] ? t('couple.agree') : t('couple.disagree')}
              </Text>
            </View>
            <ArcadeButton
              label={index + 1 >= ROUNDS ? t('couple.seeResults') : t('couple.next')}
              icon="play"
              size="lg"
              colors={categoryThemes.couple.gradient}
              onPress={next}
            />
          </>
        )}
      </Enter>
    </CoupleLayout>
  );
}

const styles = StyleSheet.create({
  votes: { flexDirection: 'row', gap: spacing.md },
  vote: { flex: 1, alignItems: 'center', gap: 6, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2, backgroundColor: palette.surface },
  verdict: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg },
});
