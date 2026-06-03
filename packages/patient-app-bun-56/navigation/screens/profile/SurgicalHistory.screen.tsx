import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientSurgicalHistory } from '@db/schema/patientSurgicalHistory';
import { eq } from 'drizzle-orm';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';


type SurgForm = { id: string | null; procedure: string; surgeon: string; facility: string; date: string; anesthesiaType: string; complications: string; };
const EMPTY: SurgForm = { id: null, procedure: '', surgeon: '', facility: '', date: '', anesthesiaType: '', complications: '' };

export default function SurgicalHistoryScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<SurgForm>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientSurgicalHistory).where(eq(patientSurgicalHistory.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, procedure: row.procedure ?? '', surgeon: row.surgeon ?? '', facility: row.facility ?? '', date: row.date ?? '', anesthesiaType: row.anesthesiaType ?? '', complications: row.complications ?? '' });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientSurgicalHistory).set({ deletedAt: new Date() }).where(eq(patientSurgicalHistory.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      if (data.id) {
        await db.update(patientSurgicalHistory).set({ ...data, updatedAt: new Date() }).where(eq(patientSurgicalHistory.id, data.id));
      } else {
        await db.insert(patientSurgicalHistory).values({ id: randomUUID(), patientId: patientId, ...data, createdAt: new Date(), updatedAt: new Date() });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Surgical History" description="List all surgeries and procedures you have undergone." />
        {items.map((s) => (
          <ProfileListItemCard key={s.id} title={s.procedure} subtitle={[s.date, s.facility].filter(Boolean).join(' · ')} onEdit={() => openEdit(s)} onDelete={() => onDelete(s.id)} />
        ))}
        <ProfileAddButton label="Add Procedure" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <BottomSheetModal ref={sheetRef} snapPoints={['55%', '85%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
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
        </ScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Procedure" />
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
