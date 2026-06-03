import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { clinicalAssessments } from '@db/schema/clinicalAssessments';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


function prettyJson(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

export default function ClinicalAssessmentsScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(clinicalAssessments).where(eq(clinicalAssessments.patientId, patientId)).orderBy(desc(clinicalAssessments.date))
      .then(setRecords).catch(console.error);
  }, []);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No clinical assessments recorded yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.assessmentType ?? 'Assessment'} />
          <ProfileReadOnlyField label="Date" value={item.assessmentDate} />
          <ProfileReadOnlyField label="Assessed By" value={item.assessedBy} />
          <ProfileReadOnlyField label="Total Score" value={item.totalScore?.toString()} />
          <ProfileReadOnlyField label="Interpretation" value={item.interpretation} />
          <ProfileReadOnlyField label="Scores" value={prettyJson(item.scoresJson)} />
          <ProfileReadOnlyField label="Findings" value={prettyJson(item.findingsJson)} />
          <ProfileReadOnlyField label="Recommendations" value={item.recommendations} />
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
