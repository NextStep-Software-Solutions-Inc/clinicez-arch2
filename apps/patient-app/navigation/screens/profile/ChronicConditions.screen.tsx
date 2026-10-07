import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientChronicConditions } from '@db/schema/patientChronicConditions';
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
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';

type Form = { id: string | null; diagnosis: string; controlStatus: string; monitoringFrequency: string; };
const EMPTY: Form = { id: null, diagnosis: '', controlStatus: '', monitoringFrequency: '' };

export default function ChronicConditionsScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    try {
      const rows = await db.select().from(patientChronicConditions).where(eq(patientChronicConditions.patientId, patientId));
      setItems(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[ChronicConditionsScreen] Failed to load conditions:', err);
    }
  };

  useEffect(() => { load(); }, [patientId]);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      diagnosis: row.diagnosis ?? '',
      controlStatus: row.controlStatus ?? '',
      monitoringFrequency: row.monitoringFrequency ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, diagnosisName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Condition',
      message: `Are you sure you want to remove ${diagnosisName || 'this condition'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await db.update(patientChronicConditions).set({ deletedAt: new Date() }).where(eq(patientChronicConditions.id, id));
      await flushAndSyncProfile(patientId, getToken);
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete condition.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      diagnosis: rest.diagnosis.trim(),
      controlStatus: rest.controlStatus.trim() || null,
      monitoringFrequency: rest.monitoringFrequency.trim() || null,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientChronicConditions).set(fields).where(eq(patientChronicConditions.id, id));
      } else {
        await db.insert(patientChronicConditions).values({ id: randomUUID(), patientId, ...fields, createdAt: new Date() });
      }
      await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();
      dialog.alert('Saved', 'Chronic condition saved successfully.');
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save condition.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Chronic Conditions" description="Long-term conditions requiring ongoing management." />
        {items.map((item) => (
          <ProfileListItemCard
            key={item.id}
            title={item.diagnosis}
            subtitle={[item.controlStatus, item.monitoringFrequency].filter(Boolean).join(' · ')}
            onEdit={() => openEdit(item)}
            onDelete={() => onDelete(item.id, item.diagnosis)}
          />
        ))}
        <ProfileAddButton label="Add Condition" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['45%', '70%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Chronic Condition" />
          <Controller control={control} name="diagnosis" render={({ field }) => (
            <ProfileFormField label="Diagnosis" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Type 2 Diabetes" />
          )} />
          <Controller control={control} name="controlStatus" render={({ field }) => (
            <ProfileFormField label="Control Status" value={field.value} onChangeText={field.onChange} placeholder="e.g. Controlled, Uncontrolled" />
          )} />
          <Controller control={control} name="monitoringFrequency" render={({ field }) => (
            <ProfileFormField label="Monitoring Frequency" value={field.value} onChangeText={field.onChange} placeholder="e.g. Monthly check-up" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Condition" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
