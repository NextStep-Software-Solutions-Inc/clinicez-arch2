import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityMediaCardHeader from '@ui/EntityMediaCardHeader';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useContentInsets } from '../../hooks/useContentInsets';
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
import { dialog } from '@utils/dialog';

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

export default function ExploreClinicsScreen() {
    const { colors, spacing, radii, sizes, typography } = useAppTheme();
    const insets = useContentInsets();
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
            dialog.alert('Error', message);
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
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', width: '100%', paddingRight: spacing.sm }}>
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search clinics..."
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
                    accessibilityRole="button"
                    accessibilityLabel={isSearching ? 'Close search' : 'Search clinics'}
                    style={{ marginRight: spacing.sm, padding: spacing.xs }}
                >
                    <AppIcon name={isSearching ? 'close' : 'search'} size={sizes.iconLg} color="text" />
                </Pressable>
            ),
        });
    }, [isSearching, searchQuery, colors, spacing, radii, sizes, typography, navigation, organizationName]);

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
                dialog.alert('Join failed', error.message);
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
        dialog.alert('Clinic joined', `${selectedClinic.name} has been added to your clinics.`);
    };

    return (
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
            <FlatList
                data={clinics}
                keyExtractor={(item) => item.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.lg }]}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                ListHeaderComponent={
                    <View style={styles.headerWrap}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                            {clinicFilters.map((item) => {
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
                    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.lg }]}>
                        <EntityMediaCardHeader
                            name={item.name}
                            logoUrl={item.logoUrl}
                            coverImageUrl={item.coverImageUrl}
                            badgeLabel={item.isJoined ? 'Joined' : item.isPublic ? 'Public' : 'Private'}
                            badgeColor={item.isJoined ? colors.success : item.isPublic ? colors.primary : colors.warning}
                        />
                        <View style={styles.cardBody}>
                            <ThemedText variant="title">{item.name}</ThemedText>
                            <ThemedText variant="body" color="textSecondary">{item.description}</ThemedText>
                            <ThemedText variant="caption" color="textMuted">Address: {item.address}</ThemedText>
                            <ThemedText variant="caption" color="textMuted">Appointments: {item.supportsAppointments ? 'Supported' : 'Not available'}</ThemedText>

                            <View style={styles.cardActionsRow}>
                                <Pressable
                                    onPress={() => navigation.navigate('Main', { screen: 'ClinicDetailsScreen', params: { clinicId: item.id } })}
                                    style={({ pressed }) => [
                                        styles.secondaryAction,
                                        { borderColor: colors.border, borderRadius: radii.md, opacity: pressed ? 0.75 : 1 },
                                    ]}
                                    accessibilityRole="button"
                                >
                                    <ThemedText variant="smallBold" color="text">Details</ThemedText>
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
                                        <ThemedText variant="smallBold" color="onPrimary">Join Clinic</ThemedText>
                                    </Pressable>
                                )}
                                {item.membershipStatus === 'pending' && (
                                    <View style={[styles.primaryAction, { backgroundColor: colors.warning, borderRadius: radii.md, opacity: 0.85, justifyContent: 'center', alignItems: 'center' }]}>
                                        <ThemedText variant="smallBold" color="onPrimary">Requested</ThemedText>
                                    </View>
                                )}
                                <Pressable
                                    disabled={!item.supportsAppointments}
                                    onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen', params: { clinicId: item.id } })}
                                    style={({ pressed }) => [
                                        styles.secondaryAction,
                                        {
                                            borderColor: colors.border,
                                            borderRadius: radii.md,
                                            opacity: !item.supportsAppointments || pressed ? 0.6 : 1,
                                        },
                                    ]}
                                    accessibilityRole="button"
                                >
                                    <ThemedText variant="smallBold" color={item.supportsAppointments ? 'text' : 'textMuted'}>Book Consultation</ThemedText>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                )}
            />

            <Modal visible={!!selectedClinic} animationType="slide" transparent onRequestClose={closeJoinModal}>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalContainer, { backgroundColor: colors.background, borderColor: colors.border, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }]}>
                        <ScrollView contentContainerStyle={styles.modalContent}>
                            <ThemedText variant="h2">{selectedClinic?.name ? `Join ${selectedClinic.name}` : 'Join Clinic'}</ThemedText>
                            <ThemedText variant="body" color="textSecondary">Accept required consent before becoming a clinic patient.</ThemedText>

                            <ThemedText variant="smallBold" color="text">Required data fields</ThemedText>
                            <View style={styles.requiredFieldsWrap}>
                                {selectedClinic?.requiredShareFields.map((field) => (
                                    <View key={field} style={[styles.requiredFieldChip, { borderColor: colors.border, borderRadius: radii.full }]}>
                                        <ThemedText variant="captionBold" color="textSecondary">{getShareFieldLabel(field)}</ThemedText>
                                    </View>
                                ))}
                            </View>

                            <ThemedText variant="smallBold" color="text">Consent</ThemedText>
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

                            <ThemedText variant="caption" color="textMuted">Privacy: {selectedClinic?.privacyPolicyUrl}</ThemedText>
                            <ThemedText variant="caption" color="textMuted">Terms: {selectedClinic?.termsAndConditionsUrl}</ThemedText>
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
                                onPress={handleJoinClinic}
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
