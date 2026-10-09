import { Linking, StyleSheet, View } from 'react-native';
import type { StaticScreenProps } from '@react-navigation/native';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';
import { Image } from 'expo-image';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import { db } from '@db/index';
import { inboxLabResults, type InboxLabResult } from '@db/schema/inboxLabResults';
import Screen from 'components/layout/Screen';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentsPull, useLocalQuery } from 'hooks/useDocuments';
import { parseObservations } from 'services/sync/documentMappers';
import {
  fileKindFromUrl,
  isAbnormalFlag,
  provenanceBadge,
  verificationBadge,
} from 'services/documents/presentation';
import type { LabObservationDto } from 'services/api/documentsApi';

type Props = StaticScreenProps<{ id: string }>;

const DATE_FORMAT = 'MMM d, yyyy h:mm a';
const IMAGE_ASPECT_RATIO = 3 / 4;

function groupByPanel(observations: LabObservationDto[]): { panel: string; rows: LabObservationDto[] }[] {
  const groups = new Map<string, LabObservationDto[]>();
  for (const observation of observations) {
    const rows = groups.get(observation.panel) ?? [];
    rows.push(observation);
    groups.set(observation.panel, rows);
  }
  return [...groups].map(([panel, rows]) => ({ panel, rows }));
}

export default function LabResultDetailScreen({ route }: Props) {
  const { id } = route.params;
  const patientId = usePatientId();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { refreshing, refresh } = useDocumentsPull();

  const { data: result, loaded } = useLocalQuery<InboxLabResult | null>(
    async () => {
      const [row] = await db.select().from(inboxLabResults).where(eq(inboxLabResults.id, id)).limit(1);
      return row && row.patientId === patientId ? row : null;
    },
    null,
    [id, patientId],
  );

  if (!loaded) {
    return (
      <Screen width="form">
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (!result) {
    return (
      <Screen width="form">
        <EmptyState title="Result not found" message="It may have been removed. Pull down on the inbox to refresh." />
      </Screen>
    );
  }

  const provenance = provenanceBadge(result.source);
  const verification = verificationBadge(result.verification, result.remarks);
  const groups = groupByPanel(parseObservations(result.observationsJson));
  const { fileUrl } = result;
  const fileKind = fileUrl ? fileKindFromUrl(fileUrl) : 'other';

  return (
    <Screen
      width="form"
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <Card style={{ gap: spacing.sm }}>
        <ThemedText variant="h2">{result.title}</ThemedText>
        <ThemedText variant="small" color="textMuted">
          {result.laboratoryName} · {format(result.resultedAt, DATE_FORMAT)}
        </ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <Badge label={provenance.label} tone={provenance.tone} icon={provenance.icon} />
          <Badge label={verification.label} tone={verification.tone} icon={verification.icon} />
          {result.isCritical ? <Badge label="Critical" tone="danger" icon="alert" /> : null}
        </View>
        {verification.detail ? (
          <ThemedText variant="small" color="textSecondary">
            {verification.detail}
          </ThemedText>
        ) : null}
        {result.reviewedByName ? (
          <ThemedText variant="caption" color="textMuted">
            {`Reviewed by ${result.reviewedByName}${result.reviewedAt ? ` · ${format(result.reviewedAt, DATE_FORMAT)}` : ''}`}
          </ThemedText>
        ) : null}
      </Card>

      {result.impression ? (
        <Card>
          <ProfileReadOnlyField label="Impression" value={result.impression} />
        </Card>
      ) : null}

      {groups.length > 0 ? (
        <Card style={{ gap: spacing.md }}>
          <ProfileSectionHeader title="Results" />
          {groups.map((group) => (
            <View key={group.panel}>
              <ThemedText variant="smallBold" color="textSecondary" style={{ marginBottom: spacing.xs }}>
                {group.panel}
              </ThemedText>
              <View style={[styles.tableRow, { paddingBottom: spacing.xs }]}>
                <ThemedText variant="captionBold" color="textMuted" style={styles.nameCol}>Test</ThemedText>
                <ThemedText variant="captionBold" color="textMuted" style={styles.valueCol}>Value</ThemedText>
                <ThemedText variant="captionBold" color="textMuted" style={styles.rangeCol}>Reference</ThemedText>
              </View>
              {group.rows.map((row, index) => {
                const abnormal = isAbnormalFlag(row.flag);
                return (
                  <View
                    key={`${row.name}-${index}`}
                    style={[
                      styles.tableRow,
                      {
                        paddingVertical: spacing.sm,
                        borderTopWidth: sizes.borderWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                  >
                    <ThemedText variant="body" style={styles.nameCol}>{row.name}</ThemedText>
                    <ThemedText
                      variant={abnormal ? 'bodyBold' : 'body'}
                      color={abnormal ? 'emergency' : 'text'}
                      style={styles.valueCol}
                    >
                      {`${row.value} ${row.unit}`.trim()}
                      {abnormal ? ` (${row.flag})` : ''}
                    </ThemedText>
                    <ThemedText variant="small" color="textMuted" style={styles.rangeCol}>
                      {row.referenceRange || '—'}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          ))}
        </Card>
      ) : null}

      {fileUrl ? (
        <Card style={{ gap: spacing.sm }}>
          <ProfileSectionHeader title="Attached file" />
          {fileKind === 'image' ? (
            <Image
              source={{ uri: fileUrl }}
              contentFit="contain"
              accessibilityLabel={`${result.title} attachment`}
              style={{
                width: '100%',
                aspectRatio: IMAGE_ASPECT_RATIO,
                borderRadius: radii.md,
                backgroundColor: colors.surfaceSubtle,
              }}
            />
          ) : null}
          <Button
            label={fileKind === 'pdf' ? 'Open PDF' : 'Open file'}
            icon={fileKind === 'pdf' ? 'pdf' : 'externalLink'}
            variant="outline"
            fullWidth
            onPress={() => void Linking.openURL(fileUrl)}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nameCol: { flex: 3 },
  valueCol: { flex: 2 },
  rangeCol: { flex: 2 },
});
