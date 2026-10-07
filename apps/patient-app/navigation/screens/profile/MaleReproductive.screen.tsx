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
import Screen from 'components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';

type FormValues = { hasVasectomy: boolean; vasectomyDate: string; conditions: string; };

export default function MaleReproductiveScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { hasVasectomy: false, vasectomyDate: '', conditions: '' },
  });
  const hasVasectomy = watch('hasVasectomy');

  const [hasRecord, setHasRecord] = useState(false);

  useEffect(() => {
    db.query.patientMaleReproductive.findFirst({ where: eq(patientMaleReproductive.patientId, patientId) })
      .then((row) => {
        if (row) {
          setHasRecord(true);
          reset({
            hasVasectomy: row.hasVasectomy ?? false,
            vasectomyDate: row.vasectomyDate ?? '',
            conditions: row.conditions ?? '',
          });
        }
      })
      .catch(console.error);
  }, [patientId, reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        hasVasectomy: data.hasVasectomy,
        vasectomyDate: data.hasVasectomy ? (data.vasectomyDate || null) : null,
        conditions: data.conditions.trim() || null,
        updatedAt: new Date(),
      };
      if (hasRecord) {
        await db
          .update(patientMaleReproductive)
          .set(payload)
          .where(eq(patientMaleReproductive.patientId, patientId));
      } else {
        await db.insert(patientMaleReproductive).values({
          id: randomUUID(),
          patientId,
          ...payload,
          createdAt: new Date(),
        });
        setHasRecord(true);
      }

      await flushAndSyncProfile(patientId, getToken);
      reset(data);
      dialog.alert('Saved', 'Your reproductive health record has been updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save reproductive health record.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Screen width="form" scroll={false} padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]} keyboardShouldPersistTaps="handled">
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24 },
});
