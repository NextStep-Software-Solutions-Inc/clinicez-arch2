import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientTravelHistory } from '@db/schema/patientTravelHistory';
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

type Form = { id: string | null; destination: string; country: string; departureDate: string; returnDate: string; purposeOfTravel: string; vaccinationsGiven: string; healthIssuesDuring: string; };
const EMPTY: Form = { id: null, destination: '', country: '', departureDate: '', returnDate: '', purposeOfTravel: '', vaccinationsGiven: '', healthIssuesDuring: '' };

export default function TravelHistoryScreen() {
  const patientId = usePatientId();
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModal>(null);
  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientTravelHistory).where(eq(patientTravelHistory.patientId, patientId));
    setItems(rows.filter((r) => !r.deletedAt));
  };
  useEffect(() => { load(); }, []);

  const openEdit = (row: any) => {
    reset({ id: row.id, destination: row.destination ?? '', country: row.country ?? '', departureDate: row.departureDate ?? '', returnDate: row.returnDate ?? '', purposeOfTravel: row.purposeOfTravel ?? '', vaccinationsGiven: row.vaccinationsGiven ?? '', healthIssuesDuring: row.healthIssuesDuring ?? '' });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientTravelHistory).set({ deletedAt: new Date() }).where(eq(patientTravelHistory.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      if (data.id) {
        await db.update(patientTravelHistory).set({ ...data, updatedAt: new Date() }).where(eq(patientTravelHistory.id, data.id));
      } else {
        await db.insert(patientTravelHistory).values({ id: randomUUID(), patientId: patientId, ...data, createdAt: new Date(), updatedAt: new Date() });
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

      <BottomSheetModal ref={sheetRef} snapPoints={['55%', '85%']} enablePanDownToClose keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Travel Trip" />
          <Controller control={control} name="destination" render={({ field }) => (
            <ProfileFormField label="Destination / City" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Bangkok" />
          )} />
          <Controller control={control} name="country" render={({ field }) => (
            <ProfileFormField label="Country" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Thailand" />
          )} />
          <Controller control={control} name="departureDate" render={({ field }) => (
            <ProfileDatePicker label="Departure Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="returnDate" render={({ field }) => (
            <ProfileDatePicker label="Return Date" value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="purposeOfTravel" render={({ field }) => (
            <ProfileFormField label="Purpose" value={field.value} onChangeText={field.onChange} placeholder="e.g. Tourism, Business" />
          )} />
          <Controller control={control} name="vaccinationsGiven" render={({ field }) => (
            <ProfileFormField label="Vaccinations Before / During" value={field.value} onChangeText={field.onChange} placeholder="e.g. Typhoid, Hepatitis A" />
          )} />
          <Controller control={control} name="healthIssuesDuring" render={({ field }) => (
            <ProfileFormField label="Health Issues During Travel" value={field.value} onChangeText={field.onChange} multiline placeholder="None, or describe" />
          )} />
        </ScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Trip" />
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
