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
import Screen from 'components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';
import { getPatientFullRecord } from 'services/api/patientApi';
import { hydrateFullRecord } from '@db/hydrate';

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
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [lensesModal, setLensesModal] = useState(false);

  const { control, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { dentistName: '', dentistClinic: '', orthodonticDevice: '', eyeDoctorName: '', correctiveLenses: '' },
  });

  const [hasRecord, setHasRecord] = useState(false);

  useEffect(() => {
    let isMounted = true;
    db.query.patientDentalVision.findFirst({ where: eq(patientDentalVision.patientId, patientId) })
      .then(async (row) => {
        if (!isMounted) return;
        if (row) {
          setHasRecord(true);
          reset({
            dentistName: row.dentistName ?? '',
            dentistClinic: row.dentistClinic ?? '',
            orthodonticDevice: row.orthodonticDevice ?? '',
            eyeDoctorName: row.eyeDoctorName ?? '',
            correctiveLenses: (row.correctiveLenses as CorrectiveLenses) ?? '',
          });
        } else if (getToken && patientId) {
          try {
            const fullRecord = await getPatientFullRecord(getToken, patientId);
            if (fullRecord && isMounted) {
              await hydrateFullRecord(fullRecord);
              const hydratedRow = await db.query.patientDentalVision.findFirst({
                where: eq(patientDentalVision.patientId, patientId),
              });
              if (hydratedRow && isMounted) {
                setHasRecord(true);
                reset({
                  dentistName: hydratedRow.dentistName ?? '',
                  dentistClinic: hydratedRow.dentistClinic ?? '',
                  orthodonticDevice: hydratedRow.orthodonticDevice ?? '',
                  eyeDoctorName: hydratedRow.eyeDoctorName ?? '',
                  correctiveLenses: (hydratedRow.correctiveLenses as CorrectiveLenses) ?? '',
                });
              }
            }
          } catch (fetchErr) {
            console.warn('[DentalVision] Could not hydrate full record from server:', fetchErr);
          }
        }
      })
      .catch(console.error);

    return () => {
      isMounted = false;
    };
  }, [patientId, reset, getToken]);

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const payload = {
        patientId,
        dentistName: data.dentistName.trim() || null,
        dentistClinic: data.dentistClinic.trim() || null,
        orthodonticDevice: data.orthodonticDevice.trim() || null,
        eyeDoctorName: data.eyeDoctorName.trim() || null,
        correctiveLenses: data.correctiveLenses || null,
        updatedAt: new Date(),
      };

      if (hasRecord) {
        await db
          .update(patientDentalVision)
          .set(payload)
          .where(eq(patientDentalVision.patientId, patientId));
      } else {
        await db.insert(patientDentalVision).values({
          id: randomUUID(),
          ...payload,
          createdAt: new Date(),
        });
        setHasRecord(true);
      }

      const syncResult = await flushAndSyncProfile(patientId, getToken);

      if (syncResult.isOffline) {
        reset(data);
        dialog.alert('Saved Offline', 'Your dental & vision record has been saved locally and will sync when you are back online.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else if (!syncResult.success && syncResult.failed > 0) {
        reset(data);
        dialog.alert(
          'Sync Warning',
          `Saved locally, but server sync failed: ${syncResult.reason || 'Server conflict or validation error'}. Changes will retry automatically.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        reset(data);
        dialog.alert('Saved', 'Your dental & vision record has been updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save dental & vision record.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Screen width="form" scroll={false} padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]} keyboardShouldPersistTaps="handled">
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
            <ProfileFormField label="Corrective Lenses" value={LENSES_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setLensesModal(true)} placeholder="Select option" picker />
          )} />
        </ScrollView>
        <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />
        <Controller control={control} name="correctiveLenses" render={({ field }) => (
          <ProfileSelectModal visible={lensesModal} title="Corrective Lenses" options={LENSES_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setLensesModal(false)} />
        )} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24 },
});
