import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, RefreshControl } from 'react-native';
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
  getOrganizationDetail,
  getShareFieldLabel,
  joinOrganization,
  cancelOrganizationMembershipOnline,
  refreshOrganizationsFromApi,
} from '../../services/discovery/discoveryService';
import { ConsentSelection, OrganizationDetail } from '../../services/discovery/types';
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

export default function OrganizationDetailsScreen() {
  const { colors, spacing, radii, sizes, typography } = useAppTheme();
  const insets = useContentInsets();
  const navigation = useNavigation() as any;
  const route = useRoute() as any;
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const organizationId = String(route.params?.organizationId ?? '');

  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [consent, setConsent] = useState<ConsentSelection>({
    acceptedPrivacyPolicy: false,
    acceptedTermsAndConditions: false,
    acceptedDataSharing: false,
  });

  const canJoin = useMemo(() => {
    return Boolean(selectedRoleId) && consent.acceptedPrivacyPolicy && consent.acceptedTermsAndConditions && consent.acceptedDataSharing && (organization?.isPublic || inviteCode.trim());
  }, [selectedRoleId, consent, inviteCode, organization]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    getOrganizationDetail(patientId, organizationId)
      .then((detail) => mounted && setOrganization(detail))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load organization details.';
        dialog.alert('Error', message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      })
      .finally(() => mounted && setIsLoading(false));

    return () => {
      mounted = false;
    };
  }, [organizationId, patientId, navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    const state = await NetInfo.fetch();
    if (state.isConnected) {
      try {
        await refreshOrganizationsFromApi(patientId, '', getToken);
        const refreshed = await getOrganizationDetail(patientId, organizationId);
        if (refreshed) setOrganization(refreshed);
      } catch (error) {
        console.log('Online refresh failed:', error);
      }
    } else {
      showOfflineAlert();
    }
    setRefreshing(false);
  };

  const startJoin = () => {
    if (!organization) return;
    setSelectedRoleId(organization.roles[0]?.id ?? 'member');
    setInviteCode('');
    setConsent({ acceptedPrivacyPolicy: false, acceptedTermsAndConditions: false, acceptedDataSharing: false });
    setShowJoinModal(true);
  };

  const handleJoin = async () => {
    if (!organization) return;
    setIsJoining(true);
    const [, error] = await safeAwait(joinOrganization(patientId, {
      organizationId: organization.id,
      roleId: selectedRoleId,
      inviteCode,
      consent,
    }, getToken));

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

    const [refreshed] = await safeAwait(getOrganizationDetail(patientId, organization.id));
    if (refreshed) {
      setOrganization(refreshed);
    }
    setShowJoinModal(false);
    setIsJoining(false);
    dialog.alert('Request Submitted', `Your request to join ${organization.name} has been submitted for approval.`);
  };

  const handleCancelRequest = async () => {
    if (!organization) return;
    setIsCancelling(true);
    const [, error] = await safeAwait(cancelOrganizationMembershipOnline(patientId, organization.id, getToken));
    if (error) {
      if (error.message === 'OFFLINE_ERROR') {
        showOfflineAlert();
      } else {
        dialog.alert('Cancel failed', error.message);
      }
      setIsCancelling(false);
      return;
    }

    // Refresh details after cancellation
    const [refreshed] = await safeAwait(getOrganizationDetail(patientId, organization.id));
    if (refreshed) {
      setOrganization(refreshed);
    } else {
      navigation.goBack();
    }
    setIsCancelling(false);
    dialog.alert('Request Cancelled', `Your request to join ${organization.name} has been cancelled.`);
  };

  if (isLoading) {
    return (
      <ScrollView contentContainerStyle={styles.loadingContainer}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (!organization) {
    return <EmptyState title="Organization not found" message="This organization may no longer be available in your local catalog." actionLabel="Go back" onActionPress={() => navigation.goBack()} />;
  }

  return (
    <ScrollView 
      contentInsetAdjustmentBehavior="automatic" 
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <EntityCoverHeader
        name={organization.name}
        logoUrl={organization.logoUrl}
        coverImageUrl={organization.coverImageUrl}
        badgeLabel={organization.isJoined ? 'Joined' : organization.membershipStatus === 'pending' ? 'Pending Approval' : organization.isPublic ? 'Public' : 'Private'}
        badgeColor={organization.isJoined ? colors.success : organization.membershipStatus === 'pending' ? colors.warning : organization.isPublic ? colors.primary : colors.textMuted}
        style={styles.coverHeader}
      />
      <View style={styles.titleBlock}>
        <ThemedText variant="h1">{organization.name}</ThemedText>
        <ThemedText variant="body" color="textSecondary">{organization.description}</ThemedText>
        <View style={styles.metaRow}>
          <ThemedText variant="caption" color="textMuted">
            {organization.isPublic ? 'Public organization' : 'Private organization'} · {organization.partneredClinicIds.length} partnered clinics
          </ThemedText>
          <View style={styles.memberMetaRow}>
            <AppIcon name="users" size={sizes.iconSm} color="primary" />
            <ThemedText variant="captionBold" color="primary">
              {organization.activeMemberCount.toLocaleString()} active members
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Membership</ThemedText>
        <View style={styles.memberMetaRow}>
          <AppIcon name="users" size={sizes.iconSm} color="primary" />
          <ThemedText variant="smallBold" color="primary">
            {organization.activeMemberCount.toLocaleString()} active members
          </ThemedText>
        </View>
        <ThemedText variant="body" color="textSecondary">
          {organization.isJoined
            ? `Joined as ${organization.membershipRoleName ?? 'member'}`
            : organization.membershipStatus === 'pending'
            ? `Request to join as ${organization.membershipRoleName ?? 'member'} is pending approval.`
            : 'Join to unlock private clinics and member-only content.'}
        </ThemedText>
        {!organization.isJoined && organization.membershipStatus !== 'pending' ? (
          <Pressable onPress={startJoin} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, borderRadius: radii.md, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button">
            <ThemedText variant="smallBold" color="onPrimary">Join organization</ThemedText>
          </Pressable>
        ) : organization.membershipStatus === 'pending' ? (
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
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Required sharing</ThemedText>
        <View style={styles.requiredWrap}>
          {organization.requiredShareFields.map((field) => (
            <View key={field} style={[styles.requiredChip, { borderColor: colors.border, borderRadius: radii.full }]}>
              <ThemedText variant="captionBold" color="textSecondary">{getShareFieldLabel(field)}</ThemedText>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl }]}>
        <ThemedText variant="title">Partnered clinics</ThemedText>
        <View style={{ gap: spacing.md }}>
          {organization.linkedClinics.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <Pressable
                onPress={() => navigation.navigate('Main', { screen: 'ClinicDetailsScreen', params: { clinicId: item.id } })}
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
        <ThemedText variant="caption" color="textMuted">{organization.privacyPolicyUrl}</ThemedText>
        <ThemedText variant="caption" color="textMuted">{organization.termsAndConditionsUrl}</ThemedText>
      </View>

      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <ThemedText variant="h2">Join {organization.name}</ThemedText>
              {organization.roles.map((role) => (
                <Pressable
                  key={role.id}
                  onPress={() => setSelectedRoleId(role.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedRoleId === role.id }}
                  style={({ pressed }) => [styles.roleCard, { borderColor: selectedRoleId === role.id ? colors.primary : colors.border, borderRadius: radii.md, opacity: pressed ? 0.8 : 1 }]}
                >
                  <ThemedText variant="smallBold" color={selectedRoleId === role.id ? 'primary' : 'text'}>{role.name}</ThemedText>
                  <ThemedText variant="caption" color="textSecondary">{role.description}</ThemedText>
                </Pressable>
              ))}

              {!organization.isPublic ? (
                <View style={{ gap: spacing.xs }}>
                  <ThemedText variant="smallBold" color="text">Invite code</ThemedText>
                  <TextInput
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    placeholder="Enter invite code"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    style={[typography.body, styles.input, { borderColor: colors.border, color: colors.text, borderRadius: radii.md }]}
                  />
                </View>
              ) : null}

              <ConsentToggle label="I accept the privacy policy" value={consent.acceptedPrivacyPolicy} onPress={() => setConsent((prev) => ({ ...prev, acceptedPrivacyPolicy: !prev.acceptedPrivacyPolicy }))} />
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
  metaRow: { gap: 4 },
  memberMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  section: { borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  requiredWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  requiredChip: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 6 },
  linkRow: { gap: 4, paddingVertical: 10 },
  divider: { height: StyleSheet.hairlineWidth },
  primaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderWidth: StyleSheet.hairlineWidth },
  modalContent: { padding: 16, gap: 10 },
  roleCard: { borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4 },
  input: { borderWidth: StyleSheet.hairlineWidth, minHeight: 46, paddingHorizontal: 12 },
  modalActions: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', gap: 10 },
  consentRow: { borderWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  consentLabel: { flex: 1 },
});
