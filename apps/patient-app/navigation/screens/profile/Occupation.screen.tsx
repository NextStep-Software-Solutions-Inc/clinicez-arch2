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
import Screen from 'components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';

type WorkEnvironment = 'Office' | 'Field' | 'Factory' | 'Healthcare' | 'Agriculture' | 'Other';

type FormValues = {
  occupation: string;
  employer: string;
  industry: string;
  workEnvironment: WorkEnvironment | '';
  yearsInOccupation: string;
  hazardExposure: string;
};

const WORK_ENV_OPTIONS = [
  { label: 'Office', value: 'Office' }, { label: 'Field', value: 'Field' },
  { label: 'Factory', value: 'Factory' }, { label: 'Healthcare', value: 'Healthcare' },
  { label: 'Agriculture', value: 'Agriculture' }, { label: 'Other', value: 'Other' },
];

export default function OccupationScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [envModal, setEnvModal] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { occupation: '', employer: '', industry: '', workEnvironment: '', yearsInOccupation: '', hazardExposure: '' },
  });

  const [hasRecord, setHasRecord] = useState(false);

  useEffect(() => {
    db.query.patientOccupation.findFirst({ where: eq(patientOccupation.patientId, patientId) })
      .then((row) => {
        if (row) {
          setHasRecord(true);
          reset({
            occupation: row.occupation ?? '',
            employer: row.employer ?? '',
            industry: row.industry ?? '',
            workEnvironment: (row.workEnvironment as WorkEnvironment) ?? '',
            yearsInOccupation: row.yearsInOccupation?.toString() ?? '',
            hazardExposure: row.hazardExposure ?? '',
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
        workEnvironment: data.workEnvironment || null,
        yearsInOccupation: data.yearsInOccupation ? parseInt(data.yearsInOccupation, 10) : null,
        updatedAt: new Date(),
      };
      if (hasRecord) {
        await db
          .update(patientOccupation)
          .set(payload)
          .where(eq(patientOccupation.patientId, patientId));
      } else {
        await db.insert(patientOccupation).values({
          id: randomUUID(),
          patientId,
          ...payload,
          createdAt: new Date(),
        });
        setHasRecord(true);
      }

      await flushAndSyncProfile(patientId, getToken);
      reset(data);
      dialog.alert('Saved', 'Your occupation details have been updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save occupation details.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Screen width="form" scroll={false} padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]} keyboardShouldPersistTaps="handled">
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
            <ProfileFormField label="Work Environment" value={WORK_ENV_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setEnvModal(true)} placeholder="Select environment" picker />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24 },
});
