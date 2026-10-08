import { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientPastIllnesses } from '@db/schema/patientPastIllnesses';
import { eq } from 'drizzle-orm';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import BottomSheetScrollView from '@ui/ThemedBottomSheetScrollView';
import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import ThemedBottomSheetModal from '@ui/ThemedBottomSheetModal';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile, deleteProfileListItem } from 'services/api/syncService';
import { deletePatientPastIllness } from 'services/api/patientApi';
import { useProfileSync } from 'hooks/useProfileSync';

type Form = { id: string | null; diagnosis: string; duration: string; complications: string; };
const EMPTY: Form = { id: null, diagnosis: '', duration: '', complications: '' };

export default function PastIllnessesScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = useCallback(async () => {
    try {
      const rows = await db.select().from(patientPastIllnesses).where(eq(patientPastIllnesses.patientId, patientId));
      setItems(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[PastIllnessesScreen] Failed to load illnesses:', err);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  useProfileSync(load);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      diagnosis: row.diagnosis ?? '',
      duration: row.duration ?? '',
      complications: row.complications ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, serverId?: string | null, diagnosisName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Illness',
      message: `Are you sure you want to remove ${diagnosisName || 'this illness'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProfileListItem({
        table: patientPastIllnesses,
        entityType: 'patient_past_illnesses',
        patientId,
        id,
        serverId,
        getToken,
        restDeleteFn: deletePatientPastIllness,
      });
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete illness.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      diagnosis: rest.diagnosis.trim(),
      duration: rest.duration.trim() || null,
      complications: rest.complications.trim() || null,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientPastIllnesses).set(fields).where(eq(patientPastIllnesses.id, id));
      } else {
        await db.insert(patientPastIllnesses).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Past illness saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Past illness saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save illness.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Past Illnesses" description="Record previous diagnoses and illnesses." />
        {items.map((item) => (
          <ProfileListItemCard
            key={item.id}
            title={item.diagnosis}
            subtitle={item.duration}
            onEdit={() => openEdit(item)}
            onDelete={() => onDelete(item.id, item.serverId, item.diagnosis)}
          />
        ))}
        <ProfileAddButton label="Add Illness" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['45%', '70%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Past Illness" />
          <Controller control={control} name="diagnosis" render={({ field }) => (
            <ProfileFormField label="Diagnosis" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Typhoid Fever" />
          )} />
          <Controller control={control} name="duration" render={({ field }) => (
            <ProfileFormField label="Duration / Period" value={field.value} onChangeText={field.onChange} placeholder="e.g. 2 weeks in 2018" />
          )} />
          <Controller control={control} name="complications" render={({ field }) => (
            <ProfileFormField label="Complications" value={field.value} onChangeText={field.onChange} multiline placeholder="None, or describe" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Illness" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
