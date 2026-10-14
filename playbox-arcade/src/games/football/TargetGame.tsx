import React, { useRef } from 'react';
import { View } from 'react-native';
import { Circle, G, Rect, Text as SvgText } from 'react-native-svg';
import { feedback } from '../../audio/sounds';
import { useT } from '../../i18n';
import { palette, svgFont } from '../../theme';
import { FlickTracker } from '../../engine/flick';
import { Hud, HintBar } from '../../engine/Hud';
import { clamp, easeOutCubic, randRange } from '../../engine/math';
import { Stage, WORLD_W } from '../../engine/Stage';
import type { GameProps } from '../../engine/types';
import { useGameLoop } from '../../engine/useGameLoop';
import { useFx, useRerender } from '../../engine/useFx';
import { BallSprite } from '../shared/sprites';
import { goalGeo, shotTarget, toScreen } from './logic';
import { Goal, GoalTarget, Pitch } from './scene';

const DURATION = 45;
const FLIGHT = 0.32;
const TIERS = [
  { r: 0.11, points: 50, life: 5 },
  { r: 0.08, points: 100, life: 4.2 },
  { r: 0.055, points: 150, life: 3.5 },
];

interface Target {
  id: number;
  u: number;
  v: number;
  /** Rayon relatif à la largeur du but. */
  r: number;
  points: number;
  life: number;
  maxLife: number;
}

interface Ball {
  u: number;
  v: number;
  t: number;
}

interface State {
  phase: 'play' | 'over';
  time: number;
  remaining: number;
  targets: Target[];
  balls: Ball[];
  score: number;
  combo: number;
  nextSpawn: number;
  nextId: number;
  touching: boolean;
  stats: { hits: number; shots: number; bestCombo: number };
}

function spawn(s: State) {
  const tier = TIERS[Math.floor(Math.random() * TIERS.length)];
  const target: Target = {
    id: s.nextId++,
    u: randRange(tier.r + 0.03, 1 - tier.r - 0.03),
    v: randRange(tier.r * 2.8 + 0.04, 1 - tier.r * 2.8 - 0.04),
    r: tier.r,
    points: tier.points,
    life: tier.life,
    maxLife: tier.life,
  };
  // Évite les chevauchements avec les cibles présentes.
  if (s.targets.every((o) => Math.hypot(o.u - target.u, (o.v - target.v) * 0.36) > o.r + target.r + 0.04)) s.targets.push(target);
}

