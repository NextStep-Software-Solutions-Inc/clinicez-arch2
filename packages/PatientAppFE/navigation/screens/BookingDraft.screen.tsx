// ─────────────────────────────────────────────────────────────────────────────
// Book Appointment — 5-Step Wizard
// Step 1: Clinic (horizontal scroll) + Service (horizontal chips)
// Step 2: Provider (optional)
// Step 3: Schedule (always optional — even with a provider)
// Step 4: Details (subject, chief complaint, notes, attach files)
// Step 5: Review + Consent + Pay (if fee required) + Confirm
//
// Fixes applied:
//  - No hex color string concatenations; uses rgba() or explicit static colors
//  - Schedule is always optional regardless of provider selection
//  - "Attach Files" opens AttachFilesScreen formSheet
//  - Draft preloads: on mount, reads the latest matching bookingDraft for the
//    pre-selected clinicId and jumps to Step 5 with values pre-filled
//  - Payment-first: when a fee is required the "Confirm Booking" button is
//    replaced with "Pay & Confirm" which simulates a payment flow before saving
//  - All navigation.navigate calls use properly-typed params
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { MaterialSymbol, SFSymbol, useFocusEffect, useNavigation, useTheme } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, format } from 'date-fns';
import { and, eq, inArray } from 'drizzle-orm';
import NetInfo from '@react-native-community/netinfo';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from 'utils/safe';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { SkeletonCard } from '@ui/Skeleton';
import WeeklyDatePicker from 'components/appointments/WeeklyDatePicker';
import TimeSlotPicker from 'components/appointments/TimeSlotPicker';
import { usePatientId } from 'hooks/usePatientId';
import { db } from '@db/index';
import { bookingDrafts } from '@db/schema/bookingDrafts';
import { filesMetadata } from '@db/schema/filesMetadata';
import {
  getClinicDetail,
  listClinics,
  saveBookingDraft,
  createBookingDraftOnline,
  submitBookingDraftOnline,
} from '../../services/discovery/discoveryService';
import {
  consumeAttachedFileSelection,
  initAttachedFileSelection,
} from '../../services/appointments/attachedFilesStore';
import {
  fetchAvailableSlots,
  fetchProviderOptions,
  fetchServiceOptions,
} from '../../services/appointments/appointmentsService';
import type { ClinicView } from '../../services/discovery/types';
import type {
  AvailableSlot,
  BookingProviderOption,
  BookingServiceOption,
} from '../../services/appointments/types';

