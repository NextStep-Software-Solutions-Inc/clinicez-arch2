import { useEffect, useState, useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import Screen from 'components/layout/Screen';
import { db } from '@db/index';
import { vitalSigns } from '@db/schema/vitalSigns';
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

function formatNumber(value: number | null | undefined, unit?: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return unit ? `${value} ${unit}` : String(value);
}

function formatLimbMeasurements(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed);

    if (!entries.length) {
      return null;
    }

    return entries
      .map(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          return `${humanizeLabel(key)}: —`;
        }

        return typeof value === 'number'
          ? `${humanizeLabel(key)}: ${value} cm`
          : `${humanizeLabel(key)}: ${String(value)}`;
      })
      .join('\n');
  } catch {
    return raw;
  }
}

export default function VitalSignsScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors, radii, spacing } = useAppTheme();
  const { isDesktop } = useBreakpoint();
  const [records, setRecords] = useState<any[]>([]);

  const load = useCallback(() => {
    db.select().from(vitalSigns).where(eq(vitalSigns.patientId, patientId)).orderBy(desc(vitalSigns.measuredAt))
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
        ListEmptyComponent={<ProfileSectionHeader title="" description="No vital signs recorded yet. These are added by your healthcare provider." />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, flex: 1 }]}>
            <ProfileSectionHeader title={item.measuredAt ? new Date(item.measuredAt).toLocaleDateString() : 'Recorded'} />
            <ProfileReadOnlyField label="Blood Pressure" value={item.bpSystolic && item.bpDiastolic ? `${item.bpSystolic}/${item.bpDiastolic} mmHg` : null} />
            <ProfileReadOnlyField label="Heart Rate" value={item.heartRateBpm ? `${item.heartRateBpm} bpm` : null} />
            <ProfileReadOnlyField label="Respiratory Rate" value={item.respiratoryRate ? `${item.respiratoryRate} breaths/min` : null} />
            <ProfileReadOnlyField label="Temperature" value={item.temperatureCelsius ? `${item.temperatureCelsius} °C` : null} />
            <ProfileReadOnlyField label="Oxygen Saturation" value={item.spO2Percent ? `${item.spO2Percent}%` : null} />
            <ProfileReadOnlyField label="Weight" value={item.weightKg ? `${item.weightKg} kg` : null} />
            <ProfileReadOnlyField label="Height" value={item.heightCm ? `${item.heightCm} cm` : null} />
            <ProfileReadOnlyField label="BMI" value={item.bmi?.toString() ?? null} />
            <ProfileReadOnlyField label="Blood Glucose" value={item.fastingBloodGlucose ? `${item.fastingBloodGlucose} mg/dL` : null} />
            <ProfileReadOnlyField label="Waist Circumference" value={formatNumber(item.waistCm, 'cm')} />
            <ProfileReadOnlyField label="Hip Circumference" value={formatNumber(item.hipCm, 'cm')} />
            <ProfileReadOnlyField label="Head Circumference" value={formatNumber(item.headCircumferenceCm, 'cm')} />
            <ProfileReadOnlyField label="Z-Score" value={formatNumber(item.zScore)} />
            <ProfileReadOnlyField label="Left Vision Acuity" value={item.leftVisionAcuity} />
            <ProfileReadOnlyField label="Right Vision Acuity" value={item.rightVisionAcuity} />
            <ProfileReadOnlyField label="Body Length" value={formatNumber(item.bodyLengthCm, 'cm')} />
            <ProfileReadOnlyField label="Skinfold Thickness" value={formatNumber(item.skinfoldThicknessMm, 'mm')} />
            <ProfileReadOnlyField label="Mid-Upper Arm Circumference" value={formatNumber(item.midUpperArmCircCm, 'cm')} />
            <ProfileReadOnlyField label="Limb Measurements" value={formatLimbMeasurements(item.limbMeasurements)} />
            <ProfileReadOnlyField label="Recorded By" value={item.takenBy} />
            <ProfileReadOnlyField label="Clinic Source" value={getClinicName(item.clinicId) ?? item.facility ?? null} />
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
