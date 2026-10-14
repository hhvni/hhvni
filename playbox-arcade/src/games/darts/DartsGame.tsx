import React, { useRef } from 'react';
import { View } from 'react-native';
import { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { feedback } from '../../audio/sounds';
import { useT } from '../../i18n';
import { palette } from '../../theme';
import { FlickTracker } from '../../engine/flick';
import { Hud, HintBar } from '../../engine/Hud';
import { clamp, gaussian, easeOutCubic } from '../../engine/math';
import { Stage, WORLD_W } from '../../engine/Stage';
import { firstTurn, nextShot, TurnState, winnerIndex } from '../../engine/turns';
import type { GameProps } from '../../engine/types';
import { useGameLoop } from '../../engine/useGameLoop';
import { useFx, useRerender } from '../../engine/useFx';
import { DartSprite, Reticle } from '../shared/sprites';
import { DartBoard } from './DartBoard';
import { DartHit, powerOffset, scoreDart } from './logic';

const PER_TURN = 3;
/** Le réticule est affiché au-dessus du doigt pour rester visible. */
const AIM_OFFSET = 120;
const FLIGHT_TIME = 0.3;

interface Stuck {
  x: number;
  y: number;
  rot: number;
}

interface State {
  phase: 'aim' | 'flight' | 'pause' | 'over';
  turn: TurnState;
  scores: number[];
  turnHits: DartHit[];
  stuck: Stuck[];
  touching: boolean;
  fingerX: number;
  fingerY: number;
  time: number;
  flight: { fromX: number; fromY: number; toX: number; toY: number; t: number; hit: DartHit; verdict: string } | null;
  pauseUntil: number;
  stats: { bullseyes: number; triples: number; dartsTon: number; bestTurn: number; darts: number; misses: number };
  hint: string | null;
}

export default function DartsGame({ mode, players, paused, settings, skins, onFinish }: GameProps) {
  const t = useT();
  const rerender = useRerender();
  const fx = useFx();
  const rounds = mode === 'duo' ? 6 : 8;
  const tracker = useRef(new FlickTracker()).current;
  const s = useRef<State>({
    phase: 'aim',
    turn: firstTurn(),
    scores: players.map(() => 0),
    turnHits: [],
    stuck: [],
    touching: false,
    fingerX: WORLD_W / 2,
    fingerY: 0,
    time: 0,
    flight: null,
    pauseUntil: 0,
    stats: { bullseyes: 0, triples: 0, dartsTon: 0, bestTurn: 0, darts: 0, misses: 0 },
    hint: null,
  }).current;
  const geo = useRef({ cx: WORLD_W / 2, cy: 250, r: 140, h: 700 }).current;

  const wobbleAmp = settings.aimAssist ? 2.5 : 7;
  const wobble = (time: number) => ({
    x: Math.sin(time * 1.9) * wobbleAmp + Math.sin(time * 4.3) * wobbleAmp * 0.35,
    y: Math.cos(time * 1.4) * wobbleAmp * 0.8 + Math.sin(time * 3.7) * wobbleAmp * 0.3,
  });

  const finish = () => {
    s.phase = 'over';
    const best = Math.max(...s.scores);
    const perf = clamp(best / (rounds * 55), 0, 1);
    const summary = [
      { label: t('play.bestTurn'), value: String(s.stats.bestTurn) },
      { label: t('play.bullseyes'), value: String(s.stats.bullseyes) },
      { label: t('play.triples'), value: String(s.stats.triples) },
    ];
    if (mode === 'duo') {
      const w = winnerIndex(s.scores);
      onFinish({
        score: best,
        performance: perf,
        headline: w < 0 ? t('play.draw') : t('play.winnerIs', { name: players[w] }),
        won: true,
        stats: { bullseyes: s.stats.bullseyes, triples: s.stats.triples, dartsTon: s.stats.dartsTon },
        summary: [...players.map((p, i) => ({ label: p, value: `${s.scores[i]} pts` })), ...summary],
      });
    } else {
      onFinish({
        score: s.scores[0],
        performance: perf,
        won: s.scores[0] >= 300,
        stats: { bullseyes: s.stats.bullseyes, triples: s.stats.triples, dartsTon: s.stats.dartsTon },
        summary,
      });
    }
  };

  const land = () => {
    const f = s.flight!;
    s.flight = null;
    const hit = f.hit;
    s.stuck.push({ x: f.toX, y: f.toY, rot: (f.toX - geo.cx) * 0.05 });
    s.turnHits.push(hit);
    s.scores[s.turn.player] += hit.points;
    s.stats.darts += 1;
    if (hit.kind === 'bull' || hit.kind === 'outerBull') s.stats.bullseyes += 1;
    if (hit.kind === 'triple') s.stats.triples += 1;
    if (hit.kind === 'miss') s.stats.misses += 1;

    if (hit.kind === 'miss') {
      feedback('wrong', 'light');
      fx.float(t('play.miss'), f.toX, f.toY - 20, palette.textMuted, 26);
    } else {
      feedback('impact', hit.points >= 40 ? 'heavy' : 'medium');
      const color = hit.kind === 'bull' ? palette.yellow : hit.multiplier >= 2 ? palette.coral : palette.offWhite;
      fx.float(`${hit.label}  +${hit.points}`, f.toX, f.toY - 26, color, hit.points >= 40 ? 34 : 28);
      if (hit.kind === 'bull' || hit.kind === 'triple' || hit.kind === 'outerBull') {
        fx.pop(f.toX, f.toY);
        if (hit.kind === 'bull') feedback('correct');
      }
    }
    if (f.verdict !== 'perfect') {
      fx.float(f.verdict === 'soft' ? t('play.tooSoft') : t('play.tooHard'), WORLD_W / 2, geo.cy + geo.r * 1.45, palette.sky, 20);
    }

    const next = nextShot(s.turn, { rounds, players: players.length, perTurn: PER_TURN });
    if (next.turnEnded) {
      const turnTotal = s.turnHits.reduce((a, h) => a + h.points, 0);
      s.stats.bestTurn = Math.max(s.stats.bestTurn, turnTotal);
      if (turnTotal >= 100) {
        s.stats.dartsTon += 1;
        fx.float(turnTotal >= 180 ? '180 !' : t('play.ton'), WORLD_W / 2, geo.cy, palette.yellow, 46);
        feedback('victory', 'success');
      }
      s.phase = 'pause';
      s.pauseUntil = s.time + 1.3;
      s.hint = next.done ? null : players.length > 1 ? t('play.turnOf', { name: players[next.player] }) : t('play.nextRound');
    } else {
      s.phase = 'aim';
    }
    s.turn = next;
  };

  useGameLoop((dt) => {
    s.time += dt;
    if (s.phase === 'flight' && s.flight) {
      s.flight.t += dt / FLIGHT_TIME;
      if (s.flight.t >= 1) land();
    } else if (s.phase === 'pause' && s.time >= s.pauseUntil) {
      s.turnHits = [];
      s.stuck = [];
      s.hint = null;
      if (s.turn.done) finish();
      else s.phase = 'aim';
    }
    rerender();
  }, !paused && s.phase !== 'over');

  const gestures = {
    onStart: (p: { x: number; y: number }) => {
      if (s.phase !== 'aim' || paused) return;
      tracker.reset();
      tracker.add(p.x, p.y);
      s.touching = true;
      s.fingerX = p.x;
      s.fingerY = p.y;
    },
    onMove: (p: { x: number; y: number }) => {
      if (!s.touching) return;
      tracker.add(p.x, p.y);
      s.fingerX = p.x;
      s.fingerY = p.y;
    },
    onEnd: (p: { x: number; y: number }) => {
      if (!s.touching) return;
      s.touching = false;
      tracker.add(p.x, p.y);
      const flick = tracker.analyze(300);
      if (!flick || flick.dy > -30 || flick.speed < 350) {
        fx.float(t('play.flickUp'), WORLD_W / 2, geo.h * 0.78, palette.sky, 20);
        return;
      }
      const w = wobble(s.time);
      const power = powerOffset(flick.speed, settings.aimAssist);
      // Un geste en biais dévie la fléchette latéralement.
      const lateral = (flick.dx / Math.abs(flick.dy)) * (settings.aimAssist ? 12 : 30);
      const spread = settings.aimAssist ? 1.5 : 3;
      const aimX = flick.originX + w.x;
      const aimY = flick.originY - AIM_OFFSET + w.y;
      const toX = aimX + lateral + gaussian() * spread;
      const toY = aimY + power.dy + gaussian() * spread;
      const hit = scoreDart(toX - geo.cx, toY - geo.cy, geo.r);
      s.flight = { fromX: flick.originX, fromY: geo.h + 30, toX, toY, t: 0, hit, verdict: power.verdict };
      s.phase = 'flight';
      feedback('throw', 'light');
    },
  };

  const turnPoints = s.turnHits.reduce((a, h) => a + h.points, 0);
  const dartsLeft = s.phase === 'aim' || s.phase === 'flight' ? PER_TURN - s.turn.shot - (s.phase === 'flight' ? 1 : 0) : 0;
  const hud =
    mode === 'duo'
      ? [
          { label: players[0], value: s.scores[0], active: s.turn.player === 0, color: palette.coral },
          { label: t('play.round'), value: `${Math.min(s.turn.round + 1, rounds)}/${rounds}` },
          { label: players[1], value: s.scores[1], active: s.turn.player === 1, color: palette.sky },
        ]
      : [
          { label: t('play.round'), value: `${Math.min(s.turn.round + 1, rounds)}/${rounds}` },
          { label: t('play.turn'), value: turnPoints },
          { label: t('play.score'), value: s.scores[0], color: palette.yellow },
        ];

  return (
    <View style={{ flex: 1 }}>
      <Hud items={hud} />
      <Stage
        gestures={gestures}
        overlay={(size) => (
          <>
            {fx.render(size)}
            {s.hint && <HintBar text={s.hint} />}
            {!s.hint && s.phase === 'aim' && !s.touching && s.turn.round === 0 && s.turn.shot === 0 && <HintBar text={t('play.dartsHint')} />}
          </>
        )}
      >
        {(size) => {
          geo.h = size.h;
          geo.r = Math.min(140, size.h * 0.2);
          geo.cy = Math.max(geo.r * 1.35, size.h * 0.33);
          const w = wobble(s.time);
          const reticleX = s.fingerX + w.x;
          const reticleY = s.fingerY - AIM_OFFSET + w.y;
          const f = s.flight;
          let flightNode = null;
          if (f) {
            const k = easeOutCubic(f.t);
            const x = f.fromX + (f.toX - f.fromX) * k;
            const y = f.fromY + (f.toY - f.fromY) * k - Math.sin(Math.PI * f.t) * 40;
            flightNode = <DartSprite x={x} y={y} scale={1.9 - 0.9 * k} skin={skins.dart} />;
          }
          return (
            <G>
              <Defs>
                <LinearGradient id="dartsWall" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#1C1450" />
                  <Stop offset="0.6" stopColor="#120E36" />
                  <Stop offset="1" stopColor="#0A0820" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={WORLD_W} height={size.h} fill="url(#dartsWall)" />
              <Circle cx={geo.cx} cy={geo.cy} r={geo.r * 2} fill={palette.violet} opacity={0.12} />
              <Rect x={0} y={size.h * 0.86} width={WORLD_W} height={size.h * 0.14} fill="#0A0820" opacity={0.8} />
              <Rect x={WORLD_W * 0.1} y={size.h * 0.86} width={WORLD_W * 0.8} height={3} fill={palette.coral} opacity={0.7} />
              <DartBoard cx={geo.cx} cy={geo.cy} radius={geo.r} />
              {s.stuck.map((d, i) => (
                <DartSprite key={i} x={d.x} y={d.y} scale={0.95} rotate={d.rot} skin={skins.dart} />
              ))}
              {flightNode}
              {s.touching && s.phase === 'aim' && <Reticle x={reticleX} y={reticleY} />}
              {Array.from({ length: PER_TURN }, (_, i) => (
                <DartSprite
                  key={`left${i}`}
                  x={WORLD_W / 2 - 40 + i * 40}
                  y={size.h * 0.885}
                  scale={0.7}
                  skin={skins.dart}
                  opacity={i < dartsLeft ? 1 : 0.18}
                />
              ))}
            </G>
          );
        }}
      </Stage>
    </View>
  );
}
