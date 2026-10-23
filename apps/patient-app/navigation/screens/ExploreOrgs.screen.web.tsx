import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DimensionValue, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityMediaCardHeader from '@ui/EntityMediaCardHeader';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from '@shared/safe';
import { usePatientId } from 'hooks/usePatientId';
import {
    getShareFieldLabel,
    joinOrganization,
    listOrganizations,
    loadLocalOrganizations,
    refreshOrganizationsFromApi,
} from '../../services/discovery/discoveryService';
import { getOrganizationRoles, OrganizationRoleDto } from '../../services/api/discoveryApi';
import { ConsentSelection, OrganizationView } from '../../services/discovery/types';
import { dialog } from '@utils/dialog';

type OrganizationFilter = 'all' | 'public' | 'private' | 'joined';

const orgFilters: { key: OrganizationFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'public', label: 'Public' },
    { key: 'private', label: 'Private' },
    { key: 'joined', label: 'Joined' },
];

function ConsentToggle({
    label,
    value,
    onPress,
}: {
    label: string;
    value: boolean;
    onPress: () => void;
}) {
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
                    opacity: pressed ? 0.75 : 1,
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

export default function ExploreOrgsScreenWeb() {
    const { colors, spacing, radii, sizes, typography, shadows } = useAppTheme();
    const { isCompact, isWorkstation, isWide } = useBreakpoint();
    const navigation = useNavigation() as any;
    const patientId = usePatientId();
    const { getToken } = useClerkAuth();
    const { showOfflineAlert } = useOfflineAlert();

    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<OrganizationFilter>('all');
    const [organizations, setOrganizations] = useState<OrganizationView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const isRefreshingApiRef = useRef(false);
    const [selectedOrg, setSelectedOrg] = useState<OrganizationView | null>(null);
    const [selectedRoleId, setSelectedRoleId] = useState('');
    const [orgRoles, setOrgRoles] = useState<OrganizationRoleDto[]>([]);
    const [isLoadingRoles, setIsLoadingRoles] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [consent, setConsent] = useState<ConsentSelection>({
        acceptedPrivacyPolicy: false,
        acceptedTermsAndConditions: false,
        acceptedDataSharing: false,
    });

    const canSubmitJoin = useMemo(() => {
        if (!selectedOrg) return false;
        if (!selectedRoleId) return false;
        if (!selectedOrg.isPublic && !inviteCode.trim()) return false;
        return consent.acceptedDataSharing && consent.acceptedPrivacyPolicy && consent.acceptedTermsAndConditions;
    }, [selectedOrg, selectedRoleId, inviteCode, consent]);

    const loadLocal = async () => {
        const data = await loadLocalOrganizations(patientId, searchQuery, filter);
        setOrganizations(data);
        setIsLoading(false);
    };

    const triggerApiRefresh = async () => {
        if (isRefreshingApiRef.current) return;
        isRefreshingApiRef.current = true;
        try {
            const netState = await NetInfo.fetch();
            if (!netState.isConnected) return;
            await refreshOrganizationsFromApi(patientId, searchQuery, getToken);
            const fresh = await loadLocalOrganizations(patientId, searchQuery, filter);
            setOrganizations(fresh);
        } catch (err) {
            console.warn('[ExploreOrgsWeb] Background API refresh failed:', err);
        } finally {
            isRefreshingApiRef.current = false;
        }
    };

    useEffect(() => {
        loadLocal();
        triggerApiRefresh();
    }, [patientId, searchQuery, filter]);

    const openJoinModal = async (org: OrganizationView) => {
        setSelectedOrg(org);
        setSelectedRoleId('');
        setInviteCode('');
        setConsent({
            acceptedPrivacyPolicy: false,
            acceptedTermsAndConditions: false,
            acceptedDataSharing: false,
        });

        setIsLoadingRoles(true);
        const [roles, err] = await safeAwait(getOrganizationRoles(getToken, org.id));
        if (roles && roles.length > 0) {
            setOrgRoles(roles);
            setSelectedRoleId(roles[0].roleId);
        } else {
            console.warn('Failed to load roles dynamically, falling back to local cache', err);
            const fallbackRoles = org.roles.map(r => ({
                id: r.id,
                organizationId: org.id,
                roleId: r.id,
                name: r.name,
                description: r.description
            }));
            setOrgRoles(fallbackRoles);
            if (fallbackRoles.length > 0) {
                setSelectedRoleId(fallbackRoles[0].roleId);
            }
        }
        setIsLoadingRoles(false);
    };

    const closeJoinModal = () => {
        setSelectedOrg(null);
        setInviteCode('');
        setSelectedRoleId('');
    };

    const handleJoinOrganization = async () => {
        if (!selectedOrg) return;

        setIsJoining(true);
        const [, error] = await safeAwait(joinOrganization(patientId, {
            organizationId: selectedOrg.id,
            roleId: selectedRoleId,
            inviteCode,
            consent,
        }, getToken));

        if (error) {
            if (error.message === 'OFFLINE_ERROR') {
                closeJoinModal();
                showOfflineAlert();
            } else {
                dialog.alert('Join failed', error.message);
            }
            setIsJoining(false);
            return;
        }

        const [refreshed] = await safeAwait(listOrganizations(patientId, searchQuery, filter, getToken));
        if (refreshed) {
            setOrganizations(refreshed);
        }
        closeJoinModal();
        setIsJoining(false);
        dialog.alert('Joined', `You are now part of ${selectedOrg.name}.`);
    };

    // Responsive column calculation (1 col compact, 2 col >= 768, 3 col >= 1280)
    const cardWidthStyle: ViewStyle = isWide
        ? { width: '31.8%' as DimensionValue, maxWidth: '33.33%' as DimensionValue }
        : isWorkstation
            ? { width: '48.6%' as DimensionValue, maxWidth: '50%' as DimensionValue }
            : { width: '100%', maxWidth: '100%' };

    return (
        <ScrollView
            style={[styles.screen, { backgroundColor: colors.background }]}
            contentContainerStyle={[
                styles.contentContainer,
                { padding: isCompact ? spacing.md : spacing.xl, paddingBottom: spacing['4xl'] },
            ]}
        >
            {/* Top Toolbar: Search + Filter Chips */}
            <View style={[styles.toolbar, { gap: spacing.md, marginBottom: spacing.xl }]}>
                <View style={[styles.searchRow, { gap: spacing.md }]}>
                    <View
                        style={[
                            styles.searchBox,
                            {
                                backgroundColor: colors.card,
                                borderColor: colors.border,
                                borderRadius: radii.md,
                                borderWidth: sizes.borderWidth,
                                paddingHorizontal: spacing.md,
                                minHeight: sizes.controlLg,
                            },
                        ]}
                    >
                        <AppIcon name="search" size={sizes.iconMd} color="textMuted" />
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Search organizations..."
                            placeholderTextColor={colors.textMuted}
                            style={[
                                typography.body,
                                styles.searchInput,
                                {
                                    color: colors.text,
                                    marginLeft: spacing.sm,
                                },
                            ]}
                        />
                        {searchQuery ? (
                            <Pressable
                                onPress={() => setSearchQuery('')}
                                accessibilityRole="button"
                                accessibilityLabel="Clear search"
                                style={({ hovered }: any) => [
                                    styles.iconButton,
                                    { borderRadius: radii.full, opacity: hovered ? 1 : 0.7 },
                                ]}
                            >
                                <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
                            </Pressable>
                        ) : null}
                    </View>
                </View>

                {/* Filter Chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterScroll}
                    contentContainerStyle={[styles.filterRow, { gap: spacing.sm }]}
                >
                    {orgFilters.map((item) => {
                        const active = item.key === filter;
                        return (
                            <Pressable
                                key={item.key}
                                onPress={() => setFilter(item.key)}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: active }}
                                style={({ pressed, hovered }: any) => [
                                    styles.filterChip,
                                    {
                                        borderColor: active ? colors.primary : hovered ? colors.borderDark : colors.border,
                                        backgroundColor: active ? colors.primary : hovered ? colors.surfaceSubtle : colors.card,
                                        borderRadius: radii.full,
                                        paddingHorizontal: spacing.lg,
                                        paddingVertical: spacing.sm,
                                        borderWidth: sizes.borderWidth,
                                        opacity: pressed ? 0.8 : 1,
                                    },
                                ]}
                            >
                                <ThemedText
                                    variant="smallBold"
                                    numberOfLines={1}
                                    color={active ? 'onPrimary' : 'text'}
                                >
                                    {item.label}
                                </ThemedText>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Content: Cards Grid or Empty/Loading State */}
            {isLoading ? (
                <View style={[styles.grid, { gap: spacing.lg }]}>
                    <View style={cardWidthStyle}><SkeletonCard /></View>
                    <View style={cardWidthStyle}><SkeletonCard /></View>
                    <View style={cardWidthStyle}><SkeletonCard /></View>
                </View>
            ) : organizations.length === 0 ? (
                <EmptyState
                    icon="users"
                    title="No organizations found"
                    message="Try another search term or filter option."
                    actionLabel="Reset filters"
                    onActionPress={() => {
                        setSearchQuery('');
                        setFilter('all');
                    }}
                />
            ) : (
                <View style={[styles.grid, { gap: spacing.lg }]}>
                    {organizations.map((item) => (
                        <View
                            key={item.id}
                            style={[
                                styles.card,
                                cardWidthStyle,
                                {
                                    borderColor: colors.border,
                                    backgroundColor: colors.card,
                                    borderRadius: radii.lg,
                                    borderWidth: sizes.borderWidth,
                                },
                                shadows.sm,
                            ]}
                        >
                            <EntityMediaCardHeader
                                name={item.name}
                                logoUrl={item.logoUrl}
                                coverImageUrl={item.coverImageUrl}
                                badgeLabel={item.isJoined ? 'Joined' : item.membershipStatus === 'pending' ? 'Pending Approval' : item.isPublic ? 'Public' : 'Private'}
                                badgeColor={item.isJoined ? colors.success : item.membershipStatus === 'pending' ? colors.warning : item.isPublic ? colors.primary : colors.textMuted}
                            />
                            <View style={[styles.cardBody, { padding: spacing.lg, gap: spacing.sm }]}>
                                <ThemedText variant="title" numberOfLines={1}>{item.name}</ThemedText>
                                <ThemedText variant="body" color="textSecondary" numberOfLines={2}>
                                    {item.description || 'No description provided.'}
                                </ThemedText>
                                <View style={[styles.metaRow, { justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs }]}>
                                    <ThemedText variant="caption" color="textMuted">
                                        Clinics: {item.partneredClinicIds.length}
                                    </ThemedText>
                                    <View style={[styles.memberMetaRow, { gap: spacing.xs }]}>
                                        <AppIcon name="users" size={sizes.iconSm} color="primary" />
                                        <ThemedText variant="captionBold" color="primary">
                                            {item.activeMemberCount.toLocaleString()} members
                                        </ThemedText>
                                    </View>
                                </View>

                                {/* Card Actions */}
                                <View style={[styles.cardActionsRow, { gap: spacing.sm, marginTop: spacing.md }]}>
                                    <Pressable
                                        onPress={() =>
                                            navigation.navigate('Main', {
                                                screen: 'OrganizationDetailsScreen',
                                                params: { organizationId: item.id },
                                            })
                                        }
                                        accessibilityRole="button"
                                        accessibilityLabel={`View details for ${item.name}`}
                                        style={({ pressed, hovered }: any) => [
                                            styles.secondaryAction,
                                            {
                                                borderColor: hovered ? colors.borderDark : colors.border,
                                                backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                                                borderRadius: radii.md,
                                                borderWidth: sizes.borderWidth,
                                                minHeight: sizes.controlMd,
                                                paddingHorizontal: spacing.md,
                                                opacity: pressed ? 0.75 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText variant="smallBold" color="text">Details</ThemedText>
                                    </Pressable>

                                    <Pressable
                                        onPress={() =>
                                            navigation.navigate('Main', {
                                                screen: 'ExploreClinicsScreen',
                                                params: { organizationId: item.id, organizationName: item.name },
                                            })
                                        }
                                        accessibilityRole="button"
                                        accessibilityLabel={`View clinics in ${item.name}`}
                                        style={({ pressed, hovered }: any) => [
                                            styles.secondaryAction,
                                            {
                                                borderColor: hovered ? colors.borderDark : colors.border,
                                                backgroundColor: hovered ? colors.surfaceSubtle : colors.transparent,
                                                borderRadius: radii.md,
                                                borderWidth: sizes.borderWidth,
                                                minHeight: sizes.controlMd,
                                                paddingHorizontal: spacing.md,
                                                opacity: pressed ? 0.75 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText variant="smallBold" color="text">Clinics</ThemedText>
                                    </Pressable>

                                    {!item.isJoined && item.membershipStatus !== 'pending' && (
                                        <Pressable
                                            onPress={() => openJoinModal(item)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Join ${item.name}`}
                                            style={({ pressed, hovered }: any) => [
                                                styles.primaryAction,
                                                {
                                                    backgroundColor: hovered ? colors.primaryHover : colors.primary,
                                                    borderRadius: radii.md,
                                                    minHeight: sizes.controlMd,
                                                    paddingHorizontal: spacing.md,
                                                    opacity: pressed ? 0.75 : 1,
                                                },
                                            ]}
                                        >
                                            <ThemedText variant="smallBold" color="onPrimary">Join</ThemedText>
                                        </Pressable>
                                    )}

                                    {item.membershipStatus === 'pending' && (
                                        <View
                                            style={[
                                                styles.primaryAction,
                                                {
                                                    backgroundColor: colors.warning,
                                                    borderRadius: radii.md,
                                                    minHeight: sizes.controlMd,
                                                    paddingHorizontal: spacing.md,
                                                    opacity: 0.85,
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                },
                                            ]}
                                        >
                                            <ThemedText variant="smallBold" color="onPrimary">Requested</ThemedText>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Join Modal for Web */}
            <Modal visible={!!selectedOrg} animationType="fade" transparent onRequestClose={closeJoinModal}>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View
                        style={[
                            styles.modalContainer,
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
                            <ThemedText variant="h2">{selectedOrg?.name ? `Join ${selectedOrg.name}` : 'Join Organization'}</ThemedText>
                            <ThemedText variant="body" color="textSecondary">
                                Select a role and provide required consent to continue.
                            </ThemedText>

                            {isLoadingRoles ? (
                                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
                            ) : (
                                orgRoles.map((role) => {
                                    const selected = role.roleId === selectedRoleId;
                                    return (
                                        <Pressable
                                            key={role.id}
                                            onPress={() => setSelectedRoleId(role.roleId)}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected }}
                                            style={({ pressed, hovered }: any) => [
                                                styles.roleCard,
                                                {
                                                    borderColor: selected ? colors.primary : hovered ? colors.borderDark : colors.border,
                                                    backgroundColor: selected ? colors.surfaceSubtle : hovered ? colors.surfaceSubtle : colors.transparent,
                                                    borderRadius: radii.md,
                                                    borderWidth: sizes.borderWidth,
                                                    padding: spacing.md,
                                                    opacity: pressed ? 0.75 : 1,
                                                },
                                            ]}
                                        >
                                            <ThemedText variant="smallBold" color={selected ? 'primary' : 'text'}>{role.name}</ThemedText>
                                            <ThemedText variant="caption" color="textSecondary">{role.description}</ThemedText>
                                        </Pressable>
                                    );
                                })
                            )}

                            {!selectedOrg?.isPublic && (
                                <View style={{ gap: spacing.xs }}>
                                    <ThemedText variant="smallBold" color="text">Invite code</ThemedText>
                                    <View
                                        style={[
                                            styles.searchBox,
                                            {
                                                borderColor: colors.border,
                                                backgroundColor: colors.card,
                                                borderRadius: radii.md,
                                                borderWidth: sizes.borderWidth,
                                                paddingHorizontal: spacing.md,
                                                minHeight: sizes.controlMd,
                                            },
                                        ]}
                                    >
                                        <TextInput
                                            value={inviteCode}
                                            onChangeText={setInviteCode}
                                            placeholder="Enter invitation code"
                                            placeholderTextColor={colors.textMuted}
                                            autoCapitalize="characters"
                                            style={[typography.body, styles.searchInput, { color: colors.text }]}
                                        />
                                    </View>
                                </View>
                            )}

                            <ThemedText variant="smallBold" color="text">Required data fields</ThemedText>
                            <View style={[styles.requiredFieldsWrap, { gap: spacing.xs }]}>
                                {selectedOrg?.requiredShareFields.map((field) => (
                                    <View
                                        key={field}
                                        style={[
                                            styles.requiredFieldChip,
                                            {
                                                borderColor: colors.border,
                                                backgroundColor: colors.surfaceSubtle,
                                                borderRadius: radii.full,
                                                borderWidth: sizes.borderWidth,
                                                paddingHorizontal: spacing.md,
                                                paddingVertical: spacing.xs,
                                            },
                                        ]}
                                    >
                                        <ThemedText variant="captionBold" color="textSecondary">
                                            {getShareFieldLabel(field)}
                                        </ThemedText>
                                    </View>
                                ))}
                            </View>

                            <ThemedText variant="smallBold" color="text">Consent</ThemedText>
                            <ConsentToggle
                                label="I accept the organization privacy policy"
                                value={consent.acceptedPrivacyPolicy}
                                onPress={() => setConsent((prev) => ({ ...prev, acceptedPrivacyPolicy: !prev.acceptedPrivacyPolicy }))}
                            />
                            <ConsentToggle
                                label="I accept the terms and conditions"
                                value={consent.acceptedTermsAndConditions}
                                onPress={() =>
                                    setConsent((prev) => ({ ...prev, acceptedTermsAndConditions: !prev.acceptedTermsAndConditions }))
                                }
                            />
                            <ConsentToggle
                                label="I agree to data sharing with this organization"
                                value={consent.acceptedDataSharing}
                                onPress={() => setConsent((prev) => ({ ...prev, acceptedDataSharing: !prev.acceptedDataSharing }))}
                            />

                            <ThemedText variant="caption" color="textMuted">Privacy: {selectedOrg?.privacyPolicyUrl}</ThemedText>
                            <ThemedText variant="caption" color="textMuted">Terms: {selectedOrg?.termsAndConditionsUrl}</ThemedText>
                        </ScrollView>

                        <View style={[styles.modalActions, { borderTopColor: colors.border, borderTopWidth: sizes.borderWidth, marginTop: spacing.lg, paddingTop: spacing.md, gap: spacing.md }]}>
                            <Pressable
                                onPress={closeJoinModal}
                                accessibilityRole="button"
                                style={({ pressed, hovered }: any) => [
                                    styles.secondaryAction,
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
                                disabled={!canSubmitJoin || isJoining}
                                onPress={handleJoinOrganization}
                                accessibilityRole="button"
                                style={({ pressed, hovered }: any) => [
                                    styles.primaryAction,
                                    {
                                        backgroundColor: hovered ? colors.primaryHover : colors.primary,
                                        borderRadius: radii.md,
                                        minHeight: sizes.controlMd,
                                        paddingHorizontal: spacing.lg,
                                        opacity: !canSubmitJoin || isJoining ? 0.5 : pressed ? 0.75 : 1,
                                    },
                                ]}
                            >
                                <ThemedText variant="smallBold" color="onPrimary">{isJoining ? 'Joining...' : 'Confirm Join'}</ThemedText>
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
    contentContainer: {
        width: '100%',
    },
    toolbar: {
        width: '100%',
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    searchInput: {
        flex: 1,
    },
    iconButton: {
        padding: 4,
    },
    filterScroll: {
        flexGrow: 0,
    },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    filterChip: {
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: '100%',
    },
    card: {
        overflow: 'hidden',
    },
    cardBody: {
        flex: 1,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    memberMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardActionsRow: {
        flexDirection: 'row',
    },
    primaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        maxHeight: '85%',
    },
    roleCard: {
        gap: 4,
    },
    requiredFieldsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    requiredFieldChip: {},
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
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
});
