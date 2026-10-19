import { useEffect, useState, useCallback } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientMentalHealthProfile } from '@db/schema/patientMentalHealthProfile';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import Screen from 'components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';
import { useProfileSync } from 'hooks/useProfileSync';
import { useSafeHeaderHeight } from 'hooks/useSafeHeaderHeight';

type PsychotherapyStatus = 'Active' | 'Inactive' | 'None';

type FormValues = {
  hasPriorDiagnosis: boolean;
  providerName: string;
  providerSpecialty: string;
  providerClinic: string;
  psychotherapyStatus: PsychotherapyStatus | '';
};

const PSYCHOTHERAPY_OPTIONS = [
  { label: 'Active (Currently attending)', value: 'Active' },
  { label: 'Inactive (Past therapy)', value: 'Inactive' },
  { label: 'None', value: 'None' },
];

export default function MentalHealthScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const navigation = useNavigation();
  const headerHeight = useSafeHeaderHeight();
  const [saving, setSaving] = useState(false);
  const [therapyModal, setTherapyModal] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { hasPriorDiagnosis: false, providerName: '', providerSpecialty: '', providerClinic: '', psychotherapyStatus: '' },
  });

  const [hasRecord, setHasRecord] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = await db.query.patientMentalHealthProfile.findFirst({
        where: eq(patientMentalHealthProfile.patientId, patientId),
      });
      if (row) {
        setHasRecord(true);
        reset({
          hasPriorDiagnosis: row.hasPriorDiagnosis ?? false,
          providerName: row.providerName ?? '',
          providerSpecialty: row.providerSpecialty ?? '',
          providerClinic: row.providerClinic ?? '',
          psychotherapyStatus: (row.psychotherapyStatus as PsychotherapyStatus) ?? '',
        });
      }
    } catch (err) {
      console.warn('[MentalHealth] Failed to load from SQLite:', err);
    }
  }, [patientId, reset]);

  useEffect(() => {
    load();
  }, [load]);

  useProfileSync(load);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        patientId,
        hasPriorDiagnosis: data.hasPriorDiagnosis,
        providerName: data.providerName.trim() || null,
        providerSpecialty: data.providerSpecialty.trim() || null,
        providerClinic: data.providerClinic.trim() || null,
        psychotherapyStatus: data.psychotherapyStatus || null,
        updatedAt: new Date(),
      };
      if (hasRecord) {
        await db
          .update(patientMentalHealthProfile)
          .set(payload)
          .where(eq(patientMentalHealthProfile.patientId, patientId));
      } else {
        await db.insert(patientMentalHealthProfile).values({
          id: randomUUID(),
          ...payload,
          createdAt: new Date(),
        });
        setHasRecord(true);
      }

      const syncResult = await flushAndSyncProfile(patientId, getToken);

      if (syncResult.isOffline) {
        reset(data);
        dialog.alert('Saved Offline', 'Your mental health profile has been saved locally and will sync when you are back online.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else if (!syncResult.success && syncResult.failed > 0) {
        reset(data);
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        reset(data);
        dialog.alert('Saved', 'Your mental health profile has been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save mental health profile.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Screen width="form" scroll={false} padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[styles.content, { padding: spacing.md }]}
        >
          <ProfileSectionHeader title="Mental Health Profile" description="Confidential — visible only to your healthcare provider." />
          <Controller control={control} name="hasPriorDiagnosis" render={({ field }) => (
            <ProfileToggle label="Has Prior Mental Health Diagnosis" value={field.value} onValueChange={field.onChange} />
          )} />
          <ProfileSectionHeader title="Mental Health Provider" />
          <Controller control={control} name="providerName" render={({ field }) => (
            <ProfileFormField label="Provider Name" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
          )} />
          <Controller control={control} name="providerSpecialty" render={({ field }) => (
            <ProfileFormField label="Specialty" value={field.value} onChangeText={field.onChange} placeholder="e.g. Psychiatrist, Psychologist, Counselor" />
          )} />
          <Controller control={control} name="providerClinic" render={({ field }) => (
            <ProfileFormField label="Clinic / Hospital" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
          )} />
          <ProfileSectionHeader title="Psychotherapy" />
          <Controller control={control} name="psychotherapyStatus" render={({ field }) => (
            <ProfileFormField label="Psychotherapy Status" value={PSYCHOTHERAPY_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setTherapyModal(true)} placeholder="Select status" picker />
          )} />
        </ScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />
        <Controller control={control} name="psychotherapyStatus" render={({ field }) => (
          <ProfileSelectModal visible={therapyModal} title="Psychotherapy Status" options={PSYCHOTHERAPY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setTherapyModal(false)} />
        )} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 48 },
});
