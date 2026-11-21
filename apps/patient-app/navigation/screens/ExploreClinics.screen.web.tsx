import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DimensionValue, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import NetInfo from '@react-native-community/netinfo';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import EntityMediaCardHeader from '@ui/EntityMediaCardHeader';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
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

export default function ExploreClinicsScreenWeb() {
    const { colors, spacing, radii, sizes, typography, shadows } = useAppTheme();
    const { isCompact, isWorkstation, isWide } = useBreakpoint();
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
    const [isLoading, setIsLoading] = useState(true);
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
            const fresh = await loadLocalClinics(patientId, { query: searchQuery, filter, organizationId });
            setClinics(fresh);
        } catch (err) {
            console.warn('[ExploreClinicsWeb] Background API refresh failed:', err);
        } finally {
            isRefreshingApiRef.current = false;
        }
    };

    useEffect(() => {
        loadLocal();
        triggerApiRefresh();
    }, [patientId, searchQuery, filter, organizationId]);

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
            <View style={[styles.toolbar, { gap: spacing.md, marginBottom: spacing.md }]}>
                {organizationName ? (
                    <ThemedText variant="h2" color="text">
                        {organizationName} Clinics
                    </ThemedText>
                ) : null}

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
                            placeholder="Search clinics by name, address, or service..."
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
                    {clinicFilters.map((item) => {
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
            ) : clinics.length === 0 ? (
                <EmptyState
                    icon="hospital"
                    title="No clinics found"
                    message="Try another search term or filter option."
                    actionLabel="Reset filters"
                    onActionPress={() => {
                        setSearchQuery('');
                        setFilter('all');
                    }}
                />
            ) : (
                <View style={[styles.grid, { gap: spacing.lg }]}>
                    {clinics.map((item) => (
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
                                badgeLabel={item.isJoined ? 'Joined' : item.isPublic ? 'Public' : 'Private'}
                                badgeColor={item.isJoined ? colors.success : item.isPublic ? colors.primary : colors.warning}
                            />
                            <View style={[styles.cardBody, { padding: spacing.lg, gap: spacing.sm }]}>
                                <ThemedText variant="title" numberOfLines={1}>{item.name}</ThemedText>
                                <ThemedText variant="body" color="textSecondary" numberOfLines={2}>
                                    {item.description || 'No description provided.'}
                                </ThemedText>
                                <View style={[styles.metaRow, { gap: spacing.xs, marginTop: spacing.xs }]}>
                                    <AppIcon name="location" size={sizes.iconSm} color="textMuted" />
                                    <ThemedText variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
                                        {item.address || 'Address not listed'}
                                    </ThemedText>
                                </View>
                                <View style={[styles.metaRow, { gap: spacing.xs }]}>
                                    <AppIcon name="calendar" size={sizes.iconSm} color="textMuted" />
                                    <ThemedText variant="caption" color="textMuted">
                                        Appointments: {item.supportsAppointments ? 'Supported' : 'Not available'}
                                    </ThemedText>
                                </View>

                                {/* Card Actions */}
                                <View style={[styles.cardActionsRow, { gap: spacing.sm, marginTop: spacing.md }]}>
                                    <Pressable
                                        onPress={() => navigation.navigate('Main', { screen: 'ClinicDetailsScreen', params: { clinicId: item.id } })}
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
                                            <ThemedText variant="smallBold" color="onPrimary">Join Clinic</ThemedText>
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

                                    <Pressable
                                        disabled={!item.supportsAppointments}
                                        onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen', params: { clinicId: item.id } })}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Book appointment at ${item.name}`}
                                        style={({ pressed, hovered }: any) => [
                                            styles.secondaryAction,
                                            {
                                                borderColor: hovered && item.supportsAppointments ? colors.borderDark : colors.border,
                                                backgroundColor: hovered && item.supportsAppointments ? colors.surfaceSubtle : colors.transparent,
                                                borderRadius: radii.md,
                                                borderWidth: sizes.borderWidth,
                                                minHeight: sizes.controlMd,
                                                paddingHorizontal: spacing.md,
                                                opacity: !item.supportsAppointments ? 0.4 : pressed ? 0.75 : 1,
                                            },
                                        ]}
                                    >
                                        <ThemedText variant="smallBold" color={item.supportsAppointments ? 'text' : 'textMuted'}>Book</ThemedText>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Join Modal for Web */}
            <Modal visible={!!selectedClinic} animationType="fade" transparent onRequestClose={closeJoinModal}>
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
                            <ThemedText variant="h2">{selectedClinic?.name ? `Join ${selectedClinic.name}` : 'Join Clinic'}</ThemedText>
                            <ThemedText variant="body" color="textSecondary">
                                Accept required consent before becoming a clinic patient.
                            </ThemedText>

                            <ThemedText variant="smallBold" color="text">Required data fields</ThemedText>
                            <View style={[styles.requiredFieldsWrap, { gap: spacing.xs }]}>
                                {selectedClinic?.requiredShareFields.map((field) => (
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
                                onPress={handleJoinClinic}
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
