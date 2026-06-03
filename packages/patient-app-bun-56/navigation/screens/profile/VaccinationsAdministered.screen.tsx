import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { vaccinationsAdministered } from '@db/schema/vaccinationsAdministered';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


export default function VaccinationsAdministeredScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(vaccinationsAdministered).where(eq(vaccinationsAdministered.patientId, patientId)).orderBy(desc(vaccinationsAdministered.dateAdministered))
      .then(setRecords).catch(console.error);
  }, []);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No vaccinations administered yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.vaccineName ?? 'Vaccination'} />
          <ProfileReadOnlyField label="Date Administered" value={item.dateAdministered} />
          <ProfileReadOnlyField label="Dose Number" value={item.doseNumber} />
          <ProfileReadOnlyField label="Lot / Batch" value={item.lotNumber} />
          <ProfileReadOnlyField label="Administered By" value={item.administeredBy} />
          <ProfileReadOnlyField label="Facility" value={item.facilityName} />
          <ProfileReadOnlyField label="Vaccine Program" value={item.vaccineProgram} />
          <ProfileReadOnlyField label="Adverse Reaction" value={item.adverseReaction} />
          <ProfileReadOnlyField label="Notes" value={item.notes} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
