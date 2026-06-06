import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientDentalVision } from '@db/schema/patientDentalVision';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { usePatientId } from 'hooks/usePatientId';

type CorrectiveLenses = 'None' | 'Glasses' | 'Contacts' | 'Both';

type FormValues = {
  dentistName: string;
  dentistClinic: string;
  orthodonticDevice: string;
  eyeDoctorName: string;
  correctiveLenses: CorrectiveLenses | '';
};

const LENSES_OPTIONS = [
  { label: 'None', value: 'None' },
  { label: 'Eyeglasses', value: 'Glasses' },
  { label: 'Contact Lenses', value: 'Contacts' },
  { label: 'Both', value: 'Both' },
];

export default function DentalVisionScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [lensesModal, setLensesModal] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { dentistName: '', dentistClinic: '', orthodonticDevice: '', eyeDoctorName: '', correctiveLenses: '' },
  });

  useEffect(() => {
    db.query.patientDentalVision.findFirst({ where: eq(patientDentalVision.patientId, patientId) })
      .then((row) => {
        if (row) {
          reset({
            dentistName: row.dentistName ?? '',
            dentistClinic: row.dentistClinic ?? '',
            orthodonticDevice: row.orthodonticDevice ?? '',
            eyeDoctorName: row.eyeDoctorName ?? '',
            correctiveLenses: row.correctiveLenses ?? '',
          });
        }
      })
      .catch(console.error);
  }, [patientId, reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        correctiveLenses: data.correctiveLenses || null,
        updatedAt: new Date(),
      };

      await db
        .insert(patientDentalVision)
        .values({ id: randomUUID(), patientId, ...payload, createdAt: new Date() })
        .onConflictDoUpdate({ target: patientDentalVision.patientId, set: payload });

      reset(data);
      navigation.goBack();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProfileSectionHeader title="Dental Health" />
        <Controller control={control} name="dentistName" render={({ field }) => (
          <ProfileFormField label="Dentist Name" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <Controller control={control} name="dentistClinic" render={({ field }) => (
          <ProfileFormField label="Dental Clinic" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <Controller control={control} name="orthodonticDevice" render={({ field }) => (
          <ProfileFormField label="Orthodontic Device / Appliance" value={field.value} onChangeText={field.onChange} placeholder="e.g. Braces, Retainer, Dentures" />
        )} />

        <ProfileSectionHeader title="Vision Health" />
        <Controller control={control} name="eyeDoctorName" render={({ field }) => (
          <ProfileFormField label="Eye Doctor / Ophthalmologist" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <Controller control={control} name="correctiveLenses" render={({ field }) => (
          <ProfileFormField label="Corrective Lenses" value={LENSES_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setLensesModal(true)} placeholder="Select option" />
        )} />
      </ScrollView>
      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />
      <Controller control={control} name="correctiveLenses" render={({ field }) => (
        <ProfileSelectModal visible={lensesModal} title="Corrective Lenses" options={LENSES_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setLensesModal(false)} />
      )} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 16, paddingBottom: 24 } });
