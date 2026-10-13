import { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientMedications } from '@db/schema/patientMedications';
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
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile, deleteProfileListItem } from 'services/api/syncService';
import { deletePatientMedication } from 'services/api/patientApi';
import { useProfileSync } from 'hooks/useProfileSync';

type MedForm = {
  id: string | null;
  drugName: string;
  dosage: string;
  dosageForm: string;
  frequency: string;
  prescribingPhysician: string;
  startDate: string;
  indication: string;
  isActive: boolean;
};

const EMPTY: MedForm = { id: null, drugName: '', dosage: '', dosageForm: '', frequency: '', prescribingPhysician: '', startDate: '', indication: '', isActive: true };

export default function MedicationsScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<MedForm>({ defaultValues: EMPTY });

  const load = useCallback(async () => {
    try {
      const rows = await db.select().from(patientMedications).where(eq(patientMedications.patientId, patientId));
      setItems(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[MedicationsScreen] Failed to load medications:', err);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  useProfileSync(load);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      drugName: row.drugName ?? '',
      dosage: row.dosage ?? '',
      dosageForm: row.dosageForm ?? '',
      frequency: row.frequency ?? '',
      prescribingPhysician: row.prescribingPhysician ?? '',
      startDate: row.startDate ?? '',
      indication: row.indication ?? '',
      isActive: row.isActive ?? true,
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, serverId?: string | null, drugName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Medication',
      message: `Are you sure you want to remove ${drugName || 'this medication'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProfileListItem({
        table: patientMedications,
        entityType: 'patient_medications',
        patientId,
        id,
        serverId,
        getToken,
        restDeleteFn: deletePatientMedication,
      });
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete medication.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      drugName: rest.drugName.trim(),
      dosage: rest.dosage.trim() || null,
      dosageForm: rest.dosageForm.trim() || null,
      frequency: rest.frequency.trim() || null,
      prescribingPhysician: rest.prescribingPhysician.trim() || null,
      startDate: rest.startDate || null,
      indication: rest.indication.trim() || null,
      isActive: rest.isActive,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientMedications).set(fields).where(eq(patientMedications.id, id));
      } else {
        await db.insert(patientMedications).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Medication saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Medication saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save medication.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Current & Past Medications" />
        {items.map((m) => (
          <ProfileListItemCard
            key={m.id}
            title={m.drugName}
            subtitle={[m.dosage, m.frequency].filter(Boolean).join(' · ')}
            badge={m.isActive ? 'Active' : 'Past'}
            onEdit={() => openEdit(m)}
            onDelete={() => onDelete(m.id, m.serverId, m.drugName)}
          />
        ))}
        <ProfileAddButton label="Add Medication" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['60%', '90%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Medication" />
          <Controller control={control} name="drugName" render={({ field }) => (
            <ProfileFormField label="Drug / Generic Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Metformin" />
          )} />
          <Controller control={control} name="dosage" render={({ field }) => (
            <ProfileFormField label="Dosage" value={field.value} onChangeText={field.onChange} placeholder="e.g. 500mg" />
          )} />
          <Controller control={control} name="dosageForm" render={({ field }) => (
            <ProfileFormField label="Dosage Form" value={field.value} onChangeText={field.onChange} placeholder="e.g. Tablet, Capsule, Syrup" />
          )} />
          <Controller control={control} name="frequency" render={({ field }) => (
            <ProfileFormField label="Frequency" value={field.value} onChangeText={field.onChange} placeholder="e.g. Twice daily with meals" />
          )} />
          <Controller control={control} name="prescribingPhysician" render={({ field }) => (
            <ProfileFormField label="Prescribing Physician" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
          )} />
          <Controller control={control} name="startDate" render={({ field }) => (
            <ProfileDatePicker label="Start Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="indication" render={({ field }) => (
            <ProfileFormField label="Indication / Purpose" value={field.value} onChangeText={field.onChange} multiline placeholder="Why is this medication taken?" />
          )} />
          <Controller control={control} name="isActive" render={({ field }) => (
            <ProfileToggle label="Currently Taking" value={field.value} onValueChange={field.onChange} />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Medication" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 40 },
});
