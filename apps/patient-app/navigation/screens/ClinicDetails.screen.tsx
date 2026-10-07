import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityCoverHeader from '@ui/EntityCoverHeader';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useContentInsets } from '../../hooks/useContentInsets';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from '@shared/safe';
import { usePatientId } from 'hooks/usePatientId';
import {
  getClinicDetail,
  getClinicDetailOnline,
  getShareFieldLabel,
  joinClinic,
  cancelClinicMembershipOnline,
} from '../../services/discovery/discoveryService';
import { ClinicDetail, ConsentSelection } from '../../services/discovery/types';
import { dialog } from '@utils/dialog';

function ConsentToggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const { colors, radii, sizes } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [
        styles.consentRow,
        {
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.card : colors.transparent,
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

export default function ClinicDetailsScreen() {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const insets = useContentInsets();
  const navigation = useNavigation() as any;
  const route = useRoute() as any;
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const clinicId = String(route.params?.clinicId ?? '');

  const [clinic, setClinic] = useState<ClinicDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      // 1. Load cached details first
      try {
        const localDetail = await getClinicDetail(patientId, clinicId);
        if (mounted) {
          setClinic(localDetail);
          hasData = true;
          setIsLoading(false);
        }
      } catch (error) {
        console.log('Local load failed:', error);
      }

      // 2. Fetch online details in the background if connected
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

  const onRefresh = async () => {
    setRefreshing(true);
    const state = await NetInfo.fetch();
    if (state.isConnected) {
      try {
        const remoteDetail = await getClinicDetailOnline(patientId, clinicId, getToken);
        if (remoteDetail) setClinic(remoteDetail);
      } catch (error) {
        console.log('Online refresh failed:', error);
      }
    } else {
      showOfflineAlert();
    }
    setRefreshing(false);
  };

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
      <ScrollView contentContainerStyle={styles.loadingContainer}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (!clinic) {
    return <EmptyState title="Clinic not found" message="This clinic may no longer be available in your cached catalog." actionLabel="Go back" onActionPress={() => navigation.goBack()} />;
  }

  return (
    <ScrollView 
      contentInsetAdjustmentBehavior="automatic" 
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <EntityCoverHeader
        name={clinic.name}
        logoUrl={clinic.logoUrl}
        coverImageUrl={clinic.coverImageUrl}
        badgeLabel={clinic.isJoined ? 'Joined' : clinic.membershipStatus === 'pending' ? 'Pending Approval' : clinic.isPublic ? 'Public' : 'Private'}
        badgeColor={clinic.isJoined ? colors.success : clinic.membershipStatus === 'pending' ? colors.warning : clinic.isPublic ? colors.primary : colors.textMuted}
        style={styles.coverHeader}
      />
      <View style={styles.titleBlock}>
        <ThemedText variant="h1">{clinic.name}</ThemedText>
        <ThemedText variant="body" color="textSecondary">{clinic.description}</ThemedText>
        <ThemedText variant="caption" color="textMuted">{clinic.isPublic ? 'Public clinic' : 'Private clinic'} · {clinic.supportsAppointments ? 'Supports bookings' : 'Booking not yet available'}</ThemedText>
        <ThemedText variant="caption" color="textMuted">{clinic.address}</ThemedText>
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Access</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          {clinic.isJoined
            ? 'You have joined this clinic.'
            : clinic.membershipStatus === 'pending'
            ? 'Your join request is pending approval.'
            : clinic.isPublic
            ? 'You can join directly from here.'
            : 'Join a partnered organization to unlock this clinic.'}
        </ThemedText>
        {!clinic.isJoined && clinic.membershipStatus !== 'pending' ? (
          <Pressable onPress={startJoin} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
            <ThemedText variant="smallBold" color="onPrimary">Join clinic</ThemedText>
          </Pressable>
        ) : clinic.membershipStatus === 'pending' ? (
          <View style={{ gap: spacing.sm }}>
            <View style={[styles.primaryButton, { backgroundColor: colors.warning, borderRadius: radii.md, opacity: 0.85, justifyContent: 'center', alignItems: 'center' }]}>
              <ThemedText variant="smallBold" color="onPrimary">Request pending approval</ThemedText>
            </View>
            <Pressable
              onPress={handleCancelRequest}
              disabled={isCancelling}
              style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.emergency, borderRadius: radii.md, opacity: pressed || isCancelling ? 0.7 : 1 }]}
              accessibilityRole="button"
            >
              <ThemedText variant="smallBold" color="emergency">
                {isCancelling ? 'Cancelling...' : 'Cancel join request'}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
        {clinic.supportsAppointments ? (
          <Pressable onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen', params: { clinicId: clinic.id } })} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, borderRadius: radii.md, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
            <ThemedText variant="smallBold" color="text">Create booking draft</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Required sharing</ThemedText>
        <View style={styles.requiredWrap}>
          {clinic.requiredShareFields.map((field) => (
            <View key={field} style={[styles.requiredChip, { borderColor: colors.border, borderRadius: radii.full }]}>
              <ThemedText variant="captionBold" color="textSecondary">{getShareFieldLabel(field)}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Healthcare Providers</ThemedText>
        {clinic.healthcareProviders.length === 0 ? (
          <ThemedText variant="body" color="textMuted">No providers listed for this clinic.</ThemedText>
        ) : (
          <View style={{ gap: spacing.md }}>
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
                  style={({ pressed }) => [styles.providerRow, { opacity: pressed ? 0.75 : 1 }]}
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

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Services & Pricing</ThemedText>
        {!clinic.services || clinic.services.length === 0 ? (
          <ThemedText variant="body" color="textMuted">No services listed for this clinic.</ThemedText>
        ) : (
          <View style={{ gap: spacing.md }}>
            {clinic.services.map((service, idx) => (
              <View key={service.id}>
                {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <View style={styles.serviceRow}>
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

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Partner organizations</ThemedText>
        <View style={{ gap: spacing.md }}>
          {clinic.linkedOrganizations.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <Pressable
                onPress={() => navigation.navigate('Main', { screen: 'OrganizationDetailsScreen', params: { organizationId: item.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.75 : 1 }]}
              >
                <ThemedText variant="bodyBold" color="text">{item.name}</ThemedText>
                <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>{item.description}</ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Policy</ThemedText>
        <ThemedText variant="caption" color="textMuted">{clinic.privacyPolicyUrl}</ThemedText>
        <ThemedText variant="caption" color="textMuted">{clinic.termsAndConditionsUrl}</ThemedText>
      </View>

      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <ThemedText variant="h2">Join {clinic.name}</ThemedText>
              <ConsentToggle label="I accept the clinic privacy policy" value={consent.acceptedPrivacyPolicy} onPress={() => setConsent((prev) => ({ ...prev, acceptedPrivacyPolicy: !prev.acceptedPrivacyPolicy }))} />
              <ConsentToggle label="I accept the terms and conditions" value={consent.acceptedTermsAndConditions} onPress={() => setConsent((prev) => ({ ...prev, acceptedTermsAndConditions: !prev.acceptedTermsAndConditions }))} />
              <ConsentToggle label="I agree to share my required information" value={consent.acceptedDataSharing} onPress={() => setConsent((prev) => ({ ...prev, acceptedDataSharing: !prev.acceptedDataSharing }))} />
            </ScrollView>
            <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
              <Pressable onPress={() => setShowJoinModal(false)} style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: radii.md }]} accessibilityRole="button">
                <ThemedText variant="smallBold" color="text">Cancel</ThemedText>
              </Pressable>
              <Pressable disabled={!canJoin || isJoining} onPress={handleJoin} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: !canJoin || isJoining || pressed ? 0.7 : 1 }]} accessibilityRole="button">
                <ThemedText variant="smallBold" color="onPrimary">{isJoining ? 'Joining...' : 'Confirm join'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 16 },
  loadingContainer: { padding: 16, gap: 16 },
  coverHeader: { marginHorizontal: -16 },
  titleBlock: { gap: 6, paddingTop: 4 },
  section: { borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  requiredWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  requiredChip: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 6 },
  linkRow: { gap: 4, paddingVertical: 10 },
  divider: { height: StyleSheet.hairlineWidth },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  providerAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  providerInfo: { flex: 1, gap: 2 },
  primaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderWidth: StyleSheet.hairlineWidth },
  modalContent: { padding: 16, gap: 10 },
  modalActions: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', gap: 10 },
  consentRow: { borderWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  consentLabel: { flex: 1 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
  serviceInfo: { flex: 1, gap: 2 },
});
