import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import Badge from '@ui/Badge';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityCoverHeader from '@ui/EntityCoverHeader';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from '@shared/safe';
import { usePatientId } from 'hooks/usePatientId';
import {
  getClinicDetail,
  getClinicDetailOnline,
  getShareFieldLabel,
  joinClinic,
  cancelClinicMembershipOnline,
  unlockClinicAccess,
} from '../../services/discovery/discoveryService';
import { ClinicDetail, ConsentSelection } from '../../services/discovery/types';
import { dialog } from '@utils/dialog';
import GatedServiceCatalogLockedCard from '../../components/clinics/GatedServiceCatalogLockedCard';
import ClinicJoinCodeModal from '../../components/clinics/ClinicJoinCodeModal';

function ConsentToggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const { colors, radii, sizes } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={({ pressed, hovered }: any) => [
        styles.consentRow,
        {
          borderColor: value ? colors.primary : hovered ? colors.borderDark : colors.border,
          backgroundColor: value ? colors.surfaceSubtle : colors.transparent,
          borderRadius: radii.md,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: value ? colors.primary : colors.border,
            backgroundColor: value ? colors.primary : colors.transparent,
            borderRadius: radii.xs,
          },
        ]}
      >
        {value ? <AppIcon name="check" size={sizes.iconSm - 2} color="onPrimary" /> : null}
      </View>
      <ThemedText variant="small" style={styles.consentLabel}>{label}</ThemedText>
    </Pressable>
  );
}

