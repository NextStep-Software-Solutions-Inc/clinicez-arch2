import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { useNavigation, useTheme, MaterialSymbol, SFSymbol } from '@react-navigation/native';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityMediaCardHeader from '@ui/EntityMediaCardHeader';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from 'utils/safe';
import { usePatientId } from 'hooks/usePatientId';
import {
    getShareFieldLabel,
    joinOrganization,
    listOrganizations,
} from '../../services/discovery/discoveryService';
import { ConsentSelection, OrganizationView } from '../../services/discovery/types';

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
    const { colors } = useTheme();

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.consentRow,
                {
                    borderColor: value ? colors.primary : colors.border,
                    backgroundColor: value ? colors.card : 'transparent',
                    opacity: pressed ? 0.75 : 1,
                },
            ]}
        >
            <ThemedView
                style={[
                    styles.checkbox,
                    {
                        borderColor: value ? colors.primary : colors.border,
                        backgroundColor: value ? colors.primary : 'transparent',
                    },
                ]}
            >
                <ThemedText style={styles.checkboxMark}>{value ? '✓' : ''}</ThemedText>
            </ThemedView>
            <ThemedText style={styles.consentLabel}>{label}</ThemedText>
        </Pressable>
    );
}

export default function ExploreOrgsScreen() {
    const { colors } = useTheme();
    const navigation = useNavigation() as any;
    const patientId = usePatientId();
    const { getToken } = useClerkAuth();
    const { showOfflineAlert } = useOfflineAlert();

    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<OrganizationFilter>('all');
    const [organizations, setOrganizations] = useState<OrganizationView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrg, setSelectedOrg] = useState<OrganizationView | null>(null);
    const [selectedRoleId, setSelectedRoleId] = useState('');
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

    useEffect(() => {
        setIsLoading(true);
        listOrganizations(patientId, searchQuery, filter, getToken)
            .then(setOrganizations)
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Unable to load organizations.';
                Alert.alert('Error', message);
            })
            .finally(() => setIsLoading(false));
    }, [patientId, searchQuery, filter]);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const data = await listOrganizations(patientId, searchQuery, filter, getToken);
            setOrganizations(data);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to refresh organizations.';
            Alert.alert('Error', message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        navigation.setOptions({
            headerLargeTitleEnabled: !isSearching,
            headerTitle: isSearching ? () => (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', width: '100%', paddingRight: 8 }}>
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search organizations..."
                        placeholderTextColor={colors.border}
                        autoFocus
                        style={{
                            flex: 1,
                            color: colors.text,
                            fontSize: 16,
                            paddingVertical: Platform.select({ ios: 6, android: 4 }),
                            paddingHorizontal: 12,
                            backgroundColor: colors.card,
                            borderRadius: 10,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: colors.border,
                            height: 36,
                        }}
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
                    style={{ marginRight: 8, padding: 4 }}
                >
                    {isSearching ? (
                        Platform.select({
                            android: <MaterialSymbol name="close" size={24} color={colors.text} />,
                            ios: <SFSymbol name="xmark" size={24} color={colors.text} />
                        })
                    ) : (
                        Platform.select({
                            android: <MaterialSymbol name="search" size={24} color={colors.text} />,
                            ios: <SFSymbol name="magnifyingglass" size={24} color={colors.text} />
                        })
                    )}
                </Pressable>
            ),
        });
    }, [isSearching, searchQuery, colors, navigation]);

    const openJoinModal = (org: OrganizationView) => {
        setSelectedOrg(org);
        setSelectedRoleId(org.roles[0]?.id ?? '');
        setInviteCode('');
        setConsent({
            acceptedPrivacyPolicy: false,
            acceptedTermsAndConditions: false,
            acceptedDataSharing: false,
        });
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
                Alert.alert('Join failed', error.message);
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
        Alert.alert('Joined', `You are now part of ${selectedOrg.name}.`);
    };

    return (
        <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
            <FlatList
                data={organizations}
                keyExtractor={(item) => item.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.listContent}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                ListHeaderComponent={
                    <ThemedView style={styles.headerWrap}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                            {orgFilters.map((item) => {
                                const active = item.key === filter;
                                return (
                                    <Pressable
                                        key={item.key}
                                        onPress={() => setFilter(item.key)}
                                        style={({ pressed }) => [
                                            styles.filterChip,
                                            {
                                                borderColor: active ? colors.primary : colors.border,
                                                backgroundColor: active ? colors.primary : colors.card,
                                                opacity: pressed ? 0.75 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText style={[styles.filterChipText, { color: active ? '#fff' : colors.text }]}>{item.label}</ThemedText>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </ThemedView>
                }
                ListEmptyComponent={
                    isLoading ? (
                        <ThemedView style={styles.loadingStack}>
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </ThemedView>
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
                    <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <EntityMediaCardHeader
                            name={item.name}
                            logoUrl={item.logoUrl}
                            coverImageUrl={item.coverImageUrl}
                            badgeLabel={item.isJoined ? 'Joined' : item.isPublic ? 'Public' : 'Private'}
                            badgeColor={item.isJoined ? '#10B981' : item.isPublic ? '#3B82F6' : '#F59E0B'}
                        />
                        <ThemedView style={styles.cardBody}>
                            <ThemedText style={styles.cardTitle}>{item.name}</ThemedText>
                            <ThemedText style={[styles.cardDescription, { color: colors.text }]}>{item.description}</ThemedText>
                            <ThemedView style={styles.metaRow}>
                                <ThemedText style={[styles.metaText, { color: colors.text }]}>Partnered clinics: {item.partneredClinicIds.length}</ThemedText>
                                <ThemedText style={[styles.metaText, { color: colors.primary }]}>👥 {item.activeMemberCount.toLocaleString()} members</ThemedText>
                            </ThemedView>

                            <ThemedView style={styles.cardActionsRow}>
                                <Pressable
                                    onPress={() =>
                                        navigation.navigate('Main', {
                                            screen: 'OrganizationDetailsScreen',
                                            params: { organizationId: item.id },
                                        })
                                    }
                                    style={({ pressed }) => [
                                        styles.secondaryAction,
                                        { borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                                    ]}
                                    accessibilityRole="button"
                                >
                                    <ThemedText style={styles.secondaryActionText}>Details</ThemedText>
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
                                        { borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                                    ]}
                                >
                                    <ThemedText style={styles.secondaryActionText}>View Clinics</ThemedText>
                                </Pressable>
                                {!item.isJoined && (
                                    <Pressable
                                        onPress={() => openJoinModal(item)}
                                        style={({ pressed }) => [
                                            styles.primaryAction,
                                            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
                                        ]}
                                    >
                                        <ThemedText style={styles.primaryActionText}>Join</ThemedText>
                                    </Pressable>
                                )}
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>
                )}
            />

            <Modal visible={!!selectedOrg} animationType="slide" transparent onRequestClose={closeJoinModal}>
                <ThemedView style={styles.modalOverlay}>
                    <ThemedView style={[styles.modalContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <ScrollView contentContainerStyle={styles.modalContent}>
                            <ThemedText style={styles.modalTitle}>Join {selectedOrg?.name}</ThemedText>
                            <ThemedText style={[styles.modalSubtitle, { color: colors.text }]}>Select a role and provide required consent to continue.</ThemedText>

                            {selectedOrg?.roles.map((role) => {
                                const selected = role.id === selectedRoleId;
                                return (
                                    <Pressable
                                        key={role.id}
                                        onPress={() => setSelectedRoleId(role.id)}
                                        style={({ pressed }) => [
                                            styles.roleCard,
                                            {
                                                borderColor: selected ? colors.primary : colors.border,
                                                backgroundColor: selected ? colors.card : 'transparent',
                                                opacity: pressed ? 0.75 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText style={styles.roleTitle}>{role.name}</ThemedText>
                                        <ThemedText style={[styles.roleDescription, { color: colors.text }]}>{role.description}</ThemedText>
                                    </Pressable>
                                );
                            })}

                            {!selectedOrg?.isPublic && (
                                <ThemedView>
                                    <ThemedText style={styles.sectionLabel}>Invite code</ThemedText>
                                    <ThemedView style={[styles.searchContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
                                        <TextInput
                                            value={inviteCode}
                                            onChangeText={setInviteCode}
                                            placeholder="Enter invitation code"
                                            placeholderTextColor={colors.border}
                                            autoCapitalize="characters"
                                            style={[styles.searchInput, { color: colors.text }]}
                                        />
                                    </ThemedView>
                                </ThemedView>
                            )}

                            <ThemedText style={styles.sectionLabel}>Required data fields</ThemedText>
                            <ThemedView style={styles.requiredFieldsWrap}>
                                {selectedOrg?.requiredShareFields.map((field) => (
                                    <ThemedView key={field} style={[styles.requiredFieldChip, { borderColor: colors.border }]}>
                                        <ThemedText style={styles.requiredFieldText}>{getShareFieldLabel(field)}</ThemedText>
                                    </ThemedView>
                                ))}
                            </ThemedView>

                            <ThemedText style={styles.sectionLabel}>Consent</ThemedText>
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

                            <ThemedText style={[styles.linksText, { color: colors.text }]}>Privacy: {selectedOrg?.privacyPolicyUrl}</ThemedText>
                            <ThemedText style={[styles.linksText, { color: colors.text }]}>Terms: {selectedOrg?.termsAndConditionsUrl}</ThemedText>
                        </ScrollView>

                        <ThemedView style={[styles.modalActions, { borderTopColor: colors.border }]}>
                            <Pressable
                                onPress={closeJoinModal}
                                style={({ pressed }) => [
                                    styles.secondaryAction,
                                    { borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                                ]}
                            >
                                <ThemedText style={styles.secondaryActionText}>Cancel</ThemedText>
                            </Pressable>
                            <Pressable
                                disabled={!canSubmitJoin || isJoining}
                                onPress={handleJoinOrganization}
                                style={({ pressed }) => [
                                    styles.primaryAction,
                                    {
                                        backgroundColor: colors.primary,
                                        opacity: !canSubmitJoin || isJoining || pressed ? 0.65 : 1,
                                    },
                                ]}
                            >
                                <ThemedText style={styles.primaryActionText}>{isJoining ? 'Joining...' : 'Confirm Join'}</ThemedText>
                            </Pressable>
                        </ThemedView>
                    </ThemedView>
                </ThemedView>
            </Modal>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    listContent: {
        padding: 16,
        gap: 12,
        paddingBottom: 28,
    },
    headerWrap: {
        marginBottom: 6,
        gap: 12,
    },
    heading: {
        fontSize: 24,
        fontWeight: '700',
    },
    subheading: {
        fontSize: 14,
        opacity: 0.8,
        lineHeight: 20,
    },
    searchContainer: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 2,
    },
    searchInput: {
        fontSize: 15,
        minHeight: 42,
    },
    filterRow: {
        gap: 8,
        paddingRight: 4,
    },
    filterChip: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    centerWrap: {
        paddingVertical: 36,
        alignItems: 'center',
    },
    loadingStack: {
        gap: 12,
    },
    card: {
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    cardBody: {
        padding: 14,
        paddingTop: 10,
        gap: 8,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    cardTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
    },
    cardDescription: {
        fontSize: 14,
        opacity: 0.85,
        lineHeight: 20,
    },
    metaText: {
        fontSize: 12,
        opacity: 0.8,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    badge: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    cardActionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    primaryAction: {
        flex: 1,
        borderRadius: 10,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    primaryActionText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    secondaryAction: {
        flex: 1,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    secondaryActionText: {
        fontSize: 14,
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        maxHeight: '90%',
    },
    modalContent: {
        padding: 16,
        gap: 10,
        paddingBottom: 24,
    },
    modalTitle: {
        fontSize: 21,
        fontWeight: '700',
    },
    modalSubtitle: {
        fontSize: 14,
        opacity: 0.8,
        lineHeight: 20,
        marginBottom: 2,
    },
    roleCard: {
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 12,
        gap: 4,
    },
    roleTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    roleDescription: {
        fontSize: 13,
        opacity: 0.85,
    },
    sectionLabel: {
        marginTop: 6,
        fontSize: 13,
        fontWeight: '700',
        opacity: 0.9,
    },
    requiredFieldsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    requiredFieldChip: {
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    requiredFieldText: {
        fontSize: 12,
        fontWeight: '600',
    },
    consentRow: {
        borderRadius: 12,
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
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxMark: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800',
    },
    consentLabel: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    linksText: {
        fontSize: 12,
        opacity: 0.78,
        lineHeight: 17,
    },
    modalActions: {
        borderTopWidth: StyleSheet.hairlineWidth,
        padding: 14,
        flexDirection: 'row',
        gap: 10,
    },
});
