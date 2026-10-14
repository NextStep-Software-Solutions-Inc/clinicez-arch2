import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { ThemedText, Badge, Button, Card, Icon, ActionMenu, type ActionMenuItem } from '@ui';
import { theme } from '@constants/theme';
import { formatLongAge } from '../../utils/age';
import type { ClinicPatient } from '../../services/clinicService';

export type PatientDirectoryViewMode = 'cards' | 'table';

export interface PatientDirectoryCardProps {
  patient: ClinicPatient;
  mode?: 'card' | 'table';
  /** When true in card mode, constrains width to a strict 2-column layout so odd last-row cards do not stretch 100%. */
  isDesktopGrid?: boolean;
  checkingIn?: boolean;
  disableCheckIn?: boolean;
  onOpenChart: (patient: ClinicPatient) => void;
  onEditDemographics: (patient: ClinicPatient) => void;
  onOpenPhilHealth: (patient: ClinicPatient) => void;
  onBookAppointment: (patient: ClinicPatient) => void;
  onAddToQueue: (patient: ClinicPatient) => void;
}

/**
 * Extracts up to 2 uppercase initials from a patient record for the identity avatar.
 */
export function getPatientInitials(
  patient: Pick<ClinicPatient, 'firstName' | 'lastName' | 'fullName'>
): string {
  const first = patient.firstName?.trim()?.[0] ?? '';
  const last = patient.lastName?.trim()?.[0] ?? '';
  if (first || last) {
    return `${last}${first}`.toUpperCase() || `${first}${last}`.toUpperCase();
  }
  const tokens = (patient.fullName ?? '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length >= 2) {
    return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  }
  if (tokens.length === 1 && tokens[0].length > 0) {
    return tokens[0].slice(0, 2).toUpperCase();
  }
  return 'PT';
}

/**
 * Determines whether the patient's allergy string contains a non-empty, known allergy.
 */
export function hasKnownAllergies(allergies?: string | null): boolean {
  if (!allergies) return false;
  const normalized = allergies.trim().toLowerCase();
  if (!normalized) return false;
  return !['none known', 'none', 'nkda', 'nka', 'nil'].includes(normalized);
}

/**
 * Determines whether the patient's allergy string indicates an anaphylactic / STAT urgency.
 */
export function hasStatAllergy(allergies?: string | null): boolean {
  if (!hasKnownAllergies(allergies)) return false;
  return /\b(stat|anaphylac\w*|life[- ]?threatening)\b/i.test(allergies ?? '');
}

/**
 * Formats the full chronological age (`yrs, mos, wks, days`) and core demographic line.
 */
