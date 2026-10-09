// ─────────────────────────────────────────────────────────────────────────────
// Book Appointment — 5-Step Wizard (Web Parity)
// Desktop (>= 1024): 2-column layout with sticky booking summary card on the right
// Compact (< 1024): Single column with sticky bottom action bar
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import {
  DimensionValue,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { addDays, format } from 'date-fns';
import { and, eq, inArray } from 'drizzle-orm';
import NetInfo from '@react-native-community/netinfo';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from '@shared/safe';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { SkeletonCard } from '@ui/Skeleton';
import WeeklyDatePicker from 'components/appointments/WeeklyDatePicker';
import TimeSlotPicker from 'components/appointments/TimeSlotPicker';
import { usePatientId } from 'hooks/usePatientId';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
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
import type { ClinicView, ShareableFieldKey } from '../../services/discovery/types';
import type {
  AvailableSlot,
  BookingProviderOption,
  BookingServiceOption,
} from '../../services/appointments/types';
import { dialog } from '@utils/dialog';

type WizardStep = 1 | 2 | 3 | 4 | 5;
type Props = StaticScreenProps<{ clinicId?: string } | undefined>;

function formatPrice(price?: number | null, currency?: string): string {
  if (!price) return 'Free';
  return `${currency ?? 'PHP'} ${price.toFixed(2)}`;
}

const STEP_LABELS: Record<number, string> = {
  1: 'Clinic',
  2: 'Provider',
  3: 'Schedule',
  4: 'Details',
  5: 'Review',
};

function StepIndicator({ step, total }: { step: WizardStep; total: number }) {
  const { colors, radii, sizes } = useAppTheme();
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
                {
                  borderRadius: radii.full,
                  borderWidth: sizes.borderWidth,
                },
                isDone && { backgroundColor: colors.primary, borderColor: colors.primary },
                isCurrent && { borderColor: colors.primary },
                !isDone && !isCurrent && { borderColor: colors.border },
              ]}
            >
              {isDone ? (
                <AppIcon name="check" size={sizes.iconSm - 4} color="onPrimary" />
              ) : (
                <ThemedText
                  variant="captionBold"
                  color={isCurrent ? 'primary' : 'textMuted'}
                >
                  {num}
                </ThemedText>
              )}
            </View>
            <ThemedText
              variant="captionBold"
              color={isCurrent ? 'primary' : 'textMuted'}
              style={stepStyles.label}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { letterSpacing: 0.3, textTransform: 'uppercase' },
});

function ClinicCard({
  clinic, selected, onPress,
}: { clinic: ClinicView; selected: boolean; onPress: () => void }) {
  const { colors, radii, sizes } = useAppTheme();
  const initials = clinic.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed, hovered }: any) => [
        styles.clinicCard,
        {
          borderColor: selected ? colors.primary : hovered ? colors.borderDark : colors.border,
          backgroundColor: selected ? colors.surfaceSubtle : hovered ? colors.surfaceSubtle : colors.card,
          borderRadius: radii.lg,
          borderWidth: sizes.borderWidth,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      {clinic.logoUrl ? (
        <Image source={{ uri: clinic.logoUrl }} style={[styles.clinicLogo, { borderRadius: radii.md }]} />
      ) : (
        <View style={[styles.clinicLogo, styles.clinicLogoFallback, { backgroundColor: colors.primaryDark, borderRadius: radii.md }]}>
          <ThemedText variant="smallBold" color="onPrimary">{initials}</ThemedText>
        </View>
      )}
      <ThemedText variant="smallBold" numberOfLines={2}>{clinic.name}</ThemedText>
      {clinic.address ? (
        <ThemedText variant="caption" color="textSecondary" numberOfLines={2}>
          {clinic.address}
        </ThemedText>
      ) : null}
      {selected && (
        <View style={[styles.clinicSelectedBadge, { backgroundColor: colors.primary, borderRadius: radii.full }]}>
          <AppIcon name="check" size={sizes.iconSm - 4} color="onPrimary" />
        </View>
      )}
    </Pressable>
  );
}

function ServiceChip({
  svc, selected, onPress,
}: { svc: BookingServiceOption; selected: boolean; onPress: () => void }) {
  const { colors, radii, sizes } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ hovered }: any) => [
        styles.serviceChip,
        {
          borderColor: selected ? colors.primary : hovered ? colors.borderDark : colors.border,
          backgroundColor: selected ? colors.surfaceSubtle : hovered ? colors.surfaceSubtle : colors.card,
          borderRadius: radii.md,
          borderWidth: sizes.borderWidth,
        },
      ]}
    >
      <ThemedText variant="smallBold" color={selected ? 'primary' : 'text'}>
        {svc.name}
      </ThemedText>
      <ThemedText variant="caption" color="textSecondary">
        {svc.durationMinutes} min · {formatPrice(svc.price, svc.currency)}
      </ThemedText>
    </Pressable>
  );
}

