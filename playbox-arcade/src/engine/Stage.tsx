import React, { useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderGestureState, StyleSheet, View, ViewStyle } from 'react-native';
import Svg from 'react-native-svg';

/** Largeur logique de toutes les scènes. La hauteur s'adapte au ratio de l'écran. */
export const WORLD_W = 400;

export interface StageSize {
  /** Hauteur logique de la scène (largeur = WORLD_W). */
  h: number;
  /** Pixels écran par unité logique. */
  scale: number;
  widthPx: number;
  heightPx: number;
}

export interface Pointer {
  x: number;
  y: number;
  /** Vitesse en unités logiques par seconde. */
  vx: number;
  vy: number;
  /** Déplacement total depuis le début du geste. */
  dx: number;
  dy: number;
  /** Durée du geste en secondes. */
  duration: number;
}

export interface StageGestures {
  onStart?: (p: Pointer) => void;
  onMove?: (p: Pointer) => void;
  onEnd?: (p: Pointer) => void;
}

interface Props {
  children: (size: StageSize) => React.ReactNode;
  gestures?: StageGestures;
  /** Contenu React Native superposé (textes, particules) en pixels écran. */
  overlay?: (size: StageSize) => React.ReactNode;
  minHeight?: number;
}

/**
 * Scène de jeu vectorielle : convertit l'écran en coordonnées logiques (WORLD_W de large)
 * et fournit des gestes à un doigt exprimés dans ce repère.
 */
export function Stage({ children, gestures, overlay, minHeight = 560 }: Props) {
  const [size, setSize] = useState<StageSize | null>(null);
  const sizeRef = useRef<StageSize | null>(null);
  sizeRef.current = size;
  const gRef = useRef(gestures);
  gRef.current = gestures;
  const start = useRef({ x: 0, y: 0, t: 0 });

  const responder = useMemo(() => {
    const toPointer = (e: GestureResponderEvent, g: PanResponderGestureState): Pointer => {
      const s = sizeRef.current?.scale ?? 1;
      return {
        x: start.current.x + g.dx / s,
        y: start.current.y + g.dy / s,
        vx: (g.vx * 1000) / s,
        vy: (g.vy * 1000) / s,
        dx: g.dx / s,
        dy: g.dy / s,
        duration: (e.nativeEvent.timestamp - start.current.t) / 1000,
      };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, g) => {
        const s = sizeRef.current?.scale ?? 1;
        start.current = { x: e.nativeEvent.locationX / s, y: e.nativeEvent.locationY / s, t: e.nativeEvent.timestamp };
        gRef.current?.onStart?.(toPointer(e, g));
      },
      onPanResponderMove: (e, g) => gRef.current?.onMove?.(toPointer(e, g)),
      onPanResponderRelease: (e, g) => gRef.current?.onEnd?.(toPointer(e, g)),
      onPanResponderTerminate: (e, g) => gRef.current?.onEnd?.(toPointer(e, g)),
    });
  }, []);

  return (
    <View
      style={[styles.fill, { minHeight: Math.min(minHeight, 400) }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        const scale = width / WORLD_W;
        setSize({ h: height / scale, scale, widthPx: width, heightPx: height });
      }}
      {...responder.panHandlers}
    >
      {size && (
        <>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={size.widthPx} height={size.heightPx} viewBox={`0 0 ${WORLD_W} ${size.h}`}>
              {children(size)}
            </Svg>
          </View>
          {overlay && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {overlay(size)}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // userSelect : sur le web, une sélection de texte pendant un glisser interrompt le geste.
  fill: { flex: 1, overflow: 'hidden', userSelect: 'none' } as ViewStyle,
});
