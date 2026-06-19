import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientMaleReproductive } from '@db/schema/patientMaleReproductive';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import { usePatientId } from 'hooks/usePatientId';
import { addToSyncQueue } from 'services/api/syncService';

type FormValues = { hasVasectomy: boolean; vasectomyDate: string; conditions: string; };

export default function MaleReproductiveScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { hasVasectomy: false, vasectomyDate: '', conditions: '' },
  });
  const hasVasectomy = watch('hasVasectomy');

  useEffect(() => {
    db.query.patientMaleReproductive.findFirst({ where: eq(patientMaleReproductive.patientId, patientId) })
      .then((row) => {
        if (row) {
          reset({ hasVasectomy: row.hasVasectomy ?? false, vasectomyDate: row.vasectomyDate ?? '', conditions: row.conditions ?? '' });
        }
      })
      .catch(console.error);
  }, [reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = { ...data, updatedAt: new Date() };
      const result = await db.insert(patientMaleReproductive).values({ id: randomUUID(), patientId: patientId, ...payload, createdAt: new Date() }).onConflictDoUpdate({ target: patientMaleReproductive.patientId, set: payload }).returning({ id: patientMaleReproductive.id });
      const savedId = result[0]?.id ?? patientId;
      await addToSyncQueue('patient_male_reproductive', savedId, 'update', { ...payload, patientId, id: savedId });
      reset(data);
      navigation.goBack();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProfileSectionHeader title="Male Reproductive Health" />
        <Controller control={control} name="hasVasectomy" render={({ field }) => (
          <ProfileToggle label="Has Vasectomy" value={field.value} onValueChange={field.onChange} />
        )} />
        {hasVasectomy && (
          <Controller control={control} name="vasectomyDate" render={({ field }) => (
            <ProfileDatePicker label="Vasectomy Date" value={field.value} onChange={field.onChange} />
          )} />
        )}
        <Controller control={control} name="conditions" render={({ field }) => (
          <ProfileFormField label="Known Conditions / Notes" value={field.value} onChangeText={field.onChange} multiline placeholder="e.g. BPH, Varicocele, Prostate issues" />
        )} />
      </ScrollView>
      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 16, paddingBottom: 24 } });