function ProviderCard({
  prov, selected, onPress,
}: { prov: BookingProviderOption; selected: boolean; onPress: () => void }) {
  const { colors, radii, sizes } = useAppTheme();
  const initials = prov.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed, hovered }: any) => [
        styles.selCard,
        {
          borderColor: selected ? colors.primary : hovered ? colors.borderDark : colors.border,
          backgroundColor: selected ? colors.surfaceSubtle : hovered ? colors.surfaceSubtle : colors.card,
          borderRadius: radii.lg,
          borderWidth: sizes.borderWidth,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      {prov.avatarUrl ? (
        <Image source={{ uri: prov.avatarUrl }} style={[styles.providerAvatar, { borderRadius: radii.full }]} />
      ) : (
        <View style={[styles.providerAvatar, styles.avatarFallback, { backgroundColor: colors.surfaceMuted, borderRadius: radii.full }]}>
          <ThemedText variant="smallBold" color="onPrimary">{initials}</ThemedText>
        </View>
      )}
      <View style={styles.selCardInfo}>
        <ThemedText variant="bodyBold">{prov.name}</ThemedText>
        <ThemedText variant="caption" color="textSecondary">{prov.specialty}</ThemedText>
      </View>
      {selected && <AppIcon name="check" size={sizes.iconMd} color="primary" />}
    </Pressable>
  );
}

function ConsentRow({
  checked, onToggle, label, linkLabel,
}: { checked: boolean; onToggle: () => void; label: string; linkLabel: string }) {
  const { colors, radii, sizes } = useAppTheme();
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
            backgroundColor: checked ? colors.primary : colors.transparent,
            borderRadius: radii.xs,
            borderWidth: sizes.borderWidth,
          },
        ]}
      >
        {checked ? <AppIcon name="check" size={sizes.iconSm - 4} color="onPrimary" /> : null}
      </View>
      <ThemedText variant="small" color="text" style={styles.consentLabel}>
        {label}{' '}
        <ThemedText variant="smallBold" color="primary">{linkLabel}</ThemedText>
      </ThemedText>
    </Pressable>
  );
}

function SummaryRow({
  label, value, last,
}: { label: string; value: string; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.summaryRow,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <ThemedText variant="caption" color="textMuted" style={styles.summaryLabel}>{label}</ThemedText>
      <ThemedText variant="smallBold" color="text" style={styles.summaryValue}>{value}</ThemedText>
    </View>
  );
}

