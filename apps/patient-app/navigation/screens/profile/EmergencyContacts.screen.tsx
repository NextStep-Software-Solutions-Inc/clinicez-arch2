import { useEffect, useState, useRef } from 'react';
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
  const [contacts, setContacts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef<BottomSheetModalType>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<ContactForm>({ defaultValues: EMPTY });

  const load = async () => {
    const rows = await db.select().from(emergencyContacts).where(eq(emergencyContacts.patientId, patientId));
    setContacts(rows.filter((r) => !r.deletedAt).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { reset(EMPTY); sheetRef.current?.present(); };
  const openEdit = (row: any) => {
    reset({
      id: row.id, name: row.name ?? '', relationship: row.relationship ?? '',
      phone: row.phone ?? '', altPhone: row.altPhone ?? '',
      email: row.email ?? '', address: row.address ?? '',
    });
    sheetRef.current?.present();
  };

  const onDelete = async (id: string) => {
    await db.update(emergencyContacts).set({ deletedAt: new Date() }).where(eq(emergencyContacts.id, id));
    load();
  };

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    const { id, ...rest } = data;
    try {
      if (id) {
        await db.update(emergencyContacts).set({ ...rest, updatedAt: new Date() }).where(eq(emergencyContacts.id, id));
      } else {
        await db.insert(emergencyContacts).values({
          id: randomUUID(), patientId, ...rest,
          sortOrder: contacts.length, createdAt: new Date(), updatedAt: new Date(),
        });
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
        <ProfileSectionHeader title="Emergency Contacts" description="Add up to 3 emergency contacts." />

        {contacts.map((c) => (
          <ProfileListItemCard
            key={c.id}
            title={c.name}
            subtitle={[c.relationship, c.phone].filter(Boolean).join(' · ')}
            onEdit={() => openEdit(c)}
            onDelete={() => onDelete(c.id)}
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
  content: { padding: 16, paddingBottom: 40 },
  sheetContent: { padding: 16, paddingBottom: 16 },
});
