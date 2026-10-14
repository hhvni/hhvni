import React, { useRef } from 'react';
import { View } from 'react-native';
import { Circle, G } from 'react-native-svg';
import { feedback } from '../../audio/sounds';
import { useT } from '../../i18n';
import { palette } from '../../theme';
import { FlickTracker } from '../../engine/flick';
import { Hud, HintBar } from '../../engine/Hud';
import { clamp, easeOutCubic, quadBezier, randRange } from '../../engine/math';
import { Stage, WORLD_W } from '../../engine/Stage';
import type { GameProps } from '../../engine/types';
import { useGameLoop } from '../../engine/useGameLoop';
import { useFx, useRerender } from '../../engine/useFx';
import { BallSprite } from '../shared/sprites';
import { ballHeight, chooseDive, Dive, goalGeo, GoalGeo, isTopCorner, loftFor, resolveShot, shotTarget, ShotOutcome, toScreen } from './logic';
import { Defender, Goal, Keeper, Pitch } from './scene';

const SHOTS = 8;
const FLIGHT = 0.75;
const WALL_TOP = 0.72;
const WALL_JUMP = 0.2;

interface Setup {
  /** Décalage horizontal du ballon et profondeur relative (0 = proche, 1 = loin). */
  ballDx: number;
  depth: number;
  wallCount: number;
  wallJumps: boolean;
}

interface Shot {
  u: number;
  v: number;
  loft: number;
  /** Point de contrôle de la courbe au sol (coordonnées écran). */
  cx: number;
  cy: number;
  outcome: ShotOutcome;
  dive: Dive;
  t: number;
  after: number;
  /** Paramètre où le ballon est stoppé par le mur (sinon 1). */
  stopAt: number;
  curved: boolean;
}

interface State {
  phase: 'aim' | 'flight' | 'after' | 'over';
  index: number;
  setup: Setup;
  goals: number;
  points: number;
  history: boolean[];
  touching: boolean;
  time: number;
  shot: Shot | null;
  bulge: number;
  stats: { goals: number; topCorners: number; curved: number };
  hint: string | null;
}

function makeSetup(index: number): Setup {
  return {
    ballDx: randRange(-110, 110),
    depth: Math.min(1, 0.2 + index * 0.1 + Math.random() * 0.2),
    wallCount: index < 3 ? 3 : index < 6 ? 4 : 5,
    wallJumps: Math.random() < 0.35 + index * 0.05,
  };
}

/** Géométrie de la scène pour une configuration : ballon, mur, gardien. */
function layout(h: number, g: GoalGeo, setup: Setup) {
  const ballY = h * (0.7 + setup.depth * 0.1);
  const ballX = WORLD_W / 2 + setup.ballDx;
  const nearSide = setup.ballDx < 0 ? 0.28 : 0.72;
  const aim = toScreen(g, nearSide, 0);
  const wallY = g.bottom + (ballY - g.bottom) * 0.42;
  const k = (wallY - ballY) / (aim.y - ballY);
  const wallX = ballX + (aim.x - ballX) * k;
  const wallScale = 0.62 + 0.25 * ((wallY - g.bottom) / (h - g.bottom));
  const spacing = 30 * wallScale;
  const wallHalf = (setup.wallCount * spacing) / 2;
  const keeperU = setup.ballDx < 0 ? 0.64 : 0.36;
  return { ballX, ballY, wallX, wallY, wallScale, spacing, wallHalf, keeperU };
}

