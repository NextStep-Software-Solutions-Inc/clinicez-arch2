import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { differenceInMinutes, format, isToday, parseISO, subMinutes } from 'date-fns';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { AppIcon } from '../../../components/ui/Icon';
import Screen from '../../../components/layout/Screen';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import DigitalClinicPassCard from '../../../components/appointments/DigitalClinicPassCard';
import HomeOfflinePillBanner from '../../../components/home/HomeOfflinePillBanner';
import AfterVisitSummaryCard from '../../../components/records/AfterVisitSummaryCard';
import TeleconsultRecordingPlayerModal from '../../../components/teleconsult/TeleconsultRecordingPlayerModal';
import { useClinicalEmpathyTheme } from '../../../constants/clinicalEmpathy';
import {
  HEADER_REVEAL_SCROLL_END,
  HEADER_REVEAL_SCROLL_START,
} from '../../../components/home/HomeHeader';
import { useNetworkOnline } from '../../../hooks/useNetworkOnline';
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
  const { isOnline } = useNetworkOnline();

  const appointmentId = route.params?.appointmentId ?? (route.params as any)?.id ?? '';

  const scrollY = useRef(new Animated.Value(0)).current;

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
      subtitle: 'Bring current prescription bottles or medication list for reconciliation.',
      completed: true,
    },
    {
      id: 'task-3',
      title: 'Arrive 10–15 Minutes Early',
      subtitle: 'Allows smooth check-in at clinic reception and vitals prep.',
      completed: false,
    },
  ]);

  const titleOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [HEADER_REVEAL_SCROLL_START, HEADER_REVEAL_SCROLL_END],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  const titleTranslateY = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [HEADER_REVEAL_SCROLL_START, HEADER_REVEAL_SCROLL_END],
        outputRange: [6, 0],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  const borderOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, HEADER_REVEAL_SCROLL_START],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  const loadAppointment = useCallback(async () => {
    try {
      const detail = await getAppointmentDetail(appointmentId, db);
      setItem(detail);
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
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Main', {
      screen: 'BottomTabs',
      params: { screen: 'AppointmentsScreen' },
    });
  };

  const handleGetDirections = () => {
    if (!item) return;
    const address = encodeURIComponent(
      [item.clinic.name, item.clinic.address].filter(Boolean).join(', '),
    );
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${address}`,
      android: `geo:0,0?q=${address}`,
      default: `https://www.google.com/maps/search/?api=1&query=${address}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleCallClinic = () => {
    if (!item) return;
    const phone = item.clinic.phoneNumber?.trim();
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const handleViewProviderProfile = () => {
    if (!item || item.provider.id === 'local-pending') return;
    navigation.navigate('Main', {
      screen: 'ProviderProfileScreen',
      params: { providerData: item.provider },
    });
  };

  const handleExpressCheckIn = async () => {
    if (!item) return;
    setIsCheckInLoading(true);
    try {
      await checkInAppointment(item.id, db, getToken, patientId);
      setIsCheckedIn(true);
      dialog.alert(
        'Check-In Confirmed',
        'You are checked in! Please proceed to reception when called.',
      );
    } catch {
      dialog.alert(
        'Check-In Unavailable',
        'Unable to submit check-in right now. Please present your pass at the clinic reception desk.',
      );
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
        id: item.id,
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
          { text: 'OK', onPress: () => handleBack() },
        ]);
      } catch {
        dialog.alert(
          'Cancellation Failed',
          'Could not cancel your appointment right now. Please check your connection and try again.',
        );
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

  let parsedDate: Date | null = null;
  let dateLabel = '';
  let shortDateLabel = '';
  let timeLabel = '';
  let readyTimeText: string | undefined;
  let isTodayVisit = false;
  try {
    parsedDate = parseISO(item.scheduledAt);
    dateLabel = format(parsedDate, 'EEEE, MMMM d, yyyy');
    shortDateLabel = format(parsedDate, 'EEE, MMM d');
    timeLabel = format(parsedDate, 'h:mm a');
    readyTimeText = `Ready at ${format(subMinutes(parsedDate, 15), 'h:mm a')}`;
    isTodayVisit = isToday(parsedDate);
  } catch {
    dateLabel = item.scheduledAt;
    shortDateLabel = item.scheduledAt;
  }

  const scheduleBannerText = (() => {
    if (isCheckedIn) return 'Checked in — ready at reception';
    if (!parsedDate) return item.scheduledAt;
    const minsUntil = differenceInMinutes(parsedDate, new Date());
    if (minsUntil > 15 && minsUntil <= 1440) {
      return `Check-in window opens in ${minsUntil - 15}m`;
    }
    if (minsUntil >= -30 && minsUntil <= 15) {
      return 'Check-in window open now';
    }
    return `${dateLabel}${timeLabel ? ` at ${timeLabel}` : ''}`;
  })();

  const scheduleStatusBadge =
    item.status === 'confirmed'
      ? 'On Schedule'
      : item.status === 'pending'
        ? 'Pending'
        : item.status === 'action_required'
          ? 'Action Required'
          : item.status.replace('_', ' ');

  const passCode = `#APT-${item.id.replace(/-/g, '').slice(0, 5).toUpperCase()}`;
  const qrData = JSON.stringify({
    aptId: item.id,
    patientId: item.patientId || patientId,
    clinicId: item.clinic.id,
    scheduledAt: item.scheduledAt,
    passCode,
  });

  const providerCredentialsLine = [
    item.provider.specialty || 'Healthcare Provider',
    ...(item.provider.credentials ?? []),
  ]
    .filter(Boolean)
    .join(' • ');

  const clinicPhone = item.clinic.phoneNumber?.trim() || null;

  const billingTitle =
    item.invoiceAmount != null
      ? `${item.currency ?? 'PHP'} ${item.invoiceAmount.toFixed(2)}`
      : 'Pay at Clinic Reception';
  const billingBadgeLabel =
    item.paymentStatus === 'paid'
      ? 'Paid'
      : item.paymentStatus === 'waived'
        ? 'Waived'
        : 'Standard Visit';
  const isPaidOrWaived = item.paymentStatus === 'paid' || item.paymentStatus === 'waived';

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: colors.canvas }]}
    >
      {/* Seamless Sticky Header with Scroll-Animated Summary */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.canvas, paddingHorizontal: spacing.base }]}>
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Appointments"
            onPress={handleBack}
            hitSlop={8}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <AppIcon name="chevronLeft" size={22} color={colors.navyText} />
            <Text
              style={[
                typography.headlineSm,
                { color: colors.navyText, fontWeight: '700', marginLeft: spacing.xxs },
              ]}
            >
              Appointments
            </Text>
          </Pressable>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.scrolledSummary,
              {
                opacity: titleOpacity,
                transform: [{ translateY: titleTranslateY }],
              },
            ]}
          >
            <Text numberOfLines={1} style={[typography.labelBold, { color: colors.navyText }]}>
              {item.provider.name}
            </Text>
            {timeLabel ? (
              <Text numberOfLines={1} style={[typography.bodySm, { color: colors.mutedText }]}>
                {timeLabel}
              </Text>
            ) : null}
          </Animated.View>

          <View style={[styles.navActions, { gap: spacing.md }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share appointment"
              // Newly introduced header action with no share flow wired yet: strict NO-OP
              onPress={() => {}}
              hitSlop={8}
            >
              <AppIcon name="share" size={20} color={colors.navyText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add to Calendar"
              // Newly introduced header action with no native calendar sync screen: strict NO-OP
              onPress={() => {}}
              hitSlop={8}
            >
              <AppIcon name="calendarPlus" size={20} color={colors.navyText} />
            </Pressable>
          </View>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.headerHairline,
            {
              backgroundColor: colors.border,
              opacity: borderOpacity,
            },
          ]}
        />
      </View>

      <Animated.ScrollView
        style={styles.flex}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: Platform.OS !== 'web' },
        )}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: spacing.base,
            paddingTop: spacing.xs,
            paddingBottom: isOnline ? 48 : 92,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Canvas Status Row (no outer white box) */}
        <View style={[styles.statusCanvasRow, { marginTop: spacing.xs }]}>
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
              numberOfLines={1}
              style={[
                typography.overline,
                {
                  color:
                    item.status === 'confirmed'
                      ? colors.primary
                      : item.status === 'canceled'
                        ? colors.roseAccent
                        : colors.amberText,
                },
              ]}
            >
              {item.status.toUpperCase()} •{' '}
              {isTodayVisit ? `TODAY, ${timeLabel}` : `${shortDateLabel.toUpperCase()}${timeLabel ? `, ${timeLabel}` : ''}`}
            </Text>
          </View>

          <Text style={[typography.bodySm, { color: colors.mutedText }]}>
            {item.durationMinutes} min visit
          </Text>
        </View>

        {/* Check-in Window Countdown Pill */}
        {!isFinalStatus ? (
          <View
            style={[
              styles.countdownCard,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 2,
                marginTop: spacing.sm,
              },
            ]}
          >
            <View style={styles.countdownLeft}>
              <AppIcon name="clock" size={16} color={colors.primary} />
              <Text
                numberOfLines={1}
                style={[
                  typography.bodySmMedium,
                  { color: colors.navyText, marginLeft: spacing.xs + 2, flexShrink: 1 },
                ]}
              >
                {scheduleBannerText}
              </Text>
            </View>
            <View
              style={[
                styles.onScheduleBadge,
                {
                  backgroundColor:
                    item.status === 'confirmed' ? colors.mintBadgeBg : colors.amberSoftBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelSm,
                  {
                    color:
                      item.status === 'confirmed' ? colors.primaryDeep : colors.amberText,
                    fontWeight: '700',
                  },
                ]}
              >
                {scheduleStatusBadge}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Digital Clinic Pass Card */}
        <View style={{ marginTop: spacing.md }}>
          <DigitalClinicPassCard
            passNumber={passCode}
            clinicName={item.clinic.name}
            qrPayload={qrData}
            isCheckedIn={isCheckedIn}
            readyTimeText={readyTimeText}
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
              borderColor: colors.borderSubtle,
              borderRadius: radii.xxl,
              padding: spacing.base,
              marginTop: spacing.md,
            },
            elevation.card,
          ]}
        >
          {/* Doctor Header (wires to ProviderProfileScreen when provider is assigned) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View provider ${item.provider.name}`}
            disabled={item.provider.id === 'local-pending'}
            onPress={handleViewProviderProfile}
            style={({ pressed }) => [
              styles.doctorHeaderRow,
              { opacity: pressed && item.provider.id !== 'local-pending' ? 0.85 : 1 },
            ]}
          >
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
                    { color: colors.primary, fontWeight: '700' },
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
                {providerCredentialsLine}
              </Text>
              {item.provider.rating > 0 ? (
                <View style={styles.ratingRow}>
                  <AppIcon name="star" size={13} color={colors.amberText} />
                  <Text
                    style={[
                      typography.labelSm,
                      { color: colors.navyText, fontWeight: '700', marginLeft: 4 },
                    ]}
                  >
                    {item.provider.rating.toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          {/* Clinic Info Container */}
          <View
            style={[
              styles.clinicAddressBox,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.md,
              },
            ]}
          >
            <View style={styles.clinicAddressRow}>
              <AppIcon name="building" size={16} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text
                  style={[
                    typography.labelMd,
                    { color: colors.navyText, fontWeight: '700' },
                  ]}
                >
                  {item.clinic.name}
                </Text>
                {item.clinic.address ? (
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.mutedText, marginTop: 2 },
                    ]}
                  >
                    {item.clinic.address}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Stylized Clinic Location Callout */}
          <View
            style={[
              styles.locationBox,
              {
                backgroundColor: colors.surfaceLow,
                borderColor: colors.borderSubtle,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            <View style={styles.locationRow}>
              <AppIcon name="location" size={16} color={colors.primary} />
              <Text
                numberOfLines={2}
                style={[
                  typography.bodySmMedium,
                  { color: colors.navyText, marginLeft: spacing.xs + 2, flex: 1 },
                ]}
              >
                {item.clinic.address || item.clinic.name}
              </Text>
            </View>
          </View>

          {/* Quick Action Buttons: Call Clinic | Directions */}
          <View style={[styles.doctorActionsRow, { marginTop: spacing.md, gap: spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call Clinic"
              onPress={clinicPhone ? handleCallClinic : () => {}}
              style={({ pressed }) => [
                styles.subActionBtn,
                {
                  backgroundColor: colors.surfaceLow,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="phone" size={15} color={colors.primary} />
              <Text
                style={[
                  typography.labelBold,
                  { color: colors.navyText, marginLeft: 6 },
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
                  backgroundColor: colors.surfaceLow,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="cornerUpRight" size={15} color={colors.primary} />
              <Text
                style={[
                  typography.labelBold,
                  { color: colors.navyText, marginLeft: 6 },
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
              borderColor: colors.borderSubtle,
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
                  backgroundColor: colors.mintBadgeBg,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  typography.labelSm,
                  { color: colors.primaryDeep, fontWeight: '700' },
                ]}
              >
                {item.serviceType || 'Consultation'}
              </Text>
            </View>
          </View>

          {/* Subject & Reason Box */}
          <View
            style={[
              styles.detailBox,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.md,
              },
            ]}
          >
            <View style={styles.detailBoxRow}>
              <AppIcon name="heartPulse" size={18} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text
                  style={[
                    typography.labelMd,
                    { color: colors.navyText, fontWeight: '700' },
                  ]}
                >
                  {item.subject || item.serviceType || 'Scheduled Consultation'}
                </Text>
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.mutedText, marginTop: 4, lineHeight: 18 },
                  ]}
                >
                  {item.chiefComplaint ||
                    item.notes ||
                    'No additional consultation notes recorded.'}
                </Text>
              </View>
            </View>
          </View>

          {/* Payment / Billing Status Box */}
          <View
            style={[
              styles.detailBox,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            <View style={styles.detailBoxRow}>
              <AppIcon name="shieldPlus" size={18} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <View style={styles.insuranceTopRow}>
                  <Text
                    style={[
                      typography.labelMd,
                      { color: colors.navyText, fontWeight: '700' },
                    ]}
                  >
                    {billingTitle}
                  </Text>
                  <View
                    style={[
                      styles.inNetworkBadge,
                      {
                        backgroundColor: isPaidOrWaived
                          ? colors.emeraldSoftBg
                          : colors.slatePillBg,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.labelSm,
                        {
                          color: isPaidOrWaived
                            ? colors.emeraldText
                            : colors.slatePillText,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {billingBadgeLabel}
                    </Text>
                  </View>
                </View>

                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.mutedText, marginTop: 4 },
                  ]}
                >
                  Clinic billing & payment status
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sealed Clinical Visit Summary (when provided by clinic) */}
        {(item.clinicalAssessment || item.doctorPlan || item.prescriptionsSummary) ? (
          <View
            style={[
              styles.consultationCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xxl,
                padding: spacing.base,
                marginTop: spacing.md,
              },
              elevation.card,
            ]}
          >
            <View style={styles.consultationHeaderRow}>
              <Text style={[typography.cardTitle, { color: colors.navyText }]}>
                Clinical Visit Summary
              </Text>
              <View
                style={[
                  styles.categoryBadge,
                  { backgroundColor: colors.emeraldSoftBg, borderRadius: radii.full },
                ]}
              >
                <Text style={[typography.labelSm, { color: colors.emeraldText }]}>
                  Sealed Record
                </Text>
              </View>
            </View>
            {item.clinicalAssessment ? (
              <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.sm }]}>
                {item.clinicalAssessment}
              </Text>
            ) : null}
            {item.doctorPlan ? (
              <Text style={[typography.bodySm, { color: colors.mutedText, marginTop: spacing.xs }]}>
                {item.doctorPlan}
              </Text>
            ) : null}
            {item.prescriptionsSummary ? (
              <Text style={[typography.bodySmMedium, { color: colors.primary, marginTop: spacing.xs }]}>
                {item.prescriptionsSummary}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Attached Documents (when present) */}
        {item.attachedDocuments.length > 0 ? (
          <View
            style={[
              styles.consultationCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xxl,
                padding: spacing.base,
                marginTop: spacing.md,
              },
              elevation.card,
            ]}
          >
            <Text style={[typography.cardTitle, { color: colors.navyText }]}>
              Attached Documents ({item.attachedDocuments.length})
            </Text>
            <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              {item.attachedDocuments.map((doc) => (
                <View
                  key={doc.id}
                  style={[
                    styles.detailBox,
                    {
                      backgroundColor: colors.surfaceLow,
                      borderRadius: radii.md,
                      padding: spacing.sm,
                    },
                  ]}
                >
                  <Text style={[typography.labelMd, { color: colors.navyText }]}>
                    {doc.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Pre-Visit Checklist */}
        <View
          style={[
            styles.checklistCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              borderRadius: radii.xxl,
              padding: spacing.base,
              marginTop: spacing.md,
            },
            elevation.card,
          ]}
        >
          <View style={styles.checklistHeaderRow}>
            <View style={styles.checklistTitleWrap}>
              <AppIcon name="clipboardCheck" size={18} color={colors.primary} />
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
                    backgroundColor: colors.surfaceLow,
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
                      borderColor: task.completed ? colors.primary : colors.border,
                      backgroundColor: task.completed ? colors.primary : colors.surface,
                      borderRadius: radii.xs,
                    },
                  ]}
                >
                  {task.completed ? (
                    <AppIcon name="check" size={14} color={colors.onPrimary} strokeWidth={3} />
                  ) : null}
                </View>

                <View style={{ flex: 1, marginLeft: spacing.sm + 2 }}>
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

        {/* Teleconsultation Gated Card (Preserved invariant for virtual visits) */}
        {!isFinalStatus && (item.serviceType === 'teleconsult' || item.serviceType === 'virtual') && (
          <View
            style={[
              styles.teleconsultCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xl,
                padding: spacing.base,
                marginTop: spacing.md,
              },
              elevation.card,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppIcon name="camera" size={20} color={colors.primary} />
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
                  backgroundColor: colors.primary,
                  borderRadius: radii.full,
                  paddingVertical: spacing.md,
                  marginTop: spacing.md,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelBold,
                  { color: colors.onPrimary },
                ]}
              >
                Enter Teleconsult Waiting Room
              </Text>
            </Pressable>
          </View>
        )}

        {/* Completed Visit Summary (Preserved invariant) */}
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
                  backgroundColor: colors.surfaceLow,
                  borderRadius: radii.full,
                  borderColor: colors.border,
                  paddingVertical: spacing.md,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <AppIcon name="calendar" size={16} color={colors.primary} />
              <Text
                style={[
                  typography.labelBold,
                  { color: colors.primary, marginLeft: 6 },
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
                  { color: colors.roseAccent, textAlign: 'center' },
                ]}
              >
                Cancel Appointment
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Animated.ScrollView>

      <HomeOfflinePillBanner isOnline={isOnline} />

      <TeleconsultRecordingPlayerModal
        visible={showPlayerModal}
        onClose={() => setShowPlayerModal(false)}
        patientId={patientId || 'patient-me'}
        appointmentId={item.id}
        physicianName={item.provider.name}
        consultationDate={dateLabel}
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
  stickyHeader: {
    width: '100%',
    position: 'relative',
    zIndex: 10,
  },
  navBar: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  scrolledSummary: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    minWidth: 0,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  statusCanvasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
  },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  countdownLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  onScheduleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 0,
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
  locationBox: {
    width: '100%',
    borderWidth: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doctorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subActionBtn: {
    flex: 1,
    minHeight: 44,
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
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 1,
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
    gap: 8,
  },
  inNetworkBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
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
    minHeight: 48,
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
