import { useEffect, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform, View } from 'react-native';
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
import ThemedText from '@ui/ThemedText';
import { randomUUID } from 'expo-crypto';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { addToSyncQueue, syncPendingProfileWrites } from 'services/api/syncService';
import { dialog } from '@utils/dialog';

type PhilhealthCategory = 'MM' | 'DD';
type DisabilityType = 'Physical' | 'Sensory' | 'Intellectual' | 'Psychosocial';
type HmoPlanType = 'Individual' | 'Group' | 'Family';

interface Mod11Result {
  isValid: boolean;
  isComplete: boolean;
  expectedDigit?: number;
  actualDigit?: number;
  message?: string;
}

const MOD11_WEIGHTS = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function validatePhilHealthPinMod11(rawPin: string): Mod11Result {
  const digits = rawPin.replace(/\D/g, '');
  if (digits.length === 0) {
    return { isValid: false, isComplete: false };
  }
  if (digits.length < 12) {
    return {
      isValid: false,
      isComplete: false,
      message: `Incomplete PIN (${digits.length}/12 digits)`,
    };
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(digits[i], 10) * MOD11_WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expectedCheckDigit = (11 - remainder) % 11;
  const actualCheckDigit = parseInt(digits[11], 10);

  // In PhilHealth Modulus-11, check digit 10 can be represented as 0
  const isValid =
    (expectedCheckDigit === 10 && actualCheckDigit === 0) ||
    expectedCheckDigit === actualCheckDigit;

  return {
    isValid,
    isComplete: true,
    expectedDigit: expectedCheckDigit,
    actualDigit: actualCheckDigit,
    message: isValid
      ? '✓ Valid PhilHealth PIN (Mod-11 Verified)'
      : `⚠️ Check digit mismatch (Expected ${expectedCheckDigit}, found ${actualCheckDigit})`,
  };
}

type FormValues = {
  philhealthId: string;
  philhealthCategory: PhilhealthCategory | '';
  sponsorPin: string;
  sponsorLastName: string;
  sponsorFirstName: string;
  sponsorMiddleName: string;
  sponsorSuffix: string;
  sponsorDob: string;
  sponsorRelationship: 'S' | 'C' | 'P' | 'D' | '';
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
  { label: 'MM - Member', value: 'MM' },
  { label: 'DD - Dependent', value: 'DD' },
];

const SPONSOR_RELATIONSHIP_OPTIONS = [
  { label: 'Child (C)', value: 'C' },
  { label: 'Spouse (S)', value: 'S' },
  { label: 'Parent (P)', value: 'P' },
  { label: 'Disabled Dependent (D)', value: 'D' },
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

const formatPhilhealthId = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  let res = '';
  if (digits.length > 0) res += digits.slice(0, 2);
  if (digits.length > 2) res += '-' + digits.slice(2, 11);
  if (digits.length > 11) res += '-' + digits.slice(11, 12);
  return res;
};

const formatSssNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  let res = '';
  if (digits.length > 0) res += digits.slice(0, 2);
  if (digits.length > 2) res += '-' + digits.slice(2, 9);
  if (digits.length > 9) res += '-' + digits.slice(9, 10);
  return res;
};

const formatTinNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  let res = '';
  if (digits.length > 0) res += digits.slice(0, 3);
  if (digits.length > 3) res += '-' + digits.slice(3, 6);
  if (digits.length > 6) res += '-' + digits.slice(6, 9);
  if (digits.length > 9) res += '-' + digits.slice(9, 12);
  return res;
};

