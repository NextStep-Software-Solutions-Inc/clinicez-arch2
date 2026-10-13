import { useEffect, useState, useCallback } from 'react';
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
import { useProfileSync } from 'hooks/useProfileSync';
import { useSafeHeaderHeight } from 'hooks/useSafeHeaderHeight';

type FormValues = { hasVasectomy: boolean; vasectomyDate: string; conditions: string; };

export default function MaleReproductiveScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const navigation = useNavigation();
  const headerHeight = useSafeHeaderHeight();
  const [saving, setSaving] = useState(false);
  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { hasVasectomy: false, vasectomyDate: '', conditions: '' },
  });
  const hasVasectomy = watch('hasVasectomy');

  const [hasRecord, setHasRecord] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = await db.query.patientMaleReproductive.findFirst({
        where: eq(patientMaleReproductive.patientId, patientId),
      });
      if (row) {
        setHasRecord(true);
        reset({
          hasVasectomy: row.hasVasectomy ?? false,
          vasectomyDate: row.vasectomyDate ?? '',
          conditions: row.conditions ?? '',
        });
      }
    } catch (err) {
      console.warn('[MaleReproductive] Failed to load from SQLite:', err);
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
          ...payload,
          createdAt: new Date(),
        });
        setHasRecord(true);
      }

      const syncResult = await flushAndSyncProfile(patientId, getToken);

      if (syncResult.isOffline) {
        reset(data);
        dialog.alert('Saved Offline', 'Your reproductive health record has been saved locally and will sync when you are back online.', [
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
        dialog.alert('Saved', 'Your reproductive health record has been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save reproductive health record.');
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
  content: { paddingBottom: 48 },
});
