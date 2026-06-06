import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { vaccinationsAdministered } from '@db/schema/vaccinationsAdministered';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';


export default function VaccinationsAdministeredScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(vaccinationsAdministered).where(eq(vaccinationsAdministered.patientId, patientId)).orderBy(desc(vaccinationsAdministered.dateAdministered))
      .then(setRecords).catch(console.error);
  }, [patientId]);

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
          <ProfileReadOnlyField label="Disease Targeted" value={item.diseaseTargeted} />
          <ProfileReadOnlyField label="Dose Number" value={item.doseNumber} />
          <ProfileReadOnlyField label="Lot / Batch Number" value={item.lotBatchNumber} />
          <ProfileReadOnlyField label="Administered By" value={item.administeredBy} />
          <ProfileReadOnlyField label="Clinic Source" value={getClinicName(item.clinicId) ?? item.facility ?? null} />
          <ProfileReadOnlyField label="Route" value={item.route} />
          <ProfileReadOnlyField label="Injection Site" value={item.injectionSite} />
          <ProfileReadOnlyField label="Next Due Date" value={item.nextDueDate} />
          <ProfileReadOnlyField label="Vaccine Program" value={item.vaccineProgram} />
          <ProfileReadOnlyField label="Adverse Reaction" value={item.adverseReaction} />
          <ProfileReadOnlyField label="Adverse Reaction Details" value={item.adverseReactionDescription} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
