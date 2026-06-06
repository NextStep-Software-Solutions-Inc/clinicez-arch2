import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientGovernmentIds } from '@db/schema/patientGovernmentIds';
import { eq } from 'drizzle-orm';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';

type PhilhealthCategory = 'Member' | 'Dependent' | 'Indigent' | 'SeniorCitizen' | 'PWD';
type DisabilityType = 'Physical' | 'Sensory' | 'Intellectual' | 'Psychosocial';
type HmoPlanType = 'Individual' | 'Group' | 'Family';


type FormValues = {
  philhealthId: string;
  philhealthCategory: PhilhealthCategory | '';
  sssNumber: string;
  gsisNumber: string;
  pagIbigNumber: string;
  tinNumber: string;
  seniorCitizenId: string;
  isPwd: boolean;
  pwdIdNumber: string;
  disabilityType: DisabilityType | '';
  hmoProvider: string;
  hmoPolicyNumber: string;
  hmoPlanType: HmoPlanType | '';
  hmoCoverageStart: string;
  hmoCoverageEnd: string;
};

const PHILHEALTH_CATEGORY_OPTIONS = [
  { label: 'Member', value: 'Member' },
  { label: 'Dependent', value: 'Dependent' },
  { label: 'Indigent', value: 'Indigent' },
  { label: 'Senior Citizen', value: 'SeniorCitizen' },
  { label: 'PWD', value: 'PWD' },
];

const DISABILITY_TYPE_OPTIONS = [
  { label: 'Physical', value: 'Physical' },
  { label: 'Sensory', value: 'Sensory' },
  { label: 'Intellectual', value: 'Intellectual' },
  { label: 'Psychosocial', value: 'Psychosocial' },
];

const HMO_PLAN_TYPE_OPTIONS = [
  { label: 'Individual', value: 'Individual' },
  { label: 'Family', value: 'Family' },
  { label: 'Group', value: 'Group' },
];