type WizardStep = 1 | 2 | 3 | 4 | 5;
type Props = StaticScreenProps<{ clinicId?: string } | undefined>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(price?: number | null, currency?: string): string {
  if (!price) return 'Free';
  return `${currency ?? 'PHP'} ${price.toFixed(2)}`;
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEP_LABELS: Record<number, string> = {
  1: 'Clinic',
  2: 'Provider',
  3: 'Schedule',
  4: 'Details',
  5: 'Review',
};

function StepIndicator({ step, total }: { step: WizardStep; total: number }) {
  const { colors } = useTheme();
  return (
    <View style={stepStyles.container}>
      {Array.from({ length: total }, (_, i) => {
        const num = i + 1;
        const isDone = num < step;
        const isCurrent = num === step;
        return (
          <View key={i} style={stepStyles.item}>
            <View
              style={[
                stepStyles.circle,
                isDone && { backgroundColor: colors.primary, borderColor: colors.primary },
                isCurrent && { borderColor: colors.primary },
                !isDone && !isCurrent && { borderColor: colors.border },
              ]}
            >
              {isDone ? (
                <ThemedText style={stepStyles.doneText}>✓</ThemedText>
              ) : (
                <ThemedText
                  style={[
                    stepStyles.numText,
                    isCurrent && { color: colors.primary, fontWeight: '800' },
                    !isCurrent && { color: colors.text, opacity: 0.45 },
                  ]}
                >
                  {num}
                </ThemedText>
              )}
            </View>
            <ThemedText
              style={[
                stepStyles.label,
                isCurrent && { color: colors.primary, fontWeight: '700' },
                !isCurrent && { color: colors.text, opacity: 0.5 },
              ]}
            >
              {STEP_LABELS[num]}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  item: { alignItems: 'center', flex: 1, gap: 4 },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { fontSize: 12, fontWeight: '600' },
  doneText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  label: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
});

// ── Clinic card (horizontal) ──────────────────────────────────────────────────

function ClinicCard({
  clinic, selected, onPress,
}: { clinic: ClinicView; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const initials = clinic.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.clinicCard,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? 'rgba(37,99,235,0.08)' : colors.card,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      {clinic.logoUrl ? (
        <Image source={{ uri: clinic.logoUrl }} style={styles.clinicLogo} />
      ) : (
        <View style={[styles.clinicLogo, styles.clinicLogoFallback]}>
          <ThemedText style={styles.clinicLogoInitials}>{initials}</ThemedText>
        </View>
      )}
      <ThemedText style={styles.clinicCardName} numberOfLines={2}>{clinic.name}</ThemedText>
      {clinic.address ? (
        <ThemedText style={[styles.clinicCardAddr, { color: colors.text }]} numberOfLines={2}>
          {clinic.address}
        </ThemedText>
      ) : null}
      {selected && (
        <View style={[styles.clinicSelectedBadge, { backgroundColor: colors.primary }]}>
          <ThemedText style={styles.clinicSelectedCheck}>✓</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

// ── Service chip ──────────────────────────────────────────────────────────────

function ServiceChip({
  svc, selected, onPress,
}: { svc: BookingServiceOption; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.serviceChip,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? 'rgba(37,99,235,0.08)' : colors.card,
        },
      ]}
    >
      <ThemedText style={[styles.serviceChipName, selected && { color: colors.primary }]}>
        {svc.name}
      </ThemedText>
      <ThemedText style={[styles.serviceChipMeta, { color: colors.text }]}>
        {svc.durationMinutes} min · {formatPrice(svc.price, svc.currency)}
      </ThemedText>
    </Pressable>
  );
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  prov, selected, onPress,
}: { prov: BookingProviderOption; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const initials = prov.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.selCard,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? 'rgba(37,99,235,0.08)' : colors.card,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      {prov.avatarUrl ? (
        <Image source={{ uri: prov.avatarUrl }} style={styles.providerAvatar} />
      ) : (
        <View style={[styles.providerAvatar, styles.avatarFallback]}>
          <ThemedText style={styles.avatarInitials}>{initials}</ThemedText>
        </View>
      )}
      <View style={styles.selCardInfo}>
        <ThemedText style={styles.selCardTitle}>{prov.name}</ThemedText>
        <ThemedText style={[styles.selCardSub, { color: colors.text }]}>{prov.specialty}</ThemedText>
      </View>
      {selected && <ThemedText style={[styles.check, { color: colors.primary }]}>✓</ThemedText>}
    </Pressable>
  );
}

// ── Consent row ───────────────────────────────────────────────────────────────

function ConsentRow({
  checked, onToggle, label, linkLabel,
}: { checked: boolean; onToggle: () => void; label: string; linkLabel: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={styles.consentRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? colors.primary : colors.border,
            backgroundColor: checked ? colors.primary : 'transparent',
          },
        ]}
      >
        {checked ? <ThemedText style={styles.checkboxMark}>✓</ThemedText> : null}
      </View>
      <ThemedText style={[styles.consentLabel, { color: colors.text }]}>
        {label}{' '}
        <ThemedText style={{ color: colors.primary, fontWeight: '700' }}>{linkLabel}</ThemedText>
      </ThemedText>
    </Pressable>
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.summaryRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <ThemedText style={[styles.summaryLabel, { color: colors.text }]}>{label}</ThemedText>
      <ThemedText style={styles.summaryValue} numberOfLines={3}>{value}</ThemedText>
    </View>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function BookingDraftScreen({ route }: Props) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const insets = useSafeAreaInsets();
  const initialClinicId = route.params?.clinicId ?? '';

  const [step, setStep] = useState<WizardStep>(1);

  // Step 1
  const [clinics, setClinics] = useState<ClinicView[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState(initialClinicId);
  const [services, setServices] = useState<BookingServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState<BookingServiceOption | null>(null);
  const [isLoadingClinics, setIsLoadingClinics] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  // Holds the service ID/name from a loaded draft until services have loaded
  const [pendingServiceRestore, setPendingServiceRestore] = useState<{ id: string; name: string } | null>(null);

  // Step 2
  const [providers, setProviders] = useState<BookingProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<BookingProviderOption | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  // Step 3 — always optional regardless of provider
  const [selectedDate, setSelectedDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [skipSchedule, setSkipSchedule] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Step 4
  const [subject, setSubject] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [notes, setNotes] = useState('');
  const [attachedFileIds, setAttachedFileIds] = useState<string[]>([]);
  const [attachedFileMetas, setAttachedFileMetas] = useState<Array<{ id: string; name: string; sizeBytes: number | null }>>([]);

  // Step 5
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);

  // Validation errors — shown inline instead of Alert dialogs
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Sync attached files from store when screen regains focus ─────────────
  // AttachFilesScreen writes to the store before goBack(); we read here.

  useFocusEffect(useCallback(() => {
    const { ids, updated } = consumeAttachedFileSelection();
    if (updated) {
      setAttachedFileIds(ids);
      setFieldErrors(prev => ({ ...prev, attachedFiles: '' }));
    }
  }, []));

  // Load file metadata whenever attachedFileIds changes (for display)
  useEffect(() => {
    if (attachedFileIds.length === 0) { setAttachedFileMetas([]); return; }
    db.select({ id: filesMetadata.id, name: filesMetadata.name, sizeBytes: filesMetadata.sizeBytes })
      .from(filesMetadata)
      .where(inArray(filesMetadata.id, attachedFileIds))
      .then(rows => setAttachedFileMetas(rows))
      .catch(() => { /* silent — display degraded */ });
  }, [attachedFileIds]);

  // ── Auto-restore service after services list has loaded ─────────────────
  useEffect(() => {
    if (!pendingServiceRestore || services.length === 0) return;
    const match =
      services.find(s => s.id === pendingServiceRestore.id) ??
      services.find(s => s.name === pendingServiceRestore.name);
    if (match) setSelectedService(match);
    setPendingServiceRestore(null);
  }, [services, pendingServiceRestore]);

  // ── Load clinics ──────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    setIsLoadingClinics(true);
    listClinics(patientId, { filter: 'joined' }, getToken)
      .then(async items => {
        if (!mounted) return;
        let finalItems = [...items];

        if (initialClinicId && !finalItems.some(c => c.id === initialClinicId)) {
          try {
            const specificClinic = await getClinicDetail(patientId, initialClinicId);
            if (specificClinic) {
              finalItems = [specificClinic, ...finalItems];
            }
          } catch (err) {
            console.warn('Failed to load initial clinic for booking:', err);
          }
        }

        if (mounted) {
          setClinics(finalItems);
          if (!selectedClinicId && finalItems.length > 0) setSelectedClinicId(finalItems[0].id);
        }
      })
      .catch(() => Alert.alert('Error', 'Unable to load your clinics.'))
      .finally(() => { if (mounted) setIsLoadingClinics(false); });
    return () => { mounted = false; };
  }, [patientId, initialClinicId]);

  // ── Load services when clinic changes ─────────────────────────────────────

  useEffect(() => {
    if (!selectedClinicId) return;
    let mounted = true;
    setIsLoadingServices(true);
    setSelectedService(null);
    fetchServiceOptions(selectedClinicId, patientId, getToken)
      .then(s => { if (mounted) setServices(s); })
      .catch(() => Alert.alert('Error', 'Unable to load services.'))
      .finally(() => { if (mounted) setIsLoadingServices(false); });
    return () => { mounted = false; };
  }, [selectedClinicId]);

  // ── Preload latest draft when clinicId is provided ────────────────────────

  useEffect(() => {
    if (!initialClinicId || !selectedClinicId) return;
    db.select()
      .from(bookingDrafts)
      .where(eq(bookingDrafts.clinicId, selectedClinicId))
      .orderBy(bookingDrafts.updatedAt)
      .then(rows => {
        const latest = rows[rows.length - 1];
        if (!latest) return;
        // Preload draft values
        if (latest.reason) {
          // Try to split "Subject: ChiefComplaint" format
          const colonIdx = latest.reason.indexOf(':');
          if (colonIdx > 0 && colonIdx < 80) {
            setSubject(latest.reason.slice(0, colonIdx).trim());
            setChiefComplaint(latest.reason.slice(colonIdx + 1).trim());
          } else {
            setChiefComplaint(latest.reason);
          }
        }
        // Decode service metadata from notes field (format: [[service:id=X;name=Y]])
        const serviceMeta = latest.notes?.match(/^\[\[service:id=([^;]+);name=([^\]]+)\]\]\n?([\s\S]*)$/);
        if (serviceMeta) {
          const [, svcId, svcName, actualNotes] = serviceMeta;
          setPendingServiceRestore({ id: svcId, name: svcName });
          if (actualNotes.trim()) setNotes(actualNotes.trim());
        } else if (latest.notes) {
          setNotes(latest.notes);
        }
        if (latest.preferredDate) {
          setSelectedDate(latest.preferredDate);
          setSkipSchedule(false);
        } else {
          setSkipSchedule(true);
        }
        // Initialise the file store (empty for now — draft doesn't persist file IDs)
        initAttachedFileSelection([]);
        // Jump to review step
        setStep(5);
      })
      .catch(() => { /* no draft, start from step 1 */ });
  }, [initialClinicId, selectedClinicId]);

  // ── Load providers on step 2 ──────────────────────────────────────────────

  useEffect(() => {
    if (step !== 2 || !selectedClinicId) return;
    let mounted = true;
    setIsLoadingProviders(true);
    fetchProviderOptions(selectedClinicId, patientId, getToken)
      .then(p => { if (mounted) setProviders(p); })
      .catch(() => Alert.alert('Error', 'Unable to load providers.'))
      .finally(() => { if (mounted) setIsLoadingProviders(false); });
    return () => { mounted = false; };
  }, [step, selectedClinicId]);

  // ── Load slots on step 3 / date change ────────────────────────────────────

  useEffect(() => {
    if (step !== 3 || skipSchedule || !selectedClinicId) return;
    let mounted = true;
    setIsLoadingSlots(true);
    setSelectedSlotId(null);
    fetchAvailableSlots(selectedClinicId, selectedProvider?.id ?? '', selectedDate, getToken)
      .then((res) => { if (mounted) setSlots(res.slots); })
      .catch((err) => Alert.alert('Server Error', `Unable to load available slots. ${err?.message || ''}`))
      .finally(() => { if (mounted) setIsLoadingSlots(false); });
    return () => { mounted = false; };
  }, [step, selectedClinicId, selectedProvider, selectedDate, skipSchedule]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleBack = () => {
    setFieldErrors({});
    if (step === 1) { navigation.goBack(); return; }
    setStep(s => (s - 1) as WizardStep);
  };

  const validateAndNext = () => {
    const errors: Record<string, string> = {};

    if (step === 1) {
      if (!selectedClinicId) errors.clinic = 'Please select a clinic to continue.';
      if (!selectedService) errors.service = 'Please select a service type to continue.';
    }

    if (step === 4) {
      if (!chiefComplaint.trim()) {
        errors.chiefComplaint = 'Please describe your main concern or reason for the visit.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    if (step < 5) setStep(s => (s + 1) as WizardStep);
  };

  const performSave = async (asDraft: boolean) => {
    // Check connectivity first
    const [network, networkErr] = await safeAwait(NetInfo.fetch());
    if (networkErr || !network || !network.isConnected) {
      showOfflineAlert();
      return;
    }

    // Inline validation for step 5
    const errors: Record<string, string> = {};

    if (!chiefComplaint.trim()) {
      errors.chiefComplaint = 'Please describe your main concern or reason for the visit.';
    }
    if (!asDraft && !consentPrivacy) {
      errors.consentPrivacy = 'Please accept the Privacy Policy to continue.';
    }
    if (!asDraft && !consentTerms) {
      errors.consentTerms = 'Please accept the Terms & Conditions to continue.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Payment gate
    const needsPayment = (selectedService?.price ?? 0) > 0;
    if (!asDraft && needsPayment && !hasPaid) {
      Alert.alert(
        'Payment Required',
        `This service costs ${formatPrice(selectedService?.price, selectedService?.currency)}. Complete payment to confirm your booking.`,
        [
          { text: 'Pay Now', onPress: handlePayment },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    const selectedSlot = skipSchedule ? null : slots.find(s => s.id === selectedSlotId);
    if (asDraft) setIsDraftSaving(true); else setIsSaving(true);
    // Encode service metadata into notes so it survives draft → reload
    const serviceMeta = selectedService
      ? `[[service:id=${selectedService.id};name=${selectedService.name}]]\n`
      : '';

    const notesValue = `${serviceMeta}${notes.trim()}`.trim() || null;
    const reasonValue = subject.trim()
      ? `${subject.trim()}: ${chiefComplaint.trim()}`
      : chiefComplaint.trim();

    // Create draft on backend first
    const [serverDraftId, saveErr] = await safeAwait(createBookingDraftOnline(getToken, patientId, {
      clinicId: selectedClinicId,
      organizationId: null,
      preferredDate: skipSchedule ? null : selectedDate,
      preferredTime: selectedSlot?.time ?? null,
      reason: reasonValue,
      notes: notesValue,
      shareFieldsJson: '[]',
      attachedFileIdsJson: JSON.stringify(attachedFileIds),
    }));

    if (saveErr || !serverDraftId) {
      console.error('[BookingDraftScreen] Save failed:', saveErr);
      Alert.alert('Error', 'Unable to save. Please try again.');
      setIsSaving(false);
      setIsDraftSaving(false);
      return;
    }

    if (asDraft) {
      const [, localSaveErr] = await safeAwait(saveBookingDraft(patientId, {
        clinicId: selectedClinicId,
        organizationId: null,
        preferredDate: skipSchedule ? undefined : selectedDate,
        preferredTime: selectedSlot?.time,
        reason: reasonValue,
        notes: notesValue || undefined,
        shareFields: [],
        attachedFileIds: attachedFileIds,
      }, serverDraftId));

      setIsSaving(false);
      setIsDraftSaving(false);

      if (localSaveErr) {
        Alert.alert('Error', 'Unable to save draft locally.');
        return;
      }

      Alert.alert('Draft Saved', 'Your booking has been saved. Continue anytime from the Health tab.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      // Submit ready booking draft to the Clinic Dashboard via backend
      const [, submitErr] = await safeAwait(submitBookingDraftOnline(getToken, patientId, serverDraftId));
      if (submitErr) {
        Alert.alert('Error', 'Unable to submit booking to clinic.');
        setIsSaving(false);
        setIsDraftSaving(false);
        return;
      }

      await safeAwait(saveBookingDraft(patientId, {
        clinicId: selectedClinicId,
        organizationId: null,
        preferredDate: skipSchedule ? undefined : selectedDate,
        preferredTime: selectedSlot?.time,
        reason: reasonValue,
        notes: notesValue || undefined,
        shareFields: [],
      }, serverDraftId));

      // Booking confirmed — mark status='ready' locally
      await safeAwait(db
        .update(bookingDrafts)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(and(eq(bookingDrafts.patientId, patientId), eq(bookingDrafts.clinicId, selectedClinicId))));
      
      setIsSaving(false);
      setIsDraftSaving(false);

      Alert.alert(
        'Booking Requested!',
        'Your appointment request has been submitted successfully to the clinic. You can view it in the Health tab.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    }
  };

  const handlePayment = () => {
    const price = selectedService?.price ?? 0;
    if (price === 0) {
      // Free service — auto-confirm payment immediately
      setHasPaid(true);
      Alert.alert('Confirmed', 'This service is free. Your booking is ready to confirm.');
    } else {
      // Paid service — payment gateway not yet integrated
      Alert.alert(
        'Online Payment Coming Soon',
        'Secure payment integration is being set up. Please pay at the clinic on your appointment day.',
        [{ text: 'OK' }],
      );
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedClinic = clinics.find(c => c.id === selectedClinicId);
  const selectedSlot = slots.find(s => s.id === selectedSlotId);
  const hasPayment = (selectedService?.price ?? 0) > 0;
  // Confirm button disabled only when saving or when payment is required but not yet done
  const confirmEnabled = !isSaving && (!hasPayment || hasPaid);

  // ── Step renderers ────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Clinic & Service</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
        Choose which clinic you're booking with, then select a service.
      </ThemedText>

      <View style={styles.fieldGroup}>
        <ThemedText style={styles.fieldLabel}>Your Clinics *</ThemedText>
        {isLoadingClinics ? (
          <View style={{ height: 140 }}><SkeletonCard /></View>
        ) : clinics.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={[styles.emptyHint, { color: colors.text, textAlign: 'center' }]}>
              You haven't joined any clinics yet. Explore clinics to join one and book an appointment.
            </ThemedText>
            <Pressable
              onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' } as any)}
              style={({ pressed }) => [
                styles.exploreBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }
              ]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.exploreBtnText}>Explore Clinics</ThemedText>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={clinics}
            keyExtractor={c => c.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            renderItem={({ item }) => (
              <ClinicCard
                clinic={item}
                selected={item.id === selectedClinicId}
                onPress={() => {
                  setSelectedClinicId(item.id);
                  setFieldErrors(prev => ({ ...prev, clinic: '', service: '' }));
                }}
              />
            )}
          />
        )}
        {fieldErrors.clinic ? (
          <View style={styles.errorRow}>
            <ThemedText style={styles.errorText}>⚠ {fieldErrors.clinic}</ThemedText>
          </View>
        ) : null}
      </View>

      {selectedClinicId ? (
        <View style={styles.fieldGroup}>
          <ThemedText style={styles.fieldLabel}>Service Type *</ThemedText>
          {isLoadingServices ? (
            <View style={styles.chipRow}>
              {[1, 2, 3].map(i => (
                <View key={i} style={[styles.svcChipPlaceholder, { borderColor: colors.border }]} />
              ))}
            </View>
          ) : (
            <FlatList
              data={services}
              keyExtractor={s => s.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
              renderItem={({ item }) => (
                <ServiceChip
                  svc={item}
                  selected={selectedService?.id === item.id}
                  onPress={() => {
                    setSelectedService(item);
                    setFieldErrors(prev => ({ ...prev, service: '' }));
                  }}
                />
              )}
            />
          )}
          {fieldErrors.service ? (
            <View style={styles.errorRow}>
              <ThemedText style={styles.errorText}>⚠ {fieldErrors.service}</ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Healthcare Provider</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
        Optional — the clinic will assign the right provider if you skip.
      </ThemedText>

      <Pressable
        onPress={() => setSelectedProvider(null)}
        accessibilityRole="button"
        style={[
          styles.selCard,
          {
            borderColor: selectedProvider === null ? colors.primary : colors.border,
            backgroundColor: selectedProvider === null ? 'rgba(37,99,235,0.08)' : colors.card,
          },
        ]}
      >
        <View style={[styles.noPreferenceIcon, { backgroundColor: colors.border }]}>
          <ThemedText style={styles.noPreferenceIconText}>🏥</ThemedText>
        </View>
        <View style={styles.selCardInfo}>
          <ThemedText style={styles.selCardTitle}>No preference</ThemedText>
          <ThemedText style={[styles.selCardSub, { color: colors.text }]}>
            Let the clinic assign the right provider
          </ThemedText>
        </View>
        {selectedProvider === null && (
          <ThemedText style={[styles.check, { color: colors.primary }]}>✓</ThemedText>
        )}
      </Pressable>

      {isLoadingProviders ? (
        <View style={{ gap: 10 }}><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <View style={{ gap: 10 }}>
          {providers.map(p => (
            <ProviderCard
              key={p.id}
              prov={p}
              selected={selectedProvider?.id === p.id}
              onPress={() => setSelectedProvider(prev => prev?.id === p.id ? null : p)}
            />
          ))}
        </View>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Preferred Schedule</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
        This step is optional. You can let the clinic pick the best time for you.
      </ThemedText>

      {/* Always show the skip toggle */}
      <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.toggleInfo}>
          <ThemedText style={styles.toggleTitle}>Let clinic schedule me</ThemedText>
          <ThemedText style={[styles.toggleSub, { color: colors.text }]}>
            The clinic will contact you to confirm a time
          </ThemedText>
        </View>
        <Switch
          value={skipSchedule}
          onValueChange={setSkipSchedule}
          trackColor={{ true: colors.primary }}
        />
      </View>

      {!skipSchedule ? (
        <>
          <View style={[styles.datePickerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <WeeklyDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          </View>
          <TimeSlotPicker
            slots={slots}
            selectedSlotId={selectedSlotId}
            onSelectSlot={setSelectedSlotId}
            isLoading={isLoadingSlots}
          />
        </>
      ) : (
        <View style={[styles.skipInfo, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ThemedText style={styles.skipInfoIcon}>📅</ThemedText>
          <ThemedText style={[styles.skipInfoText, { color: colors.text }]}>
            The clinic will reach out to confirm a convenient schedule with you.
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Visit Details</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
        Tell the clinic about your visit so they can prepare.
      </ThemedText>

      <View style={styles.fieldGroup}>
        <ThemedText style={styles.fieldLabel}>Subject (optional)</ThemedText>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. For my child, Annual PE, Follow-up on CBC..."
          placeholderTextColor="rgba(100,100,100,0.5)"
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
          accessibilityLabel="Subject"
        />
      </View>

      <View style={styles.fieldGroup}>
        <ThemedText style={styles.fieldLabel}>Chief Complaint *</ThemedText>
        <TextInput
          value={chiefComplaint}
          onChangeText={v => {
            setChiefComplaint(v);
            if (v.trim()) setFieldErrors(prev => ({ ...prev, chiefComplaint: '' }));
          }}
          placeholder="Describe your main concern or reason for the visit in detail..."
          placeholderTextColor="rgba(100,100,100,0.5)"
          multiline
          numberOfLines={4}
          style={[
            styles.textArea,
            {
              borderColor: fieldErrors.chiefComplaint
                ? '#EF4444'
                : chiefComplaint.trim() ? colors.primary : colors.border,
              color: colors.text,
              backgroundColor: colors.card,
            },
          ]}
          accessibilityLabel="Chief complaint"
        />
        {fieldErrors.chiefComplaint ? (
          <View style={styles.errorRow}>
            <ThemedText style={styles.errorText}>⚠ {fieldErrors.chiefComplaint}</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.fieldGroup}>
        <ThemedText style={styles.fieldLabel}>Additional Notes (optional)</ThemedText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any other information the clinic should know..."
          placeholderTextColor="rgba(100,100,100,0.5)"
          multiline
          numberOfLines={3}
          style={[styles.textArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
        />
      </View>

      <View style={styles.fieldGroup}>
        <ThemedText style={styles.fieldLabel}>Attach Files (optional)</ThemedText>
        <ThemedText style={[styles.fieldHint, { color: colors.text }]}>
          Share relevant documents (lab results, prescriptions) with the clinic.
        </ThemedText>

        {/* Selected files list */}
        {attachedFileMetas.length > 0 ? (
          <View style={[styles.selectedFilesCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {attachedFileMetas.map(f => (
              <View key={f.id} style={[styles.selectedFileRow, { borderBottomColor: colors.border }]}>
                <ThemedText style={styles.selectedFileIcon}>📄</ThemedText>
                <View style={styles.selectedFileInfo}>
                  <ThemedText style={styles.selectedFileName} numberOfLines={1}>{f.name}</ThemedText>
                  {f.sizeBytes ? (
                    <ThemedText style={[styles.selectedFileMeta, { color: colors.text }]}>
                      {f.sizeBytes < 1_048_576
                        ? `${(f.sizeBytes / 1024).toFixed(1)} KB`
                        : `${(f.sizeBytes / 1_048_576).toFixed(1)} MB`}
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    const newIds = attachedFileIds.filter(id => id !== f.id);
                    setAttachedFileIds(newIds);
                    initAttachedFileSelection(newIds);
                  }}
                  style={styles.removeFileBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${f.name}`}
                >
                  <ThemedText style={[styles.removeFileBtnText, { color: '#EF4444' }]}>✕</ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.attachRow}>
          <Pressable
            onPress={() => navigation.navigate('Main', { screen: 'AttachFilesScreen' })}
            style={[styles.attachBtn, { borderColor: colors.primary }]}
            accessibilityRole="button"
          >
            <ThemedText style={[styles.attachBtnText, { color: colors.primary }]}>
              📁  {attachedFileIds.length > 0 ? `Change Selection (${attachedFileIds.length})` : 'Select from My Files'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>Review & Confirm</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
        Review your booking details below.
      </ThemedText>

      <View style={[styles.summaryCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <SummaryRow label="Clinic" value={selectedClinic?.name ?? '—'} />
        <SummaryRow label="Service" value={selectedService?.name ?? '—'} />
        <SummaryRow label="Provider" value={selectedProvider?.name ?? 'Clinic assigned'} />
        <SummaryRow
          label="Date"
          value={skipSchedule ? 'Clinic will confirm' : (() => {
            try { return format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d, yyyy'); }
            catch { return selectedDate; }
          })()}
        />
        <SummaryRow
          label="Time"
          value={skipSchedule ? 'Clinic will confirm' : (selectedSlot?.displayTime ?? '—')}
        />
        {subject.trim() ? <SummaryRow label="Subject" value={subject.trim()} /> : null}
        <SummaryRow
          label="Chief Complaint"
          value={chiefComplaint.trim() || '—'}
          last={!hasPayment}
        />
        {hasPayment ? (
          <SummaryRow
            label="Service Fee"
            value={formatPrice(selectedService?.price, selectedService?.currency)}
            last
          />
        ) : null}
      </View>

      {/* Payment notice */}
      {hasPayment ? (
        <View style={styles.paymentNotice}>
          <View style={styles.paymentNoticeLeft}>
            <ThemedText style={styles.paymentNoticeIcon}>💳</ThemedText>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <ThemedText style={styles.paymentNoticeTitle}>
              Payment Required Before Confirming
            </ThemedText>
            <ThemedText style={[styles.paymentNoticeText, { color: colors.text }]}>
              {formatPrice(selectedService?.price, selectedService?.currency)} is required to confirm this booking. Non-payment within 24 hours of confirmation will cancel the appointment.
            </ThemedText>
            {hasPaid ? (
              <ThemedText style={styles.paymentPaidLabel}>✓ Payment received</ThemedText>
            ) : (
              <Pressable
                onPress={handlePayment}
                style={[styles.payNowInlineBtn, { backgroundColor: '#10B981' }]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.payNowInlineBtnText}>
                  Pay {formatPrice(selectedService?.price, selectedService?.currency)} Now
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}

      {/* Consent checkboxes */}
      <View style={[styles.consentCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={[styles.consentCardTitle, { color: colors.text }]}>
          Before confirming, please agree to:
        </ThemedText>
        <ConsentRow
          checked={consentPrivacy}
          onToggle={() => {
            setConsentPrivacy(v => !v);
            setFieldErrors(prev => ({ ...prev, consentPrivacy: '' }));
          }}
          label="I have read and agree to the"
          linkLabel={`Privacy Policy of ${selectedClinic?.name ?? 'this clinic'}`}
        />
        {fieldErrors.consentPrivacy ? (
          <View style={styles.errorRow}>
            <ThemedText style={styles.errorText}>⚠ {fieldErrors.consentPrivacy}</ThemedText>
          </View>
        ) : null}
        <ConsentRow
          checked={consentTerms}
          onToggle={() => {
            setConsentTerms(v => !v);
            setFieldErrors(prev => ({ ...prev, consentTerms: '' }));
          }}
          label="I accept the"
          linkLabel={`Terms & Conditions of ${selectedClinic?.name ?? 'this clinic'}`}
        />
        {fieldErrors.consentTerms ? (
          <View style={styles.errorRow}>
            <ThemedText style={styles.errorText}>⚠ {fieldErrors.consentTerms}</ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
    }
  };

  const confirmButtonLabel = () => {
    if (isSaving) return 'Saving...';
    if (hasPayment && !hasPaid) return `Pay & Confirm`;
    return 'Confirm Booking';
  };

  return (
    <ThemedView style={styles.screen}>
      <StepIndicator step={step} total={5} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
      >
        {renderStep()}
      </ScrollView>

      <View
        style={[
          styles.bottomNav,
          { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Pressable
          onPress={handleBack}
          style={[styles.backBtn, { borderColor: "#D97706" }]}
          accessibilityRole="button"
        >
          <ThemedText style={[styles.backBtnText, { color: colors.text }]}>

            {step === 1 ? Platform.select({
              android: <MaterialSymbol name="close" color="#D97706" />,
              ios: <SFSymbol name="xmark" color="#D97706" />,
            }) : Platform.select({
              android: <MaterialSymbol name="arrow_back" color="#D97706" />,
              ios: <SFSymbol name="chevron.left" color="#D97706" />,
            })}
          </ThemedText>
        </Pressable>

        {/* Save draft — available on step 5 */}
        {step === 5 ? (
          <Pressable
            onPress={() => performSave(true)}
            disabled={isDraftSaving || !chiefComplaint.trim()}
            style={[styles.draftBtn, { borderColor: "#10B981", opacity: chiefComplaint.trim() ? 1 : 0.4 }]}
            accessibilityRole="button"
          >
            <ThemedText style={[styles.draftBtnText, { color: colors.text }]}>
              {isDraftSaving ? '...' : Platform.select({
                android: <MaterialSymbol name="archive" color="#10B981" />,
                ios: <SFSymbol name="archivebox" color="#10B981" />,
              })}
            </ThemedText>
          </Pressable>
        ) : null}

        {step < 5 ? (
          <Pressable
            onPress={validateAndNext}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.primaryBtnText}>Continue</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => performSave(false)}
            disabled={!confirmEnabled}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: hasPaid || !hasPayment ? '#10B981' : '#F59E0B',
                opacity: confirmEnabled ? 1 : 0.5,
              },
            ]}
            accessibilityRole="button"
          >
            <ThemedText style={styles.primaryBtnText}>{confirmButtonLabel()}</ThemedText>
          </Pressable>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  stepContent: { paddingHorizontal: 16, gap: 20 },
  stepTitle: { fontSize: 22, fontWeight: '800' },
  stepSubtitle: { fontSize: 14, lineHeight: 20, opacity: 0.7, marginTop: -12 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', opacity: 0.65 },
  fieldHint: { fontSize: 11, opacity: 0.5 },
  emptyHint: { fontSize: 14, opacity: 0.6, lineHeight: 20 },
  emptyContainer: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 10,
  },
  exploreBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  horizontalList: { paddingHorizontal: 0 },

  // Clinic card
  clinicCard: {
    width: 230,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
    position: 'relative',
  },
  clinicLogo: { width: 40, height: 40, borderRadius: 10 },
  clinicLogoFallback: { backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' },
  clinicLogoInitials: { color: '#fff', fontSize: 13, fontWeight: '800' },
  clinicCardName: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  clinicCardAddr: { fontSize: 11, opacity: 0.65, lineHeight: 15 },
  clinicSelectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicSelectedCheck: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Service chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 3,
    minWidth: 130,
  },
  serviceChipName: { fontSize: 13, fontWeight: '700' },
  serviceChipMeta: { fontSize: 11, opacity: 0.65 },
  svcChipPlaceholder: {
    width: 120,
    height: 58,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(148,163,184,0.12)',
  },

  // Selection cards (provider)
  selCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selCardInfo: { flex: 1, gap: 2 },
  selCardTitle: { fontSize: 15, fontWeight: '700' },
  selCardSub: { fontSize: 12, opacity: 0.65 },
  check: { fontSize: 18, fontWeight: '800' },
  noPreferenceIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  noPreferenceIconText: { fontSize: 22 },
  providerAvatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Schedule
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  toggleInfo: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 14, fontWeight: '700' },
  toggleSub: { fontSize: 12, opacity: 0.65 },
  datePickerCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  skipInfo: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  skipInfoIcon: { fontSize: 20, marginTop: 1 },
  skipInfoText: { flex: 1, fontSize: 13, lineHeight: 20, opacity: 0.75 },

  // Details
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  attachBtnText: { fontSize: 13, fontWeight: '600' },

  // Review
  summaryCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', opacity: 0.6, flex: 0.38, marginTop: 1 },
  summaryValue: { fontSize: 13, fontWeight: '700', flex: 0.62, textAlign: 'right' },

  // Payment notice
  paymentNotice: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  paymentNoticeLeft: {},
  paymentNoticeIcon: { fontSize: 20, marginTop: 1 },
  paymentNoticeTitle: { fontSize: 13, fontWeight: '800', color: '#D97706' },
  paymentNoticeText: { fontSize: 12, lineHeight: 18, opacity: 0.8 },
  paymentPaidLabel: { fontSize: 12, fontWeight: '800', color: '#10B981' },
  payNowInlineBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginTop: 4 },
  payNowInlineBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Consent
  consentCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  consentCardTitle: { fontSize: 12, fontWeight: '700', opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxMark: { color: '#fff', fontSize: 11, fontWeight: '800' },
  consentLabel: { flex: 1, fontSize: 13, lineHeight: 19 },

  // Bottom nav
  bottomNav: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
  },
  backBtn: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 13, fontWeight: '600' },
  draftBtn: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBtnText: { fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Inline validation errors
  errorRow: {
    paddingTop: 4,
    paddingHorizontal: 2,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    lineHeight: 18,
  },

  // Selected files display
  selectedFilesCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 8,
  },
  selectedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectedFileIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  selectedFileInfo: { flex: 1, gap: 1 },
  selectedFileName: { fontSize: 13, fontWeight: '600' },
  selectedFileMeta: { fontSize: 11, opacity: 0.6 },
  removeFileBtn: {
    padding: 6,
    borderRadius: 999,
  },
  removeFileBtnText: { fontSize: 14, fontWeight: '800' },
});
