import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import Screen from 'components/layout/Screen';
import { db } from '@db/index';
import { consultations } from '@db/schema/consultations';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';

export default function ConsultationsScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors, radii, spacing } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    db.select().from(consultations).where(eq(consultations.patientId, patientId)).orderBy(desc(consultations.visitDate))
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
        ListEmptyComponent={<ProfileSectionHeader title="" description="No consultations recorded yet." />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, flex: 1 }]}>
            <ProfileSectionHeader title={item.visitDate ? new Date(item.visitDate).toLocaleDateString() : 'Visit'} />
            <ProfileReadOnlyField label="Visit Type" value={item.visitType} />
            <ProfileReadOnlyField label="Clinic Source" value={getClinicName(item.clinicId) ?? item.clinicName ?? null} />
            <ProfileReadOnlyField label="Provider" value={item.doctorName} />
            <ProfileReadOnlyField label="Specialty" value={item.doctorSpecialty} />
            <ProfileReadOnlyField label="Chief Complaint" value={item.chiefComplaint} />
            <ProfileReadOnlyField label="Primary Diagnosis" value={item.primaryDiagnosis} />
            <ProfileReadOnlyField label="ICD-10 Code" value={item.icd10Code} />
            <ProfileReadOnlyField label="Secondary Diagnoses" value={item.secondaryDiagnoses} />
            <ProfileReadOnlyField label="SOAP Notes" value={item.soapNotes} />
            <ProfileReadOnlyField label="Treatment Plan" value={item.treatmentPlan} />
            <ProfileReadOnlyField label="Follow-up Instructions" value={item.followUpInstructions} />
            <ProfileReadOnlyField label="Follow-up Date" value={item.followUpDate} />
            <ProfileReadOnlyField label="Referral Issued" value={item.referralIssued} />
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
