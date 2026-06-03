import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientOccupation } from '@db/schema/patientOccupation';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { usePatientId } from 'hooks/usePatientId';

type FormValues = { occupation: string; employer: string; industry: string; workEnvironment: string; yearsInOccupation: string; hazardExposure: string; };

const WORK_ENV_OPTIONS = [
  { label: 'Office', value: 'Office' }, { label: 'Field', value: 'Field' },
  { label: 'Factory', value: 'Factory' }, { label: 'Healthcare', value: 'Healthcare' },
  { label: 'Agriculture', value: 'Agriculture' }, { label: 'Other', value: 'Other' },
];

export default function OccupationScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [envModal, setEnvModal] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { occupation: '', employer: '', industry: '', workEnvironment: '', yearsInOccupation: '', hazardExposure: '' },
  });

  useEffect(() => {
    db.query.patientOccupation.findFirst({ where: eq(patientOccupation.patientId, patientId) })
      .then((row) => {
        if (row) {
          reset({ occupation: row.occupation ?? '', employer: row.employer ?? '', industry: row.industry ?? '', workEnvironment: row.workEnvironment ?? '', yearsInOccupation: row.yearsInOccupation?.toString() ?? '', hazardExposure: row.hazardExposure ?? '' });
        }
      })
      .catch(console.error);
  }, [reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = { ...data, yearsInOccupation: data.yearsInOccupation ? parseInt(data.yearsInOccupation) : null, updatedAt: new Date() };
      await db.insert(patientOccupation).values({ id: randomUUID(), patientId: patientId, ...payload, createdAt: new Date() }).onConflictDoUpdate({ target: patientOccupation.patientId, set: payload });
      reset(data);
      navigation.goBack();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProfileSectionHeader title="Occupation Details" />
        <Controller control={control} name="occupation" render={({ field }) => (
          <ProfileFormField label="Occupation / Job Title" value={field.value} onChangeText={field.onChange} placeholder="e.g. Software Engineer, Nurse" />
        )} />
        <Controller control={control} name="employer" render={({ field }) => (
          <ProfileFormField label="Employer / Company" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <Controller control={control} name="industry" render={({ field }) => (
          <ProfileFormField label="Industry / Sector" value={field.value} onChangeText={field.onChange} placeholder="e.g. Healthcare, IT, Education" />
        )} />
        <Controller control={control} name="workEnvironment" render={({ field }) => (
          <ProfileFormField label="Work Environment" value={WORK_ENV_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setEnvModal(true)} placeholder="Select environment" />
        )} />
        <Controller control={control} name="yearsInOccupation" render={({ field }) => (
          <ProfileFormField label="Years in Current Occupation" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="Optional" />
        )} />
        <Controller control={control} name="hazardExposure" render={({ field }) => (
          <ProfileFormField label="Occupational Hazard Exposure" value={field.value} onChangeText={field.onChange} multiline placeholder="e.g. Chemical exposure, Radiation, Noise" />
        )} />
      </ScrollView>
      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />
      <Controller control={control} name="workEnvironment" render={({ field }) => (
        <ProfileSelectModal visible={envModal} title="Work Environment" options={WORK_ENV_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setEnvModal(false)} />
      )} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 16, paddingBottom: 24 } });
