import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patients } from '@db/schema/patients';
import { eq } from 'drizzle-orm';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { usePatientId } from 'hooks/usePatientId';
import { useUser } from '@clerk/expo';


type FormValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  sex: 'Male' | 'Female' | 'Other' | '';
  dob: string;
  placeOfBirth: string;
  civilStatus: 'Single' | 'Married' | 'Widowed' | 'Separated' | 'Divorced' | '';
  bloodType: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown' | '';
  nationality: string;
  ethnicity: string;
  religion: string;
  primaryLanguage: string;
  educationLevel: 'None' | 'Elementary' | 'HighSchool' | 'Vocational' | 'College' | 'Graduate' | 'PostGraduate' | '';
};

const SEX_OPTIONS = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Other', value: 'Other' },
];

const CIVIL_STATUS_OPTIONS = [
  { label: 'Single', value: 'Single' },
  { label: 'Married', value: 'Married' },
  { label: 'Widowed', value: 'Widowed' },
  { label: 'Separated', value: 'Separated' },
  { label: 'Divorced', value: 'Divorced' },
];

const BLOOD_TYPE_OPTIONS = [
  { label: 'A+', value: 'A+' }, { label: 'A-', value: 'A-' },
  { label: 'B+', value: 'B+' }, { label: 'B-', value: 'B-' },
  { label: 'AB+', value: 'AB+' }, { label: 'AB-', value: 'AB-' },
  { label: 'O+', value: 'O+' }, { label: 'O-', value: 'O-' },
  { label: 'Unknown', value: 'Unknown' },
];

const EDUCATION_OPTIONS = [
  { label: 'None', value: 'None' },
  { label: 'Elementary', value: 'Elementary' },
  { label: 'High School', value: 'HighSchool' },
  { label: 'Vocational', value: 'Vocational' },
  { label: 'College', value: 'College' },
  { label: 'Graduate', value: 'Graduate' },
  { label: 'Post Graduate', value: 'PostGraduate' },
];

