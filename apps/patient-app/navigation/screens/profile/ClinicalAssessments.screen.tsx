import { useEffect, useState, useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import Screen from 'components/layout/Screen';
import { db } from '@db/index';
import { clinicalAssessments } from '@db/schema/clinicalAssessments';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';
import { useProfileSync } from 'hooks/useProfileSync';


function humanizeLabel(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStructuredValue(value: unknown, depth = 0): string {
  const indent = '  '.repeat(depth);

  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '—';
    }

    return value
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return `${indent}•\n${formatStructuredValue(entry, depth + 1)}`;
        }

        return `${indent}• ${String(entry)}`;
      })
      .join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    if (!entries.length) {
      return '—';
    }

    return entries
      .map(([key, entry]) => {
        const formatted = formatStructuredValue(entry, depth + 1);
        return formatted.includes('\n')
          ? `${indent}${humanizeLabel(key)}:\n${formatted}`
          : `${indent}${humanizeLabel(key)}: ${formatted}`;
      })
      .join('\n');
  }

  return String(value);
}

function formatJsonField(raw: string | null | undefined): string | null {
  if (!raw) return null;

  try {
    return formatStructuredValue(JSON.parse(raw));
  } catch {
    return raw;
  }
}

export default function ClinicalAssessmentsScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors, radii, spacing } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const [records, setRecords] = useState<any[]>([]);

  const load = useCallback(() => {
    db.select().from(clinicalAssessments).where(eq(clinicalAssessments.patientId, patientId)).orderBy(desc(clinicalAssessments.date))
      .then(setRecords).catch(console.error);
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
        ListEmptyComponent={<ProfileSectionHeader title="" description="No clinical assessments recorded yet." />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, flex: 1 }]}>
            <ProfileSectionHeader title={item.assessmentType ?? 'Assessment'} />
            <ProfileReadOnlyField label="Date" value={item.date} />
            <ProfileReadOnlyField label="Clinic Source" value={getClinicName(item.clinicId) ?? item.assessedBy ?? null} />
            <ProfileReadOnlyField label="Assessed By" value={item.assessedBy} />
            <ProfileReadOnlyField label="Scores" value={formatJsonField(item.scoresJson)} />
            <ProfileReadOnlyField label="Findings" value={formatJsonField(item.findingsJson)} />
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
