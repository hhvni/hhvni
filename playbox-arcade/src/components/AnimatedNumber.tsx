import React, { useEffect, useRef, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

/** Compteur qui défile jusqu'à la valeur cible. */
export function AnimatedNumber({ value, style, duration = 600, prefix = '' }: { value: number; style?: StyleProp<TextStyle>; duration?: number; prefix?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = Date.now();
    const a = from.current;
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return (
    <Text style={style}>
      {prefix}
      {shown}
    </Text>
  );
}
