import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientTravelHistory } from '@db/schema/patientTravelHistory';
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
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';
import { getPatientFullRecord } from 'services/api/patientApi';
import { hydrateFullRecord } from '@db/hydrate';

type Form = { id: string | null; destination: string; cityProvince: string; departureDate: string; returnDate: string; purpose: string; illnessDuringAfterTravel: string; };
const EMPTY: Form = { id: null, destination: '', cityProvince: '', departureDate: '', returnDate: '', purpose: '', illnessDuringAfterTravel: '' };

export default function TravelHistoryScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    try {
      let rows = await db.select().from(patientTravelHistory).where(eq(patientTravelHistory.patientId, patientId));
      let active = rows.filter((r) => !r.deletedAt);
      if (active.length === 0 && getToken && patientId) {
        try {
          const fullRecord = await getPatientFullRecord(getToken, patientId);
          if (fullRecord) {
            await hydrateFullRecord(fullRecord);
            rows = await db.select().from(patientTravelHistory).where(eq(patientTravelHistory.patientId, patientId));
            active = rows.filter((r) => !r.deletedAt);
          }
        } catch (fetchErr) {
          console.warn('[TravelHistoryScreen] Could not hydrate from server:', fetchErr);
        }
      }
      setItems(active);
    } catch (err) {
      console.warn('[TravelHistoryScreen] Failed to load travel history:', err);
    }
  };

  useEffect(() => { load(); }, [patientId, getToken]);

  const openEdit = (row: any) => {
    reset({
      id: row.id,
      destination: row.destination ?? '',
      cityProvince: row.cityProvince ?? '',
      departureDate: row.departureDate ?? '',
      returnDate: row.returnDate ?? '',
      purpose: row.purpose ?? '',
      illnessDuringAfterTravel: row.illnessDuringAfterTravel ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, destinationName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Travel Record',
      message: `Are you sure you want to remove ${destinationName || 'this trip'}?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await db.update(patientTravelHistory).set({ deletedAt: new Date(), patientId }).where(eq(patientTravelHistory.id, id));
      await flushAndSyncProfile(patientId, getToken);
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete travel record.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      destination: rest.destination.trim(),
      cityProvince: rest.cityProvince.trim() || null,
      departureDate: rest.departureDate || null,
      returnDate: rest.returnDate || null,
      purpose: (rest.purpose.trim() as any) || 'Other',
      illnessDuringAfterTravel: rest.illnessDuringAfterTravel.trim() || null,
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientTravelHistory).set(fields).where(eq(patientTravelHistory.id, id));
      } else {
        await db.insert(patientTravelHistory).values({ id: randomUUID(), ...fields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Travel record saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Travel record saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save travel record.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Travel History" description="Recent international or domestic travel." />
        {items.map((item) => (
          <ProfileListItemCard
            key={item.id}
            title={[item.destination, item.cityProvince].filter(Boolean).join(', ')}
            subtitle={[item.departureDate, item.returnDate].filter(Boolean).join(' – ')}
            onEdit={() => openEdit(item)}
            onDelete={() => onDelete(item.id, item.destination)}
          />
        ))}
        <ProfileAddButton label="Add Trip" onPress={() => { reset(EMPTY); sheetRef.current?.present(); }} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['55%', '85%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Travel Trip" />
          <Controller control={control} name="destination" render={({ field }) => (
            <ProfileFormField label="Destination / City" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Bangkok" />
          )} />
          <Controller control={control} name="cityProvince" render={({ field }) => (
            <ProfileFormField label="Country / Province" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Thailand" />
          )} />
          <Controller control={control} name="departureDate" render={({ field }) => (
            <ProfileDatePicker label="Departure Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="returnDate" render={({ field }) => (
            <ProfileDatePicker label="Return Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="purpose" render={({ field }) => (
            <ProfileFormField label="Purpose" value={field.value} onChangeText={field.onChange} placeholder="e.g. Tourism, Business" />
          )} />
          <Controller control={control} name="illnessDuringAfterTravel" render={({ field }) => (
            <ProfileFormField label="Health Issues During Travel" value={field.value} onChangeText={field.onChange} multiline placeholder="None, or describe" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Trip" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
