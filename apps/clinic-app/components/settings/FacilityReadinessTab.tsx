import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon, { IconName } from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { SettingsTabKey, ReadinessCheckItem } from './types';
import { ClinicRole, ClinicServiceItem, FacilityLicenseStatus, StaffMember } from '../../services/clinicService';

interface FacilityReadinessTabProps {
  license: FacilityLicenseStatus | null;
  clinicName: string;
  letterheadAddress: string;
  letterheadContact: string;
  accreditationNumber: string;
  staff: StaffMember[];
  services: ClinicServiceItem[];
  roles: ClinicRole[];
  onNavigateTab: (tab: SettingsTabKey) => void;
  onOpenAddStaff: () => void;
  onOpenAddService: () => void;
  onOpenLicenseModal: () => void;
}

export default function FacilityReadinessTab({
  license,
  clinicName,
  letterheadAddress,
  letterheadContact,
  accreditationNumber,
  staff,
  services,
  roles,
  onNavigateTab,
  onOpenAddStaff,
  onOpenAddService,
  onOpenLicenseModal,
}: FacilityReadinessTabProps) {
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

  // 3. Doctor with PRC
  const activeDoctors = staff.filter((s) => s.isActive && s.role === 'Doctor' && Boolean(s.prcLicenseNumber?.trim()));
  const hasDoctor = activeDoctors.length > 0;

  // 4. Front Desk or Cashier
  const activeFrontDesk = staff.filter((s) => s.isActive && (s.role === 'Receptionist' || s.role === 'Cashier' || s.role === 'Admin'));
  const hasFrontDesk = activeFrontDesk.length > 0;

  // 5. Fee Schedule & Catalog
  const activeServices = services.filter((s) => s.isActive);
  const hasServices = activeServices.length > 0;

  // 6. PhilHealth (Optional)
  const hasPhilHealth = Boolean(accreditationNumber?.trim());

  // 7. Contact / Official details (Optional)
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
});