export default function GovernmentIdsScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'philhealth' | 'disability' | 'hmoPlan' | 'sponsorRel' | null>(null);

  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: {
      philhealthId: '', philhealthCategory: '',
      sponsorPin: '', sponsorLastName: '', sponsorFirstName: '', sponsorMiddleName: '',
      sponsorSuffix: '', sponsorDob: '', sponsorRelationship: '',
      sssNumber: '', gsisNumber: '',
      pagIbigNumber: '', tinNumber: '', seniorCitizenId: '',
      isPwd: false, pwdIdNumber: '', disabilityType: '',
      hmoProvider: '', hmoPolicyNumber: '', hmoPlanType: '',
      hmoCoverageStart: '', hmoCoverageEnd: '',
    },
  });

  const isPwd = watch('isPwd');
  const philhealthId = watch('philhealthId');
  const philhealthCategory = watch('philhealthCategory');
  const mod11Status = useMemo(() => validatePhilHealthPinMod11(philhealthId || ''), [philhealthId]);

  useEffect(() => {
    db.query.patientGovernmentIds.findFirst({ where: eq(patientGovernmentIds.patientId, patientId) })
      .then((row) => {
        if (row) {
          reset({
            philhealthId: row.philhealthId ?? '',
            philhealthCategory: row.philhealthCategory ?? '',
            sponsorPin: row.sponsorPin ?? '',
            sponsorLastName: row.sponsorLastName ?? '',
            sponsorFirstName: row.sponsorFirstName ?? '',
            sponsorMiddleName: row.sponsorMiddleName ?? '',
            sponsorSuffix: row.sponsorSuffix ?? '',
            sponsorDob: row.sponsorDob ?? '',
            sponsorRelationship: (row.sponsorRelationship as any) ?? '',
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
    if (data.philhealthCategory === 'DD') {
      if (!data.sponsorPin?.trim()) {
        dialog.alert('Required Field', 'For dependent benefits, Principal Member PIN is required.');
        return;
      }
      if (!data.sponsorLastName?.trim() || !data.sponsorFirstName?.trim()) {
        dialog.alert('Required Field', 'Principal Member Last Name and First Name are required.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        philhealthId: data.philhealthId,
        philhealthCategory: data.philhealthCategory || null,
        sponsorPin: data.sponsorPin || null,
        sponsorLastName: data.sponsorLastName || null,
        sponsorFirstName: data.sponsorFirstName || null,
        sponsorMiddleName: data.sponsorMiddleName || null,
        sponsorSuffix: data.sponsorSuffix || null,
        sponsorDob: data.sponsorDob || null,
        sponsorRelationship: (data.sponsorRelationship as any) || null,
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

      // Queue for background sync
      await addToSyncQueue('patient_government_ids', patientId, 'update', payload);
      syncPendingProfileWrites(patientId, getToken).catch(console.error);

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
          <>
            <ProfileFormField
              label="PhilHealth ID (PIN)"
              value={field.value}
              onChangeText={(text) => field.onChange(formatPhilhealthId(text))}
              keyboardType="numeric"
              placeholder="00-000000000-0"
              maxLength={14}
            />
            {mod11Status.message && (
              <View
                style={[
                  styles.mod11Badge,
                  mod11Status.isValid
                    ? styles.mod11BadgeValid
                    : mod11Status.isComplete
                    ? styles.mod11BadgeInvalid
                    : styles.mod11BadgeIncomplete,
                ]}
              >
                <ThemedText
                  style={[
                    styles.mod11BadgeText,
                    mod11Status.isValid
                      ? styles.mod11TextValid
                      : mod11Status.isComplete
                      ? styles.mod11TextInvalid
                      : styles.mod11TextIncomplete,
                  ]}
                >
                  {mod11Status.message}
                </ThemedText>
              </View>
            )}
          </>
        )} />
        <Controller control={control} name="philhealthCategory" render={({ field }) => (
          <ProfileFormField
            label="Category"
            value={PHILHEALTH_CATEGORY_OPTIONS.find(o => o.value === field.value)?.label || ''}
            onPressIn={() => setModal('philhealth')}
            placeholder="Select category"
          />
        )} />

        {philhealthCategory === 'DD' && (
          <View style={styles.sponsorCard}>
            <ThemedText style={styles.sponsorTitle}>Principal Member / Sponsor Credentials</ThemedText>
            <ThemedText style={styles.sponsorSubtitle}>
              Required for PhilHealth dependent benefits. Please provide the credentials of the sponsoring member.
            </ThemedText>

            <Controller control={control} name="sponsorPin" render={({ field }) => (
              <ProfileFormField
                label="Sponsoring Member PIN *"
                value={field.value}
                onChangeText={(text) => field.onChange(formatPhilhealthId(text))}
                keyboardType="numeric"
                placeholder="00-000000000-0"
                maxLength={14}
              />
            )} />

            <Controller control={control} name="sponsorRelationship" render={({ field }) => (
              <ProfileFormField
                label="Relationship to Member *"
                value={SPONSOR_RELATIONSHIP_OPTIONS.find(o => o.value === field.value)?.label || ''}
                onPressIn={() => setModal('sponsorRel')}
                placeholder="Select relationship"
              />
            )} />

            <Controller control={control} name="sponsorLastName" render={({ field }) => (
              <ProfileFormField
                label="Sponsor Last Name *"
                value={field.value}
                onChangeText={field.onChange}
                placeholder="Last Name"
              />
            )} />

            <Controller control={control} name="sponsorFirstName" render={({ field }) => (
              <ProfileFormField
                label="Sponsor First Name *"
                value={field.value}
                onChangeText={field.onChange}
                placeholder="First Name"
              />
            )} />

            <Controller control={control} name="sponsorMiddleName" render={({ field }) => (
              <ProfileFormField
                label="Sponsor Middle Name"
                value={field.value}
                onChangeText={field.onChange}
                placeholder="Middle Name (Optional)"
              />
            )} />

            <Controller control={control} name="sponsorSuffix" render={({ field }) => (
              <ProfileFormField
                label="Sponsor Suffix"
                value={field.value}
                onChangeText={field.onChange}
                placeholder="e.g. Jr, Sr, III"
              />
            )} />

            <Controller control={control} name="sponsorDob" render={({ field }) => (
              <ProfileDatePicker
                label="Sponsor Date of Birth"
                value={field.value}
                onChange={field.onChange}
              />
            )} />
          </View>
        )}

        <ProfileSectionHeader title="Other Government IDs" />
        <Controller control={control} name="sssNumber" render={({ field }) => (
          <ProfileFormField label="SSS Number" value={field.value} onChangeText={(text) => field.onChange(formatSssNumber(text))} keyboardType="numeric" placeholder="00-0000000-0" maxLength={12} />
        )} />
        <Controller control={control} name="gsisNumber" render={({ field }) => (
          <ProfileFormField label="GSIS Number" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
        )} />
        <Controller control={control} name="pagIbigNumber" render={({ field }) => (
          <ProfileFormField label="Pag-IBIG (HDMF) Number" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
        )} />
        <Controller control={control} name="tinNumber" render={({ field }) => (
          <ProfileFormField label="TIN Number" value={field.value} onChangeText={(text) => field.onChange(formatTinNumber(text))} keyboardType="numeric" placeholder="000-000-000-000" maxLength={15} />
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
      <Controller control={control} name="sponsorRelationship" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'sponsorRel'} title="Relationship to Sponsor" options={SPONSOR_RELATIONSHIP_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
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
  sponsorCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  sponsorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  sponsorSubtitle: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 12,
  },
  mod11Badge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: -8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  mod11BadgeValid: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  mod11BadgeInvalid: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#EF4444',
  },
  mod11BadgeIncomplete: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: '#F59E0B',
  },
  mod11BadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mod11TextValid: {
    color: '#059669',
  },
  mod11TextInvalid: {
    color: '#DC2626',
  },
  mod11TextIncomplete: {
    color: '#D97706',
  },
});
