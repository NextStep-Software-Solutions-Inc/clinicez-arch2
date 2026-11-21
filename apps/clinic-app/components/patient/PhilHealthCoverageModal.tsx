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
import { useClinic } from '../../context/ClinicContext';
import {
  formatPhilHealthServerError,
  isMissingPhilHealthConnectionUrlKnown,
  MISSING_CONNECTION_URL_MESSAGE,
  type PhilHealthSettingsUrlSlice,
} from '../../utils/philhealthError';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import { toIsoDateString } from '../../utils/formatDateTime';
import { openAvailmentSlipPdf } from '../../utils/philhealthSlip';
import PatientIdentityCheckModal from './PatientIdentityCheckModal';
import {
  clinicService,
  type ClinicPatient,
  type PatientPhilHealthCoverageDto,
  type PatientYakapEnlistmentDto,
  type PhilHealthMemberType,
  type PinValidationResult,
  type YakapStandingCheckDto,
} from '../../services/clinicService';
import type { BadgeVariant } from '../ui/Badge';
import type { IconName } from '../ui/Icon';
import {
  buildPrincipalSponsorFromGuardian,
  type PrincipalRelationship,
} from './memberType';

function formatIdentityMethodLabel(mode?: string | null): string {
  switch ((mode || '').toLowerCase()) {
    case 'pcu':
      return 'Face Scan';
    case 'otp':
      return 'Text Code (OTP)';
    case 'validid':
    case 'valid_id':
      return 'Photo ID';
    default:
      return mode || 'Identity Check';
  }
}

function resolveCoverageEnlistmentBadge(status?: string | null): {
  label: string;
  variant: BadgeVariant;
  icon: IconName;
} {
  if (!status) {
    return { label: 'Not Yet Assigned', variant: 'neutral', icon: 'shield' };
  }
  switch (status) {
    case 'Active':
      return { label: 'Assigned & Active', variant: 'success', icon: 'shieldCheck' };
    case 'Draft':
      return { label: 'Walk-In Draft (Sync Pending)', variant: 'warning', icon: 'clock' };
    case 'Registered':
      return { label: 'Clinic Assigned', variant: 'info', icon: 'check' };
    case 'Verified':
      return { label: 'Identity Confirmed', variant: 'success', icon: 'shieldCheck' };
    case 'ProfilingCompleted':
      return { label: 'Checkup Completed', variant: 'success', icon: 'checkCircle' };
    case 'Transmitted':
      return { label: 'Sent to PhilHealth', variant: 'success', icon: 'send' };
    case 'Suspended':
      return { label: 'On Hold', variant: 'warning', icon: 'alert' };
    case 'Expired':
      return { label: 'Previous Year', variant: 'neutral', icon: 'clock' };
    case 'Transferred':
      return { label: 'Transferred Out', variant: 'neutral', icon: 'arrowRight' };
    case 'Cancelled':
      return { label: 'Cancelled', variant: 'emergency', icon: 'close' };
    default:
      return { label: status, variant: 'neutral', icon: 'info' };
  }
}

