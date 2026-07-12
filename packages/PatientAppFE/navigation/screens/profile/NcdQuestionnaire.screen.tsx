import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { db } from '@db/index';
import { patientNcdQuestionnaire } from '@db/schema/patientNcdQuestionnaire';
import { eq } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { usePatientId } from 'hooks/usePatientId';


type QRecord = Record<string, unknown>;

function ynLabel(value: unknown): string | null {
  if (value === 'Y') return 'Yes';
  if (value === 'N') return 'No';
  return null;
}

function ynxLabel(value: unknown): string | null {
  if (value === 'Y') return 'Yes';
  if (value === 'N') return 'No';
  if (value === 'X') return 'Not sure';
  return null;
}

function q17Label(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const options: Record<string, string> = {
    A: 'Option A',
    B: 'Option B',
    C: 'Option C',
    D: 'Option D',
    E: 'Option E',
  };

  return options[value.toUpperCase()] ?? value;
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  return String(value);
}

export default function NcdQuestionnaireScreen() {
  const patientId = usePatientId();
  const { colors } = useTheme();
  const [record, setRecord] = useState<QRecord | null>(null);

  useEffect(() => {
    db.select()
      .from(patientNcdQuestionnaire)
      .where(eq(patientNcdQuestionnaire.patientId, patientId))
      .then((rows) => setRecord(rows[0] ?? null))
      .catch(console.error);
  }, [patientId]);

  if (!record) {
    return (
      <FlatList
        data={[]}
        keyExtractor={(_, index) => String(index)}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListEmptyComponent={<ProfileSectionHeader title="" description="No NCD questionnaire recorded yet." />}
        renderItem={() => null}
      />
    );
  }

  const lifestyleItems = [
    { label: 'Question 1', value: ynLabel(record.qid1Yn) },
    { label: 'Question 2', value: ynLabel(record.qid2Yn) },
    { label: 'Question 3', value: ynLabel(record.qid3Yn) },
    { label: 'Question 4', value: ynLabel(record.qid4Yn) },
    { label: 'Question 5', value: ynxLabel(record.qid5Ynx) },
    { label: 'Question 6', value: ynLabel(record.qid6Yn) },
    { label: 'Question 7', value: ynLabel(record.qid7Yn) },
    { label: 'Question 8', value: ynLabel(record.qid8Yn) },
    { label: 'Question 9', value: ynLabel(record.qid9Yn) },
    { label: 'Question 10', value: ynLabel(record.qid10Yn) },
    { label: 'Question 11', value: ynLabel(record.qid11Yn) },
    { label: 'Question 12', value: ynLabel(record.qid12Yn) },
    { label: 'Question 13', value: ynLabel(record.qid13Yn) },
    { label: 'Question 14', value: ynLabel(record.qid14Yn) },
    { label: 'Question 15', value: ynLabel(record.qid15Yn) },
    { label: 'Question 16', value: ynLabel(record.qid16Yn) },
    { label: 'Question 17', value: q17Label(record.qid17Abcde) },
    { label: 'Question 18', value: ynLabel(record.qid18Yn) },
    { label: 'Question 23', value: ynLabel(record.qid23Yn) },
    { label: 'Question 24', value: ynLabel(record.qid24Yn) },
  ];

  return (
    <FlatList
      data={[record]}
      keyExtractor={(item) => String(item.id ?? patientId)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      renderItem={() => (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ProfileSectionHeader title="NCD Risk Questionnaire" description="Responses recorded by your healthcare provider." />

          {lifestyleItems.map((item) => (
            <ProfileReadOnlyField key={item.label} label={item.label} value={item.value} />
          ))}

          <ProfileSectionHeader title="Laboratory Checks" />
          <ProfileReadOnlyField label="Question 19" value={ynLabel(record.qid19Yn)} />
          <ProfileReadOnlyField label="Fasting Blood Sugar (mg/dL)" value={formatValue(record.qid19FbsMgdl)} />
          <ProfileReadOnlyField label="Fasting Blood Sugar (mmol/L)" value={formatValue(record.qid19FbsMmol)} />
          <ProfileReadOnlyField label="Fasting Blood Sugar Date" value={formatValue(record.qid19FbsDate)} />

          <ProfileReadOnlyField label="Question 20" value={ynLabel(record.qid20Yn)} />
          <ProfileReadOnlyField label="Cholesterol Value" value={formatValue(record.qid20CholeVal)} />
          <ProfileReadOnlyField label="Cholesterol Date" value={formatValue(record.qid20CholeDate)} />

          <ProfileReadOnlyField label="Question 21" value={ynLabel(record.qid21Yn)} />
          <ProfileReadOnlyField label="Urine Ketones Value" value={formatValue(record.qid21KetonVal)} />
          <ProfileReadOnlyField label="Urine Ketones Date" value={formatValue(record.qid21KetonDate)} />

          <ProfileReadOnlyField label="Question 22" value={ynLabel(record.qid22Yn)} />
          <ProfileReadOnlyField label="Urine Protein Value" value={formatValue(record.qid22ProteinVal)} />
          <ProfileReadOnlyField label="Urine Protein Date" value={formatValue(record.qid22ProteinDate)} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
});
