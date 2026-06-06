import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { imagingResults } from '@db/schema/imagingResults';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


export default function ImagingResultsScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(imagingResults).where(eq(imagingResults.patientId, patientId)).orderBy(desc(imagingResults.examDate))
      .then(setRecords).catch(console.error);
  }, [patientId]);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No imaging results recorded yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={[item.imagingType, item.bodyPart].filter(Boolean).join(' — ') || 'Imaging Result'} />
          <ProfileReadOnlyField label="Date" value={item.examDate} />
          <ProfileReadOnlyField label="Imaging Type" value={item.imagingType} />
          <ProfileReadOnlyField label="Body Part" value={item.bodyPart} />
          <ProfileReadOnlyField label="Radiologist" value={item.radiologist} />
          <ProfileReadOnlyField label="Findings" value={item.findings} />
          <ProfileReadOnlyField label="Impression" value={item.impression} />
          <ProfileReadOnlyField label="Recommendation" value={item.recommendation} />
          <ProfileReadOnlyField label="Ordered By" value={item.orderingPhysician} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
