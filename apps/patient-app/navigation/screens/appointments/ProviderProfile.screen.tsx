import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, type StaticScreenProps } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import ThemedText from '../../../components/ui/ThemedText';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import { AppIcon } from '../../../components/ui/Icon';
import Screen from '../../../components/layout/Screen';
import { Skeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import EntityMediaCardHeader from '../../../components/ui/EntityMediaCardHeader';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { usePatientId } from '../../../hooks/usePatientId';
import {
  getPractitionerProfile,
  type DirectoryDoctorAffiliationDto,
  type DirectoryDoctorDto,
  type PractitionerProfileDto,
} from '../../../services/api/homeApi';
import {
  cachePractitionerProfile,
  getCachedPractitionerProfile,
} from '../../../services/search/networkDirectory';
import {
  formatAvailabilityWindow,
  resolveDoctorAffiliations,
} from '../../../services/search/directorySearchService';
import type { AffiliatedClinic, ProviderSnapshot } from '../../../services/appointments/types';
import { db } from '../../../db/index';
import { patientHealthcareProviders } from '../../../db/schema/patientHealthcareProviders';

function StarRating({ rating }: { rating: number }) {
  const { spacing } = useAppTheme();
  const filled = Math.round(rating);
  return (
    <View style={[styles.starRow, { gap: spacing.xxs }]}>
      {Array.from({ length: 5 }, (_, i) => (
        <AppIcon
          key={i}
          name="star"
          size={16}
          color={i < filled ? 'warning' : 'textLight'}
        />
      ))}
      <ThemedText variant="smallBold" color="textSecondary" style={{ marginLeft: spacing.xs }}>
        {rating.toFixed(1)}
      </ThemedText>
    </View>
  );
}

type Props = StaticScreenProps<{
  providerData?: ProviderSnapshot;
  directoryDoctor?: DirectoryDoctorDto;
  id?: string;
}>;

function AffiliatedClinicCard({
  clinic,
  affiliation,
  providerName,
  practitionerId,
  fallbackProviderId,
  onBookClinic,
}: {
  clinic?: AffiliatedClinic;
  affiliation?: DirectoryDoctorAffiliationDto;
  providerName: string;
  practitionerId?: string | null;
  fallbackProviderId: string;
  onBookClinic?: (params: {
    clinicId: string;
    providerId: string;
    practitionerId?: string;
    providerName: string;
    reason: string;
  }) => void;
}) {
  const { colors, spacing, radii } = useAppTheme();
  const clinicId = affiliation?.clinicId ?? clinic?.id ?? '';
  const clinicName = affiliation?.clinicName ?? clinic?.name ?? 'Affiliated Clinic';
  const clinicAddress = affiliation?.clinicAddress ?? clinic?.address;
  const supportsAppointments = affiliation ? affiliation.supportsAppointments : true;
  const localSpecialty = affiliation?.localSpecialty;
  const availabilities = affiliation?.availabilities ?? [];
  const nextLabel = affiliation?.nextAvailableLabel;
  const clinicProviderId = affiliation?.providerId || fallbackProviderId;

  return (
    <View
      style={[
        styles.affiliationCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceSubtle,
          borderRadius: radii.lg,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      {clinic ? (
        <EntityMediaCardHeader
          name={clinicName}
          logoUrl={clinic.logoUrl}
          coverImageUrl={clinic.coverImageUrl}
          badgeLabel={supportsAppointments ? 'Verified Clinic' : 'Booking Paused'}
          badgeColor={supportsAppointments ? colors.primary : colors.warning}
        />
      ) : (
        <View style={[styles.affiliationHeaderRow, { gap: spacing.sm }]}>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <ThemedText variant="title" color="text">
              {clinicName}
            </ThemedText>
            {localSpecialty ? (
              <ThemedText variant="smallBold" color="primaryText">
                {localSpecialty}
              </ThemedText>
            ) : null}
          </View>
          <Badge
            label={supportsAppointments ? 'Accepting Bookings' : 'Booking Paused'}
            tone={supportsAppointments ? 'success' : 'warning'}
            icon={supportsAppointments ? 'calendarCheck' : 'alert'}
            size="sm"
          />
        </View>
      )}

      {clinic && localSpecialty ? (
        <ThemedText variant="smallBold" color="primaryText">
          Specialty at location: {localSpecialty}
        </ThemedText>
      ) : null}

      {clinicAddress ? (
        <View style={[styles.metaRow, { gap: spacing.xs }]}>
          <AppIcon name="location" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {clinicAddress}
          </ThemedText>
        </View>
      ) : null}

      {availabilities.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="captionBold" color="textMuted">
            SCHEDULE SLOTS
          </ThemedText>
          <View style={[styles.scheduleWrap, { gap: spacing.xs }]}>
            {availabilities.map((win, idx) => (
              <View
                key={`${clinicId}-${idx}`}
                style={[
                  styles.schedulePill,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <ThemedText variant="caption" color="text">
                  {formatAvailabilityWindow(win)}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      ) : nextLabel ? (
        <View style={[styles.metaRow, { gap: spacing.xs }]}>
          <AppIcon name="clock" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textSecondary">
            {supportsAppointments ? `Next available: ${nextLabel}` : nextLabel}
          </ThemedText>
        </View>
      ) : null}

      {onBookClinic && clinicId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !supportsAppointments }}
          accessibilityLabel={
            supportsAppointments
              ? `Book at ${clinicName}`
              : `Booking paused at ${clinicName}`
          }
          disabled={!supportsAppointments}
          onPress={() => {
            if (!supportsAppointments) return;
            onBookClinic({
              clinicId,
              providerId: clinicProviderId,
              practitionerId: practitionerId ?? undefined,
              providerName,
              reason: localSpecialty
                ? `${localSpecialty} Consultation`
                : `Consultation with ${providerName}`,
            });
          }}
          style={({ pressed }) => [
            styles.bookAffiliationBtn,
            {
              backgroundColor: supportsAppointments ? colors.primary : colors.surface,
              borderColor: supportsAppointments ? colors.primary : colors.border,
              borderRadius: radii.full,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              opacity: !supportsAppointments ? 0.65 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppIcon
            name={supportsAppointments ? 'calendarCheck' : 'alert'}
            size={15}
            color={supportsAppointments ? 'onPrimary' : 'textMuted'}
          />
          <ThemedText
            variant="smallBold"
            color={supportsAppointments ? 'onPrimary' : 'textMuted'}
            style={{ marginLeft: spacing.xs }}
          >
            {supportsAppointments ? 'Book at This Clinic' : 'Booking Paused'}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ProviderProfileScreen({ route }: Props) {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const { getToken } = useAuth();
  const patientId = usePatientId();
  const rawParams = (route.params ?? {}) as any;
  const initialProvider = rawParams?.providerData as ProviderSnapshot | undefined;
  const initialDoctor = rawParams?.directoryDoctor as DirectoryDoctorDto | undefined;
  const providerId = rawParams?.id ?? initialProvider?.id ?? initialDoctor?.id;

  const [provider, setProvider] = useState<ProviderSnapshot | null>(initialProvider ?? null);
  const [directoryProfile, setDirectoryProfile] = useState<PractitionerProfileDto | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(
    Boolean(initialDoctor?.isVerified),
  );
  const [isLoading, setIsLoading] = useState(!initialProvider && !initialDoctor);

  useEffect(() => {
    let active = true;
    const targetId = providerId ? String(providerId) : '';
    if (!targetId) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        // 1. Try cached network practitioner profile first for instant display
        const cached = await getCachedPractitionerProfile(targetId, patientId);
        if (active && cached) {
          setDirectoryProfile(cached);
          setIsVerified(cached.isVerified);
          setProvider((prev) => ({
            id: cached.id,
            name: cached.name,
            specialty: cached.primarySpecialty || prev?.specialty || 'General Practitioner',
            avatarUrl: cached.avatarUrl ?? prev?.avatarUrl ?? undefined,
            rating: prev?.rating ?? 5.0,
            bio: cached.bio ?? prev?.bio ?? '',
            credentials: cached.displayPrcLicenseNo
              ? [`PRC ${cached.displayPrcLicenseNo}`]
              : prev?.credentials ?? [],
            affiliatedClinics:
              cached.affiliations.map((aff) => ({
                id: aff.clinicId,
                name: aff.clinicName,
                address: aff.clinicAddress ?? '',
              })) ?? prev?.affiliatedClinics ?? [],
          }));
          setIsLoading(false);
        }

        // 2. Fetch live practitioner profile from /api/v1/practitioners/{id} when online
        try {
          const remote = await getPractitionerProfile(getToken, targetId, patientId);
          if (active && remote) {
            setDirectoryProfile(remote);
            setIsVerified(remote.isVerified);
            setProvider({
              id: remote.id,
              name: remote.name,
              specialty: remote.primarySpecialty || 'General Practitioner',
              avatarUrl: remote.avatarUrl ?? undefined,
              rating: 5.0,
              bio: remote.bio ?? '',
              credentials: remote.displayPrcLicenseNo ? [`PRC ${remote.displayPrcLicenseNo}`] : [],
              affiliatedClinics: remote.affiliations.map((aff) => ({
                id: aff.clinicId,
                name: aff.clinicName,
                address: aff.clinicAddress ?? '',
              })),
            });
            await cachePractitionerProfile(remote, patientId);
            setIsLoading(false);
            return;
          }
        } catch {
          // Offline or unreachable — proceed with cached/local SQLite fallback
        }

        if (active && (cached || initialProvider || initialDoctor)) {
          if (initialDoctor && !cached) {
            setIsVerified(Boolean(initialDoctor.isVerified));
          }
          setIsLoading(false);
          return;
        }

        // 3. Fallback to personal SQLite care team contact (always unverified)
        const rows = await db
          .select()
          .from(patientHealthcareProviders)
          .where(eq(patientHealthcareProviders.id, targetId))
          .limit(1);

        if (!active) return;

        if (rows[0]) {
          setIsVerified(false);
          setProvider({
            id: rows[0].id,
            name: rows[0].name || 'Healthcare Provider',
            specialty: rows[0].specialty || 'General Medicine',
            avatarUrl: undefined,
            rating: 5.0,
            bio: `Attending healthcare provider at ${rows[0].clinicHospital || 'accredited facility'}.`,
            credentials: [],
            affiliatedClinics: [],
          });
        } else {
          setIsVerified(false);
          setProvider({
            id: targetId,
            name: 'Healthcare Provider',
            specialty: 'General Practitioner',
            avatarUrl: undefined,
            rating: 5.0,
            bio: 'Attending physician providing outpatient clinical consultations.',
            credentials: ['MD'],
            affiliatedClinics: [],
          });
        }
      } catch {
        if (active && !initialProvider) {
          setIsVerified(false);
          setProvider({
            id: targetId,
            name: 'Healthcare Provider',
            specialty: 'General Practitioner',
            avatarUrl: undefined,
            rating: 5.0,
            bio: 'Attending physician providing outpatient clinical consultations.',
            credentials: ['MD'],
            affiliatedClinics: [],
          });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [getToken, initialDoctor, initialProvider, patientId, providerId]);

  const affiliations = useMemo<DirectoryDoctorAffiliationDto[]>(() => {
    if (directoryProfile?.affiliations && directoryProfile.affiliations.length > 0) {
      return directoryProfile.affiliations;
    }
    if (initialDoctor) {
      return resolveDoctorAffiliations(initialDoctor);
    }
    return [];
  }, [directoryProfile, initialDoctor]);

  if (isLoading) {
    return (
      <Screen width="form" contentContainerStyle={{ gap: spacing.lg, padding: spacing.md }}>
        <Skeleton height={220} radius={radii.lg} />
      </Screen>
    );
  }

  if (!provider) {
    return (
      <Screen width="form" contentContainerStyle={{ gap: spacing.lg, padding: spacing.md }}>
        <EmptyState
          icon="stethoscope"
          title="Provider Not Found"
          message="The healthcare provider details could not be found."
        />
      </Screen>
    );
  }

  const initials = provider.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleBookAffiliation = (params: {
    clinicId: string;
    providerId: string;
    practitionerId?: string;
    providerName: string;
    reason: string;
  }) => {
    navigation.navigate('BookingDraftScreen', params);
  };

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      {/* Header - Avatar + Name + Specialty + Verification */}
      <View style={[styles.header, { gap: spacing.sm, paddingVertical: spacing.lg }]}>
        {provider.avatarUrl ? (
          <Image
            source={{ uri: provider.avatarUrl }}
            style={[styles.avatar, { borderRadius: radii.full }]}
            accessibilityRole="image"
            accessibilityLabel={provider.name}
          />
        ) : (
          <View
            style={[
              styles.avatar,
              {
                borderRadius: radii.full,
                backgroundColor: colors.primaryLight,
              },
            ]}
          >
            <ThemedText variant="display" color="primaryText">
              {initials}
            </ThemedText>
          </View>
        )}
        <ThemedText variant="h1" style={styles.textCenter}>
          {provider.name}
        </ThemedText>
        {provider.specialty ? (
          <ThemedText variant="bodyLarge" color="textSecondary" style={styles.textCenter}>
            {provider.specialty}
          </ThemedText>
        ) : null}

        <View style={[styles.credRow, { gap: spacing.xs }]}>
          {isVerified ? (
            <Badge label="Verified Clinician" tone="success" icon="badgeCheck" size="sm" />
          ) : (
            <Badge label="Care Team Contact" tone="neutral" size="sm" />
          )}
          {directoryProfile?.role ? (
            <Badge label={directoryProfile.role} tone="routine" size="sm" />
          ) : null}
        </View>

        <StarRating rating={provider.rating} />

        {provider.credentials.length > 0 ? (
          <View style={[styles.credRow, { gap: spacing.xs, marginTop: spacing.xs }]}>
            {provider.credentials.map((c) => (
              <Badge key={c} label={c} tone="primary" size="md" />
            ))}
          </View>
        ) : null}
      </View>

      {/* Biography */}
      {provider.bio ? (
        <Card padding="lg" style={{ gap: spacing.sm }}>
          <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
            BIOGRAPHY
          </ThemedText>
          <ThemedText variant="body" color="text">
            {provider.bio}
          </ThemedText>
        </Card>
      ) : null}

      {/* Multi-Clinic Affiliations & Schedules */}
      {(affiliations.length > 0 || provider.affiliatedClinics.length > 0) ? (
        <Card padding="lg" style={{ gap: spacing.md }}>
          <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
            AFFILIATED CLINICS ({affiliations.length > 0 ? affiliations.length : provider.affiliatedClinics.length})
          </ThemedText>
          <View style={{ gap: spacing.md }}>
            {affiliations.length > 0
              ? affiliations.map((aff) => {
                  const matchedSnapshot = provider.affiliatedClinics.find(
                    (c) => c.id === aff.clinicId,
                  );
                  return (
                    <AffiliatedClinicCard
                      key={`${aff.clinicId}-${aff.providerId ?? 'primary'}`}
                      clinic={matchedSnapshot}
                      affiliation={aff}
                      providerName={provider.name}
                      practitionerId={directoryProfile?.practitionerId ?? directoryProfile?.id}
                      fallbackProviderId={provider.id}
                      onBookClinic={handleBookAffiliation}
                    />
                  );
                })
              : provider.affiliatedClinics.map((clinic) => (
                  <AffiliatedClinicCard
                    key={clinic.id}
                    clinic={clinic}
                    providerName={provider.name}
                    fallbackProviderId={provider.id}
                  />
                ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  credRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  affiliationCard: {
    borderWidth: 1,
  },
  affiliationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  schedulePill: {
    borderWidth: 1,
  },
  bookAffiliationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
