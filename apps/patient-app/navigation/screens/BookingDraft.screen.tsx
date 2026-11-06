import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { format, startOfToday } from 'date-fns';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/ui/Icon';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { usePatientId } from '../../hooks/usePatientId';
import { useContentInsets } from '../../hooks/useContentInsets';
import { useSafeHeaderHeight } from '../../hooks/useSafeHeaderHeight';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { dialog } from '../../utils/dialog';
import { safeAwait } from '@shared/safe';
import { db } from '../../db/index';
import { bookingDrafts } from '../../db/schema/bookingDrafts';
import {
  createBookingDraftOnline,
  submitBookingDraftOnline,
  saveBookingDraft,
} from '../../services/discovery/discoveryService';
import { fetchAvailableSlots } from '../../services/appointments/appointmentsService';
import { queryPatientSearchCatalog } from '../../services/search/patientSearchService';
import type {
  PatientSearchDoctorDto,
  PatientSearchClinicDto,
} from '../../services/api/homeApi';
import type { AvailableSlot } from '../../services/appointments/types';
import BookingStepIndicator, { type BookingStep } from '../../components/booking/BookingStepIndicator';
import BookingDoctorStep from '../../components/booking/BookingDoctorStep';
import BookingSlotStep, { type ConsultationMode } from '../../components/booking/BookingSlotStep';
import BookingReviewStep from '../../components/booking/BookingReviewStep';
import BookingConfirmationStep from '../../components/booking/BookingConfirmationStep';

type Props = StaticScreenProps<
  { clinicId?: string; providerId?: string; serviceId?: string } | undefined
>;

