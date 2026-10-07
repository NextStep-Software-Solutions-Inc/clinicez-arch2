import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientImmunizationsSelf } from '@db/schema/patientImmunizationsSelf';
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
import { flushAndSyncProfile } from 'services/api/syncService';
import { getPatientFullRecord } from 'services/api/patientApi';
import { hydrateFullRecord } from '@db/hydrate';

type Form = { id: string | null; vaccineName: string; doseNumber: string; lotNumber: string; date: string; administeredBy: string; };
const EMPTY: Form = { id: null, vaccineName: '', doseNumber: '', lotNumber: '', date: '', administeredBy: '' };

export default function ImmunizationsSelfScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    try {
      let rows = await db.select().from(patientImmunizationsSelf).where(eq(patientImmunizationsSelf.patientId, patientId));
      let active = rows.filter((r) => !r.deletedAt);
      if (active.length === 0 && getToken && patientId) {
        try {
          const fullRecord = await getPatientFullRecord(getToken, patientId);
          if (fullRecord) {
            await hydrateFullRecord(fullRecord);
            rows = await db.select().from(patientImmunizationsSelf).where(eq(patientImmunizationsSelf.patientId, patientId));
            active = rows.filter((r) => !r.deletedAt);
          }
        } catch (fetchErr) {
          console.warn('[ImmunizationsSelfScreen] Could not hydrate from server:', fetchErr);
        }
      }
      setItems(active);
    } catch (err) {
      console.warn('[ImmunizationsSelfScreen] Failed to load immunizations:', err);
    }
  };

  useEffect(() => { load(); }, [patientId, getToken]);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      vaccineName: row.vaccineName ?? '',
      doseNumber: row.doseNumber?.toString() ?? '',
      lotNumber: row.lotNumber ?? '',
      date: row.date ?? '',
      administeredBy: row.administeredBy ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, vaccineName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Immunization',
      message: `Are you sure you want to remove ${vaccineName || 'this record'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await db.update(patientImmunizationsSelf).set({ deletedAt: new Date(), patientId }).where(eq(patientImmunizationsSelf.id, id));
      await flushAndSyncProfile(patientId, getToken);
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete immunization record.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      vaccineName: rest.vaccineName.trim(),
      doseNumber: rest.doseNumber.trim() || null,
      lotNumber: rest.lotNumber.trim() || null,
      date: rest.date || null,
      administeredBy: rest.administeredBy.trim() || null,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientImmunizationsSelf).set(fields).where(eq(patientImmunizationsSelf.id, id));
      } else {
        await db.insert(patientImmunizationsSelf).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Immunization record saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Immunization record saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save immunization record.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Self-Reported Immunizations" description="Vaccines you have received, reported by you." />
        {items.map((item) => (
          <ProfileListItemCard
            key={item.id}
            title={item.vaccineName}
            subtitle={[item.doseNumber ? `Dose ${item.doseNumber}` : '', item.date].filter(Boolean).join(' · ')}
            onEdit={() => openEdit(item)}
            onDelete={() => onDelete(item.id, item.vaccineName)}
          />
        ))}
        <ProfileAddButton label="Add Vaccine" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['50%', '75%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Vaccine / Immunization" />
          <Controller control={control} name="vaccineName" render={({ field }) => (
            <ProfileFormField label="Vaccine Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. COVID-19 (Pfizer), Influenza" />
          )} />
          <Controller control={control} name="doseNumber" render={({ field }) => (
            <ProfileFormField label="Dose Number" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="e.g. 1, 2, Booster" />
          )} />
          <Controller control={control} name="date" render={({ field }) => (
            <ProfileDatePicker label="Date Administered" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="administeredBy" render={({ field }) => (
            <ProfileFormField label="Administered By" value={field.value} onChangeText={field.onChange} placeholder="Doctor or facility name" />
          )} />
          <Controller control={control} name="lotNumber" render={({ field }) => (
            <ProfileFormField label="Lot / Batch Number" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Vaccine" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
