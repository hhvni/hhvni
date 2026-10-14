import React, { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { feedback } from '../../audio/sounds';
import { ArcadeButton } from '../../components/ArcadeButton';
import { Hud } from '../../engine/Hud';
import type { GameProps } from '../../engine/types';
import { useLocale, useT } from '../../i18n';
import { categoryThemes, palette, type } from '../../theme';
import { coupleContent, shuffle } from './content';
import { CoupleLayout, Dots, Enter, OptionButton, PassScreen, QuestionCard } from './ui';

const ROUNDS = 8;
const COLORS = [palette.coral, palette.sky];

type Step = 'passAnswer' | 'answer' | 'passGuess' | 'guess' | 'reveal';

export default function KnowMeGame({ players, onFinish }: GameProps) {
  const t = useT();
  const locale = useLocale();
  const questions = useMemo(() => shuffle(coupleContent(locale).KNOW_ME).slice(0, ROUNDS), [locale]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('passAnswer');
  const [answer, setAnswer] = useState<number | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [points, setPoints] = useState([0, 0]);
  const [results, setResults] = useState<boolean[]>([]);

  const q = questions[index];
  const answerer = index % 2;
  const guesser = 1 - answerer;
  const names = [players[0], players[1] ?? t('common.player', { n: 2 })];

  const next = () => {
    if (index + 1 >= questions.length) {
      const matches = results.filter(Boolean).length;
      onFinish({
        score: matches * 100,
        performance: matches / ROUNDS,
        headline: matches === ROUNDS ? t('achievements.soulmates.name') : undefined,
        won: matches >= ROUNDS / 2,
        stats: { coupleMatches: matches, perfectMatch: matches === ROUNDS ? 1 : 0 },
        summary: [
          { label: t('couple.matches'), value: `${matches} / ${ROUNDS}` },
          ...names.map((n, i) => ({ label: n, value: `${points[i]}` })),
        ],
      });
      return;
    }
    setIndex(index + 1);
    setAnswer(null);
    setGuess(null);
    setStep('passAnswer');
  };

  const onGuess = (i: number) => {
    setGuess(i);
    const ok = i === answer;
    setResults((r) => [...r, ok]);
    if (ok) setPoints((p) => p.map((v, k) => (k === guesser ? v + 1 : v)));
    feedback(ok ? 'correct' : 'wrong', ok ? 'success' : 'error');
    setStep('reveal');
  };

  return (
    <CoupleLayout
      top={
        <Hud
          items={[
            { label: names[0], value: points[0], color: COLORS[0], active: step !== 'reveal' && (step.startsWith('pass') ? false : (step === 'answer' ? answerer : guesser) === 0) },
            { label: t('couple.questionShort'), value: `${index + 1}/${ROUNDS}` },
            { label: names[1], value: points[1], color: COLORS[1], active: step !== 'reveal' && (step.startsWith('pass') ? false : (step === 'answer' ? answerer : guesser) === 1) },
          ]}
        />
      }
    >
      <Dots total={ROUNDS} current={index} results={results} />
      <Enter id={`${index}-${step}`}>
        {step === 'passAnswer' && <PassScreen name={names[answerer]} color={COLORS[answerer]} onReady={() => setStep('answer')} />}
        {step === 'passGuess' && <PassScreen name={names[guesser]} color={COLORS[guesser]} onReady={() => setStep('guess')} />}
        {step === 'answer' && (
          <>
            <QuestionCard label={t('couple.answerSecret', { name: names[answerer] })} text={q.self} />
            {q.options.map((o, i) => (
              <OptionButton
                key={o}
                label={o}
                onPress={() => {
                  setAnswer(i);
                  setStep('passGuess');
                }}
              />
            ))}
          </>
        )}
        {(step === 'guess' || step === 'reveal') && (
          <>
            <QuestionCard
              label={t('couple.guess', { name: names[guesser], other: names[answerer] })}
              text={q.other.replace('{name}', names[answerer])}
              icon="users"
            />
            {q.options.map((o, i) => (
              <OptionButton
                key={o}
                label={o}
                onPress={step === 'guess' ? () => onGuess(i) : undefined}
                state={step === 'reveal' ? (i === answer ? 'correct' : i === guess ? 'wrong' : 'dim') : 'idle'}
              />
            ))}
            {step === 'reveal' && (
              <>
                <Text style={[type.title, { color: guess === answer ? palette.mint : palette.coral, textAlign: 'center' }]}>
                  {guess === answer ? t('couple.correct') : t('couple.wrong')}
                </Text>
                <ArcadeButton
                  label={index + 1 >= ROUNDS ? t('couple.seeResults') : t('couple.next')}
                  icon="play"
                  size="lg"
                  colors={categoryThemes.couple.gradient}
                  onPress={next}
                />
              </>
            )}
          </>
        )}
      </Enter>
    </CoupleLayout>
  );
}
