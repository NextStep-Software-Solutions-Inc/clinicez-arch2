import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import Screen from 'components/layout/Screen';
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
  const { colors, radii, spacing } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(vaccinationsAdministered).where(eq(vaccinationsAdministered.patientId, patientId)).orderBy(desc(vaccinationsAdministered.dateAdministered))
      .then(setRecords).catch(console.error);
  }, [patientId]);

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
        ListEmptyComponent={<ProfileSectionHeader title="" description="No vaccinations administered yet." />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, flex: 1 }]}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {},
  card: { borderWidth: StyleSheet.hairlineWidth },
});
