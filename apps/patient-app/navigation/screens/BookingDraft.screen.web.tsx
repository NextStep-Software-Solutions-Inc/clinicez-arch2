import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { format, startOfToday } from 'date-fns';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { safeAwait } from '@shared/safe';
import { SkeletonCard } from '../../components/ui/Skeleton';
import HomeOfflinePillBanner from '../../components/home/HomeOfflinePillBanner';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { usePatientId } from '../../hooks/usePatientId';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useNetworkOnline } from '../../hooks/useNetworkOnline';
import { dialog } from '../../utils/dialog';
import {
  createBookingDraftOnline,
  getClinicDetail,
  saveBookingDraft,
  submitBookingDraftOnline,
} from '../../services/discovery/discoveryService';
import type { ShareableFieldKey } from '../../services/discovery/types';
import { fetchAvailableSlots } from '../../services/appointments/appointmentsService';
import { queryPatientSearchCatalog } from '../../services/search/patientSearchService';
import type {
  PatientSearchClinicDto,
  PatientSearchDoctorDto,
  PatientSearchServiceDto,
} from '../../services/api/homeApi';
import type { AvailableSlot } from '../../services/appointments/types';
import BookingSeamlessHeader from '../../components/booking/BookingSeamlessHeader';
import BookingStickyFooter from '../../components/booking/BookingStickyFooter';
import BookingStepIndicator, {
  type BookingStep,
} from '../../components/booking/BookingStepIndicator';
import BookingDoctorStep from '../../components/booking/BookingDoctorStep';
import BookingSlotStep, {
  type ConsultationMode,
} from '../../components/booking/BookingSlotStep';
import BookingReviewStep from '../../components/booking/BookingReviewStep';
import BookingConfirmationStep from '../../components/booking/BookingConfirmationStep';

type BookingRouteParams =
  | { clinicId?: string; providerId?: string; serviceId?: string; reason?: string }
  | undefined;

type Props = StaticScreenProps<BookingRouteParams>;

const NO_OP = () => {};

function formatSlotSummary(
  slot: AvailableSlot | null,
  date: Date,
  doctorName?: string,
): string | null {
  if (!slot) return null;
  const dateStr = format(date, 'EEE, MMM d');
  const timeStr = slot.displayTime || slot.time;
  return doctorName ? `${dateStr} at ${timeStr} • ${doctorName}` : `${dateStr} at ${timeStr}`;
}

