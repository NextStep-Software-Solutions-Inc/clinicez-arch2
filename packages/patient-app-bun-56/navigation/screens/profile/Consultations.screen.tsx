import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { consultations } from '@db/schema/consultations';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


export default function ConsultationsScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(consultations).where(eq(consultations.patientId, patientId)).orderBy(desc(consultations.visitDate))
      .then(setRecords).catch(console.error);
  }, []);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No consultations recorded yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.visitDate ? new Date(item.visitDate).toLocaleDateString() : 'Visit'} />
          <ProfileReadOnlyField label="Visit Type" value={item.visitType} />
          <ProfileReadOnlyField label="Provider" value={item.providerName} />
          <ProfileReadOnlyField label="Chief Complaint" value={item.chiefComplaint} />
          <ProfileReadOnlyField label="Primary Diagnosis" value={item.primaryDiagnosis} />
          <ProfileReadOnlyField label="Subjective Notes" value={item.subjectiveNotes} />
          <ProfileReadOnlyField label="Objective Notes" value={item.objectiveNotes} />
          <ProfileReadOnlyField label="Assessment" value={item.assessment} />
          <ProfileReadOnlyField label="Plan" value={item.plan} />
          <ProfileReadOnlyField label="Follow-up Date" value={item.followUpDate} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
