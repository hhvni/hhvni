import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleProp, ViewStyle } from 'react-native';
import { palette } from '../theme';
import { Gradient } from './Gradient';

interface Props {
  progress: number;
  colors?: [string, string];
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ progress, colors = [palette.mint, palette.sky], height = 10, style }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const p = Math.max(0, Math.min(1, progress));
  useEffect(() => {
    Animated.timing(anim, { toValue: p, duration: 650, useNativeDriver: false }).start();
  }, [p, anim]);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
    >
      <Animated.View style={{ height, width: anim.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }}>
        <Gradient colors={colors} direction="horizontal" radius={height} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}
