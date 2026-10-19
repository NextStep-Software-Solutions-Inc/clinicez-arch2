import { View } from 'react-native';
import type { StaticScreenProps } from '@react-navigation/native';
import { format } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import Screen from 'components/layout/Screen';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useAccessLog } from 'hooks/useSharing';
import { ApiError } from 'services/api/apiClient';

type Props = StaticScreenProps<{ grantId?: string } | undefined>;

const DATE_FORMAT = 'MMM d, yyyy h:mm a';

export default function AccessLogScreen({ route }: Props) {
  const grantId = route.params?.grantId;
  const patientId = usePatientId();
  const { spacing } = useAppTheme();
  const { data, error, isLoading, isValidating, mutate } = useAccessLog(patientId, grantId);

  const items = data?.items ?? [];

  return (
    <Screen
      width="form"
      onRefresh={() => void mutate()}
      refreshing={isValidating && !isLoading}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <ThemedText variant="small" color="textMuted">
        {grantId
          ? 'Everything this facility did with the access you granted.'
          : 'Every time a facility used access to your records, newest first.'}
      </ThemedText>

      {isLoading ? (
        <Skeleton height={140} />
      ) : error && !data ? (
        <EmptyState
          title="Could not load activity"
          message={error instanceof ApiError ? error.firstMessage : 'Check your connection and pull down to retry.'}
          actionLabel="Retry"
          onActionPress={() => void mutate()}
        />
      ) : items.length === 0 ? (
        <EmptyState title="No activity yet" message="When a facility reads or imports your records, it is listed here." />
      ) : (
        items.map((entry) => (
          <Card key={entry.id} padding="sm" style={{ gap: spacing.xs }}>
            <View>
              <ThemedText variant="bodyBold">{entry.facilityName ?? 'Unknown facility'}</ThemedText>
              <ThemedText variant="small" color="textSecondary">
                {`${entry.action} · ${entry.actor}`}
              </ThemedText>
            </View>
            {entry.detail ? (
              <ThemedText variant="small" color="textMuted">
                {entry.detail}
              </ThemedText>
            ) : null}
            <ThemedText variant="caption" color="textMuted">
              {format(new Date(entry.at), DATE_FORMAT)}
            </ThemedText>
          </Card>
        ))
      )}

      {data && data.totalCount > items.length ? (
        <ThemedText variant="caption" color="textMuted">
          {`Showing the latest ${items.length} of ${data.totalCount} entries.`}
        </ThemedText>
      ) : null}
    </Screen>
  );
}
