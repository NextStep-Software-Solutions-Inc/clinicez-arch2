import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db } from '@db/index';
import { patientAddresses } from '@db/schema/patientAddresses';
import { eq, isNull } from 'drizzle-orm';
import { BottomSheetModal, BottomSheetModalProvider, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useForm, Controller } from 'react-hook-form';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import { randomUUID } from 'expo-crypto';
import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import { usePatientId } from 'hooks/usePatientId';


type AddressForm = {
  id: string | null;
  type: 'primary' | 'secondary';
  houseNo: string;
  streetBarangay: string;
  cityMunicipality: string;
  province: string;
  region: string;
  postalCode: string;
  country: string;
};

const TYPE_OPTIONS = [
  { label: 'Primary (Home)', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
];

const EMPTY_FORM: AddressForm = {
  id: null, type: 'primary' as const, houseNo: '', streetBarangay: '',
  cityMunicipality: '', province: '', region: '', postalCode: '', country: 'Philippines',
};

export default function AddressesScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [editing, setEditing] = useState<AddressForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<AddressForm>({ defaultValues: EMPTY_FORM });

  const load = async () => {
    const rows = await db.select().from(patientAddresses)
      .where(eq(patientAddresses.patientId, patientId));
    setAddresses(rows.filter((r) => !r.deletedAt));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    reset(EMPTY_FORM);
    setEditing(EMPTY_FORM);
    sheetRef.current?.present();
  };

  const openEdit = (row: any) => {
    const form: AddressForm = {
      id: row.id, type: row.type ?? 'primary',
      houseNo: row.houseNo ?? '', streetBarangay: row.streetBarangay ?? '',
      cityMunicipality: row.cityMunicipality ?? '', province: row.province ?? '',
      region: row.region ?? '', postalCode: row.postalCode ?? '',
      country: row.country ?? 'Philippines',
    };
    reset(form);
    setEditing(form);
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(patientAddresses).set({ deletedAt: new Date() }).where(eq(patientAddresses.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    try {
      if (id) {
        await db.update(patientAddresses).set({ ...rest, updatedAt: new Date() }).where(eq(patientAddresses.id, id));
      } else {
        await db.insert(patientAddresses).values({ id: randomUUID(), patientId, ...rest, createdAt: new Date(), updatedAt: new Date() });
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
        <ProfileSectionHeader title="Your Addresses" description="You can add a primary home address and a secondary address." />

        {addresses.map((a) => (
          <ProfileListItemCard
            key={a.id}
            title={[a.houseNo, a.streetBarangay].filter(Boolean).join(' ') || 'Address'}
            subtitle={[a.cityMunicipality, a.province].filter(Boolean).join(', ')}
            badge={a.type === 'primary' ? 'Primary' : 'Secondary'}
            onEdit={() => openEdit(a)}
            onDelete={() => onDelete(a.id)}
          />
        ))}

        <ProfileAddButton label="Add Address" onPress={openAdd} />
      </ScrollView>

      <BottomSheetModal 
        ref={sheetRef} 
        snapPoints={['70%', '90%']}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title={editing?.id ? 'Edit Address' : 'Add Address'} />
          <Controller control={control} name="type" render={({ field }) => (
            <ProfileFormField
              label="Address Type"
              value={TYPE_OPTIONS.find(o => o.value === field.value)?.label || ''}
              onPressIn={() => setTypeModal(true)}
              placeholder="Select type"
            />
          )} />
          <Controller control={control} name="houseNo" render={({ field }) => (
            <ProfileFormField label="House / Unit No. & Building" value={field.value} onChangeText={field.onChange} placeholder="e.g. 123 Block 4" />
          )} />
          <Controller control={control} name="streetBarangay" render={({ field }) => (
            <ProfileFormField label="Street / Barangay" value={field.value} onChangeText={field.onChange} placeholder="e.g. Brgy. San Isidro" />
          )} />
          <Controller control={control} name="cityMunicipality" render={({ field }) => (
            <ProfileFormField label="City / Municipality" value={field.value} onChangeText={field.onChange} required />
          )} />
          <Controller control={control} name="province" render={({ field }) => (
            <ProfileFormField label="Province" value={field.value} onChangeText={field.onChange} />
          )} />
          <Controller control={control} name="region" render={({ field }) => (
            <ProfileFormField label="Region" value={field.value} onChangeText={field.onChange} placeholder="e.g. Region III" />
          )} />
          <Controller control={control} name="postalCode" render={({ field }) => (
            <ProfileFormField label="Postal Code" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="4 digits" />
          )} />
          <Controller control={control} name="country" render={({ field }) => (
            <ProfileFormField label="Country" value={field.value} onChangeText={field.onChange} />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Address" />

        <Controller control={control} name="type" render={({ field }) => (
          <ProfileSelectModal visible={typeModal} title="Address Type" options={TYPE_OPTIONS}
            selected={field.value} onSelect={field.onChange} onClose={() => setTypeModal(false)} />
        )} />
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
