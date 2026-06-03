import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { vitalSigns } from '@db/schema/vitalSigns';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


export default function VitalSignsScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(vitalSigns).where(eq(vitalSigns.patientId, patientId)).orderBy(desc(vitalSigns.measuredAt))
      .then(setRecords).catch(console.error);
  }, []);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No vital signs recorded yet. These are added by your healthcare provider." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.recordedAt ? new Date(item.recordedAt).toLocaleDateString() : 'Recorded'} />
          <ProfileReadOnlyField label="Blood Pressure" value={item.bloodPressureSystolic && item.bloodPressureDiastolic ? `${item.bloodPressureSystolic}/${item.bloodPressureDiastolic} mmHg` : null} />
          <ProfileReadOnlyField label="Heart Rate" value={item.heartRate ? `${item.heartRate} bpm` : null} />
          <ProfileReadOnlyField label="Respiratory Rate" value={item.respiratoryRate ? `${item.respiratoryRate} breaths/min` : null} />
          <ProfileReadOnlyField label="Temperature" value={item.temperatureCelsius ? `${item.temperatureCelsius} °C` : null} />
          <ProfileReadOnlyField label="Oxygen Saturation" value={item.oxygenSaturation ? `${item.oxygenSaturation}%` : null} />
          <ProfileReadOnlyField label="Weight" value={item.weightKg ? `${item.weightKg} kg` : null} />
          <ProfileReadOnlyField label="Height" value={item.heightCm ? `${item.heightCm} cm` : null} />
          <ProfileReadOnlyField label="BMI" value={item.bmi?.toString() ?? null} />
          <ProfileReadOnlyField label="Blood Glucose" value={item.bloodGlucose ? `${item.bloodGlucose} mg/dL` : null} />
          <ProfileReadOnlyField label="Recorded By" value={item.recordedBy} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
