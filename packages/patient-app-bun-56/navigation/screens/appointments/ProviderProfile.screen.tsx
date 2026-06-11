import { FlatList, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EntityMediaCardHeader from '@ui/EntityMediaCardHeader';
import type { ProviderSnapshot, AffiliatedClinic } from '../../../services/appointments/types';

type Props = StaticScreenProps<{ providerData: ProviderSnapshot }>;

function AffiliatedClinicCard({ clinic }: { clinic: AffiliatedClinic }) {
    return (
        <EntityMediaCardHeader
            name={clinic.name}
            logoUrl={clinic.logoUrl}
            badgeLabel="Affiliated"
            badgeColor="#6366F1"
        />
    );
}

export default function ProviderProfileScreen({ route }: Props) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { providerData: provider } = route.params;

    const initials = provider.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    return (
        <ThemedView style={styles.screen}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            >
                {/* Header — Avatar + Name + Specialty */}
                <View style={styles.header}>
                    {provider.avatarUrl ? (
                        <Image
                            source={{ uri: provider.avatarUrl }}
                            style={styles.avatar}
                            accessibilityRole="image"
                            accessibilityLabel={provider.name}
                        />
                    ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                            <ThemedText style={styles.avatarInitials}>{initials}</ThemedText>
                        </View>
                    )}
                    <ThemedText style={styles.providerName}>{provider.name}</ThemedText>
                    <ThemedText style={[styles.providerSpecialty, { color: colors.text }]}>
                        {provider.specialty}
                    </ThemedText>

                    {provider.credentials.length > 0 && (
                        <View style={styles.credRow}>
                            {provider.credentials.map(c => (
                                <View
                                    key={c}
                                    style={[
                                        styles.credChip,
                                        { borderColor: colors.border, backgroundColor: colors.primary + '12' },
                                    ]}
                                >
                                    <ThemedText style={[styles.credText, { color: colors.primary }]}>{c}</ThemedText>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Biography */}
                {provider.bio ? (
                    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <ThemedText style={styles.sectionTitle}>Biography</ThemedText>
                        <ThemedText style={[styles.bioText, { color: colors.text }]}>{provider.bio}</ThemedText>
                    </View>
                ) : null}

                {/* Affiliated Clinics */}
                {provider.affiliatedClinics.length > 0 && (
                    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <ThemedText style={styles.sectionTitle}>Affiliated Clinics</ThemedText>
                        <FlatList
                            data={provider.affiliatedClinics}
                            keyExtractor={item => item.id}
                            scrollEnabled={false}
                            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                            renderItem={({ item }) => <AffiliatedClinicCard clinic={item} />}
                        />
                    </View>
                )}
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    scrollContent: { gap: 12 },
    header: {
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 8,
        gap: 8,
    },
    avatar: { width: 88, height: 88, borderRadius: 44 },
    avatarFallback: {
        backgroundColor: '#94A3B8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitials: { color: '#fff', fontSize: 30, fontWeight: '800' },
    providerName: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 4 },
    providerSpecialty: { fontSize: 15, opacity: 0.7, textAlign: 'center' },
    credRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
    credChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    credText: { fontSize: 12, fontWeight: '700' },
    section: {
        marginHorizontal: 16,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 16,
        gap: 10,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
        opacity: 0.55,
        textTransform: 'uppercase',
    },
    bioText: { fontSize: 14, lineHeight: 22, opacity: 0.85 },
});
