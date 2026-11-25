import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { format } from 'date-fns';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { safeAwait } from '@shared/safe';
import { SkeletonCard } from '../../components/ui/Skeleton';
import HomeOfflinePillBanner from '../../components/home/HomeOfflinePillBanner';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { usePatientId } from '../../hooks/usePatientId';
import { useNetworkOnline } from '../../hooks/useNetworkOnline';
import { useSafeHeaderHeight } from '../../hooks/useSafeHeaderHeight';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { dialog } from '../../utils/dialog';
import {
  createBookingDraftOnline,
  getClinicDetail,
  saveBookingDraft,
  submitBookingDraftOnline,
} from '../../services/discovery/discoveryService';
import type { ShareableFieldKey } from '../../services/discovery/types';
import { fetchAvailableSlots } from '../../services/appointments/appointmentsService';
import {
  filterOpenFutureSlots,
  formatSlotSummary,
  getManilaTodayDate,
  isPastManilaSlot,
  resolveExplicitSelectedService,
  selectRecommendedSlot,
} from '../../services/appointments/slotUtils';
import { ApiError } from '../../services/api/apiClient';
import {
  applyDoctorAffiliation,
  isDirectoryBookingPaused,
  practitionerProfileToDoctorDto,
  queryDirectorySearchCatalog,
  resolveDefaultAffiliation,
} from '../../services/search/directorySearchService';
import {
  getPractitionerProfile,
  type DirectoryClinicDto,
  type DirectoryDoctorDto,
  type DirectoryServiceDto,
  type PractitionerProfileDto,
} from '../../services/api/homeApi';
import {
  cachePractitionerProfile,
  getCachedPractitionerProfile,
} from '../../services/search/networkDirectory';
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
  | {
      clinicId?: string;
      providerId?: string;
      practitionerId?: string;
      providerName?: string;
      serviceId?: string;
      reason?: string;
    }
  | undefined;

const NO_OP = () => {};

type Props = StaticScreenProps<BookingRouteParams>;

