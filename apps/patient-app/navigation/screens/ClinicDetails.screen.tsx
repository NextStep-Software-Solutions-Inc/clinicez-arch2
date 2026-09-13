import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, RefreshControl } from 'react-native';
import { useNavigation, useRoute, useTheme } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityCoverHeader from '@ui/EntityCoverHeader';
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

function ConsentToggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [
        styles.consentRow,
        {
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.card : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <ThemedView style={[styles.checkbox, { borderColor: value ? colors.primary : colors.border, backgroundColor: value ? colors.primary : 'transparent' }]}>
        <ThemedText style={styles.checkboxMark}>{value ? '✓' : ''}</ThemedText>
      </ThemedView>
      <ThemedText style={styles.consentLabel}>{label}</ThemedText>
    </Pressable>
  );
}

export default function ClinicDetailsScreen() {
  const { colors } = useTheme();
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
          Alert.alert('Error', 'Unable to load clinic details.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
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
        Alert.alert('Join failed', error.message);
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
    Alert.alert('Request Submitted', `Your request to join ${clinic.name} has been submitted for approval.`);
  };

  const handleCancelRequest = async () => {
    if (!clinic) return;
    setIsCancelling(true);
    const [, error] = await safeAwait(cancelClinicMembershipOnline(patientId, clinic.id, getToken));
    if (error) {
      if (error.message === 'OFFLINE_ERROR') {
        showOfflineAlert();
      } else {
        Alert.alert('Cancel failed', error.message);
      }
      setIsCancelling(false);
      return;
    }

    // Refresh details after cancellation
    const [refreshed] = await safeAwait(getClinicDetail(patientId, clinic.id));
    if (refreshed) {
      setClinic(refreshed);
    } else {
      navigation.goBack();
    }
    setIsCancelling(false);
    Alert.alert('Request Cancelled', `Your request to join ${clinic.name} has been cancelled.`);
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
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <EntityCoverHeader
        name={clinic.name}
        logoUrl={clinic.logoUrl}
        coverImageUrl={clinic.coverImageUrl}
        badgeLabel={clinic.isJoined ? 'Joined' : clinic.membershipStatus === 'pending' ? 'Pending Approval' : clinic.isPublic ? 'Public' : 'Private'}
        badgeColor={clinic.isJoined ? '#10B981' : clinic.membershipStatus === 'pending' ? '#F59E0B' : clinic.isPublic ? '#3B82F6' : '#6B7280'}
        style={styles.coverHeader}
      />
      <ThemedView style={styles.titleBlock}>
        <ThemedText style={styles.title}>{clinic.name}</ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.text }]}>{clinic.description}</ThemedText>
        <ThemedText style={[styles.meta, { color: colors.text }]}>{clinic.isPublic ? 'Public clinic' : 'Private clinic'} · {clinic.supportsAppointments ? 'Supports bookings' : 'Booking not yet available'}</ThemedText>
        <ThemedText style={[styles.meta, { color: colors.text }]}>{clinic.address}</ThemedText>
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Access</ThemedText>
        <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>
          {clinic.isJoined
            ? 'You have joined this clinic.'
            : clinic.membershipStatus === 'pending'
            ? 'Your join request is pending approval.'
            : clinic.isPublic
            ? 'You can join directly from here.'
            : 'Join a partnered organization to unlock this clinic.'}
        </ThemedText>
        {!clinic.isJoined && clinic.membershipStatus !== 'pending' ? (
          <Pressable onPress={startJoin} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
            <ThemedText style={styles.primaryButtonText}>Join clinic</ThemedText>
          </Pressable>
        ) : clinic.membershipStatus === 'pending' ? (
          <View style={{ gap: 8 }}>
            <View style={[styles.primaryButton, { backgroundColor: '#F59E0B', opacity: 0.8, justifyContent: 'center', alignItems: 'center' }]}>
              <ThemedText style={styles.primaryButtonText}>Request pending approval</ThemedText>
            </View>
            <Pressable
              onPress={handleCancelRequest}
              disabled={isCancelling}
              style={({ pressed }) => [styles.secondaryButton, { borderColor: '#EF4444', opacity: pressed || isCancelling ? 0.7 : 1 }]}
              accessibilityRole="button"
            >
              <ThemedText style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>
                {isCancelling ? 'Cancelling...' : 'Cancel join request'}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
        {clinic.supportsAppointments ? (
          <Pressable onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen', params: { clinicId: clinic.id } })} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
            <ThemedText style={styles.secondaryButtonText}>Create booking draft</ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Required sharing</ThemedText>
        <ThemedView style={styles.requiredWrap}>
          {clinic.requiredShareFields.map((field) => (
            <ThemedView key={field} style={[styles.requiredChip, { borderColor: colors.border }]}>
              <ThemedText style={styles.requiredText}>{getShareFieldLabel(field)}</ThemedText>
            </ThemedView>
          ))}
        </ThemedView>
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Healthcare Providers</ThemedText>
        {clinic.healthcareProviders.length === 0 ? (
          <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>No providers listed for this clinic.</ThemedText>
        ) : (
          <ThemedView style={{ gap: 12 }}>
            {clinic.healthcareProviders.map((provider, idx) => (
              <ThemedView key={provider.id}>
                {idx > 0 && <ThemedView style={styles.divider} />}
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
                  <ThemedView style={[styles.providerAvatar, { backgroundColor: colors.primary }]}>
                    <ThemedText style={styles.providerInitials}>
                      {provider.name.split(' ').filter(w => w[0]?.match(/[A-Z]/)).slice(0, 2).map(w => w[0]).join('')}
                    </ThemedText>
                  </ThemedView>
                  <ThemedView style={styles.providerInfo}>
                    <ThemedText style={styles.providerName}>{provider.name}</ThemedText>
                    <ThemedText style={[styles.providerMeta, { color: colors.text }]}>
                      {provider.specialty} · {provider.credentials.join(', ')}
                    </ThemedText>
                  </ThemedView>
                  <ThemedText style={[styles.providerChevron, { color: colors.text }]}>›</ThemedText>
                </Pressable>
              </ThemedView>
            ))}
          </ThemedView>
        )}
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Services & Pricing</ThemedText>
        {!clinic.services || clinic.services.length === 0 ? (
          <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>No services listed for this clinic.</ThemedText>
        ) : (
          <ThemedView style={{ gap: 12 }}>
            {clinic.services.map((service, idx) => (
              <ThemedView key={service.id}>
                {idx > 0 && <ThemedView style={styles.divider} />}
                <ThemedView style={styles.serviceRow}>
                  <ThemedView style={styles.serviceInfo}>
                    <ThemedText style={styles.serviceName}>{service.name}</ThemedText>
                    {service.description ? (
                      <ThemedText style={[styles.serviceDescription, { color: colors.text }]} numberOfLines={2}>
                        {service.description}
                      </ThemedText>
                    ) : null}
                    <ThemedText style={[styles.serviceMeta, { color: colors.text }]}>
                      {service.durationMinutes ? `${service.durationMinutes} mins` : 'N/A duration'}
                    </ThemedText>
                  </ThemedView>
                  {service.price !== undefined && service.price !== null ? (
                    <ThemedText style={[styles.servicePrice, { color: colors.primary }]}>
                      PHP {service.price.toFixed(2)}
                    </ThemedText>
                  ) : (
                    <ThemedText style={[styles.servicePrice, { color: colors.text }]}>Free</ThemedText>
                  )}
                </ThemedView>
              </ThemedView>
            ))}
          </ThemedView>
        )}
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Partner organizations</ThemedText>
        <ThemedView style={{ gap: 12 }}>
          {clinic.linkedOrganizations.map((item, idx) => (
            <ThemedView key={item.id}>
              {idx > 0 && <ThemedView style={styles.divider} />}
              <Pressable
                onPress={() => navigation.navigate('Main', { screen: 'OrganizationDetailsScreen', params: { organizationId: item.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.75 : 1 }]}
              >
                <ThemedText style={styles.linkTitle}>{item.name}</ThemedText>
                <ThemedText style={[styles.linkSubtitle, { color: colors.text }]} numberOfLines={1}>{item.description}</ThemedText>
              </Pressable>
            </ThemedView>
          ))}
        </ThemedView>
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Policy</ThemedText>
        <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>{clinic.privacyPolicyUrl}</ThemedText>
        <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>{clinic.termsAndConditionsUrl}</ThemedText>
      </ThemedView>

      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <ThemedText style={styles.modalTitle}>Join {clinic.name}</ThemedText>
              <ConsentToggle label="I accept the clinic privacy policy" value={consent.acceptedPrivacyPolicy} onPress={() => setConsent((prev) => ({ ...prev, acceptedPrivacyPolicy: !prev.acceptedPrivacyPolicy }))} />
              <ConsentToggle label="I accept the terms and conditions" value={consent.acceptedTermsAndConditions} onPress={() => setConsent((prev) => ({ ...prev, acceptedTermsAndConditions: !prev.acceptedTermsAndConditions }))} />
              <ConsentToggle label="I agree to share my required information" value={consent.acceptedDataSharing} onPress={() => setConsent((prev) => ({ ...prev, acceptedDataSharing: !prev.acceptedDataSharing }))} />
            </ScrollView>
            <ThemedView style={styles.modalActions}>
              <Pressable onPress={() => setShowJoinModal(false)} style={styles.secondaryButton} accessibilityRole="button">
                <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
              </Pressable>
              <Pressable disabled={!canJoin || isJoining} onPress={handleJoin} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: !canJoin || isJoining || pressed ? 0.7 : 1 }]} accessibilityRole="button">
                <ThemedText style={styles.primaryButtonText}>{isJoining ? 'Joining...' : 'Confirm join'}</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 28, gap: 16 },
  loadingContainer: { padding: 16, gap: 16 },
  coverHeader: { marginHorizontal: -16 },
  titleBlock: { gap: 6, paddingTop: 4 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, opacity: 0.85 },
  meta: { fontSize: 12, opacity: 0.75 },
  section: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionCopy: { fontSize: 14, lineHeight: 20 },
  requiredWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  requiredChip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 6 },
  requiredText: { fontSize: 12, fontWeight: '700' },
  linkRow: { gap: 4, paddingVertical: 10 },
  linkTitle: { fontSize: 15, fontWeight: '700' },
  linkSubtitle: { fontSize: 13, opacity: 0.8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148, 163, 184, 0.3)' },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  providerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  providerInitials: { color: '#fff', fontWeight: '800', fontSize: 15 },
  providerInfo: { flex: 1, gap: 2 },
  providerName: { fontSize: 15, fontWeight: '700' },
  providerMeta: { fontSize: 12, opacity: 0.75 },
  providerChevron: { fontSize: 22, opacity: 0.4 },
  primaryButton: { borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  modalContent: { padding: 16, gap: 10 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalActions: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', gap: 10 },
  consentRow: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  checkboxMark: { color: '#fff', fontWeight: '800' },
  consentLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
  serviceInfo: { flex: 1, gap: 2 },
  serviceName: { fontSize: 15, fontWeight: '700' },
  serviceDescription: { fontSize: 12, opacity: 0.75, lineHeight: 16 },
  serviceMeta: { fontSize: 12, opacity: 0.65 },
  servicePrice: { fontSize: 16, fontWeight: '800' },
});