function selectedLabel(
  options: { label: string; value: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? '';
}

export default function PersonalDemographicsScreen() {
  const patientId = usePatientId();
  const { user } = useUser();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'sex' | 'civil' | 'blood' | 'education' | null>(null);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: {
      firstName: '', middleName: '', lastName: '', suffix: '',
      sex: '', dob: '', placeOfBirth: '', civilStatus: '',
      bloodType: '', nationality: 'Filipino', ethnicity: '',
      religion: '', primaryLanguage: '', educationLevel: '',
    },
  });

  useEffect(() => {
    db.query.patients.findFirst({ where: eq(patients.id, patientId) })
      .then((row) => {
        if (row) {
          reset({
            firstName: row.firstName ?? '',
            middleName: row.middleName ?? '',
            lastName: row.lastName ?? '',
            suffix: row.suffix ?? '',
            sex: row.sex ?? '',
            dob: row.dob ?? '',
            placeOfBirth: row.placeOfBirth ?? '',
            civilStatus: row.civilStatus ?? '',
            bloodType: row.bloodType ?? '',
            nationality: row.nationality ?? 'Filipino',
            ethnicity: row.ethnicity ?? '',
            religion: row.religion ?? '',
            primaryLanguage: row.primaryLanguage ?? '',
            educationLevel: row.educationLevel ?? '',
          });
        } else {
          // No DB row yet — pre-populate from Clerk profile
          reset({
            firstName: user?.firstName ?? '',
            middleName: '',
            lastName: user?.lastName ?? '',
            suffix: '',
            sex: '',
            dob: '',
            placeOfBirth: '',
            civilStatus: '',
            bloodType: '',
            nationality: 'Filipino',
            ethnicity: '',
            religion: '',
            primaryLanguage: '',
            educationLevel: '',
          });
        }
      })
      .catch(console.error);
  }, [patientId, reset, user?.firstName, user?.lastName]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        sex: data.sex || null,
        civilStatus: data.civilStatus || null,
        bloodType: data.bloodType || null,
        educationLevel: data.educationLevel || null,
      };
      await db.insert(patients).values({
        id: patientId,
        clerkUserId: patientId,
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: patients.id,
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ProfileSectionHeader title="Full Name" />
        <Controller control={control} name="firstName" render={({ field }) => (
          <ProfileFormField label="First Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Juan" useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="middleName" render={({ field }) => (
          <ProfileFormField label="Middle Name" value={field.value} onChangeText={field.onChange} placeholder="e.g. Santos" useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="lastName" render={({ field }) => (
          <ProfileFormField label="Last Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. dela Cruz" useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="suffix" render={({ field }) => (
          <ProfileFormField label="Suffix" value={field.value} onChangeText={field.onChange} placeholder="e.g. Jr., III" useBottomSheetInput={false} />
        )} />

        <ProfileSectionHeader title="Basic Information" />
        <Controller control={control} name="sex" render={({ field }) => (
          <ProfileFormField
            label="Sex"
            value={selectedLabel(SEX_OPTIONS, field.value)}
            onPressIn={() => setModal('sex')}
            placeholder="Select sex"
            picker
          />
        )} />
        <Controller control={control} name="dob" render={({ field }) => (
          <ProfileDatePicker label="Date of Birth" value={field.value} onChange={field.onChange} maximumDate={new Date()} />
        )} />
        <Controller control={control} name="placeOfBirth" render={({ field }) => (
          <ProfileFormField label="Place of Birth" value={field.value} onChangeText={field.onChange} placeholder="City, Province" useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="civilStatus" render={({ field }) => (
          <ProfileFormField
            label="Civil Status"
            value={selectedLabel(CIVIL_STATUS_OPTIONS, field.value)}
            onPressIn={() => setModal('civil')}
            placeholder="Select civil status"
            picker
          />
        )} />
        <Controller control={control} name="bloodType" render={({ field }) => (
          <ProfileFormField
            label="Blood Type"
            value={selectedLabel(BLOOD_TYPE_OPTIONS, field.value)}
            onPressIn={() => setModal('blood')}
            placeholder="Select blood type"
            picker
          />
        )} />

        <ProfileSectionHeader title="Background" />
        <Controller control={control} name="nationality" render={({ field }) => (
          <ProfileFormField label="Nationality" value={field.value} onChangeText={field.onChange} useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="ethnicity" render={({ field }) => (
          <ProfileFormField label="Ethnicity" value={field.value} onChangeText={field.onChange} placeholder="Optional" useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="religion" render={({ field }) => (
          <ProfileFormField label="Religion" value={field.value} onChangeText={field.onChange} placeholder="Optional" useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="primaryLanguage" render={({ field }) => (
          <ProfileFormField label="Primary Language" value={field.value} onChangeText={field.onChange} placeholder="e.g. Filipino" useBottomSheetInput={false} />
        )} />
        <Controller control={control} name="educationLevel" render={({ field }) => (
          <ProfileFormField
            label="Education Level"
            value={selectedLabel(EDUCATION_OPTIONS, field.value)}
            onPressIn={() => setModal('education')}
            placeholder="Select education level"
            picker
          />
        )} />
      </ScrollView>

      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />

      {/* Modals */}
      <Controller control={control} name="sex" render={({ field }) => (
        <ProfileSelectModal
          visible={modal === 'sex'} title="Sex" options={SEX_OPTIONS}
          selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)}
        />
      )} />
      <Controller control={control} name="civilStatus" render={({ field }) => (
        <ProfileSelectModal
          visible={modal === 'civil'} title="Civil Status" options={CIVIL_STATUS_OPTIONS}
          selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)}
        />
      )} />
      <Controller control={control} name="bloodType" render={({ field }) => (
        <ProfileSelectModal
          visible={modal === 'blood'} title="Blood Type" options={BLOOD_TYPE_OPTIONS}
          selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)}
        />
      )} />
      <Controller control={control} name="educationLevel" render={({ field }) => (
        <ProfileSelectModal
          visible={modal === 'education'} title="Education Level" options={EDUCATION_OPTIONS}
          selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)}
        />
      )} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
});
