import { useEffect, useState, useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import Screen from 'components/layout/Screen';
import { db } from '@db/index';
import { patientPhysicalExamProfile } from '@db/schema/patientPhysicalExamProfile';
import { desc, eq } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';
import { useProfileSync } from 'hooks/useProfileSync';

export default function PhysicalExamScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors, radii, spacing } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const [records, setRecords] = useState<any[]>([]);

  const load = useCallback(() => {
    db.select()
      .from(patientPhysicalExamProfile)
      .where(eq(patientPhysicalExamProfile.patientId, patientId))
      .orderBy(desc(patientPhysicalExamProfile.examDate))
      .then(setRecords)
      .catch(console.error);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useProfileSync(load);

  return (
    <Screen width="content" scroll={false} padded={false}>
      <FlatList
        key={isDesktop ? 'grid-2' : 'list-1'}
        numColumns={isDesktop ? 2 : 1}
        data={records}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.md }]}
        columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
        ListEmptyComponent={<ProfileSectionHeader title="" description="No physical examination records yet." />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, flex: 1 }]}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {},
  card: { borderWidth: StyleSheet.hairlineWidth },
});
