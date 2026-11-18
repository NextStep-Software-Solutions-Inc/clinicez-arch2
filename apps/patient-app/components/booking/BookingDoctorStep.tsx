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
import {
  formatAvailabilitySummary,
  resolveDefaultAffiliation,
  resolveDoctorAffiliations,
} from '../../services/search/directorySearchService';
import type {
  DirectoryClinicDto,
  DirectoryDoctorDto,
} from '../../services/api/homeApi';

export interface BookingDoctorStepProps {
  doctors: DirectoryDoctorDto[];
  clinics: DirectoryClinicDto[];
  selectedDoctorId?: string;
  selectedClinicId?: string;
  onSelectDoctor: (doctor: DirectoryDoctorDto) => void;
  onSelectClinic?: (clinicId: string, doctor: DirectoryDoctorDto) => void;
  onViewClinicInfo?: (clinicId: string) => void;
  onViewAllHubs?: () => void;
  onFilterSlidersPress?: () => void;
}

const NO_OP = () => {};

function extractDoctorInitials(name: string): string {
  const clean = name.replace(/^Dr\.\s*/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DR';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function BookingDoctorStepComponent({
  doctors,
  clinics,
  selectedDoctorId,
  selectedClinicId,
  onSelectDoctor,
  onSelectClinic,
  onViewClinicInfo,
  onViewAllHubs,
  onFilterSlidersPress = NO_OP,
}: BookingDoctorStepProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'availability' | 'name'>('availability');

  const specialties = useMemo(() => {
    const map = new Map<string, number>();
    doctors.forEach((d) => {
      const spec = d.specialty || 'General Practice';
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

  const filteredDoctors = useMemo(() => {
    let result = doctors;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.specialty.toLowerCase().includes(q) ||
          d.clinicName.toLowerCase().includes(q) ||
          (d.clinicAddress ?? '').toLowerCase().includes(q) ||
          Boolean(
            d.affiliations?.some(
              (a) =>
                a.clinicName.toLowerCase().includes(q) ||
                (a.clinicAddress ?? '').toLowerCase().includes(q) ||
                a.localSpecialty.toLowerCase().includes(q),
            ),
          ),
      );
    }

    if (selectedSpecialty !== 'all') {
      result = result.filter((d) => (d.specialty || 'General Practice') === selectedSpecialty);
    }

    if (sortBy === 'availability') {
      result = [...result].sort((a, b) => {
        if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
        if (a.clinicSupportsAppointments !== b.clinicSupportsAppointments) {
          return a.clinicSupportsAppointments ? -1 : 1;
        }
        if (a.nextAvailableAt && !b.nextAvailableAt) return -1;
        if (!a.nextAvailableAt && b.nextAvailableAt) return 1;
        return a.name.localeCompare(b.name);
      });
    } else {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [doctors, searchQuery, selectedSpecialty, sortBy]);

  const selectedDoctor = useMemo(
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
    () => (selectedDoctor ? resolveDefaultAffiliation(selectedDoctor, selectedClinicId) : null),
    [selectedClinicId, selectedDoctor],
  );

  const selectedClinic = useMemo(() => {
    const targetClinicId = selectedAffiliation?.clinicId ?? selectedDoctor?.clinicId;
    if (!targetClinicId) return clinics[0] ?? null;
    const matched = clinics.find((c) => c.id === targetClinicId);
    if (matched) return matched;
    if (selectedAffiliation) {
      return {
        id: selectedAffiliation.clinicId,
        name: selectedAffiliation.clinicName,
        primarySpecialty: selectedAffiliation.localSpecialty,
        description: null,
        address: selectedAffiliation.clinicAddress,
        logoUrl: null,
        coverImageUrl: null,
        operatingHours: null,
        openStatusLabel: selectedAffiliation.supportsAppointments ? 'Open Today' : 'Booking Paused',
        isOpenNow: selectedAffiliation.supportsAppointments,
        supportsAppointments: selectedAffiliation.supportsAppointments,
        isPublic: true,
        isGated: false,
        isUnlocked: true,
        activeMemberCount: 0,
        nextAvailableAt: selectedAffiliation.nextAvailableAt,
        nextAvailableLabel: selectedAffiliation.nextAvailableLabel,
        tags: [],
      } satisfies DirectoryClinicDto;
    }
    return clinics[0] ?? null;
  }, [clinics, selectedAffiliation, selectedDoctor]);

  return (
    <View style={styles.container}>
      {/* Search Input Bar */}
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
            borderRadius: radii.full,
            paddingHorizontal: spacing.md,
            paddingVertical: Platform.OS === 'ios' ? 10 : 8,
          },
          elevation.card,
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter options"
            onPress={onFilterSlidersPress}
            hitSlop={8}
          >
            <AppIcon name="sliders" size={18} color={colors.navyText} />
          </Pressable>
        )}
      </View>

      {/* Specialties Horizontal Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.specialtyRow,
          { gap: spacing.sm, paddingTop: spacing.md },
        ]}
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
                  backgroundColor: isActive ? colors.primary : colors.surfaceLow,
                  borderColor: isActive ? colors.primary : colors.surfaceLow,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {isActive ? (
                <View style={{ marginRight: spacing.xs }}>
                  <AppIcon name="checkCircle" size={14} color={colors.onPrimary} />
                </View>
              ) : null}
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: isActive ? colors.onPrimary : colors.navyText,
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
          accessibilityLabel="Change provider sort order"
          onPress={() =>
            setSortBy((prev) => (prev === 'availability' ? 'name' : 'availability'))
          }
          style={styles.sortButton}
        >
          <Text style={[typography.bodySm, { color: colors.mutedText }]}>
            Sort:{' '}
          </Text>
          <Text style={[typography.labelSm, { color: colors.primary, marginRight: spacing.xxs }]}>
            {sortBy === 'availability' ? 'Availability' : 'Name'}
          </Text>
          <AppIcon name="chevronDown" size={14} color={colors.primary} />
        </Pressable>
      </View>

      {/* Doctors List / Empty States */}
      {doctors.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              borderRadius: radii.xl,
              padding: spacing.xl,
            },
            elevation.card,
          ]}
        >
          <View
            style={[
              styles.emptyIconCircle,
              { backgroundColor: colors.surfaceLow, borderRadius: radii.full },
            ]}
          >
            <AppIcon name="calendarX" size={24} color={colors.primary} />
          </View>
          <Text
            style={[
              typography.cardTitle,
              { color: colors.navyText, marginTop: spacing.md, textAlign: 'center' },
            ]}
          >
            No providers available yet
          </Text>
          <Text
            style={[
              typography.bodyMd,
              { color: colors.mutedText, marginTop: spacing.xs, textAlign: 'center' },
            ]}
          >
            Explore partner clinics in your care network to find specialists with online booking.
          </Text>
          {onViewAllHubs ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Explore Clinics"
              onPress={onViewAllHubs}
              style={({ pressed }) => [
                styles.emptyActionBtn,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm + 2,
                  marginTop: spacing.md,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[typography.labelMd, { color: colors.onPrimary }]}>
                Explore Clinics
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : filteredDoctors.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              borderRadius: radii.xl,
              padding: spacing.xl,
            },
          ]}
        >
          <Text style={[typography.cardTitle, { color: colors.navyText, textAlign: 'center' }]}>
            No matching specialists found
          </Text>
          <Text
            style={[
              typography.bodyMd,
              { color: colors.mutedText, marginTop: spacing.xs, textAlign: 'center' },
            ]}
          >
            Try adjusting your search query or selecting All Specialists.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
            onPress={() => {
              setSearchQuery('');
              setSelectedSpecialty('all');
            }}
            style={({ pressed }) => [
              styles.emptyActionBtn,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.full,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm + 2,
                marginTop: spacing.md,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[typography.labelMd, { color: colors.primary }]}>
              Reset Filters
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {filteredDoctors.map((doctor) => {
            const isSelected = doctor.id === (selectedDoctor?.id ?? selectedDoctorId);
            const affiliations = resolveDoctorAffiliations(doctor);
            const activeAffiliation = isSelected
              ? resolveDefaultAffiliation(doctor, selectedClinicId)
              : resolveDefaultAffiliation(doctor);
            const activeClinicName = activeAffiliation?.clinicName ?? doctor.clinicName;
            const activeClinicAddress =
              activeAffiliation?.clinicAddress ?? doctor.clinicAddress;
            const activeSpecialty = activeAffiliation?.localSpecialty || doctor.specialty;
            const activeSupportsAppointments = activeAffiliation
              ? activeAffiliation.supportsAppointments
              : doctor.clinicSupportsAppointments;
            const activeNextLabel =
              activeAffiliation?.nextAvailableLabel || doctor.nextAvailableLabel;
            const activeNextAt = activeAffiliation
              ? activeAffiliation.nextAvailableAt
              : doctor.nextAvailableAt;
            const scheduleSummary = formatAvailabilitySummary(
              activeAffiliation?.availabilities,
            );
            const isTelehealth = doctor.tags.some((t) =>
              t.toLowerCase().includes('telehealth'),
            );
            const locationLabel = activeClinicAddress
              ? `${activeClinicName} • ${activeClinicAddress}`
              : activeClinicName;

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
                    backgroundColor: isSelected ? colors.welcomeSurface : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.borderSubtle,
                    borderWidth: isSelected ? 1.5 : 1,
                    borderRadius: radii.xl,
                    padding: spacing.base,
                    opacity: pressed ? 0.92 : 1,
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
                          {extractDoctorInitials(doctor.name)}
                        </Text>
                      </View>
                    )}

                    <View
                      style={[
                        styles.onlineStatusDot,
                        {
                          backgroundColor: activeSupportsAppointments
                            ? colors.emeraldDot
                            : colors.amberText,
                          borderColor: colors.surface,
                          borderRadius: radii.full,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.doctorInfoCol}>
                    <View style={styles.doctorNameRow}>
                      <Text
                        style={[
                          typography.cardTitle,
                          { color: colors.navyText, flexShrink: 1 },
                        ]}
                        numberOfLines={1}
                      >
                        {doctor.name}
                      </Text>
                      {doctor.isVerified ? (
                        <View style={{ marginLeft: spacing.xs }}>
                          <AppIcon name="badgeCheck" size={16} color={colors.primary} />
                        </View>
                      ) : null}
                    </View>

                    <Text
                      style={[
                        typography.bodyMedium,
                        {
                          color: isSelected ? colors.primary : colors.bodyText,
                          marginTop: spacing.xxs,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {activeSpecialty}
                    </Text>

                    {doctor.professionalLicenseNo ? (
                      <Text
                        style={[
                          typography.bodySm,
                          { color: colors.mutedText, marginTop: spacing.xxs },
                        ]}
                        numberOfLines={1}
                      >
                        License #{doctor.professionalLicenseNo}
                      </Text>
                    ) : null}
                  </View>

                  <View
                    style={[
                      styles.radioCircle,
                      {
                        borderRadius: radii.full,
                        backgroundColor: isSelected ? colors.primary : colors.surfaceLow,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    {isSelected ? (
                      <AppIcon name="check" size={13} color={colors.onPrimary} strokeWidth={2.5} />
                    ) : null}
                  </View>
                </View>

                <View style={[styles.locationRow, { marginTop: spacing.sm }]}>
                  <AppIcon
                    name={isTelehealth ? 'video' : 'location'}
                    size={14}
                    color={colors.mutedText}
                  />
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.mutedText, marginLeft: spacing.xs, flex: 1 },
                    ]}
                    numberOfLines={1}
                  >
                    {locationLabel}
                  </Text>
                </View>

                {scheduleSummary ? (
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.mutedText, marginTop: spacing.xxs },
                    ]}
                    numberOfLines={1}
                  >
                    Schedule: {scheduleSummary}
                  </Text>
                ) : null}

                {/* Multi-clinic Selector */}
                {affiliations.length > 1 ? (
                  <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                    <Text style={[typography.labelSm, { color: colors.mutedText }]}>
                      Clinic locations ({affiliations.length})
                    </Text>
                    <View style={[styles.badgesRow, { gap: spacing.xs }]}>
                      {affiliations.map((aff) => {
                        const isClinicChecked = activeAffiliation?.clinicId === aff.clinicId;
                        return (
                          <Pressable
                            key={`${aff.clinicId}-${aff.providerId ?? 'primary'}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isClinicChecked }}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              if (onSelectClinic) {
                                onSelectClinic(aff.clinicId, doctor);
                              } else {
                                onSelectDoctor(doctor);
                              }
                            }}
                            style={[
                              styles.clinicSelectorChip,
                              {
                                backgroundColor: isClinicChecked
                                  ? colors.mintBadgeBg
                                  : colors.surfaceLow,
                                borderColor: isClinicChecked ? colors.primary : colors.border,
                                borderRadius: radii.lg,
                                paddingHorizontal: spacing.sm,
                                paddingVertical: spacing.xs,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                typography.labelSm,
                                {
                                  color: isClinicChecked ? colors.primary : colors.navyText,
                                },
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

                <View style={[styles.badgesRow, { marginTop: spacing.sm, gap: spacing.sm }]}>
                  <View
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor: colors.surfaceLow,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.sm + 2,
                        paddingVertical: spacing.xxs + 2,
                      },
                    ]}
                  >
                    <AppIcon
                      name={isTelehealth ? 'video' : 'stethoscope'}
                      size={12}
                      color={isTelehealth ? colors.navyText : colors.primary}
                    />
                    <Text
                      style={[
                        typography.labelSm,
                        {
                          color: isTelehealth ? colors.navyText : colors.primary,
                          marginLeft: spacing.xxs + 2,
                        },
                      ]}
                    >
                      {isTelehealth ? 'Telehealth' : 'In Person'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor: !activeSupportsAppointments
                          ? colors.amberSoftBg
                          : activeNextAt
                            ? colors.mintBadgeBg
                            : colors.surfaceLow,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.sm + 2,
                        paddingVertical: spacing.xxs + 2,
                      },
                    ]}
                  >
                    <AppIcon
                      name={
                        !activeSupportsAppointments
                          ? 'alert'
                          : activeNextAt
                            ? 'zap'
                            : 'calendar'
                      }
                      size={12}
                      color={!activeSupportsAppointments ? colors.amberText : colors.primary}
                    />
                    <Text
                      style={[
                        typography.labelSm,
                        {
                          color: !activeSupportsAppointments ? colors.amberText : colors.primary,
                          marginLeft: spacing.xxs + 2,
                        },
                      ]}
                    >
                      {!activeSupportsAppointments
                        ? 'Booking Paused'
                        : activeNextLabel || 'Schedule online'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Selected Facility Location Card */}
      {selectedClinic ? (
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
              <Text style={[typography.labelSm, { color: colors.primary }]}>
                All Network Hubs
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.facilityCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderRadius: radii.xl,
                overflow: 'hidden',
              },
              elevation.card,
            ]}
          >
            <View style={[styles.facilityBanner, { backgroundColor: colors.primaryDeep }]}>
              {selectedClinic.coverImageUrl ? (
                <>
                  <Image
                    source={{ uri: selectedClinic.coverImageUrl }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: colors.backdropScrim },
                    ]}
                  />
                </>
              ) : null}

              <View style={[styles.facilityBannerTopRow, { gap: spacing.sm }]}>
                <View
                  style={[
                    styles.openBadge,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.sm + 2,
                      paddingVertical: spacing.xxs + 2,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.sectionDot,
                      {
                        borderRadius: radii.full,
                        backgroundColor: selectedClinic.isOpenNow
                          ? colors.emeraldDot
                          : colors.mutedText,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      typography.labelSm,
                      { color: colors.navyText, marginLeft: spacing.xs },
                    ]}
                  >
                    {selectedClinic.openStatusLabel}
                  </Text>
                </View>

                {!selectedClinic.supportsAppointments ? (
                  <View
                    style={[
                      styles.openBadge,
                      {
                        backgroundColor: colors.amberSoftBg,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.sm + 2,
                        paddingVertical: spacing.xxs + 2,
                      },
                    ]}
                  >
                    <AppIcon name="alert" size={12} color={colors.amberText} />
                    <Text
                      style={[
                        typography.labelSm,
                        { color: colors.amberText, marginLeft: spacing.xs },
                      ]}
                    >
                      Booking Paused
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <Text
                  style={[typography.headlineSm, { color: colors.onPrimary }]}
                  numberOfLines={1}
                >
                  {selectedClinic.name}
                </Text>
                {selectedClinic.address ? (
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.healthPassMuted, marginTop: spacing.xxs },
                    ]}
                    numberOfLines={1}
                  >
                    {selectedClinic.address}
                  </Text>
                ) : null}
                {selectedClinic.operatingHours ? (
                  <Text
                    style={[
                      typography.bodySm,
                      { color: colors.healthPassMuted, marginTop: spacing.xxs },
                    ]}
                    numberOfLines={1}
                  >
                    Hours: {selectedClinic.operatingHours}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Facility Attributes + View Info CTA */}
            <View
              style={[
                styles.facilityAmenitiesRow,
                { padding: spacing.base, backgroundColor: colors.surface },
              ]}
            >
              <View style={styles.amenityItem}>
                <AppIcon
                  name={selectedClinic.supportsAppointments ? 'calendarCheck' : 'alert'}
                  size={16}
                  color={selectedClinic.supportsAppointments ? colors.primary : colors.amberText}
                />
                <View style={{ marginLeft: spacing.xs }}>
                  <Text style={[typography.labelSm, { color: colors.navyText }]}>
                    {selectedClinic.supportsAppointments ? 'Online' : 'Booking'}
                  </Text>
                  <Text
                    style={[
                      typography.bodySm,
                      {
                        color: selectedClinic.supportsAppointments
                          ? colors.mutedText
                          : colors.amberText,
                      },
                    ]}
                  >
                    {selectedClinic.supportsAppointments ? 'Booking' : 'Paused'}
                  </Text>
                </View>
              </View>

              <View style={styles.amenityItem}>
                <AppIcon name="shieldCheck" size={16} color={colors.primary} />
                <View style={{ marginLeft: spacing.xs }}>
                  <Text style={[typography.labelSm, { color: colors.navyText }]}>
                    {selectedClinic.isPublic ? 'Open' : 'Partner'}
                  </Text>
                  <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                    Network
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View facility information"
                onPress={() => onViewClinicInfo?.(selectedClinic.id)}
                style={({ pressed }) => [
                  styles.viewInfoBtn,
                  {
                    backgroundColor: colors.surfaceLow,
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
                    { color: colors.primary, marginRight: spacing.xxs },
                  ]}
                >
                  View Info
                </Text>
                <AppIcon name="arrowRight" size={14} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* Rescheduling Policy Callout */}
      <View
        style={[
          styles.policyBox,
          {
            backgroundColor: colors.surfaceLow,
            borderRadius: radii.lg,
            padding: spacing.base,
            marginTop: spacing.xl,
            gap: spacing.sm,
          },
        ]}
      >
        <View
          style={[
            styles.policyIconBadge,
            { backgroundColor: colors.surface, borderRadius: radii.full },
          ]}
        >
          <AppIcon name="shieldCheck" size={16} color={colors.primary} />
        </View>
        <Text style={[typography.bodySm, { color: colors.bodyText, flex: 1 }]}>
          <Text style={{ color: colors.navyText, fontWeight: '700' }}>
            No-Hassle Rescheduling:{' '}
          </Text>
          Cancel or modify your timeslot up to 2 hours before with zero penalty.
        </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  emptyCard: {
    width: '100%',
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 52,
    height: 52,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderWidth: 2,
  },
  doctorInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  doctorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 24,
    height: 24,
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
  clinicSelectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  facilityCard: {
    width: '100%',
    borderWidth: 1,
  },
  facilityBanner: {
    padding: 16,
    position: 'relative',
  },
  facilityBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  policyIconBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const BookingDoctorStep = memo(BookingDoctorStepComponent);
export default BookingDoctorStep;
