import React, { memo, useEffect, useState, useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  isToday,
  startOfToday,
  subDays,
} from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import {
  hasDateStripAvailability,
  resolveAvailableDaysOfWeek,
  resolveDoctorAffiliations,
} from '../../services/search/directorySearchService';
import type { DirectoryDoctorDto } from '../../services/api/homeApi';
import type { AvailableSlot } from '../../services/appointments/types';

export type ConsultationMode = 'in_person' | 'telehealth';
export type TimeOfDayPeriod = 'morning' | 'afternoon' | 'evening';

export interface BookingSlotStepProps {
  doctor: DirectoryDoctorDto;
  selectedClinicId?: string;
  onSelectClinic?: (clinicId: string) => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  selectedSlot: AvailableSlot | null;
  onSelectSlot: (slot: AvailableSlot) => void;
  availableSlots: AvailableSlot[];
  isLoadingSlots?: boolean;
  consultationMode: ConsultationMode;
  onChangeConsultationMode: (mode: ConsultationMode) => void;
  serviceDurationMinutes?: number;
  onChangeDoctor: () => void;
}

function getSlotPeriod(slot: AvailableSlot): TimeOfDayPeriod {
  const raw = (slot.period || '').toLowerCase();
  if (raw === 'morning' || raw === 'afternoon' || raw === 'evening') {
    return raw;
  }
  const hour = parseInt(slot.time.split(':')[0] || '10', 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function extractInitials(name: string): string {
  const clean = name.replace(/^Dr\.\s*/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DR';
  return parts
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

function BookingSlotStepComponent({
  doctor,
  selectedClinicId,
  onSelectClinic,
  selectedDate,
  onSelectDate,
  selectedSlot,
  onSelectSlot,
  availableSlots,
  isLoadingSlots = false,
  consultationMode,
  onChangeConsultationMode,
  serviceDurationMinutes = 30,
  onChangeDoctor,
}: BookingSlotStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [selectedPeriod, setSelectedPeriod] = useState<TimeOfDayPeriod>('morning');
  const affiliations = useMemo(() => resolveDoctorAffiliations(doctor), [doctor]);
  const activeClinicId = selectedClinicId ?? doctor.clinicId;
  const activeAffiliation = useMemo(
    () => affiliations.find((a) => a.clinicId === activeClinicId) ?? affiliations[0] ?? null,
    [affiliations, activeClinicId],
  );
  const availableDaysOfWeek = useMemo(
    () => resolveAvailableDaysOfWeek(activeAffiliation?.availabilities),
    [activeAffiliation?.availabilities],
  );
  const isBookingPaused = !doctor.clinicSupportsAppointments;

  const openSlots = useMemo(
    () => availableSlots.filter((s) => s.available !== false),
    [availableSlots],
  );

  // Stable 6-day window containing selectedDate without shifting cards unexpectedly on click
  const dateStripDays = useMemo(() => {
    const today = startOfToday();
    const diffDays = Math.max(0, differenceInCalendarDays(selectedDate, today));
    const windowOffset = Math.floor(diffDays / 6) * 6;
    const windowStart = addDays(today, windowOffset);
    return Array.from({ length: 6 }, (_, i) => addDays(windowStart, i));
  }, [selectedDate]);

  const periodCounts = useMemo(() => {
    let morning = 0;
    let afternoon = 0;
    let evening = 0;
    openSlots.forEach((slot) => {
      const period = getSlotPeriod(slot);
      if (period === 'morning') morning += 1;
      else if (period === 'afternoon') afternoon += 1;
      else evening += 1;
    });
    return { morning, afternoon, evening };
  }, [openSlots]);

  // If the current period has zero slots while another period has slots, switch to the first available period
  useEffect(() => {
    if (openSlots.length === 0) return;
    if (periodCounts[selectedPeriod] > 0) return;
    if (periodCounts.morning > 0) setSelectedPeriod('morning');
    else if (periodCounts.afternoon > 0) setSelectedPeriod('afternoon');
    else if (periodCounts.evening > 0) setSelectedPeriod('evening');
  }, [openSlots.length, periodCounts, selectedPeriod]);

  const filteredSlots = useMemo(
    () => openSlots.filter((slot) => getSlotPeriod(slot) === selectedPeriod),
    [openSlots, selectedPeriod],
  );

  const recommendedSlotId = useMemo(
    () => (openSlots.find((s) => s.time.startsWith('10:')) ?? openSlots[0])?.id ?? null,
    [openSlots],
  );

  const formattedDateTitle = useMemo(
    () => format(selectedDate, 'MMMM yyyy'),
    [selectedDate],
  );

  const locationLabel = doctor.clinicAddress
    ? `${doctor.clinicName} • ${doctor.clinicAddress}`
    : doctor.clinicName;

  const durationMins = serviceDurationMinutes > 0 ? serviceDurationMinutes : 30;
  const isAtToday = isToday(selectedDate);

  const PERIOD_TABS: Array<{
    key: TimeOfDayPeriod;
    label: string;
    icon: 'sun' | 'sunset' | 'moon';
    count: number;
  }> = [
    { key: 'morning', label: 'Morning', icon: 'sun', count: periodCounts.morning },
    { key: 'afternoon', label: 'Afternoon', icon: 'sunset', count: periodCounts.afternoon },
    { key: 'evening', label: 'Evening', icon: 'moon', count: periodCounts.evening },
  ];

  return (
    <View style={styles.container}>
      {/* Selected Doctor Summary Card */}
      <View
        style={[
          styles.doctorSummaryCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
            borderRadius: radii.xl,
            padding: spacing.base,
          },
          elevation.card,
        ]}
      >
        <View style={styles.doctorHeaderRow}>
          <View style={styles.avatarContainer}>
            {doctor.avatarUrl ? (
              <Image
                source={{ uri: doctor.avatarUrl }}
                style={[styles.avatar, { borderRadius: radii.full }]}
              />
            ) : (
              <View
                style={[
                  styles.avatarPlaceholder,
                  {
                    borderRadius: radii.full,
                    backgroundColor: colors.mintSoftBg,
                  },
                ]}
              >
                <Text style={[typography.cardTitle, { color: colors.primaryDeep }]}>
                  {extractInitials(doctor.name)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.doctorInfoCol}>
            <Text style={[typography.cardTitle, { color: colors.navyText }]} numberOfLines={1}>
              {doctor.name}
            </Text>
            <Text
              style={[
                typography.bodySmMedium,
                { color: colors.primary, marginTop: spacing.xxs },
              ]}
              numberOfLines={1}
            >
              {doctor.specialty}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change doctor"
            onPress={onChangeDoctor}
            style={({ pressed }) => [
              styles.changeBtn,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs + 2,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[typography.labelSm, { color: colors.primary, marginRight: spacing.xxs }]}>
              Change
            </Text>
            <AppIcon name="arrowLeftRight" size={12} color={colors.primary} />
          </Pressable>
        </View>

        <View
          style={[
            styles.metaBottomRow,
            {
              marginTop: spacing.md,
              paddingTop: spacing.sm,
              borderTopColor: colors.borderSubtle,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <AppIcon name="location" size={14} color={colors.mutedText} />
          <Text
            style={[
              typography.bodySm,
              { color: colors.mutedText, flex: 1, marginLeft: spacing.xs },
            ]}
            numberOfLines={1}
          >
            {locationLabel}
          </Text>

          {doctor.isVerified ? (
            <View
              style={[
                styles.verifiedPill,
                {
                  backgroundColor: colors.mintSoftBg,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs,
                  marginLeft: spacing.sm,
                },
              ]}
            >
              <AppIcon name="badgeCheck" size={12} color={colors.primary} />
              <Text
                style={[
                  typography.labelSm,
                  { color: colors.primary, marginLeft: spacing.xxs },
                ]}
              >
                Verified
              </Text>
            </View>
          ) : null}
        </View>

        {affiliations.length > 1 && onSelectClinic ? (
          <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
            <Text style={[typography.labelSm, { color: colors.mutedText }]}>
              Clinic location ({affiliations.length})
            </Text>
            <View style={[styles.clinicSelectorWrap, { gap: spacing.xs }]}>
              {affiliations.map((aff) => {
                const isSelectedClinic = aff.clinicId === activeClinicId;
                return (
                  <Pressable
                    key={`${aff.clinicId}-${aff.providerId ?? 'primary'}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelectedClinic }}
                    onPress={() => onSelectClinic(aff.clinicId)}
                    style={[
                      styles.clinicChip,
                      {
                        backgroundColor: isSelectedClinic
                          ? colors.mintBadgeBg
                          : colors.surfaceLow,
                        borderColor: isSelectedClinic ? colors.primary : colors.border,
                        borderRadius: radii.lg,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: spacing.xs,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.labelSm,
                        { color: isSelectedClinic ? colors.primary : colors.navyText },
                      ]}
                      numberOfLines={1}
                    >
                      {aff.clinicName}
                    </Text>
                    {!aff.supportsAppointments ? (
                      <Text
                        style={[
                          typography.labelSm,
                          { color: colors.amberText, marginLeft: spacing.xs },
                        ]}
                      >
                        Booking Paused
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {isBookingPaused ? (
          <View
            style={[
              styles.pausedBanner,
              {
                backgroundColor: colors.amberSoftBg,
                borderRadius: radii.lg,
                padding: spacing.md,
                marginTop: spacing.md,
                gap: spacing.sm,
              },
            ]}
          >
            <AppIcon name="alert" size={16} color={colors.amberText} />
            <Text style={[typography.bodySm, { color: colors.amberText, flex: 1 }]}>
              Booking Paused: Online booking is currently paused for this clinic.
            </Text>
          </View>
        ) : null}
      </View>

      {/* Consultation Mode Segmented Toggle */}
      <View
        style={[
          styles.modeToggleContainer,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.xl,
            padding: spacing.xs,
            marginTop: spacing.lg,
          },
        ]}
      >
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: consultationMode === 'in_person' }}
          accessibilityLabel="In-Person Visit"
          onPress={() => onChangeConsultationMode('in_person')}
          style={[
            styles.modeTab,
            {
              borderRadius: radii.lg,
              backgroundColor:
                consultationMode === 'in_person' ? colors.surface : 'transparent',
            },
            consultationMode === 'in_person' ? elevation.card : null,
          ]}
        >
          <AppIcon
            name="building"
            size={16}
            color={consultationMode === 'in_person' ? colors.primary : colors.mutedText}
          />
          <Text
            style={[
              consultationMode === 'in_person' ? typography.labelBold : typography.bodyMedium,
              {
                color: consultationMode === 'in_person' ? colors.primary : colors.mutedText,
                marginLeft: spacing.xs,
              },
            ]}
          >
            In-Person Visit
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: consultationMode === 'telehealth' }}
          accessibilityLabel="Telehealth Video"
          onPress={() => onChangeConsultationMode('telehealth')}
          style={[
            styles.modeTab,
            {
              borderRadius: radii.lg,
              backgroundColor:
                consultationMode === 'telehealth' ? colors.surface : 'transparent',
            },
            consultationMode === 'telehealth' ? elevation.card : null,
          ]}
        >
          <AppIcon
            name="video"
            size={16}
            color={consultationMode === 'telehealth' ? colors.primary : colors.mutedText}
          />
          <Text
            style={[
              consultationMode === 'telehealth' ? typography.labelBold : typography.bodyMedium,
              {
                color: consultationMode === 'telehealth' ? colors.primary : colors.mutedText,
                marginLeft: spacing.xs,
              },
            ]}
          >
            Telehealth Video
          </Text>
        </Pressable>
      </View>

      {/* Calendar Month & 6-Day Strip */}
      <View style={{ marginTop: spacing.xl }}>
        <View style={styles.monthHeaderRow}>
          <View style={styles.monthTitleCluster}>
            <Text style={[typography.headlineSm, { color: colors.navyText }]}>
              {formattedDateTitle}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              onPress={() => onSelectDate(startOfToday())}
              style={({ pressed }) => [
                styles.todayPill,
                {
                  backgroundColor: isAtToday ? colors.mintSoftBg : colors.mintBadgeBg,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.sm + 2,
                  paddingVertical: spacing.xxs + 1,
                  marginLeft: spacing.sm,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={[typography.labelSm, { color: colors.primary }]}>Today</Text>
            </Pressable>
          </View>

          <View style={styles.monthControlsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => onSelectDate(subDays(selectedDate, 1))}
              disabled={isAtToday}
              style={({ pressed }) => [
                styles.arrowBtn,
                {
                  borderRadius: radii.full,
                  backgroundColor: colors.surfaceLow,
                  opacity: isAtToday ? 0.35 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <AppIcon name="chevronLeft" size={16} color={colors.navyText} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next day"
              onPress={() => onSelectDate(addDays(selectedDate, 1))}
              style={({ pressed }) => [
                styles.arrowBtn,
                {
                  borderRadius: radii.full,
                  backgroundColor: colors.surfaceLow,
                  marginLeft: spacing.xs,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <AppIcon name="forward" size={16} color={colors.navyText} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.dateStripRow, { gap: spacing.xs + 2, marginTop: spacing.md }]}>
          {dateStripDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const hasAvailability = hasDateStripAvailability({
              day,
              isSelected,
              isBookingPaused,
              isLoadingSlots,
              openSlotsCount: openSlots.length,
              availableDaysOfWeek,
            });
            const dayName = format(day, 'EEE');
            const dayNum = format(day, 'dd');

            return (
              <Pressable
                key={day.toISOString()}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={format(day, 'EEEE, MMMM d')}
                onPress={() => onSelectDate(day)}
                style={({ pressed }) => [
                  styles.dayCard,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.borderSubtle,
                    borderWidth: 1,
                    paddingVertical: spacing.md,
                    opacity: pressed ? 0.85 : 1,
                  },
                  isSelected ? elevation.card : null,
                ]}
              >
                <Text
                  style={[
                    typography.bodySm,
                    {
                      color: isSelected ? colors.healthPassMuted : colors.mutedText,
                      textAlign: 'center',
                    },
                  ]}
                >
                  {dayName}
                </Text>

                <Text
                  style={[
                    typography.cardTitle,
                    {
                      color: isSelected ? colors.onPrimary : colors.navyText,
                      textAlign: 'center',
                      marginTop: spacing.xxs + 2,
                    },
                  ]}
                >
                  {dayNum}
                </Text>

                {hasAvailability ? (
                  <View
                    style={[
                      styles.dayDot,
                      {
                        borderRadius: radii.full,
                        backgroundColor: isSelected
                          ? colors.inverseAccent
                          : colors.emeraldDot,
                        marginTop: spacing.xs,
                      },
                    ]}
                  />
                ) : (
                  <View style={[styles.dayDot, { marginTop: spacing.xs }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Time of Day Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.periodPillsRow, { marginTop: spacing.xl, gap: spacing.sm }]}
      >
        {PERIOD_TABS.map((tab) => {
          const isSelected = selectedPeriod === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedPeriod(tab.key)}
              style={({ pressed }) => [
                styles.periodPill,
                {
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  backgroundColor: isSelected ? colors.primary : colors.surfaceLow,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <AppIcon
                name={tab.icon}
                size={14}
                color={isSelected ? colors.onPrimary : colors.navyText}
              />
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: isSelected ? colors.onPrimary : colors.navyText,
                    marginLeft: spacing.xs,
                  },
                ]}
              >
                {tab.label}
              </Text>
              <View
                style={[
                  styles.periodCountBadge,
                  {
                    borderRadius: radii.full,
                    backgroundColor: isSelected
                      ? colors.primaryVibrant
                      : colors.surfaceContainer,
                    marginLeft: spacing.xs,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.labelSm,
                    { color: isSelected ? colors.onPrimary : colors.navyText },
                  ]}
                >
                  {tab.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Available Slots Header */}
      <View style={[styles.slotsHeaderRow, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
        <Text style={[typography.overline, { color: colors.mutedText }]}>
          AVAILABLE SLOTS ({format(selectedDate, 'EEE, MMM d').toUpperCase()})
        </Text>

        <View style={styles.fastestBadge}>
          <View
            style={[
              styles.sectionDot,
              { borderRadius: radii.full, backgroundColor: colors.emeraldDot },
            ]}
          />
          <Text
            style={[
              typography.labelSm,
              { color: colors.primary, marginLeft: spacing.xxs + 2 },
            ]}
          >
            Fastest Option
          </Text>
        </View>
      </View>

      {/* Slots 2-Column Grid */}
      {isLoadingSlots ? (
        <View style={styles.loadingContainer}>
          <Text style={[typography.bodyMd, { color: colors.mutedText }]}>
            Loading available slots...
          </Text>
        </View>
      ) : filteredSlots.length === 0 ? (
        <View
          style={[
            styles.noSlotsBox,
            {
              backgroundColor: colors.surfaceLow,
              borderRadius: radii.lg,
              padding: spacing.xl,
            },
          ]}
        >
          <Text
            style={[
              typography.bodyMd,
              { color: colors.mutedText, textAlign: 'center' },
            ]}
          >
            No slots available for this period. Try selecting another date or time of day.
          </Text>
        </View>
      ) : (
        <View style={[styles.slotsGrid, { rowGap: spacing.md }]}>
          {filteredSlots.map((slot) => {
            const isSelected = selectedSlot?.id === slot.id;
            const isRecommended = slot.id === recommendedSlotId;
            const slotSubtitle = isRecommended
              ? 'Recommended'
              : `${consultationMode === 'telehealth' ? 'Telehealth' : 'In-Person'} • ${durationMins} mins`;

            return (
              <Pressable
                key={slot.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled: isBookingPaused }}
                accessibilityLabel={`Slot at ${slot.displayTime || slot.time}`}
                disabled={isBookingPaused}
                onPress={() => {
                  if (!isBookingPaused) onSelectSlot(slot);
                }}
                style={({ pressed }) => [
                  styles.slotCard,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.borderSubtle,
                    borderWidth: 1,
                    padding: spacing.md,
                    opacity: pressed ? 0.88 : 1,
                  },
                  elevation.card,
                ]}
              >
                <View style={styles.slotCardTopRow}>
                  <Text
                    style={[
                      typography.headlineSm,
                      {
                        color: isSelected ? colors.onPrimary : colors.navyText,
                      },
                    ]}
                  >
                    {slot.displayTime || slot.time}
                  </Text>

                  <View
                    style={[
                      styles.slotCheckCircle,
                      {
                        borderRadius: radii.full,
                        backgroundColor: isSelected
                          ? colors.inverseAccent
                          : colors.surface,
                        borderColor: isSelected ? colors.inverseAccent : colors.border,
                      },
                    ]}
                  >
                    {isSelected ? (
                      <AppIcon
                        name="check"
                        size={11}
                        color={colors.primaryDeep}
                        strokeWidth={3}
                      />
                    ) : null}
                  </View>
                </View>

                <View style={[styles.slotCardBottomRow, { marginTop: spacing.xs }]}>
                  <Text
                    style={[
                      typography.bodySm,
                      {
                        color: isSelected ? colors.healthPassMuted : colors.mutedText,
                        flex: 1,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {slotSubtitle}
                  </Text>

                  {isRecommended ? (
                    <View
                      style={[
                        styles.primeBadge,
                        {
                          backgroundColor: isSelected
                            ? colors.primaryVibrant
                            : colors.mintBadgeBg,
                          borderRadius: radii.full,
                          paddingHorizontal: spacing.xs + 2,
                          paddingVertical: spacing.xxs,
                          marginLeft: spacing.xxs,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.labelSm,
                          {
                            color: isSelected ? colors.onPrimary : colors.primaryDeep,
                          },
                        ]}
                      >
                        Prime
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Arrival Guarantee Callout */}
      <View
        style={[
          styles.arrivalBox,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.xl,
            padding: spacing.base,
            marginTop: spacing.xl,
            gap: spacing.sm,
          },
        ]}
      >
        <View
          style={[
            styles.guaranteeIconBadge,
            { backgroundColor: colors.mintAvatarBg, borderRadius: radii.full },
          ]}
        >
          <AppIcon name="shieldCheck" size={18} color={colors.mintAvatarText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.labelBold, { color: colors.navyText }]}>
            On-Time Clinic Arrival Guarantee
          </Text>
          <Text style={[typography.bodySm, { color: colors.bodyText, marginTop: spacing.xxs }]}>
            {consultationMode === 'telehealth'
              ? 'Please join your virtual waiting room 10 minutes prior to test audio and video.'
              : 'Please arrive 10 minutes prior to complete routine blood pressure and vitals triage.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  doctorSummaryCard: {
    width: '100%',
    borderWidth: 1,
  },
  doctorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  metaBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clinicSelectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  clinicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  pausedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeToggleContainer: {
    flexDirection: 'row',
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayPill: {},
  arrowBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: 5,
    height: 5,
  },
  periodPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodCountBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fastestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionDot: {
    width: 7,
    height: 7,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  noSlotsBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slotCard: {
    width: '48%',
    justifyContent: 'space-between',
  },
  slotCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotCheckCircle: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primeBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivalBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guaranteeIconBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const BookingSlotStep = memo(BookingSlotStepComponent);
export default BookingSlotStep;
