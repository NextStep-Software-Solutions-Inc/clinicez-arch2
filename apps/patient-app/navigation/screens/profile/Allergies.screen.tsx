import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientAllergies } from '@db/schema/patientAllergies';
import { eq } from 'drizzle-orm';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import BottomSheetScrollView from '@ui/ThemedBottomSheetScrollView';
import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileToggle from 'components/profile/ProfileToggle';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import ThemedBottomSheetModal from '@ui/ThemedBottomSheetModal';

type AllergySeverity = 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';

type AllergyForm = {
  id: string | null;
  allergen: string;
  reactionType: string;
  severity: AllergySeverity | '';
  management: string;
  isActive: boolean;
};

const EMPTY: AllergyForm = { id: null, allergen: '', reactionType: '', severity: '', management: '', isActive: true };

const SEVERITY_OPTIONS = [
  { label: 'Mild', value: 'Mild' },
  { label: 'Moderate', value: 'Moderate' },
  { label: 'Severe', value: 'Severe' },
  { label: 'Life Threatening', value: 'LifeThreatening' },
];

export default function AllergiesScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [severityModal, setSeverityModal] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<AllergyForm>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientAllergies).where(eq(patientAllergies.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };

  useEffect(() => { load(); }, [patientId]);

  const openEdit = (row: any) => {
    reset({ id: row.id, allergen: row.allergen ?? '', reactionType: row.reactionType ?? '', severity: row.severity ?? '', management: row.management ?? '', isActive: row.isActive ?? true });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientAllergies).set({ deletedAt: new Date() }).where(eq(patientAllergies.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    try {
      const payload = {
        ...rest,
        severity: rest.severity || null,
        updatedAt: new Date(),
      };
      if (id) {
        await db.update(patientAllergies).set(payload).where(eq(patientAllergies.id, id));
      } else {
        await db.insert(patientAllergies).values({
          id: randomUUID(),
          patientId,
          ...payload,
          createdAt: new Date(),
        });
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
        <ProfileSectionHeader title="Known Allergies" description="List all known drug, food, and environmental allergies." />
        {items.map((a) => (
          <ProfileListItemCard
            key={a.id}
            title={a.allergen}
            subtitle={[a.severity, a.reactionType].filter(Boolean).join(' · ')}
            badge={a.isActive ? 'Active' : 'Inactive'}
            onEdit={() => openEdit(a)}
            onDelete={() => onDelete(a.id)}
          />
        ))}
        <ProfileAddButton label="Add Allergy" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['55%', '80%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Allergy" />
          <Controller control={control} name="allergen" render={({ field }) => (
            <ProfileFormField label="Allergen" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Penicillin, Peanuts, Dust" />
          )} />
          <Controller control={control} name="reactionType" render={({ field }) => (
            <ProfileFormField label="Reaction Type" value={field.value} onChangeText={field.onChange} placeholder="e.g. Rash, Anaphylaxis" />
          )} />
          <Controller control={control} name="severity" render={({ field }) => (
            <ProfileFormField label="Severity" value={SEVERITY_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setSeverityModal(true)} placeholder="Select severity" />
          )} />
          <Controller control={control} name="management" render={({ field }) => (
            <ProfileFormField label="Management / Notes" value={field.value} onChangeText={field.onChange} multiline placeholder="e.g. Carry EpiPen" />
          )} />
          <Controller control={control} name="isActive" render={({ field }) => (
            <ProfileToggle label="Currently Active" value={field.value} onValueChange={field.onChange} />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Allergy" />
        <Controller control={control} name="severity" render={({ field }) => (
          <ProfileSelectModal visible={severityModal} title="Severity" options={SEVERITY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setSeverityModal(false)} />
        )} />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
