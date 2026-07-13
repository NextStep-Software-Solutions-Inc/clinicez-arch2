import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useNavigation, useRoute, useTheme, MaterialSymbol, SFSymbol } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityMediaCardHeader from '@ui/EntityMediaCardHeader';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from '@shared/safe';
import { usePatientId } from 'hooks/usePatientId';
import {
    getShareFieldLabel,
    joinClinic,
    listClinics,
    loadLocalClinics,
    refreshClinicsFromApi,
} from '../../services/discovery/discoveryService';
import { ClinicDetail, ConsentSelection } from '../../services/discovery/types';

type ClinicFilter = 'all' | 'public' | 'partnered' | 'joined';

const clinicFilters: { key: ClinicFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'public', label: 'Public' },
    { key: 'partnered', label: 'Partnered' },
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

export default function ExploreClinicsScreen() {
    const { colors } = useTheme();
    const navigation = useNavigation() as any;
    const route = useRoute() as any;
    const patientId = usePatientId();
    const { getToken } = useClerkAuth();
    const { showOfflineAlert } = useOfflineAlert();

    const organizationId: string | undefined = route.params?.organizationId;
    const organizationName: string | undefined = route.params?.organizationName;

    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<ClinicFilter>('all');
    const [clinics, setClinics] = useState<ClinicDetail[]>([]);
    // isLoading = true only when cache is empty and we are still loading
    const [isLoading, setIsLoading] = useState(true);
    // Track whether a background API refresh is in flight
    const isRefreshingApiRef = useRef(false);
    const [selectedClinic, setSelectedClinic] = useState<ClinicDetail | null>(null);
    const [isJoining, setIsJoining] = useState(false);
    const [consent, setConsent] = useState<ConsentSelection>({
        acceptedPrivacyPolicy: false,
        acceptedTermsAndConditions: false,
        acceptedDataSharing: false,
    });

    const canSubmitJoin = useMemo(() => {
        return consent.acceptedDataSharing && consent.acceptedPrivacyPolicy && consent.acceptedTermsAndConditions;
    }, [consent]);

    // ── Load local data immediately, then background-refresh from API ─────────

    const loadLocal = async () => {
        const data = await loadLocalClinics(patientId, { query: searchQuery, filter, organizationId });
        setClinics(data);
        setIsLoading(false);
    };

    const triggerApiRefresh = async () => {
        if (isRefreshingApiRef.current) return;
        isRefreshingApiRef.current = true;
        try {
            const netState = await NetInfo.fetch();
            if (!netState.isConnected) return;
            await refreshClinicsFromApi(patientId, searchQuery, organizationId, getToken);
            // Reload from local DB after the cache update
            const fresh = await loadLocalClinics(patientId, { query: searchQuery, filter, organizationId });
            setClinics(fresh);
        } catch (err) {
            console.warn('[ExploreClinics] Background API refresh failed:', err);
        } finally {
            isRefreshingApiRef.current = false;
        }
    };

    useEffect(() => {
        // 1. Show cached data immediately
        loadLocal();
        // 2. Refresh from API in the background
        triggerApiRefresh();
    }, [patientId, searchQuery, filter, organizationId]);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const data = await listClinics(patientId, { query: searchQuery, filter, organizationId }, getToken);
            setClinics(data);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to refresh clinics.';
            Alert.alert('Error', message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        const title = organizationName ? `${organizationName} Clinics` : 'Explore Clinics';
        navigation.setOptions({
            headerLargeTitleEnabled: !isSearching,
            headerTitle: isSearching ? () => (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', width: '100%', paddingRight: 8 }}>
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search clinics..."
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
            ) : title,
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
    }, [isSearching, searchQuery, colors, navigation, organizationName]);

    const openJoinModal = (clinic: ClinicDetail) => {
        setSelectedClinic(clinic);
        setConsent({
            acceptedPrivacyPolicy: false,
            acceptedTermsAndConditions: false,
            acceptedDataSharing: false,
        });
    };

    const closeJoinModal = () => {
        setSelectedClinic(null);
    };

    const handleJoinClinic = async () => {
        if (!selectedClinic) return;

        setIsJoining(true);
        const [, error] = await safeAwait(joinClinic(patientId, {
            clinicId: selectedClinic.id,
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

        const [refreshed] = await safeAwait(listClinics(patientId, { query: searchQuery, filter, organizationId }, getToken));
        if (refreshed) {
            setClinics(refreshed);
        }
        closeJoinModal();
        setIsJoining(false);
        Alert.alert('Clinic joined', `${selectedClinic.name} has been added to your clinics.`);
    };

    return (
        <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
            <FlatList
                data={clinics}
                keyExtractor={(item) => item.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.listContent}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                ListHeaderComponent={
                    <ThemedView style={styles.headerWrap}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                            {clinicFilters.map((item) => {
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
                            title="No clinics found"
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
                            <ThemedText style={[styles.metaText, { color: colors.text }]}>Address: {item.address}</ThemedText>
                            <ThemedText style={[styles.metaText, { color: colors.text }]}>Appointments: {item.supportsAppointments ? 'Supported' : 'Not available'}</ThemedText>

                            <ThemedView style={styles.cardActionsRow}>
                                <Pressable
                                    onPress={() => navigation.navigate('Main', { screen: 'ClinicDetailsScreen', params: { clinicId: item.id } })}
                                    style={({ pressed }) => [
                                        styles.secondaryAction,
                                        { borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                                    ]}
                                    accessibilityRole="button"
                                >
                                    <ThemedText style={styles.secondaryActionText}>Details</ThemedText>
                                </Pressable>
                                {!item.isJoined && item.membershipStatus !== 'pending' && (
                                    <Pressable
                                        onPress={() => openJoinModal(item)}
                                        style={({ pressed }) => [
                                            styles.primaryAction,
                                            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
                                        ]}
                                    >
                                        <ThemedText style={styles.primaryActionText}>Join Clinic</ThemedText>
                                    </Pressable>
                                )}
                                {item.membershipStatus === 'pending' && (
                                    <ThemedView style={[styles.primaryAction, { backgroundColor: '#F59E0B', opacity: 0.8, justifyContent: 'center', alignItems: 'center' }]}>
                                        <ThemedText style={styles.primaryActionText}>Requested</ThemedText>
                                    </ThemedView>
                                )}
                                <Pressable
                                    disabled={!item.supportsAppointments}
                                    onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen', params: { clinicId: item.id } })}
                                    style={({ pressed }) => [
                                        styles.secondaryAction,
                                        {
                                            borderColor: colors.border,
                                            opacity: !item.supportsAppointments || pressed ? 0.6 : 1,
                                        },
                                    ]}
                                >
                                    <ThemedText style={styles.secondaryActionText}>Book Consultation</ThemedText>
                                </Pressable>
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>
                )}
            />

            <Modal visible={!!selectedClinic} animationType="slide" transparent onRequestClose={closeJoinModal}>
                <ThemedView style={styles.modalOverlay}>
                    <ThemedView style={[styles.modalContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <ScrollView contentContainerStyle={styles.modalContent}>
                            <ThemedText style={styles.modalTitle}>Join {selectedClinic?.name}</ThemedText>
                            <ThemedText style={[styles.modalSubtitle, { color: colors.text }]}>Accept required consent before becoming a clinic patient.</ThemedText>

                            <ThemedText style={styles.sectionLabel}>Required data fields</ThemedText>
                            <ThemedView style={styles.requiredFieldsWrap}>
                                {selectedClinic?.requiredShareFields.map((field) => (
                                    <ThemedView key={field} style={[styles.requiredFieldChip, { borderColor: colors.border }]}>
                                        <ThemedText style={styles.requiredFieldText}>{getShareFieldLabel(field)}</ThemedText>
                                    </ThemedView>
                                ))}
                            </ThemedView>

                            <ThemedText style={styles.sectionLabel}>Consent</ThemedText>
                            <ConsentToggle
                                label="I accept the clinic privacy policy"
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
                                label="I agree to share required information with the clinic"
                                value={consent.acceptedDataSharing}
                                onPress={() => setConsent((prev) => ({ ...prev, acceptedDataSharing: !prev.acceptedDataSharing }))}
                            />

                            <ThemedText style={[styles.linksText, { color: colors.text }]}>Privacy: {selectedClinic?.privacyPolicyUrl}</ThemedText>
                            <ThemedText style={[styles.linksText, { color: colors.text }]}>Terms: {selectedClinic?.termsAndConditionsUrl}</ThemedText>
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
                                onPress={handleJoinClinic}
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
    providersRow: {
        gap: 4,
    },
    providersLabel: {
        fontSize: 12,
        opacity: 0.7,
        fontWeight: '600',
    },
    providersChips: {
        gap: 8,
        paddingVertical: 4,
    },
    providerChip: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        minWidth: 100,
    },
    providerChipName: {
        fontSize: 12,
        fontWeight: '700',
    },
    providerChipSpec: {
        fontSize: 11,
        opacity: 0.7,
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
