import { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { emergencyContacts } from '@db/schema/emergencyContacts';
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
import { useProfileSync } from 'hooks/useProfileSync';

const MAX_CONTACTS = 3;

type ContactForm = {
  id: string | null;
  name: string;
  relationship: string;
  phone: string;
  altPhone: string;
  email: string;
  address: string;
};

const EMPTY: ContactForm = {
  id: null, name: '', relationship: '', phone: '', altPhone: '', email: '', address: '',
};

export default function EmergencyContactsScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const [contacts, setContacts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<ContactForm>({ defaultValues: EMPTY });

  const load = useCallback(async () => {
    try {
      const rows = await db.select().from(emergencyContacts).where(eq(emergencyContacts.patientId, patientId));
      setContacts(rows.filter((r) => !r.deletedAt).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    } catch (err) {
      console.warn('[EmergencyContactsScreen] Failed to load contacts:', err);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useProfileSync(load);

  const openAdd = () => { reset(EMPTY); sheetRef.current?.present(); };
  const openEdit = (row: any) => {
    reset({
      id: row.id, name: row.name ?? '', relationship: row.relationship ?? '',
      phone: row.phone ?? '', altPhone: row.altPhone ?? '',
      email: row.email ?? '', address: row.address ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string, contactName?: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Contact',
      message: `Are you sure you want to remove ${contactName || 'this contact'} from emergency contacts?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await db.update(emergencyContacts).set({ deletedAt: new Date(), patientId }).where(eq(emergencyContacts.id, id));
      await flushAndSyncProfile(patientId, getToken);
      load();
    } catch (err: any) {
      dialog.alert('Error', err?.message || 'Failed to delete contact.');
    }
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    const fields = {
      patientId,
      name: rest.name.trim(),
      relationship: rest.relationship.trim(),
      phone: rest.phone.trim(),
      altPhone: rest.altPhone.trim() || null,
      email: rest.email.trim() || null,
      address: rest.address.trim() || null,
    };
    try {
      if (id) {
        await db.update(emergencyContacts).set({ ...fields, updatedAt: new Date() }).where(eq(emergencyContacts.id, id));
      } else {
        await db.insert(emergencyContacts).values({
          id: randomUUID(), ...fields,
          sortOrder: contacts.length, createdAt: new Date(), updatedAt: new Date(),
        });
      }
      const syncResult = await flushAndSyncProfile(patientId, getToken);
      sheetRef.current?.dismiss();
      load();

      if (syncResult.isOffline) {
        dialog.alert('Saved Offline', 'Emergency contact saved locally and will sync when you are back online.');
      } else if (!syncResult.success && syncResult.failed > 0) {
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`
        );
      } else {
        dialog.alert('Saved', 'Emergency contact saved successfully.');
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save emergency contact.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <BottomSheetModalProvider>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]}>
        <ProfileSectionHeader title="Emergency Contacts" description="Add up to 3 emergency contacts." />

        {contacts.map((c) => (
          <ProfileListItemCard
            key={c.id}
            title={c.name}
            subtitle={[c.relationship, c.phone].filter(Boolean).join(' · ')}
            onEdit={() => openEdit(c)}
            onDelete={() => onDelete(c.id, c.name)}
            deleteMessage={`Remove ${c.name} from emergency contacts?`}
          />
        ))}

        <ProfileAddButton
          label="Add Emergency Contact"
          onPress={openAdd}
          disabled={contacts.length >= MAX_CONTACTS}
        />
      </ScrollView>

      <ThemedBottomSheetModal ref={sheetRef} snapPoints={['60%', '85%']} enablePanDownToClose
        keyboardBehavior="interactive" keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Emergency Contact" />
          <Controller control={control} name="name" render={({ field }) => (
            <ProfileFormField label="Full Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Maria dela Cruz" />
          )} />
          <Controller control={control} name="relationship" render={({ field }) => (
            <ProfileFormField label="Relationship" value={field.value} onChangeText={field.onChange} placeholder="e.g. Spouse, Parent, Sibling" />
          )} />
          <Controller control={control} name="phone" render={({ field }) => (
            <ProfileFormField label="Phone Number" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" required />
          )} />
          <Controller control={control} name="altPhone" render={({ field }) => (
            <ProfileFormField label="Alternative Phone" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" placeholder="Optional" />
          )} />
          <Controller control={control} name="email" render={({ field }) => (
            <ProfileFormField label="Email" value={field.value} onChangeText={field.onChange} keyboardType="email-address" autoCapitalize="none" placeholder="Optional" />
          )} />
          <Controller control={control} name="address" render={({ field }) => (
            <ProfileFormField label="Address" value={field.value} onChangeText={field.onChange} multiline placeholder="Optional" />
          )} />
        </BottomSheetScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} label="Save Contact" />
      </ThemedBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
