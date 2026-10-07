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
import { addToSyncQueue } from 'services/api/syncService';

type Form = { id: string | null; vaccineName: string; doseNumber: string; lotNumber: string; date: string; administeredBy: string; };
const EMPTY: Form = { id: null, vaccineName: '', doseNumber: '', lotNumber: '', date: '', administeredBy: '' };

export default function ImmunizationsSelfScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientImmunizationsSelf).where(eq(patientImmunizationsSelf.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, vaccineName: row.vaccineName ?? '', doseNumber: row.doseNumber ?? '', lotNumber: row.lotNumber ?? '', date: row.date ?? '', administeredBy: row.administeredBy ?? '' });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientImmunizationsSelf).set({ deletedAt: new Date() }).where(eq(patientImmunizationsSelf.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    try {
      if (id) {
        await db.update(patientImmunizationsSelf).set({ ...rest, updatedAt: new Date() }).where(eq(patientImmunizationsSelf.id, id));
        await addToSyncQueue('patient_immunizations_self', id, 'update', { ...rest, patientId, id });
      } else {
        const newId = randomUUID();
        await db.insert(patientImmunizationsSelf).values({ id: newId, patientId, ...rest, createdAt: new Date(), updatedAt: new Date() });
        await addToSyncQueue('patient_immunizations_self', newId, 'create', { ...rest, patientId, id: newId });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Self-Reported Immunizations" description="Vaccines you have received, reported by you." />
        {items.map((item) => (
          <ProfileListItemCard key={item.id} title={item.vaccineName} subtitle={[item.doseNumber ? `Dose ${item.doseNumber}` : '', item.date].filter(Boolean).join(' · ')} onEdit={() => openEdit(item)} onDelete={() => onDelete(item.id)} />
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
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
