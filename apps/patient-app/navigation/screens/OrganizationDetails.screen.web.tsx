import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityCoverHeader from '@ui/EntityCoverHeader';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
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

export default function OrganizationDetailsScreenWeb() {
  const { colors, spacing, radii, sizes, typography, shadows } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const navigation = useNavigation() as any;
  const route = useRoute() as any;
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { showOfflineAlert } = useOfflineAlert();
  const organizationId = String(route.params?.organizationId ?? route.params?.id ?? '');

  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
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
      <View style={[styles.loadingContainer, { padding: spacing.xl, gap: spacing.lg }]}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (!organization) {
    return (
      <EmptyState
        title="Organization not found"
        message="This organization may no longer be available in your local catalog."
        actionLabel="Go back"
        onActionPress={() => navigation.goBack()}
      />
    );
  }

  // Sidebar Membership Card (desktop sticky, mobile inline)
  const MembershipSidebarCard = () => (
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
        <ThemedText variant="title">Membership & Access</ThemedText>
        <ThemedText variant="body" color="textSecondary">
          {organization.isJoined
            ? `Enrolled as ${organization.membershipRoleName ?? 'member'}.`
            : organization.membershipStatus === 'pending'
            ? `Your request to join as ${organization.membershipRoleName ?? 'member'} is pending approval.`
            : 'Join to unlock private clinics and member-only services.'}
        </ThemedText>
      </View>

      {/* Member count display */}
      <View
        style={[
          styles.memberHighlightBox,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.border,
            borderRadius: radii.md,
            borderWidth: sizes.borderWidth,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}
      >
        <AppIcon name="users" size={sizes.iconMd} color="primary" />
        <ThemedText variant="smallBold" color="primary">
          {organization.activeMemberCount.toLocaleString()} active members
        </ThemedText>
      </View>

      {/* Join or Cancel buttons */}
      {!organization.isJoined && organization.membershipStatus !== 'pending' ? (
        <Pressable
          onPress={startJoin}
          accessibilityRole="button"
          accessibilityLabel={`Join ${organization.name}`}
          style={({ pressed, hovered }: any) => [
            styles.primaryButton,
            {
              backgroundColor: hovered ? colors.primaryHover : colors.primary,
              borderRadius: radii.md,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText variant="smallBold" color="onPrimary">Join Organization</ThemedText>
        </Pressable>
      ) : organization.membershipStatus === 'pending' ? (
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

      {/* Browse partnered clinics button */}
      <Pressable
        onPress={() =>
          navigation.navigate('Main', {
            screen: 'ExploreClinicsScreen',
            params: { organizationId: organization.id, organizationName: organization.name },
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Browse partnered clinics"
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
        <AppIcon name="hospital" size={sizes.iconSm} color="text" />
        <ThemedText variant="smallBold" color="text" style={{ marginLeft: spacing.xs }}>
          View Partnered Clinics ({organization.linkedClinics.length})
        </ThemedText>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={{ gap: spacing.sm }}>
        <View style={[styles.metaItem, { gap: spacing.sm }]}>
          <AppIcon name="building" size={sizes.iconSm} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            {organization.isPublic ? 'Public Organization' : 'Private Organization'}
          </ThemedText>
        </View>
        <View style={[styles.metaItem, { gap: spacing.sm }]}>
          <AppIcon name="hospital" size={sizes.iconSm} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            {organization.partneredClinicIds.length} Partnered Clinics
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
      <EntityCoverHeader
        name={organization.name}
        logoUrl={organization.logoUrl}
        coverImageUrl={organization.coverImageUrl}
        badgeLabel={organization.isJoined ? 'Joined' : organization.membershipStatus === 'pending' ? 'Pending Approval' : organization.isPublic ? 'Public' : 'Private'}
        badgeColor={organization.isJoined ? colors.success : organization.membershipStatus === 'pending' ? colors.warning : organization.isPublic ? colors.primary : colors.textMuted}
      />

      {/* Body: Two columns on desktop >= 1024, single column below */}
      <View style={[styles.bodyContainer, isDesktop ? styles.desktopRow : styles.singleColumn, { gap: spacing.xl, paddingHorizontal: spacing.xl, marginTop: spacing.lg }]}>
        {/* Left Column: Details */}
        <View style={[styles.leftColumn, { gap: spacing.lg }]}>
          {/* Title & Description */}
          <View style={{ gap: spacing.xs }}>
            <ThemedText variant="h1">{organization.name}</ThemedText>
            <ThemedText variant="body" color="textSecondary">{organization.description}</ThemedText>
          </View>

          {/* If NOT desktop, show Membership Card inline here */}
          {!isDesktop ? <MembershipSidebarCard /> : null}

          {/* Required Sharing Section */}
          <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
            <ThemedText variant="title">Required Data Sharing</ThemedText>
            <ThemedText variant="body" color="textSecondary">Information shared when joining this organization:</ThemedText>
            <View style={[styles.requiredWrap, { gap: spacing.sm }]}>
              {organization.requiredShareFields.map((field) => (
                <View key={field} style={[styles.requiredChip, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle, borderRadius: radii.full, borderWidth: sizes.borderWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }]}>
                  <ThemedText variant="captionBold" color="textSecondary">{getShareFieldLabel(field)}</ThemedText>
                </View>
              ))}
            </View>
          </View>

          {/* Partnered Clinics Section */}
          <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
            <ThemedText variant="title">Partnered Clinics</ThemedText>
            {organization.linkedClinics.length === 0 ? (
              <ThemedText variant="body" color="textMuted">No partnered clinics listed.</ThemedText>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {organization.linkedClinics.map((item, idx) => (
                  <View key={item.id}>
                    {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    <Pressable
                      onPress={() => navigation.navigate('Main', { screen: 'ClinicDetailsScreen', params: { clinicId: item.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={`View clinic ${item.name}`}
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
            )}
          </View>

          {/* Policy Section */}
          <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: sizes.borderWidth, padding: spacing.lg, gap: spacing.md }]}>
            <ThemedText variant="title">Policies</ThemedText>
            {organization.privacyPolicyUrl ? (
              <ThemedText variant="caption" color="textMuted">Privacy Policy: {organization.privacyPolicyUrl}</ThemedText>
            ) : null}
            {organization.termsAndConditionsUrl ? (
              <ThemedText variant="caption" color="textMuted">Terms & Conditions: {organization.termsAndConditionsUrl}</ThemedText>
            ) : null}
          </View>
        </View>

        {/* Right Column: Sticky Membership Card (Desktop only) */}
        {isDesktop ? (
          <View style={styles.rightColumn}>
            <View style={styles.stickyWrapper}>
              <MembershipSidebarCard />
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
              <ThemedText variant="h2">Join {organization.name}</ThemedText>
              <ThemedText variant="body" color="textSecondary">Select a role and provide required consent to continue.</ThemedText>

              {organization.roles.map((role) => (
                <Pressable
                  key={role.id}
                  onPress={() => setSelectedRoleId(role.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedRoleId === role.id }}
                  style={({ pressed, hovered }: any) => [
                    styles.roleCard,
                    {
                      borderColor: selectedRoleId === role.id ? colors.primary : hovered ? colors.borderDark : colors.border,
                      backgroundColor: selectedRoleId === role.id ? colors.surfaceSubtle : hovered ? colors.surfaceSubtle : colors.transparent,
                      borderRadius: radii.md,
                      borderWidth: sizes.borderWidth,
                      padding: spacing.md,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
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
                    style={[
                      typography.body,
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.card,
                        borderRadius: radii.md,
                        borderWidth: sizes.borderWidth,
                        paddingHorizontal: spacing.md,
                        minHeight: sizes.controlMd,
                      },
                    ]}
                  />
                </View>
              ) : null}

              <ConsentToggle label="I accept the privacy policy" value={consent.acceptedPrivacyPolicy} onPress={() => setConsent((prev) => ({ ...prev, acceptedPrivacyPolicy: !prev.acceptedPrivacyPolicy }))} />
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
  memberHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  linkRow: {
    gap: 4,
  },
  roleCard: {
    gap: 4,
  },
  input: {},
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
});
