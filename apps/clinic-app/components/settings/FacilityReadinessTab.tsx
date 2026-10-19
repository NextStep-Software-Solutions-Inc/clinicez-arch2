import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon, { IconName } from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { SettingsTabKey, ReadinessCheckItem } from './types';
import { ClinicRole, ClinicServiceItem, FacilityLicenseStatus, StaffMember } from '../../services/clinicService';

export interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: ToggleSwitchProps) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      style={[styles.switchTouchTarget, disabled && styles.switchDisabled]}
    >
      <View
        style={[
          styles.switchTrack,
          value ? styles.switchTrackActive : styles.switchTrackInactive,
          disabled && styles.switchTrackDisabled,
        ]}
      >
        <View
          style={[
            styles.switchThumb,
            value ? styles.switchThumbActive : styles.switchThumbInactive,
          ]}
        />
      </View>
    </Pressable>
  );
}

export interface FacilityReadinessTabProps {
  license: FacilityLicenseStatus | null;
  clinicName: string;
  letterheadAddress: string;
  letterheadContact: string;
  accreditationNumber: string;
  operatingHours?: string;
  staff: StaffMember[];
  services: ClinicServiceItem[];
  roles: ClinicRole[];
  isDirectoryPublished?: boolean;
  isOnlineBookingPaused?: boolean;
  isWorkspaceEligible?: boolean;
  onTogglePublishDirectory?: (nextPublished: boolean) => Promise<void> | void;
  onToggleBookingPause?: (nextPaused: boolean) => Promise<void> | void;
  isPublishingMutating?: boolean;
  isBookingPauseMutating?: boolean;
  onNavigateTab: (tab: SettingsTabKey) => void;
  onOpenAddStaff: () => void;
  onOpenAddService: () => void;
  onOpenLicenseModal: () => void;
  showSkeletons?: boolean;
}

