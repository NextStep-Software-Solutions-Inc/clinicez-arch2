import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useNavigation, useRoute, useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityCoverHeader from '@ui/EntityCoverHeader';
import { usePatientId } from 'hooks/usePatientId';
import {
  getClinicDetail,
  getShareFieldLabel,
  joinClinic,
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
  const clinicId = String(route.params?.clinicId ?? '');

  const [clinic, setClinic] = useState<ClinicDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [consent, setConsent] = useState<ConsentSelection>({
    acceptedPrivacyPolicy: false,
    acceptedTermsAndConditions: false,
    acceptedDataSharing: false,
  });

  const canJoin = useMemo(() => consent.acceptedPrivacyPolicy && consent.acceptedTermsAndConditions && consent.acceptedDataSharing, [consent]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    getClinicDetail(patientId, clinicId)
      .then((detail) => mounted && setClinic(detail))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load clinic details.';
        Alert.alert('Error', message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      })
      .finally(() => mounted && setIsLoading(false));

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
    try {
      await joinClinic(patientId, { clinicId: clinic.id, consent });
      setShowJoinModal(false);
      const refreshed = await getClinicDetail(patientId, clinic.id);
      setClinic(refreshed);
      Alert.alert('Joined', `${clinic.name} has been added to your clinics.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to join clinic.';
      Alert.alert('Join failed', message);
    } finally {
      setIsJoining(false);
    }
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
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <EntityCoverHeader
        name={clinic.name}
        logoUrl={clinic.logoUrl}
        coverImageUrl={clinic.coverImageUrl}
        badgeLabel={clinic.isJoined ? 'Joined' : clinic.isPublic ? 'Public' : 'Private'}
        badgeColor={clinic.isJoined ? '#10B981' : clinic.isPublic ? '#3B82F6' : '#F59E0B'}
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
        <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>{clinic.isJoined ? 'You have joined this clinic.' : clinic.isPublic ? 'You can join directly from here.' : 'Join a partnered organization to unlock this clinic.'}</ThemedText>
        {!clinic.isJoined ? (
          <Pressable onPress={startJoin} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
            <ThemedText style={styles.primaryButtonText}>Join clinic</ThemedText>
          </Pressable>
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
        <ThemedText style={styles.sectionTitle}>Partner organizations</ThemedText>
        <FlatList
          data={clinic.linkedOrganizations}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <ThemedView style={styles.divider} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('Main', { screen: 'OrganizationDetailsScreen', params: { organizationId: item.id } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.75 : 1 }]}
            >
              <ThemedText style={styles.linkTitle}>{item.name}</ThemedText>
              <ThemedText style={[styles.linkSubtitle, { color: colors.text }]} numberOfLines={1}>{item.description}</ThemedText>
            </Pressable>
          )}
        />
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
});
