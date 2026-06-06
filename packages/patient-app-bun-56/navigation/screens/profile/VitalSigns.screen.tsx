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
  }, [patientId]);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No vital signs recorded yet. These are added by your healthcare provider." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.measuredAt ? new Date(item.measuredAt).toLocaleDateString() : 'Recorded'} />
          <ProfileReadOnlyField label="Blood Pressure" value={item.bpSystolic && item.bpDiastolic ? `${item.bpSystolic}/${item.bpDiastolic} mmHg` : null} />
          <ProfileReadOnlyField label="Heart Rate" value={item.heartRateBpm ? `${item.heartRateBpm} bpm` : null} />
          <ProfileReadOnlyField label="Respiratory Rate" value={item.respiratoryRate ? `${item.respiratoryRate} breaths/min` : null} />
          <ProfileReadOnlyField label="Temperature" value={item.temperatureCelsius ? `${item.temperatureCelsius} °C` : null} />
          <ProfileReadOnlyField label="Oxygen Saturation" value={item.spO2Percent ? `${item.spO2Percent}%` : null} />
          <ProfileReadOnlyField label="Weight" value={item.weightKg ? `${item.weightKg} kg` : null} />
          <ProfileReadOnlyField label="Height" value={item.heightCm ? `${item.heightCm} cm` : null} />
          <ProfileReadOnlyField label="BMI" value={item.bmi?.toString() ?? null} />
          <ProfileReadOnlyField label="Blood Glucose" value={item.fastingBloodGlucose ? `${item.fastingBloodGlucose} mg/dL` : null} />
          <ProfileReadOnlyField label="Recorded By" value={item.takenBy} />
          <ProfileReadOnlyField label="Facility" value={item.facility} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
