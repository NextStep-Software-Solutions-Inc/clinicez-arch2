import React, { memo, useState, useMemo } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { PatientSearchDoctorDto, PatientSearchClinicDto } from '../../services/api/homeApi';

export interface BookingDoctorStepProps {
  doctors: PatientSearchDoctorDto[];
  clinics: PatientSearchClinicDto[];
  selectedDoctorId?: string;
  onSelectDoctor: (doctor: PatientSearchDoctorDto) => void;
  onProceed: () => void;
  onViewClinicInfo?: (clinicId: string) => void;
  onViewAllHubs?: () => void;
}

function BookingDoctorStepComponent({
  doctors,
  clinics,
  selectedDoctorId,
  onSelectDoctor,
  onProceed,
  onViewClinicInfo,
  onViewAllHubs,
}: BookingDoctorStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'availability' | 'rating'>('availability');

  // Derive specialties dynamically with counts
  const specialties = useMemo(() => {
    const map = new Map<string, number>();
    doctors.forEach((d) => {
      const spec = d.specialty || 'General';
      map.set(spec, (map.get(spec) || 0) + 1);
    });

    const items: Array<{ id: string; label: string; count: number }> = [
      { id: 'all', label: `All Specialists (${doctors.length})`, count: doctors.length },
    ];
    map.forEach((count, spec) => {
      items.push({ id: spec, label: `${spec} (${count})`, count });
    });
    return items;
  }, [doctors]);

  // Filter & sort doctors
  const filteredDoctors = useMemo(() => {
    let result = doctors;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.specialty.toLowerCase().includes(q) ||
          d.clinicName.toLowerCase().includes(q) ||
          (d.clinicAddress ?? '').toLowerCase().includes(q)
      );
    }

    if (selectedSpecialty !== 'all') {
      result = result.filter((d) => d.specialty === selectedSpecialty);
    }

    if (sortBy === 'availability') {
      // Prioritize doctors with nextAvailableAt
      result = [...result].sort((a, b) => {
        if (a.nextAvailableAt && !b.nextAvailableAt) return -1;
        if (!a.nextAvailableAt && b.nextAvailableAt) return 1;
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy === 'rating') {
      result = [...result].sort((a, b) => b.name.localeCompare(a.name));
    }

    return result;
  }, [doctors, searchQuery, selectedSpecialty, sortBy]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0],
    [doctors, selectedDoctorId]
  );

  const selectedClinic = useMemo(() => {
    if (!selectedDoctor) return clinics[0] ?? null;
    return clinics.find((c) => c.id === selectedDoctor.clinicId) ?? clinics[0] ?? null;
  }, [clinics, selectedDoctor]);

  return (
    <View style={styles.container}>
      {/* Search Input Bar */}
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.full,
            paddingHorizontal: spacing.md,
            paddingVertical: Platform.OS === 'ios' ? 10 : 8,
          },
        ]}
      >
        <AppIcon name="search" size={18} color={colors.mutedText} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search doctor, specialty, or clinic..."
          placeholderTextColor={colors.mutedText}
          style={[
            styles.searchInput,
            typography.bodyMd,
            { color: colors.navyText, marginLeft: spacing.sm },
          ]}
          returnKeyType="search"
          accessibilityLabel="Search doctor, specialty, or clinic"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setSearchQuery('')}
            hitSlop={8}
          >
            <AppIcon name="close" size={16} color={colors.mutedText} />
          </Pressable>
        ) : (
          <AppIcon name="sliders" size={18} color={colors.primaryDeep} />
        )}
      </View>

      {/* Specialties Horizontal Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.specialtyRow, { gap: spacing.sm, paddingTop: spacing.md }]}
      >
        {specialties.map((item) => {
          const isActive = selectedSpecialty === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => setSelectedSpecialty(item.id)}
              style={({ pressed }) => [
                styles.specialtyPill,
                {
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  backgroundColor: isActive ? colors.primaryDeep : colors.surface,
                  borderColor: isActive ? colors.primaryDeep : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {isActive && (
                <View style={{ marginRight: spacing.xs }}>
                  <AppIcon name="check" size={14} color={colors.onPrimary} strokeWidth={2.5} />
                </View>
              )}
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: isActive ? colors.onPrimary : colors.navyText,
                    fontWeight: isActive ? '700' : '600',
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Recommended Providers Header & Sort */}
      <View style={[styles.sectionHeaderRow, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
        <View style={styles.sectionTitleWithDot}>
          <View
            style={[
              styles.sectionDot,
              { borderRadius: radii.full, backgroundColor: colors.emeraldDot },
            ]}
          />
          <Text style={[typography.overline, { color: colors.navyText }]}>
            RECOMMENDED PROVIDERS
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sort by availability or rating"
          onPress={() =>
            setSortBy((prev) => (prev === 'availability' ? 'rating' : 'availability'))
          }
          style={styles.sortButton}
        >
          <Text style={[typography.bodySm, { color: colors.mutedText }]}>
            Sort:{' '}
            <Text style={{ color: colors.primaryDeep, fontWeight: '700' }}>
              {sortBy === 'availability' ? 'Availability' : 'Rating'}
            </Text>{' '}
            ∨
          </Text>
        </Pressable>
      </View>

      {/* Doctors List */}
      <View style={{ gap: spacing.md }}>
        {filteredDoctors.map((doctor) => {
          const isSelected = doctor.id === selectedDoctorId;

          return (
            <Pressable
              key={doctor.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`Select doctor ${doctor.name}`}
              onPress={() => onSelectDoctor(doctor)}
              style={({ pressed }) => [
                styles.doctorCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isSelected ? colors.primaryDeep : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                  borderRadius: radii.xl,
                  padding: spacing.base,
                  opacity: pressed ? 0.92 : 1,
                },
                elevation.card,
              ]}
            >
              {/* Top Row: Avatar, Name, Specialty, Selection Circle */}
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
                  {doctor.isVerified && (
                    <View
                      style={[
                        styles.verifiedBadge,
                        {
                          backgroundColor: colors.surface,
                          borderRadius: radii.full,
                        },
                      ]}
                    >
                      <AppIcon name="badgeCheck" size={14} color={colors.primaryDeep} />
                    </View>
                  )}
                </View>

                {/* Doctor Details */}
                <View style={styles.doctorInfoCol}>
                  <View style={styles.doctorNameRow}>
                    <Text
                      style={[
                        typography.headlineMd,
                        { color: colors.navyText, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {doctor.name}
                    </Text>
                  </View>

                  <Text
                    style={[
                      typography.bodyMd,
                      { color: colors.primaryDeep, fontWeight: '600', marginTop: spacing.xxs },
                    ]}
                    numberOfLines={1}
                  >
                    {doctor.specialty}
                  </Text>

                  <View style={[styles.ratingRow, { marginTop: spacing.xxs + 1 }]}>
                    <AppIcon name="star" size={13} color={colors.amberText} fill={colors.amberText} />
                    <Text
                      style={[
                        typography.labelSm,
                        { color: colors.navyText, marginLeft: spacing.xxs + 1 },
                      ]}
                    >
                      4.9{' '}
                      <Text style={{ color: colors.mutedText, fontWeight: '500' }}>
                        (128 reviews)
                      </Text>
                    </Text>
                  </View>
                </View>

                {/* Selection Radio / Circle */}
                <View
                  style={[
                    styles.radioCircle,
                    {
                      borderRadius: radii.full,
                      backgroundColor: isSelected ? colors.primaryDeep : colors.surface,
                      borderColor: isSelected ? colors.primaryDeep : colors.border,
                    },
                  ]}
                >
                  {isSelected && (
                    <AppIcon name="check" size={13} color={colors.onPrimary} strokeWidth={2.5} />
                  )}
                </View>
              </View>

              {/* Location Row */}
              <View style={[styles.locationRow, { marginTop: spacing.sm }]}>
                <AppIcon name="location" size={14} color={colors.mutedText} />
                <Text
                  style={[
                    typography.bodySm,
                    { color: colors.mutedText, marginLeft: spacing.xs, flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {doctor.clinicName} • {doctor.clinicAddress || 'Clinic Suite'}
                </Text>
              </View>

              {/* Badges Row: Mode & Next Slot */}
              <View style={[styles.badgesRow, { marginTop: spacing.sm, gap: spacing.sm }]}>
                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor: colors.skySoftBg,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.sm + 2,
                      paddingVertical: spacing.xxs + 1,
                    },
                  ]}
                >
                  <AppIcon name="building" size={12} color={colors.skyIcon} />
                  <Text
                    style={[
                      typography.labelSm,
                      { color: colors.primaryDeep, marginLeft: spacing.xxs + 2 },
                    ]}
                  >
                    In Person
                  </Text>
                </View>

                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor: colors.mintBadgeBg,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.sm + 2,
                      paddingVertical: spacing.xxs + 1,
                    },
                  ]}
                >
                  <AppIcon name="zap" size={12} color={colors.primaryDeep} />
                  <Text
                    style={[
                      typography.labelSm,
                      { color: colors.primaryDeep, marginLeft: spacing.xxs + 2 },
                    ]}
                  >
                    {doctor.nextAvailableLabel || 'Next: Tomorrow • 10:30 AM'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Selected Facility Location Card */}
      {selectedClinic && (
        <View style={{ marginTop: spacing.xxl }}>
          <View style={[styles.sectionHeaderRow, { marginBottom: spacing.md }]}>
            <View style={styles.sectionTitleWithDot}>
              <View
                style={[
                  styles.sectionDot,
                  { borderRadius: radii.full, backgroundColor: colors.emeraldDot },
                ]}
              />
              <Text style={[typography.overline, { color: colors.navyText }]}>
                SELECTED FACILITY LOCATION
              </Text>
            </View>

            <Pressable
              accessibilityRole="link"
              accessibilityLabel="View all network hubs"
              onPress={onViewAllHubs}
            >
              <Text
                style={[
                  typography.labelSm,
                  { color: colors.primaryDeep, fontWeight: '700' },
                ]}
              >
                All Network Hubs
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.facilityCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radii.xl,
                overflow: 'hidden',
              },
              elevation.card,
            ]}
          >
            {/* Visual Header Banner */}
            <View
              style={[
                styles.facilityBanner,
                { backgroundColor: colors.primaryDeep },
              ]}
            >
              <View style={styles.facilityBannerTopRow}>
                <View
                  style={[
                    styles.openBadge,
                    {
                      backgroundColor: colors.glassPillBg,
                      borderColor: colors.glassPillBorder,
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.sectionDot,
                      { borderRadius: radii.full, backgroundColor: colors.emeraldDot },
                    ]}
                  />
                  <Text style={[typography.labelSm, { color: colors.onPrimary, marginLeft: spacing.xs }]}>
                    Open Now • Walk-ins Welcome
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <Text
                  style={[
                    typography.headlineMd,
                    { color: colors.onPrimary, fontWeight: '700' },
                  ]}
                >
                  {selectedClinic.name}
                </Text>
                <View style={[styles.facilityAddressRow, { marginTop: spacing.xxs + 2 }]}>
                  <Text style={[typography.bodySm, { color: colors.healthPassMuted, flex: 1 }]}>
                    {selectedClinic.address || 'Health Parkway, Building B'}
                  </Text>
                  <View style={styles.ratingRow}>
                    <AppIcon name="star" size={13} color={colors.amberText} fill={colors.amberText} />
                    <Text
                      style={[
                        typography.labelSm,
                        { color: colors.onPrimary, marginLeft: spacing.xxs + 1 },
                      ]}
                    >
                      4.9
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Facility Amenities Row */}
            <View
              style={[
                styles.facilityAmenitiesRow,
                { padding: spacing.base, backgroundColor: colors.surface },
              ]}
            >
              <View style={styles.amenityItem}>
                <AppIcon name="car" size={16} color={colors.primaryDeep} />
                <View style={{ marginLeft: spacing.xs }}>
                  <Text style={[typography.labelSm, { color: colors.navyText }]}>Free</Text>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>Garage</Text>
                </View>
              </View>

              <View style={styles.amenityItem}>
                <AppIcon name="accessibility" size={16} color={colors.primaryDeep} />
                <View style={{ marginLeft: spacing.xs }}>
                  <Text style={[typography.labelSm, { color: colors.navyText }]}>ADA</Text>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>Compliant</Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View facility information"
                onPress={() => onViewClinicInfo?.(selectedClinic.id)}
                style={({ pressed }) => [
                  styles.viewInfoBtn,
                  {
                    backgroundColor: colors.skySoftBg,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.labelMd,
                    { color: colors.primaryDeep, fontWeight: '700', marginRight: spacing.xxs },
                  ]}
                >
                  View Info
                </Text>
                <AppIcon name="arrowRight" size={14} color={colors.primaryDeep} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Rescheduling Policy Callout */}
      <View
        style={[
          styles.policyBox,
          {
            backgroundColor: colors.welcomeSurface,
            borderColor: colors.welcomeBorder,
            borderRadius: radii.lg,
            padding: spacing.md,
            marginTop: spacing.xl,
            gap: spacing.sm,
          },
        ]}
      >
        <AppIcon name="shieldCheck" size={18} color={colors.primaryDeep} />
        <Text style={[typography.bodySm, { color: colors.bodyText, flex: 1 }]}>
          <Text style={{ fontWeight: '700', color: colors.navyText }}>No-Hassle Rescheduling: </Text>
          Cancel or modify your timeslot up to 2 hours before with zero penalty.
        </Text>
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
          SELECTED CONSULTATION
        </Text>
        <Text
          style={[
            typography.bodyMd,
            { color: colors.navyText, fontWeight: '700', marginTop: spacing.xxs },
          ]}
          numberOfLines={1}
        >
          {selectedDoctor
            ? `${selectedDoctor.name} • ${selectedDoctor.specialty}`
            : 'Select a doctor to continue'}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Proceed to choose slot"
          disabled={!selectedDoctor}
          onPress={onProceed}
          style={({ pressed }) => [
            styles.proceedButton,
            {
              backgroundColor: selectedDoctor ? colors.primaryDeep : colors.border,
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
            Proceed to Choose Slot
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
  },
  specialtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  specialtyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 7,
    height: 7,
  },
  sortButton: {
    paddingVertical: 4,
  },
  doctorCard: {
    width: '100%',
  },
  doctorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    padding: 1,
  },
  doctorInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  doctorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  facilityCard: {
    width: '100%',
    borderWidth: 1,
  },
  facilityBanner: {
    padding: 16,
  },
  facilityBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  facilityAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  facilityAmenitiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewInfoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  policyBox: {
    flexDirection: 'row',
    alignItems: 'center',
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

export const BookingDoctorStep = memo(BookingDoctorStepComponent);
export default BookingDoctorStep;
