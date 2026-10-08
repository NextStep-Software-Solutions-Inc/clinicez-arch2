import { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform, DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db, flushDatabaseSnapshot } from '@db/index';
import { patients } from '@db/schema/patients';
import { eq } from 'drizzle-orm';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileDatePicker from 'components/profile/ProfileDatePicker';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import ProfileFormGrid from 'components/profile/ProfileFormGrid';
import Screen from 'components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useUser } from '@clerk/expo';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import {
  getPatientProfile,
  getPatientByClerkId,
  updatePatientDemographics,
  fromBackendBloodType,
  type PatientSummary,
} from 'services/api/patientApi';
import { upsertPatientSummary } from '@db/hydrate';
import { useProfileSync } from 'hooks/useProfileSync';

type FormValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  sex: 'Male' | 'Female' | 'Other' | '';
  dob: string;
  placeOfBirth: string;
  civilStatus: 'Single' | 'Married' | 'Widowed' | 'Separated' | 'Divorced' | '';
  bloodType: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | '';
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
  const { getToken } = useAuth();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();
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

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const loadLocal = useCallback(async () => {
    if (!patientId || isDirtyRef.current) return;
    try {
      const row = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });
      if (row && !isDirtyRef.current) {
        const localFirst = row.firstName || user?.firstName || '';
        const localLast = row.lastName || user?.lastName || '';
        const rawBlood = fromBackendBloodType(row.bloodType) ?? (row.bloodType ?? '');
        reset({
          firstName: localFirst,
          middleName: row.middleName ?? '',
          lastName: localLast,
          suffix: row.suffix ?? '',
          sex: (row.sex as any) ?? '',
          dob: row.dob ?? '',
          placeOfBirth: row.placeOfBirth ?? '',
          civilStatus: (row.civilStatus as any) ?? '',
          bloodType: (rawBlood as any),
          nationality: row.nationality ?? '',
          ethnicity: row.ethnicity ?? '',
          religion: row.religion ?? '',
          primaryLanguage: row.primaryLanguage ?? '',
          educationLevel: (row.educationLevel as any) ?? '',
        });
      }
    } catch (err) {
      console.warn('[PersonalDemographics] Failed to read from local DB:', err);
    }
  }, [patientId, reset, user?.firstName, user?.lastName]);

  useProfileSync(loadLocal);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. Read from local SQLite first for immediate UI render
      try {
        const row = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });
        if (row && isMounted) {
          const localFirst = row.firstName || user?.firstName || '';
          const localLast = row.lastName || user?.lastName || '';
          const rawBlood = fromBackendBloodType(row.bloodType) ?? (row.bloodType ?? '');
          reset({
            firstName: localFirst,
            middleName: row.middleName ?? '',
            lastName: localLast,
            suffix: row.suffix ?? '',
            sex: (row.sex as any) ?? '',
            dob: row.dob ?? '',
            placeOfBirth: row.placeOfBirth ?? '',
            civilStatus: (row.civilStatus as any) ?? '',
            bloodType: (rawBlood as any),
            nationality: row.nationality ?? '',
            ethnicity: row.ethnicity ?? '',
            religion: row.religion ?? '',
            primaryLanguage: row.primaryLanguage ?? '',
            educationLevel: (row.educationLevel as any) ?? '',
          });
        }
      } catch (err) {
        console.warn('[PersonalDemographics] Failed to read from local DB:', err);
      }

      // 2. Fetch latest data from backend API
      try {
        let serverData: PatientSummary | null = null;
        if (patientId) {
          try {
            const profile = await getPatientProfile(getToken, patientId);
            if (profile?.demographics) {
              serverData = profile.demographics;
            }
          } catch {
            if (user?.id) {
              serverData = await getPatientByClerkId(getToken, user.id);
            }
          }
        } else if (user?.id) {
          serverData = await getPatientByClerkId(getToken, user.id);
        }

        if (serverData && isMounted) {
          // Hydrate local SQLite
          await upsertPatientSummary(serverData, user?.id);

          // Update form if user has not started modifying it
          if (!isDirtyRef.current) {
            const validFirst = serverData.firstName || user?.firstName || '';
            const validLast = serverData.lastName || user?.lastName || '';
            const bloodVal = fromBackendBloodType(serverData.bloodType) ?? '';
            reset({
              firstName: validFirst,
              middleName: serverData.middleName ?? '',
              lastName: validLast,
              suffix: serverData.suffix ?? '',
              sex: (serverData.sex as any) ?? '',
              dob: serverData.dateOfBirth ?? '',
              placeOfBirth: serverData.placeOfBirth ?? '',
              civilStatus: (serverData.civilStatus as any) ?? '',
              bloodType: (bloodVal as any),
              nationality: serverData.nationality ?? '',
              ethnicity: serverData.ethnicity ?? '',
              religion: serverData.religion ?? '',
              primaryLanguage: serverData.primaryLanguage ?? '',
              educationLevel: (serverData.educationLevel as any) ?? '',
            });
          }
        } else if (!serverData && isMounted && !isDirtyRef.current) {
          // No DB row and no server data yet — pre-populate from Clerk profile
          reset((prev) => ({
            ...prev,
            firstName: prev.firstName || user?.firstName || '',
            lastName: prev.lastName || user?.lastName || '',
          }));
        }
      } catch (fetchErr) {
        console.warn('[PersonalDemographics] Failed to fetch server profile:', fetchErr);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [patientId, user?.id, user?.firstName, user?.lastName, getToken, reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        middleName: data.middleName ? data.middleName.trim() : null,
        suffix: data.suffix ? data.suffix.trim() : null,
        placeOfBirth: data.placeOfBirth ? data.placeOfBirth.trim() : null,
        nationality: data.nationality ? data.nationality.trim() : null,
        ethnicity: data.ethnicity ? data.ethnicity.trim() : null,
        religion: data.religion ? data.religion.trim() : null,
        primaryLanguage: data.primaryLanguage ? data.primaryLanguage.trim() : null,
        sex: data.sex || null,
        dob: data.dob || null,
        civilStatus: data.civilStatus || null,
        bloodType: data.bloodType || null,
        educationLevel: data.educationLevel || null,
      };

      // 1. Sync First Name and Last Name with Clerk user profile
      if (user) {
        try {
          await user.update({
            firstName: payload.firstName,
            lastName: payload.lastName,
          });
        } catch (clerkErr) {
          console.warn('[PersonalDemographics] Clerk user update failed:', clerkErr);
        }
      }

      // 2. Save to local SQLite
      const now = new Date();
      await db.insert(patients).values({
        id: patientId,
        clerkUserId: user?.id || patientId,
        ...payload,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: patients.id,
        set: { ...payload, updatedAt: now },
      });

      // 3. Persist snapshot to IndexedDB (on web)
      await flushDatabaseSnapshot();

      // 4. Directly update backend API
      try {
        let serverDemo: PatientSummary | null = null;
        try {
          const profile = await getPatientProfile(getToken, patientId);
          serverDemo = profile?.demographics ?? null;
        } catch {}

        const existing = await db.query.patients.findFirst({
          where: eq(patients.id, patientId),
        });

        await updatePatientDemographics(getToken, patientId, {
          firstName: payload.firstName,
          middleName: payload.middleName,
          lastName: payload.lastName,
          suffix: payload.suffix,
          sex: payload.sex,
          dateOfBirth: payload.dob,
          placeOfBirth: payload.placeOfBirth,
          civilStatus: payload.civilStatus,
          bloodType: payload.bloodType,
          nationality: payload.nationality,
          ethnicity: payload.ethnicity,
          religion: payload.religion,
          primaryLanguage: payload.primaryLanguage,
          educationLevel: payload.educationLevel,
          mobile: existing?.mobile || serverDemo?.mobile || null,
          altPhone: existing?.altPhone || serverDemo?.altPhone || null,
          email: existing?.email || serverDemo?.email || user?.primaryEmailAddress?.emailAddress || null,
          messengerHandle: existing?.messengerHandle || serverDemo?.messengerHandle || null,
          consentToShareInfo: existing?.consentToShareInfo ?? serverDemo?.consentToShareInfo ?? false,
        });

        if (serverDemo) {
          await upsertPatientSummary({
            ...serverDemo,
            firstName: payload.firstName,
            middleName: payload.middleName,
            lastName: payload.lastName,
            suffix: payload.suffix,
            sex: payload.sex,
            dateOfBirth: payload.dob,
            placeOfBirth: payload.placeOfBirth,
            civilStatus: payload.civilStatus,
            bloodType: payload.bloodType,
            nationality: payload.nationality,
            ethnicity: payload.ethnicity,
            religion: payload.religion,
            primaryLanguage: payload.primaryLanguage,
            educationLevel: payload.educationLevel,
          }, user?.id);
        }

        reset(data);
        DeviceEventEmitter.emit('profile-synced');
        dialog.alert('Saved', 'Your personal demographics have been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (apiErr: any) {
        console.error('[PersonalDemographics] Direct API update failed:', apiErr);
        const errorMsg = apiErr?.userMessage || apiErr?.message || 'Could not update demographics on the server.';
        dialog.alert(
          Platform.OS === 'web' ? 'Save Failed' : 'Saved Locally',
          Platform.OS === 'web'
            ? errorMsg
            : 'Changes were saved on your device and will be synced once connected.',
          Platform.OS === 'web'
            ? [{ text: 'OK' }]
            : [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (e: any) {
      console.error('[PersonalDemographics] Local save failed:', e);
      dialog.alert('Error', e?.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Screen width="form" scroll={false} padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, { padding: spacing.lg, paddingBottom: spacing['4xl'] }]}
          keyboardShouldPersistTaps="handled"
        >
          <ProfileSectionHeader title="Full Name" />
          <ProfileFormGrid>
            <Controller control={control} name="firstName" render={({ field }) => (
              <ProfileFormField label="First Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. Juan" useBottomSheetInput={false} />
            )} />
            <Controller control={control} name="middleName" render={({ field }) => (
              <ProfileFormField label="Middle Name" value={field.value} onChangeText={field.onChange} placeholder="e.g. Santos" useBottomSheetInput={false} />
            )} />
          </ProfileFormGrid>
          <ProfileFormGrid>
            <Controller control={control} name="lastName" render={({ field }) => (
              <ProfileFormField label="Last Name" value={field.value} onChangeText={field.onChange} required placeholder="e.g. dela Cruz" useBottomSheetInput={false} />
            )} />
            <Controller control={control} name="suffix" render={({ field }) => (
              <ProfileFormField label="Suffix" value={field.value} onChangeText={field.onChange} placeholder="e.g. Jr., III" useBottomSheetInput={false} />
            )} />
          </ProfileFormGrid>

          <ProfileSectionHeader title="Basic Information" />
          <ProfileFormGrid>
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
          </ProfileFormGrid>
          <ProfileFormGrid>
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
          </ProfileFormGrid>
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
          <ProfileFormGrid>
            <Controller control={control} name="nationality" render={({ field }) => (
              <ProfileFormField label="Nationality" value={field.value} onChangeText={field.onChange} useBottomSheetInput={false} />
            )} />
            <Controller control={control} name="ethnicity" render={({ field }) => (
              <ProfileFormField label="Ethnicity" value={field.value} onChangeText={field.onChange} placeholder="Optional" useBottomSheetInput={false} />
            )} />
          </ProfileFormGrid>
          <ProfileFormGrid>
            <Controller control={control} name="religion" render={({ field }) => (
              <ProfileFormField label="Religion" value={field.value} onChangeText={field.onChange} placeholder="Optional" useBottomSheetInput={false} />
            )} />
            <Controller control={control} name="primaryLanguage" render={({ field }) => (
              <ProfileFormField label="Primary Language" value={field.value} onChangeText={field.onChange} placeholder="e.g. Filipino" useBottomSheetInput={false} />
            )} />
          </ProfileFormGrid>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {},
});