export default function TargetGame({ paused, settings, skins, onFinish }: GameProps) {
  const t = useT();
  const rerender = useRerender();
  const fx = useFx();
  const tracker = useRef(new FlickTracker()).current;
  const s = useRef<State>({
    phase: 'play',
    time: 0,
    remaining: DURATION,
    targets: [],
    balls: [],
    score: 0,
    combo: 0,
    nextSpawn: 0,
    nextId: 1,
    touching: false,
    stats: { hits: 0, shots: 0, bestCombo: 0 },
  }).current;
  const geo = useRef({ h: 700 }).current;

  const finish = () => {
    s.phase = 'over';
    feedback(null, 'success');
    fx.float(t('play.timeUp'), WORLD_W / 2, geo.h * 0.5, palette.yellow, 36);
    onFinish({
      score: s.score,
      performance: clamp(s.score / 3000, 0, 1),
      won: s.score >= 2500,
      stats: { targetsHit: s.stats.hits },
      summary: [
        { label: t('play.targetsHit'), value: `${s.stats.hits} / ${s.stats.shots}` },
        { label: t('play.accuracy'), value: s.stats.shots ? `${Math.round((s.stats.hits / s.stats.shots) * 100)} %` : '—' },
        { label: t('play.bestCombo'), value: `x${s.stats.bestCombo}` },
      ],
    });
  };

  const impact = (b: Ball) => {
    const g = goalGeo(geo.h);
    const pos = toScreen(g, b.u, b.v);
    const ballR = (settings.aimAssist ? 0.045 : 0.03);
    const hit = s.targets.find((tg) => Math.hypot(tg.u - b.u, (tg.v - b.v) * (g.height / g.width)) <= tg.r + ballR);
    if (hit) {
      s.targets = s.targets.filter((tg) => tg !== hit);
      s.combo += 1;
      s.stats.hits += 1;
      s.stats.bestCombo = Math.max(s.stats.bestCombo, s.combo);
      const mult = Math.min(4, 1 + Math.floor((s.combo - 1) / 2));
      const pts = hit.points * mult;
      s.score += pts;
      feedback('correct', 'medium');
      fx.float(`+${pts}`, pos.x, pos.y - 10, hit.points >= 150 ? palette.yellow : palette.offWhite, 30);
      if (mult > 1) fx.float(t('play.combo', { n: mult }), WORLD_W / 2, g.bottom + 40, palette.coral, 26);
      fx.pop(pos.x, pos.y, [palette.yellow, palette.mint, palette.sky]);
    } else {
      s.combo = 0;
      feedback('impact', 'light');
    }
  };

  useGameLoop((dt) => {
    if (s.phase !== 'play') return;
    s.time += dt;
    s.remaining = Math.max(0, DURATION - s.time);
    // Cibles : vie qui s'écoule, apparition régulière (plus rapide en fin de partie).
    for (const tg of s.targets) tg.life -= dt;
    s.targets = s.targets.filter((tg) => tg.life > 0);
    if (s.time >= s.nextSpawn && s.targets.length < 3) {
      spawn(s);
      s.nextSpawn = s.time + (s.remaining > 20 ? 1.3 : 0.9);
    }
    for (const b of s.balls) b.t += dt / FLIGHT;
    const arrived = s.balls.filter((b) => b.t >= 1);
    s.balls = s.balls.filter((b) => b.t < 1);
    arrived.forEach(impact);
    if (s.remaining <= 0) finish();
    rerender();
  }, !paused && s.phase === 'play');

  const gestures = {
    onStart: (p: { x: number; y: number }) => {
      if (s.phase !== 'play' || paused) return;
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
      if (!flick || flick.dy > -30 || flick.speed < 300) return;
      const g = goalGeo(geo.h);
      const target = shotTarget(g, { ballX: WORLD_W / 2, ballY: geo.h * 0.79 - 16, dx: flick.dx, dy: flick.dy, speed: flick.speed, curve: 0 }, settings.aimAssist);
      s.balls.push({ u: target.u, v: target.v, t: 0 });
      s.stats.shots += 1;
      feedback('kick', 'light');
    },
  };

  return (
    <View style={{ flex: 1 }}>
      <Hud
        items={[
          { label: t('play.time'), value: `${Math.ceil(s.remaining)} s`, color: s.remaining <= 10 ? palette.coral : palette.text },
          { label: t('play.streak'), value: s.combo ? `x${s.combo}` : '—' },
          { label: t('play.score'), value: s.score, color: palette.yellow },
        ]}
      />
      <Stage
        gestures={gestures}
        overlay={(size) => (
          <>
            {fx.render(size)}
            {s.time < 4 && <HintBar text={t('play.kickHint')} />}
          </>
        )}
      >
        {(size) => {
          const h = size.h;
          geo.h = h;
          const g = goalGeo(h);
          const home = { x: WORLD_W / 2, y: h * 0.79 - 16 };
          return (
            <G>
              <Pitch h={h} g={g} />
              <Goal g={g} />
              {s.targets.map((tg) => {
                const pos = toScreen(g, tg.u, tg.v);
                return (
                  <G key={tg.id}>
                    <GoalTarget x={pos.x} y={pos.y} r={tg.r * g.width} points={tg.points} life={tg.life / tg.maxLife} />
                    <SvgText x={pos.x} y={pos.y + tg.r * g.width + 14} fontSize={11} fontWeight="900" fontFamily={svgFont} fill={palette.offWhite} textAnchor="middle">
                      {tg.points}
                    </SvgText>
                  </G>
                );
              })}
              {s.balls.map((b, i) => {
                const end = toScreen(g, b.u, b.v);
                const k = easeOutCubic(b.t);
                return (
                  <BallSprite
                    key={i}
                    x={home.x + (end.x - home.x) * k}
                    y={home.y + (end.y - home.y) * k - Math.sin(Math.PI * b.t) * 20}
                    r={16 - 8 * k}
                    skin={skins.ball}
                    spin={b.t * 600}
                  />
                );
              })}
              <Circle cx={home.x} cy={home.y + 15} r={14} fill="#000" opacity={0.25} />
              <BallSprite x={home.x} y={home.y} r={16} skin={skins.ball} />
              {/* Barre de temps */}
              <Rect x={20} y={h * 0.92} width={WORLD_W - 40} height={8} rx={4} fill="rgba(255,255,255,0.12)" />
              <Rect
                x={20}
                y={h * 0.92}
                width={(WORLD_W - 40) * (s.remaining / DURATION)}
                height={8}
                rx={4}
                fill={s.remaining <= 10 ? palette.coral : palette.mint}
              />
            </G>
          );
        }}
      </Stage>
    </View>
  );
}
