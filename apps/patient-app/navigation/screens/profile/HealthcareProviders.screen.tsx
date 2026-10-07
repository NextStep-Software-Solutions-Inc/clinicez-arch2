import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientHealthcareProviders } from '@db/schema/patientHealthcareProviders';
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
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { addToSyncQueue } from 'services/api/syncService';


type ProviderForm = {
  id: string | null;
  providerType: 'primary_care' | 'specialist_1' | 'specialist_2';
  name: string;
  specialty: string;
  clinicHospital: string;
  phone: string;
};

const EMPTY: ProviderForm = {
  id: null, providerType: 'primary_care', name: '', specialty: '', clinicHospital: '', phone: '',
};

const PROVIDER_TYPE_OPTIONS = [
  { label: 'Primary Care Physician', value: 'primary_care' },
  { label: 'Specialist 1', value: 'specialist_1' },
  { label: 'Specialist 2', value: 'specialist_2' },
];

export default function HealthcareProvidersScreen() {
  const patientId = usePatientId();
  const [providers, setProviders] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<ProviderForm>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(patientHealthcareProviders).where(eq(patientHealthcareProviders.patientId, patientId));
    setProviders(rows.filter((r) => !r.deletedAt));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { reset(EMPTY); sheetRef.current?.present(); };
  const openEdit = (row: any) => {
    reset({ id: row.id, providerType: row.providerType ?? 'primary_care', name: row.name ?? '', specialty: row.specialty ?? '', clinicHospital: row.clinicHospital ?? '', phone: row.phone ?? '' });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientHealthcareProviders).set({ deletedAt: new Date() }).where(eq(patientHealthcareProviders.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    try {
      if (id) {
        await db.update(patientHealthcareProviders).set({ ...rest, updatedAt: new Date() }).where(eq(patientHealthcareProviders.id, id));
        await addToSyncQueue('patient_healthcare_providers', id, 'update', { ...rest, patientId, id });
      } else {
        const newId = randomUUID();
        await db.insert(patientHealthcareProviders).values({ id: newId, patientId, ...rest, createdAt: new Date(), updatedAt: new Date() });
        await addToSyncQueue('patient_healthcare_providers', newId, 'create', { ...rest, patientId, id: newId });
      }
      sheetRef.current?.dismiss();
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  });

  const typeLabel = (val: string) => PROVIDER_TYPE_OPTIONS.find(o => o.value === val)?.label ?? val;

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ProfileSectionHeader title="Your Doctors" description="Add your primary care physician and specialists." />
        {providers.map((p) => (
          <ProfileListItemCard
            key={p.id}
            title={p.name || 'Provider'}
            subtitle={[p.specialty, p.clinicHospital].filter(Boolean).join(' · ')}
            badge={typeLabel(p.providerType)}
            onEdit={() => openEdit(p)}
            onDelete={() => onDelete(p.id)}
          />
        ))}
        <ProfileAddButton label="Add Provider" onPress={openAdd} />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['55%', '85%']} enablePanDownToClose
        keyboardBehavior="interactive" keyboardBlurBehavior="restore">
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Healthcare Provider" />
          <Controller control={control} name="providerType" render={({ field }) => (
            <ProfileFormField label="Provider Type" value={typeLabel(field.value)} onPressIn={() => setTypeModal(true)} />
          )} />
          <Controller control={control} name="name" render={({ field }) => (
            <ProfileFormField label="Doctor's Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Dr. Maria Santos" />
          )} />
          <Controller control={control} name="specialty" render={({ field }) => (
            <ProfileFormField label="Specialty" value={field.value} onChangeText={field.onChange} placeholder="e.g. Internal Medicine" />
          )} />
          <Controller control={control} name="clinicHospital" render={({ field }) => (
            <ProfileFormField label="Clinic / Hospital" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
          )} />
          <Controller control={control} name="phone" render={({ field }) => (
            <ProfileFormField label="Phone / Contact" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" placeholder="Optional" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Provider" />

        <Controller control={control} name="providerType" render={({ field }) => (
          <ProfileSelectModal visible={typeModal} title="Provider Type" options={PROVIDER_TYPE_OPTIONS}
            selected={field.value} onSelect={field.onChange} onClose={() => setTypeModal(false)} />
        )} />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