export default function BookingDraftScreenWeb(props: Props) {
  const { colors, spacing, radii, sizes, typography, shadows } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const initialClinicId = props.route?.params?.clinicId;
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { showOfflineAlert } = useOfflineAlert();

  const [step, setStep] = useState<WizardStep>(1);

  // Step 1: Clinic & Service
  const [clinics, setClinics] = useState<ClinicView[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string>(initialClinicId ?? '');
  const [services, setServices] = useState<BookingServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState<BookingServiceOption | null>(null);
  const [isLoadingServices, setIsLoadingServices] = useState(false);

  // Step 2: Provider
  const [providers, setProviders] = useState<BookingProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<BookingProviderOption | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  // Step 3: Schedule
  const [skipSchedule, setSkipSchedule] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Step 4: Details
  const [subject, setSubject] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [notes, setNotes] = useState('');
  const [attachedFileIds, setAttachedFileIds] = useState<string[]>([]);
  const [attachedFileMetas, setAttachedFileMetas] = useState<Array<{ id: string; name: string; sizeBytes: number | null }>>([]);

  // Step 5: Review + Consent + Payment
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await listClinics(patientId, { filter: 'joined' });
        if (mounted) setClinics(list);
      } catch (err) {
        console.warn('[BookingDraftScreenWeb] listClinics error:', err);
      }
    })();
    return () => { mounted = false; };
  }, [patientId]);

  useEffect(() => {
    if (initialClinicId && !selectedClinicId) {
      setSelectedClinicId(initialClinicId);
    }
  }, [initialClinicId, selectedClinicId]);

  useEffect(() => {
    if (!selectedClinicId) return;
    let mounted = true;
    setIsLoadingServices(true);
    setSelectedService(null);
    fetchServiceOptions(selectedClinicId, patientId, getToken)
      .then(s => { if (mounted) setServices(s); })
      .catch(() => dialog.alert('Error', 'Unable to load services.'))
      .finally(() => { if (mounted) setIsLoadingServices(false); });
    return () => { mounted = false; };
  }, [selectedClinicId, patientId, getToken]);

  useEffect(() => {
    if (step !== 2 || !selectedClinicId) return;
    let mounted = true;
    setIsLoadingProviders(true);
    fetchProviderOptions(selectedClinicId, patientId, getToken)
      .then(p => { if (mounted) setProviders(p); })
      .catch(() => dialog.alert('Error', 'Unable to load providers.'))
      .finally(() => { if (mounted) setIsLoadingProviders(false); });
    return () => { mounted = false; };
  }, [step, selectedClinicId, patientId, getToken]);

  useEffect(() => {
    if (step !== 3 || skipSchedule || !selectedClinicId) return;
    let mounted = true;
    setIsLoadingSlots(true);
    setSelectedSlotId(null);
    fetchAvailableSlots(selectedClinicId, selectedProvider?.id ?? '', selectedDate, getToken)
      .then(res => { if (mounted) setSlots(res.slots); })
      .catch(() => dialog.alert('Error', 'Unable to load available slots.'))
      .finally(() => { if (mounted) setIsLoadingSlots(false); });
    return () => { mounted = false; };
  }, [step, selectedClinicId, selectedDate, selectedProvider, skipSchedule, getToken]);

  useFocusEffect(
    useCallback(() => {
      const { ids, updated } = consumeAttachedFileSelection();
      if (updated) {
        setAttachedFileIds(ids);
      }
    }, [])
  );

  useEffect(() => {
    if (!attachedFileIds || attachedFileIds.length === 0) {
      setAttachedFileMetas([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const rows = await db
          .select({ id: filesMetadata.id, name: filesMetadata.name, sizeBytes: filesMetadata.sizeBytes })
          .from(filesMetadata)
          .where(and(eq(filesMetadata.patientId, patientId), inArray(filesMetadata.id, attachedFileIds)));
        if (mounted) {
          setAttachedFileMetas(rows);
        }
      } catch (err) {
        console.warn('[BookingDraftScreenWeb] Failed to load attached file metadata:', err);
      }
    })();
    return () => { mounted = false; };
  }, [attachedFileIds, patientId]);

  useEffect(() => {
    if (!selectedClinicId) return;
    let mounted = true;
    (async () => {
      try {
        const rows = await db
          .select()
          .from(bookingDrafts)
          .where(and(eq(bookingDrafts.patientId, patientId), eq(bookingDrafts.clinicId, selectedClinicId)))
          .limit(1);

        const draft = rows[0];
        if (!draft || !mounted) return;

        if (draft.reason) setSubject(draft.reason);
        if (draft.notes) setNotes(draft.notes);
        if (draft.preferredDate) setSelectedDate(draft.preferredDate);
        if (!draft.preferredDate && !draft.preferredTime) setSkipSchedule(true);
      } catch (err) {
        console.warn('[BookingDraftScreenWeb] Draft preload error:', err);
      }
    })();
    return () => { mounted = false; };
  }, [selectedClinicId, patientId]);

  const selectedClinic = clinics.find(c => c.id === selectedClinicId) ?? null;
  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null;
  const hasPayment = (selectedService?.price ?? 0) > 0;
  const confirmEnabled = consentPrivacy && consentTerms && (!hasPayment || hasPaid) && !isSaving;

  const validateAndNext = () => {
    const errors: Record<string, string> = {};

    if (step === 1) {
      if (!selectedClinicId) errors.clinic = 'Please choose a clinic to continue';
      if (!selectedService) errors.service = 'Please choose a service to continue';
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    if (step === 3) {
      setStep(4);
      return;
    }

    if (step === 4) {
      if (!chiefComplaint.trim()) {
        errors.chiefComplaint = 'Please describe your main reason for the visit';
      }
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      setStep(5);
      return;
    }
  };

  const handleBack = () => {
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep((prev) => (prev - 1) as WizardStep);
    }
  };

  const performSave = async (isDraft: boolean) => {
    if (!selectedClinicId) return;

    if (!isDraft) {
      const errors: Record<string, string> = {};
      if (!consentPrivacy) errors.consentPrivacy = 'Please agree to the privacy policy';
      if (!consentTerms) errors.consentTerms = 'Please agree to the terms and conditions';
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }

    setIsSaving(true);
    if (isDraft) setIsDraftSaving(true);

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      setIsSaving(false);
      setIsDraftSaving(false);
      showOfflineAlert();
      return;
    }

    let consentedShareFields: ShareableFieldKey[] = [];
    try {
      const detail = await getClinicDetail(patientId, selectedClinicId);
      if (detail?.requiredShareFields) {
        consentedShareFields = detail.requiredShareFields;
      }
    } catch {
      // fallback to empty
    }

    const reasonValue = subject.trim() || selectedService?.name || 'General Consultation';
    const notesValue = [
      chiefComplaint.trim() ? `Chief Complaint: ${chiefComplaint.trim()}` : null,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
      selectedProvider ? `Requested Provider: ${selectedProvider.name} (${selectedProvider.specialty})` : null,
      selectedService ? `Service: ${selectedService.name} (${formatPrice(selectedService.price, selectedService.currency)})` : null,
    ].filter(Boolean).join('\n\n');

    const shareFieldsJsonValue = JSON.stringify(consentedShareFields);
    const [serverDraftId, onlineErr] = await safeAwait(createBookingDraftOnline(getToken, patientId, {
      clinicId: selectedClinicId,
      organizationId: null,
      preferredDate: skipSchedule ? null : selectedDate,
      preferredTime: selectedSlot?.time ?? null,
      reason: reasonValue,
      notes: notesValue,
      shareFieldsJson: shareFieldsJsonValue,
      attachedFileIdsJson: JSON.stringify(attachedFileIds),
    }));

    if (onlineErr || !serverDraftId) {
      dialog.alert('Save Failed', onlineErr?.message || 'Unable to sync booking with server.');
      setIsSaving(false);
      setIsDraftSaving(false);
      return;
    }

    if (isDraft) {
      const [, localSaveErr] = await safeAwait(saveBookingDraft(patientId, {
        clinicId: selectedClinicId,
        organizationId: null,
        preferredDate: skipSchedule ? undefined : selectedDate,
        preferredTime: selectedSlot?.time,
        reason: reasonValue,
        notes: notesValue || undefined,
        shareFields: consentedShareFields,
      }, serverDraftId));

      setIsSaving(false);
      setIsDraftSaving(false);

      if (localSaveErr) {
        dialog.alert('Error', 'Unable to save draft locally.');
        return;
      }

      dialog.alert('Draft Saved', 'Your booking has been saved. Continue anytime from the Health tab.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      const [, submitErr] = await safeAwait(submitBookingDraftOnline(getToken, patientId, serverDraftId));
      if (submitErr) {
        dialog.alert('Error', 'Unable to submit booking to clinic.');
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
        shareFields: consentedShareFields,
      }, serverDraftId));

      await safeAwait(db
        .update(bookingDrafts)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(and(eq(bookingDrafts.patientId, patientId), eq(bookingDrafts.clinicId, selectedClinicId))));
      
      setIsSaving(false);
      setIsDraftSaving(false);

      dialog.alert(
        'Booking Requested!',
        'Your appointment request has been submitted successfully to the clinic. You can view it in the Health tab.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    }
  };

  const handlePayment = () => {
    const price = selectedService?.price ?? 0;
    if (price === 0) {
      setHasPaid(true);
      dialog.alert('Confirmed', 'This service is free. Your booking is ready to confirm.');
    } else {
      dialog.alert(
        'Online Payment Coming Soon',
        'Secure payment integration is being set up. Please pay at the clinic on your appointment day.',
        [
          {
            text: 'I will pay at clinic',
            onPress: () => {
              setHasPaid(true);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  };

  const confirmButtonLabel = () => {
    if (isSaving) return 'Saving...';
    if (hasPayment && !hasPaid) return 'Pay & Confirm';
    return 'Confirm Booking';
  };

  // ── Step Content ───────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <ThemedText variant="h2">Select Clinic & Service</ThemedText>
      <ThemedText variant="body" color="textSecondary" style={styles.stepSubtitle}>
        Choose the clinic you wish to visit and the type of appointment you need.
      </ThemedText>

      <View style={styles.fieldGroup}>
        <ThemedText variant="smallBold" color="textSecondary">Clinic *</ThemedText>
        {clinics.length === 0 ? (
          <View style={[styles.emptyContainer, { borderColor: colors.border, borderRadius: radii.lg }]}>
            <ThemedText variant="body" color="textSecondary">
              You haven't joined any clinics yet. Explore clinics to join one and book an appointment.
            </ThemedText>
            <Pressable
              onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' } as any)}
              style={({ pressed, hovered }: any) => [
                styles.exploreBtn,
                {
                  backgroundColor: hovered ? colors.primaryHover : colors.primary,
                  borderRadius: radii.md,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              <ThemedText variant="smallBold" color="onPrimary">Explore Clinics</ThemedText>
            </Pressable>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontalList, { gap: spacing.md }]}>
            {clinics.map((item) => (
              <ClinicCard
                key={item.id}
                clinic={item}
                selected={item.id === selectedClinicId}
                onPress={() => {
                  setSelectedClinicId(item.id);
                  setFieldErrors(prev => ({ ...prev, clinic: '', service: '' }));
                }}
              />
            ))}
          </ScrollView>
        )}
        {fieldErrors.clinic ? (
          <View style={styles.errorRow}>
            <AppIcon name="warning" size={sizes.iconSm} color="emergency" />
            <ThemedText variant="captionBold" color="emergency">{fieldErrors.clinic}</ThemedText>
          </View>
        ) : null}
      </View>

      {selectedClinicId ? (
        <View style={styles.fieldGroup}>
          <ThemedText variant="smallBold" color="textSecondary">Service Type *</ThemedText>
          {isLoadingServices ? (
            <View style={[styles.chipRow, { gap: spacing.sm }]}>
              {[1, 2, 3].map(i => (
                <View key={i} style={[styles.svcChipPlaceholder, { borderColor: colors.border, borderRadius: radii.md }]} />
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizontalList, { gap: spacing.sm }]}>
              {services.map((item) => (
                <ServiceChip
                  key={item.id}
                  svc={item}
                  selected={selectedService?.id === item.id}
                  onPress={() => {
                    setSelectedService(item);
                    setFieldErrors(prev => ({ ...prev, service: '' }));
                  }}
                />
              ))}
            </ScrollView>
          )}
          {fieldErrors.service ? (
            <View style={styles.errorRow}>
              <AppIcon name="warning" size={sizes.iconSm} color="emergency" />
              <ThemedText variant="captionBold" color="emergency">{fieldErrors.service}</ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <ThemedText variant="h2">Healthcare Provider</ThemedText>
      <ThemedText variant="body" color="textSecondary" style={styles.stepSubtitle}>
        Optional — the clinic will assign the right provider if you skip.
      </ThemedText>

      <Pressable
        onPress={() => setSelectedProvider(null)}
        accessibilityRole="button"
        style={({ hovered }: any) => [
          styles.selCard,
          {
            borderColor: selectedProvider === null ? colors.primary : hovered ? colors.borderDark : colors.border,
            backgroundColor: selectedProvider === null ? colors.surfaceSubtle : hovered ? colors.surfaceSubtle : colors.card,
            borderRadius: radii.lg,
            borderWidth: sizes.borderWidth,
          },
        ]}
      >
        <View style={[styles.noPreferenceIcon, { backgroundColor: colors.surfaceSubtle, borderRadius: radii.full }]}>
          <AppIcon name="hospital" size={sizes.iconLg} color="primary" />
        </View>
        <View style={styles.selCardInfo}>
          <ThemedText variant="bodyBold">No preference</ThemedText>
          <ThemedText variant="caption" color="textSecondary">
            Let the clinic assign the right provider
          </ThemedText>
        </View>
        {selectedProvider === null && (
          <AppIcon name="check" size={sizes.iconMd} color="primary" />
        )}
      </Pressable>

      {isLoadingProviders ? (
        <View style={{ gap: spacing.md }}><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <View style={{ gap: spacing.md }}>
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
      <ThemedText variant="h2">Preferred Schedule</ThemedText>
      <ThemedText variant="body" color="textSecondary" style={styles.stepSubtitle}>
        This step is optional. You can let the clinic pick the best time for you.
      </ThemedText>

      <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.lg }]}>
        <View style={styles.toggleInfo}>
          <ThemedText variant="bodyBold">Let clinic schedule me</ThemedText>
          <ThemedText variant="caption" color="textSecondary">
            The clinic will contact you to confirm a time
          </ThemedText>
        </View>
        <Switch
          value={skipSchedule}
          onValueChange={setSkipSchedule}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      {!skipSchedule ? (
        <>
          <View style={[styles.datePickerCard, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.lg }]}>
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
        <View style={[styles.skipInfo, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.lg }]}>
          <AppIcon name="calendar" size={sizes.iconLg} color="primary" />
          <ThemedText variant="body" color="textSecondary" style={styles.skipInfoText}>
            The clinic will reach out to confirm a convenient schedule with you.
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <ThemedText variant="h2">Visit Details</ThemedText>
      <ThemedText variant="body" color="textSecondary" style={styles.stepSubtitle}>
        Tell the clinic about your visit so they can prepare.
      </ThemedText>

      <View style={styles.fieldGroup}>
        <ThemedText variant="smallBold" color="textSecondary">Subject (optional)</ThemedText>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. For my child, Annual PE, Follow-up on CBC..."
          placeholderTextColor={colors.textMuted}
          style={[typography.body, styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, borderRadius: radii.md }]}
          accessibilityLabel="Subject"
        />
      </View>

      <View style={styles.fieldGroup}>
        <ThemedText variant="smallBold" color="textSecondary">Chief Complaint *</ThemedText>
        <TextInput
          value={chiefComplaint}
          onChangeText={v => {
            setChiefComplaint(v);
            if (v.trim()) setFieldErrors(prev => ({ ...prev, chiefComplaint: '' }));
          }}
          placeholder="Describe your main concern or reason for the visit in detail..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          style={[
            typography.body,
            styles.textArea,
            {
              borderColor: fieldErrors.chiefComplaint
                ? colors.emergency
                : chiefComplaint.trim() ? colors.primary : colors.border,
              color: colors.text,
              backgroundColor: colors.card,
              borderRadius: radii.md,
            },
          ]}
          accessibilityLabel="Chief complaint"
        />
        {fieldErrors.chiefComplaint ? (
          <View style={styles.errorRow}>
            <AppIcon name="warning" size={sizes.iconSm} color="emergency" />
            <ThemedText variant="captionBold" color="emergency">{fieldErrors.chiefComplaint}</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.fieldGroup}>
        <ThemedText variant="smallBold" color="textSecondary">Additional Notes (optional)</ThemedText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any other information the clinic should know..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          style={[typography.body, styles.textArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card, borderRadius: radii.md }]}
        />
      </View>

      <View style={styles.fieldGroup}>
        <ThemedText variant="smallBold" color="textSecondary">Attach Files (optional)</ThemedText>
        <ThemedText variant="caption" color="textMuted">
          Share relevant documents (lab results, prescriptions) with the clinic.
        </ThemedText>

        {attachedFileMetas.length > 0 ? (
          <View style={[styles.selectedFilesCard, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.md }]}>
            {attachedFileMetas.map(f => (
              <View key={f.id} style={[styles.selectedFileRow, { borderBottomColor: colors.border }]}>
                <AppIcon name="document" size={sizes.iconMd} color="textMuted" />
                <View style={styles.selectedFileInfo}>
                  <ThemedText variant="smallBold" numberOfLines={1}>{f.name}</ThemedText>
                  {f.sizeBytes ? (
                    <ThemedText variant="caption" color="textMuted">
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
                  <AppIcon name="close" size={sizes.iconSm} color="emergency" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.attachRow}>
          <Pressable
            onPress={() => navigation.navigate('Main', { screen: 'AttachFilesScreen' })}
            style={({ hovered }: any) => [
              styles.attachBtn,
              {
                borderColor: hovered ? colors.primaryHover : colors.primary,
                backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                borderRadius: radii.full,
              },
            ]}
            accessibilityRole="button"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <AppIcon name="folder" size={sizes.iconSm} color="primary" />
              <ThemedText variant="smallBold" color="primary">
                {attachedFileIds.length > 0 ? `Change Selection (${attachedFileIds.length})` : 'Select from My Files'}
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <ThemedText variant="h2">Review & Confirm</ThemedText>
      <ThemedText variant="body" color="textSecondary" style={styles.stepSubtitle}>
        Review your booking details below.
      </ThemedText>

      <View style={[styles.summaryCard, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
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

      {hasPayment ? (
        <View style={[styles.paymentNotice, { borderColor: colors.warningBorder, backgroundColor: colors.warningBg, borderRadius: radii.lg }]}>
          <View style={styles.paymentNoticeLeft}>
            <AppIcon name="badge" size={sizes.iconLg} color="warning" />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <ThemedText variant="smallBold" color="warningText">
              Payment Required Before Confirming
            </ThemedText>
            <ThemedText variant="caption" color="text">
              {formatPrice(selectedService?.price, selectedService?.currency)} is required to confirm this booking. Non-payment within 24 hours of confirmation will cancel the appointment.
            </ThemedText>
            {hasPaid ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }}>
                <AppIcon name="checkCircle" size={sizes.iconSm} color="success" />
                <ThemedText variant="captionBold" color="success">Payment received</ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={handlePayment}
                style={({ hovered }: any) => [
                  styles.payNowInlineBtn,
                  {
                    backgroundColor: hovered ? colors.successText : colors.success,
                    borderRadius: radii.full,
                  },
                ]}
                accessibilityRole="button"
              >
                <ThemedText variant="smallBold" color="onPrimary">
                  Pay {formatPrice(selectedService?.price, selectedService?.currency)} Now
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}

      <View style={[styles.consentCard, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.lg }]}>
        <ThemedText variant="captionBold" color="textMuted" style={styles.consentCardTitle}>
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
            <AppIcon name="warning" size={sizes.iconSm} color="emergency" />
            <ThemedText variant="captionBold" color="emergency">{fieldErrors.consentPrivacy}</ThemedText>
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
            <AppIcon name="warning" size={sizes.iconSm} color="emergency" />
            <ThemedText variant="captionBold" color="emergency">{fieldErrors.consentTerms}</ThemedText>
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

  // Sticky Desktop Summary Card
  const StickyBookingSummaryCard = () => (
    <View
      style={[
        styles.stickySummaryCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: radii.xl,
          borderWidth: sizes.borderWidth,
          padding: spacing.xl,
          gap: spacing.lg,
        },
        shadows.sm,
      ]}
    >
      <View style={{ gap: spacing.xs }}>
        <ThemedText variant="title">Booking Summary</ThemedText>
        <ThemedText variant="caption" color="textMuted">Step {step} of 5 — {STEP_LABELS[step]}</ThemedText>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={{ gap: spacing.sm }}>
        <View style={styles.summaryItem}>
          <ThemedText variant="caption" color="textMuted">Clinic</ThemedText>
          <ThemedText variant="smallBold" color="text" numberOfLines={1}>{selectedClinic?.name ?? 'Not chosen'}</ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText variant="caption" color="textMuted">Service</ThemedText>
          <ThemedText variant="smallBold" color="text">{selectedService ? `${selectedService.name} (${formatPrice(selectedService.price, selectedService.currency)})` : 'Not chosen'}</ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText variant="caption" color="textMuted">Provider</ThemedText>
          <ThemedText variant="smallBold" color="text">{selectedProvider?.name ?? 'Clinic assigned'}</ThemedText>
        </View>
        <View style={styles.summaryItem}>
          <ThemedText variant="caption" color="textMuted">Schedule</ThemedText>
          <ThemedText variant="smallBold" color="text">
            {skipSchedule ? 'Clinic will propose' : `${selectedDate} ${selectedSlot?.displayTime ?? ''}`.trim() || 'Pending selection'}
          </ThemedText>
        </View>
        {attachedFileIds.length > 0 ? (
          <View style={styles.summaryItem}>
            <ThemedText variant="caption" color="textMuted">Files attached</ThemedText>
            <ThemedText variant="smallBold" color="primary">{attachedFileIds.length} document(s)</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Action Buttons in Sticky Card */}
      <View style={{ gap: spacing.sm }}>
        {step < 5 ? (
          <Pressable
            onPress={validateAndNext}
            style={({ pressed, hovered }: any) => [
              styles.primaryBtn,
              {
                backgroundColor: hovered ? colors.primaryHover : colors.primary,
                borderRadius: radii.md,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <ThemedText variant="bodyBold" color="onPrimary">Continue</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => performSave(false)}
            disabled={!confirmEnabled}
            style={({ pressed, hovered }: any) => [
              styles.primaryBtn,
              {
                backgroundColor: hasPaid || !hasPayment ? (hovered ? colors.successText : colors.success) : (hovered ? colors.warningText : colors.warning),
                borderRadius: radii.md,
                opacity: confirmEnabled ? (pressed ? 0.8 : 1) : 0.5,
              },
            ]}
            accessibilityRole="button"
          >
            <ThemedText variant="bodyBold" color="onPrimary">{confirmButtonLabel()}</ThemedText>
          </Pressable>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={handleBack}
            style={({ pressed, hovered }: any) => [
              styles.backBtnWeb,
              {
                borderColor: hovered ? colors.borderDark : colors.border,
                backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                borderRadius: radii.md,
                borderWidth: sizes.borderWidth,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <ThemedText variant="smallBold" color="text">{step === 1 ? 'Cancel' : 'Back'}</ThemedText>
          </Pressable>

          {step === 5 ? (
            <Pressable
              onPress={() => performSave(true)}
              disabled={isDraftSaving || !chiefComplaint.trim()}
              style={({ pressed, hovered }: any) => [
                styles.draftBtnWeb,
                {
                  borderColor: hovered ? colors.successBorder : colors.success,
                  backgroundColor: hovered ? colors.successBg : colors.transparent,
                  borderRadius: radii.md,
                  borderWidth: sizes.borderWidth,
                  opacity: chiefComplaint.trim() ? (pressed ? 0.8 : 1) : 0.4,
                },
              ]}
              accessibilityRole="button"
            >
              <ThemedText variant="smallBold" color="success">
                {isDraftSaving ? 'Saving...' : 'Save Draft'}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StepIndicator step={step} total={5} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isDesktop ? spacing['4xl'] : 110, paddingHorizontal: spacing.xl },
        ]}
      >
        <View style={[styles.bodyLayout, isDesktop ? styles.desktopRow : styles.singleColumn, { gap: spacing.xl }]}>
          {/* Left Column: Step Content */}
          <View style={styles.leftColumn}>
            {renderStep()}
          </View>

          {/* Right Column: Sticky Summary Card (Desktop only) */}
          {isDesktop ? (
            <View style={styles.rightColumn}>
              <View style={styles.stickyWrapper}>
                <StickyBookingSummaryCard />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Bar (Compact screens only) */}
      {!isDesktop ? (
        <View
          style={[
            styles.bottomNav,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.card,
              paddingBottom: spacing.lg,
              borderTopWidth: sizes.borderWidth,
            },
            shadows.md,
          ]}
        >
          <Pressable
            onPress={handleBack}
            style={({ pressed, hovered }: any) => [
              styles.backBtn,
              {
                borderColor: hovered ? colors.urgentText : colors.urgent,
                borderRadius: radii.full,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? 'Cancel' : 'Back'}
          >
            <AppIcon name={step === 1 ? 'close' : 'back'} size={sizes.iconMd} color="urgent" />
          </Pressable>

          {step === 5 ? (
            <Pressable
              onPress={() => performSave(true)}
              disabled={isDraftSaving || !chiefComplaint.trim()}
              style={({ pressed, hovered }: any) => [
                styles.draftBtn,
                {
                  borderColor: hovered ? colors.successBorder : colors.success,
                  borderRadius: radii.full,
                  opacity: chiefComplaint.trim() ? (pressed ? 0.8 : 1) : 0.4,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save Draft"
            >
              {isDraftSaving ? (
                <ThemedText variant="captionBold" color="success">...</ThemedText>
              ) : (
                <AppIcon name="archive" size={sizes.iconMd} color="success" />
              )}
            </Pressable>
          ) : null}

          {step < 5 ? (
            <Pressable
              onPress={validateAndNext}
              style={({ pressed, hovered }: any) => [
                styles.primaryBtn,
                {
                  backgroundColor: hovered ? colors.primaryHover : colors.primary,
                  borderRadius: radii.full,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              <ThemedText variant="bodyBold" color="onPrimary">Continue</ThemedText>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => performSave(false)}
              disabled={!confirmEnabled}
              style={({ pressed, hovered }: any) => [
                styles.primaryBtn,
                {
                  backgroundColor: hasPaid || !hasPayment ? (hovered ? colors.successText : colors.success) : (hovered ? colors.warningText : colors.warning),
                  borderRadius: radii.full,
                  opacity: confirmEnabled ? (pressed ? 0.8 : 1) : 0.5,
                },
              ]}
              accessibilityRole="button"
            >
              <ThemedText variant="bodyBold" color="onPrimary">{confirmButtonLabel()}</ThemedText>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%' },
  scrollContent: { width: '100%', paddingTop: 8 },
  bodyLayout: { width: '100%' },
  desktopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  singleColumn: {
    flexDirection: 'column',
  },
  leftColumn: {
    flex: 1,
    minWidth: 0,
  },
  rightColumn: {
    width: 360,
    minWidth: 320,
  },
  stickyWrapper: {
    position: 'sticky' as any,
    top: 24,
  },
  stickySummaryCard: {},
  summaryItem: {
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  stepContent: { gap: 20 },
  stepSubtitle: { marginTop: -12 },
  fieldGroup: { gap: 8 },
  emptyContainer: {
    padding: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 10,
  },
  exploreBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalList: { paddingHorizontal: 0 },
  clinicCard: {
    width: 230,
    padding: 14,
    gap: 6,
    position: 'relative',
  },
  clinicLogo: { width: 40, height: 40 },
  clinicLogoFallback: { alignItems: 'center', justifyContent: 'center' },
  clinicSelectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  serviceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
    minWidth: 130,
  },
  svcChipPlaceholder: {
    width: 120,
    height: 58,
    borderWidth: 1,
  },
  selCard: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selCardInfo: { flex: 1, gap: 2 },
  noPreferenceIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  providerAvatar: { width: 44, height: 44 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  toggleInfo: { flex: 1, gap: 2 },
  datePickerCard: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  skipInfo: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  skipInfoText: { flex: 1 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  summaryCard: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  summaryLabel: { flex: 0.38, marginTop: 1 },
  summaryValue: { flex: 0.62, textAlign: 'right' },
  paymentNotice: {
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  paymentNoticeLeft: {},
  payNowInlineBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  consentCard: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  consentCardTitle: { textTransform: 'uppercase', letterSpacing: 0.5 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  consentLabel: { flex: 1 },
  bottomNav: {
    position: 'sticky' as any,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  backBtn: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnWeb: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBtn: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBtnWeb: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
    paddingHorizontal: 2,
  },
  selectedFilesCard: {
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
  selectedFileInfo: { flex: 1, gap: 1 },
  removeFileBtn: {
    padding: 6,
  },
});
