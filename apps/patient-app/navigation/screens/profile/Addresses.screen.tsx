import { useEffect, useState, useRef, useCallback } from 'react';
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
import { flushAndSyncProfile, deleteProfileListItem } from 'services/api/syncService';
import { deletePatientAddress } from 'services/api/patientApi';
import { useProfileSync } from 'hooks/useProfileSync';
import { useEhrOptions } from 'hooks/useEhrOptions';
import CascadingAddressPicker from 'components/profile/CascadingAddressPicker';

type AddressForm = {
  id: string | null;
  type: string;
  houseNo: string;
  streetBarangay: string;
  cityMunicipality: string;
  province: string;
  region: string;
  postalCode: string;
  country: string;
  regionPsgc?: string | null;
  provincePsgc?: string | null;
  cityMunicipalityPsgc?: string | null;
  barangayPsgc?: string | null;
  regionName?: string | null;
  provinceName?: string | null;
  cityMunicipalityName?: string | null;
  barangayName?: string | null;
  isSameAsPermanent?: boolean;
};

const EMPTY_FORM: AddressForm = {
  id: null,
  type: 'primary',
  houseNo: '',
  streetBarangay: '',
  cityMunicipality: '',
  province: '',
  region: '',
  postalCode: '',
  country: 'Philippines',
  regionPsgc: null,
  provincePsgc: null,
  cityMunicipalityPsgc: null,
  barangayPsgc: null,
  regionName: null,
  provinceName: null,
  cityMunicipalityName: null,
  barangayName: null,
  isSameAsPermanent: false,
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

  const { selectOptions: typeOptions } = useEhrOptions('address_type');

  const { control, handleSubmit, reset, watch, setValue, formState: { isDirty } } = useForm<AddressForm>({ defaultValues: EMPTY_FORM });

  const load = useCallback(async () => {
    try {
      const rows = await db.select().from(patientAddresses)
        .where(eq(patientAddresses.patientId, patientId));
      setAddresses(rows.filter((r) => !r.deletedAt));
    } catch (err) {
      console.warn('[AddressesScreen] Failed to load addresses:', err);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useProfileSync(load);

  const openAdd = () => {
    reset(EMPTY_FORM);
    setEditing(EMPTY_FORM);
    sheetRef.current?.present();
  };

  const openEdit = (row: any) => {
    const form: AddressForm = {
      id: row.id,
      type: row.type ?? 'primary',
      houseNo: row.houseStreet ?? '',
      streetBarangay: row.barangay ?? '',
      cityMunicipality: row.cityMunicipality ?? '',
      province: row.province ?? '',
      region: row.region ?? '',
      postalCode: row.zipCode ?? '',
      country: row.country ?? 'Philippines',
      regionPsgc: row.regionPsgc ?? null,
      provincePsgc: row.provincePsgc ?? null,
      cityMunicipalityPsgc: row.cityMunicipalityPsgc ?? null,
      barangayPsgc: row.barangayPsgc ?? null,
      regionName: row.regionName ?? row.region ?? null,
      provinceName: row.provinceName ?? row.province ?? null,
      cityMunicipalityName: row.cityMunicipalityName ?? row.cityMunicipality ?? null,
      barangayName: row.barangayName ?? row.barangay ?? null,
      isSameAsPermanent: Boolean(row.isSameAsPermanent),
    };
    reset(form);
    setEditing(form);
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, serverId?: string | null) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Address',
      message: 'Are you sure you want to remove this address?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProfileListItem({
        table: patientAddresses,
        entityType: 'patient_addresses',
        patientId,
        id,
        serverId,
        getToken,
        restDeleteFn: deletePatientAddress,
      });
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
      type: (['primary', 'secondary'].includes(data.type) ? data.type : 'primary') as 'primary' | 'secondary',
      houseStreet: houseNo.trim() || null,
      barangay: (data.barangayName || streetBarangay || '').trim() || null,
      cityMunicipality: (data.cityMunicipalityName || rest.cityMunicipality || '').trim(),
      province: (data.provinceName || rest.province || '').trim() || null,
      region: (data.regionName || rest.region || '').trim() || null,
      zipCode: postalCode.trim() || null,
      country: rest.country?.trim() || 'Philippines',
      regionPsgc: data.regionPsgc ?? null,
      provincePsgc: data.provincePsgc ?? null,
      cityMunicipalityPsgc: data.cityMunicipalityPsgc ?? null,
      barangayPsgc: data.barangayPsgc ?? null,
      regionName: data.regionName ?? null,
      provinceName: data.provinceName ?? null,
      cityMunicipalityName: data.cityMunicipalityName ?? null,
      barangayName: data.barangayName ?? null,
      isSameAsPermanent: Boolean(data.isSameAsPermanent),
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
            onDelete={() => onDelete(a.id, a.serverId)}
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
              value={typeOptions.find(o => o.value === field.value || o.label === field.value)?.label || field.value}
              onPressIn={() => setTypeModal(true)}
              placeholder="Select type"
              picker
            />
          )} />
          <CascadingAddressPicker
            value={{
              regionPsgc: watch('regionPsgc'),
              regionName: watch('regionName') || watch('region'),
              provincePsgc: watch('provincePsgc'),
              provinceName: watch('provinceName') || watch('province'),
              cityMunicipalityPsgc: watch('cityMunicipalityPsgc'),
              cityMunicipalityName: watch('cityMunicipalityName') || watch('cityMunicipality'),
              barangayPsgc: watch('barangayPsgc'),
              barangayName: watch('barangayName') || watch('streetBarangay'),
              houseStreet: watch('houseNo'),
              postalCode: watch('postalCode'),
              isSameAsPermanent: watch('isSameAsPermanent'),
            }}
            onChange={(next) => {
              setValue('regionPsgc', next.regionPsgc, { shouldDirty: true });
              setValue('regionName', next.regionName, { shouldDirty: true });
              setValue('region', next.regionName || '', { shouldDirty: true });
              setValue('provincePsgc', next.provincePsgc, { shouldDirty: true });
              setValue('provinceName', next.provinceName, { shouldDirty: true });
              setValue('province', next.provinceName || '', { shouldDirty: true });
              setValue('cityMunicipalityPsgc', next.cityMunicipalityPsgc, { shouldDirty: true });
              setValue('cityMunicipalityName', next.cityMunicipalityName, { shouldDirty: true });
              setValue('cityMunicipality', next.cityMunicipalityName || '', { shouldDirty: true });
              setValue('barangayPsgc', next.barangayPsgc, { shouldDirty: true });
              setValue('barangayName', next.barangayName, { shouldDirty: true });
              setValue('streetBarangay', next.barangayName || '', { shouldDirty: true });
              setValue('houseNo', next.houseStreet || next.streetAddress || '', { shouldDirty: true });
              setValue('postalCode', next.postalCode || next.zipCode || '', { shouldDirty: true });
              setValue('isSameAsPermanent', next.isSameAsPermanent, { shouldDirty: true });
            }}
            showSameAsPermanentToggle={watch('type') === 'secondary'}
          />
          <Controller control={control} name="country" render={({ field }) => (
            <ProfileFormField label="Country" value={field.value} onChangeText={field.onChange} />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Address" />
      </ThemedBottomSheetModal>

      <Controller control={control} name="type" render={({ field }) => (
        <ProfileSelectModal visible={typeModal} title="Address Type" options={typeOptions}
          selected={field.value} onSelect={field.onChange} onClose={() => setTypeModal(false)} />
      )} />
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 40 },
});
