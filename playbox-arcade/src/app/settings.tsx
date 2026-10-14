import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ArcadeButton } from '../components/ArcadeButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { PressableScale } from '../components/PressableScale';
import { Header, Screen, SectionTitle } from '../components/Screen';
import { ToggleRow } from '../components/Toggle';
import { APP_FULL_NAME, APP_VERSION } from '../config/app';
import { LOCALES, useT } from '../i18n';
import { useSave } from '../store/SaveProvider';
import { palette, radius, spacing, type } from '../theme';

export default function SettingsScreen() {
  const t = useT();
  const { settings, updateSettings, resetAll } = useSave();
  const [confirm, setConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const hapticsSupported = Platform.OS !== 'web';

  return (
    <Screen header={<Header title={t('settings.title')} />}>
      <SectionTitle>{t('settings.audio')}</SectionTitle>
      <View style={styles.panel}>
        <ToggleRow icon="sound" label={t('settings.sound')} value={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
        <ToggleRow icon="music" label={t('settings.music')} value={settings.music} onChange={(v) => updateSettings({ music: v })} />
        <ToggleRow
          icon="vibrate"
          label={t('settings.haptics')}
          description={hapticsSupported ? undefined : t('settings.hapticsUnsupported')}
          value={settings.haptics && hapticsSupported}
          disabled={!hapticsSupported}
          onChange={(v) => updateSettings({ haptics: v })}
        />
      </View>

      <SectionTitle>{t('settings.language')}</SectionTitle>
      <View style={[styles.panel, { flexDirection: 'row', gap: spacing.sm }]}>
        {LOCALES.map((l) => {
          const active = settings.language === l.id;
          return (
            <PressableScale
              key={l.id}
              disabled={!l.available}
              onPress={() => updateSettings({ language: l.id })}
              style={[styles.lang, active && { borderColor: palette.violetLight, backgroundColor: 'rgba(123,47,247,0.2)' }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !l.available }}
              accessibilityLabel={l.label}
            >
              <Icon name="globe" size={18} color={active ? palette.text : palette.textMuted} />
              <Text style={[type.body, { color: active ? palette.text : palette.textMuted, fontWeight: '700' }]}>{l.label}</Text>
              {!l.available && <Text style={[type.tiny, { color: palette.textDim }]}>{t('settings.languageSoon')}</Text>}
            </PressableScale>
          );
        })}
      </View>

      <SectionTitle>{t('settings.accessibility')}</SectionTitle>
      <View style={styles.panel}>
        <ToggleRow
          icon="eye"
          label={t('settings.reduceMotion')}
          description={t('settings.reduceMotionDesc')}
          value={settings.reduceMotion}
          onChange={(v) => updateSettings({ reduceMotion: v })}
          color={palette.sky}
        />
        <ToggleRow
          icon="crosshair"
          label={t('settings.aimAssist')}
          description={t('settings.aimAssistDesc')}
          value={settings.aimAssist}
          onChange={(v) => updateSettings({ aimAssist: v })}
          color={palette.sky}
        />
      </View>

      <SectionTitle>{t('settings.data')}</SectionTitle>
      <View style={styles.panel}>
        <Text style={[type.small, { color: palette.textMuted }]}>{t('settings.resetDesc')}</Text>
        <ArcadeButton
          label={resetDone ? t('settings.resetDone') : t('settings.reset')}
          icon={resetDone ? 'check' : 'trash'}
          variant="ghost"
          textColor={resetDone ? palette.mint : palette.red}
          onPress={() => setConfirm(true)}
        />
      </View>

      <SectionTitle>{t('settings.about')}</SectionTitle>
      <View style={[styles.panel, { gap: spacing.md }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <LogoMark size={48} />
          <View>
            <Text style={[type.heading, { color: palette.text }]}>{APP_FULL_NAME}</Text>
            <Text style={[type.small, { color: palette.textMuted }]}>{t('settings.version', { v: APP_VERSION })}</Text>
          </View>
        </View>
        <Text style={[type.small, { color: palette.textMuted }]}>{t('settings.offline')}</Text>
        <Text style={[type.tiny, { color: palette.textMuted }]}>{t('settings.credits').toUpperCase()}</Text>
        <Text style={[type.small, { color: palette.textMuted, fontWeight: '500' }]}>{t('settings.creditsText')}</Text>
      </View>

      <ConfirmDialog
        visible={confirm}
        danger
        icon="trash"
        title={t('settings.resetTitle')}
        message={t('settings.resetMessage')}
        confirmLabel={t('settings.resetConfirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await resetAll();
          setResetDone(true);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: palette.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: palette.border },
  lang: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: palette.border },
});
