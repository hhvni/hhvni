import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n';
import { palette, type } from '../theme';
import { Backdrop } from './Backdrop';
import { Logo, LogoMark } from './Logo';

/** Écran de démarrage animé, affiché pendant le chargement de la sauvegarde. */
export function Splash({ visible, onHidden }: { visible: boolean; onHidden: () => void }) {
  const t = useT();
  const intro = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(intro, { toValue: 1, useNativeDriver: true, bounciness: 14, speed: 8 }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(spin, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(spin, { toValue: 0, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [intro, spin]);

  useEffect(() => {
    if (!visible) {
      Animated.timing(out, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => onHidden());
    }
  }, [visible, out, onHidden]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: out, zIndex: 10 }]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={styles.root}>
        <Backdrop />
        <Animated.View
          style={{
            alignItems: 'center',
            opacity: intro,
            transform: [{ scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          }}
        >
          <Animated.View style={{ transform: [{ scale: spin.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }, { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'] }) }] }}>
            <LogoMark size={96} />
          </Animated.View>
          <View style={{ height: 18 }} />
          <Logo width={280} />
          <Text style={[type.small, { color: palette.textMuted, marginTop: 6, letterSpacing: 1.5 }]}>{t('splash.tagline')}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.night },
});
