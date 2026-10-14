import React from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { APP_NAME, APP_NAME_SUFFIX } from '../config/app';
import { palette } from '../theme';
import { useSvgId } from './Gradient';

const LOGO_FONT = Platform.select({ web: "'Arial Black', 'Helvetica Neue', Arial, sans-serif", android: 'sans-serif-black', default: undefined });

/** Emblème : cible + éclair, utilisé comme logo et icône. */
export function LogoMark({ size = 48 }: { size?: number }) {
  const id = useSvgId('lm');
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={palette.violet} />
          <Stop offset="1" stopColor={palette.coral} />
        </LinearGradient>
      </Defs>
      <Rect x={2} y={2} width={60} height={60} rx={18} fill={`url(#${id})`} />
      <Circle cx={32} cy={32} r={20} fill="none" stroke={palette.offWhite} strokeWidth={4} />
      <Circle cx={32} cy={32} r={11} fill="none" stroke={palette.offWhite} strokeWidth={4} opacity={0.85} />
      <Path d="M35 14 L24 34 H31 L28 50 L41 28 H33 Z" fill={palette.yellow} stroke={palette.night} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** Logo complet : emblème + nom (APP_NAME) + bandeau (APP_NAME_SUFFIX). */
export function Logo({ width = 260 }: { width?: number }) {
  const id = useSvgId('lg');
  const h = width * 0.42;
  return (
    <Svg width={width} height={h} viewBox="0 0 260 110">
      <Defs>
        <LinearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={palette.yellow} />
          <Stop offset="0.5" stopColor={palette.coral} />
          <Stop offset="1" stopColor={palette.pink} />
        </LinearGradient>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={palette.violet} />
          <Stop offset="1" stopColor={palette.electric} />
        </LinearGradient>
      </Defs>
      <G>
        <SvgText x={133} y={62} fontSize={54} fontWeight="900" fontFamily={LOGO_FONT} fill={palette.black} textAnchor="middle" letterSpacing={2} opacity={0.6}>
          {APP_NAME}
        </SvgText>
        <SvgText x={130} y={58} fontSize={54} fontWeight="900" fontFamily={LOGO_FONT} fill={`url(#${id}t)`} textAnchor="middle" letterSpacing={2}>
          {APP_NAME}
        </SvgText>
        <Rect x={62} y={70} width={136} height={30} rx={15} fill={`url(#${id}b)`} />
        <SvgText x={130} y={92} fontSize={19} fontWeight="900" fontFamily={LOGO_FONT} fill={palette.offWhite} textAnchor="middle" letterSpacing={8}>
          {APP_NAME_SUFFIX}
        </SvgText>
      </G>
    </Svg>
  );
}