export default function ClinicDetailsScreenWeb() {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const navigation = useNavigation() as any;
  const route = useRoute() as any;
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const clinicId = String(route.params?.clinicId ?? route.params?.id ?? '');

  const [clinic, setClinic] = useState<ClinicDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [consent, setConsent] = useState<ConsentSelection>({
    acceptedPrivacyPolicy: false,
    acceptedTermsAndConditions: false,
    acceptedDataSharing: false,
  });

  const canJoin = useMemo(() => consent.acceptedPrivacyPolicy && consent.acceptedTermsAndConditions && consent.acceptedDataSharing, [consent]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    const loadData = async () => {
      let hasData = false;
      try {
        const localDetail = await getClinicDetail(patientId, clinicId);
        if (mounted && localDetail) {
          setClinic(localDetail);
          hasData = true;
          setIsLoading(false);
        }
      } catch (error) {
        console.log('Local load failed:', error);
      }

      try {
        const state = await NetInfo.fetch();
        if (state.isConnected) {
          const remoteDetail = await getClinicDetailOnline(patientId, clinicId, getToken);
          if (remoteDetail && mounted) {
            setClinic(remoteDetail);
            hasData = true;
          }
        }
      } catch (error) {
        console.log('Background online load failed:', error);
      }

      if (mounted) {
        setIsLoading(false);
        if (!hasData) {
          dialog.alert('Error', 'Unable to load clinic details.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [clinicId, patientId, navigation]);

  const startJoin = () => {
    setConsent({ acceptedPrivacyPolicy: false, acceptedTermsAndConditions: false, acceptedDataSharing: false });
    setShowJoinModal(true);
  };

  const handleJoin = async () => {
    if (!clinic) return;
    setIsJoining(true);
    const [, error] = await safeAwait(joinClinic(patientId, { clinicId: clinic.id, consent }, getToken));
    if (error) {
      if (error.message === 'OFFLINE_ERROR') {
        setShowJoinModal(false);
        showOfflineAlert();
      } else {
        dialog.alert('Join failed', error.message);
      }
      setIsJoining(false);
      return;
    }

    const [refreshed] = await safeAwait(getClinicDetail(patientId, clinic.id));
    if (refreshed) {
      setClinic(refreshed);
    }
    setShowJoinModal(false);
    setIsJoining(false);
    dialog.alert('Request Submitted', `Your request to join ${clinic.name} has been submitted for approval.`);
  };

  const handleCancelRequest = async () => {
    if (!clinic) return;
    setIsCancelling(true);
    const [, error] = await safeAwait(cancelClinicMembershipOnline(patientId, clinic.id, getToken));
    if (error) {
      if (error.message === 'OFFLINE_ERROR') {
        showOfflineAlert();
      } else {
        dialog.alert('Cancel failed', error.message);
      }
      setIsCancelling(false);
      return;
    }

    const [refreshed] = await safeAwait(getClinicDetail(patientId, clinic.id));
    if (refreshed) {
      setClinic(refreshed);
    } else {
      navigation.goBack();
    }
    setIsCancelling(false);
    dialog.alert('Request Cancelled', `Your request to join ${clinic.name} has been cancelled.`);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { padding: spacing.xl, gap: spacing.lg }]}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (!clinic) {
    return (
      <EmptyState
        title="Clinic not found"
        message="This clinic may no longer be available in your cached catalog."
        actionLabel="Go back"
        onActionPress={() => navigation.goBack()}
      />
    );
  }

  // Sidebar Booking & Membership Card component (desktop sticky, mobile inline)
  const BookingSidebarCard = () => (
    <View
      style={[
        styles.actionCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: radii.xl,
          borderWidth: sizes.borderWidth,
          padding: spacing.xl,
          gap: spacing.lg,
        },
        shadows.sm,
      ]}
    >
      <View style={{ gap: spacing.xs }}>
        <ThemedText variant="title">Appointment & Access</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          {clinic.isJoined
            ? 'You are an enrolled patient at this clinic.'
            : clinic.membershipStatus === 'pending'
            ? 'Your join request is pending approval.'
            : clinic.isPublic
            ? 'You can join directly as a patient.'
            : 'Join a partnered organization to unlock this clinic.'}
        </ThemedText>
      </View>

      {/* Book appointment button or Gated Notice */}
      {clinic.isGated && !clinic.isUnlocked ? (
        <View
          style={[
            styles.lockedSidebarBanner,
            {
              backgroundColor: colors.primarySubtle,
              borderColor: colors.primaryBorder,
              borderRadius: radii.md,
              borderWidth: sizes.borderWidth,
              padding: spacing.md,
              gap: spacing.xs,
            },
          ]}
        >
          <Badge label="Institutional Access" tone="warning" icon="lock" size="sm" />
          <ThemedText variant="smallBold" color="primaryText">Membership Required</ThemedText>
          <ThemedText variant="caption" color="textSecondary">
            Enter your join code or scan the clinic QR to unlock appointment booking.
          </ThemedText>
        </View>
      ) : clinic.supportsAppointments && !clinic.isOnlineBookingPaused ? (
        <Pressable
          onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen', params: { clinicId: clinic.id } })}
          accessibilityRole="button"
          accessibilityLabel="Book an appointment"
          style={({ pressed, hovered }: any) => [
            styles.primaryButton,
            {
              backgroundColor: hovered ? colors.primaryHover : colors.primary,
              borderRadius: radii.md,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <AppIcon name="calendar" size={sizes.iconMd} color="onPrimary" />
          <ThemedText variant="smallBold" color="onPrimary" style={{ marginLeft: spacing.xs }}>
            Book Consultation
          </ThemedText>
        </Pressable>
      ) : clinic.supportsAppointments && clinic.isOnlineBookingPaused ? (
        <View style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: radii.md, opacity: 0.6 }]}>
          <ThemedText variant="smallBold" color="textMuted">Booking not yet available</ThemedText>
        </View>
      ) : null}

      {/* Join or Cancel buttons */}
      {!(clinic.isGated && !clinic.isUnlocked) && !clinic.isJoined && clinic.membershipStatus !== 'pending' ? (
        <Pressable
          onPress={startJoin}
          accessibilityRole="button"
          accessibilityLabel={`Join ${clinic.name}`}
          style={({ pressed, hovered }: any) => [
            styles.secondaryButton,
            {
              borderColor: hovered ? colors.borderDark : colors.border,
              backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
              borderRadius: radii.md,
              borderWidth: sizes.borderWidth,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText variant="smallBold" color="text">Join clinic</ThemedText>
        </Pressable>
      ) : clinic.membershipStatus === 'pending' ? (
        <View style={{ gap: spacing.sm }}>
          <View
            style={[
              styles.primaryButton,
              {
                backgroundColor: colors.warning,
                borderRadius: radii.md,
                opacity: 0.85,
                justifyContent: 'center',
                alignItems: 'center',
              },
            ]}
          >
            <ThemedText variant="smallBold" color="onPrimary">Pending Approval</ThemedText>
          </View>
          <Pressable
            onPress={handleCancelRequest}
            disabled={isCancelling}
            accessibilityRole="button"
            accessibilityLabel="Cancel join request"
            style={({ pressed, hovered }: any) => [
              styles.secondaryButton,
              {
                borderColor: hovered ? colors.emergencyBorder : colors.emergency,
                backgroundColor: hovered ? colors.emergencyBg : colors.transparent,
                borderRadius: radii.md,
                borderWidth: sizes.borderWidth,
                opacity: pressed || isCancelling ? 0.7 : 1,
              },
            ]}
          >
            <ThemedText variant="smallBold" color="emergency">
              {isCancelling ? 'Cancelling...' : 'Cancel join request'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {/* Quick stats divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={{ gap: spacing.sm }}>
        <View style={[styles.metaItem, { gap: spacing.sm }]}>
          <AppIcon name="location" size={sizes.iconSm} color="textMuted" />
          <ThemedText variant="caption" color="textMuted" style={{ flex: 1 }}>{clinic.address}</ThemedText>
        </View>
        <View style={[styles.metaItem, { gap: spacing.sm }]}>
          <AppIcon name="hospital" size={sizes.iconSm} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            {clinic.isPublic ? 'Public Clinic' : 'Private Clinic'}
          </ThemedText>
        </View>
        <View style={[styles.metaItem, { gap: spacing.sm }]}>
          <AppIcon name="stethoscope" size={sizes.iconSm} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            {clinic.healthcareProviders.length} Providers · {clinic.services.length} Services
          </ThemedText>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing['4xl'] }]}
    >
      {/* Cover Header */}
      <EntityCoverHeader
        name={clinic.name}
        logoUrl={clinic.logoUrl}
        coverImageUrl={clinic.coverImageUrl}
        badgeLabel={clinic.isJoined ? 'Joined' : clinic.membershipStatus === 'pending' ? 'Pending Approval' : clinic.isPublic ? 'Public' : 'Private'}
        badgeColor={clinic.isJoined ? colors.success : clinic.membershipStatus === 'pending' ? colors.warning : clinic.isPublic ? colors.primary : colors.textMuted}
      />

      {/* Body: Two columns on desktop >= 1024, single column below */}
      <View style={[styles.bodyContainer, isDesktop ? styles.desktopRow : styles.singleColumn, { gap: spacing.xl, paddingHorizontal: spacing.xl, marginTop: spacing.lg }]}>
        {/* Left Column: Details */}
        <View style={[styles.leftColumn, { gap: spacing.lg }]}>
          {/* Title & Description */}
          <View style={{ gap: spacing.xs }}>
            <ThemedText variant="h1">{clinic.name}</ThemedText>
            {clinic.isPhilHealthAccredited ? (
              <Badge
                label="PhilHealth YAKAP Accredited"
                tone="routine"
                icon="shield"
                size="sm"
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
            <ThemedText variant="body" color="textSecondary">{clinic.description}</ThemedText>
            <ThemedText variant="caption" color="textMuted">
              {clinic.isPublic ? 'Public clinic' : 'Private clinic'} ·{' '}
              {clinic.supportsAppointments && !clinic.isOnlineBookingPaused
                ? 'Supports bookings'
                : 'Booking not yet available'}
            </ThemedText>
            <ThemedText variant="caption" color="textMuted">{clinic.address}</ThemedText>
          </View>

          {/* Structured Public Attributes: Operating Hours, Location, Contact */}
          <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
            {clinic.operatingHours ? (
              <>
                <View style={styles.attributeRow}>
                  <AppIcon name="clock" size={sizes.iconMd} color="primary" />
                  <View style={styles.attributeTextCol}>
                    <ThemedText variant="smallBold" color="text">Operating Hours</ThemedText>
                    <ThemedText variant="caption" color="textSecondary">{clinic.operatingHours}</ThemedText>
                  </View>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </>
            ) : null}
            <View style={styles.attributeRow}>
              <AppIcon name="location" size={sizes.iconMd} color="primary" />
              <View style={styles.attributeTextCol}>
                <ThemedText variant="smallBold" color="text">Physical Location</ThemedText>
                <ThemedText variant="caption" color="textSecondary">{clinic.address}</ThemedText>
              </View>
            </View>
            {clinic.contactNumber || clinic.contactEmail ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.contactRow}>
                  {clinic.contactNumber ? (
                    <View style={[styles.contactChip, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle, borderRadius: radii.full }]}>
                      <AppIcon name="phone" size={sizes.iconSm} color="primary" />
                      <ThemedText variant="captionBold" color="textSecondary">{clinic.contactNumber}</ThemedText>
                    </View>
                  ) : null}
                  {clinic.contactEmail ? (
                    <View style={[styles.contactChip, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle, borderRadius: radii.full }]}>
                      <AppIcon name="mail" size={sizes.iconSm} color="primary" />
                      <ThemedText variant="captionBold" color="textSecondary">{clinic.contactEmail}</ThemedText>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>

          {/* If NOT desktop, show Booking Card inline here */}
          {!isDesktop ? <BookingSidebarCard /> : null}

          {/* Gated Intake vs Active Service Catalog */}
          {clinic.isGated && !clinic.isUnlocked ? (
            <GatedServiceCatalogLockedCard
              clinic={clinic}
              onEnterJoinCode={() => setShowJoinCodeModal(true)}
              onScanQr={() => setShowJoinCodeModal(true)}
              onJoinOrganization={(orgId) =>
                navigation.navigate('Main', {
                  screen: 'OrganizationDetailsScreen',
                  params: { organizationId: orgId },
                })
              }
            />
          ) : (
            <>
              {/* Required Sharing Section */}
              <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
                <ThemedText variant="title">Required Data Sharing</ThemedText>
                <ThemedText variant="body" color="textSecondary">Information required by this clinic when you book or enroll:</ThemedText>
                <View style={[styles.requiredWrap, { gap: spacing.sm }]}>
                  {clinic.requiredShareFields.map((field) => (
                    <View key={field} style={[styles.requiredChip, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle, borderRadius: radii.full, borderWidth: sizes.borderWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }]}>
                      <ThemedText variant="captionBold" color="textSecondary">{getShareFieldLabel(field)}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>

              {/* Healthcare Providers Section */}
              <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
                <ThemedText variant="title">Healthcare Providers</ThemedText>
                {clinic.healthcareProviders.length === 0 ? (
                  <ThemedText variant="body" color="textMuted">No providers listed for this clinic.</ThemedText>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {clinic.healthcareProviders.map((provider, idx) => (
                      <View key={provider.id}>
                        {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                        <Pressable
                          onPress={() =>
                            navigation.navigate('Main', {
                              screen: 'ProviderProfileScreen',
                              params: {
                                providerData: {
                                  ...provider,
                                  affiliatedClinics: [{ id: clinic.id, name: clinic.name, address: clinic.address, logoUrl: clinic.logoUrl ?? null, coverImageUrl: clinic.coverImageUrl ?? null }],
                                },
                              },
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`View profile of ${provider.name}`}
                          style={({ pressed, hovered }: any) => [
                            styles.providerRow,
                            {
                              backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                              borderRadius: radii.md,
                              padding: spacing.sm,
                              opacity: pressed ? 0.75 : 1,
                            },
                          ]}
                        >
                          <View style={[styles.providerAvatar, { backgroundColor: colors.primary, borderRadius: radii.full }]}>
                            <ThemedText variant="smallBold" color="onPrimary">
                              {provider.name.split(' ').filter(w => w[0]?.match(/[A-Z]/)).slice(0, 2).map(w => w[0]).join('')}
                            </ThemedText>
                          </View>
                          <View style={styles.providerInfo}>
                            <ThemedText variant="bodyBold" color="text">{provider.name}</ThemedText>
                            <ThemedText variant="caption" color="textMuted">
                              {provider.specialty} · {provider.credentials.join(', ')}
                            </ThemedText>
                          </View>
                          <AppIcon name="forward" size={sizes.iconMd} color="textMuted" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Services & Pricing Section */}
              <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
                <ThemedText variant="title">Services & Pricing</ThemedText>
                {!clinic.services || clinic.services.length === 0 ? (
                  <ThemedText variant="body" color="textMuted">No services listed for this clinic.</ThemedText>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {clinic.services.map((service, idx) => (
                      <View key={service.id}>
                        {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                        <View style={[styles.serviceRow, { paddingVertical: spacing.sm }]}>
                          <View style={styles.serviceInfo}>
                            <ThemedText variant="bodyBold" color="text">{service.name}</ThemedText>
                            {service.description ? (
                              <ThemedText variant="caption" color="textSecondary" numberOfLines={2}>
                                {service.description}
                              </ThemedText>
                            ) : null}
                            <ThemedText variant="caption" color="textMuted">
                              {service.durationMinutes ? `${service.durationMinutes} mins` : 'N/A duration'}
                            </ThemedText>
                          </View>
                          {service.price !== undefined && service.price !== null ? (
                            <ThemedText variant="title" color="primary">
                              PHP {service.price.toFixed(2)}
                            </ThemedText>
                          ) : (
                            <ThemedText variant="title" color="textSecondary">Free</ThemedText>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}

          {/* Partnered Organizations */}
          {clinic.linkedOrganizations && clinic.linkedOrganizations.length > 0 ? (
            <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
              <ThemedText variant="title">Partner Organizations</ThemedText>
              <View style={{ gap: spacing.sm }}>
                {clinic.linkedOrganizations.map((item, idx) => (
                  <View key={item.id}>
                    {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    <Pressable
                      onPress={() => navigation.navigate('Main', { screen: 'OrganizationDetailsScreen', params: { organizationId: item.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={`View organization ${item.name}`}
                      style={({ pressed, hovered }: any) => [
                        styles.linkRow,
                        {
                          backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                          borderRadius: radii.md,
                          padding: spacing.sm,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <ThemedText variant="bodyBold" color="text">{item.name}</ThemedText>
                      <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>{item.description}</ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Policy Section */}
          <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
            <ThemedText variant="title">Policies</ThemedText>
            {clinic.privacyPolicyUrl ? (
              <ThemedText variant="caption" color="textMuted">Privacy Policy: {clinic.privacyPolicyUrl}</ThemedText>
            ) : null}
            {clinic.termsAndConditionsUrl ? (
              <ThemedText variant="caption" color="textMuted">Terms & Conditions: {clinic.termsAndConditionsUrl}</ThemedText>
            ) : null}
          </View>
        </View>

        {/* Right Column: Sticky Booking Card (Desktop only) */}
        {isDesktop ? (
          <View style={styles.rightColumn}>
            <View style={styles.stickyWrapper}>
              <BookingSidebarCard />
            </View>
          </View>
        ) : null}
      </View>

      {/* Join Modal for Web */}
      <Modal visible={showJoinModal} transparent animationType="fade" onRequestClose={() => setShowJoinModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: radii.xl,
                borderWidth: sizes.borderWidth,
                padding: spacing.xl,
                maxWidth: 540,
                width: '92%',
              },
              shadows.lg,
            ]}
          >
            <ScrollView contentContainerStyle={{ gap: spacing.md }}>
              <ThemedText variant="h2">Join {clinic.name}</ThemedText>
              <ConsentToggle label="I accept the clinic privacy policy" value={consent.acceptedPrivacyPolicy} onPress={() => setConsent((prev) => ({ ...prev, acceptedPrivacyPolicy: !prev.acceptedPrivacyPolicy }))} />
              <ConsentToggle label="I accept the terms and conditions" value={consent.acceptedTermsAndConditions} onPress={() => setConsent((prev) => ({ ...prev, acceptedTermsAndConditions: !prev.acceptedTermsAndConditions }))} />
              <ConsentToggle label="I agree to share my required information" value={consent.acceptedDataSharing} onPress={() => setConsent((prev) => ({ ...prev, acceptedDataSharing: !prev.acceptedDataSharing }))} />
            </ScrollView>
            <View style={[styles.modalActions, { borderTopColor: colors.border, borderTopWidth: sizes.borderWidth, marginTop: spacing.lg, paddingTop: spacing.md, gap: spacing.md }]}>
              <Pressable
                onPress={() => setShowJoinModal(false)}
                accessibilityRole="button"
                style={({ pressed, hovered }: any) => [
                  styles.secondaryButton,
                  {
                    borderColor: hovered ? colors.borderDark : colors.border,
                    backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                    borderRadius: radii.md,
                    borderWidth: sizes.borderWidth,
                    minHeight: sizes.controlMd,
                    paddingHorizontal: spacing.lg,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <ThemedText variant="smallBold" color="text">Cancel</ThemedText>
              </Pressable>
              <Pressable
                disabled={!canJoin || isJoining}
                onPress={handleJoin}
                accessibilityRole="button"
                style={({ pressed, hovered }: any) => [
                  styles.primaryButton,
                  {
                    backgroundColor: hovered ? colors.primaryHover : colors.primary,
                    borderRadius: radii.md,
                    minHeight: sizes.controlMd,
                    paddingHorizontal: spacing.lg,
                    opacity: !canJoin || isJoining ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <ThemedText variant="smallBold" color="onPrimary">{isJoining ? 'Joining...' : 'Confirm join'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Clinic Join Code Modal */}
      <ClinicJoinCodeModal
        visible={showJoinCodeModal}
        clinicId={clinic.id}
        clinicName={clinic.name}
        onClose={() => setShowJoinCodeModal(false)}
        onScanQr={() => setShowJoinCodeModal(true)}
        onUnlock={async (joinCode) => {
          const updated = await unlockClinicAccess(patientId, clinic.id, joinCode, getToken);
          setClinic(updated);
          dialog.alert('Clinic Unlocked', `You now have full access to ${clinic.name}'s service catalog and appointment booking.`);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
  },
  bodyContainer: {
    width: '100%',
  },
  desktopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  singleColumn: {
    flexDirection: 'column',
  },
  leftColumn: {
    flex: 1,
    minWidth: 0,
  },
  rightColumn: {
    width: 360,
    minWidth: 320,
  },
  stickyWrapper: {
    position: 'sticky' as any,
    top: 24,
  },
  actionCard: {},
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {},
  requiredWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  requiredChip: {},
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  providerAvatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
    gap: 2,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  serviceInfo: {
    flex: 1,
    gap: 2,
  },
  linkRow: {
    gap: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    maxHeight: '85%',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentLabel: {
    flex: 1,
  },
  lockedSidebarBanner: {
    gap: 4,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  attributeTextCol: {
    flex: 1,
    gap: 2,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
