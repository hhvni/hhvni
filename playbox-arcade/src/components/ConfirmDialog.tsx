import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, type } from '../theme';
import { ArcadeButton } from './ArcadeButton';
import { Icon, IconName } from './Icon';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  icon?: IconName;
}

export function ConfirmDialog({ visible, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger, icon = 'info' }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={[styles.iconWrap, { backgroundColor: danger ? 'rgba(255,77,109,0.18)' : 'rgba(123,47,247,0.2)' }]}>
            <Icon name={icon} size={30} color={danger ? palette.red : palette.violetLight} />
          </View>
          <Text style={[type.title, styles.center]}>{title}</Text>
          <Text style={[type.body, styles.center, { color: palette.textMuted }]}>{message}</Text>
          <View style={{ gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.sm }}>
            <ArcadeButton label={confirmLabel} onPress={onConfirm} colors={danger ? [palette.red, '#D12A4F'] : undefined} />
            <ArcadeButton label={cancelLabel} onPress={onCancel} variant="ghost" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,7,26,0.78)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center', color: palette.text },
});
