import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientMentalHealthProfile } from '@db/schema/patientMentalHealthProfile';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { usePatientId } from 'hooks/usePatientId';

type PsychotherapyStatus = 'Active' | 'Inactive' | 'None';

type FormValues = {
  hasPriorDiagnosis: boolean;
  providerName: string;
  providerSpecialty: string;
  providerClinic: string;
  psychotherapyStatus: PsychotherapyStatus | '';
};

const PSYCHOTHERAPY_OPTIONS = [
  { label: 'Active (Currently attending)', value: 'Active' },
  { label: 'Inactive (Past therapy)', value: 'Inactive' },
  { label: 'None', value: 'None' },
];

export default function MentalHealthScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [therapyModal, setTherapyModal] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { hasPriorDiagnosis: false, providerName: '', providerSpecialty: '', providerClinic: '', psychotherapyStatus: '' },
  });

  useEffect(() => {
    db.query.patientMentalHealthProfile.findFirst({ where: eq(patientMentalHealthProfile.patientId, patientId) })
      .then((row) => {
        if (row) {
          reset({
            hasPriorDiagnosis: row.hasPriorDiagnosis ?? false,
            providerName: row.providerName ?? '',
            providerSpecialty: row.providerSpecialty ?? '',
            providerClinic: row.providerClinic ?? '',
            psychotherapyStatus: row.psychotherapyStatus ?? '',
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
        psychotherapyStatus: data.psychotherapyStatus || null,
        updatedAt: new Date(),
      };
      await db.insert(patientMentalHealthProfile).values({ id: randomUUID(), patientId: patientId, ...payload, createdAt: new Date() }).onConflictDoUpdate({ target: patientMentalHealthProfile.patientId, set: payload });
      reset(data);
      navigation.goBack();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProfileSectionHeader title="Mental Health Profile" description="Confidential — visible only to your healthcare provider." />
        <Controller control={control} name="hasPriorDiagnosis" render={({ field }) => (
          <ProfileToggle label="Has Prior Mental Health Diagnosis" value={field.value} onValueChange={field.onChange} />
        )} />
        <ProfileSectionHeader title="Mental Health Provider" />
        <Controller control={control} name="providerName" render={({ field }) => (
          <ProfileFormField label="Provider Name" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <Controller control={control} name="providerSpecialty" render={({ field }) => (
          <ProfileFormField label="Specialty" value={field.value} onChangeText={field.onChange} placeholder="e.g. Psychiatrist, Psychologist, Counselor" />
        )} />
        <Controller control={control} name="providerClinic" render={({ field }) => (
          <ProfileFormField label="Clinic / Hospital" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <ProfileSectionHeader title="Psychotherapy" />
        <Controller control={control} name="psychotherapyStatus" render={({ field }) => (
          <ProfileFormField label="Psychotherapy Status" value={PSYCHOTHERAPY_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setTherapyModal(true)} placeholder="Select status" />
        )} />
      </ScrollView>
      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />
      <Controller control={control} name="psychotherapyStatus" render={({ field }) => (
        <ProfileSelectModal visible={therapyModal} title="Psychotherapy Status" options={PSYCHOTHERAPY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setTherapyModal(false)} />
      )} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 16, paddingBottom: 24 } });
