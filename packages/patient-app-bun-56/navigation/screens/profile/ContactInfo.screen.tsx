import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patients } from '@db/schema/patients';
import { eq } from 'drizzle-orm';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { usePatientId } from 'hooks/usePatientId';


type FormValues = {
  mobile: string;
  altPhone: string;
  email: string;
  messengerHandle: string;
};

export default function ContactInfoScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { mobile: '', altPhone: '', email: '', messengerHandle: '' },
  });

  useEffect(() => {
    db.query.patients.findFirst({ where: eq(patients.id, patientId) })
      .then((row) => {
        if (row) {
          reset({
            mobile: row.mobile ?? '',
            altPhone: row.altPhone ?? '',
            email: row.email ?? '',
            messengerHandle: row.messengerHandle ?? '',
          });
        }
      })
      .catch(console.error);
  }, [reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      await db.insert(patients).values({
        id: patientId,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: patients.id,
        set: { ...data, updatedAt: new Date() },
      });
      reset(data);
      navigation.goBack();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProfileSectionHeader title="Phone Numbers" />
        <Controller control={control} name="mobile" render={({ field }) => (
          <ProfileFormField label="Mobile Number" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" placeholder="+63 9XX XXX XXXX" required />
        )} />
        <Controller control={control} name="altPhone" render={({ field }) => (
          <ProfileFormField label="Alternative Phone" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" placeholder="Optional" />
        )} />

        <ProfileSectionHeader title="Online / Messaging" />
        <Controller control={control} name="email" render={({ field }) => (
          <ProfileFormField label="Email Address" value={field.value} onChangeText={field.onChange} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
        )} />
        <Controller control={control} name="messengerHandle" render={({ field }) => (
          <ProfileFormField label="Messenger / Viber Handle" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
      </ScrollView>
      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
});