export default function FreeKickGame({ paused, settings, skins, onFinish }: GameProps) {
  const t = useT();
  const rerender = useRerender();
  const fx = useFx();
  const tracker = useRef(new FlickTracker()).current;
  const s = useRef<State>({
    phase: 'aim',
    index: 0,
    setup: makeSetup(0),
    goals: 0,
    points: 0,
    history: [],
    touching: false,
    time: 0,
    shot: null,
    bulge: 0,
    stats: { goals: 0, topCorners: 0, curved: 0 },
    hint: null,
  }).current;
  const geo = useRef({ h: 700 }).current;

  const finish = () => {
    s.phase = 'over';
    onFinish({
      score: s.points,
      performance: clamp(s.goals / (SHOTS * 0.6), 0, 1),
      won: s.goals >= SHOTS / 2,
      stats: { freekickGoals: s.stats.goals, topCorners: s.stats.topCorners },
      summary: [
        { label: t('play.goals'), value: `${s.goals} / ${SHOTS}` },
        { label: t('play.topCorners'), value: String(s.stats.topCorners) },
        { label: t('play.curveGoals'), value: String(s.stats.curved) },
      ],
    });
  };

  /** Point du sol (écran) et hauteur du ballon au paramètre tt. */
  const ballAt = (sh: Shot, tt: number, L: ReturnType<typeof layout>, g: GoalGeo) => {
    const end = toScreen(g, sh.u, 0);
    const k = easeOutCubic(tt);
    const gx = quadBezier(L.ballX, sh.cx, end.x, k);
    const gy = quadBezier(L.ballY, sh.cy, end.y, k);
    const lift = ballHeight(sh.v, sh.loft, k) * g.height * (1 + 0.5 * (1 - k));
    return { x: gx, y: gy - lift, groundY: gy, k };
  };

  const resolve = () => {
    const sh = s.shot!;
    const g = goalGeo(geo.h);
    const pos = toScreen(g, clamp(sh.u, -0.1, 1.1), clamp(sh.v, 0, 1.2));
    const scored = sh.outcome === 'goal';
    s.history.push(scored);
    if (scored) {
      const corner = isTopCorner(sh.u, sh.v);
      const pts = 100 + (corner ? 50 : 0) + (sh.curved ? 25 : 0);
      s.goals += 1;
      s.points += pts;
      s.stats.goals += 1;
      if (corner) s.stats.topCorners += 1;
      if (sh.curved) s.stats.curved += 1;
      s.bulge = 1;
      feedback('goal', 'heavy');
      fx.float(corner ? t('play.topCorner') : t('play.goal'), WORLD_W / 2, g.top - 10, corner ? palette.yellow : palette.mint, 44);
      fx.float(`+${pts}`, pos.x, pos.y + 40, palette.offWhite, 26);
      fx.pop(pos.x, pos.y, [palette.mint, palette.yellow, palette.offWhite]);
    } else {
      feedback(sh.outcome === 'post' || sh.outcome === 'wall' ? 'impact' : 'wrong', 'medium');
      const label = { saved: t('play.saved'), post: t('play.post'), wide: t('play.wide'), over: t('play.over'), wall: t('play.wallBlock'), goal: '' }[sh.outcome];
      fx.float(label, WORLD_W / 2, g.top - 10, palette.coral, 38);
    }
  };

  useGameLoop((dt) => {
    s.time += dt;
    if (s.bulge > 0) s.bulge = Math.max(0, s.bulge - dt * 1.5);
    const sh = s.shot;
    if (s.phase === 'flight' && sh) {
      sh.t += dt / FLIGHT;
      if (sh.t >= sh.stopAt) {
        sh.t = sh.stopAt;
        s.phase = 'after';
        resolve();
      }
    } else if (s.phase === 'after' && sh) {
      sh.after += dt;
      if (sh.after >= 1.3) {
        s.shot = null;
        s.index += 1;
        if (s.index >= SHOTS) finish();
        else {
          s.setup = makeSetup(s.index);
          s.phase = 'aim';
        }
      }
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
      // Seuil bas : un geste courbé ralentit souvent dans le virage.
      const flick = tracker.analyze(150);
      if (!flick || flick.dy > -30 || flick.speed < 300) {
        fx.float(t('play.kickHint'), WORLD_W / 2, geo.h * 0.62, palette.sky, 20);
        return;
      }
      const g = goalGeo(geo.h);
      const L = layout(geo.h, g, s.setup);
      const target = shotTarget(g, { ballX: L.ballX, ballY: L.ballY, dx: flick.dx, dy: flick.dy, speed: flick.speed, curve: flick.curve }, settings.aimAssist);
      // Le ballon suit la forme du geste : point de contrôle décalé du côté du bombé.
      const end = toScreen(g, target.u, 0);
      const len = Math.hypot(flick.dx, flick.dy) || 1;
      const scaleK = Math.hypot(end.x - L.ballX, end.y - L.ballY) / len;
      const bow = clamp(flick.curve * scaleK * 2, -170, 170);
      const midX = (L.ballX + end.x) / 2;
      const midY = (L.ballY + end.y) / 2;
      const dirX = (end.x - L.ballX) / Math.hypot(end.x - L.ballX, end.y - L.ballY);
      const dirY = (end.y - L.ballY) / Math.hypot(end.x - L.ballX, end.y - L.ballY);
      const cx = midX - dirY * bow;
      const cy = midY + dirX * bow;
      const curved = Math.abs(bow) > 40;
      const loft = loftFor(target.v);
      const shot: Shot = { u: target.u, v: target.v, loft, cx, cy, outcome: 'goal', dive: { u: L.keeperU, v: 0.3 }, t: 0, after: 0, stopAt: 1, curved };

      // Passage au niveau du mur.
      let tw = 1;
      for (let i = 1; i <= 60; i++) {
        const tt = i / 60;
        const k = easeOutCubic(tt);
        if (quadBezier(L.ballY, cy, end.y, k) <= L.wallY) {
          tw = tt;
          break;
        }
      }
      const kw = easeOutCubic(tw);
      const xAtWall = quadBezier(L.ballX, cx, end.x, kw);
      const heightAtWall = ballHeight(target.v, loft, kw);
      const wallTop = WALL_TOP + (s.setup.wallJumps ? WALL_JUMP : 0) - (settings.aimAssist ? 0.08 : 0);
      if (Math.abs(xAtWall - L.wallX) <= L.wallHalf && heightAtWall < wallTop) {
        shot.outcome = 'wall';
        shot.stopAt = tw;
      } else {
        // Un ballon enroulé est plus difficile à lire pour le gardien.
        const skill = clamp(0.5 - (curved ? 0.22 : 0) - (settings.aimAssist ? 0.1 : 0), 0.1, 0.6);
        const dive = chooseDive(target, skill);
        // Le gardien part de sa position (côté opposé au mur) : son plongeon a une portée limitée.
        shot.dive = { u: L.keeperU + clamp(dive.u - L.keeperU, -0.42, 0.42), v: dive.v };
        shot.outcome = resolveShot(target, shot.dive);
      }
      s.shot = shot;
      s.phase = 'flight';
      feedback('kick', 'medium');
    },
  };

  return (
    <View style={{ flex: 1 }}>
      <Hud
        items={[
          { label: t('play.shots'), value: `${Math.min(s.index + 1, SHOTS)}/${SHOTS}` },
          { label: t('play.goals'), value: s.goals },
          { label: t('play.score'), value: s.points, color: palette.yellow },
        ]}
      />
      <Stage
        gestures={gestures}
        overlay={(size) => (
          <>
            {fx.render(size)}
            {s.phase === 'aim' && s.index === 0 && <HintBar text={t('play.curveHint')} />}
          </>
        )}
      >
        {(size) => {
          const h = size.h;
          geo.h = h;
          const g = goalGeo(h);
          const L = layout(h, g, s.setup);
          const sh = s.shot;
          let ku = L.keeperU + Math.sin(s.time * 1.6) * 0.03;
          let kv = 0;
          let tilt = 0;
          let reach = 0;
          if (sh && sh.outcome !== 'wall') {
            const k = easeOutCubic(clamp((sh.t * FLIGHT + sh.after - 0.15) / 0.4, 0, 1));
            ku = L.keeperU + (sh.dive.u - L.keeperU) * k;
            kv = Math.max(0, sh.dive.v - 0.3) * k;
            tilt = (sh.dive.u - L.keeperU) * 160 * k;
            reach = k;
          }
          const keeperPos = toScreen(g, ku, kv);
          const jumping = sh && s.setup.wallJumps ? Math.sin(Math.min(1, sh.t / 0.5) * Math.PI) : 0;

          let bx = L.ballX;
          let by = L.ballY - 14;
          let br = 15;
          let spin = 0;
          let shadowY = L.ballY;
          if (sh) {
            const b = ballAt(sh, sh.t, L, g);
            bx = b.x;
            by = b.y - 14 * (1 - b.k);
            shadowY = b.groundY;
            br = 15 - 6.5 * b.k;
            spin = sh.t * 900 * (sh.curved ? 1.6 : 1);
            if (s.phase === 'after') {
              const a = Math.min(1, sh.after / 0.6);
              if (sh.outcome === 'goal') {
                by -= 6 * a;
              } else if (sh.outcome === 'wall') {
                by += 50 * a;
                bx += (L.ballX < WORLD_W / 2 ? -1 : 1) * 40 * a;
                br += 3 * a;
              } else if (sh.outcome === 'saved' || sh.outcome === 'post') {
                bx += (sh.u < 0.5 ? -1 : 1) * 60 * a;
                by += 90 * a * a - 50 * a;
                br += 3 * a;
              } else {
                by -= 40 * a;
                br -= 3 * a;
              }
            }
          }
          const ballBehindWall = !!sh && sh.t > 0 && by < L.wallY - 20 && s.phase !== 'after';
          const keeperFront = sh && (sh.outcome === 'saved') && s.phase === 'after';
          const wall = Array.from({ length: s.setup.wallCount }, (_, i) => (
            <Defender
              key={i}
              x={L.wallX - L.wallHalf + L.spacing * (i + 0.5)}
              y={L.wallY}
              scale={L.wallScale}
              jump={jumping * (0.8 + 0.2 * Math.sin(i * 2.1))}
            />
          ));
          const ball = (
            <G>
              <Circle cx={bx} cy={shadowY} r={br * 0.85} fill="#000" opacity={0.2} />
              <BallSprite x={bx} y={by} r={Math.max(6, br)} skin={skins.ball} spin={spin} />
            </G>
          );
          return (
            <G>
              <Pitch h={h} g={g} spot={false} />
              <Goal g={g} bulge={s.bulge} bulgeU={sh?.u ?? 0.5} bulgeV={sh?.v ?? 0.5} />
              {!keeperFront && <Keeper x={keeperPos.x} y={keeperPos.y} tilt={tilt} reachUp={reach} scale={g.height / 112} color={palette.sky} />}
              {ballBehindWall && ball}
              {wall}
              {!ballBehindWall && ball}
              {keeperFront && <Keeper x={keeperPos.x} y={keeperPos.y} tilt={tilt} reachUp={reach} scale={g.height / 112} color={palette.sky} />}
              {Array.from({ length: SHOTS }, (_, i) => {
                const r = s.history[i];
                return (
                  <Circle
                    key={i}
                    cx={WORLD_W / 2 - ((SHOTS - 1) * 22) / 2 + i * 22}
                    cy={h * 0.93}
                    r={7}
                    fill={r === undefined ? 'rgba(255,255,255,0.15)' : r ? palette.mint : palette.red}
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
