import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientDisabilities } from '@db/schema/patientDisabilities';
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
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';

type Form = { id: string | null; bodyPart: string; classification: string; isPwdCertified: boolean; };
const EMPTY: Form = { id: null, bodyPart: '', classification: '', isPwdCertified: false };

export default function DisabilitiesScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    try {
      const rows = await db.select().from(patientDisabilities).where(eq(patientDisabilities.patientId, patientId));
      setItems(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[DisabilitiesScreen] Failed to load disabilities:', err);
    }
  };

  useEffect(() => { load(); }, [patientId]);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      bodyPart: row.bodyPart ?? '',
      classification: row.classification ?? '',
      isPwdCertified: row.isPwdCertified ?? false,
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, classificationName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Disability',
      message: `Are you sure you want to remove ${classificationName || 'this record'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await db.update(patientDisabilities).set({ deletedAt: new Date() }).where(eq(patientDisabilities.id, id));
      await flushAndSyncProfile(patientId, getToken);
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete disability record.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      bodyPart: rest.bodyPart.trim() || null,
      classification: rest.classification.trim(),
      isPwdCertified: rest.isPwdCertified,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientDisabilities).set(fields).where(eq(patientDisabilities.id, id));
      } else {
        await db.insert(patientDisabilities).values({ id: randomUUID(), patientId, ...fields, createdAt: new Date() });
      }
      await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();
      dialog.alert('Saved', 'Disability record saved successfully.');
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save disability record.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Disabilities" description="Physical, sensory, or mental disabilities." />
        {items.map((item) => (
          <ProfileListItemCard
            key={item.id}
            title={item.classification || 'Disability'}
            subtitle={item.bodyPart}
            badge={item.isPwdCertified ? 'PWD Certified' : undefined}
            onEdit={() => openEdit(item)}
            onDelete={() => onDelete(item.id, item.classification)}
          />
        ))}
        <ProfileAddButton label="Add Disability" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['40%', '60%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Disability" />
          <Controller control={control} name="classification" render={({ field }) => (
            <ProfileFormField label="Classification" value={field.value} onChangeText={field.onChange} placeholder="e.g. Physical, Visual, Hearing" required />
          )} />
          <Controller control={control} name="bodyPart" render={({ field }) => (
            <ProfileFormField label="Affected Body Part / Area" value={field.value} onChangeText={field.onChange} placeholder="e.g. Left arm, Both eyes" />
          )} />
          <Controller control={control} name="isPwdCertified" render={({ field }) => (
            <ProfileToggle label="PWD Certified" value={field.value} onValueChange={field.onChange} />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Disability" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
