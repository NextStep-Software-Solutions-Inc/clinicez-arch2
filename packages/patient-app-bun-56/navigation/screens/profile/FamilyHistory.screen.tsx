import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientFamilyHistory } from '@db/schema/patientFamilyHistory';
import { eq } from 'drizzle-orm';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileToggle from 'components/profile/ProfileToggle';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';

type Form = {
  id: string | null;
  condition: string;
  affectedRelative: string;
  side: string;
  ageOfOnset: string;
  isDeceased: boolean;
  ageAtDeath: string;
  causeOfDeath: string;
  notes: string;
};
const EMPTY: Form = { id: null, condition: '', affectedRelative: '', side: '', ageOfOnset: '', isDeceased: false, ageAtDeath: '', causeOfDeath: '', notes: '' };

const SIDE_OPTIONS = [
  { label: 'Paternal', value: 'Paternal' },
  { label: 'Maternal', value: 'Maternal' },
  { label: 'Both', value: 'Both' },
  { label: 'Unknown', value: 'Unknown' },
];

export default function FamilyHistoryScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [sideModal, setSideModal] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });
  const isDeceased = watch('isDeceased');

  const load = async () => {
    const rows = await db.select().from(patientFamilyHistory).where(eq(patientFamilyHistory.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, condition: row.condition ?? '', affectedRelative: row.affectedRelative ?? '', side: row.side ?? '', ageOfOnset: row.ageOfOnset?.toString() ?? '', isDeceased: row.isDeceased ?? false, ageAtDeath: row.ageAtDeath?.toString() ?? '', causeOfDeath: row.causeOfDeath ?? '', notes: row.notes ?? '' });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientFamilyHistory).set({ deletedAt: new Date() }).where(eq(patientFamilyHistory.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = { ...data, ageOfOnset: data.ageOfOnset ? parseInt(data.ageOfOnset) : null, ageAtDeath: data.ageAtDeath ? parseInt(data.ageAtDeath) : null };
      if (data.id) {
        await db.update(patientFamilyHistory).set({ ...payload, updatedAt: new Date() }).where(eq(patientFamilyHistory.id, data.id));
      } else {
        await db.insert(patientFamilyHistory).values({ id: randomUUID(), patientId: patientId, ...payload, createdAt: new Date(), updatedAt: new Date() });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Family Health History" description="Hereditary conditions in your immediate family." />
        {items.map((item) => (
          <ProfileListItemCard key={item.id} title={item.condition} subtitle={[item.affectedRelative, item.side].filter(Boolean).join(' · ')} onEdit={() => openEdit(item)} onDelete={() => onDelete(item.id)} />
        ))}
        <ProfileAddButton label="Add Family Condition" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <BottomSheetModal ref={sheetRef} snapPoints={['60%', '85%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Family Health Condition" />
          <Controller control={control} name="condition" render={({ field }) => (
            <ProfileFormField label="Condition / Disease" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Hypertension, Diabetes" />
          )} />
          <Controller control={control} name="affectedRelative" render={({ field }) => (
            <ProfileFormField label="Affected Relative" value={field.value} onChangeText={field.onChange} placeholder="e.g. Father, Mother, Sibling" />
          )} />
          <Controller control={control} name="side" render={({ field }) => (
            <ProfileFormField label="Family Side" value={SIDE_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setSideModal(true)} placeholder="Select side" />
          )} />
          <Controller control={control} name="ageOfOnset" render={({ field }) => (
            <ProfileFormField label="Age of Onset" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="Optional" />
          )} />
          <Controller control={control} name="isDeceased" render={({ field }) => (
            <ProfileToggle label="Relative is Deceased" value={field.value} onValueChange={field.onChange} />
          )} />
          {isDeceased && (
            <>
              <Controller control={control} name="ageAtDeath" render={({ field }) => (
                <ProfileFormField label="Age at Death" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="Optional" />
              )} />
              <Controller control={control} name="causeOfDeath" render={({ field }) => (
                <ProfileFormField label="Cause of Death" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
              )} />
            </>
          )}
          <Controller control={control} name="notes" render={({ field }) => (
            <ProfileFormField label="Additional Notes" value={field.value} onChangeText={field.onChange} multiline placeholder="Optional" />
          )} />
        </ScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Entry" />
        <Controller control={control} name="side" render={({ field }) => (
          <ProfileSelectModal visible={sideModal} title="Family Side" options={SIDE_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setSideModal(false)} />
        )} />
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
