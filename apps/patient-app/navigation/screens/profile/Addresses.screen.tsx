import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db } from '@db/index';
import { patientAddresses } from '@db/schema/patientAddresses';
import { eq } from 'drizzle-orm';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import BottomSheetScrollView from '@ui/ThemedBottomSheetScrollView';
import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import ThemedBottomSheetModal from '@ui/ThemedBottomSheetModal';
import { useForm, Controller } from 'react-hook-form';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileListItemCard from 'components/profile/ProfileListItemCard';
import ProfileAddButton from 'components/profile/ProfileAddButton';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';
import { getPatientFullRecord } from 'services/api/patientApi';
import { hydrateFullRecord } from '@db/hydrate';

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
  const { getToken } = useAuth();
  const navigation = useNavigation();
  const { colors, spacing } = useAppTheme();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [editing, setEditing] = useState<AddressForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<AddressForm>({ defaultValues: EMPTY_FORM });

  const load = async () => {
    try {
      // 1. Immediately render cached SQLite rows for instant offline-first display
      const initialRows = await db.select().from(patientAddresses)
        .where(eq(patientAddresses.patientId, patientId));
      setAddresses(initialRows.filter((r) => !r.deletedAt));

      // 2. If online and authenticated, fetch and hydrate latest server data in background
      if (getToken && patientId) {
        try {
          const fullRecord = await getPatientFullRecord(getToken, patientId);
          if (fullRecord) {
            await hydrateFullRecord(fullRecord);
            const freshRows = await db.select().from(patientAddresses)
              .where(eq(patientAddresses.patientId, patientId));
            setAddresses(freshRows.filter((r) => !r.deletedAt));
          }
        } catch (fetchErr) {
          console.warn('[AddressesScreen] Could not hydrate from server:', fetchErr);
        }
      }
    } catch (err) {
      console.warn('[AddressesScreen] Failed to load addresses:', err);
    }
  };

  useEffect(() => {
    load();
  }, [patientId, getToken]);

  const openAdd = () => {
    reset(EMPTY_FORM);
    setEditing(EMPTY_FORM);
    sheetRef.current?.present();
  };

  const openEdit = (row: any) => {
    const form: AddressForm = {
      id: row.id, type: row.type ?? 'primary',
      houseNo: row.houseStreet ?? '',          // DB column: houseStreet
      streetBarangay: row.barangay ?? '',      // DB column: barangay
      cityMunicipality: row.cityMunicipality ?? '', province: row.province ?? '',
      region: row.region ?? '', postalCode: row.zipCode ?? '',
      country: row.country ?? 'Philippines',
    };
    reset(form);
    setEditing(form);
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Address',
      message: 'Are you sure you want to remove this address?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await db.update(patientAddresses).set({ deletedAt: new Date(), patientId }).where(eq(patientAddresses.id, id));
      await flushAndSyncProfile(patientId, getToken);
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete address.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, houseNo, streetBarangay, postalCode, ...rest } = data;
    const dbFields = {
      ...rest,
      patientId,
      houseStreet: houseNo.trim() || null,
      barangay: streetBarangay.trim() || null,
      cityMunicipality: rest.cityMunicipality.trim(),
      province: rest.province.trim() || null,
      region: rest.region.trim() || null,
      zipCode: postalCode.trim() || null,
      country: rest.country.trim() || 'Philippines',
      updatedAt: new Date(),
    };
    try {
      if (id) {
        await db.update(patientAddresses).set(dbFields).where(eq(patientAddresses.id, id));
      } else {
        await db.insert(patientAddresses).values({ id: randomUUID(), ...dbFields, createdAt: new Date() });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Address saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Address saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save address.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Your Addresses" description="You can add a primary home address and a secondary address." />

        {addresses.map((a) => (
          <ProfileListItemCard
            key={a.id}
            title={[a.houseStreet, a.barangay].filter(Boolean).join(', ') || 'Address'}
            subtitle={[a.cityMunicipality, a.province].filter(Boolean).join(', ')}
            badge={a.type === 'primary' ? 'Primary' : 'Secondary'}
            onEdit={() => openEdit(a)}
            onDelete={() => onDelete(a.id)}
          />
        ))}

        <ProfileAddButton label="Add Address" onPress={openAdd} />
      </ScrollView>

      <ThemedBottomSheetModal 
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
              picker
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
      </ThemedBottomSheetModal>

      <Controller control={control} name="type" render={({ field }) => (
        <ProfileSelectModal visible={typeModal} title="Address Type" options={TYPE_OPTIONS}
          selected={field.value} onSelect={field.onChange} onClose={() => setTypeModal(false)} />
      )} />
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
