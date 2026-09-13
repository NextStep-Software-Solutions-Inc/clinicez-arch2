import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { prescriptions } from '@db/schema/prescriptions';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';


export default function PrescriptionsScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.startDate))
      .then(setRecords).catch(console.error);
  }, [patientId]);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No prescriptions recorded yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.drugName ?? 'Prescription'} />
          <ProfileReadOnlyField label="Drug Name" value={item.drugName} />
          <ProfileReadOnlyField label="Generic Name" value={item.genericName} />
          <ProfileReadOnlyField label="Dosage" value={item.dosage} />
          <ProfileReadOnlyField label="Dosage Form" value={item.dosageForm} />
          <ProfileReadOnlyField label="Route" value={item.route} />
          <ProfileReadOnlyField label="Frequency" value={item.frequency} />
          <ProfileReadOnlyField label="Duration" value={item.duration} />
          <ProfileReadOnlyField label="Indication" value={item.indication} />
          <ProfileReadOnlyField label="Start Date" value={item.startDate} />
          <ProfileReadOnlyField label="End Date" value={item.endDate} />
          <ProfileReadOnlyField label="Clinic Source" value={getClinicName(item.clinicId) ?? item.prescribingPhysician ?? null} />
          <ProfileReadOnlyField label="Prescribing Physician" value={item.prescribingPhysician} />
          <ProfileReadOnlyField
            label="Refills Allowed"
            value={item.refillsAllowed === null || item.refillsAllowed === undefined ? null : String(item.refillsAllowed)}
          />
          <ProfileReadOnlyField label="Special Instructions" value={item.specialInstructions} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
