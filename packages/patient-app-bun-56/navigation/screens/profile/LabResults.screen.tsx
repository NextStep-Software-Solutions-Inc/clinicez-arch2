import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { labResults } from '@db/schema/labResults';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


export default function LabResultsScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(labResults).where(eq(labResults.patientId, patientId)).orderBy(desc(labResults.dateResulted))
      .then(setRecords).catch(console.error);
  }, []);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No lab results recorded yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.testName ?? 'Lab Result'} />
          <ProfileReadOnlyField label="Collection Date" value={item.collectionDate} />
          <ProfileReadOnlyField label="Result Date" value={item.resultDate} />
          <ProfileReadOnlyField label="Value" value={item.value} />
          <ProfileReadOnlyField label="Unit" value={item.unit} />
          <ProfileReadOnlyField label="Reference Range" value={item.referenceRange} />
          <ProfileReadOnlyField label="Flag" value={item.flag} />
          <ProfileReadOnlyField label="Lab Name" value={item.labName} />
          <ProfileReadOnlyField label="Ordered By" value={item.orderedBy} />
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