export default function FacilityReadinessTab({
  license,
  clinicName,
  letterheadAddress,
  letterheadContact,
  accreditationNumber,
  operatingHours = '',
  staff,
  services,
  roles,
  isDirectoryPublished = false,
  isOnlineBookingPaused = false,
  isWorkspaceEligible = true,
  onTogglePublishDirectory,
  onToggleBookingPause,
  isPublishingMutating,
  isBookingPauseMutating,
  onNavigateTab,
  onOpenAddStaff,
  onOpenAddService,
  onOpenLicenseModal,
  showSkeletons = false,
}: FacilityReadinessTabProps) {
  const [localPublishingLoading, setLocalPublishingLoading] = useState(false);
  const [localPauseLoading, setLocalPauseLoading] = useState(false);
  const publishingLoading = isPublishingMutating ?? localPublishingLoading;
  const pauseLoading = isBookingPauseMutating ?? localPauseLoading;

  // 1. License Check
  const hasActiveLicense = Boolean(
    license &&
      license.status === 'Active' &&
      !license.isTampered &&
      (!license.expiresAtUtc || new Date(license.expiresAtUtc) > new Date()) &&
      (license.limits?.maxStaff ?? 0) > 0
  );

  // 2. Profile Check
  const hasProfile = Boolean(clinicName?.trim() && (letterheadAddress?.trim() || letterheadContact?.trim()));

  // 3. Operating Hours Check (MANDATORY for M2)
  const hasOperatingHours = Boolean(operatingHours && operatingHours.trim().length > 0);

  // 4. Doctor with PRC
  const activeDoctors = staff.filter((s) => s.isActive && s.role === 'Doctor' && Boolean(s.prcLicenseNumber?.trim()));
  const hasDoctor = activeDoctors.length > 0;

  // 5. Front Desk or Cashier
  const activeFrontDesk = staff.filter((s) => s.isActive && (s.role === 'Receptionist' || s.role === 'Cashier' || s.role === 'Admin'));
  const hasFrontDesk = activeFrontDesk.length > 0;

  // 6. Fee Schedule & Catalog
  const activeServices = services.filter((s) => s.isActive);
  const hasServices = activeServices.length > 0;

  // 7. PhilHealth (Optional)
  const hasPhilHealth = Boolean(accreditationNumber?.trim());

  // 8. Contact / Official details (Optional)
  const hasOfficialDetails = Boolean(letterheadAddress?.trim() && letterheadContact?.trim());

  const checks: ReadinessCheckItem[] = [
    {
      id: 'license',
      category: 'license',
      title: 'Facility License & Operational Seats',
      description: hasActiveLicense
        ? `Cryptographic license is active (${license?.planTier} plan, ${license?.limits?.maxStaff ?? 0} seats).`
        : 'A valid facility license is required to activate and run the clinic.',
      status: hasActiveLicense ? 'passed' : 'failed',
      required: true,
      actionLabel: hasActiveLicense ? 'Manage License' : 'Install License Key',
      actionTab: 'license',
    },
    {
      id: 'profile',
      category: 'profile',
      title: 'Clinic Legal Profile & Address',
      description: hasProfile
        ? `Configured as "${clinicName}" with registered facility address.`
        : 'Specify the registered facility name and physical address for prescriptions and official documents.',
      status: hasProfile ? 'passed' : 'failed',
      required: true,
      actionLabel: 'Configure Profile',
      actionTab: 'general',
    },
    {
      id: 'hours',
      category: 'profile',
      title: 'Clinic Operating Hours & Schedule',
      description: hasOperatingHours
        ? `Configured schedule: "${operatingHours.trim()}".`
        : 'Weekly operating hours and clinic schedule must be configured before admitting patients and publishing.',
      status: hasOperatingHours ? 'passed' : 'failed',
      required: true,
      actionLabel: hasOperatingHours ? 'Edit Hours' : 'Set Operating Hours',
      actionTab: 'general',
    },
    {
      id: 'doctor',
      category: 'staff',
      title: 'Attending Physician / Doctor with PRC',
      description: hasDoctor
        ? `${activeDoctors.length} doctor(s) on roster with verified PRC license numbers.`
        : 'Philippine regulatory compliance requires at least one registered physician with a valid PRC license.',
      status: hasDoctor ? 'passed' : 'failed',
      required: true,
      actionLabel: '+ Add Doctor',
      actionTab: 'staff',
    },
    {
      id: 'frontdesk',
      category: 'staff',
      title: 'Front Desk / Cashier Operations',
      description: hasFrontDesk
        ? `${activeFrontDesk.length} front-desk, cashier, or admin staff assigned to coordinate queues and billing.`
        : 'At least one receptionist or cashier is required to handle patient check-in and issue receipts.',
      status: hasFrontDesk ? 'passed' : 'failed',
      required: true,
      actionLabel: '+ Add Front Desk',
      actionTab: 'staff',
    },
    {
      id: 'catalog',
      category: 'services',
      title: 'Fee Schedule & Clinical Services',
      description: hasServices
        ? `${activeServices.length} billable service(s) and consultation fees active in catalog.`
        : 'Define standard outpatient consultation fees and clinical procedures before admitting patients.',
      status: hasServices ? 'passed' : 'failed',
      required: true,
      actionLabel: '+ Add Services',
      actionTab: 'services',
    },
    {
      id: 'philhealth',
      category: 'philhealth',
      title: 'PhilHealth Konsulta Accreditation',
      description: hasPhilHealth
        ? `Accreditation number ${accreditationNumber} configured for Konsulta primary care benefits.`
        : 'Configure your DOH/PhilHealth accreditation code to submit Yakap claims (optional for private clinics).',
      status: hasPhilHealth ? 'passed' : 'warning',
      required: false,
      actionLabel: 'Configure Accreditation',
      actionTab: 'philhealth',
    },
    {
      id: 'legal',
      category: 'legal',
      title: 'Official Letterhead & Contact Info',
      description: hasOfficialDetails
        ? 'Letterhead headers and official contact channels are populated.'
        : 'Add phone numbers, email, and printed receipt header details.',
      status: hasOfficialDetails ? 'passed' : 'warning',
      required: false,
      actionLabel: 'Edit Letterhead',
      actionTab: 'general',
    },
  ];

  const mandatoryChecks = checks.filter((c) => c.required);
  const passedMandatory = mandatoryChecks.filter((c) => c.status === 'passed').length;
  const isFacilityReady = passedMandatory === mandatoryChecks.length;
  const readinessPercent = Math.round((checks.filter((c) => c.status === 'passed').length / checks.length) * 100);

  const canPublish = Boolean(isWorkspaceEligible && isFacilityReady);

  const handleAction = (check: ReadinessCheckItem) => {
    if (check.id === 'doctor' || check.id === 'frontdesk') {
      onOpenAddStaff();
    } else if (check.id === 'catalog') {
      onOpenAddService();
    } else if (check.id === 'license') {
      onOpenLicenseModal();
    } else if (check.actionTab) {
      onNavigateTab(check.actionTab);
    }
  };

  const handlePublishToggle = async (nextVal: boolean) => {
    if (!onTogglePublishDirectory) return;
    setLocalPublishingLoading(true);
    try {
      await onTogglePublishDirectory(nextVal);
    } finally {
      setLocalPublishingLoading(false);
    }
  };

  const handleBookingPauseToggle = async (nextVal: boolean) => {
    if (!onToggleBookingPause) return;
    setLocalPauseLoading(true);
    try {
      await onToggleBookingPause(nextVal);
    } finally {
      setLocalPauseLoading(false);
    }
  };

  if (showSkeletons) {
    return (
      <View style={styles.container}>
        <Card style={styles.heroCard}>
          <Skeleton height={80} radius={theme.radii.lg} />
        </Card>
        <Card>
          <CardHeader title="Facility Pre-Flight Checklist" />
          <CardContent>
            <SkeletonList rows={5} rowHeight={56} />
          </CardContent>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Pre-Flight Status Overview */}
      <Card style={[styles.heroCard, isFacilityReady ? styles.heroReady : styles.heroPending]}>
        <View style={styles.heroContent}>
          <View style={styles.heroIconBadge}>
            <Icon
              name={isFacilityReady ? 'checkCircle' : 'alertCircle'}
              size={theme.sizes.iconLg}
              color={isFacilityReady ? theme.colors.success : theme.colors.emergency}
            />
          </View>
          <View style={styles.heroText}>
            <View style={styles.heroHeaderRow}>
              <ThemedText variant="title">
                {isFacilityReady ? 'Facility Ready for Operations' : 'Facility Setup Required'}
              </ThemedText>
              <Badge
                label={isFacilityReady ? 'Ready to Open' : `${passedMandatory}/${mandatoryChecks.length} Required`}
                variant={isFacilityReady ? 'success' : 'emergency'}
                size="md"
              />
            </View>
            <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.heroSubtext}>
              {isFacilityReady
                ? 'All mandatory clinical, staffing, and legal prerequisites are met. The clinic workstation is fully operational.'
                : 'Resolve the incomplete mandatory checks below before opening clinic doors and admitting patients.'}
            </ThemedText>

            {/* Progress bar */}
            <View style={styles.progressBarWrapper}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${readinessPercent}%`,
                      backgroundColor: isFacilityReady ? theme.colors.success : theme.colors.primary,
                    },
                  ]}
                />
              </View>
              <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                {readinessPercent}% Overall Readiness
              </ThemedText>
            </View>
          </View>
        </View>
      </Card>

      {/* Pre-Flight Checklist */}
      <Card>
        <CardHeader
          title="Facility Pre-Flight Checklist"
          subtitle="Mandatory regulatory items must pass before daily clinic operations commence."
        />
        <CardContent>
          <View style={styles.checklist}>
            {checks.map((check) => {
              const isPassed = check.status === 'passed';
              const isFailed = check.status === 'failed';
              const isWarning = check.status === 'warning';

              return (
                <View key={check.id} style={styles.checkRow}>
                  <View style={styles.checkIconCol}>
                    <Icon
                      name={isPassed ? 'checkCircle' : isFailed ? 'close' : 'alertCircle'}
                      size={theme.sizes.iconMd}
                      color={
                        isPassed
                          ? theme.colors.success
                          : isFailed
                          ? theme.colors.emergency
                          : theme.colors.warning
                      }
                    />
                  </View>

                  <View style={styles.checkDetailsCol}>
                    <View style={styles.checkTitleRow}>
                      <ThemedText variant="bodyBold">{check.title}</ThemedText>
                      {check.required ? (
                        <Badge label="Required" variant={isPassed ? 'success' : 'emergency'} size="sm" />
                      ) : (
                        <Badge label="Optional" variant="neutral" size="sm" />
                      )}
                    </View>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      {check.description}
                    </ThemedText>
                  </View>

                  <View style={styles.checkActionCol}>
                    <Button
                      title={check.actionLabel || 'Configure'}
                      variant={isPassed ? 'ghost' : 'outline'}
                      size="sm"
                      onPress={() => handleAction(check)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </CardContent>
      </Card>

      {/* Online Presence & Patient Directory Publishing */}
      <Card>
        <CardHeader
          title="Online Presence & Patient Directory"
          subtitle="Control whether your facility profile and services are discoverable on the ClinicEZ patient mobile app."
          icon="globe"
        />
        <CardContent>
          {/* Workspace Eligibility Warning Banner */}
          {!isWorkspaceEligible && (
            <View style={styles.warningBanner}>
              <View style={styles.warningBannerIconCol}>
                <Icon name="alertCircle" size={theme.sizes.iconLg} color={theme.colors.warningText} />
              </View>
              <View style={styles.warningBannerTextCol}>
                <View style={styles.warningBannerHeaderRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.warningText}>
                    Workspace Eligibility Pending
                  </ThemedText>
                  <Badge label="Approval Required" variant="warning" size="sm" icon="lock" />
                </View>
                <ThemedText variant="small" color={theme.colors.warningText} style={styles.warningBannerBody}>
                  Your organization workspace administrator has not yet enabled public patient directory discovery for this facility branch. You can complete your pre-flight checklist and profile configuration, but patient app publishing remains locked until workspace-level eligibility is granted in the Portal.
                </ThemedText>
                <ThemedText variant="captionBold" color={theme.colors.warningText} style={styles.warningBannerFooter}>
                  To resolve: Contact your workspace administrator to enable "Patient App Discovery" in Portal Settings → Facilities.
                </ThemedText>
              </View>
            </View>
          )}

          {/* Directory Publishing Toggle Row */}
          <View style={styles.controlRow}>
            <View style={styles.controlTextCol}>
              <View style={styles.controlTitleRow}>
                <ThemedText variant="bodyBold">Publish to Patient Directory</ThemedText>
                <Badge
                  label={isDirectoryPublished ? 'Published (Live)' : 'Draft (Unlisted)'}
                  variant={isDirectoryPublished ? 'success' : 'neutral'}
                  size="sm"
                  icon={isDirectoryPublished ? 'checkCircle' : 'lock'}
                />
              </View>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                {isDirectoryPublished
                  ? 'Your facility profile, verified operating hours, attending doctors, and clinical services are discoverable on the ClinicEZ patient mobile app.'
                  : 'Your facility is unlisted from patient search. Staff and internal operations are active, but patients cannot discover this clinic on the mobile directory.'}
              </ThemedText>
              {!canPublish && (
                <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={styles.ineligibleNotice}>
                  {!isWorkspaceEligible
                    ? 'Publishing locked: Requires workspace administrator approval in Portal.'
                    : 'Publishing locked: Complete all mandatory pre-flight checks above.'}
                </ThemedText>
              )}
            </View>
            <View style={styles.controlSwitchCol}>
              <ToggleSwitch
                value={isDirectoryPublished}
                onValueChange={handlePublishToggle}
                disabled={!canPublish || publishingLoading}
                accessibilityLabel="Publish to Patient Directory"
              />
            </View>
          </View>

          {/* Dynamic Online Booking Pause Capacity Toggle Row */}
          <View style={[styles.controlRow, styles.controlRowBorderTop]}>
            <View style={styles.controlTextCol}>
              <View style={styles.controlTitleRow}>
                <ThemedText variant="bodyBold">Pause Online Appointment Booking</ThemedText>
                <Badge
                  label={isOnlineBookingPaused ? 'Booking Paused' : 'Booking Active'}
                  variant={isOnlineBookingPaused ? 'urgent' : 'success'}
                  size="sm"
                  icon={isOnlineBookingPaused ? 'timer' : 'checkCircle'}
                />
              </View>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                {isOnlineBookingPaused
                  ? 'Online appointment booking is currently paused. Patients on the mobile app are notified of temporary booking suspension, while in-clinic walk-in queues and existing scheduled appointments continue normally.'
                  : 'Patients can schedule outpatient consultations in available doctor shift slots based on your weekly roster.'}
              </ThemedText>
              {!isDirectoryPublished && (
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.ineligibleNotice}>
                  Active when clinic is published to directory.
                </ThemedText>
              )}
            </View>
            <View style={styles.controlSwitchCol}>
              <ToggleSwitch
                value={isOnlineBookingPaused}
                onValueChange={handleBookingPauseToggle}
                disabled={!isDirectoryPublished || pauseLoading}
                accessibilityLabel="Pause Online Appointment Booking"
              />
            </View>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  heroCard: {
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
  },
  heroReady: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.success,
  },
  heroPending: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.lg,
  },
  heroIconBadge: {
    paddingTop: theme.spacing.xs,
  },
  heroText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  heroSubtext: {
    marginTop: theme.spacing.xs,
  },
  progressBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: theme.radii.full,
  },
  checklist: {
    gap: theme.spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  checkIconCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDetailsCol: {
    flex: 1,
    gap: 4,
  },
  checkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  checkActionCol: {
    alignItems: 'flex-end',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  warningBannerIconCol: {
    paddingTop: theme.spacing.xs,
  },
  warningBannerTextCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  warningBannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  warningBannerBody: {
    marginTop: theme.spacing.xs,
    lineHeight: 18,
  },
  warningBannerFooter: {
    marginTop: theme.spacing.xs,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  controlRowBorderTop: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
  },
  controlTextCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  controlTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  controlSwitchCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  ineligibleNotice: {
    marginTop: theme.spacing.xs,
  },
  switchTouchTarget: {
    minWidth: theme.sizes.touchTarget,
    minHeight: theme.sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchDisabled: {
    opacity: 0.5,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: theme.radii.full,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: theme.colors.primary,
  },
  switchTrackInactive: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  switchTrackDisabled: {
    backgroundColor: theme.colors.borderDark,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
});