export function formatPatientDemographicsLine(
  patient: Pick<ClinicPatient, 'dateOfBirth' | 'age' | 'gender' | 'civilStatus' | 'bloodType'>,
  referenceDate?: Date
): string {
  const ageDisplay = patient.dateOfBirth
    ? formatLongAge(patient.dateOfBirth, referenceDate)
    : patient.age !== undefined && patient.age !== null
    ? `${patient.age} yrs`
    : null;

  return [
    ageDisplay,
    patient.gender,
    patient.civilStatus,
    patient.bloodType ? `Blood type ${patient.bloodType}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
}

/**
 * Builds the overflow ActionMenu items for a patient card or table row.
 */
export function buildPatientOverflowMenuItems(
  patient: ClinicPatient,
  handlers: {
    onEditDemographics: (p: ClinicPatient) => void;
    onOpenPhilHealth: (p: ClinicPatient) => void;
    onOpenChart: (p: ClinicPatient) => void;
    onBookAppointment: (p: ClinicPatient) => void;
  }
): ActionMenuItem[] {
  return [
    {
      id: 'edit-demographics',
      label: 'Edit Demographics',
      icon: 'edit',
      hint: 'Update personal, contact, and statutory details',
      onPress: () => handlers.onEditDemographics(patient),
    },
    {
      id: 'philhealth-profile',
      label: 'PhilHealth Profile',
      icon: 'shield',
      hint: patient.philHealthNumber
        ? `PIN: ${patient.philHealthNumber}`
        : 'Configure Konsulta PIN & membership',
      onPress: () => handlers.onOpenPhilHealth(patient),
    },
    {
      id: 'view-chart',
      label: 'View chart',
      icon: 'clipboard',
      dividerBefore: true,
      onPress: () => handlers.onOpenChart(patient),
    },
    {
      id: 'book-appointment',
      label: 'Book appointment',
      icon: 'calendar',
      onPress: () => handlers.onBookAppointment(patient),
    },
  ];
}

export function PatientDirectoryTableHeader() {
  return (
    <View style={styles.tableHeaderRow} accessibilityRole="header">
      <View style={styles.tableColIdentity}>
        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.tableHeaderLabel}>
          PATIENT & CODE
        </ThemedText>
      </View>
      <View style={styles.tableColDemographics}>
        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.tableHeaderLabel}>
          AGE & DEMOGRAPHICS
        </ThemedText>
      </View>
      <View style={styles.tableColContact}>
        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.tableHeaderLabel}>
          CONTACT & COVERAGE
        </ThemedText>
      </View>
      <View style={styles.tableColAlerts}>
        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.tableHeaderLabel}>
          CLINICAL ALERTS
        </ThemedText>
      </View>
      <View style={styles.tableColActions}>
        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.tableHeaderLabelRight}>
          ACTIONS
        </ThemedText>
      </View>
    </View>
  );
}

export default function PatientDirectoryCard({
  patient,
  mode = 'card',
  isDesktopGrid = false,
  checkingIn = false,
  disableCheckIn = false,
  onOpenChart,
  onEditDemographics,
  onOpenPhilHealth,
  onBookAppointment,
  onAddToQueue,
}: PatientDirectoryCardProps) {
  const initials = getPatientInitials(patient);
  const demographics = formatPatientDemographicsLine(patient);
  const location = patient.city ? [patient.barangay, patient.city].filter(Boolean).join(', ') : patient.barangay || '';
  const hasAllergies = hasKnownAllergies(patient.allergies);
  const isStatAllergy = hasStatAllergy(patient.allergies);
  const isQueued = Boolean(patient.activeQueueTicket);

  const menuItems = buildPatientOverflowMenuItems(patient, {
    onEditDemographics,
    onOpenPhilHealth,
    onOpenChart,
    onBookAppointment,
  });

  if (mode === 'table') {
    return (
      <View style={styles.tableRow} testID={`patient-table-row-${patient.id}`}>
        {/* Column 1: Identity & Code */}
        <View style={styles.tableColIdentity}>
          <View style={styles.identityRow}>
            <View style={styles.avatarCircleSm}>
              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                {initials}
              </ThemedText>
            </View>
            <View style={styles.identityTextCol}>
              <Pressable
                onPress={() => onOpenChart(patient)}
                accessibilityRole="button"
                accessibilityLabel={`Open medical chart for ${patient.fullName}`}
              >
                <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1}>
                  {patient.fullName}
                </ThemedText>
              </Pressable>
              <View style={styles.inlineBadgesWrap}>
                <Badge label={patient.patientCode} variant="neutral" size="sm" />
                {isQueued ? (
                  <Badge label={`In Queue • ${patient.activeQueueTicket}`} variant="routine" size="sm" icon="ticket" />
                ) : null}
                {patient.verificationStatus === 'PendingVerification' ? (
                  <Badge label="Pending" variant="warning" size="sm" icon="hourglass" />
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* Column 2: Full Age & Demographics */}
        <View style={styles.tableColDemographics}>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            {demographics || '—'}
          </ThemedText>
          {patient.customFields?.student_id ? (
            <Badge
              label={`Student ${patient.customFields.student_id}${patient.customFields.program ? ` • ${patient.customFields.program}` : ''}`}
              variant="info"
              size="sm"
            />
          ) : patient.customFields?.employee_id ? (
            <Badge
              label={`Employee ${patient.customFields.employee_id}${patient.customFields.department ? ` • ${patient.customFields.department}` : ''}`}
              variant="success"
              size="sm"
            />
          ) : null}
        </View>

        {/* Column 3: Contact & Statutory IDs */}
        <View style={styles.tableColContact}>
          {patient.contactNumber || location ? (
            <View style={styles.contactInlineRow}>
              {patient.contactNumber ? (
                <View style={styles.iconMetaItem}>
                  <Icon name="phone" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {patient.contactNumber}
                  </ThemedText>
                </View>
              ) : null}
              {location ? (
                <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                  {location}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
          <View style={styles.inlineBadgesWrap}>
            {patient.philHealthNumber ? (
              <Pressable
                onPress={() => onOpenPhilHealth(patient)}
                accessibilityRole="button"
                accessibilityLabel={`Open PhilHealth profile for ${patient.fullName}`}
              >
                <Badge label={`PhilHealth ${patient.philHealthNumber}`} variant="primary" size="sm" icon="shield" />
              </Pressable>
            ) : null}
            {patient.seniorCitizenId ? (
              <Badge label={`Senior ${patient.seniorCitizenId}`} variant="warning" size="sm" />
            ) : null}
            {patient.pwdId ? <Badge label={`PWD ${patient.pwdId}`} variant="purple" size="sm" /> : null}
          </View>
        </View>

        {/* Column 4: Clinical Safety & Alerts */}
        <View style={styles.tableColAlerts}>
          {hasAllergies || patient.alerts ? (
            <View style={styles.tableAlertsStack}>
              {hasAllergies ? (
                <View style={[styles.compactAlertPill, styles.allergyStrip]}>
                  {isStatAllergy ? <Badge label="STAT" variant="emergency" size="sm" /> : null}
                  <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                  <ThemedText
                    variant="captionBold"
                    color={theme.colors.emergencyText}
                    style={styles.noticeText}
                    numberOfLines={2}
                  >
                    Allergies: {patient.allergies}
                  </ThemedText>
                </View>
              ) : null}
              {patient.alerts ? (
                <View style={[styles.compactAlertPill, styles.alertStrip]}>
                  <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                  <ThemedText
                    variant="captionBold"
                    color={theme.colors.warningText}
                    style={styles.noticeText}
                    numberOfLines={2}
                  >
                    {patient.alerts}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : (
            <ThemedText variant="caption" color={theme.colors.textLight}>
              No active alerts
            </ThemedText>
          )}
        </View>

        {/* Column 5: Actions */}
        <View style={styles.tableColActions}>
          <Button
            title="View chart"
            variant="outline"
            size="sm"
            icon="clipboard"
            onPress={() => onOpenChart(patient)}
          />
          <Button
            title={isQueued ? `Queued (${patient.activeQueueTicket})` : 'Add to queue'}
            variant="primary"
            size="sm"
            icon={isQueued ? 'checkCircle' : 'plus'}
            loading={checkingIn}
            disabled={disableCheckIn}
            onPress={() => onAddToQueue(patient)}
          />
          <ActionMenu
            triggerAriaLabel={`More actions for ${patient.fullName}`}
            items={menuItems}
          />
        </View>
      </View>
    );
  }

  return (
    <Card
      style={[
        styles.patientCard,
        isDesktopGrid && styles.patientCardDesktopGrid,
      ]}
    >
      <View style={styles.cardBody}>
        {/* Header Row: Avatar + Name/Code + Overflow ActionMenu (⋮) */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.avatarCircle}>
            <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
              {initials}
            </ThemedText>
          </View>

          <View style={styles.cardHeaderMain}>
            <View style={styles.cardTitleRow}>
              <Pressable
                onPress={() => onOpenChart(patient)}
                accessibilityRole="button"
                accessibilityLabel={`Open medical chart for ${patient.fullName}`}
                style={styles.patientNamePressable}
              >
                <ThemedText variant="h3" style={styles.patientName}>
                  {patient.fullName}
                </ThemedText>
              </Pressable>
              <Badge label={patient.patientCode} variant="neutral" />
              {isQueued ? (
                <Badge label={`In Queue • ${patient.activeQueueTicket}`} variant="routine" icon="ticket" />
              ) : null}
              {patient.verificationStatus === 'PendingVerification' && (
                <Badge label="Pending verification" variant="warning" icon="hourglass" />
              )}
            </View>

            {demographics ? (
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                {demographics}
              </ThemedText>
            ) : null}
          </View>

          <ActionMenu
            triggerAriaLabel={`More actions for ${patient.fullName}`}
            items={menuItems}
          />
        </View>

        {/* Institutional Classification Badges */}
        {patient.customFields?.student_id ? (
          <Badge
            label={`Student ID ${patient.customFields.student_id}${patient.customFields.program ? ` • ${patient.customFields.program}` : ''}${patient.customFields.year_level ? ` (${patient.customFields.year_level})` : ''}`}
            variant="info"
            icon="graduation"
            style={styles.selfStart}
          />
        ) : patient.customFields?.employee_id ? (
          <Badge
            label={`Employee ID ${patient.customFields.employee_id}${patient.customFields.department ? ` • ${patient.customFields.department}` : ''}`}
            variant="success"
            icon="briefcase"
            style={styles.selfStart}
          />
        ) : null}

        {/* Contact & Location Metadata with Icons */}
        {patient.contactNumber || location ? (
          <View style={styles.contactMetaRow}>
            {patient.contactNumber ? (
              <View style={styles.iconMetaItem}>
                <Icon name="phone" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  {patient.contactNumber}
                </ThemedText>
              </View>
            ) : null}
            {patient.contactNumber && location ? (
              <ThemedText variant="small" color={theme.colors.textLight}>
                •
              </ThemedText>
            ) : null}
            {location ? (
              <View style={styles.iconMetaItem}>
                <Icon name="globe" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  {location}
                </ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Statutory Coverage & ID Badges (PhilHealth badge is clickable to open PhilHealth Modal) */}
        {patient.philHealthNumber || patient.seniorCitizenId || patient.pwdId ? (
          <View style={styles.badgeRow}>
            {patient.philHealthNumber ? (
              <Pressable
                onPress={() => onOpenPhilHealth(patient)}
                accessibilityRole="button"
                accessibilityLabel={`Open PhilHealth profile for ${patient.fullName}`}
              >
                <Badge label={`PhilHealth ${patient.philHealthNumber}`} variant="primary" icon="shield" />
              </Pressable>
            ) : null}
            {patient.seniorCitizenId ? (
              <Badge label={`Senior ID ${patient.seniorCitizenId}`} variant="warning" />
            ) : null}
            {patient.pwdId ? <Badge label={`PWD ID ${patient.pwdId}`} variant="purple" /> : null}
          </View>
        ) : null}

        {/* Clinical Urgency & Safety Notice Strips */}
        {hasAllergies ? (
          <View style={[styles.noticeStrip, styles.allergyStrip]}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            {isStatAllergy ? <Badge label="STAT" variant="emergency" size="sm" /> : null}
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.noticeText}>
              Allergies: {patient.allergies}
            </ThemedText>
          </View>
        ) : null}

        {patient.alerts ? (
          <View style={[styles.noticeStrip, styles.alertStrip]}>
            <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
            <ThemedText variant="small" color={theme.colors.warningText} style={styles.noticeText}>
              {patient.alerts}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Streamlined 3-Action Footer */}
      <View style={styles.actionRow}>
        <Button
          title="View chart"
          variant="outline"
          size="sm"
          icon="clipboard"
          onPress={() => onOpenChart(patient)}
        />
        <View style={styles.primaryActionsGroup}>
          <Button
            title="Book appointment"
            variant="secondary"
            size="sm"
            icon="calendar"
            onPress={() => onBookAppointment(patient)}
          />
          <Button
            title={isQueued ? `Queued (${patient.activeQueueTicket})` : 'Add to queue'}
            variant="primary"
            size="sm"
            icon={isQueued ? 'checkCircle' : 'plus'}
            loading={checkingIn}
            disabled={disableCheckIn}
            onPress={() => onAddToQueue(patient)}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  patientCard: {
    flexGrow: 1,
    flexBasis: 420,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  patientCardDesktopGrid: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '48.8%',
    width: '48.8%',
    maxWidth: '49%',
  },
  cardBody: {
    gap: theme.spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  avatarCircle: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarCircleSm: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardHeaderMain: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  patientNamePressable: {
    flexShrink: 1,
  },
  patientName: {
    flexShrink: 1,
  },
  contactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  iconMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  noticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  noticeText: {
    flex: 1,
  },
  allergyStrip: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  alertStrip: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.md,
  },
  primaryActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  // Compact Workstation Table Styles
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  tableHeaderLabel: {
    letterSpacing: 0.4,
  },
  tableHeaderLabelRight: {
    letterSpacing: 0.4,
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  tableColIdentity: {
    flex: 2.2,
    minWidth: 180,
  },
  tableColDemographics: {
    flex: 2.2,
    minWidth: 180,
    gap: theme.spacing.xs,
  },
  tableColContact: {
    flex: 1.8,
    minWidth: 150,
    gap: theme.spacing.xs,
  },
  tableColAlerts: {
    flex: 1.8,
    minWidth: 150,
  },
  tableColActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
    minWidth: 240,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  identityTextCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  inlineBadgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  contactInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tableAlertsStack: {
    gap: theme.spacing.xs,
  },
  compactAlertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
});
