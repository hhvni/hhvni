import React, { useRef } from 'react';
import { View } from 'react-native';
import { Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { feedback } from '../../audio/sounds';
import { useT } from '../../i18n';
import { palette, svgFont } from '../../theme';
import { FlickTracker } from '../../engine/flick';
import { Hud, HintBar } from '../../engine/Hud';
import { clamp, gaussian } from '../../engine/math';
import { Stage, WORLD_W } from '../../engine/Stage';
import { firstTurn, nextShot, TurnState, winnerIndex } from '../../engine/turns';
import type { GameProps } from '../../engine/types';
import { useGameLoop } from '../../engine/useGameLoop';
import { useFx, useRerender } from '../../engine/useFx';
import { BASE_PEGS, landingFromFlick, Peg, project, resolveRing } from './logic';

const PER_TURN = 3;
const FLIGHT_TIME = 0.6;
const RING_COLORS = [palette.coral, palette.sky, palette.mint];

interface Flight {
  fromX: number;
  gx: number;
  d: number;
  t: number;
  color: string;
  peg: Peg | null;
  near: boolean;
}

interface Landed {
  gx: number;
  d: number;
  color: string;
  onPeg: boolean;
  drop: number;
}

interface State {
  phase: 'aim' | 'flight' | 'pause' | 'over';
  turn: TurnState;
  scores: number[];
  turnPoints: number;
  landed: Landed[];
  touching: boolean;
  time: number;
  flight: Flight | null;
  pauseUntil: number;
  stats: { ringsOn: number; golden: number; thrown: number };
  hint: string | null;
}

export default function RingsGame({ mode, players, paused, settings, onFinish }: GameProps) {
  const t = useT();
  const rerender = useRerender();
  const fx = useFx();
  const rounds = mode === 'duo' ? 4 : 5;
  const tracker = useRef(new FlickTracker()).current;
  const s = useRef<State>({
    phase: 'aim',
    turn: firstTurn(),
    scores: players.map(() => 0),
    turnPoints: 0,
    landed: [],
    touching: false,
    time: 0,
    flight: null,
    pauseUntil: 0,
    stats: { ringsOn: 0, golden: 0, thrown: 0 },
    hint: null,
  }).current;
  const geo = useRef({ h: 700 }).current;

  /** À partir de la 3e manche, la quille dorée se déplace. */
  const pegsAt = (time: number, round: number): Peg[] =>
    BASE_PEGS.map((p) => (p.golden && round >= 2 ? { ...p, gx: Math.sin(time * 0.9) * 0.45 } : p));

  const finish = () => {
    s.phase = 'over';
    const best = Math.max(...s.scores);
    const perf = clamp(best / (rounds * 90), 0, 1);
    const summary = [
      { label: t('play.ringsOn'), value: `${s.stats.ringsOn} / ${s.stats.thrown}` },
      { label: t('play.goldenPeg'), value: String(s.stats.golden) },
    ];
    const stats = { ringsOn: s.stats.ringsOn };
    if (mode === 'duo') {
      const w = winnerIndex(s.scores);
      onFinish({
        score: best,
        performance: perf,
        headline: w < 0 ? t('play.draw') : t('play.winnerIs', { name: players[w] }),
        won: true,
        stats,
        summary: [...players.map((p, i) => ({ label: p, value: `${s.scores[i]} pts` })), ...summary],
      });
    } else {
      onFinish({ score: s.scores[0], performance: perf, won: s.scores[0] >= 200, stats, summary });
    }
  };

  const land = () => {
    const f = s.flight!;
    s.flight = null;
    s.stats.thrown += 1;
    const pos = project(f.peg ? f.peg.gx : f.gx, f.peg ? f.peg.d : f.d, geo.h);
    if (f.peg) {
      s.landed.push({ gx: f.peg.gx, d: f.peg.d, color: f.color, onPeg: true, drop: 0 });
      s.scores[s.turn.player] += f.peg.points;
      s.turnPoints += f.peg.points;
      s.stats.ringsOn += 1;
      if (f.peg.golden) s.stats.golden += 1;
      feedback(f.peg.golden ? 'correct' : 'impact', f.peg.golden ? 'heavy' : 'medium');
      fx.float(`+${f.peg.points}`, pos.x, pos.y - 70 * pos.s, f.peg.golden ? palette.yellow : palette.offWhite, f.peg.golden ? 38 : 30);
      fx.pop(pos.x, pos.y - 30 * pos.s, f.peg.golden ? [palette.yellow, palette.offWhite, palette.coral] : undefined);
    } else {
      s.landed.push({ gx: f.gx, d: f.d, color: f.color, onPeg: false, drop: 0 });
      feedback('wrong', 'light');
      fx.float(f.near ? t('play.leaning') : t('play.miss'), pos.x, pos.y - 20, f.near ? palette.sky : palette.textMuted, 24);
    }
    const next = nextShot(s.turn, { rounds, players: players.length, perTurn: PER_TURN });
    if (next.turnEnded) {
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
    for (const l of s.landed) if (l.onPeg) l.drop = Math.min(1, l.drop + dt * 4);
    if (s.phase === 'flight' && s.flight) {
      s.flight.t += dt / FLIGHT_TIME;
      if (s.flight.t >= 1) land();
    } else if (s.phase === 'pause' && s.time >= s.pauseUntil) {
      s.landed = [];
      s.turnPoints = 0;
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
    },
    onMove: (p: { x: number; y: number }) => {
      if (s.touching) tracker.add(p.x, p.y);
    },
    onEnd: (p: { x: number; y: number }) => {
      if (!s.touching) return;
      s.touching = false;
      tracker.add(p.x, p.y);
      const flick = tracker.analyze(250);
      if (!flick || flick.dy > -25 || flick.speed < 300) {
        fx.float(t('play.flickUp'), WORLD_W / 2, geo.h * 0.88, palette.sky, 20);
        return;
      }
      const target = landingFromFlick(flick.dx, flick.dy, flick.speed);
      const noise = settings.aimAssist ? 0.015 : 0.03;
      const gx = target.gx + gaussian() * noise;
      const d = target.d + gaussian() * noise;
      // La quille dorée bouge : on la résout à sa position au moment de l'atterrissage.
      const res = resolveRing(gx, d, pegsAt(s.time + FLIGHT_TIME, s.turn.round), settings.aimAssist);
      s.flight = { fromX: clamp(flick.originX, 60, 340), gx, d, t: 0, color: RING_COLORS[s.turn.shot % 3], peg: res.peg, near: res.near };
      s.phase = 'flight';
      feedback('throw', 'light');
    },
  };

  const hud =
    mode === 'duo'
      ? [
          { label: players[0], value: s.scores[0], active: s.turn.player === 0, color: palette.coral },
          { label: t('play.round'), value: `${Math.min(s.turn.round + 1, rounds)}/${rounds}` },
          { label: players[1], value: s.scores[1], active: s.turn.player === 1, color: palette.sky },
        ]
      : [
          { label: t('play.round'), value: `${Math.min(s.turn.round + 1, rounds)}/${rounds}` },
          { label: t('play.turn'), value: s.turnPoints },
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
            {!s.hint && s.phase === 'aim' && s.turn.round === 0 && s.turn.shot === 0 && <HintBar text={t('play.ringsHint')} />}
          </>
        )}
      >
        {(size) => {
          const h = size.h;
          geo.h = h;
          const pegs = pegsAt(s.time, s.turn.round);
          const far = project(0, 1.05, h);
          const near = project(0, -0.12, h);
          // Quilles triées du fond vers l'avant pour le recouvrement.
          const items: { d: number; node: React.ReactNode }[] = [];
          pegs.forEach((p, i) => {
            const pos = project(p.gx, p.d, h);
            const ph = 78 * pos.s;
            const pw = 9 * pos.s;
            items.push({
              d: p.d,
              node: (
                <G key={`peg${i}`}>
                  <Ellipse cx={pos.x} cy={pos.y} rx={22 * pos.s} ry={7 * pos.s} fill="#000" opacity={0.3} />
                  <Rect x={pos.x - pw / 2} y={pos.y - ph} width={pw} height={ph} rx={pw / 2} fill={p.golden ? palette.yellow : '#E9D2A6'} />
                  <Rect x={pos.x - pw / 2} y={pos.y - ph} width={pw / 3} height={ph} rx={pw / 6} fill="#FFFFFF" opacity={0.35} />
                  <Ellipse cx={pos.x} cy={pos.y - ph} rx={pw * 0.7} ry={pw * 0.35} fill={p.golden ? '#FFE680' : '#F5E6C4'} />
                  <G>
                    <Rect x={pos.x - 18 * pos.s} y={pos.y - ph - 30 * pos.s} width={36 * pos.s} height={20 * pos.s} rx={10 * pos.s} fill={p.golden ? palette.coral : palette.violet} />
                    <SvgText x={pos.x} y={pos.y - ph - 15.5 * pos.s} fontSize={13 * pos.s} fontWeight="900" fontFamily={svgFont} fill={palette.offWhite} textAnchor="middle">
                      {p.points}
                    </SvgText>
                  </G>
                </G>
              ),
            });
          });
          s.landed.forEach((l, i) => {
            const pos = project(l.gx, l.d, h);
            const ph = 78 * pos.s;
            const y = l.onPeg ? pos.y - ph * 0.85 + ph * 0.7 * l.drop : pos.y;
            items.push({
              d: l.d - 0.001,
              node: <Ellipse key={`ring${i}`} cx={pos.x} cy={y} rx={24 * pos.s} ry={8 * pos.s} fill="none" stroke={l.color} strokeWidth={6 * pos.s} />,
            });
          });
          items.sort((a, b) => b.d - a.d);

          let flying = null;
          const f = s.flight;
          if (f) {
            const target = project(f.peg ? f.peg.gx : f.gx, f.peg ? f.peg.d : f.d, h);
            const tt = f.t;
            const startY = h + 20;
            const x = f.fromX + (target.x - f.fromX) * tt;
            const baseY = startY + (target.y - (f.peg ? 70 * target.s : 0) - startY) * tt;
            const y = baseY - Math.sin(Math.PI * tt) * 160;
            const sc = 1.5 + (target.s - 1.5) * tt;
            const wobble = Math.abs(Math.sin(tt * Math.PI * 3));
            flying = <Ellipse cx={x} cy={y} rx={24 * sc} ry={(5 + wobble * 10) * sc} fill="none" stroke={f.color} strokeWidth={6 * sc} />;
          }
          const ringsLeft = s.phase === 'aim' || s.phase === 'flight' ? PER_TURN - s.turn.shot - (s.phase === 'flight' ? 1 : 0) : 0;
          return (
            <G>
              <Defs>
                <LinearGradient id="ringsBg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#2A1660" />
                  <Stop offset="1" stopColor="#120A33" />
                </LinearGradient>
                <LinearGradient id="ringsFloor" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#5B2E8A" />
                  <Stop offset="1" stopColor="#2B1550" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={WORLD_W} height={h} fill="url(#ringsBg)" />
              {/* stand de fête foraine : mur du fond, auvent rayé, guirlande */}
              <Rect x={0} y={h * 0.12} width={WORLD_W} height={far.y - h * 0.12} fill="#1B0E42" />
              {Array.from({ length: 10 }, (_, i) => (
                <G key={`aw${i}`}>
                  <Rect x={i * 40} y={h * 0.04} width={40} height={h * 0.08} fill={i % 2 ? palette.offWhite : palette.coral} />
                  <Ellipse cx={i * 40 + 20} cy={h * 0.12} rx={20} ry={10} fill={i % 2 ? palette.offWhite : palette.coral} />
                </G>
              ))}
              <Rect x={0} y={h * 0.035} width={WORLD_W} height={6} fill={palette.yellow} />
              <SvgText x={WORLD_W / 2} y={h * 0.25} fontSize={30} fontWeight="900" fontFamily={svgFont} fill={palette.yellow} textAnchor="middle" opacity={0.9}>
                {t('games.rings.title').toUpperCase()}
              </SvgText>
              {/* guirlande lumineuse */}
              {Array.from({ length: 11 }, (_, i) => (
                <Ellipse key={`l${i}`} cx={20 + i * 36} cy={h * 0.17 + Math.sin(i * 1.3) * 6} rx={5} ry={5} fill={[palette.yellow, palette.coral, palette.mint, palette.sky][i % 4]} opacity={0.5 + 0.5 * Math.abs(Math.sin(s.time * 2 + i))} />
              ))}
              <Path d={`M ${far.x - 120} ${far.y} L ${far.x + 120} ${far.y} L ${near.x + 230} ${near.y + 40} L ${near.x - 230} ${near.y + 40} Z`} fill="url(#ringsFloor)" />
              {[0.15, 0.48, 0.82].map((d) => {
                const a = project(-1, d, h);
                const b = project(1, d, h);
                return <Path key={d} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={2} />;
              })}
              {items.map((it) => it.node)}
              {flying}
              {Array.from({ length: PER_TURN }, (_, i) => (
                <Ellipse
                  key={`left${i}`}
                  cx={WORLD_W / 2 - 50 + i * 50}
                  cy={h * 0.9}
                  rx={18}
                  ry={7}
                  fill="none"
                  stroke={RING_COLORS[i]}
                  strokeWidth={5}
                  opacity={i >= PER_TURN - ringsLeft ? 1 : 0.15}
                />
              ))}
            </G>
          );
        }}
      </Stage>
    </View>
  );
}
