import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
} from 'react-native';
import { useNavigation, useRoute, useTheme } from '@react-navigation/native';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { usePatientId } from 'hooks/usePatientId';
import {
    getShareFieldLabel,
    joinClinic,
    listClinics,
} from '../../services/discovery/discoveryService';
import { ClinicView, ConsentSelection } from '../../services/discovery/types';

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

    const organizationId: string | undefined = route.params?.organizationId;
    const organizationName: string | undefined = route.params?.organizationName;

    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<ClinicFilter>('all');
    const [clinics, setClinics] = useState<ClinicView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedClinic, setSelectedClinic] = useState<ClinicView | null>(null);
    const [isJoining, setIsJoining] = useState(false);
    const [consent, setConsent] = useState<ConsentSelection>({
        acceptedPrivacyPolicy: false,
        acceptedTermsAndConditions: false,
        acceptedDataSharing: false,
    });

    const canSubmitJoin = useMemo(() => {
        return consent.acceptedDataSharing && consent.acceptedPrivacyPolicy && consent.acceptedTermsAndConditions;
    }, [consent]);

    useEffect(() => {
        setIsLoading(true);
        listClinics(patientId, { query: searchQuery, filter, organizationId })
            .then(setClinics)
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Unable to load clinics.';
                Alert.alert('Error', message);
            })
            .finally(() => setIsLoading(false));
    }, [patientId, searchQuery, filter, organizationId]);

    const openJoinModal = (clinic: ClinicView) => {
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
        try {
            await joinClinic(patientId, {
                clinicId: selectedClinic.id,
                consent,
            });

            const refreshed = await listClinics(patientId, { query: searchQuery, filter, organizationId });
            setClinics(refreshed);
            closeJoinModal();
            Alert.alert('Clinic joined', `${selectedClinic.name} has been added to your clinics.`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to join clinic.';
            Alert.alert('Join failed', message);
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <ThemedView style={[styles.screen, { backgroundColor: colors.background }]}>
            <FlatList
                data={clinics}
                keyExtractor={(item) => item.id}
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <ThemedView style={styles.headerWrap}>
                        <ThemedText style={styles.heading}>{organizationName ? `${organizationName} Clinics` : 'Explore Clinics'}</ThemedText>
                        <ThemedText style={[styles.subheading, { color: colors.text }]}>Browse public clinics and private partnered clinics you unlocked.</ThemedText>

                        <ThemedView style={[styles.searchContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search clinics"
                                placeholderTextColor={colors.border}
                                style={[styles.searchInput, { color: colors.text }]}
                            />
                        </ThemedView>

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
                            }}
                        />
                    )
                }
                renderItem={({ item }) => (
                    <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <ThemedView style={styles.cardTopRow}>
                            <ThemedText style={styles.cardTitle}>{item.name}</ThemedText>
                            <ThemedView
                                style={[
                                    styles.badge,
                                    {
                                        backgroundColor: item.isJoined
                                            ? '#10B981'
                                            : item.isPublic
                                                ? '#3B82F6'
                                                : '#F59E0B',
                                    },
                                ]}
                            >
                                <ThemedText style={styles.badgeText}>{item.isJoined ? 'Joined' : item.isPublic ? 'Public' : 'Private'}</ThemedText>
                            </ThemedView>
                        </ThemedView>

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
                            {!item.isJoined && (
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
        padding: 14,
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