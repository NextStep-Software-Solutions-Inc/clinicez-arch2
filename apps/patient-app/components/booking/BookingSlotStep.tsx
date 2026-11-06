import React, { memo, useState, useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  format,
  addDays,
  subDays,
  isSameDay,
  isToday,
  parseISO,
  startOfToday,
} from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { PatientSearchDoctorDto } from '../../services/api/homeApi';
import type { AvailableSlot } from '../../services/appointments/types';

export type ConsultationMode = 'in_person' | 'telehealth';
export type TimeOfDayPeriod = 'all' | 'morning' | 'afternoon' | 'evening';

export interface BookingSlotStepProps {
  doctor: PatientSearchDoctorDto;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  selectedSlot: AvailableSlot | null;
  onSelectSlot: (slot: AvailableSlot) => void;
  availableSlots: AvailableSlot[];
  isLoadingSlots?: boolean;
  consultationMode: ConsultationMode;
  onChangeConsultationMode: (mode: ConsultationMode) => void;
  onChangeDoctor: () => void;
  onProceed: () => void;
}

function BookingSlotStepComponent({
  doctor,
  selectedDate,
  onSelectDate,
  selectedSlot,
  onSelectSlot,
  availableSlots,
  isLoadingSlots = false,
  consultationMode,
  onChangeConsultationMode,
  onChangeDoctor,
  onProceed,
}: BookingSlotStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [selectedPeriod, setSelectedPeriod] = useState<TimeOfDayPeriod>('morning');

  // Generate 7-day strip centered on selectedDate or starting from today
  const dateStripDays = useMemo(() => {
    const today = startOfToday();
    // Anchor to today or start a few days earlier if selectedDate is further out
    const baseDate = selectedDate < today ? today : selectedDate;
    const days: Date[] = [];
    for (let i = -1; i < 6; i++) {
      const d = addDays(baseDate, i);
      if (d >= today) {
        days.push(d);
      }
    }
    // Ensure at least 6 days
    while (days.length < 6) {
      days.push(addDays(days[days.length - 1] || today, 1));
    }
    return days.slice(0, 6);
  }, [selectedDate]);

  // Filter slots by period
  const periodCounts = useMemo(() => {
    let morning = 0;
    let afternoon = 0;
    let evening = 0;
    availableSlots.forEach((s) => {
      const p = (s.period || '').toLowerCase();
      if (p === 'morning') morning++;
      else if (p === 'afternoon') afternoon++;
      else if (p === 'evening') evening++;
      else {
        // Fallback: estimate by time
        const hour = parseInt(s.time.split(':')[0] || '10', 10);
        if (hour < 12) morning++;
        else if (hour < 17) afternoon++;
        else evening++;
      }
    });
    return { morning, afternoon, evening };
  }, [availableSlots]);

  const filteredSlots = useMemo(() => {
    if (selectedPeriod === 'all') return availableSlots;
    return availableSlots.filter((s) => {
      const p = (s.period || '').toLowerCase();
      if (p === selectedPeriod) return true;
      const hour = parseInt(s.time.split(':')[0] || '10', 10);
      if (selectedPeriod === 'morning' && hour < 12) return true;
      if (selectedPeriod === 'afternoon' && hour >= 12 && hour < 17) return true;
      if (selectedPeriod === 'evening' && hour >= 17) return true;
      return false;
    });
  }, [availableSlots, selectedPeriod]);

  const formattedDateTitle = useMemo(
    () => format(selectedDate, 'MMMM yyyy'),
    [selectedDate]
  );

  const formattedSlotSummary = useMemo(() => {
    if (!selectedSlot) return null;
    const dateStr = format(selectedDate, 'EEE, MMM d');
    const timeStr = selectedSlot.displayTime || selectedSlot.time;
    return `${dateStr} at ${timeStr} • ${doctor.name}`;
  }, [selectedSlot, selectedDate, doctor.name]);

  return (
    <View style={styles.container}>
      {/* Selected Doctor Summary Card */}
      <View
        style={[
          styles.doctorSummaryCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
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
                <Text
                  style={[
                    typography.labelLg,
                    { color: colors.primaryDeep, fontWeight: '700' },
                  ]}
                >
                  {doctor.name
                    .replace('Dr. ', '')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.doctorInfoCol}>
            <Text
              style={[
                typography.headlineMd,
                { color: colors.navyText, fontWeight: '700' },
              ]}
              numberOfLines={1}
            >
              {doctor.name}
            </Text>
            <Text
              style={[
                typography.bodyMd,
                { color: colors.primaryDeep, fontWeight: '600', marginTop: spacing.xxs },
              ]}
              numberOfLines={1}
            >
              {doctor.specialty} • MD
            </Text>
            <View style={[styles.metaRow, { marginTop: spacing.xxs + 2 }]}>
              <Text
                style={[
                  typography.bodySm,
                  { color: colors.mutedText, flex: 1 },
                ]}
                numberOfLines={1}
              >
                {doctor.clinicName} • Ste 320
              </Text>
              <View style={styles.ratingRow}>
                <AppIcon name="star" size={13} color={colors.amberText} fill={colors.amberText} />
                <Text
                  style={[
                    typography.labelSm,
                    { color: colors.navyText, marginLeft: spacing.xxs + 1 },
                  ]}
                >
                  4.9 <Text style={{ color: colors.mutedText, fontWeight: '500' }}>(128)</Text>
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change doctor"
            onPress={onChangeDoctor}
            style={({ pressed }) => [
              styles.changeBtn,
              {
                backgroundColor: colors.skySoftBg,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: spacing.xs,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={[
                typography.labelSm,
                { color: colors.primaryDeep, fontWeight: '700', marginRight: spacing.xxs },
              ]}
            >
              Change
            </Text>
            <AppIcon name="arrowLeftRight" size={12} color={colors.primaryDeep} />
          </Pressable>
        </View>
      </View>

      {/* Consultation Mode Segmented Toggle */}
      <View
        style={[
          styles.modeToggleContainer,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.lg,
            padding: spacing.xxs + 2,
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
              borderRadius: radii.md,
              backgroundColor:
                consultationMode === 'in_person' ? colors.surface : 'transparent',
              borderColor:
                consultationMode === 'in_person' ? colors.border : 'transparent',
              borderWidth: consultationMode === 'in_person' ? 1 : 0,
            },
          ]}
        >
          <AppIcon
            name="building"
            size={16}
            color={consultationMode === 'in_person' ? colors.primaryDeep : colors.mutedText}
          />
          <Text
            style={[
              typography.labelMd,
              {
                color: consultationMode === 'in_person' ? colors.primaryDeep : colors.mutedText,
                fontWeight: consultationMode === 'in_person' ? '700' : '500',
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
              borderRadius: radii.md,
              backgroundColor:
                consultationMode === 'telehealth' ? colors.surface : 'transparent',
              borderColor:
                consultationMode === 'telehealth' ? colors.border : 'transparent',
              borderWidth: consultationMode === 'telehealth' ? 1 : 0,
            },
          ]}
        >
          <AppIcon
            name="video"
            size={16}
            color={consultationMode === 'telehealth' ? colors.primaryDeep : colors.mutedText}
          />
          <Text
            style={[
              typography.labelMd,
              {
                color: consultationMode === 'telehealth' ? colors.primaryDeep : colors.mutedText,
                fontWeight: consultationMode === 'telehealth' ? '700' : '500',
                marginLeft: spacing.xs,
              },
            ]}
          >
            Telehealth Video
          </Text>
        </Pressable>
      </View>

      {/* Calendar Month & Date Strip */}
      <View style={{ marginTop: spacing.xl }}>
        {/* Month Header Row */}
        <View style={styles.monthHeaderRow}>
          <Text
            style={[
              typography.headlineMd,
              { color: colors.navyText, fontWeight: '700' },
            ]}
          >
            {formattedDateTitle}
          </Text>

          <View style={styles.monthControlsRow}>
            {isToday(selectedDate) ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go to today"
                onPress={() => onSelectDate(startOfToday())}
                style={[
                  styles.todayPill,
                  {
                    backgroundColor: colors.skySoftBg,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm + 2,
                    paddingVertical: spacing.xxs + 1,
                    marginRight: spacing.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.labelSm,
                    { color: colors.primaryDeep, fontWeight: '700' },
                  ]}
                >
                  Today
                </Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => onSelectDate(subDays(selectedDate, 1))}
              disabled={isToday(selectedDate)}
              style={({ pressed }) => [
                styles.arrowBtn,
                {
                  borderRadius: radii.full,
                  backgroundColor: colors.surfaceLow,
                  opacity: isToday(selectedDate) ? 0.3 : pressed ? 0.8 : 1,
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

        {/* Date Day Cards Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.dateStripRow,
            { gap: spacing.sm, paddingTop: spacing.md },
          ]}
        >
          {dateStripDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const dayName = format(day, 'EEE');
            const dayNum = format(day, 'dd');

            return (
              <Pressable
                key={day.toISOString()}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${format(day, 'EEEE, MMMM d')}`}
                onPress={() => onSelectDate(day)}
                style={({ pressed }) => [
                  styles.dayCard,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: isSelected ? colors.primaryDeep : colors.surface,
                    borderColor: isSelected ? colors.primaryDeep : colors.border,
                    borderWidth: 1,
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.sm + 4,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.bodySm,
                    {
                      color: isSelected ? colors.healthPassMuted : colors.mutedText,
                      fontWeight: '500',
                      textAlign: 'center',
                    },
                  ]}
                >
                  {dayName}
                </Text>

                <Text
                  style={[
                    typography.headlineMd,
                    {
                      color: isSelected ? colors.onPrimary : colors.navyText,
                      fontWeight: '700',
                      textAlign: 'center',
                      marginTop: spacing.xxs + 2,
                    },
                  ]}
                >
                  {dayNum}
                </Text>

                <View
                  style={[
                    styles.dayDot,
                    {
                      borderRadius: radii.full,
                      backgroundColor: isSelected ? colors.inverseAccent : colors.emeraldDot,
                      marginTop: spacing.xxs + 3,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Time of Day Filter Pills */}
      <View style={[styles.periodPillsRow, { marginTop: spacing.xl, gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedPeriod === 'morning' }}
          onPress={() => setSelectedPeriod('morning')}
          style={({ pressed }) => [
            styles.periodPill,
            {
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              backgroundColor:
                selectedPeriod === 'morning' ? colors.primaryDeep : colors.surfaceLow,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppIcon
            name="sun"
            size={14}
            color={selectedPeriod === 'morning' ? colors.onPrimary : colors.navyText}
          />
          <Text
            style={[
              typography.labelMd,
              {
                color: selectedPeriod === 'morning' ? colors.onPrimary : colors.navyText,
                fontWeight: selectedPeriod === 'morning' ? '700' : '600',
                marginLeft: spacing.xs,
              },
            ]}
          >
            Morning {periodCounts.morning > 0 ? periodCounts.morning : ''}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedPeriod === 'afternoon' }}
          onPress={() => setSelectedPeriod('afternoon')}
          style={({ pressed }) => [
            styles.periodPill,
            {
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              backgroundColor:
                selectedPeriod === 'afternoon' ? colors.primaryDeep : colors.surfaceLow,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppIcon
            name="sunset"
            size={14}
            color={selectedPeriod === 'afternoon' ? colors.onPrimary : colors.navyText}
          />
          <Text
            style={[
              typography.labelMd,
              {
                color: selectedPeriod === 'afternoon' ? colors.onPrimary : colors.navyText,
                fontWeight: selectedPeriod === 'afternoon' ? '700' : '600',
                marginLeft: spacing.xs,
              },
            ]}
          >
            Afternoon {periodCounts.afternoon > 0 ? periodCounts.afternoon : ''}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedPeriod === 'evening' }}
          onPress={() => setSelectedPeriod('evening')}
          style={({ pressed }) => [
            styles.periodPill,
            {
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              backgroundColor:
                selectedPeriod === 'evening' ? colors.primaryDeep : colors.surfaceLow,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppIcon
            name="moon"
            size={14}
            color={selectedPeriod === 'evening' ? colors.onPrimary : colors.navyText}
          />
          <Text
            style={[
              typography.labelMd,
              {
                color: selectedPeriod === 'evening' ? colors.onPrimary : colors.navyText,
                fontWeight: selectedPeriod === 'evening' ? '700' : '600',
                marginLeft: spacing.xs,
              },
            ]}
          >
            Evening {periodCounts.evening > 0 ? periodCounts.evening : ''}
          </Text>
        </Pressable>
      </View>

      {/* Available Slots Section Header */}
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
              { color: colors.primaryDeep, marginLeft: spacing.xxs + 2 },
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
        <View style={styles.slotsGrid}>
          {filteredSlots.map((slot) => {
            const isSelected = selectedSlot?.id === slot.id;
            const isRecommended = slot.id.includes('10:30') || slot.id.includes('10:00');

            return (
              <Pressable
                key={slot.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`Slot at ${slot.displayTime || slot.time}`}
                onPress={() => onSelectSlot(slot)}
                style={({ pressed }) => [
                  styles.slotCard,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: isSelected ? colors.primaryDeep : colors.surface,
                    borderColor: isSelected ? colors.primaryDeep : colors.border,
                    borderWidth: 1.5,
                    padding: spacing.md,
                    opacity: pressed ? 0.85 : 1,
                  },
                  elevation.card,
                ]}
              >
                <View style={styles.slotCardTopRow}>
                  <Text
                    style={[
                      typography.headlineMd,
                      {
                        color: isSelected ? colors.onPrimary : colors.navyText,
                        fontWeight: '700',
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
                        backgroundColor: isSelected ? colors.primaryDeep : colors.surface,
                        borderColor: isSelected ? colors.onPrimary : colors.border,
                      },
                    ]}
                  >
                    {isSelected && (
                      <AppIcon name="check" size={11} color={colors.onPrimary} strokeWidth={2.5} />
                    )}
                  </View>
                </View>

                <View style={[styles.slotCardBottomRow, { marginTop: spacing.xs }]}>
                  <Text
                    style={[
                      typography.bodySm,
                      {
                        color: isSelected ? colors.healthPassMuted : colors.mutedText,
                        fontWeight: '500',
                      },
                    ]}
                  >
                    {isRecommended ? 'Recommended' : 'In-Person • 30 mins'}
                  </Text>

                  {isRecommended && (
                    <View
                      style={[
                        styles.primeBadge,
                        {
                          backgroundColor: isSelected ? colors.primaryVibrant : colors.mintBadgeBg,
                          borderRadius: radii.full,
                          paddingHorizontal: spacing.xs + 2,
                          paddingVertical: spacing.xxs,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.labelSm,
                          {
                            color: isSelected ? colors.navyText : colors.primaryDeep,
                            fontWeight: '700',
                          },
                        ]}
                      >
                        Prime
                      </Text>
                    </View>
                  )}
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
            backgroundColor: colors.welcomeSurface,
            borderColor: colors.welcomeBorder,
            borderRadius: radii.lg,
            padding: spacing.base,
            marginTop: spacing.xl,
            gap: spacing.sm,
          },
        ]}
      >
        <AppIcon name="shieldCheck" size={20} color={colors.primaryDeep} />
        <View style={{ flex: 1 }}>
          <Text
            style={[
              typography.labelMd,
              { color: colors.navyText, fontWeight: '700' },
            ]}
          >
            On-Time Clinic Arrival Guarantee
          </Text>
          <Text
            style={[
              typography.bodySm,
              { color: colors.bodyText, marginTop: spacing.xxs },
            ]}
          >
            Please arrive 10 minutes prior to complete routine blood pressure and vitals triage.
          </Text>
        </View>
      </View>

      {/* Sticky Bottom Confirmation Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            padding: spacing.base,
            marginTop: spacing.xl,
          },
          elevation.card,
        ]}
      >
        <Text style={[typography.labelSm, { color: colors.mutedText, letterSpacing: 0.5 }]}>
          SELECTED APPOINTMENT SLOT
        </Text>
        <Text
          style={[
            typography.bodyMd,
            { color: colors.navyText, fontWeight: '700', marginTop: spacing.xxs },
          ]}
          numberOfLines={1}
        >
          {formattedSlotSummary || 'Select an appointment slot to continue'}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue to review and confirm"
          disabled={!selectedSlot}
          onPress={onProceed}
          style={({ pressed }) => [
            styles.proceedButton,
            {
              backgroundColor: selectedSlot ? colors.primaryDeep : colors.border,
              borderRadius: radii.full,
              paddingVertical: spacing.md,
              marginTop: spacing.md,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text
            style={[
              typography.labelLg,
              { color: colors.onPrimary, fontWeight: '700', marginRight: spacing.xs },
            ]}
          >
            Continue to Review & Confirm
          </Text>
          <AppIcon name="arrowRight" size={18} color={colors.onPrimary} />
        </Pressable>
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
    width: 48,
    height: 48,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
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
  monthControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayPill: {
    paddingVertical: 2,
  },
  arrowBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
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
    gap: 12,
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
    width: 18,
    height: 18,
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
    alignItems: 'flex-start',
    borderWidth: 1,
  },
  bottomBar: {
    width: '100%',
    borderTopWidth: 1,
  },
  proceedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});

export const BookingSlotStep = memo(BookingSlotStepComponent);
export default BookingSlotStep;