export default function GovernmentIdsScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'philhealth' | 'disability' | 'hmoPlan' | null>(null);

  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: {
      philhealthId: '', philhealthCategory: '', sssNumber: '', gsisNumber: '',
      pagIbigNumber: '', tinNumber: '', seniorCitizenId: '',
      isPwd: false, pwdIdNumber: '', disabilityType: '',
      hmoProvider: '', hmoPolicyNumber: '', hmoPlanType: '',
      hmoCoverageStart: '', hmoCoverageEnd: '',
    },
  });

  const isPwd = watch('isPwd');

  useEffect(() => {
    db.query.patientGovernmentIds.findFirst({ where: eq(patientGovernmentIds.patientId, patientId) })
      .then((row) => {
        if (row) {
          reset({
            philhealthId: row.philhealthId ?? '',
            philhealthCategory: row.philhealthCategory ?? '',
            sssNumber: row.sssNumber ?? '',
            gsisNumber: row.gsisNumber ?? '',
            pagIbigNumber: row.pagibigId ?? '',
            tinNumber: row.tin ?? '',
            seniorCitizenId: row.seniorCitizenId ?? '',
            isPwd: row.isPwd ?? false,
            pwdIdNumber: row.pwdIdNumber ?? '',
            disabilityType: row.disabilityType ?? '',
            hmoProvider: row.hmoProvider ?? '',
            hmoPolicyNumber: row.hmoPolicyNumber ?? '',
            hmoPlanType: row.hmoPlanType ?? '',
            hmoCoverageStart: row.hmoCoverageStart ?? '',
            hmoCoverageEnd: row.hmoCoverageEnd ?? '',
          });
        }
      })
      .catch(console.error);
  }, [patientId, reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        philhealthId: data.philhealthId,
        philhealthCategory: data.philhealthCategory || null,
        sssNumber: data.sssNumber,
        gsisNumber: data.gsisNumber,
        pagibigId: data.pagIbigNumber,
        tin: data.tinNumber,
        seniorCitizenId: data.seniorCitizenId,
        isPwd: data.isPwd,
        pwdIdNumber: data.pwdIdNumber,
        disabilityType: data.disabilityType || null,
        hmoProvider: data.hmoProvider,
        hmoPolicyNumber: data.hmoPolicyNumber,
        hmoPlanType: data.hmoPlanType || null,
        hmoCoverageStart: data.hmoCoverageStart,
        hmoCoverageEnd: data.hmoCoverageEnd,
      };

      await db.insert(patientGovernmentIds).values({
        id: randomUUID(),
        patientId,
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: patientGovernmentIds.patientId,
        set: { ...payload, updatedAt: new Date() },
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
        <ProfileSectionHeader title="PhilHealth" />
        <Controller control={control} name="philhealthId" render={({ field }) => (
          <ProfileFormField label="PhilHealth ID" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="00-000000000-0" />
        )} />
        <Controller control={control} name="philhealthCategory" render={({ field }) => (
          <ProfileFormField
            label="Category"
            value={PHILHEALTH_CATEGORY_OPTIONS.find(o => o.value === field.value)?.label || ''}
            onPressIn={() => setModal('philhealth')}
            placeholder="Select category"
          />
        )} />

        <ProfileSectionHeader title="Other Government IDs" />
        <Controller control={control} name="sssNumber" render={({ field }) => (
          <ProfileFormField label="SSS Number" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="00-0000000-0" />
        )} />
        <Controller control={control} name="gsisNumber" render={({ field }) => (
          <ProfileFormField label="GSIS Number" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <Controller control={control} name="pagIbigNumber" render={({ field }) => (
          <ProfileFormField label="Pag-IBIG (HDMF) Number" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
        )} />
        <Controller control={control} name="tinNumber" render={({ field }) => (
          <ProfileFormField label="TIN Number" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="000-000-000-000" />
        )} />
        <Controller control={control} name="seniorCitizenId" render={({ field }) => (
          <ProfileFormField label="Senior Citizen ID" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />

        <ProfileSectionHeader title="Person with Disability (PWD)" />
        <Controller control={control} name="isPwd" render={({ field }) => (
          <ProfileToggle label="Registered PWD" value={field.value} onValueChange={field.onChange} />
        )} />
        {isPwd && (
          <>
            <Controller control={control} name="pwdIdNumber" render={({ field }) => (
              <ProfileFormField label="PWD ID Number" value={field.value} onChangeText={field.onChange} />
            )} />
            <Controller control={control} name="disabilityType" render={({ field }) => (
              <ProfileFormField
                label="Disability Type"
                value={DISABILITY_TYPE_OPTIONS.find(o => o.value === field.value)?.label || ''}
                onPressIn={() => setModal('disability')}
                placeholder="Select type"
              />
            )} />
          </>
        )}

        <ProfileSectionHeader title="HMO / Health Insurance" />
        <Controller control={control} name="hmoProvider" render={({ field }) => (
          <ProfileFormField label="HMO Provider" value={field.value} onChangeText={field.onChange} placeholder="e.g. Maxicare, Intellicare" />
        )} />
        <Controller control={control} name="hmoPolicyNumber" render={({ field }) => (
          <ProfileFormField label="Policy / Member Number" value={field.value} onChangeText={field.onChange} />
        )} />
        <Controller control={control} name="hmoPlanType" render={({ field }) => (
          <ProfileFormField
            label="Plan Type"
            value={HMO_PLAN_TYPE_OPTIONS.find(o => o.value === field.value)?.label || ''}
            onPressIn={() => setModal('hmoPlan')}
            placeholder="Select plan type"
          />
        )} />
        <Controller control={control} name="hmoCoverageStart" render={({ field }) => (
          <ProfileDatePicker label="Coverage Start Date" value={field.value} onChange={field.onChange} />
        )} />
        <Controller control={control} name="hmoCoverageEnd" render={({ field }) => (
          <ProfileDatePicker label="Coverage End Date" value={field.value} onChange={field.onChange} />
        )} />
      </ScrollView>

      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />

      <Controller control={control} name="philhealthCategory" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'philhealth'} title="PhilHealth Category" options={PHILHEALTH_CATEGORY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
      )} />
      <Controller control={control} name="disabilityType" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'disability'} title="Disability Type" options={DISABILITY_TYPE_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
      )} />
      <Controller control={control} name="hmoPlanType" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'hmoPlan'} title="HMO Plan Type" options={HMO_PLAN_TYPE_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
      )} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
});
