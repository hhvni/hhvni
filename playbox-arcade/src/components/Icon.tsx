import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';

export type IconName =
  | 'gear' | 'coin' | 'star' | 'trophy' | 'back' | 'play' | 'lock' | 'user' | 'sound' | 'music'
  | 'vibrate' | 'target' | 'ball' | 'heart' | 'bow' | 'dart' | 'ring' | 'pin' | 'clock' | 'check'
  | 'close' | 'refresh' | 'home' | 'pause' | 'flame' | 'globe' | 'info' | 'eye' | 'trash' | 'crown'
  | 'compass' | 'chat' | 'cards' | 'users' | 'goal' | 'wall' | 'crosshair' | 'bolt' | 'edit' | 'gift'
  | 'hand' | 'sparkle';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  /** Couleur secondaire pour les icônes bicolores. */
  accent?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = '#F6F1E7', accent, strokeWidth = 2 }: Props) {
  const s = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const a = accent ?? color;
  let body: React.ReactNode;
  switch (name) {
    case 'gear':
      body = (
        <G>
          <Circle cx={12} cy={12} r={3.2} {...s} />
          <Path
            d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
            {...s}
          />
          <Circle cx={12} cy={12} r={6.6} {...s} />
        </G>
      );
      break;
    case 'coin':
      body = (
        <G>
          <Circle cx={12} cy={12} r={9} fill={color} />
          <Circle cx={12} cy={12} r={6.6} fill="none" stroke={a} strokeWidth={1.4} />
          <Polygon points="12,7.6 13.3,10.4 16.3,10.7 14,12.7 14.7,15.6 12,14.1 9.3,15.6 10,12.7 7.7,10.7 10.7,10.4" fill={a} />
        </G>
      );
      break;
    case 'star':
      body = <Polygon points="12,2.8 14.8,8.9 21.3,9.5 16.4,13.9 17.8,20.4 12,17.1 6.2,20.4 7.6,13.9 2.7,9.5 9.2,8.9" fill={color} />;
      break;
    case 'sparkle':
      body = <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={color} />;
      break;
    case 'trophy':
      body = (
        <G>
          <Path d="M7 4h10v5a5 5 0 01-10 0z" fill={color} />
          <Path d="M7 6H4.5a3 3 0 003 4M17 6h2.5a3 3 0 01-3 4" {...s} />
          <Path d="M12 14v4M8 20.5h8" {...s} />
        </G>
      );
      break;
    case 'crown':
      body = <Path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill={color} />;
      break;
    case 'back':
      body = <Path d="M15 5l-7 7 7 7" {...s} strokeWidth={strokeWidth + 0.6} />;
      break;
    case 'play':
      body = <Path d="M8 5.5v13l10.5-6.5z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />;
      break;
    case 'pause':
      body = (
        <G>
          <Rect x={6.5} y={5} width={4} height={14} rx={1.5} fill={color} />
          <Rect x={13.5} y={5} width={4} height={14} rx={1.5} fill={color} />
        </G>
      );
      break;
    case 'lock':
      body = (
        <G>
          <Rect x={5} y={10.5} width={14} height={10} rx={2.5} fill={color} />
          <Path d="M8 10.5V8a4 4 0 018 0v2.5" {...s} />
        </G>
      );
      break;
    case 'user':
      body = (
        <G>
          <Circle cx={12} cy={8.5} r={4} fill={color} />
          <Path d="M4 20.5c1.2-4 4.3-6 8-6s6.8 2 8 6" fill={color} />
        </G>
      );
      break;
    case 'users':
      body = (
        <G>
          <Circle cx={9} cy={8.5} r={3.4} fill={color} />
          <Path d="M2.5 19.5c1-3.4 3.6-5.2 6.5-5.2s5.5 1.8 6.5 5.2" fill={color} />
          <Circle cx={16.5} cy={7.5} r={2.8} fill={a} />
          <Path d="M15.5 12.8c3 .1 5 1.8 6 4.8" stroke={a} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </G>
      );
      break;
    case 'sound':
      body = (
        <G>
          <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill={color} />
          <Path d="M15.5 9a4.2 4.2 0 010 6M18 6.5a8 8 0 010 11" {...s} />
        </G>
      );
      break;
    case 'music':
      body = (
        <G>
          <Path d="M9 17.5V5.5l10-2v12" {...s} />
          <Circle cx={6.8} cy={17.5} r={2.6} fill={color} />
          <Circle cx={16.8} cy={15.5} r={2.6} fill={color} />
        </G>
      );
      break;
    case 'vibrate':
      body = (
        <G>
          <Rect x={8} y={3.5} width={8} height={17} rx={2} {...s} />
          <Path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3" {...s} />
        </G>
      );
      break;
    case 'target':
      body = (
        <G>
          <Circle cx={12} cy={12} r={9} {...s} />
          <Circle cx={12} cy={12} r={5.5} {...s} />
          <Circle cx={12} cy={12} r={2} fill={a} />
        </G>
      );
      break;
    case 'crosshair':
      body = (
        <G>
          <Circle cx={12} cy={12} r={7} {...s} />
          <Path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" {...s} />
        </G>
      );
      break;
    case 'ball':
      body = (
        <G>
          <Circle cx={12} cy={12} r={9} fill={color} />
          <Polygon points="12,8.2 15.4,10.6 14.1,14.6 9.9,14.6 8.6,10.6" fill={a === color ? '#11163A' : a} />
          <Path d="M12 8.2V3.3M15.4 10.6l4.4-1.6M14.1 14.6l2.8 3.8M9.9 14.6l-2.8 3.8M8.6 10.6L4.2 9" stroke={a === color ? '#11163A' : a} strokeWidth={1.3} />
        </G>
      );
      break;
    case 'heart':
      body = <Path d="M12 20.5s-8-4.7-8-10.6A4.6 4.6 0 0112 7.1a4.6 4.6 0 018 2.8c0 5.9-8 10.6-8 10.6z" fill={color} />;
      break;
    case 'bow':
      body = (
        <G>
          <Path d="M6 3c6 3 9 9 6 18" {...s} />
          <Path d="M6.2 3.2L12 21" stroke={a} strokeWidth={1.2} />
          <Path d="M3.5 13.5H20M17 11l3 2.5-3 2.5" {...s} />
        </G>
      );
      break;
    case 'dart':
      body = (
        <G>
          <Path d="M4 20l9.5-9.5" {...s} />
          <Path d="M13 11l4-4" stroke={a} strokeWidth={strokeWidth + 1.5} strokeLinecap="round" />
          <Path d="M16 4l4 4-2.5.5L15.5 6.5z" fill={color} />
        </G>
      );
      break;
    case 'ring':
      body = (
        <G>
          <Ellipse cx={12} cy={15} rx={8} ry={3.5} {...s} strokeWidth={strokeWidth + 0.8} />
          <Path d="M12 3.5v11" stroke={a} strokeWidth={strokeWidth + 0.8} strokeLinecap="round" />
        </G>
      );
      break;
    case 'pin':
      body = (
        <Path
          d="M12 2.5c1.8 0 2.6 1.6 2.3 3.6-.2 1.1-.9 1.7-.9 2.6 0 1.2 2.6 3.5 2.6 7.3 0 3-1.6 5.5-4 5.5s-4-2.5-4-5.5c0-3.8 2.6-6.1 2.6-7.3 0-.9-.7-1.5-.9-2.6-.3-2 .5-3.6 2.3-3.6z"
          fill={color}
        />
      );
      break;
    case 'clock':
      body = (
        <G>
          <Circle cx={12} cy={12} r={9} {...s} />
          <Path d="M12 7v5l3.5 2" {...s} />
        </G>
      );
      break;
    case 'check':
      body = <Path d="M4.5 12.5l5 5 10-11" {...s} strokeWidth={strokeWidth + 0.6} />;
      break;
    case 'close':
      body = <Path d="M6 6l12 12M18 6L6 18" {...s} strokeWidth={strokeWidth + 0.4} />;
      break;
    case 'refresh':
      body = (
        <G>
          <Path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" {...s} />
          <Path d="M18.5 3v4.2h-4.2" {...s} />
        </G>
      );
      break;
    case 'home':
      body = <Path d="M3.5 11L12 4l8.5 7M6 9.5V20h4.5v-5h3v5H18V9.5" {...s} />;
      break;
    case 'flame':
      body = <Path d="M12 2.5c1 4 5.5 5.5 5.5 11a5.5 5.5 0 01-11 0c0-2.6 1.4-4 2.4-5 .2 1.8 1 2.9 2.1 3.3-.6-3.4.2-6.6 1-9.3z" fill={color} />;
      break;
    case 'globe':
      body = (
        <G>
          <Circle cx={12} cy={12} r={9} {...s} />
          <Ellipse cx={12} cy={12} rx={4} ry={9} {...s} />
          <Path d="M3 12h18" {...s} />
        </G>
      );
      break;
    case 'info':
      body = (
        <G>
          <Circle cx={12} cy={12} r={9} {...s} />
          <Path d="M12 11v6" {...s} />
          <Circle cx={12} cy={7.6} r={1.2} fill={color} />
        </G>
      );
      break;
    case 'eye':
      body = (
        <G>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...s} />
          <Circle cx={12} cy={12} r={3} fill={color} />
        </G>
      );
      break;
    case 'trash':
      body = <Path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6" {...s} />;
      break;
    case 'compass':
      body = (
        <G>
          <Circle cx={12} cy={12} r={9} {...s} />
          <Polygon points="15.5,8.5 13.2,13.2 8.5,15.5 10.8,10.8" fill={a} />
        </G>
      );
      break;
    case 'chat':
      body = (
        <G>
          <Path d="M4 5.5h16v10.5H10l-4.5 4v-4H4z" fill={color} />
          <Circle cx={8.5} cy={10.8} r={1.1} fill={a === color ? '#11163A' : a} />
          <Circle cx={12} cy={10.8} r={1.1} fill={a === color ? '#11163A' : a} />
          <Circle cx={15.5} cy={10.8} r={1.1} fill={a === color ? '#11163A' : a} />
        </G>
      );
      break;
    case 'cards':
      body = (
        <G>
          <Rect x={3.5} y={6} width={11} height={15} rx={2} fill={a} transform="rotate(-10 9 13.5)" />
          <Rect x={9.5} y={3.5} width={11} height={15} rx={2} fill={color} transform="rotate(8 15 11)" />
        </G>
      );
      break;
    case 'goal':
      body = (
        <G>
          <Path d="M2.5 19V6.5h19V19" {...s} />
          <Path d="M2.5 10.5h19M2.5 14.5h19M7.5 6.5V19M12 6.5V19M16.5 6.5V19" stroke={color} strokeWidth={0.8} opacity={0.6} />
          <Circle cx={18} cy={17.5} r={2.5} fill={a} />
        </G>
      );
      break;
    case 'wall':
      body = (
        <G>
          {[5, 9.5, 14, 18.5].map((x) => (
            <G key={x}>
              <Circle cx={x} cy={7} r={1.8} fill={color} />
              <Rect x={x - 1.8} y={9.5} width={3.6} height={10} rx={1.5} fill={color} />
            </G>
          ))}
        </G>
      );
      break;
    case 'bolt':
      body = <Path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z" fill={color} />;
      break;
    case 'edit':
      body = <Path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19zM13.5 7l3.5 3.5" {...s} />;
      break;
    case 'gift':
      body = (
        <G>
          <Rect x={3.5} y={8.5} width={17} height={4} rx={1} fill={color} />
          <Rect x={5} y={12.5} width={14} height={8} rx={1} fill={color} />
          <Path d="M12 8.5v12" stroke={a === color ? '#11163A' : a} strokeWidth={2} />
          <Path d="M12 8.5C10 4 6.5 5 7.5 7.5c.6 1.2 4.5 1 4.5 1s3.9.2 4.5-1C17.5 5 14 4 12 8.5z" {...s} />
        </G>
      );
      break;
    case 'hand':
      body = (
        <Path
          d="M9 11V5a1.5 1.5 0 013 0v5.5V4a1.5 1.5 0 013 0v6.5V6a1.5 1.5 0 013 0v8.5c0 4-2.5 6.5-6.5 6.5-2.6 0-4.2-1.3-5.4-3.4L4.4 13.4a1.5 1.5 0 012.5-1.6L9 14z"
          {...s}
        />
      );
      break;
    default:
      body = <Line x1={4} y1={12} x2={20} y2={12} {...s} />;
  }
  // La vue englobante garantit l'ordre d'affichage au-dessus des fonds en dégradé (web).
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {body}
      </Svg>
    </View>
  );
}
