import { View } from 'react-native';
import { useNavigation, type StaticScreenProps } from '@react-navigation/native';
import { desc, eq } from 'drizzle-orm';
import { format } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import { ListRow } from '@ui/Primitives';
import { db } from '@db/index';
import { inboxLabRequests, type InboxLabRequest } from '@db/schema/inboxLabRequests';
import { inboxLabResults, type InboxLabResult } from '@db/schema/inboxLabResults';
import Screen from 'components/layout/Screen';
import Timeline from 'components/documents/Timeline';
import QrCodeView from 'components/sharing/QrCodeView';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentsPull, useLocalQuery } from 'hooks/useDocuments';
import { parseLabRequestItems } from 'services/sync/documentMappers';
import {
  canUploadLabResult,
  formatAmount,
  labStageChip,
  labTimeline,
  paymentChip,
  provenanceBadge,
  showLabClaimQr,
} from 'services/documents/presentation';

type Props = StaticScreenProps<{ id: string }>;

interface LabRequestView {
  request: InboxLabRequest | null;
  results: InboxLabResult[];
}

const EMPTY_VIEW: LabRequestView = { request: null, results: [] };
const DATE_FORMAT = 'MMM d, yyyy h:mm a';

export default function LabRequestDetailScreen({ route }: Props) {
  const { id } = route.params;
  const patientId = usePatientId();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();
  const { refreshing, refresh } = useDocumentsPull();

  const { data, loaded } = useLocalQuery<LabRequestView>(
    async () => {
      const [request] = await db
        .select()
        .from(inboxLabRequests)
        .where(eq(inboxLabRequests.id, id))
        .limit(1);
      if (!request || request.patientId !== patientId) return EMPTY_VIEW;
      const results = await db
        .select()
        .from(inboxLabResults)
        .where(eq(inboxLabResults.requisitionId, request.requisitionId))
        .orderBy(desc(inboxLabResults.resultedAt));
      return { request, results };
    },
    EMPTY_VIEW,
    [id, patientId],
  );

  const { request, results } = data;

  if (!loaded) {
    return (
      <Screen width="form">
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen width="form">
        <EmptyState title="Lab request not found" message="It may have been removed. Pull down on the inbox to refresh." />
      </Screen>
    );
  }

  const stage = labStageChip(request.stage);
  const payment = paymentChip(request.paymentStatus);
  const amount = formatAmount(request.quotedAmount, request.currency);
  const items = parseLabRequestItems(request.itemsJson);

  return (
    <Screen
      width="form"
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <Card style={{ gap: spacing.sm }}>
        <ThemedText variant="h2">{request.title}</ThemedText>
        <ThemedText variant="small" color="textMuted">
          {request.orderingFacilityName ?? 'Unknown facility'} · Issued {format(request.issuedAt, DATE_FORMAT)}
        </ThemedText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <Badge label={stage.label} tone={stage.tone} icon={stage.icon} />
          <Badge label={payment.label} tone={payment.tone} icon={payment.icon} />
          {request.urgency ? <Badge label={request.urgency} tone="warning" /> : null}
        </View>
      </Card>

      <Card>
        <ProfileSectionHeader title="Progress" />
        <Timeline steps={labTimeline(request.stage, request.paymentRequired)} />
      </Card>

      <Card>
        <ProfileSectionHeader title="Details" />
        <ProfileReadOnlyField label="Laboratory" value={request.laboratoryName} />
        <ProfileReadOnlyField label="Quoted amount" value={amount} />
        <ProfileReadOnlyField label="Accession number" value={request.accessionNumber} />
        <ProfileReadOnlyField label="Reason" value={request.reason} />
      </Card>

      <Card>
        <ProfileSectionHeader title="Requested tests" />
        {items.length === 0 ? (
          <ThemedText variant="small" color="textMuted">No tests listed.</ThemedText>
        ) : (
          items.map((item, index) => (
            <ListRow
              key={`${item.code}-${index}`}
              title={item.name}
              subtitle={item.category}
              icon="lab"
              divider={index < items.length - 1}
            />
          ))
        )}
      </Card>

      {showLabClaimQr(request.stage, request.claimToken) && request.claimToken ? (
        <Card style={{ gap: spacing.sm }}>
          <ProfileSectionHeader
            title="Show this at the lab"
            description="The lab scans this code to claim your request. It stays valid until the request is completed."
          />
          <QrCodeView value={request.claimToken} accessibilityLabel="Lab request claim QR code" />
        </Card>
      ) : null}

      {results.length > 0 ? (
        <Card>
          <ProfileSectionHeader title="Results" />
          {results.map((result, index) => (
            <ListRow
              key={result.id}
              title={result.title}
              subtitle={`${provenanceBadge(result.source).label} · ${format(result.resultedAt, DATE_FORMAT)}`}
              icon="clipboard"
              chevron
              divider={index < results.length - 1}
              onPress={() =>
                navigation.navigate('Main', { screen: 'LabResultDetailScreen', params: { id: result.id } })
              }
            />
          ))}
        </Card>
      ) : null}

      {canUploadLabResult(request.stage) ? (
        <Button
          label="Upload result"
          icon="upload"
          variant="outline"
          fullWidth
          onPress={() =>
            navigation.navigate('Main', { screen: 'UploadLabResultScreen', params: { id: request.id } })
          }
        />
      ) : null}
    </Screen>
  );
}
