import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { format, parseISO } from 'date-fns';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';
import { AppIcon, type IconName } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface LinkedVisitDocument {
  id: string;
  type: 'prescription' | 'lab_request' | 'lab_result' | 'certificate' | 'document';
  title: string;
  subtitle?: string;
  onPress?: () => void;
}

export interface AfterVisitSummaryProps {
  consultation: {
    id: string;
    visitDate: string; // YYYY-MM-DD or ISO
    visitType?: string | null;
    clinicName?: string | null;
    clinicId?: string | null;
    doctorName?: string | null;
    doctorSpecialty?: string | null;
    chiefComplaint?: string | null;
    primaryDiagnosis?: string | null;
    icd10Code?: string | null;
    secondaryDiagnoses?: string | null;
    treatmentPlan?: string | null;
    homeInstructions?: string | null;
    followUpInstructions?: string | null;
    followUpDate?: string | null;
    referralIssued?: string | null;
  };
  vitals?: {
    bpSystolic?: number | null;
    bpDiastolic?: number | null;
    heartRateBpm?: number | null;
    temperatureCelsius?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    bmi?: number | null;
    spO2Percent?: number | null;
    respiratoryRate?: number | null;
  } | null;
  linkedDocuments?: LinkedVisitDocument[];
  onBookFollowUp?: () => void;
  onMessageClinic?: () => void;
  isPinned?: boolean;
}