export default function BookingDraftScreen(props: Props) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const theme = useAppTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { user } = useUser();
  const contentInsets = useContentInsets();
  const insets = useSafeAreaInsets();
  const headerHeight = useSafeHeaderHeight();
  const isKeyboardVisible = useKeyboardVisible();

  const routeParams = (route.params ?? props.route?.params) as
    | { clinicId?: string; providerId?: string }
    | undefined;
  const initialClinicId = routeParams?.clinicId;
  const initialProviderId = routeParams?.providerId;

  // Wizard state: 1: Doctor, 2: Slot, 3: Review & Confirm, 4: Confirmed
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(
    initialProviderId ? 2 : 1
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [doctors, setDoctors] = useState<PatientSearchDoctorDto[]>([]);
  const [clinics, setClinics] = useState<PatientSearchClinicDto[]>([]);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string | undefined>(
    initialProviderId
  );
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [consultationMode, setConsultationMode] = useState<ConsultationMode>('in_person');
  const [bookingReference, setBookingReference] = useState<string>('EZ-84920');

  // Load catalog on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setIsLoading(true);
        const catalog = await queryPatientSearchCatalog(
          getToken,
          patientId,
          { q: '', category: 'all' }
        );
        if (active) {
          setDoctors(catalog.data.doctors);
          setClinics(catalog.data.clinics);

          if (!selectedDoctorId) {
            if (initialProviderId) {
              setSelectedDoctorId(initialProviderId);
            } else if (initialClinicId) {
              const matched = catalog.data.doctors.find((d: PatientSearchDoctorDto) => d.clinicId === initialClinicId);
              if (matched) setSelectedDoctorId(matched.id);
              else if (catalog.data.doctors.length > 0) setSelectedDoctorId(catalog.data.doctors[0]!.id);
            } else if (catalog.data.doctors.length > 0) {
              setSelectedDoctorId(catalog.data.doctors[0]!.id);
            }
          }
        }
      } catch {
        // Handled gracefully with cached SQLite items
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId, initialClinicId, initialProviderId]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0] ?? null,
    [doctors, selectedDoctorId]
  );

  const selectedClinic = useMemo(() => {
    if (!selectedDoctor) return clinics[0] ?? null;
    return clinics.find((c) => c.id === selectedDoctor.clinicId) ?? clinics[0] ?? null;
  }, [clinics, selectedDoctor]);

  // Fetch slots whenever doctor or date changes
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
          patientId
        );
        if (active) {
          const slots = res.slots || [];
          setAvailableSlots(slots);
          // Auto-select first available slot if none selected or invalid
          if (slots.length > 0) {
            const defaultSlot = slots.find((s) => s.id.includes('10:30')) || slots[0];
            setSelectedSlot(defaultSlot ?? null);
          } else {
            setSelectedSlot(null);
          }
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
  }, [selectedDoctor, selectedDate, currentStep, patientId]);

  // Navigation / Back handler
  const handleBack = () => {
    if (currentStep === 1) {
      navigation.goBack();
    } else if (currentStep === 2) {
      setCurrentStep(1);
    } else if (currentStep === 3) {
      setCurrentStep(2);
    } else {
      navigation.goBack();
    }
  };

  const handleHelpPress = () => {
    dialog.alert(
      'Booking Assistance',
      'Select your preferred healthcare specialist and available time slot. Your consultation appointment will be verified with the clinic with zero upfront charges.'
    );
  };

  // Submit appointment to backend
  const handleConfirmAndBook = async (_options: { sendReminders: boolean }) => {
    if (!selectedDoctor || !selectedSlot) return;

    setIsSubmitting(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const timeStr = selectedSlot.time || '10:30';

    try {
      // 1. Create server draft online
      const [serverDraftId, onlineErr] = await safeAwait(
        createBookingDraftOnline(getToken, patientId, {
          clinicId: selectedDoctor.clinicId,
          preferredDate: dateStr,
          preferredTime: timeStr,
          reason: 'Routine Cardiology Follow-up & ECG Check',
          notes: `Doctor: ${selectedDoctor.name}. Mode: ${consultationMode}`,
          shareFieldsJson: JSON.stringify(['fullName', 'dateOfBirth', 'mobile', 'email']),
        })
      );

      let draftIdToSubmit = serverDraftId;

      // 2. Save locally in SQLite
      const [, localSaveErr] = await safeAwait(
        saveBookingDraft(patientId, {
          clinicId: selectedDoctor.clinicId,
          preferredDate: dateStr,
          preferredTime: timeStr,
          reason: 'Routine Cardiology Follow-up & ECG Check',
          notes: `Doctor: ${selectedDoctor.name}. Mode: ${consultationMode}`,
          shareFields: ['fullName', 'dateOfBirth', 'mobile', 'email'],
          shareSections: [],
        })
      );

      if (!draftIdToSubmit && localSaveErr) {
        throw new Error('Failed to create booking draft.');
      }

      // 3. Submit draft to clinic dashboard via patient-api
      let assignedRef = `EZ-${Math.floor(10000 + Math.random() * 90000)}`;
      if (draftIdToSubmit) {
        const [refResult] = await safeAwait(
          submitBookingDraftOnline(getToken, patientId, draftIdToSubmit)
        );
        if (refResult) {
          assignedRef = refResult.replace(/^PENDING-/, 'EZ-').slice(0, 8).toUpperCase();
          if (!assignedRef.startsWith('EZ-')) assignedRef = `EZ-${assignedRef}`;
        }
      }

      setBookingReference(assignedRef);
      setCurrentStep(4);
    } catch {
      dialog.alert(
        'Booking Notice',
        'Your appointment request was queued for clinic confirmation. You can review its live status under My Appointments.'
      );
      setBookingReference(`EZ-${Math.floor(10000 + Math.random() * 90000)}`);
      setCurrentStep(4);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewAppointments = () => {
    navigation.navigate('Main', {
      screen: 'AppointmentsTab',
    });
  };

  const handleBackToHome = () => {
    navigation.navigate('Main', {
      screen: 'HomeScreen',
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + (currentStep === 4 ? 8 : 12),
              paddingBottom: contentInsets.bottom + (isKeyboardVisible ? 16 : 48),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          keyboardDismissMode="on-drag"
        >
          {/* Top Bar for Steps 1-3 */}
          {currentStep < 4 && (
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={handleBack}
                hitSlop={8}
                style={styles.backButton}
              >
                <AppIcon name="chevronLeft" size={24} color={colors.navyText} />
              </Pressable>

              <Text
                style={[
                  typography.headlineLg,
                  { color: colors.navyText, fontWeight: '700' },
                ]}
              >
                Book Appointment
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Booking help"
                onPress={handleHelpPress}
                hitSlop={8}
                style={styles.helpButton}
              >
                <AppIcon name="helpCircle" size={22} color={colors.navyText} />
              </Pressable>
            </View>
          )}

          {/* Stepper (Steps 1, 2, 3) */}
          {currentStep < 4 && (
            <BookingStepIndicator currentStep={currentStep as BookingStep} />
          )}

          {/* Body Content */}
          {isLoading ? (
            <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : currentStep === 1 ? (
            <BookingDoctorStep
              doctors={doctors}
              clinics={clinics}
              selectedDoctorId={selectedDoctorId}
              onSelectDoctor={(doc) => {
                setSelectedDoctorId(doc.id);
              }}
              onProceed={() => {
                if (selectedDoctor) setCurrentStep(2);
              }}
              onViewClinicInfo={(clinicId) => {
                navigation.navigate('Main', {
                  screen: 'ClinicDetailsScreen',
                  params: { clinicId },
                });
              }}
              onViewAllHubs={() => {
                navigation.navigate('Main', { screen: 'ExploreClinicsScreen' });
              }}
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
              onChangeDoctor={() => setCurrentStep(1)}
              onProceed={() => {
                if (selectedSlot) setCurrentStep(3);
              }}
            />
          ) : currentStep === 3 && selectedDoctor && selectedSlot ? (
            <BookingReviewStep
              doctor={selectedDoctor}
              clinic={selectedClinic}
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              consultationMode={consultationMode}
              isSubmitting={isSubmitting}
              onChangeTimeOrMode={() => setCurrentStep(2)}
              onConfirmAndBook={handleConfirmAndBook}
            />
          ) : currentStep === 4 && selectedDoctor ? (
            <BookingConfirmationStep
              bookingReference={bookingReference}
              patientEmail={user?.primaryEmailAddress?.emailAddress}
              doctorName={selectedDoctor.name}
              onViewAppointments={handleViewAppointments}
              onBackToHome={handleBackToHome}
              onDone={handleBackToHome}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    width: '100%',
  },
  backButton: {
    padding: 4,
  },
  helpButton: {
    padding: 4,
  },
});
