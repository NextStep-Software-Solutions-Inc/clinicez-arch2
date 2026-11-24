import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import ValidatedDateInput, { validateDateString } from '../ui/ValidatedDateInput';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { theme, subscribeActiveTheme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import {
  hasRegulatedLtoCredentialsChanged,
  PENDING_VERIFICATION_BUTTON_LABEL,
  pickVerificationEvidenceFile,
  REGULATED_LTO_REVERIFICATION_NOTICE,
  resolveFacilityVerificationBadge,
  RESUBMIT_LTO_BUTTON_LABEL,
  toEvidenceFormData,
  type PickedEvidenceFile,
} from '../../utils/directoryVerification';
import { clinicService } from '../../services/clinicService';
import { PendingVerificationNote, ReverificationNoticeBanner } from './common';
import { EvidenceProofPreview } from './EvidenceProofPreview';
import { SettingsTabKey, ReadinessCheckItem } from './types';
import {
  ClinicRole,
  ClinicServiceItem,
  FacilityLicenseStatus,
  PlatformVerificationStatus,
  StaffMember,
} from '../../services/clinicService';

export interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: ToggleSwitchProps) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      disabled={disabled}
      style={[styles.switchTouchTarget, disabled && styles.switchDisabled]}
    >
      <View
        style={[
          styles.switchTrack,
          { backgroundColor: value ? theme.colors.primary : theme.colors.surfaceHighlight },
          disabled && { backgroundColor: theme.colors.borderDark },
        ]}
      >
        <View
          style={[
            styles.switchThumb,
            { backgroundColor: theme.colors.surface },
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
  isPhilHealthConfigured?: boolean;
  operatingHours?: string;
  staff: StaffMember[];
  services: ClinicServiceItem[];
  roles: ClinicRole[];
  isDirectoryPublished?: boolean;
  isOnlineBookingPaused?: boolean;
  isWorkspaceEligible?: boolean;
  platformVerificationStatus?: PlatformVerificationStatus;
  verificationRejectionReason?: string | null;
  lastVerificationSubmittedAtUtc?: string | null;
  letterheadDohLto?: string | null;
  dohLtoExpiryDate?: string | null;
  ltoEvidenceObjectKey?: string | null;
  optedInCliniciansCount?: number;
  optedInCliniciansReadyCount?: number;
  onSaveDohLto?: (
    dohLto: string,
    dohLtoExpiryDate?: string | null,
    ltoEvidenceObjectKey?: string | null,
  ) => Promise<boolean | void> | boolean | void;
  onUploadLtoProof?: (
    file: FormData,
    options?: { stageOnly?: boolean },
  ) => Promise<boolean | string | { objectKey?: string } | void> | boolean | string | { objectKey?: string } | void;
  onSubmitVerification?: () => Promise<void> | void;
  onWithdrawVerification?: () => Promise<void> | void;
  onTogglePublishDirectory?: (nextPublished: boolean) => Promise<void> | void;
  onToggleBookingPause?: (nextPaused: boolean) => Promise<void> | void;
  isLtoSaving?: boolean;
  isLtoUploading?: boolean;
  isWithdrawingVerification?: boolean;
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
  isPhilHealthConfigured = false,
  operatingHours = '',
  staff,
  services,
  roles: _roles,
  isDirectoryPublished = false,
  isOnlineBookingPaused = false,
  isWorkspaceEligible = true,
  platformVerificationStatus = 'Unverified',
  verificationRejectionReason = null,
  lastVerificationSubmittedAtUtc = null,
  letterheadDohLto = '',
  dohLtoExpiryDate = '',
  ltoEvidenceObjectKey = null,
  optedInCliniciansCount,
  optedInCliniciansReadyCount,
  onSaveDohLto,
  onUploadLtoProof,
  onSubmitVerification,
  onWithdrawVerification,
  onTogglePublishDirectory,
  onToggleBookingPause,
  isLtoSaving,
  isLtoUploading,
  isWithdrawingVerification,
  isPublishingMutating,
  isBookingPauseMutating,
  onNavigateTab,
  onOpenAddStaff,
  onOpenAddService,
  onOpenLicenseModal,
  showSkeletons = false,
}: FacilityReadinessTabProps) {
  const [, setThemeTick] = useState(0);
  useEffect(() => subscribeActiveTheme(() => setThemeTick((t) => t + 1)), []);

  const [localPublishingLoading, setLocalPublishingLoading] = useState(false);
  const [localPauseLoading, setLocalPauseLoading] = useState(false);
  const [localWithdrawLoading, setLocalWithdrawLoading] = useState(false);
  const [localLtoSaving, setLocalLtoSaving] = useState(false);
  const [localLtoUploading, setLocalLtoUploading] = useState(false);
  const [localLtoFile, setLocalLtoFile] = useState<PickedEvidenceFile | null>(null);
  const [stagedLtoObjectKey, setStagedLtoObjectKey] = useState<string | null>(null);
  const [ltoInput, setLtoInput] = useState(letterheadDohLto ?? '');
  const [ltoExpiryInput, setLtoExpiryInput] = useState(dohLtoExpiryDate ?? '');
  const fetchLtoProofBlob = useMemo(
    () => (ltoEvidenceObjectKey ? () => clinicService.fetchLtoProofBlob() : undefined),
    [ltoEvidenceObjectKey],
  );

  useEffect(() => {
    setLtoInput(letterheadDohLto ?? '');
  }, [letterheadDohLto]);

  useEffect(() => {
    setLtoExpiryInput(dohLtoExpiryDate ?? '');
  }, [dohLtoExpiryDate]);

  useEffect(() => {
    if (platformVerificationStatus !== 'Verified') {
      setStagedLtoObjectKey(null);
    }
  }, [platformVerificationStatus]);

  useEffect(() => {
    if (stagedLtoObjectKey && ltoEvidenceObjectKey === stagedLtoObjectKey) {
      setStagedLtoObjectKey(null);
      setLocalLtoFile(null);
    }
  }, [ltoEvidenceObjectKey, stagedLtoObjectKey]);

  const publishingLoading = isPublishingMutating ?? localPublishingLoading;
  const pauseLoading = isBookingPauseMutating ?? localPauseLoading;
  const withdrawLoading = isWithdrawingVerification ?? localWithdrawLoading;
  const savingLto = isLtoSaving ?? localLtoSaving;
  const uploadingLto = isLtoUploading ?? localLtoUploading;

  // 1. License Check
  const hasActiveLicense = Boolean(
    license &&
      license.status === 'Active' &&
      !license.isTampered &&
      (!license.expiresAtUtc || new Date(license.expiresAtUtc) > new Date()) &&
      (license.limits?.maxStaff ?? 0) > 0,
  );

  // 2. Profile Check
  const hasProfile = Boolean(clinicName?.trim() && (letterheadAddress?.trim() || letterheadContact?.trim()));

  // 3. Operating Hours Check
  const hasOperatingHours = Boolean(operatingHours && operatingHours.trim().length > 0);

  // 4. DOH LTO Number or Proof Check
  const savedDohLto = letterheadDohLto?.trim() || '';
  const savedDohLtoExpiry = dohLtoExpiryDate?.trim() || '';
  const hasLtoProof = Boolean(ltoEvidenceObjectKey?.trim());
  const hasDohLtoOrProof = Boolean(savedDohLto || hasLtoProof);

  // 5. Doctor with PRC
  const activeDoctors = staff.filter((s) => s.isActive && s.role === 'Doctor' && Boolean(s.prcLicenseNumber?.trim()));
  const hasDoctor = activeDoctors.length > 0;

  // 6. Front Desk or Cashier
  const activeFrontDesk = staff.filter(
    (s) => s.isActive && (s.role === 'Receptionist' || s.role === 'Cashier' || s.role === 'Admin'),
  );
  const hasFrontDesk = activeFrontDesk.length > 0;

  // 7. Fee Schedule & Catalog
  const activeServices = services.filter((s) => s.isActive);
  const hasServices = activeServices.length > 0;

  // 8. PhilHealth (Optional)
  const hasPhilHealth = Boolean(accreditationNumber?.trim()) && Boolean(isPhilHealthConfigured);

  // 9. Contact / Official details (Optional)
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
      id: 'dohLto',
      category: 'directory',
      title: 'DOH License to Operate (LTO) & Proof',
      description: hasDohLtoOrProof
        ? [
            savedDohLto ? `LTO No. ${savedDohLto}` : null,
            savedDohLtoExpiry ? `Expires ${savedDohLtoExpiry}` : null,
            hasLtoProof ? 'LTO proof document uploaded' : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'Enter a DOH LTO number or upload an LTO proof document (PDF, JPEG, or PNG) for directory verification.',
      status: hasDohLtoOrProof ? 'passed' : 'failed',
      required: true,
      actionLabel: hasLtoProof ? 'Replace LTO Proof' : 'Upload LTO Proof',
      actionTab: 'documents',
    },
    {
      id: 'doctor',
      category: 'staff',
      title: 'Attending Physician / Doctor with PRC',
      description: hasDoctor
        ? `${activeDoctors.length} doctor(s) on roster with PRC license numbers.`
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
      title: 'PhilHealth YAKAP Accreditation',
      description: hasPhilHealth
        ? `Accreditation number ${accreditationNumber} configured for YAKAP primary care benefits.`
        : Boolean(accreditationNumber?.trim())
        ? `Accreditation number ${accreditationNumber} entered, but PhilHealth credentials are still pending configuration.`
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
  const verificationBadge = resolveFacilityVerificationBadge(platformVerificationStatus);
  const isVerified = platformVerificationStatus === 'Verified';
  const isPendingReview = platformVerificationStatus === 'PendingReview';
  const isRejectedOrSuspended =
    platformVerificationStatus === 'Rejected' || platformVerificationStatus === 'Suspended';
  const isUnverified = !platformVerificationStatus || platformVerificationStatus === 'Unverified';
  const isPublishedLive = isVerified && isDirectoryPublished;
  const trimmedLtoExpiry = ltoExpiryInput.trim();
  const ltoExpiryValidation = trimmedLtoExpiry
    ? validateDateString(trimmedLtoExpiry, { boundaryMode: 'any' })
    : null;
  const ltoExpiryError =
    ltoExpiryValidation && !ltoExpiryValidation.isValid
      ? ltoExpiryValidation.errorMessage || 'Enter a valid DOH LTO expiry date (YYYY-MM-DD).'
      : undefined;
  const ltoDraftDirty =
    ltoInput.trim() !== savedDohLto || trimmedLtoExpiry !== savedDohLtoExpiry;
  const hasStagedLtoProof = Boolean(stagedLtoObjectKey || (isVerified && localLtoFile));
  const effectiveLtoProofKey = stagedLtoObjectKey ?? ltoEvidenceObjectKey;
  const hasVerifiedLtoCredentialEdits =
    isVerified &&
    hasRegulatedLtoCredentialsChanged({
      previousDohLtoNumber: savedDohLto,
      nextDohLtoNumber: ltoInput,
      previousDohLtoExpiryDate: savedDohLtoExpiry,
      nextDohLtoExpiryDate: trimmedLtoExpiry,
      previousLtoEvidenceObjectKey: ltoEvidenceObjectKey,
      nextLtoEvidenceObjectKey: effectiveLtoProofKey,
      hasPickedProofFile: hasStagedLtoProof,
    });
  const canSaveLto = (ltoDraftDirty || hasStagedLtoProof) && !savingLto && !uploadingLto && !ltoExpiryError;

  const handlePickAndUploadLtoProof = async () => {
    if (!onUploadLtoProof) {
      onNavigateTab('documents');
      return;
    }
    const picked = await pickVerificationEvidenceFile();
    if (picked.canceled) return;
    if (picked.error || !picked.file) {
      notify.error(picked.error || 'Could not select DOH LTO proof file.');
      return;
    }
    setLocalLtoUploading(true);
    try {
      const uploadResult = await onUploadLtoProof(
        toEvidenceFormData(picked.file),
        isVerified ? { stageOnly: true } : undefined,
      );
      if (uploadResult === false) {
        return;
      }

      if (isVerified) {
        const stagedKey =
          typeof uploadResult === 'string'
            ? uploadResult
            : uploadResult &&
              typeof uploadResult === 'object' &&
              typeof uploadResult.objectKey === 'string'
            ? uploadResult.objectKey
            : null;
        if (stagedKey) {
          setStagedLtoObjectKey(stagedKey);
        }
        setLocalLtoFile(picked.file);
        notify.success('DOH LTO proof ready. Save LTO & Resubmit for Verification to submit.');
        return;
      }

      setLocalLtoFile(picked.file);
    } finally {
      setLocalLtoUploading(false);
    }
  };

  const handleDiscardStagedLtoProof = () => {
    setStagedLtoObjectKey(null);
    setLocalLtoFile(null);
  };

  const handleSaveDohLto = async () => {
    if (!onSaveDohLto) return;
    if (ltoExpiryError) {
      notify.error(ltoExpiryError);
      return;
    }
    setLocalLtoSaving(true);
    try {
      const ok = await onSaveDohLto(
        ltoInput.trim(),
        trimmedLtoExpiry || null,
        stagedLtoObjectKey ?? undefined,
      );
      if (ok !== false) {
        setStagedLtoObjectKey(null);
        setLocalLtoFile(null);
      }
    } finally {
      setLocalLtoSaving(false);
    }
  };

  const handleAction = (check: ReadinessCheckItem) => {
    if (check.id === 'doctor' || check.id === 'frontdesk') {
      onOpenAddStaff();
    } else if (check.id === 'catalog') {
      onOpenAddService();
    } else if (check.id === 'license') {
      onOpenLicenseModal();
    } else if (check.id === 'dohLto') {
      void handlePickAndUploadLtoProof();
    } else if (check.actionTab) {
      onNavigateTab(check.actionTab);
    }
  };

  const handleSubmitVerification = async () => {
    if (ltoExpiryError) {
      notify.error(ltoExpiryError);
      return;
    }
    setLocalPublishingLoading(true);
    try {
      if (ltoDraftDirty && onSaveDohLto) {
        const savedOk = await onSaveDohLto(ltoInput.trim(), trimmedLtoExpiry || null);
        if (savedOk === false) return;
      }
      if (onSubmitVerification) {
        await onSubmitVerification();
      } else if (onTogglePublishDirectory) {
        await onTogglePublishDirectory(true);
      }
    } finally {
      setLocalPublishingLoading(false);
    }
  };

  const handleWithdrawVerification = async () => {
    if (!onWithdrawVerification) return;
    setLocalWithdrawLoading(true);
    try {
      await onWithdrawVerification();
    } finally {
      setLocalWithdrawLoading(false);
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

  const heroStateStyle: ViewStyle = isFacilityReady
    ? {
        backgroundColor: theme.colors.primarySubtle,
        borderColor: theme.colors.primaryBorder,
        ...theme.shadows.brandSubtle,
      }
    : {
        backgroundColor: theme.colors.surfaceSubtle,
        borderColor: theme.colors.warningBorder,
        ...theme.shadows.sm,
      };

  return (
    <View style={styles.container}>
      {/* Pre-Flight Status Overview */}
      <Card
        testID="facility-readiness-hero-card"
        style={[styles.heroCard, heroStateStyle]}
      >
        <View style={styles.heroContent}>
          <View style={styles.heroIconBadge}>
            <Icon
              name={isFacilityReady ? 'checkCircle' : 'alertCircle'}
              size={theme.sizes.iconLg}
              color={isFacilityReady ? theme.colors.primary : theme.colors.warningText}
            />
          </View>
          <View style={styles.heroText}>
            <View style={styles.heroHeaderRow}>
              {isFacilityReady ? (
                <ThemedText variant="title" color={theme.colors.primaryDark}>
                  Facility Ready for Operations
                </ThemedText>
              ) : (
                <ThemedText variant="title">
                  Facility Setup Required
                </ThemedText>
              )}
              {isFacilityReady ? (
                <Badge
                  label="Ready to Open"
                  variant="primary"
                  size="md"
                  icon="checkCircle"
                />
              ) : (
                <Badge
                  label={`${passedMandatory}/${mandatoryChecks.length} Required`}
                  variant="warning"
                  size="md"
                  icon="alertCircle"
                />
              )}
            </View>
            <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.heroSubtext}>
              {isFacilityReady
                ? 'All mandatory clinical, staffing, and legal prerequisites are met. The clinic workstation is fully operational.'
                : 'Resolve the incomplete mandatory checks below before opening clinic doors and submitting for directory verification.'}
            </ThemedText>

            {/* Progress bar */}
            <View style={styles.progressBarWrapper}>
              <View style={[styles.progressBarBg, { backgroundColor: theme.colors.border }]}>
                <View
                  testID="facility-readiness-progress-fill"
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${readinessPercent}%`,
                      backgroundColor: theme.colors.primary,
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
          subtitle="Mandatory regulatory items must pass before daily clinic operations and directory submission."
        />
        <CardContent>
          <View style={styles.checklist}>
            {checks.map((check) => {
              const isPassed = check.status === 'passed';
              const isFailed = check.status === 'failed';

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
                      loading={check.id === 'dohLto' && uploadingLto}
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
          subtitle="Verify your DOH License to Operate and manage patient directory visibility."
          icon="globe"
          rightAction={
            <View style={styles.headerBadgeGroup}>
              <Badge
                label={verificationBadge.label}
                variant={verificationBadge.variant}
                size="sm"
                icon={verificationBadge.icon}
              />
              {isPublishedLive ? (
                <Badge label="Published" variant="success" size="sm" icon="checkCircle" />
              ) : null}
            </View>
          }
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
                  To resolve: Contact your workspace administrator to enable &quot;Patient App Discovery&quot; in Portal Branches → Facility Settings.
                </ThemedText>
              </View>
            </View>
          )}

          {/* Rejected / Action Required Notice */}
          {isRejectedOrSuspended && (
            <View style={styles.rejectedBanner}>
              <View style={styles.warningBannerIconCol}>
                <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergency} />
              </View>
              <View style={styles.warningBannerTextCol}>
                <View style={styles.warningBannerHeaderRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
                    Directory Verification Action Required
                  </ThemedText>
                  <Badge label="Action Required" variant="emergency" size="sm" icon="alertCircle" />
                </View>
                <ThemedText variant="small" color={theme.colors.emergencyText}>
                  {verificationRejectionReason?.trim()
                    ? verificationRejectionReason.trim()
                    : 'Your directory verification submission requires updates before it can be published.'}
                </ThemedText>
              </View>
            </View>
          )}

          {/* DOH LTO Number & Proof Document */}
          <View style={styles.ltoBox}>
            <View style={styles.ltoHeaderRow}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                DOH License to Operate (LTO)
              </ThemedText>
              <Badge
                label={hasLtoProof ? 'LTO Proof Uploaded' : savedDohLto ? 'LTO Number Recorded' : 'LTO Required'}
                variant={hasDohLtoOrProof ? 'success' : 'neutral'}
                size="sm"
                icon={hasDohLtoOrProof ? 'checkCircle' : 'file'}
              />
            </View>

            <View style={styles.ltoInputRow}>
              <Input
                containerStyle={styles.ltoInputFlex}
                label="DOH LTO Number"
                value={ltoInput}
                onChangeText={setLtoInput}
                placeholder="e.g. DOH-LTO-04A-2026-0089"
                helperText="Enter your DOH LTO number and/or upload a PDF, JPEG, or PNG proof (max 5 MB)."
                testID="readiness-input-doh-lto"
              />
              <ValidatedDateInput
                containerStyle={styles.ltoInputFlex}
                label="DOH LTO Expiry Date"
                value={ltoExpiryInput}
                onChangeText={setLtoExpiryInput}
                boundaryMode="any"
                placeholder="YYYY-MM-DD"
                helperText="Optional. Format: YYYY-MM-DD."
                testID="readiness-input-doh-lto-expiry"
              />
              {onSaveDohLto ? (
                <View style={styles.ltoSaveBtnWrap}>
                  <Button
                    title={
                      hasVerifiedLtoCredentialEdits
                        ? RESUBMIT_LTO_BUTTON_LABEL
                        : isPendingReview
                        ? PENDING_VERIFICATION_BUTTON_LABEL
                        : 'Save LTO'
                    }
                    variant={hasVerifiedLtoCredentialEdits ? 'primary' : 'outline'}
                    size="sm"
                    onPress={handleSaveDohLto}
                    loading={savingLto}
                    disabled={!canSaveLto}
                    testID="btn-save-doh-lto"
                  />
                </View>
              ) : null}
            </View>

            {hasVerifiedLtoCredentialEdits ? (
              <ReverificationNoticeBanner
                message={REGULATED_LTO_REVERIFICATION_NOTICE}
                testID="readiness-lto-reverification-notice"
              />
            ) : isPendingReview ? (
              <PendingVerificationNote testID="readiness-pending-helper-note" />
            ) : null}

            <View style={styles.ltoProofRow}>
              <Button
                title={hasLtoProof || hasStagedLtoProof ? 'Replace LTO Proof' : 'Upload LTO Proof'}
                variant="secondary"
                size="sm"
                icon="upload"
                loading={uploadingLto}
                disabled={uploadingLto || savingLto}
                onPress={handlePickAndUploadLtoProof}
                testID="btn-upload-lto-proof"
              />
              {hasStagedLtoProof ? (
                <>
                  <ThemedText variant="caption" color={theme.colors.warningText}>
                    New LTO proof staged. Click {RESUBMIT_LTO_BUTTON_LABEL} to submit.
                  </ThemedText>
                  <Button
                    title="Discard Staged Proof"
                    variant="ghost"
                    size="sm"
                    onPress={handleDiscardStagedLtoProof}
                    disabled={savingLto || uploadingLto}
                    testID="btn-discard-staged-lto-proof"
                  />
                </>
              ) : hasLtoProof ? (
                <ThemedText variant="caption" color={theme.colors.successText}>
                  LTO evidence document is stored on file.
                </ThemedText>
              ) : (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  No LTO proof document uploaded yet.
                </ThemedText>
              )}
            </View>

            {hasLtoProof || hasStagedLtoProof || localLtoFile ? (
              <EvidenceProofPreview
                label="DOH License to Operate (LTO) Proof"
                objectKey={effectiveLtoProofKey}
                localFile={localLtoFile}
                fetchBlob={fetchLtoProofBlob}
                testID="lto-proof-preview"
              />
            ) : null}
          </View>

          {/* Directory Verification & Publishing Control Row */}
          <View style={[styles.controlRow, styles.controlRowBorderTop]}>
            <View style={styles.controlTextCol}>
              <View style={styles.controlTitleRow}>
                <ThemedText variant="bodyBold">
                  {isVerified ? 'Publish to Directory' : 'Directory Verification'}
                </ThemedText>
                {isVerified ? (
                  <Badge
                    label={isDirectoryPublished ? 'Published' : 'Unlisted'}
                    variant={isDirectoryPublished ? 'success' : 'neutral'}
                    size="sm"
                    icon={isDirectoryPublished ? 'checkCircle' : 'lock'}
                  />
                ) : (
                  <Badge
                    label={verificationBadge.label}
                    variant={verificationBadge.variant}
                    size="sm"
                    icon={verificationBadge.icon}
                  />
                )}
              </View>

              <ThemedText variant="small" color={theme.colors.textSecondary}>
                {isPendingReview
                  ? 'Your clinic verification request is awaiting platform review.'
                  : isRejectedOrSuspended
                  ? 'Update your clinic details or DOH LTO documentation, then resubmit for verification.'
                  : isVerified && isDirectoryPublished
                  ? 'Your clinic is verified and published in the patient directory.'
                  : isVerified
                  ? 'Your clinic is verified. Turn on publishing to list it in the patient directory.'
                  : 'Submit your clinic credentials and DOH LTO documentation for verification before publishing.'}
              </ThemedText>

              {isPendingReview && lastVerificationSubmittedAtUtc ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Submitted {new Date(lastVerificationSubmittedAtUtc).toLocaleDateString()}
                </ThemedText>
              ) : null}

              {typeof optedInCliniciansCount === 'number' && optedInCliniciansCount > 0 ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Opted-in clinicians ready: {optedInCliniciansReadyCount ?? 0}/{optedInCliniciansCount}
                </ThemedText>
              ) : null}

              {!canPublish && (isUnverified || isRejectedOrSuspended || isVerified) ? (
                <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={styles.ineligibleNotice}>
                  {!isWorkspaceEligible
                    ? 'Publishing locked: Requires workspace administrator approval in Portal.'
                    : 'Publishing locked: Complete all mandatory pre-flight checks above.'}
                </ThemedText>
              ) : null}
            </View>

            <View style={styles.controlSwitchCol}>
              {isVerified ? (
                <ToggleSwitch
                  value={isDirectoryPublished}
                  onValueChange={handlePublishToggle}
                  disabled={!canPublish || publishingLoading}
                  accessibilityLabel="Publish to Directory"
                  testID="switch-publish-directory"
                />
              ) : isPendingReview ? (
                <Button
                  title="Withdraw Submission"
                  variant="outline"
                  size="sm"
                  onPress={handleWithdrawVerification}
                  loading={withdrawLoading}
                  disabled={withdrawLoading}
                  testID="btn-withdraw-verification"
                />
              ) : (
                <Button
                  title="Submit for Verification"
                  variant="primary"
                  size="sm"
                  onPress={handleSubmitVerification}
                  loading={publishingLoading}
                  disabled={!canPublish || publishingLoading || savingLto || uploadingLto}
                  testID="btn-submit-verification"
                />
              )}
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
                  ? 'Online appointment booking is currently paused. Patients see your clinic as paused while walk-in queues and existing appointments continue.'
                  : 'Patients can schedule outpatient consultations in available doctor shift slots based on your weekly roster.'}
              </ThemedText>
              {!isPublishedLive && (
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.ineligibleNotice}>
                  Active when clinic is verified and published to directory.
                </ThemedText>
              )}
            </View>
            <View style={styles.controlSwitchCol}>
              <ToggleSwitch
                value={isOnlineBookingPaused}
                onValueChange={handleBookingPauseToggle}
                disabled={!isPublishedLive || pauseLoading}
                accessibilityLabel="Pause Online Appointment Booking"
                testID="switch-booking-pause"
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
  headerBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
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
  rejectedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
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
  ltoBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  ltoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  ltoInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  ltoInputFlex: {
    flex: 1,
    minWidth: 220,
  },
  ltoSaveBtnWrap: {
    paddingBottom: 20,
  },
  ltoProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
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
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.full,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
});
