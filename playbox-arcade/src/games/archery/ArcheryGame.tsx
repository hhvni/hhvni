import React, { useRef } from 'react';
import { View } from 'react-native';
import { Circle, Defs, Ellipse, G, LinearGradient, Line, Path, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { feedback } from '../../audio/sounds';
import { useT } from '../../i18n';
import { palette, svgFont } from '../../theme';
import { Hud, HintBar } from '../../engine/Hud';
import { clamp, easeOutCubic, gaussian } from '../../engine/math';
import { Stage, WORLD_W } from '../../engine/Stage';
import { firstTurn, nextShot, TurnState, winnerIndex } from '../../engine/turns';
import type { GameProps } from '../../engine/types';
import { useGameLoop } from '../../engine/useGameLoop';
import { useFx, useRerender } from '../../engine/useFx';
import { ArrowNock, ArrowSprite, Reticle } from '../shared/sprites';
import { ArcheryTarget } from './ArcheryTarget';
import { drawDrop, scoreArrow, swayAmplitude, volleyConfig, windDrift } from './logic';

const PER_TURN = 3;
const AIM_OFFSET = 130;
const FLIGHT_TIME = 0.5;
const DRAW_TIME = 0.9;

interface State {
  phase: 'aim' | 'flight' | 'pause' | 'over';
  turn: TurnState;
  volley: ReturnType<typeof volleyConfig>;
  scores: number[];
  volleyPoints: number;
  stuck: { x: number; y: number }[];
  holding: boolean;
  holdTime: number;
  fingerX: number;
  fingerY: number;
  time: number;
  flight: { toX: number; toY: number; drift: number; t: number; points: number; x: boolean } | null;
  pauseUntil: number;
  stats: { tens: number; xs: number; perfectVolleys: number; arrows: number; bestVolley: number };
  hint: string | null;
}

export default function ArcheryGame({ mode, players, paused, settings, skins, onFinish }: GameProps) {
  const t = useT();
  const rerender = useRerender();
  const fx = useFx();
  const rounds = mode === 'duo' ? 4 : 5;
  const s = useRef<State>({
    phase: 'aim',
    turn: firstTurn(),
    volley: volleyConfig(0),
    scores: players.map(() => 0),
    volleyPoints: 0,
    stuck: [],
    holding: false,
    holdTime: 0,
    fingerX: WORLD_W / 2,
    fingerY: 0,
    time: 0,
    flight: null,
    pauseUntil: 0,
    stats: { tens: 0, xs: 0, perfectVolleys: 0, arrows: 0, bestVolley: 0 },
    hint: null,
  }).current;
  const geo = useRef({ cx: WORLD_W / 2, cy: 220, scale: 1, h: 700 }).current;

  const sway = (time: number, amp: number) => ({
    x: Math.sin(time * 1.6) * amp + Math.sin(time * 3.9) * amp * 0.3,
    y: Math.cos(time * 1.2) * amp * 0.9,
  });

  const finish = () => {
    s.phase = 'over';
    const best = Math.max(...s.scores);
    const max = rounds * PER_TURN * 10;
    const summary = [
      { label: t('play.bestVolley'), value: String(s.stats.bestVolley) },
      { label: t('play.tens'), value: String(s.stats.tens) },
      { label: 'X', value: String(s.stats.xs) },
    ];
    const stats = { tens: s.stats.tens, xs: s.stats.xs, perfectVolleys: s.stats.perfectVolleys };
    if (mode === 'duo') {
      const w = winnerIndex(s.scores);
      onFinish({
        score: best,
        performance: clamp(best / (max * 0.85), 0, 1),
        headline: w < 0 ? t('play.draw') : t('play.winnerIs', { name: players[w] }),
        won: true,
        stats,
        summary: [...players.map((p, i) => ({ label: p, value: `${s.scores[i]} / ${max}` })), ...summary],
      });
    } else {
      onFinish({
        score: s.scores[0],
        performance: clamp(s.scores[0] / (max * 0.85), 0, 1),
        won: s.scores[0] >= max * 0.6,
        stats,
        summary: [{ label: t('play.score'), value: `${s.scores[0]} / ${max}` }, ...summary],
      });
    }
  };

  const land = () => {
    const f = s.flight!;
    s.flight = null;
    const r = s.volley.radius * geo.scale;
    const res = scoreArrow(f.toX - geo.cx, f.toY - geo.cy, r);
    s.stats.arrows += 1;
    s.scores[s.turn.player] += res.points;
    s.volleyPoints += res.points;
    if (res.points > 0) s.stuck.push({ x: f.toX, y: f.toY });
    if (res.points === 10) s.stats.tens += 1;
    if (res.x) s.stats.xs += 1;
    if (res.points === 0) {
      feedback('wrong', 'light');
      fx.float(t('play.miss'), f.toX, f.toY - 10, palette.textMuted, 26);
    } else {
      feedback('impact', res.points >= 9 ? 'heavy' : 'medium');
      const label = res.x ? 'X  +10' : `+${res.points}`;
      fx.float(label, f.toX, f.toY - 20, res.points >= 9 ? palette.yellow : palette.offWhite, res.points >= 9 ? 36 : 28);
      if (res.points >= 9) fx.pop(f.toX, f.toY, [palette.yellow, palette.coral, palette.offWhite]);
      if (res.x) feedback('correct');
    }
    const next = nextShot(s.turn, { rounds, players: players.length, perTurn: PER_TURN });
    if (next.turnEnded) {
      s.stats.bestVolley = Math.max(s.stats.bestVolley, s.volleyPoints);
      if (s.volleyPoints === 30) {
        s.stats.perfectVolleys += 1;
        fx.float(t('play.perfectVolley'), WORLD_W / 2, geo.cy - 40, palette.yellow, 38);
        feedback('victory', 'success');
      }
      s.phase = 'pause';
      s.pauseUntil = s.time + 1.4;
      s.hint = next.done ? null : players.length > 1 ? t('play.turnOf', { name: players[next.player] }) : t('play.targetMoves');
    } else {
      s.phase = 'aim';
    }
    s.turn = next;
  };

  useGameLoop((dt) => {
    s.time += dt;
    if (s.holding) s.holdTime += dt;
    if (s.phase === 'flight' && s.flight) {
      s.flight.t += dt / FLIGHT_TIME;
      if (s.flight.t >= 1) land();
    } else if (s.phase === 'pause' && s.time >= s.pauseUntil) {
      s.stuck = [];
      s.volleyPoints = 0;
      s.hint = null;
      if (s.turn.done) finish();
      else {
        // Nouvelle volée (ou nouveau joueur) : distance et vent mis à jour.
        s.volley = volleyConfig(s.turn.round);
        s.phase = 'aim';
      }
    }
    rerender();
  }, !paused && s.phase !== 'over');

  const draw = clamp(s.holdTime / DRAW_TIME, 0, 1);

  const gestures = {
    onStart: (p: { x: number; y: number }) => {
      if (s.phase !== 'aim' || paused) return;
      s.holding = true;
      s.holdTime = 0;
      s.fingerX = p.x;
      s.fingerY = p.y;
      feedback(null, 'light');
    },
    onMove: (p: { x: number; y: number }) => {
      if (!s.holding) return;
      s.fingerX = p.x;
      s.fingerY = p.y;
    },
    onEnd: () => {
      if (!s.holding) return;
      s.holding = false;
      const d = clamp(s.holdTime / DRAW_TIME, 0, 1);
      if (d < 0.25) {
        fx.float(t('play.holdLonger'), WORLD_W / 2, geo.h * 0.7, palette.sky, 20);
        return;
      }
      const amp = swayAmplitude(s.holdTime, settings.aimAssist);
      const w = sway(s.time, amp);
      const drift = windDrift(s.volley.wind, s.volley.distance) * geo.scale;
      const spread = settings.aimAssist ? 1.2 : 2.2;
      const toX = s.fingerX + w.x + drift + gaussian() * spread;
      const toY = s.fingerY - AIM_OFFSET + w.y + drawDrop(d) + gaussian() * spread;
      s.flight = { toX, toY, drift, t: 0, points: 0, x: false };
      s.phase = 'flight';
      s.holdTime = 0;
      feedback('throw', 'medium');
    },
  };

  const hud =
    mode === 'duo'
      ? [
          { label: players[0], value: s.scores[0], active: s.turn.player === 0, color: palette.coral },
          { label: t('play.volley'), value: `${Math.min(s.turn.round + 1, rounds)}/${rounds}` },
          { label: players[1], value: s.scores[1], active: s.turn.player === 1, color: palette.sky },
        ]
      : [
          { label: t('play.volley'), value: `${Math.min(s.turn.round + 1, rounds)}/${rounds}` },
          { label: t('play.distance'), value: `${s.volley.distance} m` },
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
            {!s.hint && s.phase === 'aim' && !s.holding && s.turn.round === 0 && s.turn.shot === 0 && <HintBar text={t('play.archeryHint')} />}
          </>
        )}
      >
        {(size) => {
          const h = size.h;
          geo.h = h;
          geo.scale = Math.min(1, h / 760);
          geo.cy = h * 0.3;
          const horizon = h * 0.46;
          const r = s.volley.radius * geo.scale;
          const amp = swayAmplitude(s.holdTime, settings.aimAssist);
          const w = sway(s.time, amp);
          const bowY = h * 0.86;
          const pull = s.holding ? draw * 46 : 0;
          const f = s.flight;
          let arrow = null;
          if (f) {
            const k = easeOutCubic(f.t);
            const startX = WORLD_W / 2;
            const x = startX + (f.toX - f.drift - startX) * k + f.drift * f.t * f.t;
            const y = bowY - 40 + (f.toY - (bowY - 40)) * k;
            arrow = <ArrowSprite x={x} y={y} scale={1.2 - k * 0.9} skin={skins.arrow} />;
          }
          const windDir = Math.sign(s.volley.wind);
          return (
            <G>
              <Defs>
                <LinearGradient id="archSky" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#2B1B6E" />
                  <Stop offset="0.7" stopColor="#7B3FA8" />
                  <Stop offset="1" stopColor="#FF8A6B" />
                </LinearGradient>
                <LinearGradient id="archGrass" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#1E6B5A" />
                  <Stop offset="1" stopColor="#0B2A2E" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={WORLD_W} height={horizon} fill="url(#archSky)" />
              <Circle cx={WORLD_W * 0.78} cy={horizon - 30} r={46} fill={palette.yellow} opacity={0.35} />
              <Path d={`M0 ${horizon} Q 80 ${horizon - 50} 170 ${horizon - 10} T 400 ${horizon - 30} L 400 ${horizon} Z`} fill="#3A2A7A" opacity={0.8} />
              <Rect x={0} y={horizon} width={WORLD_W} height={h - horizon} fill="url(#archGrass)" />
              {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
                <Line key={i} x1={WORLD_W / 2 + i * 10} y1={horizon} x2={WORLD_W / 2 + i * 120} y2={h} stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={2} />
              ))}
              <Ellipse cx={geo.cx} cy={geo.cy + r + r * 1.4} rx={r * 1.3} ry={r * 0.12} fill="#000" opacity={0.25} />
              <ArcheryTarget cx={geo.cx} cy={geo.cy} radius={r} />
              {s.stuck.map((a, i) => (
                <ArrowNock key={i} x={a.x} y={a.y} size={Math.max(0.55, geo.scale * (r / 90))} skin={skins.arrow} />
              ))}
              {arrow}
              {/* Indicateur de vent */}
              <G transform={`translate(${WORLD_W - 92} 16)`}>
                <Rect x={0} y={0} width={80} height={48} rx={12} fill="#05071A" opacity={0.55} />
                <SvgText x={40} y={17} fontSize={10} fontWeight="800" fontFamily={svgFont} fill={palette.textMuted} textAnchor="middle">
                  {t('play.wind').toUpperCase()}
                </SvgText>
                {windDir !== 0 ? (
                  <Polygon
                    points={windDir > 0 ? '22,28 50,28 50,23 60,32 50,41 50,36 22,36' : '58,28 30,28 30,23 20,32 30,41 30,36 58,36'}
                    fill={palette.sky}
                  />
                ) : (
                  <Circle cx={40} cy={32} r={4} fill={palette.sky} />
                )}
              </G>
              <SvgText x={WORLD_W - 52} y={80} fontSize={12} fontWeight="900" fontFamily={svgFont} fill={palette.offWhite} textAnchor="middle">
                {`${Math.abs(s.volley.wind)} km/h`}
              </SvgText>
              {/* Arc */}
              <G>
                <Path
                  d={`M ${WORLD_W / 2 - 120} ${bowY + 10} Q ${WORLD_W / 2} ${bowY - 70} ${WORLD_W / 2 + 120} ${bowY + 10}`}
                  stroke="#8A5A2B"
                  strokeWidth={9}
                  fill="none"
                  strokeLinecap="round"
                />
                <Path
                  d={`M ${WORLD_W / 2 - 120} ${bowY + 10} Q ${WORLD_W / 2} ${bowY - 70} ${WORLD_W / 2 + 120} ${bowY + 10}`}
                  stroke={palette.coral}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  opacity={0.7}
                />
                <Line x1={WORLD_W / 2 - 120} y1={bowY + 10} x2={WORLD_W / 2} y2={bowY + 10 + pull} stroke="#E8E2D4" strokeWidth={1.6} />
                <Line x1={WORLD_W / 2 + 120} y1={bowY + 10} x2={WORLD_W / 2} y2={bowY + 10 + pull} stroke="#E8E2D4" strokeWidth={1.6} />
                {s.phase === 'aim' && <ArrowSprite x={WORLD_W / 2} y={bowY - 54 + pull} scale={1} skin={skins.arrow} />}
              </G>
              {/* Jauge de tension */}
              {s.holding && (
                <G>
                  <Rect x={24} y={h * 0.55} width={12} height={h * 0.25} rx={6} fill="#05071A" opacity={0.5} />
                  <Rect
                    x={24}
                    y={h * 0.55 + h * 0.25 * (1 - draw)}
                    width={12}
                    height={h * 0.25 * draw}
                    rx={6}
                    fill={draw >= 0.95 ? (s.holdTime > 3 ? palette.coral : palette.mint) : palette.sky}
                  />
                </G>
              )}
              {s.holding && s.phase === 'aim' && (
                <Reticle x={s.fingerX + w.x} y={s.fingerY - AIM_OFFSET + w.y} color={draw >= 0.95 ? palette.mint : palette.offWhite} size={12} />
              )}
            </G>
          );
        }}
      </Stage>
    </View>
  );
}
