import { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientSurgicalHistory } from '@db/schema/patientSurgicalHistory';
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
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile, deleteProfileListItem } from 'services/api/syncService';
import { deletePatientSurgicalHistory } from 'services/api/patientApi';
import { useProfileSync } from 'hooks/useProfileSync';

type SurgForm = { id: string | null; procedure: string; surgeon: string; facility: string; date: string; anesthesiaType: string; complications: string; };
const EMPTY: SurgForm = { id: null, procedure: '', surgeon: '', facility: '', date: '', anesthesiaType: '', complications: '' };

export default function SurgicalHistoryScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<SurgForm>({ defaultValues: EMPTY });

  const load = useCallback(async () => {
    try {
      const rows = await db.select().from(patientSurgicalHistory).where(eq(patientSurgicalHistory.patientId, patientId));
      setItems(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[SurgicalHistoryScreen] Failed to load records:', err);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  useProfileSync(load);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      procedure: row.procedure ?? '',
      surgeon: row.surgeon ?? '',
      facility: row.facility ?? '',
      date: row.date ?? '',
      anesthesiaType: row.anesthesiaType ?? '',
      complications: row.complications ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, serverId?: string | null, procedureName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Procedure',
      message: `Are you sure you want to remove ${procedureName || 'this procedure'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProfileListItem({
        table: patientSurgicalHistory,
        entityType: 'patient_surgical_history',
        patientId,
        id,
        serverId,
        getToken,
        restDeleteFn: deletePatientSurgicalHistory,
      });
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete procedure.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      procedure: rest.procedure.trim(),
      surgeon: rest.surgeon.trim() || null,
      facility: rest.facility.trim() || null,
      date: rest.date || null,
      anesthesiaType: rest.anesthesiaType.trim() || null,
      complications: rest.complications.trim() || null,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientSurgicalHistory).set(fields).where(eq(patientSurgicalHistory.id, id));
      } else {
        await db.insert(patientSurgicalHistory).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Procedure saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Procedure saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save procedure.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Surgical History" description="List all surgeries and procedures you have undergone." />
        {items.map((s) => (
          <ProfileListItemCard
            key={s.id}
            title={s.procedure}
            subtitle={[s.date, s.facility].filter(Boolean).join(' · ')}
            onEdit={() => openEdit(s)}
            onDelete={() => onDelete(s.id, s.serverId, s.procedure)}
          />
        ))}
        <ProfileAddButton label="Add Procedure" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['55%', '85%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Surgery / Procedure" />
          <Controller control={control} name="procedure" render={({ field }) => (
            <ProfileFormField label="Procedure Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Appendectomy" />
          )} />
          <Controller control={control} name="date" render={({ field }) => (
            <ProfileDatePicker label="Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="surgeon" render={({ field }) => (
            <ProfileFormField label="Surgeon" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
          )} />
          <Controller control={control} name="facility" render={({ field }) => (
            <ProfileFormField label="Facility / Hospital" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
          )} />
          <Controller control={control} name="anesthesiaType" render={({ field }) => (
            <ProfileFormField label="Anesthesia Type" value={field.value} onChangeText={field.onChange} placeholder="e.g. General, Spinal, Local" />
          )} />
          <Controller control={control} name="complications" render={({ field }) => (
            <ProfileFormField label="Complications" value={field.value} onChangeText={field.onChange} multiline placeholder="None, or describe" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Procedure" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 40 },
});
