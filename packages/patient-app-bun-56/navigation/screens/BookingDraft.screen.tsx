import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, format } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { SkeletonCard } from '@ui/Skeleton';
import WeeklyDatePicker from 'components/appointments/WeeklyDatePicker';
import TimeSlotPicker from 'components/appointments/TimeSlotPicker';
import { usePatientId } from 'hooks/usePatientId';
import { listClinics, saveBookingDraft } from '../../services/discovery/discoveryService';
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

type WizardStep = 1 | 2 | 3 | 4;

type Props = StaticScreenProps<{ clinicId?: string } | undefined>;

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: WizardStep; total: number }) {
    const { colors } = useTheme();
    const labels = ['Concern', 'Provider', 'Schedule', 'Review'];
    return (
        <View style={stepStyles.container}>
            {Array.from({ length: total }, (_, i) => {
                const num = i + 1;
                const isDone = num < step;
                const isCurrent = num === step;
                return (
                    <View key={i} style={stepStyles.stepItem}>
                        <View style={[
                            stepStyles.circle,
                            isDone && { backgroundColor: colors.primary, borderColor: colors.primary },
                            isCurrent && { borderColor: colors.primary },
                            !isDone && !isCurrent && { borderColor: colors.border },
                        ]}>
                            {isDone
                                ? <ThemedText style={stepStyles.circleTextDone}>✓</ThemedText>
                                : <ThemedText style={[stepStyles.circleText, isCurrent && { color: colors.primary }]}>{num}</ThemedText>
                            }
                        </View>
                        <ThemedText style={[
                            stepStyles.stepLabel,
                            { color: isCurrent ? colors.primary : colors.text },
                            isCurrent && { fontWeight: '700' },
                        ]}>
                            {labels[i]}
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
        paddingVertical: 16,
        paddingHorizontal: 8,
        gap: 4,
    },
    stepItem: { alignItems: 'center', flex: 1, gap: 4 },
    circle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleText: { fontSize: 13, fontWeight: '700' },
    circleTextDone: { color: '#fff', fontSize: 13, fontWeight: '800' },
    stepLabel: { fontSize: 10, fontWeight: '600', opacity: 0.8 },
});

// ── Clinic card ───────────────────────────────────────────────────────────────

function ClinicCard({
    clinic,
    selected,
    onPress,
}: { clinic: ClinicView; selected: boolean; onPress: () => void }) {
    const { colors } = useTheme();
    const initials = clinic.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
                styles.selectionCard,
                {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary + '12' : colors.card,
                    opacity: pressed ? 0.8 : 1,
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
            <View style={styles.selectionCardInfo}>
                <ThemedText style={styles.selectionCardTitle}>{clinic.name}</ThemedText>
                {clinic.address ? (
                    <ThemedText style={[styles.selectionCardSub, { color: colors.text }]} numberOfLines={1}>
                        {clinic.address}
                    </ThemedText>
                ) : null}
            </View>
            {selected && <ThemedText style={[styles.check, { color: colors.primary }]}>✓</ThemedText>}
        </Pressable>
    );
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
    prov,
    selected,
    onPress,
}: { prov: BookingProviderOption; selected: boolean; onPress: () => void }) {
    const { colors } = useTheme();
    const initials = prov.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
                styles.selectionCard,
                {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary + '12' : colors.card,
                    opacity: pressed ? 0.8 : 1,
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
            <View style={styles.selectionCardInfo}>
                <ThemedText style={styles.selectionCardTitle}>{prov.name}</ThemedText>
                <ThemedText style={[styles.selectionCardSub, { color: colors.text }]}>{prov.specialty}</ThemedText>
            </View>
            {selected && <ThemedText style={[styles.check, { color: colors.primary }]}>✓</ThemedText>}
        </Pressable>
    );
}

// ── Service chip ──────────────────────────────────────────────────────────────

function ServiceChip({
    svc,
    selected,
    onPress,
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
                    backgroundColor: selected ? colors.primary + '12' : colors.card,
                },
            ]}
        >
            <ThemedText style={[styles.serviceChipTitle, selected && { color: colors.primary }]}>
                {svc.name}
            </ThemedText>
            <ThemedText style={[styles.serviceChipDuration, { color: colors.text }]}>
                {svc.durationMinutes} min
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
            <ThemedText style={styles.summaryValue} numberOfLines={2}>{value}</ThemedText>
        </View>
    );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function BookingDraftScreen({ route }: Props) {
    const { colors } = useTheme();
    const navigation = useNavigation();
    const patientId = usePatientId();
    const insets = useSafeAreaInsets();
    const initialClinicId = route.params?.clinicId ?? '';

    const [step, setStep] = useState<WizardStep>(1);

    // Step 1 — Concern
    const [clinics, setClinics] = useState<ClinicView[]>([]);
    const [selectedClinicId, setSelectedClinicId] = useState(initialClinicId);
    const [services, setServices] = useState<BookingServiceOption[]>([]);
    const [selectedService, setSelectedService] = useState<BookingServiceOption | null>(null);
    const [chiefComplaint, setChiefComplaint] = useState('');
    const [isLoadingServices, setIsLoadingServices] = useState(false);

    // Step 2 — Provider
    const [providers, setProviders] = useState<BookingProviderOption[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<BookingProviderOption | null>(null);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);

    // Step 3 — Schedule
    const [selectedDate, setSelectedDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    const [slots, setSlots] = useState<AvailableSlot[]>([]);
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    // Step 4 — Notes
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Load joined clinics on mount
    useEffect(() => {
        let mounted = true;
        listClinics(patientId, { filter: 'joined' })
            .then(items => {
                if (!mounted) return;
                setClinics(items);
                if (!selectedClinicId && items.length > 0) setSelectedClinicId(items[0].id);
            })
            .catch(() => Alert.alert('Error', 'Unable to load your clinics.'));
        return () => { mounted = false; };
    }, [patientId]);

    // Auto-advance to step 1 with pre-selected clinic (skip clinic selection)
    useEffect(() => {
        if (initialClinicId && step === 1 && clinics.length > 0) {
            loadServicesFor(initialClinicId);
        }
    }, [initialClinicId, clinics]);

    // Load services when step 1 advances
    useEffect(() => {
        if (step !== 1 || !selectedClinicId) return;
        loadServicesFor(selectedClinicId);
    }, [selectedClinicId]);

    function loadServicesFor(clinicId: string) {
        let mounted = true;
        setIsLoadingServices(true);
        fetchServiceOptions(clinicId)
            .then(s => { if (mounted) setServices(s); })
            .catch(() => Alert.alert('Error', 'Unable to load services.'))
            .finally(() => { if (mounted) setIsLoadingServices(false); });
        return () => { mounted = false; };
    }

    // Load providers when step 2 activates
    useEffect(() => {
        if (step !== 2 || !selectedClinicId) return;
        let mounted = true;
        setIsLoadingProviders(true);
        fetchProviderOptions(selectedClinicId)
            .then(p => { if (mounted) setProviders(p); })
            .catch(() => Alert.alert('Error', 'Unable to load providers.'))
            .finally(() => { if (mounted) setIsLoadingProviders(false); });
        return () => { mounted = false; };
    }, [step, selectedClinicId]);

    // Load available slots when step 3 activates or date changes
    useEffect(() => {
        if (step !== 3 || !selectedClinicId) return;
        let mounted = true;
        setIsLoadingSlots(true);
        setSelectedSlotId(null);
        fetchAvailableSlots(selectedClinicId, selectedDate)
            .then(res => { if (mounted) setSlots(res.slots); })
            .catch(() => Alert.alert('Error', 'Unable to load available slots.'))
            .finally(() => { if (mounted) setIsLoadingSlots(false); });
        return () => { mounted = false; };
    }, [step, selectedClinicId, selectedDate]);

    const handleBack = () => {
        if (step === 1) { navigation.goBack(); return; }
        setStep(s => (s - 1) as WizardStep);
    };

    const handleNext = () => {
        if (step < 4) setStep(s => (s + 1) as WizardStep);
    };

    const handleConfirm = async () => {
        const selectedSlot = slots.find(s => s.id === selectedSlotId);
        if (!selectedSlotId || !selectedSlot) {
            Alert.alert('Select a time', 'Please choose an available time slot.');
            return;
        }
        if (!selectedService) {
            Alert.alert('Select a service', 'Please choose a service type.');
            return;
        }
        if (!chiefComplaint.trim()) {
            Alert.alert('Chief Complaint', "Please describe your main concern or reason for the visit.");
            return;
        }

        setIsSaving(true);
        try {
            await saveBookingDraft(patientId, {
                clinicId: selectedClinicId,
                organizationId: null,
                preferredDate: selectedDate,
                preferredTime: selectedSlot.time,
                reason: chiefComplaint.trim(),
                notes: notes.trim() || undefined,
                shareFields: [],
            });
            Alert.alert(
                'Booking Requested',
                'Your appointment request has been saved. The clinic will confirm shortly.',
                [{ text: 'Done', onPress: () => navigation.goBack() }],
            );
        } catch {
            Alert.alert('Error', 'Unable to save booking. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const selectedClinic = clinics.find(c => c.id === selectedClinicId);
    const selectedSlot = slots.find(s => s.id === selectedSlotId);

    const canContinue =
        step === 1 ? Boolean(selectedClinicId && selectedService && chiefComplaint.trim()) :
        step === 2 ? true : // provider is optional
        step === 3 ? Boolean(selectedSlotId) :
        true;

    // ── Step renderers ────────────────────────────────────────────────────────

    const renderStep1 = () => (
        <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>What brings you in?</ThemedText>
            <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
                Tell us your main concern and choose a service type.
            </ThemedText>

            {/* Chief complaint */}
            <View style={styles.fieldGroup}>
                <ThemedText style={styles.fieldLabel}>Chief Complaint *</ThemedText>
                <TextInput
                    value={chiefComplaint}
                    onChangeText={setChiefComplaint}
                    placeholder="e.g. Persistent headache, annual check-up, follow-up on lab results..."
                    placeholderTextColor={colors.text + '60'}
                    multiline
                    numberOfLines={3}
                    style={[
                        styles.textArea,
                        { borderColor: chiefComplaint.trim() ? colors.primary : colors.border, color: colors.text, backgroundColor: colors.card },
                    ]}
                    accessibilityLabel="Chief complaint"
                />
            </View>

            {/* Service type */}
            <View style={styles.fieldGroup}>
                <ThemedText style={styles.fieldLabel}>Service Type *</ThemedText>
                {isLoadingServices ? (
                    <View style={styles.chipRow}>
                        {[1, 2, 3].map(i => (
                            <View key={i} style={[styles.serviceChipPlaceholder, { borderColor: colors.border }]} />
                        ))}
                    </View>
                ) : (
                    <View style={styles.chipRow}>
                        {services.map(s => (
                            <ServiceChip
                                key={s.id}
                                svc={s}
                                selected={selectedService?.id === s.id}
                                onPress={() => setSelectedService(s)}
                            />
                        ))}
                    </View>
                )}
            </View>

            {/* Clinic — shown when no pre-selected clinic */}
            {!initialClinicId && (
                <View style={styles.fieldGroup}>
                    <ThemedText style={styles.fieldLabel}>Clinic *</ThemedText>
                    {clinics.length === 0 ? (
                        <ThemedText style={[styles.emptyHint, { color: colors.text }]}>
                            You haven't joined any clinics yet. Explore clinics to get started.
                        </ThemedText>
                    ) : (
                        <View style={styles.listGap}>
                            {clinics.map(c => (
                                <ClinicCard
                                    key={c.id}
                                    clinic={c}
                                    selected={c.id === selectedClinicId}
                                    onPress={() => setSelectedClinicId(c.id)}
                                />
                            ))}
                        </View>
                    )}
                </View>
            )}
        </View>
    );

    const renderStep2 = () => (
        <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>Choose a Provider</ThemedText>
            <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
                Select a healthcare professional, or skip to let the clinic assign one.
            </ThemedText>
            {isLoadingProviders ? (
                <View style={styles.listGap}><SkeletonCard /><SkeletonCard /></View>
            ) : (
                <View style={styles.listGap}>
                    {providers.map(p => (
                        <ProviderCard
                            key={p.id}
                            prov={p}
                            selected={selectedProvider?.id === p.id}
                            onPress={() => setSelectedProvider(
                                selectedProvider?.id === p.id ? null : p
                            )}
                        />
                    ))}
                </View>
            )}
        </View>
    );

    const renderStep3 = () => (
        <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>When are you available?</ThemedText>
            <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
                Pick a date and time that works for you.
            </ThemedText>
            <View style={[styles.datePickerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <WeeklyDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            </View>
            <TimeSlotPicker
                slots={slots}
                selectedSlotId={selectedSlotId}
                onSelectSlot={setSelectedSlotId}
                isLoading={isLoadingSlots}
            />
        </View>
    );

    const renderStep4 = () => (
        <View style={styles.stepContent}>
            <ThemedText style={styles.stepTitle}>Review & Confirm</ThemedText>
            <ThemedText style={[styles.stepSubtitle, { color: colors.text }]}>
                Please review your booking details before confirming.
            </ThemedText>

            {/* Summary card */}
            <View style={[styles.summaryCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <SummaryRow label="Clinic" value={selectedClinic?.name ?? '—'} />
                <SummaryRow label="Chief Complaint" value={chiefComplaint || '—'} />
                <SummaryRow label="Service" value={selectedService?.name ?? '—'} />
                <SummaryRow label="Provider" value={selectedProvider?.name ?? 'Clinic assigned'} />
                <SummaryRow
                    label="Date"
                    value={(() => {
                        try { return format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy'); }
                        catch { return selectedDate; }
                    })()}
                />
                <SummaryRow label="Time" value={selectedSlot?.displayTime ?? '—'} last />
            </View>

            {/* Additional notes */}
            <View style={styles.fieldGroup}>
                <ThemedText style={styles.fieldLabel}>Additional Notes (optional)</ThemedText>
                <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Any other information for the clinic..."
                    placeholderTextColor={colors.text + '60'}
                    multiline
                    numberOfLines={3}
                    style={[
                        styles.textArea,
                        { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
                    ]}
                />
            </View>
        </View>
    );

    const renderStep = () => {
        switch (step) {
            case 1: return renderStep1();
            case 2: return renderStep2();
            case 3: return renderStep3();
            case 4: return renderStep4();
        }
    };

    return (
        <ThemedView style={styles.screen}>
            <StepIndicator step={step} total={4} />

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
            >
                {renderStep()}
            </ScrollView>

            {/* Sticky bottom nav */}
            <View
                style={[
                    styles.bottomNav,
                    { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: insets.bottom + 12 },
                ]}
            >
                <Pressable
                    onPress={handleBack}
                    style={[styles.backBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                >
                    <ThemedText style={[styles.backBtnText, { color: colors.text }]}>
                        {step === 1 ? 'Cancel' : 'Back'}
                    </ThemedText>
                </Pressable>

                {step === 2 ? (
                    <Pressable
                        onPress={handleNext}
                        style={[styles.skipBtn, { borderColor: colors.border }]}
                        accessibilityRole="button"
                    >
                        <ThemedText style={[styles.skipBtnText, { color: colors.text }]}>Skip</ThemedText>
                    </Pressable>
                ) : null}

                {step < 4 ? (
                    <Pressable
                        onPress={handleNext}
                        disabled={!canContinue}
                        style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: canContinue ? 1 : 0.4 }]}
                        accessibilityRole="button"
                    >
                        <ThemedText style={styles.primaryBtnText}>Continue</ThemedText>
                    </Pressable>
                ) : (
                    <Pressable
                        onPress={handleConfirm}
                        disabled={isSaving}
                        style={[styles.primaryBtn, { backgroundColor: '#10B981', opacity: isSaving ? 0.6 : 1 }]}
                        accessibilityRole="button"
                    >
                        <ThemedText style={styles.primaryBtnText}>
                            {isSaving ? 'Saving...' : 'Confirm Booking'}
                        </ThemedText>
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
    stepTitle: { fontSize: 24, fontWeight: '800' },
    stepSubtitle: { fontSize: 14, lineHeight: 20, opacity: 0.7, marginTop: -12 },
    fieldGroup: { gap: 8 },
    fieldLabel: { fontSize: 13, fontWeight: '700', opacity: 0.65 },
    emptyHint: { fontSize: 14, opacity: 0.6, lineHeight: 20 },
    listGap: { gap: 10 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    serviceChip: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1.5,
        gap: 2,
    },
    serviceChipTitle: { fontSize: 13, fontWeight: '700' },
    serviceChipDuration: { fontSize: 11, opacity: 0.6 },
    serviceChipPlaceholder: {
        width: 100,
        height: 52,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: 'rgba(148,163,184,0.12)',
    },
    selectionCard: {
        borderRadius: 16,
        borderWidth: 1.5,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    selectionCardInfo: { flex: 1, gap: 2 },
    selectionCardTitle: { fontSize: 15, fontWeight: '700' },
    selectionCardSub: { fontSize: 12, opacity: 0.7 },
    check: { fontSize: 18, fontWeight: '800' },
    clinicLogo: { width: 44, height: 44, borderRadius: 10 },
    clinicLogoFallback: { backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' },
    clinicLogoInitials: { color: '#fff', fontSize: 14, fontWeight: '800' },
    providerAvatar: { width: 44, height: 44, borderRadius: 22 },
    avatarFallback: { backgroundColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
    avatarInitials: { color: '#fff', fontSize: 14, fontWeight: '800' },
    datePickerCard: {
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    summaryCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 12,
    },
    summaryLabel: { fontSize: 12, fontWeight: '600', opacity: 0.6, flex: 0.4, marginTop: 1 },
    summaryValue: { fontSize: 14, fontWeight: '700', flex: 0.6, textAlign: 'right' },
    textArea: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 14,
        minHeight: 88,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        textAlignVertical: 'top',
        lineHeight: 20,
    },
    bottomNav: {
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 8,
    },
    backBtn: {
        paddingHorizontal: 18,
        paddingVertical: 13,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backBtnText: { fontSize: 14, fontWeight: '600' },
    skipBtn: {
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    skipBtnText: { fontSize: 14, fontWeight: '600' },
    primaryBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
