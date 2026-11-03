import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Modal, ThemedText, Button, Icon } from '@ui';
import { theme } from '@constants/theme';
import type { ClinicPatient } from '../../services/clinicService';

export interface ConsultationTypeModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  onSelectType: (type: 'regular' | 'yakap') => void;
}

export default function ConsultationTypeModal({
  visible,
  onClose,
  patient,
  onSelectType,
}: ConsultationTypeModalProps) {
  if (!patient) return null;

  const modalFooter = (
    <View style={styles.footerRow}>
      <Button
        title="Cancel"
        variant="ghost"
        onPress={onClose}
        testID="consultation-type-cancel-btn"
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Start Consultation"
      subtitle={patient.fullName}
      maxWidth={460}
      footer={modalFooter}
      testID="consultation-type-choice-modal"
    >
      <View style={styles.container}>
        <ThemedText variant="bodyBold" color={theme.colors.text}>
          Which consultation would the patient like to avail?
        </ThemedText>

        {/* Option 1: Regular Consultation */}
        <Pressable
          style={({ pressed, hovered }: any) => [
            styles.programCard,
            (pressed || hovered) && styles.programCardActive,
          ]}
          onPress={() => onSelectType('regular')}
          accessibilityRole="button"
          accessibilityLabel="Start Regular Consultation"
          testID="consultation-type-regular-btn"
        >
          <View style={styles.iconCircle}>
            <Icon name="stethoscope" size={theme.sizes.iconLg} color={theme.colors.primary} />
          </View>
          <View style={styles.programCardContent}>
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              Regular Consultation
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.programCardDesc}>
              Standard doctor visit, notes, and prescription.
            </ThemedText>
          </View>
          <Icon name="chevronRight" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
        </Pressable>

        {/* Option 2: PhilHealth Yakap Consultation */}
        <Pressable
          style={({ pressed, hovered }: any) => [
            styles.programCard,
            (pressed || hovered) && styles.programCardActive,
          ]}
          onPress={() => onSelectType('yakap')}
          accessibilityRole="button"
          accessibilityLabel="Start PhilHealth Yakap Consultation"
          testID="consultation-type-yakap-btn"
        >
          <View style={styles.iconCircle}>
            <Icon name="shield" size={theme.sizes.iconLg} color={theme.colors.primary} />
          </View>
          <View style={styles.programCardContent}>
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              PhilHealth Yakap Consultation
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.programCardDesc}>
              PhilHealth primary care check-up and health screening.
            </ThemedText>
          </View>
          <Icon name="chevronRight" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  programCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  programCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  programCardContent: {
    flex: 1,
    gap: 2,
  },
  programCardDesc: {
    lineHeight: 19,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
