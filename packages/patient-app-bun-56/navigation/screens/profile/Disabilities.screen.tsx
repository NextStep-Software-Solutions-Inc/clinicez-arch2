import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientDisabilities } from '@db/schema/patientDisabilities';
import { eq } from 'drizzle-orm';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileToggle from 'components/profile/ProfileToggle';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';

type Form = { id: string | null; bodyPart: string; classification: string; isPwdCertified: boolean; };
const EMPTY: Form = { id: null, bodyPart: '', classification: '', isPwdCertified: false };

export default function DisabilitiesScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientDisabilities).where(eq(patientDisabilities.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, bodyPart: row.bodyPart ?? '', classification: row.classification ?? '', isPwdCertified: row.isPwdCertified ?? false });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientDisabilities).set({ deletedAt: new Date() }).where(eq(patientDisabilities.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      if (data.id) {
        await db.update(patientDisabilities).set({ ...data, updatedAt: new Date() }).where(eq(patientDisabilities.id, data.id));
      } else {
        await db.insert(patientDisabilities).values({ id: randomUUID(), patientId: patientId, ...data, createdAt: new Date(), updatedAt: new Date() });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Disabilities" description="Physical, sensory, or mental disabilities." />
        {items.map((item) => (
          <ProfileListItemCard key={item.id} title={item.classification || 'Disability'} subtitle={item.bodyPart} badge={item.isPwdCertified ? 'PWD Certified' : undefined} onEdit={() => openEdit(item)} onDelete={() => onDelete(item.id)} />
        ))}
        <ProfileAddButton label="Add Disability" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <BottomSheetModal ref={sheetRef} snapPoints={['40%', '60%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Disability" />
          <Controller control={control} name="classification" render={({ field }) => (
            <ProfileFormField label="Classification" value={field.value} onChangeText={field.onChange} placeholder="e.g. Physical, Visual, Hearing" />
          )} />
          <Controller control={control} name="bodyPart" render={({ field }) => (
            <ProfileFormField label="Affected Body Part / Area" value={field.value} onChangeText={field.onChange} placeholder="e.g. Left arm, Both eyes" />
          )} />
          <Controller control={control} name="isPwdCertified" render={({ field }) => (
            <ProfileToggle label="PWD Certified" value={field.value} onValueChange={field.onChange} />
          )} />
        </ScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Disability" />
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
