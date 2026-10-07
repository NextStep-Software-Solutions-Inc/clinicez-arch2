import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller } from 'react-hook-form';
import { db } from '@db/index';
import { patientSocialHistory } from '@db/schema/patientSocialHistory';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import ProfileFormField from 'components/profile/ProfileFormField';
import ProfileSelectModal from 'components/profile/ProfileSelectModal';
import ProfileToggle from 'components/profile/ProfileToggle';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import ProfileSaveBar from 'components/profile/ProfileSaveBar';
import { usePatientId } from 'hooks/usePatientId';
import Screen from 'components/layout/Screen';
import { useAuth } from 'contexts/AuthContext';
import { useAppTheme } from 'contexts/ThemeContext';
import { dialog } from '@utils/dialog';
import { flushAndSyncProfile } from 'services/api/syncService';

type TobaccoStatus = 'Never' | 'Former' | 'Current';
type SleepQuality = 'Good' | 'Fair' | 'Poor';


type FormValues = {
  tobaccoStatus: TobaccoStatus | '';
  cigsPerDay: string;
  quitDate: string;
  otherTobaccoProducts: string;
  alcoholUseLevel: string;
  alcoholType: string;
  alcoholFrequencyDaysPerWeek: string;
  alcoholQuantityPerOccasion: string;
  substanceUse: boolean;
  substanceName: string;
  substanceRoute: string;
  substanceFrequency: string;
  activityLevel: string;
  exerciseType: string;
  exerciseFrequencyDaysPerWeek: string;
  dietPattern: string;
  foodRestrictions: string;
  sleepAvgHours: string;
  sleepQuality: SleepQuality | '';
  waterIntake: string;
  caffeineUse: string;
  dailyScreenTime: string;
};

const TOBACCO_OPTIONS = [
  { label: 'Never', value: 'Never' }, { label: 'Former', value: 'Former' }, { label: 'Current', value: 'Current' },
];
const ALCOHOL_OPTIONS = [
  { label: 'None', value: 'None' }, { label: 'Occasional', value: 'Occasional' }, { label: 'Moderate', value: 'Moderate' }, { label: 'Heavy', value: 'Heavy' },
];
const ACTIVITY_OPTIONS = [
  { label: 'Sedentary', value: 'Sedentary' }, { label: 'Lightly Active', value: 'LightlyActive' }, { label: 'Moderately Active', value: 'ModeratelyActive' }, { label: 'Very Active', value: 'VeryActive' },
];
const SLEEP_QUALITY_OPTIONS = [
  { label: 'Good', value: 'Good' }, { label: 'Fair', value: 'Fair' }, { label: 'Poor', value: 'Poor' },
];

