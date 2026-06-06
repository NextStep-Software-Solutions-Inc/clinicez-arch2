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
  }, [patientId]);

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
          <ProfileReadOnlyField label="Clinic" value={item.clinicName} />
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
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
