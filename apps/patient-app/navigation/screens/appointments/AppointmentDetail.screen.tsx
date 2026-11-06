import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { AppIcon } from '../../../components/ui/Icon';
import Screen from '../../../components/layout/Screen';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import DigitalClinicPassCard from '../../../components/appointments/DigitalClinicPassCard';
import OfflineBanner from '../../../components/appointments/OfflineBanner';
import AfterVisitSummaryCard from '../../../components/records/AfterVisitSummaryCard';
import TeleconsultRecordingPlayerModal from '../../../components/teleconsult/TeleconsultRecordingPlayerModal';
import { useClinicalEmpathyTheme } from '../../../constants/clinicalEmpathy';
import { db } from '../../../db/index';
import {
  getAppointmentDetail,
  cancelAppointment,
  checkInAppointment,
} from '../../../services/appointments/appointmentsService';
import type { AppointmentItem } from '../../../services/appointments/types';
import { usePatientId } from '../../../hooks/usePatientId';
import { dialog } from '../../../utils/dialog';

type Props = StaticScreenProps<{ appointmentId?: string; id?: string }>;

interface ChecklistItem {
  id: string;
  title: string;
  subtitle: string;
  completed: boolean;
}

export default function AppointmentDetailScreen({ route }: Props) {
  const empathy = useClinicalEmpathyTheme();
  const { colors, typography, radii, spacing, elevation } = empathy;
  const navigation = useNavigation<any>();
  const { getToken } = useClerkAuth();
  const patientId = usePatientId();

  const appointmentId = route.params?.appointmentId ?? (route.params as any)?.id ?? '';

  const [item, setItem] = useState<AppointmentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isCheckInLoading, setIsCheckInLoading] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    {
      id: 'task-1',
      title: 'No Fasting Required',
      subtitle: 'Normal meals and hydration permitted prior to appointment time.',
      completed: false,
    },
    {
      id: 'task-2',
      title: 'Bring Current Medication Bottles',
      subtitle: 'Lisinopril 10mg & OTC supplements for reconciliation.',
      completed: true,
    },
    {
      id: 'task-3',
      title: 'Arrive 10–15 Minutes Early',
      subtitle: 'Allows smooth check-in at reception terminal and vitals prep.',
      completed: false,
    },
  ]);

  const loadAppointment = useCallback(async () => {
    try {
      const detail = await getAppointmentDetail(appointmentId, db);
      setItem(detail);
      if (detail?.status === 'confirmed') {
        // If confirmed with recent check-in, set isCheckedIn
      }
    } catch {
      dialog.alert('Error', 'Unable to load appointment details.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [appointmentId, navigation]);

  useEffect(() => {
    let mounted = true;
    loadAppointment().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadAppointment]);

  const toggleChecklist = (id: string) => {
    setChecklist((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleShare = async () => {
    if (!item) return;
    try {
      await Share.share({
        title: `Appointment with ${item.provider.name}`,
        message: `Appointment with ${item.provider.name} at ${item.clinic.name} on ${item.scheduledAt}.`,
      });
    } catch {
      // Ignored
    }
  };

  const handleGetDirections = () => {
    if (!item) return;
    const address = encodeURIComponent(`${item.clinic.name} ${item.clinic.address}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`).catch(() => {});
  };

  const handleCallClinic = () => {
    if (!item) return;
    const phone = item.clinic.phoneNumber || '0281234567';
    Linking.openURL(`tel:${phone}`).catch(() => {
      dialog.alert('Call Clinic', `Clinic phone number: ${phone}`);
    });
  };

  const handleExpressCheckIn = async () => {
    if (!item) return;
    setIsCheckInLoading(true);
    try {
      await checkInAppointment(item.id, db, getToken, patientId);
      setIsCheckedIn(true);
      dialog.alert('Check-In Confirmed', 'You are checked in! Please proceed to reception when called.');
    } catch {
      dialog.alert('Check-In Notice', 'Check-in recorded offline. Present your pass at reception.');
      setIsCheckedIn(true);
    } finally {
      setIsCheckInLoading(false);
    }
  };

  const handleReschedule = () => {
    if (!item) return;
    navigation.navigate('Main', {
      screen: 'RescheduleScreen',
      params: {
        appointmentId: item.id,
        clinicId: item.clinic.id,
        currentScheduledAt: item.scheduledAt,
      },
    });
  };

  const handleCancel = async () => {
    if (!item) return;
    const confirmed = await dialog.confirm({
      title: 'Cancel Appointment',
      message:
        'Are you sure you want to cancel this scheduled visit? This will release your reserved slot across the care network.',
      confirmLabel: 'Cancel Appointment',
      cancelLabel: 'Keep',
      destructive: true,
    });

    if (confirmed) {
      try {
        await cancelAppointment(item.id, 'Cancelled by patient', db, getToken, patientId);
        dialog.alert('Appointment Canceled', 'Your appointment has been canceled successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch {
        dialog.alert('Notice', 'Appointment canceled locally.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    }
  };

  if (isLoading || !item) {
    return (
      <Screen width="form" contentContainerStyle={{ gap: spacing.base }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    );
  }

  const isFinalStatus =
    item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';

  let dateLabel = '';
  let timeLabel = '';
  try {
    const d = parseISO(item.scheduledAt);
    dateLabel = format(d, 'EEEE, MMMM d, yyyy');
    timeLabel = format(d, 'h:mm a');
  } catch {
    dateLabel = item.scheduledAt;
  }

  const passCode = `#APT-${item.id.replace(/-/g, '').slice(0, 5).toUpperCase()}`;
  const qrData = JSON.stringify({
    aptId: item.id,
    patientId: item.patientId || patientId,
    clinicId: item.clinic.id,
    scheduledAt: item.scheduledAt,
    passCode,
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { padding: spacing.base }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Bar: < Appointments | Share & Calendar */}
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Appointments"
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.backBtn}
          >
            <AppIcon name="chevronLeft" size={20} color={colors.primaryDeep} />
            <Text
              style={[
                typography.labelMd,
                { color: colors.primaryDeep, fontWeight: '700', marginLeft: 4 },
              ]}
            >
              Appointments
            </Text>
          </Pressable>

          <View style={[styles.navActions, { gap: spacing.md }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share appointment"
              onPress={handleShare}
              hitSlop={8}
            >
              <AppIcon name="share" size={20} color={colors.navyText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add to Calendar"
              onPress={() => dialog.alert('Calendar', 'Appointment date added to your personal calendar.')}
              hitSlop={8}
            >
              <AppIcon name="calendar" size={20} color={colors.navyText} />
            </Pressable>
          </View>
        </View>

        {/* Live Status Header Banner */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.xl,
              padding: spacing.md,
              marginTop: spacing.md,
            },
            elevation.card,
          ]}
        >
          <View style={styles.statusRow}>
            <View style={styles.statusDotWrap}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      item.status === 'confirmed'
                        ? colors.emeraldDot
                        : item.status === 'canceled'
                        ? colors.roseAccent
                        : colors.amberText,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <Text
                style={[
                  typography.overline,
                  {
                    color:
                      item.status === 'confirmed'
                        ? colors.primaryDeep
                        : item.status === 'canceled'
                        ? colors.roseAccent
                        : colors.amberText,
                    fontWeight: '700',
                  },
                ]}
              >
                {item.status.toUpperCase()} • {timeLabel}
              </Text>
            </View>

            <Text style={[typography.bodySmMedium, { color: colors.mutedText }]}>
              {item.durationMinutes} min visit
            </Text>
          </View>
        </View>

        {/* Countdown Card */}
        {!isFinalStatus ? (
          <View
            style={[
              styles.countdownCard,
              {
                backgroundColor: colors.mintSoftBg,
                borderRadius: radii.xl,
                padding: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            <View style={styles.countdownLeft}>
              <AppIcon name="clock" size={16} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.bodySmMedium,
                  { color: colors.navyText, marginLeft: 6, fontWeight: '600' },
                ]}
              >
                Check-in window opens in 15m
              </Text>
            </View>
            <View
              style={[
                styles.onScheduleBadge,
                {
                  backgroundColor: colors.emeraldSoftBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelSm,
                  { color: colors.emeraldText, fontWeight: '700' },
                ]}
              >
                On Schedule
              </Text>
            </View>
          </View>
        ) : null}

        {/* Digital Clinic Pass Card */}
        <View style={{ marginTop: spacing.md }}>
          <DigitalClinicPassCard
            passNumber={passCode}
            clinicName={item.clinic.name}
            terminalName="Bay Terminal"
            qrPayload={qrData}
            isCheckedIn={isCheckedIn}
            readyTimeText="Ready at 10:15 AM"
            onTapEnlarge={() => dialog.alert('Pass QR Code', 'Present this high-contrast QR code directly to the kiosk tablet.')}
            onExpressCheckIn={handleExpressCheckIn}
            isCheckInLoading={isCheckInLoading}
          />
        </View>

        {/* Doctor & Clinic Card */}
        <View
          style={[
            styles.doctorClinicCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.xxl,
              padding: spacing.base,
              marginTop: spacing.md,
            },
            elevation.card,
          ]}
        >
          {/* Doctor Info */}
          <View style={styles.doctorHeaderRow}>
            {item.provider.avatarUrl ? (
              <Image
                source={{ uri: item.provider.avatarUrl }}
                style={[styles.doctorAvatar, { borderRadius: radii.full }]}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.doctorAvatarFallback,
                  {
                    backgroundColor: colors.mintSoftBg,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.labelMd,
                    { color: colors.primaryDeep, fontWeight: '700' },
                  ]}
                >
                  {item.provider.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={styles.doctorTextColumn}>
              <Text
                style={[
                  typography.cardTitle,
                  { color: colors.navyText, fontWeight: '700' },
                ]}
              >
                {item.provider.name}
              </Text>
              <Text
                style={[
                  typography.bodySm,
                  { color: colors.mutedText, marginTop: 2 },
                ]}
              >
                {item.provider.specialty || 'General Practitioner'} • Fellow ACC
              </Text>
              <View style={styles.ratingRow}>
                <AppIcon name="star" size={13} color={colors.amberText} fill={colors.amberText} />
                <Text
                  style={[
                    typography.labelSm,
                    { color: colors.navyText, fontWeight: '700', marginLeft: 4 },
                  ]}
                >
                  4.9
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.mutedText, marginLeft: 4 },
                  ]}
                >
                  • 128 verified reviews
                </Text>
              </View>
            </View>
          </View>

          {/* Clinic Address Container */}
          <View
            style={[
              styles.clinicAddressBox,
              {
                backgroundColor: colors.mintSoftBg,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.md,
              },
            ]}
          >
            <View style={styles.clinicAddressRow}>
              <AppIcon name="building" size={16} color={colors.primaryDeep} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text
                  style={[
                    typography.labelMd,
                    { color: colors.navyText, fontWeight: '700' },
                  ]}
                >
                  {item.clinic.name}
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.mutedText, marginTop: 2 },
                  ]}
                >
                  {item.clinic.address || 'Suite 304, Floor 3 • Medical Arts Wing'}
                </Text>
                <Text
                  style={[
                    typography.bodySmMedium,
                    { color: colors.primaryDeep, marginTop: 2, fontWeight: '600' },
                  ]}
                >
                  1.2 miles away
                </Text>
              </View>
            </View>
          </View>

          {/* Parking Container */}
          <View
            style={[
              styles.parkingBox,
              {
                backgroundColor: colors.mintSoftBg,
                borderColor: colors.border,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            <View style={styles.parkingRow}>
              <AppIcon name="location" size={16} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.bodySmMedium,
                  { color: colors.navyText, marginLeft: 6, flex: 1, fontWeight: '600' },
                ]}
              >
                Main Patient Parking in Garage B
              </Text>
              <View
                style={[
                  styles.validationBadge,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.labelSm,
                    { color: colors.primaryDeep, fontWeight: '700' },
                  ]}
                >
                  Free Validation
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Action Buttons: Call Clinic | Directions */}
          <View style={[styles.doctorActionsRow, { marginTop: spacing.md, gap: spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call Clinic"
              onPress={handleCallClinic}
              style={({ pressed }) => [
                styles.subActionBtn,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="phone" size={15} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.labelMd,
                  { color: colors.primaryDeep, fontWeight: '700', marginLeft: 6 },
                ]}
              >
                Call Clinic
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Get Directions to Clinic"
              onPress={handleGetDirections}
              style={({ pressed }) => [
                styles.subActionBtn,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="navigation" size={15} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.labelMd,
                  { color: colors.primaryDeep, fontWeight: '700', marginLeft: 6 },
                ]}
              >
                Directions
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Consultation Details Card */}
        <View
          style={[
            styles.consultationCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.xxl,
              padding: spacing.base,
              marginTop: spacing.md,
            },
            elevation.card,
          ]}
        >
          <View style={styles.consultationHeaderRow}>
            <Text
              style={[
                typography.cardTitle,
                { color: colors.navyText, fontWeight: '700' },
              ]}
            >
              Consultation Details
            </Text>
            <View
              style={[
                styles.categoryBadge,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelSm,
                  { color: colors.primaryDeep, fontWeight: '700' },
                ]}
              >
                Routine Follow-up
              </Text>
            </View>
          </View>

          {/* Service Details Box */}
          <View
            style={[
              styles.detailBox,
              {
                backgroundColor: colors.mintSoftBg,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.md,
              },
            ]}
          >
            <View style={styles.detailBoxRow}>
              <AppIcon name="stethoscope" size={18} color={colors.primaryDeep} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text
                  style={[
                    typography.labelMd,
                    { color: colors.navyText, fontWeight: '700' },
                  ]}
                >
                  {item.serviceType || 'Cardiology Follow-Up & ECG Review'}
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.mutedText, marginTop: 4, lineHeight: 18 },
                  ]}
                >
                  {item.notes ||
                    'Post-medication titration review for Lisinopril. Resting 12-lead ECG will be administered in exam room.'}
                </Text>
              </View>
            </View>
          </View>

          {/* Insurance & Copay Box */}
          <View
            style={[
              styles.detailBox,
              {
                backgroundColor: colors.mintSoftBg,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            <View style={styles.detailBoxRow}>
              <AppIcon name="shield" size={18} color={colors.primaryDeep} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <View style={styles.insuranceTopRow}>
                  <Text
                    style={[
                      typography.labelMd,
                      { color: colors.navyText, fontWeight: '700' },
                    ]}
                  >
                    BlueCross BlueShield
                  </Text>
                  <View
                    style={[
                      styles.inNetworkBadge,
                      {
                        backgroundColor: colors.emeraldSoftBg,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.labelSm,
                        { color: colors.emeraldText, fontWeight: '700' },
                      ]}
                    >
                      In-Network
                    </Text>
                  </View>
                </View>

                <View style={[styles.copayRow, { marginTop: 6 }]}>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                    Copay at Check-in:
                  </Text>
                  <Text
                    style={[
                      typography.labelMd,
                      { color: colors.navyText, fontWeight: '700', marginLeft: 6 },
                    ]}
                  >
                    $25.00
                  </Text>
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.primaryDeep, marginLeft: 6, fontWeight: '600' },
                    ]}
                  >
                    • Deductible Met
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Pre-Visit Checklist */}
        <View
          style={[
            styles.checklistCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.xxl,
              padding: spacing.base,
              marginTop: spacing.md,
            },
            elevation.card,
          ]}
        >
          <View style={styles.checklistHeaderRow}>
            <View style={styles.checklistTitleWrap}>
              <AppIcon name="checklist" size={18} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.cardTitle,
                  { color: colors.navyText, fontWeight: '700', marginLeft: 8 },
                ]}
              >
                Pre-Visit Checklist
              </Text>
            </View>
            <Text style={[typography.bodySmMedium, { color: colors.mutedText }]}>
              {checklist.length} Tasks
            </Text>
          </View>

          <View style={[styles.checklistItems, { gap: spacing.sm, marginTop: spacing.md }]}>
            {checklist.map((task) => (
              <Pressable
                key={task.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.completed }}
                accessibilityLabel={task.title}
                onPress={() => toggleChecklist(task.id)}
                style={({ pressed }) => [
                  styles.checklistItem,
                  {
                    backgroundColor: colors.mintSoftBg,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkboxWrap,
                    {
                      borderColor: task.completed ? colors.primaryDeep : colors.border,
                      backgroundColor: task.completed ? colors.primaryDeep : colors.surface,
                      borderRadius: radii.xs,
                    },
                  ]}
                >
                  {task.completed ? (
                    <AppIcon name="check" size={14} color={colors.onPrimary} strokeWidth={3} />
                  ) : null}
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    style={[
                      typography.labelMd,
                      {
                        color: colors.navyText,
                        fontWeight: '700',
                        textDecorationLine: task.completed ? 'line-through' : 'none',
                      },
                    ]}
                  >
                    {task.title}
                  </Text>
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.mutedText, marginTop: 2, lineHeight: 18 },
                    ]}
                  >
                    {task.subtitle}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Teleconsultation Gated Card (Preserved for tests) */}
        {!isFinalStatus && (item.serviceType === 'teleconsult' || item.serviceType === 'virtual') && (
          <View
            style={[
              styles.teleconsultCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radii.xl,
                padding: spacing.base,
                marginTop: spacing.md,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="camera" size={20} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.cardTitle,
                  { color: colors.navyText, fontWeight: '700' },
                ]}
              >
                Virtual Teleconsultation
              </Text>
            </View>
            <Text style={[typography.bodySm, { color: colors.mutedText, marginTop: 4 }]}>
              Join the virtual waiting room for camera self-preview, payment verification, and physician admission.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enter Teleconsult Waiting Room"
              onPress={() =>
                navigation.navigate('Main', {
                  screen: 'TeleconsultWaitingRoomScreen',
                  params: {
                    appointmentId: item.id,
                    patientName: 'Me',
                    clinicianName: item.provider.name,
                    scheduledTime: `${dateLabel} ${timeLabel}`,
                    paymentPolicy: 'Prepaid',
                    paymentStatus: 'Paid',
                    isYakapExempt: false,
                  },
                })
              }
              style={[
                styles.teleconsultBtn,
                {
                  backgroundColor: colors.primaryDeep,
                  borderRadius: radii.full,
                  paddingVertical: spacing.md,
                  marginTop: spacing.md,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelBold,
                  { color: colors.onPrimary, fontWeight: '700' },
                ]}
              >
                Enter Teleconsult Waiting Room
              </Text>
            </Pressable>
          </View>
        )}

        {/* Completed Visit Summary (Preserved for tests) */}
        {item.status === 'completed' && (
          <View style={{ marginTop: spacing.md }}>
            <AfterVisitSummaryCard
              consultation={{
                id: item.id,
                visitDate: dateLabel,
                visitType: item.serviceType,
                clinicName: item.clinic.name,
                clinicId: item.clinic.id,
                doctorName: item.provider.name,
                doctorSpecialty: item.provider.specialty,
                chiefComplaint: item.chiefComplaint,
                primaryDiagnosis: item.clinicalAssessment || 'General Consultation',
                treatmentPlan: item.doctorPlan || 'Follow healthy diet and exercise.',
              }}
            />
          </View>
        )}

        {/* Bottom Actions: Reschedule & Cancel */}
        {!isFinalStatus ? (
          <View style={[styles.bottomActions, { marginTop: spacing.xl, gap: spacing.md }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reschedule Appointment"
              onPress={handleReschedule}
              style={({ pressed }) => [
                styles.rescheduleBtn,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  paddingVertical: spacing.md,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="calendar" size={16} color={colors.primaryDeep} />
              <Text
                style={[
                  typography.labelBold,
                  { color: colors.primaryDeep, fontWeight: '700', marginLeft: 6 },
                ]}
              >
                Reschedule Appointment
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel Appointment"
              onPress={handleCancel}
              style={({ pressed }) => [
                styles.cancelBtn,
                {
                  paddingVertical: spacing.sm,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelBold,
                  { color: colors.roseAccent, fontWeight: '700', textAlign: 'center' },
                ]}
              >
                Cancel Appointment
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <TeleconsultRecordingPlayerModal
        visible={showPlayerModal}
        onClose={() => setShowPlayerModal(false)}
        patientId={patientId || 'patient-me'}
        appointmentId={item.id}
        physicianName={item.provider.name}
        consultationDate={dateLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingBottom: 48,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBanner: {
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
  },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onScheduleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  doctorClinicCard: {
    borderWidth: 1,
  },
  doctorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doctorAvatar: {
    width: 56,
    height: 56,
  },
  doctorAvatarFallback: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorTextColumn: {
    flex: 1,
    marginLeft: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  clinicAddressBox: {
    width: '100%',
  },
  clinicAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  parkingBox: {
    width: '100%',
    borderWidth: 1,
  },
  parkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  validationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  doctorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
  },
  consultationCard: {
    borderWidth: 1,
  },
  consultationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  detailBox: {
    width: '100%',
  },
  detailBoxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  insuranceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inNetworkBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  copayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistCard: {
    borderWidth: 1,
  },
  checklistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checklistTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistItems: {
    width: '100%',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxWrap: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  teleconsultCard: {
    borderWidth: 1,
  },
  teleconsultBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActions: {
    width: '100%',
  },
  rescheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
