import { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db, flushDatabaseSnapshot } from '@db/index';
import { patients } from '@db/schema/patients';
import { and, eq, ne } from 'drizzle-orm';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import Screen from 'components/layout/Screen';
import { useUser } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { getPatientProfile, updatePatientDemographics, type PatientSummary } from 'services/api/patientApi';
import { flushAndSyncProfile } from 'services/api/syncService';
import { upsertPatientSummary } from '@db/hydrate';
import { useProfileSync } from 'hooks/useProfileSync';
import { useSafeHeaderHeight } from 'hooks/useSafeHeaderHeight';

type FormValues = {
  mobile: string;
  altPhone: string;
  email: string;
  messengerHandle: string;
};

export default function ContactInfoScreen() {
  const patientId = usePatientId();
  const { user } = useUser();
  const { userId, getToken } = useAuth();
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const navigation = useNavigation();
  const { spacing } = useAppTheme();
  const headerHeight = useSafeHeaderHeight();
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { mobile: '', altPhone: '', email: accountEmail, messengerHandle: '' },
  });

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const loadLocal = useCallback(async () => {
    if (!patientId || isDirtyRef.current) return;
    try {
      const row = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });
      if (row && !isDirtyRef.current) {
        reset({
          mobile: row.mobile ?? '',
          altPhone: row.altPhone ?? '',
          email: row.email || accountEmail,
          messengerHandle: row.messengerHandle ?? '',
        });
      }
    } catch (err) {
      console.warn('[ContactInfo] Failed to read from local DB:', err);
    }
  }, [patientId, reset, accountEmail]);

  useProfileSync(loadLocal);

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
            email: row.email || accountEmail,
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
          if (profile?.demographics && isMounted) {
            await upsertPatientSummary(profile.demographics, userId);
            if (!isDirtyRef.current) {
              reset({
                mobile: profile.demographics.mobile ?? '',
                altPhone: profile.demographics.altPhone ?? '',
                email: profile.demographics.email || accountEmail,
                messengerHandle: profile.demographics.messengerHandle ?? '',
              });
            }
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
  }, [patientId, getToken, reset, accountEmail, userId]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      let serverDemo: PatientSummary | null = null;
      try {
        const profile = await getPatientProfile(getToken, patientId);
        serverDemo = profile?.demographics ?? null;
      } catch (e) {
        console.warn('[ContactInfo] Could not fetch server profile before save:', e);
      }

      const existing = await db.query.patients.findFirst({ where: eq(patients.id, patientId) });

      const cleanServerFirst = serverDemo?.firstName?.trim() || null;
      const cleanDbFirst = existing?.firstName?.trim() || null;
      const cleanClerkFirst = user?.firstName?.trim() || null;
      const firstName = cleanServerFirst || cleanDbFirst || cleanClerkFirst || user?.fullName?.trim() || 'Patient';

      const cleanServerLast = serverDemo?.lastName?.trim() || null;
      const cleanDbLast = existing?.lastName?.trim() || null;
      const cleanClerkLast = user?.lastName?.trim() || null;
      const lastName = cleanServerLast || cleanDbLast || cleanClerkLast || '';

      const payload = {
        mobile: data.mobile.trim() || null,
        altPhone: data.altPhone.trim() || null,
        email: (data.email.trim() || accountEmail) || null,
        messengerHandle: data.messengerHandle.trim() || null,
      };

      const now = new Date();
      if (userId) {
        await db
          .delete(patients)
          .where(and(eq(patients.clerkUserId, userId), ne(patients.id, patientId)));
      }
      if (existing) {
        await db
          .update(patients)
          .set({
            ...payload,
            firstName,
            lastName,
            updatedAt: now,
          })
          .where(eq(patients.id, patientId));
      } else {
        await db.insert(patients).values({
          id: patientId,
          clerkUserId: userId || patientId,
          firstName,
          lastName,
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
          firstName,
          middleName: serverDemo?.middleName ?? existing?.middleName ?? null,
          lastName,
          suffix: serverDemo?.suffix ?? existing?.suffix ?? null,
          sex: serverDemo?.sex ?? existing?.sex ?? null,
          dateOfBirth: serverDemo?.dateOfBirth ?? existing?.dob ?? null,
          placeOfBirth: serverDemo?.placeOfBirth ?? existing?.placeOfBirth ?? null,
          civilStatus: serverDemo?.civilStatus ?? existing?.civilStatus ?? null,
          bloodType: (serverDemo?.bloodType && serverDemo.bloodType !== 'Unknown' ? serverDemo.bloodType : null) ?? (existing?.bloodType && existing.bloodType !== 'Unknown' ? existing.bloodType : null),
          nationality: serverDemo?.nationality ?? existing?.nationality ?? null,
          ethnicity: serverDemo?.ethnicity ?? existing?.ethnicity ?? null,
          religion: serverDemo?.religion ?? existing?.religion ?? null,
          primaryLanguage: serverDemo?.primaryLanguage ?? existing?.primaryLanguage ?? null,
          educationLevel: serverDemo?.educationLevel ?? existing?.educationLevel ?? null,
          mobile: payload.mobile,
          altPhone: payload.altPhone,
          email: payload.email,
          messengerHandle: payload.messengerHandle,
          consentToShareInfo: serverDemo?.consentToShareInfo ?? existing?.consentToShareInfo ?? false,
        });

        if (serverDemo) {
          await upsertPatientSummary({
            ...serverDemo,
            id: patientId,
            firstName,
            lastName,
            mobile: payload.mobile,
            altPhone: payload.altPhone,
            email: payload.email,
            messengerHandle: payload.messengerHandle,
          }, userId);
        }

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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[styles.content, { padding: spacing.md }]}
        >
          <ProfileSectionHeader title="Phone Numbers" />
          <Controller control={control} name="mobile" render={({ field }) => (
            <ProfileFormField label="Mobile Number" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" placeholder="+63 9XX XXX XXXX" required />
          )} />
          <Controller control={control} name="altPhone" render={({ field }) => (
            <ProfileFormField label="Alternative Phone" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" placeholder="Optional" />
          )} />

          <ProfileSectionHeader title="Online / Messaging" />
          <Controller control={control} name="email" render={({ field }) => (
            <ProfileFormField
              label="Email Address"
              value={field.value || accountEmail}
              editable={false}
              autoCapitalize="none"
              placeholder="you@example.com"
            />
          )} />
          <ThemedText
            variant="caption"
            color="textMuted"
            style={{ marginTop: -spacing.xs, marginBottom: spacing.md }}
          >
            Email address is tied to your account login and cannot be edited here.
          </ThemedText>
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
  content: { paddingBottom: 48 },
});