function resolveCoverageEnlistmentSourceLabel(source?: string | null): string {
  switch (source) {
    case 'PhilHealthMasterlist':
    case 'MasterlistSync':
      return 'PhilHealth Patient List';
    case 'ClinicEnlistment':
      return 'Clinic Assignment';
    case 'SelfReported':
      return 'Patient Self-Reported';
    case 'WalkIn':
      return 'Walk-In Visit';
    case 'OnlinePortal':
      return 'Online Portal';
    case 'AssistedIntake':
      return 'Front-Desk Assisted';
    default:
      return source || 'Clinic Assignment';
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
  status: 'idle' | 'checking' | 'valid' | 'invalid' | 'server_error';
  message: string;
}

interface ParsedPinValidationOutcome {
  isVerified: boolean;
  status: PinCheckFeedback['status'];
  message: string;
  conflict?: { patientId: string; fullName: string; patientCode: string };
}

function interpretPinValidationResult(
  res: PinValidationResult | boolean | null,
  err: { message?: string; status?: number; errorCode?: string } | null,
  mod11IsValid: boolean,
  options?: { checkUniqueness?: boolean; settings?: PhilHealthSettingsUrlSlice }
): ParsedPinValidationOutcome {
  if (err || res == null) {
    const code = (err?.errorCode || '').trim().toUpperCase();
    const isUrlOrAuthConfigError =
      code === 'PHILHEALTH_CONNECTION_URL_MISSING' ||
      code === 'PHILHEALTH_CONNECTION_URL_INVALID' ||
      code === 'PHILHEALTH_ENDPOINT_NOT_FOUND' ||
      code === 'PHILHEALTH_AUTH_FAILED';
    const httpStatus = err?.status;
    const isClientPinReject =
      isUrlOrAuthConfigError || httpStatus === 400 || httpStatus === 404 || httpStatus === 422;
    return {
      isVerified: false,
      status: isClientPinReject ? 'invalid' : 'server_error',
      message: formatPhilHealthServerError(
        err,
        options?.settings,
        isClientPinReject
          ? 'PIN not found in PhilHealth records.'
          : 'PhilHealth verification server could not be reached. Retry Verify PIN or defer verification to continue.'
      ),
    };
  }

  const raw = res as unknown as boolean | (PinValidationResult & { valid?: boolean }) | null;
  const serverValid =
    typeof raw === 'boolean'
      ? raw
      : typeof raw?.isValid === 'boolean'
        ? raw.isValid
        : typeof raw?.valid === 'boolean'
          ? raw.valid
          : true;
  const sequenceOk =
    typeof raw === 'object' && raw !== null && typeof raw.isSequenceValid === 'boolean'
      ? raw.isSequenceValid
      : mod11IsValid;
  const philHealthDbOk =
    typeof raw === 'object' && raw !== null && typeof raw.isPhilHealthVerified === 'boolean'
      ? raw.isPhilHealthVerified
      : serverValid;
  const enforceUniqueness = options?.checkUniqueness !== false;
  const uniqueInClinic =
    !enforceUniqueness ||
    (typeof raw === 'object' && raw !== null && typeof raw.isUniqueInClinic === 'boolean'
      ? raw.isUniqueInClinic
      : true);

  if (sequenceOk && uniqueInClinic && philHealthDbOk && serverValid) {
    const memberSuffix =
      typeof raw === 'object' && raw !== null && raw.memberName
        ? ` (${raw.memberName})`
        : '';
    return {
      isVerified: true,
      status: 'valid',
      message: `Verified with PhilHealth${memberSuffix}`,
    };
  }

  const reason =
    (typeof raw === 'object' && raw?.failureReason) ||
    (!uniqueInClinic
      ? `PhilHealth PIN is already assigned to another patient${
          typeof raw === 'object' && raw?.conflictingPatientName
            ? `: ${raw.conflictingPatientName}${raw.conflictingPatientCode ? ` (${raw.conflictingPatientCode})` : ''}`
            : ''
        }.`
      : sequenceOk && !philHealthDbOk
        ? 'PIN not found in PhilHealth records.'
        : 'PhilHealth could not verify this PIN.');
  const isConfigOrAuthFailure =
    uniqueInClinic &&
    /connection url is not configured|connection url .* is invalid|authentication endpoint was not found|endpoint returned 404|endpoint was not found|rejected facility credentials/i.test(
      reason
    );
  const isExplicitServerError =
    uniqueInClinic &&
    !isConfigOrAuthFailure &&
    typeof raw === 'object' &&
    raw !== null &&
    (raw.isServerError === true ||
      (raw.isServerError !== false &&
        sequenceOk &&
        /unable to reach|timed out|did not answer|service unavailable|server error|could not be reached|network|rate limit|500|502|503|504/i.test(
          reason
        )));

  return {
    isVerified: false,
    status: !sequenceOk || !uniqueInClinic ? 'invalid' : isExplicitServerError ? 'server_error' : 'invalid',
    message: reason,
    conflict: !uniqueInClinic
      ? {
          patientId: 'conflict',
          fullName: (typeof raw === 'object' && raw?.conflictingPatientName) || 'Another patient',
          patientCode: (typeof raw === 'object' && raw?.conflictingPatientCode) || '',
        }
      : undefined,
  };
}

function areDependentSponsorFieldsValid(fields: {
  memberType?: string | null;
  patientPin?: string | null;
  dependentRelationship?: string | null;
  principalMemberPin?: string | null;
  principalLastName?: string | null;
  principalFirstName?: string | null;
  principalDateOfBirth?: string | null;
}): boolean {
  if (fields.memberType !== 'DD') {
    return true;
  }
  if (!fields.dependentRelationship) {
    return false;
  }
  const patientDigits = (fields.patientPin || '').replace(/\D/g, '');
  const principalDigits = (fields.principalMemberPin || '').replace(/\D/g, '');
  if (!validatePhilHealthPinMod11((fields.principalMemberPin || '').trim()).isValid) {
    return false;
  }
  if (patientDigits && principalDigits && patientDigits === principalDigits) {
    return false;
  }
  if (!(fields.principalLastName || '').trim() || !(fields.principalFirstName || '').trim()) {
    return false;
  }
  const dob = (fields.principalDateOfBirth || '').trim();
  if (!dob) {
    return false;
  }
  return validateDateString(dob, { boundaryMode: 'pastOrToday' }).isValid;
}

function buildStep1Snapshot(fields: {
  pin: string;
  memberType: PhilHealthMemberType;
  dependentRelationship: PrincipalRelationship;
  principalMemberPin: string;
  principalLastName: string;
  principalFirstName: string;
  principalMiddleName: string;
  principalSuffix: string;
  principalDateOfBirth: string;
  membershipCategoryCode: string;
  membershipCategoryDesc: string;
  employerPin: string;
  employerName: string;
  defaultWalkInAtc: string;
}): string {
  return JSON.stringify({
    pinDigits: (fields.pin || '').replace(/\D/g, ''),
    memberType: fields.memberType,
    dependentRelationship: fields.memberType === 'DD' ? fields.dependentRelationship : 'MM',
    principalMemberPin: fields.memberType === 'DD' ? (fields.principalMemberPin || '').replace(/\D/g, '') : '',
    principalLastName: fields.memberType === 'DD' ? fields.principalLastName.trim() : '',
    principalFirstName: fields.memberType === 'DD' ? fields.principalFirstName.trim() : '',
    principalMiddleName: fields.memberType === 'DD' ? fields.principalMiddleName.trim() : '',
    principalSuffix: fields.memberType === 'DD' ? fields.principalSuffix.trim() : '',
    principalDateOfBirth: fields.memberType === 'DD' ? fields.principalDateOfBirth.trim() : '',
    membershipCategoryCode: fields.membershipCategoryCode.trim(),
    membershipCategoryDesc: fields.membershipCategoryDesc.trim(),
    employerPin: fields.employerPin.trim(),
    employerName: fields.employerName.trim(),
    defaultWalkInAtc: fields.defaultWalkInAtc.trim(),
  });
}

type VerticalStepState = 'completed' | 'active' | 'locked';

function VerticalStepRow({
  stepNumber,
  title,
  subtitle,
  statusLabel,
  statusVariant,
  state,
  isLast = false,
  testID,
  children,
}: {
  stepNumber: number;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusVariant: BadgeVariant;
  state: VerticalStepState;
  isLast?: boolean;
  testID?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stepRowContainer} testID={testID}>
      <View style={styles.stepRailCol}>
        <View
          style={[
            styles.stepCircle,
            state === 'completed'
              ? styles.stepCircleCompleted
              : state === 'active'
                ? styles.stepCircleActive
                : styles.stepCircleLocked,
          ]}
        >
          {state === 'completed' ? (
            <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.successText} />
          ) : state === 'locked' ? (
            <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          ) : (
            <ThemedText variant="smallBold" color={theme.colors.onPrimary}>
              {String(stepNumber)}
            </ThemedText>
          )}
        </View>
        {!isLast ? (
          <View
            style={[
              styles.stepConnector,
              state === 'completed' ? styles.stepConnectorDone : styles.stepConnectorPending,
            ]}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.stepCard,
          state === 'active'
            ? styles.stepCardActive
            : state === 'completed'
              ? styles.stepCardCompleted
              : styles.stepCardLocked,
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <View style={styles.stepHeaderTextGroup}>
            <ThemedText
              variant="bodyBold"
              color={state === 'locked' ? theme.colors.textSecondary : theme.colors.text}
            >
              {`Step ${stepNumber} · ${title}`}
            </ThemedText>
            {state !== 'locked' ? (
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {state !== 'locked' ? (
            <Badge
              label={statusLabel}
              variant={statusVariant}
              size="sm"
              icon={state === 'completed' ? 'checkCircle' : 'clock'}
            />
          ) : null}
        </View>
        {state !== 'locked' ? children : null}
      </View>
    </View>
  );
}

export default function PhilHealthCoverageModal({
  visible,
  onClose,
  patient,
  onSaved,
  onStartYakapScreening,
}: PhilHealthCoverageModalProps) {
  const { isCompact } = useBreakpoint();
  const { settings: clinicSettings } = useClinic();
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
  const [principalPinFeedback, setPrincipalPinFeedback] = useState<PinCheckFeedback>({
    status: 'idle',
    message: '',
  });
  const [savedStep1Snapshot, setSavedStep1Snapshot] = useState<string>('');
  const [savingMembership, setSavingMembership] = useState(false);
  const [showEmployerFields, setShowEmployerFields] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // YAKAP 2.0 Standing, Identity Check, Selection & Slip state
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [standingCheck, setStandingCheck] = useState<YakapStandingCheckDto | null>(null);
  const [assignedResult, setAssignedResult] = useState(false);
  const [dbVerifiedPinDigits, setDbVerifiedPinDigits] = useState<string | null>(null);
  const [dbVerifiedPrincipalPinDigits, setDbVerifiedPrincipalPinDigits] = useState<string | null>(null);
  const [duplicatePinConflict, setDuplicatePinConflict] = useState<{
    patientId: string;
    fullName: string;
    patientCode: string;
  } | null>(null);
  const [checkingStanding, setCheckingStanding] = useState(false);
  const [submittingSelection, setSubmittingSelection] = useState(false);
  const [printingSlip, setPrintingSlip] = useState(false);
  const [refreshingSubmission, setRefreshingSubmission] = useState(false);

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

  const hasValidPin = validatePhilHealthPinMod11(pin.trim()).isValid;

  const hydrateFromCoverage = useCallback(
    (data: PatientPhilHealthCoverageDto, currentPatient: ClinicPatient, preservePinFeedback = false) => {
      const m = data.membership;
      const effectivePin = m?.philHealthPin || data.philHealthNumber || currentPatient.philHealthNumber || '';
      const formattedEffectivePin = effectivePin ? formatPhilHealthPin(effectivePin) : '';
      const nextMemberType: PhilHealthMemberType = m?.memberType === 'DD' ? 'DD' : 'MM';
      const nextDepRel: PrincipalRelationship =
        (m?.dependentRelationship as PrincipalRelationship) || ((currentPatient.age ?? 0) < 18 ? 'C' : 'S');
      const nextPrincipalPin = m?.principalMemberPin ? formatPhilHealthPin(m.principalMemberPin) : '';
      const nextPrincipalLast = m?.principalLastName || '';
      const nextPrincipalFirst = m?.principalFirstName || '';
      const nextPrincipalMiddle = m?.principalMiddleName || '';
      const nextPrincipalSuffix = m?.principalSuffix || '';
      const nextPrincipalDob = m?.principalDateOfBirth ? toIsoDateString(m.principalDateOfBirth) : '';
      const nextCatCode = m?.membershipCategoryCode || '';
      const nextCatDesc = m?.membershipCategoryDesc || '';
      const nextEmpPin = m?.employerPin || '';
      const nextEmpName = m?.employerName || '';
      const nextWalkInAtc = m?.defaultWalkInAtc || '';

      setPin(formattedEffectivePin);
      setMemberType(nextMemberType);
      setDependentRelationship(nextDepRel);
      setPrincipalMemberPin(nextPrincipalPin);
      setPrincipalLastName(nextPrincipalLast);
      setPrincipalFirstName(nextPrincipalFirst);
      setPrincipalMiddleName(nextPrincipalMiddle);
      setPrincipalSuffix(nextPrincipalSuffix);
      setPrincipalDateOfBirth(nextPrincipalDob);
      setMembershipCategoryCode(nextCatCode);
      setMembershipCategoryDesc(nextCatDesc);
      setEmployerPin(nextEmpPin);
      setEmployerName(nextEmpName);
      setDefaultWalkInAtc(nextWalkInAtc);
      setShowEmployerFields(
        Boolean(nextCatCode || nextCatDesc || nextEmpPin || nextEmpName)
      );
      setSavedStep1Snapshot(
        buildStep1Snapshot({
          pin: formattedEffectivePin,
          memberType: nextMemberType,
          dependentRelationship: nextDepRel,
          principalMemberPin: nextPrincipalPin,
          principalLastName: nextPrincipalLast,
          principalFirstName: nextPrincipalFirst,
          principalMiddleName: nextPrincipalMiddle,
          principalSuffix: nextPrincipalSuffix,
          principalDateOfBirth: nextPrincipalDob,
          membershipCategoryCode: nextCatCode,
          membershipCategoryDesc: nextCatDesc,
          employerPin: nextEmpPin,
          employerName: nextEmpName,
          defaultWalkInAtc: nextWalkInAtc,
        })
      );
      if (!preservePinFeedback) {
        setPinFeedback({ status: 'idle', message: '' });
        setPrincipalPinFeedback({ status: 'idle', message: '' });
      }
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
      setIdentityModalOpen(false);
      setStandingCheck(null);
      setAssignedResult(false);
      setDbVerifiedPinDigits(null);
      setDbVerifiedPrincipalPinDigits(null);
      setPrincipalPinFeedback({ status: 'idle', message: '' });
      setDuplicatePinConflict(null);
      setHistoryOpen(false);
      void loadCoverage(patient);
    }
  }, [visible, patient, loadCoverage]);

  const checkClinicPinUniqueness = useCallback(
    async (formattedPin: string, excludePatientId?: string) => {
      if (typeof clinicService.checkPatientDuplicates !== 'function') {
        return null;
      }
      try {
        const [dupRes] = await clinicService.checkPatientDuplicates({
          philHealthNumber: formattedPin,
        });
        if (!dupRes || !Array.isArray(dupRes.matches)) {
          return null;
        }
        const match = dupRes.matches.find((m) => !excludePatientId || m.patientId !== excludePatientId);
        if (!match) {
          return null;
        }
        return {
          patientId: match.patientId,
          fullName: match.fullName,
          patientCode: match.patientCode,
        };
      } catch {
        return null;
      }
    },
    []
  );

  // Detect clinic-wide PIN collisions automatically as soon as a complete valid 12-digit PIN is entered
  const currentPinDigitsForCheck = (pin || '').replace(/\D/g, '');
  useEffect(() => {
    if (!visible || !patient || !hasValidPin || currentPinDigitsForCheck.length !== 12) {
      return;
    }
    let cancelled = false;
    const formatted = formatPhilHealthPin(currentPinDigitsForCheck);
    const timer = setTimeout(async () => {
      const conflict = await checkClinicPinUniqueness(formatted, patient.id);
      if (cancelled) return;
      if (conflict) {
        const codeSuffix = conflict.patientCode ? ` (${conflict.patientCode})` : '';
        setDuplicatePinConflict(conflict);
        setDbVerifiedPinDigits(null);
        setPinFeedback({
          status: 'invalid',
          message: `PhilHealth PIN is already assigned to another patient: ${conflict.fullName}${codeSuffix}.`,
        });
      } else {
        setDuplicatePinConflict(null);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [visible, patient, hasValidPin, currentPinDigitsForCheck, checkClinicPinUniqueness]);

  const handleVerifyPin = useCallback(async () => {
    const mod11 = validatePhilHealthPinMod11(pin);
    if (!mod11.isComplete) {
      setPinFeedback({
        status: 'invalid',
        message: 'Enter a complete 12-digit PhilHealth PIN.',
      });
      return;
    }
    if (!mod11.isValid) {
      setPinFeedback({
        status: 'invalid',
        message: mod11.errorMessage || 'PhilHealth PIN check digit is invalid.',
      });
      return;
    }

    setPinFeedback({ status: 'checking', message: 'Checking clinic records and PhilHealth registry...' });
    try {
      // 1. Check in-system uniqueness before calling PhilHealth gateway
      const localConflict = await checkClinicPinUniqueness(mod11.formattedPin, patient?.id);
      if (localConflict) {
        const codeSuffix = localConflict.patientCode ? ` (${localConflict.patientCode})` : '';
        setDuplicatePinConflict(localConflict);
        setDbVerifiedPinDigits(null);
        setPinFeedback({
          status: 'invalid',
          message: `PhilHealth PIN is already assigned to another patient: ${localConflict.fullName}${codeSuffix}.`,
        });
        return;
      }

      if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
        setDbVerifiedPinDigits(null);
        setPinFeedback({ status: 'invalid', message: MISSING_CONNECTION_URL_MESSAGE });
        return;
      }

      const [res, err] = await clinicService.validatePhilHealthPin(mod11.formattedPin, patient?.id);
      const outcome = interpretPinValidationResult(res, err as any, mod11.isValid, {
        checkUniqueness: true,
        settings: clinicSettings,
      });
      if (outcome.isVerified) {
        setDuplicatePinConflict(null);
        setDbVerifiedPinDigits(mod11.formattedPin.replace(/\D/g, ''));
      } else {
        setDbVerifiedPinDigits(null);
        if (outcome.conflict) {
          setDuplicatePinConflict(outcome.conflict);
        }
      }
      setPinFeedback({ status: outcome.status, message: outcome.message });
    } catch {
      setDbVerifiedPinDigits(null);
      setPinFeedback({
        status: 'server_error',
        message: 'Unable to reach PhilHealth verification server. Retry Verify PIN or defer verification to continue.',
      });
    }
  }, [pin, patient?.id, checkClinicPinUniqueness, clinicSettings]);

  const handleVerifyPrincipalPin = useCallback(async () => {
    const mod11 = validatePhilHealthPinMod11(principalMemberPin);
    if (!mod11.isComplete) {
      setDbVerifiedPrincipalPinDigits(null);
      setPrincipalPinFeedback({
        status: 'invalid',
        message: 'Enter a complete 12-digit Principal Member PIN.',
      });
      return;
    }
    if (!mod11.isValid) {
      setDbVerifiedPrincipalPinDigits(null);
      setPrincipalPinFeedback({
        status: 'invalid',
        message: mod11.errorMessage || 'Principal Member PIN check digit is invalid.',
      });
      return;
    }

    const patientDigits = (pin || '').replace(/\D/g, '');
    const principalDigits = mod11.formattedPin.replace(/\D/g, '');
    if (patientDigits && principalDigits === patientDigits) {
      setDbVerifiedPrincipalPinDigits(null);
      setPrincipalPinFeedback({
        status: 'invalid',
        message: 'Principal Member PIN cannot be the same as the Patient PhilHealth PIN.',
      });
      return;
    }

    if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
      setDbVerifiedPrincipalPinDigits(null);
      setPrincipalPinFeedback({ status: 'invalid', message: MISSING_CONNECTION_URL_MESSAGE });
      return;
    }

    setPrincipalPinFeedback({
      status: 'checking',
      message: 'Checking Principal Member PIN format and PhilHealth records...',
    });
    try {
      // Principal Member PIN may match an existing parent/spouse patient in the clinic; skip patient-uniqueness check
      const [res, err] = await clinicService.validatePhilHealthPin(mod11.formattedPin, undefined, {
        checkUniqueness: false,
      });
      const outcome = interpretPinValidationResult(res, err as any, mod11.isValid, {
        checkUniqueness: false,
        settings: clinicSettings,
      });
      if (outcome.isVerified) {
        setDbVerifiedPrincipalPinDigits(principalDigits);
      } else {
        setDbVerifiedPrincipalPinDigits(null);
      }
      setPrincipalPinFeedback({ status: outcome.status, message: outcome.message });
    } catch {
      setDbVerifiedPrincipalPinDigits(null);
      setPrincipalPinFeedback({
        status: 'server_error',
        message: 'Unable to reach PhilHealth verification server. Retry Verify PIN or defer verification to continue.',
      });
    }
  }, [principalMemberPin, pin, clinicSettings]);

  const handleApplyGuardianSponsor = useCallback(() => {
    if (!guardianSponsor) return;
    if (guardianSponsor.formattedPin || guardianSponsor.rawPin) {
      setPrincipalMemberPin(guardianSponsor.formattedPin || formatPhilHealthPin(guardianSponsor.rawPin));
      setPrincipalPinFeedback({ status: 'idle', message: '' });
      setDbVerifiedPrincipalPinDigits(null);
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

  const handleSaveMembership = useCallback(
    async (requirePinEntry = false) => {
      if (
        !patient ||
        pinFeedback.status === 'checking' ||
        (memberType === 'DD' && principalPinFeedback.status === 'checking')
      ) {
        return;
      }

      const trimmedPin = pin.trim();
      const currentDigits = trimmedPin.replace(/\D/g, '');

      if (requirePinEntry && !trimmedPin) {
        setPinFeedback({
          status: 'invalid',
          message: 'Enter a complete 12-digit PhilHealth PIN.',
        });
        return;
      }

      if (trimmedPin) {
        const mod11 = validatePhilHealthPinMod11(trimmedPin);
        if (!mod11.isComplete) {
          setPinFeedback({
            status: 'invalid',
            message: 'Enter a complete 12-digit PhilHealth PIN.',
          });
          return;
        }
        if (!mod11.isValid) {
          setPinFeedback({
            status: 'invalid',
            message: mod11.errorMessage || 'PhilHealth PIN is invalid.',
          });
          return;
        }
        const conflict =
          duplicatePinConflict ?? (await checkClinicPinUniqueness(mod11.formattedPin, patient.id));
        if (conflict) {
          const codeSuffix = conflict.patientCode ? ` (${conflict.patientCode})` : '';
          setDuplicatePinConflict(conflict);
          setPinFeedback({
            status: 'invalid',
            message: `PhilHealth PIN is already assigned to another patient: ${conflict.fullName}${codeSuffix}.`,
          });
          notify.error(`PhilHealth PIN is already assigned to ${conflict.fullName}${codeSuffix}.`);
          return;
        }
      }

    if (memberType === 'DD') {
      const sponsorPinMod11 = validatePhilHealthPinMod11(principalMemberPin);
      if (!principalMemberPin.trim() || !sponsorPinMod11.isValid) {
        notify.error(sponsorPinMod11.errorMessage || 'Valid 12-digit Principal Member PIN is required for dependents.');
        return;
      }
      const principalDigits = principalMemberPin.replace(/\D/g, '');
      if (currentDigits && principalDigits && currentDigits === principalDigits) {
        notify.error('Principal Member PIN cannot be the same as the Patient PhilHealth PIN.');
        return;
      }
      if (principalPinFeedback.status === 'invalid') {
        notify.error(principalPinFeedback.message || 'Principal Member PIN failed PhilHealth verification.');
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

      const principalUnverified =
        memberType === 'DD' &&
        dbVerifiedPrincipalPinDigits !== (principalMemberPin || '').replace(/\D/g, '');
      if ((trimmedPin && dbVerifiedPinDigits !== currentDigits) || principalUnverified) {
        notify.info('PhilHealth number saved locally (verification with PhilHealth pending).');
      } else {
        notify.success('PhilHealth coverage & membership saved.');
      }
      const [fresh] = await clinicService.getPatientPhilHealthCoverage(patient.id);
      if (fresh) {
        setCoverage(fresh);
        hydrateFromCoverage(fresh, patient, true);
        onSaved?.(fresh);
      }
    } catch (e: any) {
      notify.error(e?.message || 'Failed to save PhilHealth coverage.');
    } finally {
      setSavingMembership(false);
    }
    },
    [
      patient,
      pin,
      pinFeedback.status,
      principalPinFeedback.status,
      principalPinFeedback.message,
      duplicatePinConflict,
      checkClinicPinUniqueness,
      dbVerifiedPinDigits,
      dbVerifiedPrincipalPinDigits,
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
    ]
  );

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

  const normalizedCurrentPinDigits = (pin || '').replace(/\D/g, '');
  const savedPinRaw = coverage?.membership?.philHealthPin || coverage?.philHealthNumber || '';
  const normalizedSavedPinDigits = savedPinRaw.replace(/\D/g, '');
  const hasSavedValidPin = validatePhilHealthPinMod11(normalizedSavedPinDigits).isValid;
  const hasUnsavedPinEdit = normalizedCurrentPinDigits !== normalizedSavedPinDigits;
  const isSavedDependentSponsorComplete = areDependentSponsorFieldsValid({
    memberType: coverage?.membership?.memberType,
    patientPin: savedPinRaw,
    dependentRelationship: coverage?.membership?.dependentRelationship,
    principalMemberPin: coverage?.membership?.principalMemberPin,
    principalLastName: coverage?.membership?.principalLastName,
    principalFirstName: coverage?.membership?.principalFirstName,
    principalDateOfBirth: coverage?.membership?.principalDateOfBirth,
  });
  const step1Done = hasSavedValidPin && !hasUnsavedPinEdit && isSavedDependentSponsorComplete && !duplicatePinConflict;

  const refreshCoverage = useCallback(async () => {
    if (!patient) return;
    const [fresh] = await clinicService.getPatientPhilHealthCoverage(patient.id);
    if (fresh) {
      setCoverage(fresh);
      onSaved?.(fresh);
    }
  }, [patient, onSaved]);

  const handleCheckStanding = useCallback(async () => {
    if (!patient) return;
    if (!step1Done) {
      notify.error('Save a valid 12-digit PhilHealth number in Step 1 first.');
      return;
    }
    if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
      notify.error(MISSING_CONNECTION_URL_MESSAGE);
      return;
    }
    setCheckingStanding(true);
    try {
      const [res, err] = await clinicService.validatePatientYakapStanding(patient.id, {
        effectiveYear: new Date().getFullYear(),
        consent: true,
      });
      if (err || !res) {
        notify.error(
          formatPhilHealthServerError(err, clinicSettings, 'Could not check PhilHealth eligibility right now.')
        );
        return;
      }
      setStandingCheck(res);
      setDbVerifiedPinDigits(normalizedSavedPinDigits);
      notify.success(res.summaryMessage || 'PhilHealth standing checked.');
      await refreshCoverage();
    } finally {
      setCheckingStanding(false);
    }
  }, [patient, step1Done, clinicSettings, normalizedSavedPinDigits, refreshCoverage]);

  const handleAssignToClinic = useCallback(async () => {
    if (!patient) return;
    if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
      notify.error(MISSING_CONNECTION_URL_MESSAGE);
      return;
    }
    setSubmittingSelection(true);
    try {
      const [res, err] = await clinicService.submitPatientYakapSelection(patient.id, { consent: true });
      if (err || !res) {
        notify.error(
          formatPhilHealthServerError(err, clinicSettings, 'Could not assign patient to this clinic.')
        );
        return;
      }
      setAssignedResult(true);
      setStandingCheck((prev) =>
        prev
          ? {
              ...prev,
              needsClinicSelection: false,
              selectionStatus: res.queuedForSync ? 'DRAFT' : 'ASSIGNED',
              selectionTransactionNo: res.selectionTransactionNo ?? prev.selectionTransactionNo,
              canStartCheckup: !prev.needsIdentityCheck,
            }
          : prev
      );
      if (res.queuedForSync) {
        notify.info(res.message || 'Saved locally as a walk-in draft and queued for PhilHealth sync.');
      } else {
        notify.success(res.message || 'Patient assigned to this clinic under PhilHealth YAKAP.');
      }
      await refreshCoverage();
    } finally {
      setSubmittingSelection(false);
    }
  }, [patient, clinicSettings, refreshCoverage]);

  const handlePrintSlip = useCallback(async () => {
    if (!patient) return;
    if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
      notify.error(MISSING_CONNECTION_URL_MESSAGE);
      return;
    }
    setPrintingSlip(true);
    try {
      const year = coverage?.currentYearFpeStatus?.effectiveYear ?? new Date().getFullYear();
      const [slip, err] = await clinicService.getPatientAvailmentSlip(patient.id, year);
      if (err || !slip) {
        notify.error(
          formatPhilHealthServerError(err, clinicSettings, 'Confirmation slip is not available yet.')
        );
        return;
      }
      const opened = await openAvailmentSlipPdf(slip);
      if (!opened) {
        notify.error('Could not open the PDF confirmation slip.');
      }
    } finally {
      setPrintingSlip(false);
    }
  }, [patient, coverage?.currentYearFpeStatus?.effectiveYear]);

  const handlePollSubmission = useCallback(async (submissionId: string) => {
    setRefreshingSubmission(true);
    try {
      const [res, err] = await clinicService.pollYakapSubmissionStatus(submissionId);
      if (err || !res) {
        notify.error(err?.message || 'Could not check submission status.');
        return;
      }
      notify.info(`PhilHealth status: ${res.processingStatus}`);
      await refreshCoverage();
    } finally {
      setRefreshingSubmission(false);
    }
  }, [refreshCoverage]);

  const handleRetrySubmission = useCallback(async (submissionId: string) => {
    setRefreshingSubmission(true);
    try {
      const [res, err] = await clinicService.retryYakapSubmission(submissionId);
      if (err || !res) {
        notify.error(err?.message || 'Could not retry submission.');
        return;
      }
      notify.success(`Resubmitted to PhilHealth (${res.processingStatus}).`);
      await refreshCoverage();
    } finally {
      setRefreshingSubmission(false);
    }
  }, [refreshCoverage]);

  if (!visible || !patient) {
    return null;
  }

  const fpeStatus = coverage?.currentYearFpeStatus;
  const enlistmentBadge = resolveCoverageEnlistmentBadge(activeEnlistment?.status);
  const latestIdentity = coverage?.latestIdentityVerification;
  const latestSubmission = coverage?.latestFpeSubmission;

  const isFpeCompleted = Boolean(fpeStatus?.isCompleted);
  const step2Unlocked = step1Done;
  const step2Done = isFpeCompleted || (step2Unlocked && standingCheck !== null);
  const step3Unlocked = step2Done;
  const isIdentityVerifiedToday = Boolean(
    latestIdentity?.isVerifiedForToday ||
      (standingCheck && standingCheck.pcuStatus === 'VERIFIED' && !standingCheck.needsIdentityCheck)
  );
  const step3Done = isFpeCompleted || (step3Unlocked && isIdentityVerifiedToday);
  const step4Unlocked = step3Done;
  const hasClinicAssignment = Boolean(
    assignedResult || (activeEnlistment && standingCheck?.needsClinicSelection !== true)
  );
  const step4Done = isFpeCompleted || (step4Unlocked && hasClinicAssignment);
  const step5Unlocked = step4Done;
  const step5Done = isFpeCompleted;
  const savedIsDependent = coverage?.membership?.memberType === 'DD';
  const normalizedPrincipalPinDigits = (principalMemberPin || '').replace(/\D/g, '');
  const savedPrincipalPinDigits = savedIsDependent
    ? (coverage?.membership?.principalMemberPin || '').replace(/\D/g, '')
    : '';
  const hasSavedValidPrincipalPin =
    Boolean(savedPrincipalPinDigits) && validatePhilHealthPinMod11(savedPrincipalPinDigits).isValid;
  const hasUnsavedPrincipalPinEdit = savedIsDependent
    ? normalizedPrincipalPinDigits !== savedPrincipalPinDigits
    : Boolean(normalizedPrincipalPinDigits);

  const isPrincipalPinSameAsPatient =
    memberType === 'DD' &&
    Boolean(normalizedCurrentPinDigits) &&
    Boolean(normalizedPrincipalPinDigits) &&
    normalizedCurrentPinDigits === normalizedPrincipalPinDigits;
  const principalPinSameAsPatientError = isPrincipalPinSameAsPatient
    ? 'Principal Member PIN cannot be the same as the Patient PhilHealth PIN.'
    : undefined;
  const hasValidPrincipalPin =
    validatePhilHealthPinMod11(principalMemberPin.trim()).isValid && !isPrincipalPinSameAsPatient;

  const isPatientPinDbVerified = Boolean(
    step1Done &&
      (dbVerifiedPinDigits === normalizedSavedPinDigits ||
        standingCheck !== null ||
        isFpeCompleted ||
        Boolean(activeEnlistment?.selectionControlNumber) ||
        activeEnlistment?.source === 'PhilHealthMasterlist')
  );
  const isSavedPrincipalPinDbVerified = Boolean(
    savedIsDependent &&
      hasSavedValidPrincipalPin &&
      (dbVerifiedPrincipalPinDigits === savedPrincipalPinDigits ||
        standingCheck !== null ||
        isFpeCompleted ||
        Boolean(activeEnlistment?.selectionControlNumber) ||
        activeEnlistment?.source === 'PhilHealthMasterlist')
  );
  const isPinDbVerified = isPatientPinDbVerified && (!savedIsDependent || isSavedPrincipalPinDbVerified);

  const isDependentSponsorComplete = areDependentSponsorFieldsValid({
    memberType,
    patientPin: pin,
    dependentRelationship,
    principalMemberPin,
    principalLastName,
    principalFirstName,
    principalDateOfBirth,
  });
  const principalDobTrimmed = principalDateOfBirth.trim();
  const principalDobCheck = principalDobTrimmed
    ? validateDateString(principalDobTrimmed, { boundaryMode: 'pastOrToday' })
    : null;
  const principalDobError =
    principalDobCheck && !principalDobCheck.isValid
      ? principalDobCheck.errorMessage || 'Enter a valid date not in the future.'
      : undefined;

  const isCurrentPinDbVerified =
    pinFeedback.status === 'valid' ||
    (Boolean(normalizedCurrentPinDigits) &&
      (dbVerifiedPinDigits === normalizedCurrentPinDigits || (!hasUnsavedPinEdit && isPatientPinDbVerified)));

  const isCurrentPrincipalPinDbVerified =
    principalPinFeedback.status === 'valid' ||
    (Boolean(normalizedPrincipalPinDigits) &&
      !isPrincipalPinSameAsPatient &&
      (dbVerifiedPrincipalPinDigits === normalizedPrincipalPinDigits ||
        (savedIsDependent && !hasUnsavedPrincipalPinEdit && isSavedPrincipalPinDbVerified)));

  const currentStep1Snapshot = buildStep1Snapshot({
    pin,
    memberType,
    dependentRelationship,
    principalMemberPin,
    principalLastName,
    principalFirstName,
    principalMiddleName,
    principalSuffix,
    principalDateOfBirth,
    membershipCategoryCode,
    membershipCategoryDesc,
    employerPin,
    employerName,
    defaultWalkInAtc,
  });
  const hasStep1Changes = Boolean(savedStep1Snapshot) && currentStep1Snapshot !== savedStep1Snapshot;
  const isClearingSavedPin = Boolean(normalizedSavedPinDigits) && !pin.trim() && hasStep1Changes;
  const principalPinReady =
    memberType !== 'DD' || (hasValidPrincipalPin && isCurrentPrincipalPinDbVerified);
  const principalPinDeferred =
    memberType === 'DD' && hasValidPrincipalPin && principalPinFeedback.status === 'server_error';
  const principalBlocking =
    memberType === 'DD' &&
    (principalPinFeedback.status === 'invalid' ||
      principalPinFeedback.status === 'checking' ||
      isPrincipalPinSameAsPatient);

  const patientPinSatisfiedForOtherChanges =
    !hasUnsavedPinEdit &&
    hasSavedValidPin &&
    pinFeedback.status !== 'invalid' &&
    pinFeedback.status !== 'checking';

  const step1CanDeferOnServerError =
    hasValidPin &&
    !principalBlocking &&
    (pinFeedback.status === 'server_error' || principalPinDeferred) &&
    (isCurrentPinDbVerified || pinFeedback.status === 'server_error' || patientPinSatisfiedForOtherChanges) &&
    (principalPinReady || principalPinDeferred) &&
    (!step1Done || hasStep1Changes);
  const step1ReadyToSaveVerified =
    hasValidPin &&
    (isCurrentPinDbVerified || patientPinSatisfiedForOtherChanges) &&
    principalPinReady &&
    (!step1Done || hasStep1Changes);
  const step1MetadataEditOnly =
    step1Done &&
    !hasUnsavedPinEdit &&
    (!savedIsDependent || !hasUnsavedPrincipalPinEdit) &&
    memberType === (savedIsDependent ? 'DD' : 'MM') &&
    hasStep1Changes &&
    !isPinDbVerified &&
    pinFeedback.status !== 'invalid' &&
    pinFeedback.status !== 'checking' &&
    !principalBlocking;
  const showStep1ActionRow =
    !duplicatePinConflict &&
    pinFeedback.status !== 'invalid' &&
    !principalBlocking &&
    (isClearingSavedPin || step1CanDeferOnServerError || step1ReadyToSaveVerified || step1MetadataEditOnly);

  const completedStepsCount = [step1Done, step2Done, step3Done, step4Done, step5Done].filter(Boolean).length;
  const currentStepNumber = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : !step4Done ? 4 : 5;
  const step1State: VerticalStepState = step1Done ? 'completed' : 'active';
  const step2State: VerticalStepState = step2Done ? 'completed' : step2Unlocked ? 'active' : 'locked';
  const step3State: VerticalStepState = step3Done ? 'completed' : step3Unlocked ? 'active' : 'locked';
  const step4State: VerticalStepState = step4Done ? 'completed' : step4Unlocked ? 'active' : 'locked';
  const step5State: VerticalStepState = step5Done ? 'completed' : step5Unlocked ? 'active' : 'locked';

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="PhilHealth Coverage & Clinic Assignment"
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
            disabled={savingMembership || submittingSelection || checkingStanding}
            testID="philhealth-close-coverage-btn"
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
          {/* Step Progress Header */}
          <View style={styles.stepProgressBar} testID="yakap-step-progress-bar">
            <View style={styles.stepProgressInfo}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                {isFpeCompleted
                  ? `${fpeStatus?.effectiveYear ?? new Date().getFullYear()} PhilHealth Onboarding Complete`
                  : `PhilHealth Onboarding · Step ${currentStepNumber} of 5`}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {isFpeCompleted
                  ? 'All annual checkup requirements are complete.'
                  : 'Complete each step in order below to unlock the PhilHealth Annual Checkup.'}
              </ThemedText>
            </View>
            <Badge
              label={`${completedStepsCount} / 5 Done`}
              variant={completedStepsCount === 5 ? 'success' : 'primary'}
              size="sm"
            />
          </View>

          <View style={styles.verticalStepsList} testID="yakap-vertical-stepper">
            {/* Step 1: PhilHealth Number & Membership */}
            <VerticalStepRow
              stepNumber={1}
              title="PhilHealth Number & Membership"
              subtitle="Enter a valid 12-digit PhilHealth PIN, verify with PhilHealth, pick Member or Dependent, and save."
              statusLabel={
                step1Done
                  ? isPinDbVerified
                    ? 'Verified with PhilHealth'
                    : 'Saved · Verification Pending'
                  : 'Required'
              }
              statusVariant={
                step1Done ? (isPinDbVerified ? 'success' : 'warning') : 'primary'
              }
              state={step1State}
              testID="yakap-step-1-card"
            >
              {/* PIN Input + Inline Verify */}
              <PhilHealthPinInput
                value={pin}
                onChangeText={(formatted) => {
                  setPin(formatted);
                  setPinFeedback({ status: 'idle', message: '' });
                  setDuplicatePinConflict(null);
                  setDbVerifiedPinDigits(null);
                  setStandingCheck(null);
                  setAssignedResult(false);
                }}
                label="Patient PhilHealth PIN"
                helperText="12-digit PhilHealth Identification Number (XX-XXXXXXXXX-X)"
                error={pinFeedback.status === 'invalid' ? pinFeedback.message : undefined}
                requireVerification
                verificationStatus={
                  pinFeedback.status === 'checking'
                    ? 'checking'
                    : pinFeedback.status === 'valid'
                      ? 'verified'
                      : pinFeedback.status === 'invalid'
                        ? 'invalid'
                        : pinFeedback.status === 'server_error'
                          ? 'server_error'
                          : !hasUnsavedPinEdit && isPinDbVerified
                            ? 'verified'
                            : 'idle'
                }
                verificationMessage={
                  pinFeedback.status === 'valid' || pinFeedback.status === 'server_error'
                    ? pinFeedback.message
                    : !hasUnsavedPinEdit && isPinDbVerified && pinFeedback.status === 'idle'
                      ? 'Verified with PhilHealth records.'
                      : undefined
                }
                rightAccessory={
                  <Button
                    title={pinFeedback.status === 'checking' ? 'Verifying...' : 'Verify PIN'}
                    variant="outline"
                    size="md"
                    icon="shieldCheck"
                    loading={pinFeedback.status === 'checking'}
                    disabled={pinFeedback.status === 'checking' || savingMembership}
                    onPress={handleVerifyPin}
                    testID="verify-pin-btn"
                  />
                }
                testID="coverage-patient-pin-input"
              />

              {step1Done && !isPinDbVerified ? (
                <View style={styles.unverifiedFlagBox} testID="pin-db-unverified-flag">
                  <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                  <ThemedText variant="caption" color={theme.colors.warningText} style={styles.flexOne}>
                    PhilHealth number saved locally, but not yet verified with PhilHealth. Click Verify PIN or check eligibility in Step 2.
                  </ThemedText>
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
                  onChangeText={(formatted) => {
                    setPrincipalMemberPin(formatted);
                    setPrincipalPinFeedback({ status: 'idle', message: '' });
                    setDbVerifiedPrincipalPinDigits(null);
                  }}
                  label="Principal Member PIN"
                  helperText="12-digit PhilHealth PIN of the Principal Member / Sponsor (XX-XXXXXXXXX-X)"
                  error={
                    principalPinSameAsPatientError ||
                    (principalPinFeedback.status === 'invalid' ? principalPinFeedback.message : undefined)
                  }
                  requireVerification
                  verificationStatus={
                    isPrincipalPinSameAsPatient || principalPinFeedback.status === 'invalid'
                      ? 'invalid'
                      : principalPinFeedback.status === 'checking'
                        ? 'checking'
                        : principalPinFeedback.status === 'valid'
                          ? 'verified'
                          : principalPinFeedback.status === 'server_error'
                            ? 'server_error'
                            : !hasUnsavedPrincipalPinEdit && isSavedPrincipalPinDbVerified
                              ? 'verified'
                              : 'idle'
                  }
                  verificationMessage={
                    principalPinFeedback.status === 'valid' || principalPinFeedback.status === 'server_error'
                      ? principalPinFeedback.message
                      : !hasUnsavedPrincipalPinEdit &&
                          isSavedPrincipalPinDbVerified &&
                          principalPinFeedback.status === 'idle'
                        ? 'Verified with PhilHealth records.'
                        : undefined
                  }
                  rightAccessory={
                    <Button
                      title={principalPinFeedback.status === 'checking' ? 'Verifying...' : 'Verify PIN'}
                      variant="outline"
                      size="md"
                      icon="shieldCheck"
                      loading={principalPinFeedback.status === 'checking'}
                      disabled={
                        principalPinFeedback.status === 'checking' ||
                        savingMembership ||
                        isPrincipalPinSameAsPatient
                      }
                      onPress={handleVerifyPrincipalPin}
                      testID="verify-principal-pin-btn"
                    />
                  }
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
                    testID="coverage-principal-last-name-input"
                  />
                  <Input
                    containerStyle={styles.fieldCol}
                    label="Principal First Name"
                    value={principalFirstName}
                    onChangeText={setPrincipalFirstName}
                    placeholder="First name"
                    required
                    testID="coverage-principal-first-name-input"
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
                  error={principalDobError}
                  required
                  testID="coverage-principal-dob-input"
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
                  label="Default PhilHealth Visit Code"
                  value={defaultWalkInAtc}
                  onChangeText={setDefaultWalkInAtc}
                  placeholder="Optional visit code issued by PhilHealth"
                />
              </View>
            ) : null}

              {showStep1ActionRow ? (
                <View style={styles.enlistmentActionsRow}>
                  <Button
                    title={
                      isClearingSavedPin
                        ? 'Clear Saved PIN'
                        : step1CanDeferOnServerError
                          ? 'Defer PIN Verification & Continue'
                          : step1Done
                            ? 'Save Membership Changes'
                            : 'Save Membership & Continue'
                    }
                    icon="save"
                    variant={step1Done && !hasUnsavedPinEdit ? 'outline' : 'primary'}
                    size="sm"
                    onPress={() => {
                      void handleSaveMembership(!isClearingSavedPin);
                    }}
                    loading={savingMembership}
                    disabled={
                      savingMembership ||
                      pinFeedback.status === 'checking' ||
                      (memberType === 'DD' && principalPinFeedback.status === 'checking') ||
                      (!isClearingSavedPin && !isDependentSponsorComplete)
                    }
                    testID="save-step1-membership-btn"
                  />
                  {!isClearingSavedPin && memberType === 'DD' && !isDependentSponsorComplete ? (
                    <ThemedText variant="caption" color={theme.colors.warningText} testID="dependent-required-hint">
                      Complete all required Principal Member fields above to continue.
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
            </VerticalStepRow>

            {/* Step 2: Check PhilHealth Eligibility */}
            <VerticalStepRow
              stepNumber={2}
              title="Check PhilHealth Eligibility"
              subtitle="Confirm this year's PhilHealth YAKAP standing before checking identity or assigning."
              statusLabel={
                step2Done ? 'Eligibility Checked' : step2Unlocked ? 'Current Step' : 'Finish Step 1 First'
              }
              statusVariant={step2Done ? 'success' : step2Unlocked ? 'primary' : 'neutral'}
              state={step2State}
              testID="yakap-step-2-card"
            >
              <View style={styles.enlistmentActionsRow}>
                <Button
                  title={checkingStanding ? 'Checking...' : 'Check PhilHealth Eligibility'}
                  variant={step2Done ? 'outline' : step2Unlocked ? 'primary' : 'outline'}
                  size="sm"
                  icon="refresh"
                  onPress={handleCheckStanding}
                  disabled={!step2Unlocked || checkingStanding}
                  testID="check-yakap-standing-btn"
                />
                {!step2Unlocked ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Complete Step 1 (save a valid 12-digit PIN) to unlock.
                  </ThemedText>
                ) : null}
              </View>

              {standingCheck ? (
                <View style={styles.enlistmentActiveBox} testID="yakap-standing-summary-box">
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    Live PhilHealth Check ({standingCheck.effectiveYear})
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {standingCheck.summaryMessage}
                  </ThemedText>
                </View>
              ) : null}
            </VerticalStepRow>

            {/* Step 3: Confirm Patient Identity */}
            <VerticalStepRow
              stepNumber={3}
              title="Confirm Patient Identity"
              subtitle="Complete Face Scan, Text Code (OTP), or Photo ID verification for today."
              statusLabel={
                step3Done ? 'Identity Confirmed' : step3Unlocked ? 'Current Step' : 'Finish Step 2 First'
              }
              statusVariant={step3Done ? 'success' : step3Unlocked ? 'primary' : 'neutral'}
              state={step3State}
              testID="yakap-step-3-card"
            >
              <View style={styles.enlistmentActionsRow}>
                <Button
                  title={step3Done ? 'Identity Confirmed Today' : 'Confirm Patient Identity'}
                  variant={step3Done ? 'secondary' : step3Unlocked ? 'primary' : 'outline'}
                  size="sm"
                  icon="patientVerified"
                  disabled={!step3Unlocked}
                  onPress={() => {
                    if (step3Unlocked) setIdentityModalOpen(true);
                  }}
                  testID="open-identity-check-btn"
                />
                {!step3Unlocked ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Complete Step 2 (Check PhilHealth Eligibility) to unlock.
                  </ThemedText>
                ) : null}
              </View>

              {latestIdentity ? (
                <View style={styles.enlistmentActiveBox}>
                  <View style={styles.enlistmentHeaderRow}>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      Identity Check ({formatIdentityMethodLabel(latestIdentity.mode)})
                    </ThemedText>
                    <Badge
                      label={latestIdentity.isVerifiedForToday ? 'Confirmed Today' : `Checked ${latestIdentity.verificationDate}`}
                      variant={latestIdentity.isVerifiedForToday ? 'success' : 'warning'}
                      size="sm"
                    />
                  </View>
                  {latestIdentity.pcuTransactionId ? (
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Reference: {latestIdentity.pcuTransactionId}
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
            </VerticalStepRow>

            {/* Step 4: Assign Patient to This Clinic */}
            <VerticalStepRow
              stepNumber={4}
              title="Assign Patient to This Clinic"
              subtitle="Link this verified patient to your clinic under PhilHealth YAKAP."
              statusLabel={
                step4Unlocked ? enlistmentBadge.label : 'Finish Step 3 First'
              }
              statusVariant={
                step4Done ? 'success' : step4Unlocked ? enlistmentBadge.variant : 'neutral'
              }
              state={step4State}
              testID="yakap-enlistment-card"
            >
              <View style={styles.enlistmentActionsRow}>
                {(!activeEnlistment || activeEnlistment.status === 'Draft' || standingCheck?.needsClinicSelection) ? (
                  <Button
                    title={submittingSelection ? 'Assigning...' : 'Assign to This Clinic'}
                    variant={step4Unlocked ? 'primary' : 'outline'}
                    size="sm"
                    icon="shieldCheck"
                    onPress={handleAssignToClinic}
                    disabled={!step4Unlocked || submittingSelection}
                    testID="assign-clinic-yakap-btn"
                  />
                ) : null}
                {(fpeStatus?.isCompleted || activeEnlistment?.yesReferenceNo) ? (
                  <Button
                    title={printingSlip ? 'Preparing PDF...' : 'Print Confirmation Slip'}
                    variant="outline"
                    size="sm"
                    icon="printer"
                    onPress={handlePrintSlip}
                    disabled={printingSlip}
                    testID="print-confirmation-slip-btn"
                  />
                ) : null}
                {!step4Unlocked ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Complete Step 3 (Confirm Patient Identity) to unlock.
                  </ThemedText>
                ) : null}
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
                        Date Assigned
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
                        Visit Reference
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
                        Clinic Selection Ref
                      </ThemedText>
                      <ThemedText
                        variant="captionBold"
                        color={activeEnlistment.selectionControlNumber ? theme.colors.primaryDark : theme.colors.textMuted}
                      >
                        {activeEnlistment.selectionControlNumber || 'Pending'}
                      </ThemedText>
                    </View>
                    <View style={styles.refBox}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        PhilHealth Assignment No.
                      </ThemedText>
                      <ThemedText
                        variant="captionBold"
                        color={activeEnlistment.yesReferenceNo ? theme.colors.primaryDark : theme.colors.textMuted}
                      >
                        {activeEnlistment.yesReferenceNo || 'Pending Checkup'}
                      </ThemedText>
                    </View>
                    <View style={styles.refBox}>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Checkup Reference
                      </ThemedText>
                      <ThemedText
                        variant="captionBold"
                        color={activeEnlistment.profilingTransNo ? theme.colors.successText : theme.colors.textMuted}
                      >
                        {activeEnlistment.profilingTransNo || 'Pending Checkup'}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ) : (
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Not yet assigned to this clinic for {new Date().getFullYear()}.
                </ThemedText>
              )}

              {latestSubmission ? (
                <View style={styles.enlistmentActiveBox} testID="latest-yakap-submission-box">
                  <View style={styles.enlistmentHeaderRow}>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      Latest Checkup Submission
                    </ThemedText>
                    <Badge
                      label={latestSubmission.processingStatus}
                      variant={
                        latestSubmission.processingStatus === 'Accepted' || latestSubmission.processingStatus === 'Completed'
                          ? 'success'
                          : latestSubmission.processingStatus === 'Rejected' || latestSubmission.processingStatus === 'Failed'
                            ? 'emergency'
                            : 'warning'
                      }
                      size="sm"
                    />
                  </View>
                  {latestSubmission.lastErrorMessage ? (
                    <ThemedText variant="caption" color={theme.colors.emergencyText}>
                      {latestSubmission.lastErrorMessage}
                    </ThemedText>
                  ) : null}
                  <View style={styles.enlistmentActionsRow}>
                    <Button
                      title="Check Status"
                      variant="outline"
                      size="xs"
                      onPress={() => handlePollSubmission(latestSubmission.id)}
                      disabled={refreshingSubmission}
                    />
                    {latestSubmission.processingStatus === 'Rejected' ||
                    latestSubmission.processingStatus === 'Failed' ||
                    latestSubmission.processingStatus === 'Queued' ? (
                      <Button
                        title="Retry Submission"
                        variant="outline"
                        size="xs"
                        onPress={() => handleRetrySubmission(latestSubmission.id)}
                        disabled={refreshingSubmission}
                      />
                    ) : null}
                  </View>
                </View>
              ) : null}

              {sortedEnlistments.length > 1 ? (
                <View style={styles.enlistmentActionsRow}>
                  <Button
                    title={historyOpen ? 'Hide Previous Years' : `View Previous Years (${sortedEnlistments.length})`}
                    variant="ghost"
                    size="sm"
                    onPress={() => setHistoryOpen((prev) => !prev)}
                  />
                </View>
              ) : null}

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
            </VerticalStepRow>

            {/* Step 5: Annual PhilHealth Checkup */}
            <VerticalStepRow
              stepNumber={5}
              title={`${fpeStatus?.effectiveYear ?? new Date().getFullYear()} Annual PhilHealth Checkup`}
              subtitle={
                isFpeCompleted
                  ? `Completed on ${fpeStatus?.profilingDate || 'Recorded'} · Ref: ${fpeStatus?.profilingTransNo || 'Assigned'}`
                  : step5Unlocked
                    ? 'Ready! All PhilHealth requirements are verified. Launch the checkup when the patient is ready.'
                    : hasValidPin
                      ? 'Finish Steps 1–4 above in order before starting the annual PhilHealth checkup.'
                      : 'Enter and verify a 12-digit PhilHealth number first.'
              }
              statusLabel={
                isFpeCompleted ? 'Checkup Completed' : step5Unlocked ? 'Ready to Start' : 'Finish Step 4 First'
              }
              statusVariant={isFpeCompleted ? 'success' : step5Unlocked ? 'info' : 'neutral'}
              state={step5State}
              isLast
              testID="yakap-fpe-status-banner"
            >
              <View style={styles.fpeActionRow}>
                {!isFpeCompleted && onStartYakapScreening ? (
                  <Button
                    title="Start PhilHealth Checkup"
                    icon="heartPulse"
                    variant="primary"
                    size="sm"
                    disabled={!step5Unlocked}
                    onPress={() => {
                      if (!step5Unlocked) return;
                      onClose();
                      onStartYakapScreening(patient);
                    }}
                    testID="start-yakap-screening-btn"
                  />
                ) : null}
                {(isFpeCompleted || activeEnlistment?.yesReferenceNo) ? (
                  <Button
                    title={printingSlip ? 'Preparing PDF...' : 'Print Confirmation Slip'}
                    icon="printer"
                    variant="outline"
                    size="sm"
                    onPress={handlePrintSlip}
                    disabled={printingSlip}
                    testID="banner-print-confirmation-slip-btn"
                  />
                ) : null}
              </View>
            </VerticalStepRow>
          </View>
        </View>
      )}

      {/* Identity Verification Sub-Modal */}
      <PatientIdentityCheckModal
        visible={identityModalOpen}
        onClose={() => setIdentityModalOpen(false)}
        patientId={patient.id}
        patientName={patient.fullName}
        philHealthPin={pin || coverage?.philHealthNumber}
        onVerified={() => {
          void refreshCoverage();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionsContainer: {
    gap: theme.spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stepProgressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    backgroundColor: theme.colors.infoBg,
  },
  stepProgressInfo: {
    flex: 1,
    minWidth: 200,
    gap: theme.spacing.xs,
  },
  verticalStepsList: {
    gap: theme.spacing.xs,
  },
  stepRowContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.md,
  },
  stepRailCol: {
    alignItems: 'center',
    width: theme.spacing['3xl'],
  },
  stepCircle: {
    width: theme.spacing['3xl'],
    height: theme.spacing['3xl'],
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleCompleted: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  stepCircleActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  stepCircleLocked: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderDark,
  },
  stepConnector: {
    flex: 1,
    width: 2,
    marginVertical: theme.spacing.xs,
  },
  stepConnectorDone: {
    backgroundColor: theme.colors.successBorder,
  },
  stepConnectorPending: {
    backgroundColor: theme.colors.border,
  },
  stepCard: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  stepCardActive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primaryBorder,
    ...theme.shadows.brandSubtle,
  },
  stepCardCompleted: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.successBorder,
  },
  stepCardLocked: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
    paddingVertical: theme.spacing.sm,
    opacity: 0.78,
  },
  unverifiedFlagBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.warningBg,
  },
  stepHeaderTextGroup: {
    flex: 1,
    minWidth: 180,
    gap: theme.spacing.xs,
  },
  fpeActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
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