export default function BookingDraftScreen(props: Props) {
  const { colors, spacing } = useClinicalEmpathyTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const hasLoadedCatalogRef = useRef(false);
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const headerHeight = useSafeHeaderHeight();
  const isKeyboardVisible = useKeyboardVisible();
  const { isOnline } = useNetworkOnline();

  const routeParams = (route.params ?? props.route?.params) as BookingRouteParams;
  const initialClinicId = routeParams?.clinicId;
  const initialProviderId = routeParams?.providerId;
  const initialPractitionerId = routeParams?.practitionerId;
  const initialServiceId = routeParams?.serviceId;
  const initialReason = routeParams?.reason;

  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(
    initialProviderId || initialPractitionerId ? 2 : 1,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [doctors, setDoctors] = useState<DirectoryDoctorDto[]>([]);
  const [clinics, setClinics] = useState<DirectoryClinicDto[]>([]);
  const [services, setServices] = useState<DirectoryServiceDto[]>([]);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | undefined>(
    initialProviderId ?? initialPractitionerId,
  );
  const [selectedClinicId, setSelectedClinicId] = useState<string | undefined>(
    initialClinicId,
  );
  const [selectedDate, setSelectedDate] = useState<Date>(() => getManilaTodayDate());
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [slotRefreshTick, setSlotRefreshTick] = useState<number>(0);
  const [consultationMode, setConsultationMode] =
    useState<ConsultationMode>('in_person');
  const [reasonForVisit, setReasonForVisit] = useState<string>(initialReason ?? '');
  const [hasEditedReason, setHasEditedReason] = useState<boolean>(Boolean(initialReason));
  const [sendReminders, setSendReminders] = useState<boolean>(true);
  const [bookingReference, setBookingReference] = useState<string>('');

  // Load care catalog on mount using stable getTokenRef so auth ticks never trigger skeleton flicker
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!hasLoadedCatalogRef.current) {
          setIsLoading(true);
        }
        const catalog = await queryDirectorySearchCatalog(getTokenRef.current, patientId, {
          q: '',
          category: 'all',
          take: 50,
        });
        if (!active) return;

        hasLoadedCatalogRef.current = true;
        let catalogDoctors = [...catalog.data.doctors];
        const targetLookupId = initialProviderId ?? initialPractitionerId;

        if (targetLookupId) {
          let matchedDoc = catalogDoctors.find(
            (d) =>
              d.id === targetLookupId ||
              d.practitionerId === targetLookupId ||
              Boolean(d.affiliations?.some((a) => a.providerId === targetLookupId)),
          );

          if (!matchedDoc) {
            let profile: PractitionerProfileDto | null = null;
            try {
              profile = await getPractitionerProfile(
                getTokenRef.current,
                targetLookupId,
                patientId,
              );
              if (profile) {
                await cachePractitionerProfile(profile, patientId);
              }
            } catch {
              profile = await getCachedPractitionerProfile(targetLookupId, patientId);
            }
            if (!active) return;
            if (profile) {
              const converted = practitionerProfileToDoctorDto(profile, initialClinicId);
              if (converted) {
                matchedDoc = converted;
                catalogDoctors = [converted, ...catalogDoctors];
              }
            }
          }

          if (matchedDoc) {
            setSelectedDoctorId(matchedDoc.id);
            const matchedAff =
              (initialClinicId
                ? matchedDoc.affiliations?.find((a) => a.clinicId === initialClinicId)
                : undefined) ??
              (initialProviderId
                ? matchedDoc.affiliations?.find((a) => a.providerId === initialProviderId)
                : undefined) ??
              resolveDefaultAffiliation(matchedDoc, initialClinicId);

            const resolvedClinicId = matchedAff?.clinicId ?? initialClinicId ?? matchedDoc.clinicId;
            setSelectedClinicId(resolvedClinicId);

            const clinicRow = catalog.data.clinics.find((c) => c.id === resolvedClinicId);
            const targetPaused = Boolean(
              !resolvedClinicId ||
                (matchedAff ? !matchedAff.supportsAppointments : !matchedDoc.clinicSupportsAppointments) ||
                (clinicRow && !clinicRow.supportsAppointments),
            );
            if (targetPaused) {
              setCurrentStep(1);
            }
          } else {
            setCurrentStep(1);
            const fallbackDoc =
              (initialClinicId
                ? catalogDoctors.find(
                    (d) =>
                      d.clinicId === initialClinicId ||
                      Boolean(d.affiliations?.some((a) => a.clinicId === initialClinicId)),
                  )
                : undefined) ?? catalogDoctors[0];
            if (fallbackDoc) {
              setSelectedDoctorId(fallbackDoc.id);
              const defAff = resolveDefaultAffiliation(fallbackDoc, initialClinicId);
              setSelectedClinicId(defAff?.clinicId ?? fallbackDoc.clinicId);
            }
          }
        } else if (catalogDoctors.length > 0) {
          const matchedByClinic = initialClinicId
            ? catalogDoctors.find(
                (d) =>
                  d.clinicId === initialClinicId ||
                  Boolean(d.affiliations?.some((a) => a.clinicId === initialClinicId)),
              )
            : undefined;
          const initialDoc = matchedByClinic ?? catalogDoctors[0];
          if (initialDoc) {
            setSelectedDoctorId(initialDoc.id);
            const defAff = resolveDefaultAffiliation(initialDoc, initialClinicId);
            setSelectedClinicId(defAff?.clinicId ?? initialDoc.clinicId);
          }
        }

        setDoctors(catalogDoctors);
        setClinics(catalog.data.clinics);
        setServices(catalog.data.services);
      } catch {
        // Handled cleanly with empty catalog state
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialClinicId, initialPractitionerId, initialProviderId, patientId]);

  const rawSelectedDoctor = useMemo(
    () =>
      doctors.find(
        (d) =>
          d.id === selectedDoctorId ||
          d.practitionerId === selectedDoctorId ||
          Boolean(d.affiliations?.some((a) => a.providerId === selectedDoctorId)),
      ) ??
      doctors[0] ??
      null,
    [doctors, selectedDoctorId],
  );

  const selectedAffiliation = useMemo(
    () =>
      rawSelectedDoctor
        ? resolveDefaultAffiliation(rawSelectedDoctor, selectedClinicId)
        : null,
    [rawSelectedDoctor, selectedClinicId],
  );

  const selectedDoctor = useMemo(
    () =>
      rawSelectedDoctor
        ? applyDoctorAffiliation(rawSelectedDoctor, selectedAffiliation)
        : null,
    [rawSelectedDoctor, selectedAffiliation],
  );

  const selectedClinic = useMemo(() => {
    const targetClinicId = selectedDoctor?.clinicId ?? selectedClinicId;
    if (!targetClinicId) return clinics[0] ?? null;
    return clinics.find((c) => c.id === targetClinicId) ?? null;
  }, [clinics, selectedClinicId, selectedDoctor]);

  const isBookingPaused = useMemo(
    () => isDirectoryBookingPaused(selectedDoctor, selectedClinic),
    [selectedClinic, selectedDoctor],
  );

  const selectedService = useMemo(
    () => resolveExplicitSelectedService(services, selectedDoctor?.clinicId, initialServiceId),
    [initialServiceId, selectedDoctor?.clinicId, services],
  );

  // Pre-fill real default reason while untouched by the user
  useEffect(() => {
    if (hasEditedReason) return;
    if (selectedService?.name) {
      setReasonForVisit(selectedService.name);
    } else if (selectedDoctor?.specialty) {
      setReasonForVisit(`${selectedDoctor.specialty} Consultation`);
    } else if (selectedDoctor) {
      setReasonForVisit('Medical Consultation');
    }
  }, [hasEditedReason, selectedDoctor, selectedService?.name]);

  // Reset scroll offset smoothly on step transitions
  useEffect(() => {
    scrollY.setValue(0);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [currentStep, scrollY]);

  const selectedDateKey = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const slotDoctorId = selectedDoctor?.id ?? '';
  const slotClinicId = selectedDoctor?.clinicId ?? '';
  const isReviewOrEarlier = currentStep <= 3;

  // Fetch available slots whenever doctor id or date string changes
  useEffect(() => {
    if (!slotDoctorId || !slotClinicId || !isReviewOrEarlier) return;
    if (isBookingPaused) {
      setAvailableSlots([]);
      setSelectedSlot(null);
      return;
    }

    let active = true;
    (async () => {
      try {
        setIsLoadingSlots(true);
        const res = await fetchAvailableSlots(
          slotClinicId,
          slotDoctorId,
          selectedDateKey,
          getTokenRef.current,
          patientId,
        );
        if (!active) return;

        const openSlots = filterOpenFutureSlots(res.slots || [], selectedDateKey);
        setAvailableSlots(openSlots);
        setSelectedSlot(selectRecommendedSlot(openSlots));
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
  }, [isBookingPaused, isReviewOrEarlier, patientId, selectedDateKey, slotClinicId, slotDoctorId, slotRefreshTick]);

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

    if (isBookingPaused) {
      dialog.alert(
        'Booking Paused',
        'Online booking is currently paused for this clinic.',
      );
      return;
    }

    if (!isOnline) {
      dialog.alert(
        'Offline',
        'An internet connection is required to submit a booking request.',
      );
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const timeStr = selectedSlot.time || '10:30';
    if (isPastManilaSlot(dateStr, timeStr)) {
      const remaining = filterOpenFutureSlots(availableSlots, dateStr);
      setAvailableSlots(remaining);
      setSelectedSlot(selectRecommendedSlot(remaining));
      setSlotRefreshTick((prev) => prev + 1);
      setCurrentStep(2);
      dialog.alert(
        'Time Slot Unavailable',
        'This time slot has already passed. Please select an upcoming time slot.',
      );
      return;
    }

    setIsSubmitting(true);
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
        createBookingDraftOnline(getTokenRef.current, patientId, {
          clinicId: selectedDoctor.clinicId,
          providerId: selectedDoctor.id,
          providerName: selectedDoctor.name,
          preferredDate: dateStr,
          preferredTime: timeStr,
          reason: effectiveReason,
          notes: `${servicePrefix}${notesPayload}`,
          shareFieldsJson: JSON.stringify(consentedShareFields),
        }),
      );

      if (onlineErr || !serverDraftId) {
        if (onlineErr instanceof ApiError && onlineErr.status === 400) {
          setSlotRefreshTick((prev) => prev + 1);
          setCurrentStep(2);
        }
        dialog.alert(
          'Booking Failed',
          onlineErr?.message || 'Unable to create booking request on server. Please try again.',
        );
        return;
      }

      const [refResult, submitErr] = await safeAwait(
        submitBookingDraftOnline(getTokenRef.current, patientId, serverDraftId),
      );

      if (submitErr) {
        if (submitErr instanceof ApiError && submitErr.status === 400) {
          setSlotRefreshTick((prev) => prev + 1);
          setCurrentStep(2);
        }
        dialog.alert(
          'Booking Failed',
          submitErr?.message || 'Unable to submit booking request to the clinic. Please try again.',
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
    availableSlots,
    consultationMode,
    isBookingPaused,
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

  const showFooter = currentStep < 4 && !isLoading && !isKeyboardVisible;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: colors.canvas }]}
    >
      <BookingSeamlessHeader
        scrollY={scrollY}
        isConfirmedStep={currentStep === 4}
        onBackPress={handleBack}
        onHelpPress={NO_OP}
        onDonePress={() => navigateBackToTabs('AppointmentsScreen')}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
        style={styles.keyboardContainer}
      >
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.flex}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: spacing.base,
              paddingBottom:
                (isKeyboardVisible ? spacing.base : spacing.xxl) +
                (showFooter ? spacing.md : insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          keyboardDismissMode="on-drag"
        >
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
              selectedDoctorId={rawSelectedDoctor?.id ?? selectedDoctor?.id}
              selectedClinicId={selectedDoctor?.clinicId ?? selectedClinicId}
              onSelectDoctor={(doc) => {
                setSelectedDoctorId(doc.id);
                const defAff = resolveDefaultAffiliation(doc);
                setSelectedClinicId(defAff?.clinicId ?? doc.clinicId);
              }}
              onSelectClinic={(clinicId, doc) => {
                setSelectedDoctorId(doc.id);
                setSelectedClinicId(clinicId);
              }}
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
              selectedClinicId={selectedDoctor.clinicId}
              onSelectClinic={(clinicId) => setSelectedClinicId(clinicId)}
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
              isBookingPaused={isBookingPaused}
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
              consultationMode={consultationMode}
              onViewAppointments={() => navigateBackToTabs('AppointmentsScreen')}
              onBackToHome={() => navigateBackToTabs('HomeScreen')}
            />
          ) : null}
        </Animated.ScrollView>

        {showFooter ? (
          <BookingStickyFooter
            currentStep={currentStep as BookingStep}
            selectedDoctor={selectedDoctor}
            isBookingPaused={isBookingPaused}
            selectedSlotSummary={selectedSlotSummary}
            formattedCopay={formattedCopay}
            consultationMode={consultationMode}
            isSubmitting={isSubmitting}
            bottomInset={insets.bottom}
            onProceedStep1={() => {
              if (selectedDoctor && !isBookingPaused) setCurrentStep(2);
            }}
            onProceedStep2={() => {
              if (!selectedSlot || isBookingPaused) return;
              if (isPastManilaSlot(selectedDateKey, selectedSlot.time)) {
                const remaining = filterOpenFutureSlots(availableSlots, selectedDateKey);
                setAvailableSlots(remaining);
                setSelectedSlot(selectRecommendedSlot(remaining));
                setSlotRefreshTick((prev) => prev + 1);
                dialog.alert(
                  'Time Slot Unavailable',
                  'This time slot has already passed. Please select an upcoming time slot.',
                );
                return;
              }
              setCurrentStep(3);
            }}
            onConfirmAndBook={handleConfirmAndBook}
          />
        ) : null}
      </KeyboardAvoidingView>

      <HomeOfflinePillBanner
        isOnline={isOnline}
        bottomOffset={showFooter ? Math.max(insets.bottom, spacing.md) + 112 : Math.max(insets.bottom, spacing.md)}
      />
    </SafeAreaView>
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
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
  },
});
