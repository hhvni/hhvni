import { useEffect, useRef } from 'react';

/**
 * Boucle de jeu basée sur requestAnimationFrame.
 * `step(dt)` reçoit le temps écoulé en secondes (borné à 50 ms pour éviter les sauts après une pause).
 */
export function useGameLoop(step: (dt: number, time: number) => void, running: boolean) {
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      stepRef.current(dt, now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}
