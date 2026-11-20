import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import {
  Modal,
  Input,
  Button,
  Badge,
  Icon,
  ErrorState,
  EmptyState,
  SkeletonList,
  ThemedText,
  ValidatedDateInput,
  validateDateString,
  SegmentedControl,
  PhilHealthPinInput,
  validatePhilHealthPinMod11,
  formatPhilHealthPin,
} from '../ui';
import { notify } from '../../utils/feedback';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import {
  formatYakapStatusBadge,
  formatYakapSourceLabel,
  toIsoDateString,
  type YakapEnlistmentStatus as UtilsYakapStatus,
  type YakapEnlistmentSource as UtilsYakapSource,
} from '../../utils/yakapEnlistment';
import {
  clinicService,
  type ClinicPatient,
  type PatientPhilHealthCoverageDto,
  type PatientYakapEnlistmentDto,
  type PhilHealthMemberType,
  type YakapEnlistmentSource,
  type PinValidationResult,
} from '../../services/clinicService';
import type { BadgeVariant } from '../ui/Badge';
import type { IconName } from '../ui/Icon';
import {
  buildPrincipalSponsorFromGuardian,
  type PrincipalRelationship,
} from './memberType';

function resolveCoverageEnlistmentBadge(status?: string | null): {
  label: string;
  variant: BadgeVariant;
  icon: IconName;
} {
  if (!status) {
    return formatYakapStatusBadge(null) as { label: string; variant: BadgeVariant; icon: IconName };
  }
  if (status === 'Active' || status === 'Expired' || status === 'Transferred') {
    return formatYakapStatusBadge(status as UtilsYakapStatus) as {
      label: string;
      variant: BadgeVariant;
      icon: IconName;
    };
  }
  switch (status) {
    case 'Draft':
      return { label: 'Draft Enlistment', variant: 'neutral', icon: 'edit' };
    case 'Registered':
      return { label: 'Registered', variant: 'info', icon: 'check' };
    case 'Verified':
      return { label: 'Verified', variant: 'success', icon: 'shieldCheck' };
    case 'ProfilingCompleted':
      return { label: 'Profiling Completed', variant: 'success', icon: 'checkCircle' };
    case 'Transmitted':
      return { label: 'Transmitted to PhilHealth', variant: 'success', icon: 'send' };
    case 'Suspended':
      return { label: 'Suspended', variant: 'warning', icon: 'alert' };
    case 'Cancelled':
      return { label: 'Cancelled', variant: 'emergency', icon: 'close' };
    default:
      return { label: status, variant: 'neutral', icon: 'info' };
  }
}

function resolveCoverageEnlistmentSourceLabel(source?: string | null): string {
  if (!source) {
    return formatYakapSourceLabel(null);
  }
  if (
    source === 'PhilHealthMasterlist' ||
    source === 'ClinicEnlistment' ||
    source === 'SelfReported'
  ) {
    return formatYakapSourceLabel(source as UtilsYakapSource);
  }
  switch (source) {
    case 'WalkIn':
      return 'Walk-In Intake';
    case 'OnlinePortal':
      return 'Online Portal';
    case 'MasterlistSync':
      return 'Masterlist Sync';
    case 'AssistedIntake':
      return 'Assisted Intake';
    default:
      return source;
  }
}

export interface PhilHealthCoverageModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  onSaved?: (coverage: PatientPhilHealthCoverageDto) => void;
  onStartYakapScreening?: (patient: ClinicPatient) => void;
}

interface PinCheckFeedback {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  message: string;
}

