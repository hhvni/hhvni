import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { BackHandler, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArcadeButton } from '../../components/ArcadeButton';
import { Backdrop } from '../../components/Backdrop';
import { Gradient } from '../../components/Gradient';
import { Icon } from '../../components/Icon';
import { PressableScale } from '../../components/PressableScale';
import { Header, Screen } from '../../components/Screen';
import { ResultView } from '../../engine/ResultView';
import type { GameOutcome } from '../../engine/types';
import { getGame } from '../../games/registry';
import { useT } from '../../i18n';
import { getCosmetic } from '../../store/cosmetics';
import { useSave } from '../../store/SaveProvider';
import type { GameMode, GameResult, RewardSummary } from '../../store/types';
import { categoryThemes, palette, radius, spacing, type } from '../../theme';

type Phase = 'intro' | 'playing' | 'result';

export default function GameScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = getGame(String(id));
  const { profile, settings, recordGame, setPreferredMode } = useSave();
  const insets = useSafeAreaInsets();

  const initialMode: GameMode = game?.modes.includes(profile.preferredMode) ? profile.preferredMode : (game?.modes[0] ?? 'solo');
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [names, setNames] = useState<[string, string]>([profile.name === 'Joueur' ? t('shell.nameP1') : profile.name, t('shell.nameP2')]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [runId, setRunId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [outcome, setOutcome] = useState<{ result: GameResult; reward: RewardSummary } | null>(null);

  // Bouton retour Android : met la partie en pause au lieu de la quitter.
  useFocusEffect(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- useFocusEffect exige un callback mémoïsé
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (phase === 'playing') {
          setPaused(true);
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [phase]),
  );

  const players = mode === 'duo' ? names.map((n, i) => n.trim() || t('common.player', { n: i + 1 })) : [profile.name];

  if (!game || game.status !== 'available' || !game.component) {
    return (
      <Screen header={<Header title={game ? t(game.title) : ''} />}>
        <View style={styles.missing}>
          <Icon name="lock" size={40} color={palette.textMuted} />
          <Text style={[type.heading, { color: palette.text, textAlign: 'center' }]}>{game ? t('shell.notAvailable') : t('shell.notFound')}</Text>
          <ArcadeButton label={t('result.home')} icon="home" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  const theme = categoryThemes[game.category];
  const GameComponent = game.component;

  const start = () => {
    setPreferredMode(mode);
    setOutcome(null);
    setPaused(false);
    setRunId((r) => r + 1);
    setPhase('playing');
  };

  const handleFinish = (o: GameOutcome) => {
    const result: GameResult = { ...o, gameId: game.id, mode, scored: game.scored && o.scored !== false };
    const reward = recordGame(result, game.category);
    // Laisse le dernier effet visuel se terminer avant l'écran de fin.
    setTimeout(() => {
      setOutcome({ result, reward });
      setPhase('result');
    }, 700);
  };

  if (phase === 'intro') {
    const steps = t(game.howTo).split('\n');
    return (
      <Screen tint={theme.primary} tint2={theme.secondary} header={<Header title={t(game.title)} subtitle={t(`categories.${game.category}.name`)} />}>
        <Gradient colors={theme.gradient} radius={radius.xl} glow style={styles.introHero}>
          <View style={styles.introIcon}>
            <Icon name={game.icon} size={56} color={palette.offWhite} accent={palette.yellow} />
          </View>
          <Text style={[type.title, { color: palette.offWhite, textAlign: 'center' }]}>{t(game.title)}</Text>
          <Text style={[type.body, { color: 'rgba(255,255,255,0.88)', textAlign: 'center' }]}>{t(game.description)}</Text>
        </Gradient>

        <View style={styles.panel}>
          <Text style={[type.tiny, styles.label]}>{t('shell.howTo').toUpperCase()}</Text>
          {steps.map((line, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepNum, { backgroundColor: theme.primary }]}>
                <Text style={[type.tiny, { color: palette.offWhite }]}>{i + 1}</Text>
              </View>
              <Text style={[type.body, { color: palette.text, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </View>

        {game.modes.length > 1 && (
          <View style={styles.panel}>
            <Text style={[type.tiny, styles.label]}>{t('shell.chooseMode').toUpperCase()}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {game.modes.map((m) => {
                const active = m === mode;
                return (
                  <PressableScale
                    key={m}
                    onPress={() => setMode(m)}
                    style={[styles.modeBtn, active && { borderColor: theme.primary, backgroundColor: theme.soft }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`common.${m}`)}
                  >
                    <Icon name={m === 'solo' ? 'user' : 'users'} size={26} color={active ? palette.offWhite : palette.textMuted} accent={theme.secondary} />
                    <Text style={[type.heading, { color: active ? palette.text : palette.textMuted }]}>{t(`common.${m}`)}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        )}

        {mode === 'duo' && (
          <View style={styles.panel}>
            <Text style={[type.tiny, styles.label]}>{t('shell.players').toUpperCase()}</Text>
            {[0, 1].map((i) => (
              <View key={i} style={styles.inputRow}>
                <View style={[styles.stepNum, { backgroundColor: i === 0 ? palette.coral : palette.sky }]}>
                  <Text style={[type.tiny, { color: palette.offWhite }]}>{i + 1}</Text>
                </View>
                <TextInput
                  value={names[i]}
                  onChangeText={(v) => setNames((prev) => (i === 0 ? [v, prev[1]] : [prev[0], v]))}
                  placeholder={t(i === 0 ? 'shell.nameP1' : 'shell.nameP2')}
                  placeholderTextColor={palette.textDim}
                  maxLength={14}
                  style={styles.input}
                  accessibilityLabel={t(i === 0 ? 'shell.nameP1' : 'shell.nameP2')}
                />
              </View>
            ))}
          </View>
        )}

        <ArcadeButton label={t('shell.start')} icon="play" size="lg" colors={theme.gradient} onPress={start} />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Backdrop tint={theme.primary} tint2={theme.secondary} />
      <View style={{ paddingTop: insets.top, flex: 1 }}>
        {phase === 'playing' && (
          <>
            <View style={styles.gameBar}>
              <PressableScale
                onPress={() => setPaused(true)}
                style={styles.pauseBtn}
                accessibilityRole="button"
                accessibilityLabel={t('shell.pause')}
                hitSlop={10}
              >
                <Icon name="pause" size={20} />
              </PressableScale>
              <Text style={[type.heading, { color: palette.text, flex: 1, textAlign: 'center' }]} numberOfLines={1}>
                {t(game.title)}
              </Text>
              <View style={{ width: 42 }} />
            </View>
            <View style={{ flex: 1, paddingBottom: insets.bottom }}>
              <GameComponent
                key={runId}
                mode={mode}
                players={players}
                paused={paused}
                settings={settings}
                skins={{
                  dart: getCosmetic(profile.cosmetics.equipped.dart),
                  ball: getCosmetic(profile.cosmetics.equipped.ball),
                  arrow: getCosmetic(profile.cosmetics.equipped.arrow),
                }}
                theme={theme}
                onFinish={handleFinish}
              />
            </View>
          </>
        )}
        {phase === 'result' && outcome && (
          <ResultView
            result={outcome.result}
            reward={outcome.reward}
            theme={theme}
            scored={outcome.result.scored !== false}
            onReplay={start}
            onOtherGames={() => router.replace({ pathname: '/category/[id]', params: { id: game.category } })}
            onHome={() => router.dismissTo('/')}
          />
        )}
      </View>

      <Modal visible={paused && phase === 'playing'} transparent animationType="fade" onRequestClose={() => setPaused(false)}>
        <View style={styles.pauseBackdrop}>
          {confirmQuit ? (
            <View style={styles.pauseCard}>
              <Icon name="close" size={34} color={palette.red} />
              <Text style={[type.title, { color: palette.text, textAlign: 'center' }]}>{t('shell.quitConfirmTitle')}</Text>
              <Text style={[type.body, { color: palette.textMuted, textAlign: 'center' }]}>{t('shell.quitConfirm')}</Text>
              <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
                <ArcadeButton
                  label={t('shell.quit')}
                  colors={[palette.red, '#D12A4F']}
                  onPress={() => {
                    setConfirmQuit(false);
                    setPaused(false);
                    setPhase('intro');
                  }}
                />
                <ArcadeButton label={t('common.cancel')} variant="ghost" onPress={() => setConfirmQuit(false)} />
              </View>
            </View>
          ) : (
            <View style={styles.pauseCard}>
              <Icon name="pause" size={34} color={theme.primary} />
              <Text style={[type.title, { color: palette.text }]}>{t('shell.pause')}</Text>
              <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
                <ArcadeButton label={t('shell.resume')} icon="play" colors={theme.gradient} onPress={() => setPaused(false)} />
                <ArcadeButton label={t('shell.restart')} icon="refresh" variant="surface" onPress={start} />
                <ArcadeButton label={t('shell.quit')} icon="close" variant="ghost" onPress={() => setConfirmQuit(true)} />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.night },
  missing: { alignItems: 'center', gap: spacing.lg, paddingVertical: 60 },
  introHero: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  introIcon: { width: 96, height: 96, borderRadius: 30, backgroundColor: 'rgba(5,7,26,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  panel: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: palette.border },
  label: { color: palette.textMuted, fontSize: 12 },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.night2,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: palette.night2,
    color: palette.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: palette.border,
  },
  gameBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.sm },
  pauseBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  pauseBackdrop: { flex: 1, backgroundColor: 'rgba(5,7,26,0.8)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  pauseCard: { width: '100%', maxWidth: 360, backgroundColor: palette.surface, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: palette.border },
});
