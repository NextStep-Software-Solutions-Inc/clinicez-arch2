import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientPastIllnesses } from '@db/schema/patientPastIllnesses';
import { eq } from 'drizzle-orm';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';

type Form = { id: string | null; diagnosis: string; duration: string; complications: string; };
const EMPTY: Form = { id: null, diagnosis: '', duration: '', complications: '' };

export default function PastIllnessesScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientPastIllnesses).where(eq(patientPastIllnesses.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, diagnosis: row.diagnosis ?? '', duration: row.duration ?? '', complications: row.complications ?? '' });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientPastIllnesses).set({ deletedAt: new Date() }).where(eq(patientPastIllnesses.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      if (data.id) {
        await db.update(patientPastIllnesses).set({ ...data, updatedAt: new Date() }).where(eq(patientPastIllnesses.id, data.id));
      } else {
        await db.insert(patientPastIllnesses).values({ id: randomUUID(), patientId: patientId, ...data, createdAt: new Date(), updatedAt: new Date() });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Past Illnesses" description="Record previous diagnoses and illnesses." />
        {items.map((item) => (
          <ProfileListItemCard key={item.id} title={item.diagnosis} subtitle={item.duration} onEdit={() => openEdit(item)} onDelete={() => onDelete(item.id)} />
        ))}
        <ProfileAddButton label="Add Illness" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <BottomSheetModal ref={sheetRef} snapPoints={['45%', '70%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
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
        </ScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Illness" />
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
