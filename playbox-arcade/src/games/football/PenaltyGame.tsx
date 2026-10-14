import React, { useRef } from 'react';
import { View } from 'react-native';
import { Circle, G } from 'react-native-svg';
import { feedback } from '../../audio/sounds';
import { useT } from '../../i18n';
import { palette } from '../../theme';
import { FlickTracker } from '../../engine/flick';
import { Hud, HintBar } from '../../engine/Hud';
import { clamp, easeOutCubic } from '../../engine/math';
import { Stage, WORLD_W } from '../../engine/Stage';
import { firstTurn, nextShot, TurnState } from '../../engine/turns';
import type { GameProps } from '../../engine/types';
import { useGameLoop } from '../../engine/useGameLoop';
import { useFx, useRerender } from '../../engine/useFx';
import { BallSprite } from '../shared/sprites';
import { chooseDive, Dive, goalGeo, isTopCorner, resolveShot, shotTarget, ShotOutcome, toScreen } from './logic';
import { Goal, Keeper, Pitch } from './scene';

const FLIGHT = 0.42;
const DIVE = 0.36;

interface Shot {
  u: number;
  v: number;
  outcome: ShotOutcome;
  dive: Dive;
  t: number;
  after: number;
}

interface State {
  phase: 'aim' | 'flight' | 'after' | 'over';
  turn: TurnState;
  goals: number[];
  points: number[];
  history: boolean[][];
  streak: number[];
  touching: boolean;
  time: number;
  shot: Shot | null;
  bulge: number;
  stats: { goals: number; topCorners: number; hatTricks: number; saved: number; bestStreak: number; shots: number };
  hint: string | null;
}