export default function SocialHistoryScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const { spacing } = useAppTheme();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'tobacco' | 'alcohol' | 'activity' | 'sleep' | null>(null);

  const { control, handleSubmit, reset, watch, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: {
      tobaccoStatus: '', cigsPerDay: '', quitDate: '', otherTobaccoProducts: '',
      alcoholUseLevel: '', alcoholType: '', alcoholFrequencyDaysPerWeek: '', alcoholQuantityPerOccasion: '',
      substanceUse: false, substanceName: '', substanceRoute: '', substanceFrequency: '',
      activityLevel: '', exerciseType: '', exerciseFrequencyDaysPerWeek: '',
      dietPattern: '', foodRestrictions: '',
      sleepAvgHours: '', sleepQuality: '', waterIntake: '', caffeineUse: '', dailyScreenTime: '',
    },
  });

  const tobaccoStatus = watch('tobaccoStatus');
  const substanceUse = watch('substanceUse');
  const alcoholUseLevel = watch('alcoholUseLevel');

  useEffect(() => {
    db.query.patientSocialHistory.findFirst({ where: eq(patientSocialHistory.patientId, patientId) })
      .then((row) => {
        if (row) {
          reset({
            tobaccoStatus: row.tobaccoStatus ?? '',
            cigsPerDay: row.cigsPerDay?.toString() ?? '',
            quitDate: row.quitDate ?? '',
            otherTobaccoProducts: row.otherTobaccoProducts ?? '',
            alcoholUseLevel: row.alcoholUseLevel ?? '',
            alcoholType: row.alcoholType ?? '',
            alcoholFrequencyDaysPerWeek: row.alcoholFrequencyDaysPerWeek?.toString() ?? '',
            alcoholQuantityPerOccasion: row.alcoholQuantityPerOccasion?.toString() ?? '',
            substanceUse: row.substanceUse ?? false,
            substanceName: row.substanceName ?? '',
            substanceRoute: row.substanceRoute ?? '',
            substanceFrequency: row.substanceFrequency ?? '',
            activityLevel: row.activityLevel ?? '',
            exerciseType: row.exerciseType ?? '',
            exerciseFrequencyDaysPerWeek: row.exerciseFrequencyDaysPerWeek?.toString() ?? '',
            dietPattern: row.dietPattern ?? '',
            foodRestrictions: row.foodRestrictions ?? '',
            sleepAvgHours: row.sleepAvgHours?.toString() ?? '',
            sleepQuality: row.sleepQuality ?? '',
            waterIntake: row.waterIntake ?? '',
            caffeineUse: row.caffeineUse ?? '',
            dailyScreenTime: row.dailyScreenTime ?? '',
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
        tobaccoStatus: data.tobaccoStatus || null,
        cigsPerDay: data.cigsPerDay ? parseInt(data.cigsPerDay) : null,
        alcoholFrequencyDaysPerWeek: data.alcoholFrequencyDaysPerWeek ? parseInt(data.alcoholFrequencyDaysPerWeek) : null,
        alcoholQuantityPerOccasion: data.alcoholQuantityPerOccasion ? parseInt(data.alcoholQuantityPerOccasion, 10) : null,
        exerciseFrequencyDaysPerWeek: data.exerciseFrequencyDaysPerWeek ? parseInt(data.exerciseFrequencyDaysPerWeek) : null,
        sleepAvgHours: data.sleepAvgHours ? parseFloat(data.sleepAvgHours) : null,
        sleepQuality: data.sleepQuality || null,
        updatedAt: new Date(),
      };
      await db.insert(patientSocialHistory).values({
        id: randomUUID(), patientId: patientId, ...payload, createdAt: new Date(),
      }).onConflictDoUpdate({ target: patientSocialHistory.patientId, set: payload });

      await flushAndSyncProfile(patientId, getToken);
      reset(data);
      dialog.alert('Saved', 'Your social history has been updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      console.error(e);
      dialog.alert('Error', e?.message || 'Failed to save social history.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Screen width="form" scroll={false} padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { padding: spacing.md }]} keyboardShouldPersistTaps="handled">
          <ProfileSectionHeader title="Tobacco Use" />
        <Controller control={control} name="tobaccoStatus" render={({ field }) => (
          <ProfileFormField label="Tobacco Status" value={TOBACCO_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setModal('tobacco')} placeholder="Select status" picker />
        )} />
        {tobaccoStatus === 'Current' && (
          <Controller control={control} name="cigsPerDay" render={({ field }) => (
            <ProfileFormField label="Cigarettes Per Day" value={field.value} onChangeText={field.onChange} keyboardType="numeric" />
          )} />
        )}
        {tobaccoStatus === 'Former' && (
          <Controller control={control} name="quitDate" render={({ field }) => (
            <ProfileFormField label="Quit Date / Year" value={field.value} onChangeText={field.onChange} placeholder="e.g. 2020" />
          )} />
        )}
        {tobaccoStatus !== 'Never' && tobaccoStatus !== '' && (
          <Controller control={control} name="otherTobaccoProducts" render={({ field }) => (
            <ProfileFormField label="Other Tobacco Products" value={field.value} onChangeText={field.onChange} placeholder="e.g. Vape, Chewing tobacco" />
          )} />
        )}

        <ProfileSectionHeader title="Alcohol Use" />
        <Controller control={control} name="alcoholUseLevel" render={({ field }) => (
          <ProfileFormField label="Alcohol Use Level" value={ALCOHOL_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setModal('alcohol')} placeholder="Select level" picker />
        )} />
        {alcoholUseLevel !== 'None' && alcoholUseLevel !== '' && (
          <>
            <Controller control={control} name="alcoholType" render={({ field }) => (
              <ProfileFormField label="Type of Alcohol" value={field.value} onChangeText={field.onChange} placeholder="e.g. Beer, Wine, Spirits" />
            )} />
            <Controller control={control} name="alcoholFrequencyDaysPerWeek" render={({ field }) => (
              <ProfileFormField label="Days Per Week" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="0–7" />
            )} />
            <Controller control={control} name="alcoholQuantityPerOccasion" render={({ field }) => (
              <ProfileFormField label="Quantity Per Occasion" value={field.value} onChangeText={field.onChange} placeholder="e.g. 2 bottles" />
            )} />
          </>
        )}

        <ProfileSectionHeader title="Substance Use" />
        <Controller control={control} name="substanceUse" render={({ field }) => (
          <ProfileToggle label="Recreational Substance Use" value={field.value} onValueChange={field.onChange} />
        )} />
        {substanceUse && (
          <>
            <Controller control={control} name="substanceName" render={({ field }) => (
              <ProfileFormField label="Substance Name" value={field.value} onChangeText={field.onChange} placeholder="Optional" />
            )} />
            <Controller control={control} name="substanceRoute" render={({ field }) => (
              <ProfileFormField label="Route" value={field.value} onChangeText={field.onChange} placeholder="e.g. Oral, Inhaled" />
            )} />
            <Controller control={control} name="substanceFrequency" render={({ field }) => (
              <ProfileFormField label="Frequency" value={field.value} onChangeText={field.onChange} placeholder="e.g. Weekly" />
            )} />
          </>
        )}

        <ProfileSectionHeader title="Physical Activity" />
        <Controller control={control} name="activityLevel" render={({ field }) => (
          <ProfileFormField label="Activity Level" value={ACTIVITY_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setModal('activity')} placeholder="Select level" picker />
        )} />
        <Controller control={control} name="exerciseType" render={({ field }) => (
          <ProfileFormField label="Exercise Type" value={field.value} onChangeText={field.onChange} placeholder="e.g. Walking, Swimming, Gym" />
        )} />
        <Controller control={control} name="exerciseFrequencyDaysPerWeek" render={({ field }) => (
          <ProfileFormField label="Exercise Days Per Week" value={field.value} onChangeText={field.onChange} keyboardType="numeric" placeholder="0–7" />
        )} />

        <ProfileSectionHeader title="Diet & Nutrition" />
        <Controller control={control} name="dietPattern" render={({ field }) => (
          <ProfileFormField label="Diet Pattern" value={field.value} onChangeText={field.onChange} placeholder="e.g. Regular Filipino diet, Vegetarian" />
        )} />
        <Controller control={control} name="foodRestrictions" render={({ field }) => (
          <ProfileFormField label="Food Restrictions / Allergies" value={field.value} onChangeText={field.onChange} placeholder="e.g. Lactose-free, Low sodium" />
        )} />

        <ProfileSectionHeader title="Sleep & Wellness" />
        <Controller control={control} name="sleepAvgHours" render={({ field }) => (
          <ProfileFormField label="Average Sleep Hours" value={field.value} onChangeText={field.onChange} keyboardType="decimal-pad" placeholder="e.g. 7.5" />
        )} />
        <Controller control={control} name="sleepQuality" render={({ field }) => (
          <ProfileFormField label="Sleep Quality" value={SLEEP_QUALITY_OPTIONS.find(o => o.value === field.value)?.label || ''} onPressIn={() => setModal('sleep')} placeholder="Select quality" picker />
        )} />
        <Controller control={control} name="waterIntake" render={({ field }) => (
          <ProfileFormField label="Daily Water Intake" value={field.value} onChangeText={field.onChange} placeholder="e.g. 8 glasses" />
        )} />
        <Controller control={control} name="caffeineUse" render={({ field }) => (
          <ProfileFormField label="Caffeine Use" value={field.value} onChangeText={field.onChange} placeholder="e.g. 2 cups coffee/day" />
        )} />
        <Controller control={control} name="dailyScreenTime" render={({ field }) => (
          <ProfileFormField label="Daily Screen Time" value={field.value} onChangeText={field.onChange} placeholder="e.g. 6 hours" />
        )} />
      </ScrollView>

      <ProfileSaveBar onSave={onSave} saving={saving} isDirty={isDirty} />

      <Controller control={control} name="tobaccoStatus" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'tobacco'} title="Tobacco Status" options={TOBACCO_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
      )} />
      <Controller control={control} name="alcoholUseLevel" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'alcohol'} title="Alcohol Use Level" options={ALCOHOL_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
      )} />
      <Controller control={control} name="activityLevel" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'activity'} title="Activity Level" options={ACTIVITY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
      )} />
      <Controller control={control} name="sleepQuality" render={({ field }) => (
        <ProfileSelectModal visible={modal === 'sleep'} title="Sleep Quality" options={SLEEP_QUALITY_OPTIONS} selected={field.value} onSelect={field.onChange} onClose={() => setModal(null)} />
      )} />
    </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
});