export default function PhilHealthCoverageModal({
  visible,
  onClose,
  patient,
  onSaved,
  onStartYakapScreening,
}: PhilHealthCoverageModalProps) {
  const { isCompact } = useBreakpoint();
  const { options: relationshipOptions, loading: loadingRelationships } = useEhrOptions(
    'dependent_relationship',
    {
      enabled: visible,
    }
  );

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<PatientPhilHealthCoverageDto | null>(null);

  // Membership form state
  const [pin, setPin] = useState('');
  const [memberType, setMemberType] = useState<PhilHealthMemberType>('MM');
  const [dependentRelationship, setDependentRelationship] = useState<PrincipalRelationship>('C');
  const [principalMemberPin, setPrincipalMemberPin] = useState('');
  const [principalLastName, setPrincipalLastName] = useState('');
  const [principalFirstName, setPrincipalFirstName] = useState('');
  const [principalMiddleName, setPrincipalMiddleName] = useState('');
  const [principalSuffix, setPrincipalSuffix] = useState('');
  const [principalDateOfBirth, setPrincipalDateOfBirth] = useState('');
  const [membershipCategoryCode, setMembershipCategoryCode] = useState('');
  const [membershipCategoryDesc, setMembershipCategoryDesc] = useState('');
  const [employerPin, setEmployerPin] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [defaultWalkInAtc, setDefaultWalkInAtc] = useState('');

  const [pinFeedback, setPinFeedback] = useState<PinCheckFeedback>({
    status: 'idle',
    message: '',
  });
  const [savingMembership, setSavingMembership] = useState(false);
  const [showEmployerFields, setShowEmployerFields] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Enlistment renewal sub-modal state
  const [enlistmentModalVisible, setEnlistmentModalVisible] = useState(false);
  const [renewalYear, setRenewalYear] = useState(() => String(new Date().getFullYear()));
  const [renewalEnlistDate, setRenewalEnlistDate] = useState(() => toIsoDateString());
  const [renewalValidUntil, setRenewalValidUntil] = useState(() => `${new Date().getFullYear()}-12-31`);
  const [renewalSource, setRenewalSource] = useState<YakapEnlistmentSource>('ClinicEnlistment');
  const [renewalCaseNo, setRenewalCaseNo] = useState('');
  const [renewalTransNo, setRenewalTransNo] = useState('');
  const [renewalYesRefNo, setRenewalYesRefNo] = useState('');
  const [renewalNotes, setRenewalNotes] = useState('');
  const [savingEnlistment, setSavingEnlistment] = useState(false);

  const guardianSponsor = useMemo(() => {
    const primaryGuardian =
      patient?.guardians?.find((g) => g.isPrimaryGuardian) ||
      patient?.guardians?.[0] ||
      null;
    return buildPrincipalSponsorFromGuardian(primaryGuardian, {
      patientDob: patient?.dateOfBirth,
      pwdId: patient?.pwdId,
    });
  }, [patient]);

  const hydrateFromCoverage = useCallback(
    (data: PatientPhilHealthCoverageDto, currentPatient: ClinicPatient) => {
      const m = data.membership;
      const effectivePin = m?.philHealthPin || data.philHealthNumber || currentPatient.philHealthNumber || '';
      setPin(effectivePin ? formatPhilHealthPin(effectivePin) : '');
      const nextMemberType: PhilHealthMemberType = m?.memberType === 'DD' ? 'DD' : 'MM';
      setMemberType(nextMemberType);
      setDependentRelationship((m?.dependentRelationship as PrincipalRelationship) || ((currentPatient.age ?? 0) < 18 ? 'C' : 'S'));
      setPrincipalMemberPin(m?.principalMemberPin ? formatPhilHealthPin(m.principalMemberPin) : '');
      setPrincipalLastName(m?.principalLastName || '');
      setPrincipalFirstName(m?.principalFirstName || '');
      setPrincipalMiddleName(m?.principalMiddleName || '');
      setPrincipalSuffix(m?.principalSuffix || '');
      setPrincipalDateOfBirth(
        m?.principalDateOfBirth ? toIsoDateString(m.principalDateOfBirth) : ''
      );
      setMembershipCategoryCode(m?.membershipCategoryCode || '');
      setMembershipCategoryDesc(m?.membershipCategoryDesc || '');
      setEmployerPin(m?.employerPin || '');
      setEmployerName(m?.employerName || '');
      setDefaultWalkInAtc(m?.defaultWalkInAtc || '');
      setShowEmployerFields(
        Boolean(m?.membershipCategoryCode || m?.membershipCategoryDesc || m?.employerPin || m?.employerName)
      );
      setPinFeedback({ status: 'idle', message: '' });
    },
    []
  );

  const loadCoverage = useCallback(
    async (targetPatient: ClinicPatient) => {
      setLoading(true);
      setLoadError(null);
      try {
        const [data, err] = await clinicService.getPatientPhilHealthCoverage(targetPatient.id);
        if (err || !data) {
          setCoverage(null);
          setLoadError(err?.message || 'Unable to load PhilHealth coverage details.');
          return;
        }
        setCoverage(data);
        hydrateFromCoverage(data, targetPatient);
      } catch (e: any) {
        setCoverage(null);
        setLoadError(e?.message || 'Unable to load PhilHealth coverage details.');
      } finally {
        setLoading(false);
      }
    },
    [hydrateFromCoverage]
  );

  useEffect(() => {
    if (visible && patient) {
      setEnlistmentModalVisible(false);
      setHistoryOpen(false);
      void loadCoverage(patient);
    }
  }, [visible, patient, loadCoverage]);

  const handleVerifyPin = useCallback(async () => {
    const mod11 = validatePhilHealthPinMod11(pin);
    if (!mod11.isComplete) {
      setPinFeedback({
        status: 'invalid',
        message: mod11.errorMessage || 'Enter a complete 12-digit PhilHealth PIN.',
      });
      return;
    }
    if (!mod11.isValid) {
      setPinFeedback({
        status: 'invalid',
        message: mod11.errorMessage || 'PhilHealth PIN failed Mod-11 check digit validation.',
      });
      return;
    }

    setPinFeedback({ status: 'checking', message: 'Verifying PIN...' });
    try {
      const [res, err] = await clinicService.validatePhilHealthPin(mod11.formattedPin);
      if (err) {
        // Offline / non-YAKAP role fallback: Mod-11 passed locally
        setPinFeedback({
          status: 'valid',
          message: 'Valid 12-digit Mod-11 PIN (local verification)',
        });
        return;
      }

      // Defensive parsing: backend /yakap/pin/{pin}/validate returns ApiResponse<bool>,
      // while clinicService types PinValidationResult.
      const raw = res as unknown as boolean | PinValidationResult | null;
      const serverValid =
        typeof raw === 'boolean'
          ? raw
          : typeof raw?.isValid === 'boolean'
            ? raw.isValid
            : mod11.isValid;

      if (serverValid) {
        setPinFeedback({
          status: 'valid',
          message: 'Verified 12-digit PhilHealth PIN (Mod-11 & standing checked)',
        });
      } else {
        setPinFeedback({
          status: 'invalid',
          message:
            (typeof raw === 'object' && raw?.failureReason) ||
            'PhilHealth registry could not verify this PIN.',
        });
      }
    } catch {
      setPinFeedback({
        status: 'valid',
        message: 'Valid 12-digit Mod-11 PIN (offline check)',
      });
    }
  }, [pin]);

  const handleApplyGuardianSponsor = useCallback(() => {
    if (!guardianSponsor) return;
    if (guardianSponsor.formattedPin || guardianSponsor.rawPin) {
      setPrincipalMemberPin(guardianSponsor.formattedPin || formatPhilHealthPin(guardianSponsor.rawPin));
    }
    setDependentRelationship(guardianSponsor.relationship);
    setPrincipalFirstName(guardianSponsor.firstName);
    setPrincipalMiddleName(guardianSponsor.middleName);
    setPrincipalLastName(guardianSponsor.lastName);
    setPrincipalSuffix(guardianSponsor.suffix);
    if (guardianSponsor.birthDate) {
      setPrincipalDateOfBirth(guardianSponsor.birthDate);
    }
    notify.success(`Copied ${guardianSponsor.fullName || 'legal guardian'} into Principal Sponsor.`);
  }, [guardianSponsor]);

  const handleSaveMembership = useCallback(async () => {
    if (!patient) return;

    const trimmedPin = pin.trim();
    if (trimmedPin) {
      const mod11 = validatePhilHealthPinMod11(trimmedPin);
      if (!mod11.isValid) {
        notify.error(mod11.errorMessage || 'PhilHealth PIN is invalid.');
        return;
      }
    }

    if (memberType === 'DD') {
      const sponsorPinMod11 = validatePhilHealthPinMod11(principalMemberPin);
      if (!principalMemberPin.trim() || !sponsorPinMod11.isValid) {
        notify.error(sponsorPinMod11.errorMessage || 'Valid 12-digit Principal Member PIN is required for dependents.');
        return;
      }
      if (!principalLastName.trim() || !principalFirstName.trim()) {
        notify.error('Principal Member Last Name and First Name are required.');
        return;
      }
      const dobValidation = validateDateString(principalDateOfBirth, { boundaryMode: 'pastOrToday' });
      if (!principalDateOfBirth.trim() || !dobValidation.isValid) {
        notify.error(dobValidation.errorMessage || 'Valid Principal Member Date of Birth is required.');
        return;
      }
      if (!dependentRelationship) {
        notify.error('Select the dependent relationship to the principal member.');
        return;
      }
    }

    setSavingMembership(true);
    try {
      const [, err] = await clinicService.upsertPatientPhilHealthMembership(patient.id, {
        memberType,
        dependentRelationship: memberType === 'DD' ? dependentRelationship : null,
        philHealthPin: trimmedPin || null,
        principalMemberPin: memberType === 'DD' ? principalMemberPin.trim() : trimmedPin || null,
        principalLastName: memberType === 'DD' ? principalLastName.trim() : patient.lastName,
        principalFirstName: memberType === 'DD' ? principalFirstName.trim() : patient.firstName,
        principalMiddleName: memberType === 'DD' ? (principalMiddleName.trim() || null) : (patient.middleName || null),
        principalSuffix: memberType === 'DD' ? (principalSuffix.trim() || null) : (patient.suffix || null),
        principalDateOfBirth: memberType === 'DD' ? principalDateOfBirth.trim() : patient.dateOfBirth,
        membershipCategoryCode: membershipCategoryCode.trim() || null,
        membershipCategoryDesc: membershipCategoryDesc.trim() || null,
        employerPin: employerPin.trim() || null,
        employerName: employerName.trim() || null,
        defaultWalkInAtc: defaultWalkInAtc.trim() || null,
      });

      if (err) {
        notify.error(err.message || 'Could not save PhilHealth membership details.');
        return;
      }

      notify.success('PhilHealth coverage & membership saved.');
      const [fresh] = await clinicService.getPatientPhilHealthCoverage(patient.id);
      if (fresh) {
        setCoverage(fresh);
        hydrateFromCoverage(fresh, patient);
        onSaved?.(fresh);
      }
    } catch (e: any) {
      notify.error(e?.message || 'Failed to save PhilHealth coverage.');
    } finally {
      setSavingMembership(false);
    }
  }, [
    patient,
    pin,
    memberType,
    principalMemberPin,
    principalLastName,
    principalFirstName,
    principalMiddleName,
    principalSuffix,
    principalDateOfBirth,
    dependentRelationship,
    membershipCategoryCode,
    membershipCategoryDesc,
    employerPin,
    employerName,
    defaultWalkInAtc,
    hydrateFromCoverage,
    onSaved,
  ]);

  const sortedEnlistments = useMemo(() => {
    const list = coverage?.enlistments ?? [];
    return [...list].sort((a, b) => b.effectiveYear - a.effectiveYear);
  }, [coverage?.enlistments]);

  const activeEnlistment: PatientYakapEnlistmentDto | null = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return (
      sortedEnlistments.find(
        (e) => e.effectiveYear === currentYear && e.status !== 'Expired' && e.status !== 'Cancelled'
      ) ||
      sortedEnlistments[0] ||
      null
    );
  }, [sortedEnlistments]);

  const handleOpenEnlistmentModal = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const suggestedYear = activeEnlistment && activeEnlistment.effectiveYear >= currentYear
      ? String(activeEnlistment.effectiveYear + 1)
      : String(currentYear);
    setRenewalYear(suggestedYear);
    setRenewalEnlistDate(toIsoDateString());
    setRenewalValidUntil(`${suggestedYear}-12-31`);
    setRenewalSource('ClinicEnlistment');
    setRenewalCaseNo('');
    setRenewalTransNo('');
    setRenewalYesRefNo('');
    setRenewalNotes('');
    setEnlistmentModalVisible(true);
  }, [activeEnlistment]);

  const handleConfirmEnlistment = useCallback(async () => {
    if (!patient) return;
    const yearNum = parseInt(renewalYear.trim(), 10);
    if (!/^\d{4}$/.test(renewalYear.trim()) || isNaN(yearNum)) {
      notify.error('Enter a valid 4-digit benefit year.');
      return;
    }
    const enlistDateCheck = validateDateString(renewalEnlistDate, { boundaryMode: 'pastOrToday' });
    if (!enlistDateCheck.isValid) {
      notify.error(enlistDateCheck.errorMessage || 'Enter a valid enlistment date.');
      return;
    }
    if (renewalValidUntil.trim()) {
      const validUntilCheck = validateDateString(renewalValidUntil, { boundaryMode: 'any' });
      if (!validUntilCheck.isValid) {
        notify.error(validUntilCheck.errorMessage || 'Enter a valid expiration date.');
        return;
      }
    }

    setSavingEnlistment(true);
    try {
      const [, err] = await clinicService.createPatientYakapEnlistment(patient.id, {
        effectiveYear: yearNum,
        enlistmentDate: renewalEnlistDate.trim(),
        validUntil: renewalValidUntil.trim() || `${yearNum}-12-31`,
        source: renewalSource,
        caseNo: renewalCaseNo.trim() || null,
        enlistmentTransNo: renewalTransNo.trim() || null,
        yesReferenceNo: renewalYesRefNo.trim() || null,
        notes: renewalNotes.trim() || null,
      });

      if (err) {
        notify.error(err.message || 'Could not record PhilHealth YAKAP enlistment.');
        return;
      }

      setEnlistmentModalVisible(false);
      notify.success(`Recorded PhilHealth YAKAP enlistment for ${yearNum}.`);
      const [fresh] = await clinicService.getPatientPhilHealthCoverage(patient.id);
      if (fresh) {
        setCoverage(fresh);
        onSaved?.(fresh);
      }
    } catch (e: any) {
      notify.error(e?.message || 'Failed to save PhilHealth YAKAP enlistment.');
    } finally {
      setSavingEnlistment(false);
    }
  }, [
    patient,
    renewalYear,
    renewalEnlistDate,
    renewalValidUntil,
    renewalSource,
    renewalCaseNo,
    renewalTransNo,
    renewalYesRefNo,
    renewalNotes,
    onSaved,
  ]);

  if (!visible || !patient) {
    return null;
  }

  const fpeStatus = coverage?.currentYearFpeStatus;
  const enlistmentBadge = resolveCoverageEnlistmentBadge(activeEnlistment?.status);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="PhilHealth Info & YAKAP Enlistment"
      subtitle={`${patient.fullName} · ${patient.sex} · ${patient.age} yrs · Administrative Coverage (No Visit Created)`}
      maxWidth={680}
      maxHeight="95%"
      testID="philhealth-coverage-modal"
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Close"
            variant="ghost"
            onPress={onClose}
            disabled={savingMembership || savingEnlistment}
          />
          <Button
            title="Save Coverage"
            icon="save"
            onPress={handleSaveMembership}
            loading={savingMembership}
            disabled={loading || !!loadError || savingMembership}
            testID="philhealth-save-coverage-btn"
          />
        </View>
      }
    >
      {loading ? (
        <SkeletonList rows={5} />
      ) : loadError ? (
        <ErrorState
          title="Could not load PhilHealth coverage"
          message={loadError}
          onRetry={() => loadCoverage(patient)}
        />
      ) : (
        <View style={styles.sectionsContainer}>
          {/* Annual FPE Status Banner */}
          <View
            style={[
              styles.fpeBanner,
              fpeStatus?.isCompleted ? styles.fpeBannerCompleted : styles.fpeBannerPending,
            ]}
            testID="yakap-fpe-status-banner"
          >
            <View style={styles.fpeBannerHeader}>
              <View style={styles.fpeBannerTitleRow}>
                <Icon
                  name={fpeStatus?.isCompleted ? 'checkCircle' : 'yakap'}
                  size={theme.sizes.iconMd}
                  color={fpeStatus?.isCompleted ? theme.colors.successText : theme.colors.infoText}
                />
                <View style={styles.fpeBannerText}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {fpeStatus?.effectiveYear ?? new Date().getFullYear()} Annual Health Screening (YAKAP FPE)
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {fpeStatus?.isCompleted
                      ? `Completed on ${fpeStatus.profilingDate || 'Recorded'} · Trans No: ${fpeStatus.profilingTransNo || 'Assigned'}`
                      : 'Pending for current benefit year. Launch Health Screening in YAKAP FPE mode when patient is ready.'}
                  </ThemedText>
                </View>
              </View>
              <Badge
                label={fpeStatus?.isCompleted ? 'FPE Completed' : 'FPE Pending'}
                variant={fpeStatus?.isCompleted ? 'success' : 'info'}
                size="sm"
                icon={fpeStatus?.isCompleted ? 'checkCircle' : 'clock'}
              />
            </View>

            {!fpeStatus?.isCompleted && onStartYakapScreening ? (
              <View style={styles.fpeActionRow}>
                <Button
                  title="Start YAKAP Health Screening"
                  icon="heartPulse"
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    onClose();
                    onStartYakapScreening(patient);
                  }}
                  testID="start-yakap-screening-btn"
                />
              </View>
            ) : null}
          </View>

          {/* Section 1: Membership & Identity */}
          <View style={styles.cardSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleGroup}>
                <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  PhilHealth Membership & Identity
                </ThemedText>
              </View>
              <Badge
                label={memberType === 'MM' ? 'Member (MM)' : 'Dependent (DD)'}
                variant={memberType === 'MM' ? 'primary' : 'info'}
                size="sm"
              />
            </View>

            {/* PIN Input + Inline Verify */}
            <View style={[styles.pinRow, isCompact && styles.stackCol]}>
              <View style={styles.pinInputCol}>
                <PhilHealthPinInput
                  value={pin}
                  onChangeText={(formatted) => {
                    setPin(formatted);
                    setPinFeedback({ status: 'idle', message: '' });
                  }}
                  label="Patient PhilHealth PIN"
                  helperText="12-digit PhilHealth Identification Number (XX-XXXXXXXXX-X)"
                  testID="coverage-patient-pin-input"
                />
              </View>
              <View style={styles.verifyBtnWrap}>
                <Button
                  title={pinFeedback.status === 'checking' ? 'Verifying...' : 'Verify PIN'}
                  variant="outline"
                  size="sm"
                  icon="shieldCheck"
                  loading={pinFeedback.status === 'checking'}
                  onPress={handleVerifyPin}
                  testID="verify-pin-btn"
                />
              </View>
            </View>

            {pinFeedback.status !== 'idle' && pinFeedback.status !== 'checking' ? (
              <View style={styles.pinFeedbackRow}>
                <Badge
                  label={pinFeedback.message}
                  variant={pinFeedback.status === 'valid' ? 'success' : 'emergency'}
                  size="sm"
                  icon={pinFeedback.status === 'valid' ? 'checkCircle' : 'alertCircle'}
                />
              </View>
            ) : null}

            {/* MM / DD Segmented Control */}
            <View style={styles.fieldGroup}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Membership Type
              </ThemedText>
              <SegmentedControl
                options={[
                  { value: 'MM', label: 'Member (MM)', icon: 'patient' },
                  { value: 'DD', label: 'Dependent (DD)', icon: 'patients' },
                ]}
                value={memberType}
                onChange={(val) => {
                  const next = val as PhilHealthMemberType;
                  setMemberType(next);
                  if (next === 'DD' && !principalLastName) {
                    setPrincipalLastName(patient.lastName || '');
                  }
                }}
              />
            </View>

            {/* Conditional Principal Sponsor Card (DD) */}
            {memberType === 'DD' ? (
              <View style={styles.sponsorCard} testID="principal-sponsor-card">
                <View style={styles.sponsorHeaderRow}>
                  <View style={styles.sectionTitleGroup}>
                    <Icon name="patientVerified" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Principal Member / Sponsor
                    </ThemedText>
                  </View>
                  {guardianSponsor ? (
                    <Button
                      title={guardianSponsor.buttonLabel}
                      icon="copy"
                      variant="outline"
                      size="xs"
                      onPress={handleApplyGuardianSponsor}
                      testID="use-legal-guardian-btn"
                    />
                  ) : null}
                </View>

                <View style={styles.fieldGroup}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Dependent Relationship *
                  </ThemedText>
                  <View style={styles.chipRow}>
                    {relationshipOptions.length > 0 ? (
                      relationshipOptions.map((opt) => {
                        const code = (opt.philHealthCode || opt.code) as PrincipalRelationship;
                        const isSelected = dependentRelationship === code;
                        return (
                          <Pressable
                            key={opt.code}
                            onPress={() => setDependentRelationship(code)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            style={[styles.chip, isSelected && styles.chipActive]}
                          >
                            <ThemedText
                              variant={isSelected ? 'smallBold' : 'small'}
                              color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                            >
                              {opt.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })
                    ) : (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {loadingRelationships
                          ? 'Loading dependent relationship options...'
                          : 'No dependent relationship options available.'}
                      </ThemedText>
                    )}
                  </View>
                </View>

                <PhilHealthPinInput
                  value={principalMemberPin}
                  onChangeText={setPrincipalMemberPin}
                  label="Principal Member PIN"
                  required
                  testID="coverage-principal-pin-input"
                />

                <View style={[styles.formRow, isCompact && styles.stackCol]}>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Principal Last Name"
                    value={principalLastName}
                    onChangeText={setPrincipalLastName}
                    placeholder="Last name"
                    required
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Principal First Name"
                    value={principalFirstName}
                    onChangeText={setPrincipalFirstName}
                    placeholder="First name"
                    required
                  />
                </View>

                <View style={[styles.formRow, isCompact && styles.stackCol]}>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Principal Middle Name"
                    value={principalMiddleName}
                    onChangeText={setPrincipalMiddleName}
                    placeholder="Middle name (optional)"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Suffix"
                    value={principalSuffix}
                    onChangeText={setPrincipalSuffix}
                    placeholder="Jr., III (optional)"
                  />
                </View>

                <ValidatedDateInput
                  label="Principal Date of Birth"
                  value={principalDateOfBirth}
                  onChangeText={setPrincipalDateOfBirth}
                  boundaryMode="pastOrToday"
                  placeholder="YYYY-MM-DD"
                  required
                />
              </View>
            ) : null}

            {/* Optional Category, Employer & Default Walk-In ATC */}
            <View style={styles.optionalToggleRow}>
              <Button
                title={showEmployerFields ? 'Hide Membership Category & Employer' : 'Membership Category & Employer (Optional)'}
                variant="ghost"
                size="xs"
                icon={showEmployerFields ? 'chevronUp' : 'chevronDown'}
                onPress={() => setShowEmployerFields((prev) => !prev)}
              />
            </View>

            {showEmployerFields ? (
              <View style={styles.optionalCard}>
                <View style={[styles.formRow, isCompact && styles.stackCol]}>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Membership Category Code"
                    value={membershipCategoryCode}
                    onChangeText={setMembershipCategoryCode}
                    placeholder="e.g. F, I, S"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Membership Category Description"
                    value={membershipCategoryDesc}
                    onChangeText={setMembershipCategoryDesc}
                    placeholder="e.g. Formal Economy, Indigent"
                  />
                </View>
                <View style={[styles.formRow, isCompact && styles.stackCol]}>
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Employer PEN / PIN"
                    value={employerPin}
                    onChangeText={setEmployerPin}
                    placeholder="Employer PhilHealth number"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Employer Name"
                    value={employerName}
                    onChangeText={setEmployerName}
                    placeholder="Registered employer"
                  />
                </View>
                <Input
                  label="Default Walk-In ATC"
                  value={defaultWalkInAtc}
                  onChangeText={setDefaultWalkInAtc}
                  placeholder="Optional standing Authorization Transaction Code"
                />
              </View>
            ) : null}
          </View>

          {/* Section 2: PhilHealth YAKAP Annual Enlistment */}
          <View style={styles.cardSection} testID="yakap-enlistment-card">
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleGroup}>
                <Icon name="calendar" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  PhilHealth YAKAP Annual Enlistment
                </ThemedText>
              </View>
              <Badge
                label={enlistmentBadge.label}
                variant={enlistmentBadge.variant}
                size="sm"
                icon={enlistmentBadge.icon}
              />
            </View>

            {activeEnlistment ? (
              <View style={styles.enlistmentActiveBox}>
                <View style={styles.enlistmentHeaderRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {activeEnlistment.effectiveYear} Benefit Year
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Source: {resolveCoverageEnlistmentSourceLabel(activeEnlistment.source)}
                  </ThemedText>
                </View>

                <View style={[styles.formRow, isCompact && styles.stackCol]}>
                  <View style={styles.metaCell}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Enlistment Date
                    </ThemedText>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {activeEnlistment.enlistmentDate}
                    </ThemedText>
                  </View>
                  <View style={styles.metaCell}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Valid Until
                    </ThemedText>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {activeEnlistment.validUntil || `${activeEnlistment.effectiveYear}-12-31`}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.refGrid}>
                  <View style={styles.refBox}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Case No.
                    </ThemedText>
                    <ThemedText
                      variant="captionBold"
                      color={activeEnlistment.caseNo ? theme.colors.primaryDark : theme.colors.textMuted}
                    >
                      {activeEnlistment.caseNo || 'Pending'}
                    </ThemedText>
                  </View>
                  <View style={styles.refBox}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Enlistment Trans No.
                    </ThemedText>
                    <ThemedText
                      variant="captionBold"
                      color={activeEnlistment.enlistmentTransNo ? theme.colors.primaryDark : theme.colors.textMuted}
                    >
                      {activeEnlistment.enlistmentTransNo || 'Pending'}
                    </ThemedText>
                  </View>
                  <View style={styles.refBox}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      YES Reference No.
                    </ThemedText>
                    <ThemedText
                      variant="captionBold"
                      color={activeEnlistment.yesReferenceNo ? theme.colors.primaryDark : theme.colors.textMuted}
                    >
                      {activeEnlistment.yesReferenceNo || 'None'}
                    </ThemedText>
                  </View>
                  <View style={styles.refBox}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      FPE Profiling Trans No.
                    </ThemedText>
                    <ThemedText
                      variant="captionBold"
                      color={activeEnlistment.profilingTransNo ? theme.colors.successText : theme.colors.textMuted}
                    >
                      {activeEnlistment.profilingTransNo || 'Pending Screening'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            ) : (
              <EmptyState
                icon="shield"
                title="No YAKAP enlistment on file"
                description="Add an annual PhilHealth YAKAP enlistment record before transmitting FPE claims."
                actionTitle="Add Enlistment"
                onAction={handleOpenEnlistmentModal}
                actionTestID="empty-add-enlistment-btn"
              />
            )}

            <View style={styles.enlistmentActionsRow}>
              <Button
                title={activeEnlistment ? 'Add / Renew Enlistment' : 'Add Enlistment'}
                variant="outline"
                size="sm"
                icon="refresh"
                onPress={handleOpenEnlistmentModal}
                testID="add-renew-enlistment-btn"
              />
              {sortedEnlistments.length > 1 ? (
                <Button
                  title={historyOpen ? 'Hide History' : `View All Years (${sortedEnlistments.length})`}
                  variant="ghost"
                  size="sm"
                  onPress={() => setHistoryOpen((prev) => !prev)}
                />
              ) : null}
            </View>

            {historyOpen && sortedEnlistments.length > 1 ? (
              <View style={styles.historyList}>
                {sortedEnlistments.map((item) => (
                  <View key={item.id} style={styles.historyRow}>
                    <ThemedText variant="captionBold" color={theme.colors.text}>
                      {item.effectiveYear}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.flexOne}>
                      {item.enlistmentDate} to {item.validUntil || `${item.effectiveYear}-12-31`} · {item.status} · Case: {item.caseNo || 'None'}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Inline Add / Renew Enlistment Sub-Modal (mounted only when open) */}
      {enlistmentModalVisible ? (
        <Modal
          visible={enlistmentModalVisible}
          onClose={() => setEnlistmentModalVisible(false)}
          title="Add / Renew YAKAP Enlistment"
          subtitle="Record an annual PhilHealth YAKAP enlistment. Previous benefit years remain preserved."
          maxWidth={480}
          testID="yakap-enlistment-renewal-modal"
          footer={
            <View style={styles.footerRow}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setEnlistmentModalVisible(false)}
                disabled={savingEnlistment}
              />
              <Button
                title="Confirm Enlistment"
                onPress={handleConfirmEnlistment}
                loading={savingEnlistment}
                disabled={savingEnlistment}
                testID="confirm-enlistment-btn"
              />
            </View>
          }
        >
          <View style={styles.modalFormGap}>
            <Input
              label="Benefit Year"
              value={renewalYear}
              onChangeText={(val) => {
                setRenewalYear(val);
                if (/^\d{4}$/.test(val.trim())) {
                  setRenewalValidUntil(`${val.trim()}-12-31`);
                }
              }}
              placeholder="YYYY (e.g. 2026)"
              keyboardType="numeric"
              required
            />
            <ValidatedDateInput
              label="Enlistment Date"
              value={renewalEnlistDate}
              onChangeText={setRenewalEnlistDate}
              boundaryMode="pastOrToday"
              placeholder="YYYY-MM-DD"
              required
            />
            <ValidatedDateInput
              label="Valid Until"
              value={renewalValidUntil}
              onChangeText={setRenewalValidUntil}
              placeholder="YYYY-MM-DD"
              required
            />
            <View style={styles.fieldGroup}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Registration Source
              </ThemedText>
              <SegmentedControl
                options={[
                  { value: 'ClinicEnlistment', label: 'In-Clinic' },
                  { value: 'SelfReported', label: 'Self-Reported' },
                  { value: 'PhilHealthMasterlist', label: 'Masterlist' },
                ]}
                value={renewalSource}
                onChange={(val) => setRenewalSource(val as YakapEnlistmentSource)}
              />
            </View>
            <Input
              label="Case Number (Optional)"
              value={renewalCaseNo}
              onChangeText={setRenewalCaseNo}
              placeholder="PhilHealth Case No."
            />
            <Input
              label="Enlistment Transmittal No. (Optional)"
              value={renewalTransNo}
              onChangeText={setRenewalTransNo}
              placeholder="Enlistment Trans No."
            />
            <Input
              label="YES Reference No. (Optional)"
              value={renewalYesRefNo}
              onChangeText={setRenewalYesRefNo}
              placeholder="YES Ref No."
            />
            <Input
              label="Notes (Optional)"
              value={renewalNotes}
              onChangeText={setRenewalNotes}
              placeholder="Additional enlistment notes"
            />
          </View>
        </Modal>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionsContainer: {
    gap: theme.spacing.lg,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  fpeBanner: {
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.brandSubtle,
  },
  fpeBannerCompleted: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  fpeBannerPending: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
  },
  fpeBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  fpeBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 200,
  },
  fpeBannerText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  fpeActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  cardSection: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  pinInputCol: {
    flex: 1,
  },
  verifyBtnWrap: {
    paddingBottom: theme.spacing.xs,
  },
  pinFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  sponsorCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySubtle,
    gap: theme.spacing.md,
  },
  sponsorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
    ...theme.shadows.brandSubtle,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  stackCol: {
    flexDirection: 'column',
  },
  fieldCol: {
    flex: 1,
    minWidth: 180,
  },
  optionalToggleRow: {
    alignItems: 'flex-start',
  },
  optionalCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
    gap: theme.spacing.md,
  },
  enlistmentActiveBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.sm,
  },
  enlistmentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  metaCell: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  refGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  refBox: {
    flex: 1,
    minWidth: 140,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  enlistmentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  historyList: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  flexOne: {
    flex: 1,
  },
  modalFormGap: {
    gap: theme.spacing.md,
  },
});