export default function PenaltyGame({ mode, players, paused, settings, skins, onFinish }: GameProps) {
  const t = useT();
  const rerender = useRerender();
  const fx = useFx();
  const shotsPerPlayer = mode === 'duo' ? 5 : 10;
  const tracker = useRef(new FlickTracker()).current;
  const s = useRef<State>({
    phase: 'aim',
    turn: firstTurn(),
    goals: players.map(() => 0),
    points: players.map(() => 0),
    history: players.map(() => []),
    streak: players.map(() => 0),
    touching: false,
    time: 0,
    shot: null,
    bulge: 0,
    stats: { goals: 0, topCorners: 0, hatTricks: 0, saved: 0, bestStreak: 0, shots: 0 },
    hint: null,
  }).current;
  const geo = useRef({ h: 700 }).current;
  const ballHome = (h: number) => ({ x: WORLD_W / 2, y: h * 0.79 - 16 });

  const finish = () => {
    s.phase = 'over';
    const stats = { goals: s.stats.goals, topCorners: s.stats.topCorners, hatTricks: s.stats.hatTricks };
    const summary = [
      { label: t('play.goals'), value: `${s.stats.goals} / ${s.stats.shots}` },
      { label: t('play.bestStreak'), value: String(s.stats.bestStreak) },
      { label: t('play.topCorner'), value: String(s.stats.topCorners) },
    ];
    if (mode === 'duo') {
      const [a, b] = s.goals;
      const w = a === b ? (s.points[0] === s.points[1] ? -1 : s.points[0] > s.points[1] ? 0 : 1) : a > b ? 0 : 1;
      onFinish({
        score: Math.max(...s.points),
        performance: clamp(Math.max(a, b) / shotsPerPlayer, 0, 1),
        headline: w < 0 ? t('play.draw') : t('play.winnerIs', { name: players[w] }),
        won: true,
        stats,
        summary: [...players.map((p, i) => ({ label: p, value: `${s.goals[i]} ${t('play.goals').toLowerCase()}` })), ...summary],
      });
    } else {
      onFinish({
        score: s.points[0],
        performance: clamp(s.goals[0] / (shotsPerPlayer * 0.8), 0, 1),
        won: s.goals[0] >= shotsPerPlayer * 0.6,
        stats,
        summary,
      });
    }
  };

  const resolve = () => {
    const sh = s.shot!;
    const p = s.turn.player;
    const g = goalGeo(geo.h);
    const pos = toScreen(g, clamp(sh.u, -0.1, 1.1), clamp(sh.v, 0, 1.2));
    s.stats.shots += 1;
    const scored = sh.outcome === 'goal';
    s.history[p].push(scored);
    if (scored) {
      const corner = isTopCorner(sh.u, sh.v);
      s.goals[p] += 1;
      s.streak[p] += 1;
      s.stats.goals += 1;
      s.stats.bestStreak = Math.max(s.stats.bestStreak, s.streak[p]);
      if (s.streak[p] === 3) s.stats.hatTricks += 1;
      if (corner) s.stats.topCorners += 1;
      const pts = 100 + (corner ? 50 : 0) + Math.min(100, (s.streak[p] - 1) * 25);
      s.points[p] += pts;
      s.bulge = 1;
      feedback('goal', 'heavy');
      fx.float(corner ? t('play.topCorner') : t('play.goal'), WORLD_W / 2, g.top - 10, corner ? palette.yellow : palette.mint, 44);
      fx.float(`+${pts}`, pos.x, pos.y + 40, palette.offWhite, 26);
      fx.pop(pos.x, pos.y, [palette.mint, palette.yellow, palette.offWhite, palette.sky]);
    } else {
      s.streak[p] = 0;
      if (sh.outcome === 'saved') s.stats.saved += 1;
      feedback(sh.outcome === 'post' ? 'impact' : 'wrong', 'medium');
      const label = { saved: t('play.saved'), post: t('play.post'), wide: t('play.wide'), over: t('play.over'), wall: t('play.wallBlock'), goal: '' }[sh.outcome];
      fx.float(label, WORLD_W / 2, g.top - 10, palette.coral, 38);
    }
  };

  const advance = () => {
    s.shot = null;
    s.bulge = 0;
    const next = nextShot(s.turn, { rounds: shotsPerPlayer, players: players.length, perTurn: 1 });
    s.turn = next;
    if (next.done) finish();
    else {
      s.phase = 'aim';
      s.hint = players.length > 1 ? t('play.turnOf', { name: players[next.player] }) : null;
    }
  };

  useGameLoop((dt) => {
    s.time += dt;
    if (s.bulge > 0) s.bulge = Math.max(0, s.bulge - dt * 1.5);
    const sh = s.shot;
    if (s.phase === 'flight' && sh) {
      sh.t += dt / FLIGHT;
      if (sh.t >= 1) {
        sh.t = 1;
        s.phase = 'after';
        resolve();
      }
    } else if (s.phase === 'after' && sh) {
      sh.after += dt;
      if (sh.after >= 1.3) advance();
    }
    rerender();
  }, !paused && s.phase !== 'over');

  const gestures = {
    onStart: (p: { x: number; y: number }) => {
      if (s.phase !== 'aim' || paused) return;
      tracker.reset();
      tracker.add(p.x, p.y);
      s.touching = true;
      s.hint = null;
    },
    onMove: (p: { x: number; y: number }) => {
      if (s.touching) tracker.add(p.x, p.y);
    },
    onEnd: (p: { x: number; y: number }) => {
      if (!s.touching) return;
      s.touching = false;
      tracker.add(p.x, p.y);
      const flick = tracker.analyze(250);
      if (!flick || flick.dy > -30 || flick.speed < 300) {
        fx.float(t('play.kickHint'), WORLD_W / 2, geo.h * 0.66, palette.sky, 20);
        return;
      }
      const g = goalGeo(geo.h);
      const home = ballHome(geo.h);
      const target = shotTarget(g, { ballX: home.x, ballY: home.y, dx: flick.dx, dy: flick.dy, speed: flick.speed, curve: flick.curve }, settings.aimAssist);
      const skill = mode === 'duo' ? 0.42 : clamp(0.3 + s.turn.round * 0.03, 0.3, 0.6) - (settings.aimAssist ? 0.08 : 0);
      const dive = chooseDive(target, skill);
      s.shot = { u: target.u, v: target.v, outcome: resolveShot(target, dive), dive, t: 0, after: 0 };
      s.phase = 'flight';
      feedback('kick', 'medium');
    },
  };

  const p = s.turn.player;
  const hud =
    mode === 'duo'
      ? [
          { label: players[0], value: s.goals[0], active: p === 0, color: palette.coral },
          { label: t('play.shot'), value: `${Math.min(s.turn.round + 1, shotsPerPlayer)}/${shotsPerPlayer}` },
          { label: players[1], value: s.goals[1], active: p === 1, color: palette.sky },
        ]
      : [
          { label: t('play.shots'), value: `${Math.min(s.turn.round + 1, shotsPerPlayer)}/${shotsPerPlayer}` },
          { label: t('play.goals'), value: s.goals[0] },
          { label: t('play.score'), value: s.points[0], color: palette.yellow },
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
            {!s.hint && s.phase === 'aim' && s.stats.shots === 0 && <HintBar text={t('play.kickHint')} />}
          </>
        )}
      >
        {(size) => {
          const h = size.h;
          geo.h = h;
          const g = goalGeo(h);
          const home = ballHome(h);
          const sh = s.shot;
          // Gardien : léger balancement, puis plongeon vers sa cible.
          let ku = 0.5 + Math.sin(s.time * 1.8) * 0.05;
          let kv = 0;
          let tilt = 0;
          let reach = 0;
          if (sh) {
            const k = easeOutCubic(clamp((sh.t * FLIGHT + sh.after - 0.06) / DIVE, 0, 1));
            ku = 0.5 + (sh.dive.u - 0.5) * k;
            kv = Math.max(0, sh.dive.v - 0.3) * k;
            tilt = (sh.dive.u - 0.5) * 140 * k;
            reach = k;
          }
          const keeperPos = toScreen(g, ku, kv);
          // Trajectoire du ballon.
          let bx = home.x;
          let by = home.y;
          let br = 17;
          let spin = 0;
          if (sh) {
            const end = toScreen(g, sh.u, sh.v);
            const k = easeOutCubic(sh.t);
            bx = home.x + (end.x - home.x) * k;
            by = home.y + (end.y - home.y) * k - Math.sin(Math.PI * sh.t) * 26;
            br = 17 - 8 * k;
            spin = sh.t * 720;
            if (s.phase === 'after') {
              const a = Math.min(1, sh.after / 0.6);
              if (sh.outcome === 'goal') {
                by = end.y - 6 * a;
                br = 9 - 1.5 * a;
              } else if (sh.outcome === 'saved' || sh.outcome === 'post') {
                const dir = sh.u < 0.5 ? -1 : 1;
                bx = end.x + dir * 60 * a;
                by = end.y + 90 * a * a - 50 * a;
                br = 9 + 3 * a;
              } else {
                bx = end.x + (sh.u < 0 ? -40 : sh.u > 1 ? 40 : 0) * a;
                by = end.y - 40 * a;
                br = 9 - 3 * a;
              }
              spin = 720 + a * 360;
            }
          }
          const keeperBehind = !sh || s.phase === 'flight' || sh.outcome === 'goal';
          return (
            <G>
              <Pitch h={h} g={g} />
              <Goal g={g} bulge={s.bulge} bulgeU={sh?.u ?? 0.5} bulgeV={sh?.v ?? 0.5} />
              {keeperBehind && <Keeper x={keeperPos.x} y={keeperPos.y} tilt={tilt} reachUp={reach} scale={g.height / 112} />}
              <Circle cx={bx} cy={home.y + 15} r={br * 0.9} fill="#000" opacity={sh ? 0.1 : 0.25} />
              <BallSprite x={bx} y={by} r={br} skin={skins.ball} spin={spin} />
              {!keeperBehind && <Keeper x={keeperPos.x} y={keeperPos.y} tilt={tilt} reachUp={reach} scale={g.height / 112} />}
              {/* Historique des tirs du joueur actif */}
              {Array.from({ length: shotsPerPlayer }, (_, i) => {
                const r = s.history[p][i];
                const cx = WORLD_W / 2 - ((shotsPerPlayer - 1) * 22) / 2 + i * 22;
                return (
                  <Circle
                    key={i}
                    cx={cx}
                    cy={h * 0.92}
                    r={7}
                    fill={r === undefined ? 'rgba(255,255,255,0.15)' : r ? palette.mint : palette.red}
                    stroke="#05071A"
                    strokeOpacity={0.4}
                    strokeWidth={2}
                  />
                );
              })}
            </G>
          );
        }}
      </Stage>
    </View>
  );
}
