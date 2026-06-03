import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { prescriptions } from '@db/schema/prescriptions';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


export default function PrescriptionsScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.startDate))
      .then(setRecords).catch(console.error);
  }, []);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No prescriptions recorded yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.medicationName ?? 'Prescription'} />
          <ProfileReadOnlyField label="Prescribed Date" value={item.prescribedDate} />
          <ProfileReadOnlyField label="Prescriber" value={item.prescriberName} />
          <ProfileReadOnlyField label="Dosage" value={item.dosage} />
          <ProfileReadOnlyField label="Form" value={item.form} />
          <ProfileReadOnlyField label="Route" value={item.route} />
          <ProfileReadOnlyField label="Frequency" value={item.frequency} />
          <ProfileReadOnlyField label="Duration" value={item.duration} />
          <ProfileReadOnlyField label="Quantity Dispensed" value={item.quantityDispensed?.toString()} />
          <ProfileReadOnlyField label="Refills Remaining" value={item.refillsRemaining?.toString()} />
          <ProfileReadOnlyField label="Instructions" value={item.instructions} />
          <ProfileReadOnlyField label="Status" value={item.status} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