export default function BookingDraftScreenWeb(props: Props) {
  const { colors, spacing } = useClinicalEmpathyTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { user } = useUser();
  const { isDesktop, width } = useBreakpoint();
  const { isOnline } = useNetworkOnline();
  const isWorkstation = isDesktop || width >= 768;

  const routeParams = (route.params ?? props.route?.params) as BookingRouteParams;
  const initialClinicId = routeParams?.clinicId;
  const initialProviderId = routeParams?.providerId;
  const initialServiceId = routeParams?.serviceId;
  const initialReason = routeParams?.reason;

  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(
    initialProviderId ? 2 : 1,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [doctors, setDoctors] = useState<PatientSearchDoctorDto[]>([]);
  const [clinics, setClinics] = useState<PatientSearchClinicDto[]>([]);
  const [services, setServices] = useState<PatientSearchServiceDto[]>([]);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | undefined>(
    initialProviderId,
  );
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [consultationMode, setConsultationMode] =
    useState<ConsultationMode>('in_person');
  const [reasonForVisit, setReasonForVisit] = useState<string>(initialReason ?? '');
  const [hasEditedReason, setHasEditedReason] = useState<boolean>(Boolean(initialReason));
  const [sendReminders, setSendReminders] = useState<boolean>(true);
  const [bookingReference, setBookingReference] = useState<string>('');

  // Load care catalog on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setIsLoading(true);
        const catalog = await queryPatientSearchCatalog(getToken, patientId, {
          q: '',
          category: 'all',
        });
        if (!active) return;

        const catalogDoctors = catalog.data.doctors;
        setDoctors(catalogDoctors);
        setClinics(catalog.data.clinics);
        setServices(catalog.data.services);

        if (initialProviderId) {
          const matchedDoc = catalogDoctors.find((d) => d.id === initialProviderId);
          if (matchedDoc) {
            setSelectedDoctorId(matchedDoc.id);
          } else {
            setCurrentStep(1);
            const fallbackDoc =
              (initialClinicId
                ? catalogDoctors.find((d) => d.clinicId === initialClinicId)
                : undefined) ?? catalogDoctors[0];
            if (fallbackDoc) setSelectedDoctorId(fallbackDoc.id);
          }
        } else if (!selectedDoctorId && catalogDoctors.length > 0) {
          const matchedByClinic = initialClinicId
            ? catalogDoctors.find((d) => d.clinicId === initialClinicId)
            : undefined;
          setSelectedDoctorId((matchedByClinic ?? catalogDoctors[0])?.id);
        }
      } catch {
        // Handled cleanly with empty catalog state
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken, initialClinicId, initialProviderId, patientId]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0] ?? null,
    [doctors, selectedDoctorId],
  );

  const selectedClinic = useMemo(() => {
    if (!selectedDoctor) return clinics[0] ?? null;
    return clinics.find((c) => c.id === selectedDoctor.clinicId) ?? clinics[0] ?? null;
  }, [clinics, selectedDoctor]);

  const selectedService = useMemo(() => {
    if (!selectedDoctor) return null;
    if (initialServiceId) {
      const exactMatch = services.find(
        (s) => s.id === initialServiceId && s.clinicId === selectedDoctor.clinicId,
      );
      if (exactMatch) return exactMatch;
    }
    return services.find((s) => s.clinicId === selectedDoctor.clinicId) ?? null;
  }, [initialServiceId, selectedDoctor, services]);

  useEffect(() => {
    if (hasEditedReason) return;
    if (selectedService?.name) {
      setReasonForVisit(selectedService.name);
    } else if (selectedDoctor?.specialty) {
      setReasonForVisit(`${selectedDoctor.specialty} Consultation`);
    }
  }, [hasEditedReason, selectedDoctor?.specialty, selectedService?.name]);

  useEffect(() => {
    scrollY.setValue(0);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [currentStep, scrollY]);

  // Fetch available slots whenever doctor or date changes
  useEffect(() => {
    if (!selectedDoctor || currentStep > 3) return;

    let active = true;
    (async () => {
      try {
        setIsLoadingSlots(true);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const res = await fetchAvailableSlots(
          selectedDoctor.clinicId,
          selectedDoctor.id,
          dateStr,
          getToken,
          patientId,
        );
        if (!active) return;

        const openSlots = (res.slots || []).filter((s) => s.available !== false);
        setAvailableSlots(openSlots);
        if (openSlots.length > 0) {
          const preferred =
            openSlots.find((s) => s.time.startsWith('10:')) ?? openSlots[0];
          setSelectedSlot(preferred ?? null);
        } else {
          setSelectedSlot(null);
        }
      } catch {
        if (active) {
          setAvailableSlots([]);
          setSelectedSlot(null);
        }
      } finally {
        if (active) setIsLoadingSlots(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [currentStep, getToken, patientId, selectedDate, selectedDoctor]);

  const navigateBackToTabs = useCallback(
    (tabScreen: 'AppointmentsScreen' | 'HomeScreen') => {
      navigation.navigate('BottomTabs', { screen: tabScreen });
    },
    [navigation],
  );

  const handleBack = useCallback(() => {
    if (currentStep === 2) {
      setCurrentStep(1);
      return;
    }
    if (currentStep === 3) {
      setCurrentStep(2);
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigateBackToTabs('AppointmentsScreen');
  }, [currentStep, navigateBackToTabs, navigation]);

  const handleConfirmAndBook = useCallback(async () => {
    if (!selectedDoctor || !selectedSlot) return;

    if (!isOnline) {
      dialog.alert(
        'Offline',
        'An internet connection is required to submit a booking request.',
      );
      return;
    }

    setIsSubmitting(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const timeStr = selectedSlot.time || '10:30';
    const effectiveReason =
      reasonForVisit.trim() ||
      selectedService?.name ||
      `${selectedDoctor.specialty} Consultation`;

    const servicePrefix = selectedService
      ? `[[service:id=${selectedService.id};name=${selectedService.name}]]\n`
      : '';
    const notesPayload = [
      `Provider: ${selectedDoctor.name}`,
      `Mode: ${consultationMode === 'telehealth' ? 'Telehealth Video' : 'In-Person Visit'}`,
      `Reminders: ${sendReminders ? 'SMS & Calendar reminders enabled' : 'Disabled'}`,
    ].join('\n');

    let consentedShareFields: ShareableFieldKey[] = [
      'fullName',
      'dateOfBirth',
      'mobile',
      'email',
    ];
    try {
      const clinicDetail = await getClinicDetail(patientId, selectedDoctor.clinicId);
      if (clinicDetail?.requiredShareFields?.length) {
        consentedShareFields = clinicDetail.requiredShareFields;
      }
    } catch {
      // Keep default share fields
    }

    try {
      const [serverDraftId, onlineErr] = await safeAwait(
        createBookingDraftOnline(getToken, patientId, {
          clinicId: selectedDoctor.clinicId,
          preferredDate: dateStr,
          preferredTime: timeStr,
          reason: effectiveReason,
          notes: `${servicePrefix}${notesPayload}`,
          shareFieldsJson: JSON.stringify(consentedShareFields),
        }),
      );

      if (onlineErr || !serverDraftId) {
        dialog.alert(
          'Booking Failed',
          onlineErr?.message || 'Unable to create booking request on server. Please try again.',
        );
        return;
      }

      const [refResult, submitErr] = await safeAwait(
        submitBookingDraftOnline(getToken, patientId, serverDraftId),
      );

      if (submitErr) {
        dialog.alert(
          'Booking Failed',
          'Unable to submit booking request to the clinic. Please try again.',
        );
        return;
      }

      await safeAwait(
        saveBookingDraft(
          patientId,
          {
            clinicId: selectedDoctor.clinicId,
            preferredDate: dateStr,
            preferredTime: timeStr,
            reason: effectiveReason,
            notes: `${servicePrefix}${notesPayload}`,
            shareFields: consentedShareFields,
            shareSections: [],
          },
          serverDraftId,
        ),
      );

      const normalizedRef = refResult
        ? refResult.replace(/^PENDING-/, 'EZ-').slice(0, 10).toUpperCase()
        : `EZ-${serverDraftId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
      setBookingReference(
        normalizedRef.startsWith('EZ-') ? normalizedRef : `EZ-${normalizedRef}`,
      );
      setCurrentStep(4);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    consultationMode,
    getToken,
    isOnline,
    patientId,
    reasonForVisit,
    selectedDate,
    selectedDoctor,
    selectedService,
    selectedSlot,
    sendReminders,
  ]);

  const selectedSlotSummary = useMemo(
    () => formatSlotSummary(selectedSlot, selectedDate, selectedDoctor?.name),
    [selectedDate, selectedDoctor?.name, selectedSlot],
  );

  const unitPrice =
    typeof selectedService?.price === 'number' && selectedService.price > 0
      ? selectedService.price
      : 0;
  const formattedCopay = `₱${unitPrice.toFixed(2)}`;

  const maxContentWidth = isWorkstation ? 680 : undefined;
  const horizontalPadding = isWorkstation ? spacing.xl : spacing.base;
  const showFooter = currentStep < 4 && !isLoading;

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <BookingSeamlessHeader
        scrollY={scrollY}
        isConfirmedStep={currentStep === 4}
        maxContentWidth={maxContentWidth}
        horizontalPadding={horizontalPadding}
        onBackPress={handleBack}
        onHelpPress={NO_OP}
        onDonePress={() => navigateBackToTabs('AppointmentsScreen')}
      />

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.flex}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: horizontalPadding,
            paddingBottom: spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.bodyInner, isWorkstation ? styles.workstationInner : null]}>
          {currentStep < 4 ? (
            <BookingStepIndicator
              currentStep={currentStep as BookingStep}
              onSelectStep={(step) => setCurrentStep(step)}
            />
          ) : null}

          {isLoading ? (
            <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : currentStep === 1 ? (
            <BookingDoctorStep
              doctors={doctors}
              clinics={clinics}
              selectedDoctorId={selectedDoctor?.id}
              onSelectDoctor={(doc) => setSelectedDoctorId(doc.id)}
              onViewClinicInfo={(clinicId) => {
                navigation.navigate('ClinicDetailsScreen', {
                  clinicId,
                  id: clinicId,
                });
              }}
              onViewAllHubs={() => {
                navigation.navigate('ExploreClinicsScreen');
              }}
              onFilterSlidersPress={NO_OP}
            />
          ) : currentStep === 2 && selectedDoctor ? (
            <BookingSlotStep
              doctor={selectedDoctor}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              availableSlots={availableSlots}
              isLoadingSlots={isLoadingSlots}
              consultationMode={consultationMode}
              onChangeConsultationMode={setConsultationMode}
              serviceDurationMinutes={selectedService?.durationMinutes ?? 30}
              onChangeDoctor={() => setCurrentStep(1)}
            />
          ) : currentStep === 3 && selectedDoctor && selectedSlot ? (
            <BookingReviewStep
              doctor={selectedDoctor}
              clinic={selectedClinic}
              service={selectedService}
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              consultationMode={consultationMode}
              reasonForVisit={reasonForVisit}
              onChangeReasonForVisit={(text) => {
                setHasEditedReason(true);
                setReasonForVisit(text);
              }}
              sendReminders={sendReminders}
              onToggleSendReminders={() => setSendReminders((prev) => !prev)}
              onChangeTimeOrMode={() => setCurrentStep(2)}
            />
          ) : currentStep === 4 && selectedDoctor ? (
            <BookingConfirmationStep
              bookingReference={bookingReference}
              patientEmail={user?.primaryEmailAddress?.emailAddress}
              doctorName={selectedDoctor.name}
              onViewAppointments={() => navigateBackToTabs('AppointmentsScreen')}
              onBackToHome={() => navigateBackToTabs('HomeScreen')}
            />
          ) : null}
        </View>
      </Animated.ScrollView>

      {showFooter ? (
        <BookingStickyFooter
          currentStep={currentStep as BookingStep}
          selectedDoctor={selectedDoctor}
          selectedSlotSummary={selectedSlotSummary}
          formattedCopay={formattedCopay}
          isSubmitting={isSubmitting}
          maxContentWidth={maxContentWidth}
          horizontalPadding={horizontalPadding}
          onProceedStep1={() => {
            if (selectedDoctor) setCurrentStep(2);
          }}
          onProceedStep2={() => {
            if (selectedSlot) setCurrentStep(3);
          }}
          onConfirmAndBook={handleConfirmAndBook}
        />
      ) : null}

      <HomeOfflinePillBanner
        isOnline={isOnline}
        bottomOffset={showFooter ? 124 : spacing.base}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
  },
  bodyInner: {
    width: '100%',
  },
  workstationInner: {
    maxWidth: 680,
    alignSelf: 'center',
  },
});
