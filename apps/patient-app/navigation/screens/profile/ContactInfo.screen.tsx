import { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db, flushDatabaseSnapshot } from '@db/index';
import { patients } from '@db/schema/patients';
import { eq } from 'drizzle-orm';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import Screen from 'components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { getPatientProfile, updatePatientDemographics } from 'services/api/patientApi';
import { flushAndSyncProfile } from 'services/api/syncService';

type FormValues = {
  mobile: string;
  altPhone: string;
  email: string;
  messengerHandle: string;
};

export default function ContactInfoScreen() {
  const patientId = usePatientId();
  const { userId, getToken } = useAuth();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { mobile: '', altPhone: '', email: '', messengerHandle: '' },
  });

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. Read from local SQLite
      try {
        const row = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });
        if (row && isMounted) {
          reset({
            mobile: row.mobile ?? '',
            altPhone: row.altPhone ?? '',
            email: row.email ?? '',
            messengerHandle: row.messengerHandle ?? '',
          });
        }
      } catch (err) {
        console.warn('[ContactInfo] Failed to read from local DB:', err);
      }

      // 2. Fetch latest server profile to ensure freshness
      try {
        if (patientId) {
          const profile = await getPatientProfile(getToken, patientId);
          if (profile?.demographics && isMounted && !isDirtyRef.current) {
            reset({
              mobile: profile.demographics.mobile ?? '',
              altPhone: profile.demographics.altPhone ?? '',
              email: profile.demographics.email ?? '',
              messengerHandle: profile.demographics.messengerHandle ?? '',
            });
          }
        }
      } catch (fetchErr) {
        console.warn('[ContactInfo] Failed to fetch server profile:', fetchErr);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [patientId, getToken, reset]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const existing = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });

      const payload = {
        mobile: data.mobile.trim() || null,
        altPhone: data.altPhone.trim() || null,
        email: data.email.trim() || null,
        messengerHandle: data.messengerHandle.trim() || null,
      };

      const now = new Date();
      if (existing) {
        await db
          .update(patients)
          .set({ ...payload, updatedAt: now })
          .where(eq(patients.id, patientId));
      } else {
        await db.insert(patients).values({
          id: patientId,
          clerkUserId: userId || patientId,
          firstName: 'Unknown',
          lastName: 'Unknown',
          ...payload,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Flush to IndexedDB on web
      await flushDatabaseSnapshot();

      // Directly update backend API
      try {
        await updatePatientDemographics(getToken, patientId, {
          firstName: existing?.firstName ?? 'Unknown',
          middleName: existing?.middleName ?? null,
          lastName: existing?.lastName ?? 'Unknown',
          suffix: existing?.suffix ?? null,
          sex: existing?.sex ?? null,
          dateOfBirth: existing?.dob ?? null,
          placeOfBirth: existing?.placeOfBirth ?? null,
          civilStatus: existing?.civilStatus ?? null,
          bloodType: existing?.bloodType ?? null,
          nationality: existing?.nationality ?? 'Filipino',
          ethnicity: existing?.ethnicity ?? null,
          religion: existing?.religion ?? null,
          primaryLanguage: existing?.primaryLanguage ?? null,
          educationLevel: existing?.educationLevel ?? null,
          mobile: payload.mobile,
          altPhone: payload.altPhone,
          email: payload.email,
          messengerHandle: payload.messengerHandle,
          consentToShareInfo: existing?.consentToShareInfo ?? false,
        });

        // Push any remaining sync queue items
        await flushAndSyncProfile(patientId, getToken);

        reset(data);
        dialog.alert('Saved', 'Your contact information has been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (apiErr: any) {
        console.error('[ContactInfo] Direct API update failed:', apiErr);
        const errorMsg = apiErr?.userMessage || apiErr?.message || 'Could not update contact info on the server.';
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
      console.error('[ContactInfo] Local save failed:', e);
      dialog.alert('Error', e?.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Screen width="form" scroll={false} padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]} keyboardShouldPersistTaps="handled">
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24 },
});
