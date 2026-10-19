import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityMediaCardHeader from '@ui/EntityMediaCardHeader';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useContentInsets } from '../../hooks/useContentInsets';
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
            style={({ pressed }) => [
                styles.consentRow,
                {
                    borderColor: value ? colors.primary : colors.border,
                    backgroundColor: value ? colors.card : colors.transparent,
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

export default function ExploreOrgsScreen() {
    const { colors, spacing, radii, sizes, typography } = useAppTheme();
    const insets = useContentInsets();
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

    // ── Load local data immediately, then background-refresh from API ─────────

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
            console.warn('[ExploreOrgs] Background API refresh failed:', err);
        } finally {
            isRefreshingApiRef.current = false;
        }
    };

    useEffect(() => {
        loadLocal();
        triggerApiRefresh();
    }, [patientId, searchQuery, filter]);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const data = await listOrganizations(patientId, searchQuery, filter, getToken);
            setOrganizations(data);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to refresh organizations.';
            dialog.alert('Error', message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        navigation.setOptions({
            headerLargeTitleEnabled: !isSearching,
            headerTitle: isSearching ? () => (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', width: '100%', paddingRight: spacing.sm }}>
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search organizations..."
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                        style={[
                            typography.body,
                            {
                                flex: 1,
                                color: colors.text,
                                paddingVertical: Platform.select({ ios: spacing.xs + 2, android: spacing.xs }),
                                paddingHorizontal: spacing.md,
                                backgroundColor: colors.card,
                                borderRadius: radii.md,
                                borderWidth: sizes.borderWidth,
                                borderColor: colors.border,
                                height: sizes.controlMd - 4,
                            },
                        ]}
                    />
                </View>
            ) : 'Explore Organizations',
            headerRight: () => (
                <Pressable
                    onPress={() => {
                        if (isSearching) {
                            setSearchQuery('');
                            setIsSearching(false);
                        } else {
                            setIsSearching(true);
                        }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={isSearching ? 'Close search' : 'Search organizations'}
                    style={{ marginRight: spacing.sm, padding: spacing.xs }}
                >
                    <AppIcon name={isSearching ? 'close' : 'search'} size={sizes.iconLg} color="text" />
                </Pressable>
            ),
        });
    }, [isSearching, searchQuery, colors, spacing, radii, sizes, typography, navigation]);

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

    return (
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
            <FlatList
                data={organizations}
                keyExtractor={(item) => item.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.lg }]}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                ListHeaderComponent={
                    <View style={styles.headerWrap}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                            {orgFilters.map((item) => {
                                const active = item.key === filter;
                                return (
                                    <Pressable
                                        key={item.key}
                                        onPress={() => setFilter(item.key)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        style={({ pressed }) => [
                                            styles.filterChip,
                                            {
                                                borderColor: active ? colors.primary : colors.border,
                                                backgroundColor: active ? colors.primary : colors.card,
                                                borderRadius: radii.full,
                                                opacity: pressed ? 0.75 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText variant="smallBold" color={active ? 'onPrimary' : 'text'}>{item.label}</ThemedText>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                }
                ListEmptyComponent={
                    isLoading ? (
                        <View style={styles.loadingStack}>
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </View>
                    ) : (
                        <EmptyState
                            title="No organizations found"
                            message="Try another search or filter option."
                            actionLabel="Reset filters"
                            onActionPress={() => {
                                setSearchQuery('');
                                setFilter('all');
                                setIsSearching(false);
                            }}
                        />
                    )
                }
                renderItem={({ item }) => (
                    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.lg }]}>
                        <EntityMediaCardHeader
                            name={item.name}
                            logoUrl={item.logoUrl}
                            coverImageUrl={item.coverImageUrl}
                            badgeLabel={item.isJoined ? 'Joined' : item.membershipStatus === 'pending' ? 'Pending Approval' : item.isPublic ? 'Public' : 'Private'}
                            badgeColor={item.isJoined ? colors.success : item.membershipStatus === 'pending' ? colors.warning : item.isPublic ? colors.primary : colors.textMuted}
                        />
                        <View style={styles.cardBody}>
                            <ThemedText variant="title">{item.name}</ThemedText>
                            <ThemedText variant="body" color="textSecondary">{item.description}</ThemedText>
                            <View style={styles.metaRow}>
                                <ThemedText variant="caption" color="textMuted">Partnered clinics: {item.partneredClinicIds.length}</ThemedText>
                                <View style={styles.memberMetaRow}>
                                    <AppIcon name="users" size={sizes.iconSm} color="primary" />
                                    <ThemedText variant="captionBold" color="primary">{item.activeMemberCount.toLocaleString()} members</ThemedText>
                                </View>
                            </View>

                            <View style={styles.cardActionsRow}>
                                <Pressable
                                    onPress={() =>
                                        navigation.navigate('Main', {
                                            screen: 'OrganizationDetailsScreen',
                                            params: { organizationId: item.id },
                                        })
                                    }
                                    style={({ pressed }) => [
                                        styles.secondaryAction,
                                        { borderColor: colors.border, borderRadius: radii.md, opacity: pressed ? 0.75 : 1 },
                                    ]}
                                    accessibilityRole="button"
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
                                    style={({ pressed }) => [
                                        styles.secondaryAction,
                                        { borderColor: colors.border, borderRadius: radii.md, opacity: pressed ? 0.75 : 1 },
                                    ]}
                                    accessibilityRole="button"
                                >
                                    <ThemedText variant="smallBold" color="text">View Clinics</ThemedText>
                                </Pressable>
                                {!item.isJoined && item.membershipStatus !== 'pending' && (
                                    <Pressable
                                        onPress={() => openJoinModal(item)}
                                        style={({ pressed }) => [
                                            styles.primaryAction,
                                            { backgroundColor: colors.primary, borderRadius: radii.md, opacity: pressed ? 0.75 : 1 },
                                        ]}
                                        accessibilityRole="button"
                                    >
                                        <ThemedText variant="smallBold" color="onPrimary">Join</ThemedText>
                                    </Pressable>
                                )}
                                {item.membershipStatus === 'pending' && (
                                    <View style={[styles.primaryAction, { backgroundColor: colors.warning, borderRadius: radii.md, opacity: 0.85, justifyContent: 'center', alignItems: 'center' }]}>
                                        <ThemedText variant="smallBold" color="onPrimary">Requested</ThemedText>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                )}
            />

            <Modal visible={!!selectedOrg} animationType="slide" transparent onRequestClose={closeJoinModal}>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContainer, { backgroundColor: colors.background, borderColor: colors.border, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
                        <ScrollView contentContainerStyle={styles.modalContent}>
                            <ThemedText variant="h2">{selectedOrg?.name ? `Join ${selectedOrg.name}` : 'Join Organization'}</ThemedText>
                            <ThemedText variant="body" color="textSecondary">Select a role and provide required consent to continue.</ThemedText>

                            {isLoadingRoles ? (
                                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
                            ) : orgRoles.map((role) => {
                                const selected = role.roleId === selectedRoleId;
                                return (
                                    <Pressable
                                        key={role.id}
                                        onPress={() => setSelectedRoleId(role.roleId)}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected }}
                                        style={({ pressed }) => [
                                            styles.roleCard,
                                            {
                                                borderColor: selected ? colors.primary : colors.border,
                                                backgroundColor: selected ? colors.card : colors.transparent,
                                                borderRadius: radii.md,
                                                opacity: pressed ? 0.75 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText variant="smallBold" color={selected ? 'primary' : 'text'}>{role.name}</ThemedText>
                                        <ThemedText variant="caption" color="textSecondary">{role.description}</ThemedText>
                                    </Pressable>
                                );
                            })}

                            {!selectedOrg?.isPublic && (
                                <View style={{ gap: spacing.xs }}>
                                    <ThemedText variant="smallBold" color="text">Invite code</ThemedText>
                                    <View style={[styles.searchContainer, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.md }]}>
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
                            <View style={styles.requiredFieldsWrap}>
                                {selectedOrg?.requiredShareFields.map((field) => (
                                    <View key={field} style={[styles.requiredFieldChip, { borderColor: colors.border, borderRadius: radii.full }]}>
                                        <ThemedText variant="captionBold" color="textSecondary">{getShareFieldLabel(field)}</ThemedText>
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

                        <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
                            <Pressable
                                onPress={closeJoinModal}
                                style={({ pressed }) => [
                                    styles.secondaryAction,
                                    { borderColor: colors.border, borderRadius: radii.md, opacity: pressed ? 0.75 : 1 },
                                ]}
                                accessibilityRole="button"
                            >
                                <ThemedText variant="smallBold" color="text">Cancel</ThemedText>
                            </Pressable>
                            <Pressable
                                disabled={!canSubmitJoin || isJoining}
                                onPress={handleJoinOrganization}
                                style={({ pressed }) => [
                                    styles.primaryAction,
                                    {
                                        backgroundColor: colors.primary,
                                        borderRadius: radii.md,
                                        opacity: !canSubmitJoin || isJoining || pressed ? 0.65 : 1,
                                    },
                                ]}
                                accessibilityRole="button"
                            >
                                <ThemedText variant="smallBold" color="onPrimary">{isJoining ? 'Joining...' : 'Confirm Join'}</ThemedText>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    listContent: {
        padding: 16,
        gap: 12,
    },
    headerWrap: {
        marginBottom: 6,
        gap: 12,
    },
    searchContainer: {
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 2,
    },
    searchInput: {
        minHeight: 42,
    },
    filterRow: {
        gap: 8,
        paddingRight: 4,
    },
    filterChip: {
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    loadingStack: {
        gap: 12,
    },
    card: {
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    cardBody: {
        padding: 14,
        paddingTop: 10,
        gap: 8,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    memberMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    cardActionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    primaryAction: {
        flex: 1,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    secondaryAction: {
        flex: 1,
        borderWidth: StyleSheet.hairlineWidth,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContainer: {
        borderWidth: StyleSheet.hairlineWidth,
        maxHeight: '90%',
    },
    modalContent: {
        padding: 16,
        gap: 10,
        paddingBottom: 24,
    },
    roleCard: {
        borderWidth: StyleSheet.hairlineWidth,
        padding: 12,
        gap: 4,
    },
    requiredFieldsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    requiredFieldChip: {
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    consentRow: {
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
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
        borderTopWidth: StyleSheet.hairlineWidth,
        padding: 14,
        flexDirection: 'row',
        gap: 10,
    },
});