export default function AfterVisitSummaryCard({
  consultation,
  vitals,
  linkedDocuments = [],
  onBookFollowUp,
  onMessageClinic,
  isPinned = false,
}: AfterVisitSummaryProps) {
  const { colors, spacing, radii } = useAppTheme();

  const formattedDate = (() => {
    try {
      return format(parseISO(consultation.visitDate), 'MMMM d, yyyy');
    } catch {
      return consultation.visitDate;
    }
  })();

  const instructions =
    consultation.homeInstructions ||
    consultation.followUpInstructions ||
    'Follow up as advised by your physician. Continue prescribed medications and report any worsening symptoms.';

  const hasVitals =
    vitals &&
    (vitals.bpSystolic != null ||
      vitals.heartRateBpm != null ||
      vitals.temperatureCelsius != null ||
      vitals.weightKg != null ||
      vitals.bmi != null);

  const getDocIcon = (type: LinkedVisitDocument['type']): IconName => {
    switch (type) {
      case 'prescription':
        return 'pill';
      case 'lab_request':
      case 'lab_result':
        return 'lab';
      case 'certificate':
        return 'document';
      default:
        return 'document';
    }
  };

  return (
    <Card
      padding="lg"
      style={[
        styles.card,
        {
          borderColor: isPinned ? colors.primaryBorder : colors.border,
          backgroundColor: colors.surface,
          gap: spacing.md,
        },
      ]}
    >
      {/* Header with Title and Pinned Care Badge */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: colors.primaryLight,
                borderRadius: radii.md,
                padding: spacing.xs,
              },
            ]}
          >
            <AppIcon name="stethoscope" size={20} color="primary" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.rowAlign}>
              <ThemedText variant="bodyBold" style={{ color: colors.text }}>
                After-Visit Summary
              </ThemedText>
              {isPinned && <Badge label="Recent Visit (7-Day)" tone="routine" size="sm" />}
            </View>
            <ThemedText variant="caption" color="textSecondary">
              {formattedDate} • {consultation.clinicName || 'Accredited Clinic'}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Attending Doctor info */}
      {consultation.doctorName && (
        <View style={[styles.doctorRow, { gap: spacing.xs }]}>
          <ThemedText variant="small" color="textSecondary">
            Attending Physician:
          </ThemedText>
          <ThemedText variant="smallBold" style={{ color: colors.text }}>
            {consultation.doctorName}
            {consultation.doctorSpecialty ? ` (${consultation.doctorSpecialty})` : ''}
          </ThemedText>
        </View>
      )}

      {/* Primary & Secondary Diagnoses */}
      <View style={{ gap: spacing.xs }}>
        <ThemedText variant="captionBold" color="textMuted">
          CLINICAL DIAGNOSIS & ASSESSMENT
        </ThemedText>
        <ThemedText variant="bodyBold" style={{ color: colors.text }}>
          {consultation.primaryDiagnosis || 'Clinical consultation review'}
          {consultation.icd10Code ? ` (${consultation.icd10Code})` : ''}
        </ThemedText>
        {consultation.secondaryDiagnoses ? (
          <ThemedText variant="small" color="textSecondary">
            Secondary: {consultation.secondaryDiagnoses}
          </ThemedText>
        ) : null}
      </View>

      {/* Discharge / Home Care Instructions */}
      <View
        style={[
          styles.instructionsBox,
          {
            backgroundColor: colors.primaryLight,
            borderColor: colors.primaryBorder,
            borderRadius: radii.md,
            padding: spacing.md,
            gap: spacing.xs,
          },
        ]}
      >
        <View style={styles.rowAlign}>
          <AppIcon name="heart" size={16} color="primary" />
          <ThemedText variant="smallBold" color="primary">
            Home Care & Discharge Instructions
          </ThemedText>
        </View>
        <ThemedText variant="small" style={{ color: colors.text, lineHeight: 20 }}>
          {instructions}
        </ThemedText>
      </View>

      {/* Treatment Plan if available */}
      {consultation.treatmentPlan ? (
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="captionBold" color="textMuted">
            TREATMENT PLAN
          </ThemedText>
          <ThemedText variant="small" style={{ color: colors.text, lineHeight: 18 }}>
            {consultation.treatmentPlan}
          </ThemedText>
        </View>
      ) : null}

      {/* Vital Signs Grid */}
      {hasVitals && (
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="captionBold" color="textMuted">
            RECORDED VITALS
          </ThemedText>
          <View style={[styles.vitalsRow, { gap: spacing.sm }]}>
            {vitals.bpSystolic != null && vitals.bpDiastolic != null && (
              <View
                style={[
                  styles.vitalPill,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.sm,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <ThemedText variant="caption" color="textSecondary">
                  BP:
                </ThemedText>
                <ThemedText variant="captionBold" style={{ color: colors.text }}>
                  {vitals.bpSystolic}/{vitals.bpDiastolic} mmHg
                </ThemedText>
              </View>
            )}
            {vitals.heartRateBpm != null && (
              <View
                style={[
                  styles.vitalPill,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.sm,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <ThemedText variant="caption" color="textSecondary">
                  HR:
                </ThemedText>
                <ThemedText variant="captionBold" style={{ color: colors.text }}>
                  {vitals.heartRateBpm} bpm
                </ThemedText>
              </View>
            )}
            {vitals.temperatureCelsius != null && (
              <View
                style={[
                  styles.vitalPill,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.sm,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <ThemedText variant="caption" color="textSecondary">
                  Temp:
                </ThemedText>
                <ThemedText variant="captionBold" style={{ color: colors.text }}>
                  {vitals.temperatureCelsius}°C
                </ThemedText>
              </View>
            )}
            {vitals.bmi != null && (
              <View
                style={[
                  styles.vitalPill,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.sm,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <ThemedText variant="caption" color="textSecondary">
                  BMI:
                </ThemedText>
                <ThemedText variant="captionBold" style={{ color: colors.text }}>
                  {vitals.bmi}
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Linked Visit Documents */}
      {linkedDocuments.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="captionBold" color="textMuted">
            LINKED VISIT DOCUMENTS
          </ThemedText>
          <View style={{ gap: spacing.xs }}>
            {linkedDocuments.map((doc) => (
              <Pressable
                key={doc.id}
                onPress={doc.onPress}
                disabled={!doc.onPress}
                style={({ pressed }) => [
                  styles.docItem,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <AppIcon name={getDocIcon(doc.type)} size={16} color="primary" />
                <View style={{ flex: 1 }}>
                  <ThemedText variant="smallBold" style={{ color: colors.text }}>
                    {doc.title}
                  </ThemedText>
                  {doc.subtitle ? (
                    <ThemedText variant="caption" color="textSecondary">
                      {doc.subtitle}
                    </ThemedText>
                  ) : null}
                </View>
                {doc.onPress && <AppIcon name="chevronRight" size={16} color="textSecondary" />}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* CTAs: Follow-up Booking & 14-Day Messaging */}
      <View style={[styles.ctaRow, { gap: spacing.sm, paddingTop: spacing.xs }]}>
        {onBookFollowUp && (
          <Button
            label="Book Follow-up"
            variant="primary"
            icon="calendar"
            size="md"
            onPress={onBookFollowUp}
            style={styles.ctaButton}
          />
        )}
        {onMessageClinic && (
          <Button
            label="Message Clinic"
            variant="outline"
            icon="chat"
            size="md"
            onPress={onMessageClinic}
            style={styles.ctaButton}
          />
        )}
      </View>

      <ThemedText variant="caption" color="textSecondary" style={{ textAlign: 'center', marginTop: 2 }}>
        Direct 14-day post-consultation messaging window is active with your care team.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  instructionsBox: {
    borderWidth: 1,
  },
  vitalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  vitalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaButton: {
    flex: 1,
    minHeight: 44,
  },
});
