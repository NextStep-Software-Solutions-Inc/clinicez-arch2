import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Modal, ThemedText, Badge, Button, Icon } from '@ui';
import { theme } from '@constants/theme';
import type { ClinicPatient } from '../../services/clinicService';
import { getPatientInitials, formatPatientDemographicsLine } from './PatientDirectoryCard';

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

  const initials = getPatientInitials(patient);
  const demographics = formatPatientDemographicsLine(patient);
  const hasPin = Boolean(patient.philHealthNumber && patient.philHealthNumber.trim());

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Start Consultation"
      subtitle="Select consultation program for this encounter"
      testID="consultation-type-choice-modal"
    >
      <View style={styles.container}>
        {/* Patient Identity Banner */}
        <View style={styles.patientBanner}>
          <View style={styles.avatarCircle}>
            <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
              {initials}
            </ThemedText>
          </View>
          <View style={styles.patientInfo}>
            <View style={styles.patientHeaderRow}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {patient.fullName}
              </ThemedText>
              <Badge label={patient.patientCode} variant="neutral" size="sm" />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
              {demographics}
            </ThemedText>
            <View style={styles.pinBadgeRow}>
              {hasPin ? (
                <Badge
                  label={`PhilHealth PIN: ${patient.philHealthNumber}`}
                  variant="primary"
                  size="sm"
                  icon="shield"
                />
              ) : (
                <Badge label="No PhilHealth PIN on file" variant="neutral" size="sm" />
              )}
            </View>
          </View>
        </View>

        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sectionTitle}>
          CONSULTATION PROGRAM
        </ThemedText>

        {/* Option 1: Regular Consultation */}
        <Pressable
          style={({ pressed, hovered }: any) => [
            styles.programCard,
            (pressed || hovered) && styles.programCardActive,
          ]}
          onPress={() => onSelectType('regular')}
          accessibilityRole="button"
          accessibilityLabel="Start Regular Clinic Consultation"
          testID="consultation-type-regular-btn"
        >
          <View style={styles.iconCircle}>
            <Icon name="stethoscope" size={24} color={theme.colors.primary} />
          </View>
          <View style={styles.programCardContent}>
            <View style={styles.programCardTitleRow}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Regular Consultation
              </ThemedText>
              <Badge label="Standard Care" variant="neutral" size="sm" />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.programCardDesc}>
              Standard outpatient evaluation, subjective & objective assessment, clinical SOAP notes, and electronic prescription.
            </ThemedText>
          </View>
          <Icon name="chevronRight" size={18} color={theme.colors.textMuted} />
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
            <Icon name="shield" size={24} color={theme.colors.primary} />
          </View>
          <View style={styles.programCardContent}>
            <View style={styles.programCardTitleRow}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                PhilHealth Yakap Consultation
              </ThemedText>
              <Badge label="PhilHealth Yakap" variant="primary" size="sm" icon="shield" />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.programCardDesc}>
              Konsulta / Yakap accredited primary care encounter with statutory checklist compliance, diagnostic profiling, and e-claims claim readiness.
            </ThemedText>
          </View>
          <Icon name="chevronRight" size={18} color={theme.colors.textMuted} />
        </Pressable>

        <View style={styles.footerRow}>
          <Button
            title="Cancel"
            variant="outline"
            onPress={onClose}
            testID="consultation-type-cancel-btn"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  patientBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  patientHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  pinBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  sectionTitle: {
    letterSpacing: 0.5,
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
  },
  programCardContent: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  programCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  programCardDesc: {
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
  },
});
