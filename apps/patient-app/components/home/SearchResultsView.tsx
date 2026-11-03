import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { AppIcon } from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { SkeletonCard } from '../ui/Skeleton';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ClinicDetail, ClinicProvider, ClinicService } from '../../services/discovery/types';

export type SearchFilterType = 'all' | 'doctors' | 'clinics' | 'services' | 'available';

export interface SearchDoctorItem extends ClinicProvider {
  clinicId: string;
  clinicName: string;
  distance?: string;
  nextSlot?: string;
  tags?: string[];
}

export interface SearchPackageItem extends ClinicService {
  clinicId: string;
  clinicName: string;
  tags?: string[];
}

export interface SearchResultsViewProps {
  query: string;
  clinics: ClinicDetail[];
  isLoading?: boolean;
  selectedFilter: SearchFilterType;
  onSelectFilter: (filter: SearchFilterType) => void;
  onBookDoctor: (doctorId: string, clinicId?: string) => void;
  onViewClinic: (clinicId: string) => void;
  onSchedulePackage: (serviceId: string, clinicId?: string) => void;
  onSeeAllDoctors?: () => void;
  onSeeAllClinics?: () => void;
  onSeeAllPackages?: () => void;
}

export default function SearchResultsView({
  query,
  clinics,
  isLoading = false,
  selectedFilter,
  onSelectFilter,
  onBookDoctor,
  onViewClinic,
  onSchedulePackage,
  onSeeAllDoctors,
  onSeeAllClinics,
  onSeeAllPackages,
}: SearchResultsViewProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  // Aggregate providers across clinics
  const allDoctors: SearchDoctorItem[] = useMemo(() => {
    const list: SearchDoctorItem[] = [];
    for (const clinic of clinics) {
      if (clinic.healthcareProviders) {
        for (const p of clinic.healthcareProviders) {
          list.push({
            ...p,
            clinicId: clinic.id,
            clinicName: clinic.name,
            distance: clinic.address ? 'Nearby' : 'Network Clinic',
            nextSlot: 'Available this week',
            tags: ['Accepts Insurance', 'In-Person & Telehealth'],
          });
        }
      }
    }
    return list;
  }, [clinics]);

  // Aggregate services across clinics
  const allPackages: SearchPackageItem[] = useMemo(() => {
    const list: SearchPackageItem[] = [];
    for (const clinic of clinics) {
      if (clinic.services) {
        for (const s of clinic.services) {
          list.push({
            ...s,
            clinicId: clinic.id,
            clinicName: clinic.name,
            tags: ['Covered by Clinic EZ', 'Prep Guide Included'],
          });
        }
      }
    }
    return list;
  }, [clinics]);

  // Filter based on active filter chip
  const showDoctors =
    selectedFilter === 'all' || selectedFilter === 'doctors' || selectedFilter === 'available';
  const showClinics =
    selectedFilter === 'all' || selectedFilter === 'clinics' || selectedFilter === 'available';
  const showServices =
    selectedFilter === 'all' || selectedFilter === 'services';

  const filterChips: { id: SearchFilterType; label: string; count?: number; icon?: any }[] = [
    { id: 'all', label: `All (${clinics.length + allDoctors.length + allPackages.length})` },
    { id: 'doctors', label: `Doctors (${allDoctors.length})` },
    { id: 'clinics', label: `Clinics (${clinics.length})` },
    { id: 'services', label: `Services (${allPackages.length})` },
    { id: 'available', label: 'Available Today', icon: 'activity' },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, { gap: spacing.md }]}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const hasAnyResults = clinics.length > 0 || allDoctors.length > 0 || allPackages.length > 0;

  if (!hasAnyResults) {
    return (
      <EmptyState
        title="No Results Found"
        message={`We couldn't find any clinics, doctors, or tests matching "${query}".`}
      />
    );
  }

  return (
    <View style={[styles.container, { gap: spacing.lg }]}>
      {/* Horizontal Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filterChipsRow, { gap: spacing.xs }]}
      >
        {filterChips.map((chip) => {
          const isSelected = selectedFilter === chip.id;
          return (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${chip.label}`}
              onPress={() => onSelectFilter(chip.id)}
              style={({ pressed }) => [
                styles.filterChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.card,
                  borderColor: isSelected ? colors.primary : colors.borderLight,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  opacity: pressed ? 0.8 : 1,
                },
                shadows.sm,
              ]}
            >
              {chip.icon ? (
                <AppIcon
                  name={chip.icon}
                  size={14}
                  color={isSelected ? 'onPrimary' : 'primary'}
                />
              ) : null}
              <ThemedText
                variant="smallBold"
                color={isSelected ? 'onPrimary' : 'text'}
              >
                {chip.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Section 1: Doctors & Specialists */}
      {showDoctors && allDoctors.length > 0 ? (
        <View style={[styles.sectionBlock, { gap: spacing.sm }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithBadge}>
              <View
                style={[
                  styles.sectionDot,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <ThemedText variant="captionBold" color="textSecondary" style={styles.uppercase}>
                Doctors & Specialists
              </ThemedText>
              <Badge label={`${allDoctors.length} Found`} tone="primary" size="sm" />
            </View>

            {onSeeAllDoctors ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="See all doctors"
                onPress={onSeeAllDoctors}
                style={styles.seeAllRow}
              >
                <ThemedText variant="smallBold" color="primaryText">
                  See all
                </ThemedText>
                <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
              </Pressable>
            ) : null}
          </View>

          {/* Doctor Cards */}
          <View style={[styles.cardsList, { gap: spacing.sm }]}>
            {allDoctors.map((doc) => (
              <View
                key={`${doc.clinicId}-${doc.id}`}
                style={[
                  styles.resultCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.borderLight,
                    borderWidth: sizes.borderWidth,
                    borderRadius: radii.xl,
                    padding: spacing.md,
                    gap: spacing.sm,
                  },
                  shadows.sm,
                ]}
              >
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.avatarBox,
                      {
                        backgroundColor: colors.primarySubtle,
                        borderColor: colors.primaryBorder,
                        borderWidth: sizes.borderWidth,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <AppIcon name="user" size={sizes.iconLg} color="primary" />
                  </View>

                  <View style={styles.doctorInfoCol}>
                    <View style={styles.titleRatingRow}>
                      <ThemedText variant="bodyBold" numberOfLines={1} style={styles.flex}>
                        {doc.name}
                      </ThemedText>
                      <View
                        style={[
                          styles.ratingPill,
                          {
                            backgroundColor: colors.successBg,
                            borderColor: colors.success,
                            borderWidth: sizes.borderWidth,
                            borderRadius: radii.full,
                            paddingHorizontal: spacing.xs,
                            paddingVertical: spacing.xxs,
                          },
                        ]}
                      >
                        <AppIcon name="star" size={12} color="success" />
                        <ThemedText variant="captionBold" color="success">
                          {doc.rating > 0 ? doc.rating.toFixed(1) : '5.0'}
                        </ThemedText>
                      </View>
                    </View>

                    <ThemedText variant="smallBold" color="primary" numberOfLines={1}>
                      {doc.specialty || 'General Practitioner'}
                    </ThemedText>
                    <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                      {doc.clinicName} • {doc.distance}
                    </ThemedText>
                  </View>
                </View>

                {/* Tags */}
                <View
                  style={[
                    styles.tagsRow,
                    {
                      borderTopColor: colors.borderLight,
                      borderTopWidth: sizes.borderWidth,
                      paddingTop: spacing.xs,
                      gap: spacing.xs,
                    },
                  ]}
                >
                  {(doc.tags ?? ['Accepts Insurance']).map((tag, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.tagPill,
                        {
                          backgroundColor: colors.surfaceSubtle,
                          borderRadius: radii.full,
                          paddingHorizontal: spacing.sm,
                          paddingVertical: spacing.xxs,
                        },
                      ]}
                    >
                      <ThemedText variant="caption" color="textSecondary">
                        {tag}
                      </ThemedText>
                    </View>
                  ))}
                </View>

                {/* Bottom Action Row */}
                <View
                  style={[
                    styles.cardActionRow,
                    {
                      borderTopColor: colors.borderLight,
                      borderTopWidth: sizes.borderWidth,
                      paddingTop: spacing.xs,
                    },
                  ]}
                >
                  <View style={styles.nextSlotRow}>
                    <AppIcon name="calendar" size={14} color="primary" />
                    <ThemedText variant="caption" color="textSecondary">
                      Next: <ThemedText variant="captionBold" color="text">{doc.nextSlot}</ThemedText>
                    </ThemedText>
                  </View>

                  <Button
                    label="Book Visit"
                    variant="primary"
                    size="sm"
                    onPress={() => onBookDoctor(doc.id, doc.clinicId)}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Section 2: Clinics & Care Centers */}
      {showClinics && clinics.length > 0 ? (
        <View style={[styles.sectionBlock, { gap: spacing.sm }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithBadge}>
              <View
                style={[
                  styles.sectionDot,
                  {
                    backgroundColor: colors.routine,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <ThemedText variant="captionBold" color="textSecondary" style={styles.uppercase}>
                Clinics & Care Centers
              </ThemedText>
              <Badge label={`${clinics.length} Facilities`} tone="neutral" size="sm" />
            </View>

            {onSeeAllClinics ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="See all clinics"
                onPress={onSeeAllClinics}
                style={styles.seeAllRow}
              >
                <ThemedText variant="smallBold" color="primaryText">
                  See all
                </ThemedText>
                <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
              </Pressable>
            ) : null}
          </View>

          {/* Clinic Cards */}
          <View style={[styles.cardsList, { gap: spacing.sm }]}>
            {clinics.map((clinic) => (
              <View
                key={clinic.id}
                style={[
                  styles.resultCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.borderLight,
                    borderWidth: sizes.borderWidth,
                    borderRadius: radii.xl,
                    padding: spacing.md,
                    gap: spacing.sm,
                  },
                  shadows.sm,
                ]}
              >
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.avatarBox,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderColor: colors.borderLight,
                        borderWidth: sizes.borderWidth,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <AppIcon name="hospital" size={sizes.iconLg} color="primary" />
                  </View>

                  <View style={styles.doctorInfoCol}>
                    <View style={styles.titleRatingRow}>
                      <ThemedText variant="bodyBold" numberOfLines={1} style={styles.flex}>
                        {clinic.name}
                      </ThemedText>
                      <Badge label="Open Today" tone="success" size="sm" />
                    </View>

                    <ThemedText variant="smallBold" color="primary" numberOfLines={1}>
                      {clinic.specialties?.length ? clinic.specialties.join(', ') : 'Comprehensive Care'}
                    </ThemedText>
                    <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                      {clinic.address || 'Clinic EZ Partner Network'}
                    </ThemedText>
                  </View>
                </View>

                {/* Tags */}
                <View
                  style={[
                    styles.tagsRow,
                    {
                      borderTopColor: colors.borderLight,
                      borderTopWidth: sizes.borderWidth,
                      paddingTop: spacing.xs,
                      gap: spacing.xs,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.tagPill,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderRadius: radii.full,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: spacing.xxs,
                      },
                    ]}
                  >
                    <ThemedText variant="caption" color="textSecondary">
                      Walk-ins Welcome
                    </ThemedText>
                  </View>
                  {clinic.isPhilHealthAccredited ? (
                    <View
                      style={[
                        styles.tagPill,
                        {
                          backgroundColor: colors.primarySubtle,
                          borderRadius: radii.full,
                          paddingHorizontal: spacing.sm,
                          paddingVertical: spacing.xxs,
                        },
                      ]}
                    >
                      <ThemedText variant="captionBold" color="primary">
                        PhilHealth Accredited
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* Bottom Action Row */}
                <View
                  style={[
                    styles.cardActionRow,
                    {
                      borderTopColor: colors.borderLight,
                      borderTopWidth: sizes.borderWidth,
                      paddingTop: spacing.xs,
                    },
                  ]}
                >
                  <View style={styles.nextSlotRow}>
                    <AppIcon name="clock" size={14} color="primary" />
                    <ThemedText variant="caption" color="textSecondary">
                      {clinic.operatingHours || 'Mon–Sat: 8:00 AM – 5:00 PM'}
                    </ThemedText>
                  </View>

                  <Button
                    label="View Clinic"
                    variant="primary"
                    size="sm"
                    onPress={() => onViewClinic(clinic.id)}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Section 3: Specialized Care Packages */}
      {showServices && allPackages.length > 0 ? (
        <View style={[styles.sectionBlock, { gap: spacing.sm }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithBadge}>
              <View
                style={[
                  styles.sectionDot,
                  {
                    backgroundColor: colors.purple,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <ThemedText variant="captionBold" color="textSecondary" style={styles.uppercase}>
                Specialized Care Packages
              </ThemedText>
              <Badge label={`${allPackages.length} Packages`} tone="neutral" size="sm" />
            </View>

            {onSeeAllPackages ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="See all packages"
                onPress={onSeeAllPackages}
                style={styles.seeAllRow}
              >
                <ThemedText variant="smallBold" color="primaryText">
                  See all
                </ThemedText>
                <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
              </Pressable>
            ) : null}
          </View>

          {/* Package Cards */}
          <View style={[styles.cardsList, { gap: spacing.sm }]}>
            {allPackages.map((pkg) => (
              <View
                key={`${pkg.clinicId}-${pkg.id}`}
                style={[
                  styles.resultCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.borderLight,
                    borderWidth: sizes.borderWidth,
                    borderRadius: radii.xl,
                    padding: spacing.md,
                    gap: spacing.sm,
                  },
                  shadows.sm,
                ]}
              >
                <View style={styles.cardTopRow}>
                  <View
                    style={[
                      styles.avatarBox,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <AppIcon name="activity" size={sizes.iconLg} color="onPrimary" />
                  </View>

                  <View style={styles.doctorInfoCol}>
                    <View style={styles.titleRatingRow}>
                      <ThemedText variant="bodyBold" numberOfLines={1} style={styles.flex}>
                        {pkg.name}
                      </ThemedText>
                      <Badge label="Covered" tone="success" size="sm" />
                    </View>

                    <ThemedText variant="smallBold" color="primary" numberOfLines={1}>
                      {pkg.clinicName}
                    </ThemedText>
                    <ThemedText variant="caption" color="textSecondary" numberOfLines={2}>
                      {pkg.description || `${pkg.durationMinutes ?? 30} min • Complete diagnostic consultation`}
                    </ThemedText>
                  </View>
                </View>

                {/* Bottom Action Row */}
                <View
                  style={[
                    styles.cardActionRow,
                    {
                      borderTopColor: colors.borderLight,
                      borderTopWidth: sizes.borderWidth,
                      paddingTop: spacing.xs,
                    },
                  ]}
                >
                  <View style={styles.nextSlotRow}>
                    <AppIcon name="clock" size={14} color="primary" />
                    <ThemedText variant="caption" color="textSecondary">
                      Duration: <ThemedText variant="captionBold" color="text">{pkg.durationMinutes ?? 30} Mins</ThemedText>
                    </ThemedText>
                  </View>

                  <Button
                    label="Schedule"
                    variant="primary"
                    size="sm"
                    onPress={() => onSchedulePackage(pkg.id, pkg.clinicId)}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  uppercase: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  container: {
    width: '100%',
  },
  filterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionBlock: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionDot: {
    width: 8,
    height: 8,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardsList: {
    width: '100%',
  },
  resultCard: {
    width: '100%',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tagPill: {
    alignSelf: 'flex-start',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
