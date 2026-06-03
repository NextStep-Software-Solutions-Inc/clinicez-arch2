import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientMedications } from '@db/schema/patientMedications';
import { eq } from 'drizzle-orm';
import { BottomSheetModal, BottomSheetModalProvider, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';


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
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<MedForm>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientMedications).where(eq(patientMedications.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, drugName: row.drugName ?? '', dosage: row.dosage ?? '', dosageForm: row.dosageForm ?? '', frequency: row.frequency ?? '', prescribingPhysician: row.prescribingPhysician ?? '', startDate: row.startDate ?? '', indication: row.indication ?? '', isActive: row.isActive ?? true });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientMedications).set({ deletedAt: new Date() }).where(eq(patientMedications.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    try {
      if (id) {
        await db.update(patientMedications).set({ ...rest, updatedAt: new Date() }).where(eq(patientMedications.id, id));
      } else {
        await db.insert(patientMedications).values({ id: randomUUID(), patientId, ...rest, createdAt: new Date(), updatedAt: new Date() });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Current & Past Medications" />
        {items.map((m) => (
          <ProfileListItemCard
            key={m.id}
            title={m.drugName}
            subtitle={[m.dosage, m.frequency].filter(Boolean).join(' · ')}
            badge={m.isActive ? 'Active' : 'Past'}
            onEdit={() => openEdit(m)}
            onDelete={() => onDelete(m.id)}
          />
        ))}
        <ProfileAddButton label="Add Medication" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <BottomSheetModal ref={sheetRef} snapPoints={['60%', '90%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
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
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
