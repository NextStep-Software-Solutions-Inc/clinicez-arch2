import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientFamilyHistory } from '@db/schema/patientFamilyHistory';
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
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';
import { getPatientFullRecord } from 'services/api/patientApi';
import { hydrateFullRecord } from '@db/hydrate';
import ThemedBottomSheetModal from '@ui/ThemedBottomSheetModal';

type FamilySide = 'Paternal' | 'Maternal' | 'Both' | 'Unknown';

type Form = {
  id: string | null;
  condition: string;
  affectedRelative: string;
  side: FamilySide | '';
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
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [sideModal, setSideModal] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });
  const isDeceased = watch('isDeceased');

  const load = async () => {
    try {
      let rows = await db.select().from(patientFamilyHistory).where(eq(patientFamilyHistory.patientId, patientId));
      let active = rows.filter((r) => !r.deletedAt);
      if (active.length === 0 && getToken && patientId) {
        try {
          const fullRecord = await getPatientFullRecord(getToken, patientId);
          if (fullRecord) {
            await hydrateFullRecord(fullRecord);
            rows = await db.select().from(patientFamilyHistory).where(eq(patientFamilyHistory.patientId, patientId));
            active = rows.filter((r) => !r.deletedAt);
          }
        } catch (fetchErr) {
          console.warn('[FamilyHistoryScreen] Could not hydrate from server:', fetchErr);
        }
      }
      setItems(active);
    } catch (err) {
      console.warn('[FamilyHistoryScreen] Failed to load family history:', err);
    }
  };

  useEffect(() => { load(); }, [patientId, getToken]);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      condition: row.condition ?? '',
      affectedRelative: row.affectedRelative ?? '',
      side: (row.side as FamilySide) ?? '',
      ageOfOnset: row.ageOfOnset?.toString() ?? '',
      isDeceased: row.isDeceased ?? false,
      ageAtDeath: row.ageAtDeath?.toString() ?? '',
      causeOfDeath: row.causeOfDeath ?? '',
      notes: row.notes ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, conditionName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Family Condition',
      message: `Are you sure you want to remove ${conditionName || 'this record'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await db.update(patientFamilyHistory).set({ deletedAt: new Date(), patientId }).where(eq(patientFamilyHistory.id, id));
      await flushAndSyncProfile(patientId, getToken);
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete record.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      condition: rest.condition.trim(),
      affectedRelative: rest.affectedRelative.trim() || null,
      side: rest.side || null,
      ageOfOnset: data.ageOfOnset ? parseInt(data.ageOfOnset, 10) : null,
      isDeceased: rest.isDeceased,
      ageAtDeath: data.ageAtDeath ? parseInt(data.ageAtDeath, 10) : null,
      causeOfDeath: rest.causeOfDeath.trim() || null,
      notes: rest.notes.trim() || null,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientFamilyHistory).set(fields).where(eq(patientFamilyHistory.id, id));
      } else {
        await db.insert(patientFamilyHistory).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Family health condition saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Family health condition saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Family Health History" description="Hereditary conditions in your immediate family." />
        {items.map((item) => (
          <ProfileListItemCard
            key={item.id}
            title={item.condition}
            subtitle={[item.affectedRelative, item.side].filter(Boolean).join(' · ')}
            onEdit={() => openEdit(item)}
            onDelete={() => onDelete(item.id, item.condition)}
          />
        ))}
        <ProfileAddButton label="Add Family Condition" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['60%', '85%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Family Health Condition" />
          <Controller control={control} name="condition" render={({ field }) => (
            <ProfileFormField label="Condition / Disease" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Hypertension, Diabetes" />
          )} />
          <Controller control={control} name="affectedRelative" render={({ field }) => (
            <ProfileFormField label="Affected Relative" value={field.value} onChangeText={field.onChange} placeholder="e.g. Father, Mother, Sibling" />
          )} />
          <Controller control={control} name="side" render={({ field }) => (
            <ProfileFormField label="Family Side" value={SIDE_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setSideModal(true)} placeholder="Select side" picker />
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
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Entry" />
      </ThemedBottomSheetModal>

      <Controller control={control} name="side" render={({ field }) => (
        <ProfileSelectModal visible={sideModal} title="Family Side" options={SIDE_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setSideModal(false)} />
      )} />
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
