import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

export interface ParsedQueueConflict {
  patientName: string;
  ticketNumber: string;
  status: string;
  formattedMessage: string;
}

/**
 * Extracts conflict information from an HTTP 409 ApiError or response payload.
 * Fallback to patientName if not present in error payload.
 */
export function parseQueueConflictError(
  err?: any,
  fallbackName?: string
): ParsedQueueConflict {
  let patientName = (fallbackName || 'Patient').trim();
  let ticketNumber = 'Active Ticket';
  let status = 'Waiting';

  const rawData =
    err?.data ??
    err?.response?.data?.data ??
    err?.response?.data ??
    (err && typeof err === 'object' && 'ticketId' in err ? err : null);

  if (rawData && typeof rawData === 'object') {
    if (rawData.patientName && typeof rawData.patientName === 'string') {
      patientName = rawData.patientName.trim();
    }
    if (rawData.queueNumber || rawData.ticketNumber) {
      ticketNumber = String(rawData.queueNumber || rawData.ticketNumber).trim();
    }
    if (rawData.status && typeof rawData.status === 'string') {
      status = rawData.status.trim();
    }
  }

  const msg = typeof err?.message === 'string' ? err.message : '';
  if (msg) {
    // Regex matching: "Patient John Doe is already checked in as Q-001 (Waiting)"
    const match = msg.match(/Patient\s+(.+?)\s+is already checked in as\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (match) {
      if ((!rawData?.patientName || patientName === 'Patient') && match[1]) {
        patientName = match[1].trim();
      }
      if (!rawData?.queueNumber && !rawData?.ticketNumber && match[2]) {
        ticketNumber = match[2].trim();
      }
      if (!rawData?.status && match[3]) {
        status = match[3].trim();
      }
    }
  }

  const formattedMessage = `Patient ${patientName} is already checked in as ${ticketNumber} (${status})`;

  return {
    patientName,
    ticketNumber,
    status,
    formattedMessage,
  };
}

export interface QueueConflictModalProps {
  visible: boolean;
  onDismiss: () => void;
  onViewInQueue?: () => void;
  error?: any;
  patientName?: string;
  ticketNumber?: string;
  status?: string;
}

export function QueueConflictModal({
  visible,
  onDismiss,
  onViewInQueue,
  error,
  patientName,
  ticketNumber,
  status,
}: QueueConflictModalProps) {
  const parsed = useMemo(() => {
    const base = parseQueueConflictError(error, patientName);
    const resolvedName = patientName || base.patientName;
    const resolvedTicket = ticketNumber || base.ticketNumber;
    const resolvedStatus = status || base.status;
    return {
      patientName: resolvedName,
      ticketNumber: resolvedTicket,
      status: resolvedStatus,
      formattedMessage:
        patientName || ticketNumber || status
          ? `Patient ${resolvedName} is already checked in as ${resolvedTicket} (${resolvedStatus})`
          : base.formattedMessage,
    };
  }, [error, patientName, ticketNumber, status]);

  return (
    <Modal
      visible={visible}
      onClose={onDismiss}
      title="Active Queue Ticket Exists"
      maxWidth={480}
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Dismiss"
            variant="outline"
            size="md"
            onPress={onDismiss}
            style={styles.actionBtn}
          />
          {onViewInQueue ? (
            <Button
              title="View in Queue"
              variant="primary"
              size="md"
              icon="arrowRight"
              onPress={onViewInQueue}
              style={styles.actionBtn}
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.content}>
        <View style={styles.banner}>
          <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.urgentText} />
          <View style={styles.bannerText}>
            <ThemedText variant="bodyBold" style={styles.bannerTitle}>
              Duplicate Check-In Blocked
            </ThemedText>
            <ThemedText variant="body" style={styles.bannerMessage}>
              {parsed.formattedMessage}
            </ThemedText>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Patient
            </ThemedText>
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              {parsed.patientName}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Queue Ticket
            </ThemedText>
            <Badge label={parsed.ticketNumber} variant="primary" />
          </View>
          <View style={styles.detailRow}>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Current Status
            </ThemedText>
            <Badge label={parsed.status} variant="urgent" />
          </View>
        </View>

        <ThemedText variant="small" color={theme.colors.textMuted} style={styles.helperText}>
          Each patient may hold only one active ticket per day. Sidelined or active tickets must be completed, cancelled, or marked as no-show before another ticket can be issued.
        </ThemedText>
      </View>
    </Modal>
  );
}

export default QueueConflictModal;

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.urgentBg,
    borderColor: theme.colors.urgentBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  bannerText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  bannerTitle: {
    color: theme.colors.urgentText,
  },
  bannerMessage: {
    color: theme.colors.urgentText,
  },
  detailsCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helperText: {
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    minWidth: 110,
  },
});
