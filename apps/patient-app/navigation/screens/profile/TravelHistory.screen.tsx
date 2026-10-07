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
import { addToSyncQueue } from 'services/api/syncService';

// Form uses DB schema field names exactly: destination, cityProvince, departureDate, returnDate, purpose, illnessDuringAfterTravel
type Form = { id: string | null; destination: string; cityProvince: string; departureDate: string; returnDate: string; purpose: string; illnessDuringAfterTravel: string; };
const EMPTY: Form = { id: null, destination: '', cityProvince: '', departureDate: '', returnDate: '', purpose: '', illnessDuringAfterTravel: '' };

export default function TravelHistoryScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientTravelHistory).where(eq(patientTravelHistory.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, destination: row.destination ?? '', cityProvince: row.cityProvince ?? '', departureDate: row.departureDate ?? '', returnDate: row.returnDate ?? '', purpose: row.purpose ?? '', illnessDuringAfterTravel: row.illnessDuringAfterTravel ?? '' });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientTravelHistory).set({ deletedAt: new Date() }).where(eq(patientTravelHistory.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    try {
      if (id) {
        await db.update(patientTravelHistory).set({ ...rest, purpose: (rest.purpose as any) || 'Other', updatedAt: new Date() }).where(eq(patientTravelHistory.id, id));
        await addToSyncQueue('patient_travel_history', id, 'update', { ...rest, purpose: (rest.purpose as any) || 'Other', patientId, id });
      } else {
        const newId = randomUUID();
        await db.insert(patientTravelHistory).values({ id: newId, patientId, ...rest, purpose: (rest.purpose as any) || 'Other', createdAt: new Date(), updatedAt: new Date() });
        await addToSyncQueue('patient_travel_history', newId, 'create', { ...rest, purpose: (rest.purpose as any) || 'Other', patientId, id: newId });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Travel History" description="Recent international or domestic travel." />
        {items.map((item) => (
          <ProfileListItemCard key={item.id} title={[item.destination, item.country].filter(Boolean).join(', ')} subtitle={[item.departureDate, item.returnDate].filter(Boolean).join(' – ')} onEdit={() => openEdit(item)} onDelete={() => onDelete(item.id)} />
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
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
