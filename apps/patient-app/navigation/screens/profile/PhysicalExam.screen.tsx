import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { patientPhysicalExamProfile } from '@db/schema/patientPhysicalExamProfile';
import { desc, eq } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';


export default function PhysicalExamScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors } = useTheme();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select()
      .from(patientPhysicalExamProfile)
      .where(eq(patientPhysicalExamProfile.patientId, patientId))
      .orderBy(desc(patientPhysicalExamProfile.examDate))
      .then(setRecords)
      .catch(console.error);
  }, [patientId]);

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ListEmptyComponent={<ProfileSectionHeader title="" description="No physical examination records yet." />}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title={item.examDate ? new Date(item.examDate).toLocaleDateString() : 'Physical Exam'} />
          <ProfileReadOnlyField label="Clinic Source" value={getClinicName(item.clinicId) ?? null} />
          <ProfileReadOnlyField label="General Survey" value={item.genSurveyRem} />
          <ProfileReadOnlyField label="General Survey Code" value={item.genSurveyId} />
          <ProfileReadOnlyField label="Skin" value={item.skinRem} />
          <ProfileReadOnlyField label="Skin Codes" value={item.skinId} />
          <ProfileReadOnlyField label="HEENT" value={item.heentRem} />
          <ProfileReadOnlyField label="HEENT Codes" value={item.heentId} />
          <ProfileReadOnlyField label="Chest" value={item.chestRem} />
          <ProfileReadOnlyField label="Chest Codes" value={item.chestId} />
          <ProfileReadOnlyField label="Heart" value={item.heartRem} />
          <ProfileReadOnlyField label="Heart Codes" value={item.heartId} />
          <ProfileReadOnlyField label="Abdomen" value={item.abdomenRem} />
          <ProfileReadOnlyField label="Abdomen Codes" value={item.abdomenId} />
          <ProfileReadOnlyField label="Neurologic" value={item.neuroRem} />
          <ProfileReadOnlyField label="Neurologic Codes" value={item.neuroId} />
          <ProfileReadOnlyField label="Genitourinary" value={item.guRem} />
          <ProfileReadOnlyField label="Genitourinary Codes" value={item.guId} />
          <ProfileReadOnlyField label="Rectal" value={item.rectalRem} />
          <ProfileReadOnlyField label="Rectal Codes" value={item.rectalId} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
