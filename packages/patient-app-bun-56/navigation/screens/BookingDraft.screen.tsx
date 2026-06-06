import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useNavigation, useRoute, useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import { usePatientId } from 'hooks/usePatientId';
import {
  getBookingDraft,
  getClinicDetail,
  getShareFieldLabel,
  listClinics,
  saveBookingDraft,
} from '../../services/discovery/discoveryService';
import { BookingDraftRecord, ClinicDetail, ClinicView, ShareableFieldKey } from '../../services/discovery/types';

function FieldToggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [
        styles.toggleRow,
        {
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.card : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <ThemedView style={[styles.checkbox, { borderColor: value ? colors.primary : colors.border, backgroundColor: value ? colors.primary : 'transparent' }]}>
        <ThemedText style={styles.checkboxMark}>{value ? '✓' : ''}</ThemedText>
      </ThemedView>
      <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
    </Pressable>
  );
}

export default function BookingDraftScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation() as any;
  const route = useRoute() as any;
  const patientId = usePatientId();
  const initialClinicId = route.params?.clinicId ? String(route.params.clinicId) : '';

  const [joinedClinics, setJoinedClinics] = useState<ClinicView[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState(initialClinicId);
  const [selectedClinic, setSelectedClinic] = useState<ClinicDetail | null>(null);
  const [draft, setDraft] = useState<BookingDraftRecord | null>(null);
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFields, setSelectedFields] = useState<ShareableFieldKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const requiredFields = useMemo(() => selectedClinic?.requiredShareFields ?? [], [selectedClinic]);
  const canSave = Boolean(selectedClinicId && reason.trim() && preferredDate.trim() && preferredTime.trim() && selectedFields.length > 0);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    listClinics(patientId, { filter: 'joined' })
      .then((items) => {
        if (!mounted) return;
        setJoinedClinics(items);
        const clinicId = selectedClinicId || items[0]?.id || '';
        setSelectedClinicId(clinicId);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load clinics.';
        Alert.alert('Error', message);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [patientId]);

  useEffect(() => {
    if (!selectedClinicId) return;

    let mounted = true;
    getClinicDetail(patientId, selectedClinicId)
      .then(async (clinic) => {
        if (!mounted) return;
        setSelectedClinic(clinic);
        const existingDraft = await getBookingDraft(patientId, selectedClinicId);
        if (!mounted || !existingDraft) {
          setDraft(null);
          setPreferredDate('');
          setPreferredTime('');
          setReason('');
          setNotes('');
          setSelectedFields(clinic.requiredShareFields);
          return;
        }

        setDraft(existingDraft);
        setPreferredDate(existingDraft.preferredDate ?? '');
        setPreferredTime(existingDraft.preferredTime ?? '');
        setReason(existingDraft.reason ?? '');
        setNotes(existingDraft.notes ?? '');
        setSelectedFields(existingDraft.shareFields.length ? existingDraft.shareFields : clinic.requiredShareFields);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load clinic details.';
        Alert.alert('Error', message);
      });

    return () => {
      mounted = false;
    };
  }, [patientId, selectedClinicId]);

  const toggleShareField = (field: ShareableFieldKey) => {
    setSelectedFields((current) => {
      if (current.includes(field)) {
        return current.filter((item) => item !== field);
      }
      return [...current, field];
    });
  };

  const handleSave = async () => {
    if (!selectedClinic) return;
    setIsSaving(true);
    try {
      const saved = await saveBookingDraft(patientId, {
        clinicId: selectedClinic.id,
        organizationId: selectedClinic.organizationIds[0] ?? null,
        preferredDate,
        preferredTime,
        reason,
        notes,
        shareFields: selectedFields,
      });
      setDraft(saved);
      Alert.alert('Saved', 'Your booking draft has been stored locally.');
      navigation.goBack();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to save booking draft.';
      Alert.alert('Save failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ScrollView contentContainerStyle={styles.loadingContainer}>
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (!selectedClinic && joinedClinics.length === 0) {
    return <EmptyState title="No joined clinics yet" message="Join a clinic first to prepare a booking draft." actionLabel="Explore clinics" onActionPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })} />;
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      {joinedClinics.length > 1 ? (
        <ThemedView style={[styles.selectorCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ThemedText style={styles.sectionTitle}>Choose clinic</ThemedText>
          <FlatList
            data={joinedClinics}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <ThemedView style={styles.horizontalGap} />}
            renderItem={({ item }) => {
              const active = item.id === selectedClinicId;
              return (
                <Pressable
                  onPress={() => setSelectedClinicId(item.id)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pill, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.background, opacity: pressed ? 0.8 : 1 }]}
                >
                  <ThemedText style={[styles.pillText, { color: active ? '#fff' : colors.text }]}>{item.name}</ThemedText>
                </Pressable>
              );
            }}
          />
        </ThemedView>
      ) : null}

      {selectedClinic ? (
        <ThemedView style={[styles.heroCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ThemedText style={styles.title}>Booking draft</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.text }]}>{selectedClinic.name}</ThemedText>
          <ThemedText style={[styles.meta, { color: colors.text }]}>{selectedClinic.address}</ThemedText>
        </ThemedView>
      ) : null}

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
        <TextInput value={preferredDate} onChangeText={setPreferredDate} placeholder="Preferred date (YYYY-MM-DD)" placeholderTextColor={colors.border} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
        <TextInput value={preferredTime} onChangeText={setPreferredTime} placeholder="Preferred time (HH:MM)" placeholderTextColor={colors.border} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
        <TextInput value={reason} onChangeText={setReason} placeholder="Reason for consultation" placeholderTextColor={colors.border} multiline style={[styles.textArea, { borderColor: colors.border, color: colors.text }]} />
        <TextInput value={notes} onChangeText={setNotes} placeholder="Additional notes" placeholderTextColor={colors.border} multiline style={[styles.textArea, { borderColor: colors.border, color: colors.text }]} />
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Data sharing</ThemedText>
        <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>Select the information you want to share with the clinic for this draft. Required items are preselected.</ThemedText>
        <ThemedView style={styles.requiredWrap}>
          {requiredFields.map((field) => (
            <FieldToggle key={field} label={getShareFieldLabel(field)} value={selectedFields.includes(field)} onPress={() => toggleShareField(field)} />
          ))}
        </ThemedView>
      </ThemedView>

      <ThemedView style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ThemedText style={styles.sectionTitle}>Draft status</ThemedText>
        <ThemedText style={[styles.sectionCopy, { color: colors.text }]}>{draft?.status === 'ready' ? 'Ready to submit later.' : 'Draft only. Submission will be enabled in a later iteration.'}</ThemedText>
      </ThemedView>

      <Pressable disabled={!canSave || isSaving} onPress={handleSave} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: !canSave || isSaving || pressed ? 0.7 : 1 }]} accessibilityRole="button">
        <ThemedText style={styles.primaryButtonText}>{isSaving ? 'Saving...' : 'Save draft'}</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 28 },
  loadingContainer: { padding: 16, gap: 16 },
  selectorCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  heroCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 6 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, opacity: 0.85 },
  meta: { fontSize: 12, opacity: 0.75 },
  section: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionCopy: { fontSize: 14, lineHeight: 20 },
  requiredWrap: { gap: 10 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, minHeight: 46, paddingHorizontal: 12, fontSize: 14 },
  textArea: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, minHeight: 88, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, textAlignVertical: 'top' },
  primaryButton: { borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  pill: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  pillText: { fontSize: 13, fontWeight: '700' },
  horizontalGap: { width: 8 },
  toggleRow: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  checkboxMark: { color: '#fff', fontWeight: '800' },
  toggleLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
});
