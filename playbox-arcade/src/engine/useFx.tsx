import React, { useCallback, useReducer, useRef, useState } from 'react';
import { ParticleBurst } from '../components/Particles';
import { FloatText } from './Hud';
import type { StageSize } from './Stage';

interface FloatItem {
  id: number;
  text: string;
  x: number;
  y: number;
  color?: string;
  size?: number;
}

/** Effets visuels de partie : textes flottants et explosions de particules (coordonnées logiques). */
export function useFx() {
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [burst, setBurst] = useState<{ key: number; x: number; y: number; colors?: string[] }>({ key: 0, x: 0, y: 0 });
  const counter = useRef(0);

  const float = useCallback((text: string, x: number, y: number, color?: string, size?: number) => {
    counter.current += 1;
    const id = counter.current;
    setFloats((f) => [...f.slice(-2), { id, text, x, y, color, size }]);
  }, []);

  const pop = useCallback((x: number, y: number, colors?: string[]) => {
    counter.current += 1;
    setBurst({ key: counter.current, x, y, colors });
  }, []);

  const render = (size: StageSize) => (
    <>
      <ParticleBurst burstKey={burst.key} x={burst.x * size.scale} y={burst.y * size.scale} colors={burst.colors} />
      {floats.map((f) => (
        <FloatText key={f.id} id={f.id} text={f.text} x={f.x * size.scale} y={f.y * size.scale} color={f.color} size={f.size} />
      ))}
    </>
  );

  return { float, pop, render };
}

/** Force un rendu à chaque image pour les scènes dont l'état vit dans des refs. */
export function useRerender() {
  return useReducer((x: number) => (x + 1) % 1_000_000, 0)[1];
}
