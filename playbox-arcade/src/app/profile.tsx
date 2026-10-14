import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { feedback } from '../audio/sounds';
import { Gradient } from '../components/Gradient';
import { Icon } from '../components/Icon';
import { PressableScale } from '../components/PressableScale';
import { ProgressBar } from '../components/ProgressBar';
import { Header, Screen, SectionTitle } from '../components/Screen';
import { GAMES } from '../games/registry';
import { DartSprite, BallSprite, ArrowSprite } from '../games/shared/sprites';
import { TKey, useT } from '../i18n';
import { ACHIEVEMENTS } from '../store/achievements';
import { COSMETICS, Cosmetic, CosmeticSlot } from '../store/cosmetics';
import { levelInfo } from '../store/level';
import { useSave } from '../store/SaveProvider';
import { categoryThemes, palette, radius, spacing, type } from '../theme';

const SLOTS: CosmeticSlot[] = ['dart', 'arrow', 'ball'];

export default function ProfileScreen() {
  const t = useT();
  const { profile, setName, buy, equip, setPreferredMode } = useSave();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name);
  const lvl = levelInfo(profile.xp);
  const scored = GAMES.filter((g) => g.scored && profile.perGame[g.id]?.best);
  const unlocked = Object.keys(profile.achievements).length;

  const saveName = () => {
    setName(draft);
    setEditing(false);
  };

  return (
    <Screen header={<Header title={t('profile.title')} />}>
      <Gradient colors={[palette.violet, palette.electric]} radius={radius.xl} glow style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={[type.display, { color: palette.offWhite }]}>{profile.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[type.tiny, { color: 'rgba(255,255,255,0.75)' }]}>{t('profile.nameLabel').toUpperCase()}</Text>
          {editing ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                autoFocus
                maxLength={18}
                onSubmitEditing={saveName}
                style={styles.input}
                accessibilityLabel={t('profile.nameLabel')}
                returnKeyType="done"
              />
              <PressableScale onPress={saveName} style={styles.smallBtn} accessibilityRole="button" accessibilityLabel={t('profile.save')}>
                <Icon name="check" size={20} color={palette.night} />
              </PressableScale>
            </View>
          ) : (
            <PressableScale
              onPress={() => {
                setDraft(profile.name);
                setEditing(true);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`${t('profile.edit')} ${profile.name}`}
            >
              <Text style={[type.title, { color: palette.offWhite }]} numberOfLines={1}>
                {profile.name}
              </Text>
              <Icon name="edit" size={18} color="rgba(255,255,255,0.8)" />
            </PressableScale>
          )}
          <Text style={[type.small, { color: 'rgba(255,255,255,0.85)' }]}>{t('common.level', { n: lvl.level })}</Text>
          <ProgressBar progress={lvl.progress} colors={[palette.yellow, palette.coral]} />
          <Text style={[type.tiny, { color: 'rgba(255,255,255,0.75)' }]}>
            {lvl.current} / {lvl.needed} XP
          </Text>
        </View>
      </Gradient>

      <View style={styles.statsRow}>
        <Stat icon="play" label={t('profile.games')} value={profile.gamesPlayed} color={palette.sky} />
        <Stat icon="star" label={t('profile.xp')} value={profile.xp} color={palette.mint} />
        <Stat icon="coin" label={t('profile.coins')} value={profile.coins} color={palette.yellow} />
      </View>

      <SectionTitle>{t('profile.bestScores')}</SectionTitle>
      <View style={styles.panel}>
        {scored.length === 0 ? (
          <Text style={[type.small, { color: palette.textMuted }]}>{t('profile.noScores')}</Text>
        ) : (
          scored.map((g, i) => (
            <View key={g.id} style={[styles.scoreRow, i > 0 && styles.divider]}>
              <Gradient colors={categoryThemes[g.category].gradient} radius={10} style={styles.scoreIcon}>
                <Icon name={g.icon} size={18} color={palette.offWhite} accent={palette.yellow} />
              </Gradient>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: palette.text }]}>{t(g.title)}</Text>
                <Text style={[type.tiny, { color: palette.textDim }]}>{t('profile.playsCount', { n: profile.perGame[g.id].plays })}</Text>
              </View>
              <Text style={[type.heading, { color: palette.yellow }]}>{profile.perGame[g.id].best}</Text>
            </View>
          ))
        )}
      </View>

      <SectionTitle right={<Text style={[type.tiny, { color: palette.textMuted }]}>{`${unlocked}/${ACHIEVEMENTS.length}`}</Text>}>
        {t('profile.achievements')}
      </SectionTitle>
      <View style={styles.grid}>
        {ACHIEVEMENTS.map((a) => {
          const got = !!profile.achievements[a.id];
          return (
            <View key={a.id} style={[styles.achievement, got && { borderColor: palette.mint }]} accessible accessibilityLabel={`${t(`achievements.${a.id}.name` as TKey)} : ${t(`achievements.${a.id}.desc` as TKey)}`}>
              <View style={[styles.achIcon, { backgroundColor: got ? palette.mint : palette.night2 }]}>
                <Icon name={got ? a.icon : 'lock'} size={20} color={got ? palette.night : palette.textDim} accent={palette.mint} />
              </View>
              <Text style={[type.small, { color: got ? palette.text : palette.textMuted, textAlign: 'center' }]} numberOfLines={2}>
                {t(`achievements.${a.id}.name` as TKey)}
              </Text>
              <Text style={[type.tiny, { color: palette.textDim, textAlign: 'center', fontWeight: '500' }]} numberOfLines={3}>
                {t(`achievements.${a.id}.desc` as TKey)}
              </Text>
            </View>
          );
        })}
      </View>

      <SectionTitle>{t('profile.locker')}</SectionTitle>
      <Text style={[type.small, { color: palette.textMuted, marginTop: -spacing.sm }]}>{t('profile.lockerHint')}</Text>
      {SLOTS.map((slot) => (
        <View key={slot} style={styles.panel}>
          <Text style={[type.heading, { color: palette.text }]}>{t(`profile.slot.${slot}`)}</Text>
          <View style={styles.lockerRow}>
            {COSMETICS.filter((c) => c.slot === slot).map((c) => (
              <LockerItem
                key={c.id}
                item={c}
                owned={profile.cosmetics.owned.includes(c.id)}
                equipped={profile.cosmetics.equipped[slot] === c.id}
                canAfford={profile.coins >= c.price}
                onPress={() => {
                  if (profile.cosmetics.owned.includes(c.id)) equip(slot, c.id);
                  else if (buy(c.id)) {
                    equip(slot, c.id);
                    feedback('correct', 'success');
                  } else feedback('wrong', 'error');
                }}
              />
            ))}
          </View>
        </View>
      ))}

      <SectionTitle>{t('profile.preferences')}</SectionTitle>
      <View style={styles.panel}>
        <Text style={[type.body, { color: palette.text }]}>{t('profile.preferredMode')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['solo', 'duo'] as const).map((m) => {
            const active = profile.preferredMode === m;
            return (
              <PressableScale
                key={m}
                onPress={() => setPreferredMode(m)}
                style={[styles.modeBtn, active && { borderColor: palette.violetLight, backgroundColor: 'rgba(123,47,247,0.2)' }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(`common.${m}`)}
              >
                <Icon name={m === 'solo' ? 'user' : 'users'} size={20} color={active ? palette.text : palette.textMuted} accent={palette.coral} />
                <Text style={[type.small, { color: active ? palette.text : palette.textMuted }]}>{t(`common.${m}`)}</Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ icon, label, value, color }: { icon: 'play' | 'star' | 'coin'; label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={22} color={color} accent="#B8860B" />
      <Text style={[type.heading, { color: palette.text, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text style={[type.tiny, { color: palette.textMuted }]}>{label}</Text>
    </View>
  );
}

function LockerItem({ item, owned, equipped, canAfford, onPress }: { item: Cosmetic; owned: boolean; equipped: boolean; canAfford: boolean; onPress: () => void }) {
  const t = useT();
  const label = t(`cosmetics.${item.id}` as TKey);
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.lockerItem, equipped && { borderColor: palette.mint }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${equipped ? t('profile.equipped') : owned ? t('profile.equip') : `${item.price} ${t('profile.coins')}`}`}
    >
      <Svg width={60} height={60} viewBox="0 0 60 60">
        <Circle cx={30} cy={30} r={28} fill={palette.night2} />
        {item.slot === 'dart' && <DartSprite x={30} y={6} scale={0.95} skin={item} rotate={0} />}
        {item.slot === 'arrow' && <ArrowSprite x={30} y={8} scale={0.62} skin={item} />}
        {item.slot === 'ball' && <BallSprite x={30} y={30} r={20} skin={item} />}
      </Svg>
      <Text style={[type.tiny, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
      {equipped ? (
        <Text style={[type.tiny, { color: palette.mint }]}>{t('profile.equipped')}</Text>
      ) : owned ? (
        <Text style={[type.tiny, { color: palette.sky }]}>{t('profile.equip')}</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: canAfford ? 1 : 0.5 }}>
          <Icon name="coin" size={13} color={palette.yellow} accent="#B8860B" />
          <Text style={[type.tiny, { color: palette.yellow }]}>{item.price}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: spacing.lg, padding: spacing.lg, alignItems: 'center' },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(5,7,26,0.35)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: palette.yellow },
  input: { flex: 1, height: 42, borderRadius: 12, backgroundColor: 'rgba(5,7,26,0.35)', color: palette.offWhite, paddingHorizontal: 12, fontSize: 18, fontWeight: '800' },
  smallBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: palette.yellow, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border },
  panel: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: palette.border },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  scoreIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  achievement: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    padding: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  achIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  lockerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lockerItem: { width: 84, alignItems: 'center', gap: 4, padding: spacing.sm, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', backgroundColor: palette.night2 },
  modeBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.md, borderWidth: 2, borderColor: palette.border },
});
