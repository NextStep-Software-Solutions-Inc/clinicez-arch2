import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import {
  fontSizeScale,
  lightColors,
  radiusScale,
  sizes,
  spaceScale
} from '@clinicez/design-tokens';
import {
  TriageDispositionPayload,
  TriageQueueItem,
  TriageQueueViewProps
} from './types';

export function isItemSlaBreached(item: TriageQueueItem): boolean {
  if (item.slaBreached || item.isSlaBreached) return true;
  if (typeof item.slaTimeRemainingSeconds === 'number') return item.slaTimeRemainingSeconds <= 0;
  if (item.triageDueAtUtc) {
    const dueTime = new Date(item.triageDueAtUtc).getTime();
    if (!isNaN(dueTime)) return dueTime <= Date.now();
  }
  return false;
}

function formatSlaCountdown(item: TriageQueueItem): string {
  if (isItemSlaBreached(item)) {
    return 'SLA Breached';
  }

  let remainingSec: number | null = null;
  if (typeof item.slaTimeRemainingSeconds === 'number') {
    remainingSec = item.slaTimeRemainingSeconds;
  } else if (item.triageDueAtUtc) {
    const dueTime = new Date(item.triageDueAtUtc).getTime();
    if (!isNaN(dueTime)) {
      remainingSec = Math.floor((dueTime - Date.now()) / 1000);
    }
  }

  if (remainingSec === null) {
    return 'Target: Queued';
  }

  if (remainingSec <= 0) {
    return 'SLA Breached';
  }

  if (remainingSec < 60) {
    return 'Target: < 1m remaining';
  }

  const totalMinutes = Math.floor(remainingSec / 60);
  if (totalMinutes < 60) {
    return `Target: ${totalMinutes}m remaining`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? `Target: ${hours}h ${minutes}m remaining`
    : `Target: ${hours}h remaining`;
}

const DECLINE_REASONS = [
  { code: 'DUPLICATE', label: 'Duplicate Request' },
  { code: 'OUT_OF_SCOPE', label: 'Out of Clinic Scope' },
  { code: 'EMERGENCY_REFERRED', label: 'Referred to Emergency Dept' },
  { code: 'UNREACHABLE', label: 'Patient Unreachable' },
  { code: 'PATIENT_CANCELLED', label: 'Patient Cancelled' },
  { code: 'OTHER', label: 'Other Administrative Reason' }
] as const;

export const TriageQueueView: React.FC<TriageQueueViewProps> = ({
  items,
  facilityName,
  onExecuteDisposition,
  onRefresh,
  isLoading = false,
  error = null,
  activeFilter = 'All',
  onFilterChange,
  style
}) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const [selectedItem, setSelectedItem] = useState<TriageQueueItem | null>(null);
  const [modalMode, setModalMode] = useState<'Answer' | 'Decline' | 'Route' | null>(null);
  const [replyText, setReplyText] = useState('');
  const [declineReason, setDeclineReason] = useState<TriageDispositionPayload['declineReasonCode']>('OUT_OF_SCOPE');
  const [declineNotes, setDeclineNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenAction = (item: TriageQueueItem, mode: 'Answer' | 'Decline' | 'Route') => {
    setSelectedItem(item);
    setModalMode(mode);
    setReplyText('');
    setDeclineNotes('');
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedItem(null);
  };

  const handleSubmitDisposition = async () => {
    if (!selectedItem || !modalMode || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (modalMode === 'Answer') {
        await onExecuteDisposition({
          conversationId: selectedItem.conversationId,
          disposition: 'Answered',
          replyText
        });
      } else if (modalMode === 'Decline') {
        await onExecuteDisposition({
          conversationId: selectedItem.conversationId,
          disposition: 'Declined',
          declineReasonCode: declineReason,
          declineNotes
        });
      } else if (modalMode === 'Route') {
        await onExecuteDisposition({
          conversationId: selectedItem.conversationId,
          disposition: 'Routed',
          routedPriority: selectedItem.priority === 'Emergency' ? 'Urgent' : 'Routine'
        });
      }
      handleCloseModal();
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle1ClickNeedsVisit = async (item: TriageQueueItem) => {
    await onExecuteDisposition({
      conversationId: item.conversationId,
      disposition: 'NeedsVisit',
      replyText: 'Clinical evaluation required in person at the facility.'
    });
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'All') return true;
    return item.priority === activeFilter;
  });

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>Triage Workstation</Text>
            <Text style={styles.headerSubtitle}>{facilityName}</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            accessibilityLabel="Refresh triage queue"
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Bar */}
        {onFilterChange && (
          <View style={styles.filterBar}>
            {(['All', 'Emergency', 'Urgent', 'Routine'] as const).map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => onFilterChange(filter)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                    {filter === 'Emergency' ? 'STAT' : filter === 'Urgent' ? 'Urgent' : filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Content States */}
      {isLoading ? (
        <ScrollView style={styles.list} scrollEnabled={false}>
          {[0, 1, 2].map((key) => (
            <View key={key} style={styles.skeletonCard}>
              <View style={styles.cardTopRow}>
                <View style={styles.badgesRow}>
                  <View style={styles.skeletonBadge} />
                  <View style={styles.skeletonCategory} />
                </View>
                <View style={styles.skeletonSlaPill} />
              </View>
              <View style={styles.skeletonPatientRow}>
                <View style={styles.skeletonPatientName} />
              </View>
              <View style={styles.skeletonContentLine1} />
              <View style={styles.skeletonContentLine2} />
              <View style={styles.actionBar}>
                <View style={styles.skeletonButton} />
                <View style={styles.skeletonButton} />
                <View style={styles.skeletonButton} />
                <View style={styles.skeletonButton} />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : error ? (
        <View style={styles.stateContainer}>
          <View style={styles.errorAlertContainer}>
            <View style={styles.errorIconContainer}>
              <Text style={styles.errorIconGlyph}>!</Text>
            </View>
            <Text style={styles.errorAlertTitle}>Triage Connection Error</Text>
            <Text style={styles.errorAlertSubtitle}>{error}</Text>
            <TouchableOpacity
              style={styles.errorRetryButton}
              onPress={onRefresh}
              accessibilityRole="button"
              accessibilityLabel="Retry loading triage queue"
            >
              <Text style={styles.errorRetryButtonText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          {/* Stylized Check-Shield Icon Container */}
          <View style={styles.shieldIconContainer}>
            <View style={styles.checkmarkGlyph} />
          </View>

          <Text style={styles.emptyTitle}>Queue Clear - All caught up!</Text>
          <Text style={styles.emptySubtitle}>
            Inbound patient inquiries from Nextstep OPD will appear here with live SLA countdowns.
          </Text>

          {/* SLA Metric Ribbon */}
          <View style={styles.emptyMetricsStrip}>
            <View style={styles.emptyMetricCard}>
              <Text style={styles.emptyMetricValue}>0</Text>
              <Text style={styles.emptyMetricLabel}>Pending</Text>
            </View>
            <View style={styles.emptyMetricCard}>
              <Text style={[styles.emptyMetricValue, styles.metricSuccess]}>100%</Text>
              <Text style={styles.emptyMetricLabel}>SLA Met</Text>
            </View>
            <View style={styles.emptyMetricCard}>
              <Text style={styles.emptyMetricValue}>&lt; 5m</Text>
              <Text style={styles.emptyMetricLabel}>Avg Response</Text>
            </View>
          </View>

          {/* Actionable Refresh CTA */}
          <TouchableOpacity
            style={styles.emptyRefreshButton}
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh triage queue"
          >
            <Text style={styles.emptyRefreshButtonText}>Refresh Queue</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {filteredItems.map((item) => {
            const isStat = item.priority === 'Emergency';
            const isUrgent = item.priority === 'Urgent';

            return (
              <View key={item.conversationId} style={styles.card}>
                {/* Urgency & SLA Header */}
                <View style={styles.cardTopRow}>
                  <View style={styles.badgesRow}>
                    {isStat ? (
                      <View style={styles.statBadge}>
                        <Text style={styles.statBadgeText}>STAT</Text>
                      </View>
                    ) : isUrgent ? (
                      <View style={styles.urgentBadge}>
                        <Text style={styles.urgentBadgeText}>Urgent</Text>
                      </View>
                    ) : (
                      <View style={styles.routineBadge}>
                        <Text style={styles.routineBadgeText}>Routine</Text>
                      </View>
                    )}
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{item.category}</Text>
                    </View>
                  </View>

                  {/* SLA Pill */}
                  <View
                    style={[
                      styles.slaPill,
                      isItemSlaBreached(item)
                        ? styles.slaPillBreached
                        : item.triageDueAtUtc || item.slaTimeRemainingSeconds !== undefined
                          ? styles.slaPillWarning
                          : styles.slaPillNormal
                    ]}
                  >
                    <Text
                      style={[
                        styles.slaPillText,
                        isItemSlaBreached(item)
                          ? styles.slaPillTextBreached
                          : item.triageDueAtUtc || item.slaTimeRemainingSeconds !== undefined
                            ? styles.slaPillTextWarning
                            : styles.slaPillTextNormal
                      ]}
                    >
                      {formatSlaCountdown(item)}
                    </Text>
                  </View>
                </View>

                {/* Patient Information */}
                <View style={styles.patientRow}>
                  <Text style={styles.patientName}>{item.patientNameMasked || 'Patient Inquiry'}</Text>
                  {item.isEmergencyConfirmed && (
                    <View style={styles.screenedBadge}>
                      <Text style={styles.screenedBadgeText}>Non-Emergency Confirmed</Text>
                    </View>
                  )}
                </View>

                {/* Inquiry text */}
                <Text style={styles.contentText}>{item.contentText}</Text>

                {/* Action Bar */}
                <View style={styles.actionBar}>
                  <TouchableOpacity
                    style={styles.answerButton}
                    onPress={() => handleOpenAction(item, 'Answer')}
                    accessibilityLabel="Answer inquiry"
                  >
                    <Text style={styles.answerButtonText}>Answer</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.visitButton}
                    onPress={() => handle1ClickNeedsVisit(item)}
                    accessibilityLabel="Flag as needs visit"
                  >
                    <Text style={styles.visitButtonText}>Needs Visit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.routeButton}
                    onPress={() => handleOpenAction(item, 'Route')}
                    accessibilityLabel="Route to provider"
                  >
                    <Text style={styles.routeButtonText}>Route</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.declineButton}
                    onPress={() => handleOpenAction(item, 'Decline')}
                    accessibilityLabel="Decline inquiry"
                  >
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Disposition Modal */}
      <Modal
        visible={modalMode !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modalMode === 'Answer'
                ? 'Answer Patient Inquiry'
                : modalMode === 'Decline'
                  ? 'Decline Inquiry (Mandatory Reason)'
                  : 'Route Inquiry to Care Team'}
            </Text>

            {modalMode === 'Answer' && (
              <TextInput
                style={styles.modalInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Type public clinical response..."
                placeholderTextColor={lightColors.textMuted}
                multiline
                numberOfLines={4}
              />
            )}

            {modalMode === 'Decline' && (
              <View>
                <Text style={styles.modalFieldLabel}>Reason Code:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.declinePills}>
                  {DECLINE_REASONS.map((r) => {
                    const isSelected = declineReason === r.code;
                    return (
                      <TouchableOpacity
                        key={r.code}
                        style={[styles.reasonPill, isSelected && styles.reasonPillActive]}
                        onPress={() => setDeclineReason(r.code)}
                      >
                        <Text style={[styles.reasonPillText, isSelected && styles.reasonPillTextActive]}>
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TextInput
                  style={styles.modalInput}
                  value={declineNotes}
                  onChangeText={setDeclineNotes}
                  placeholder="Optional internal decline notes..."
                  placeholderTextColor={lightColors.textMuted}
                  multiline
                  numberOfLines={2}
                />
              </View>
            )}

            {modalMode === 'Route' && (
              <Text style={styles.modalDescription}>
                This inquiry will be assigned to the facility care team queue with priority.
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={handleCloseModal}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleSubmitDisposition}
                disabled={isSubmitting}
              >
                <Text style={styles.modalSubmitText}>
                  {isSubmitting ? 'Submitting...' : 'Confirm Disposition'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background
  },
  header: {
    padding: spaceScale.md,
    backgroundColor: lightColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spaceScale.sm
  },
  headerTitle: {
    fontSize: fontSizeScale.xl,
    fontWeight: '700',
    color: lightColors.text
  },
  headerSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary,
    marginTop: 2
  },
  refreshButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    backgroundColor: lightColors.surfaceSubtle,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  refreshButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.text
  },
  filterBar: {
    flexDirection: 'row',
    gap: spaceScale.xs
  },
  filterPill: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center'
  },
  filterPillActive: {
    backgroundColor: lightColors.primary
  },
  filterPillText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '500',
    color: lightColors.textSecondary
  },
  filterPillTextActive: {
    color: lightColors.onPrimary,
    fontWeight: '700'
  },
  list: {
    flex: 1,
    padding: spaceScale.md
  },
  card: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.md,
    padding: spaceScale.md,
    marginBottom: spaceScale.md
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spaceScale.sm
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs
  },
  statBadge: {
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  statBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.emergencyText
  },
  urgentBadge: {
    backgroundColor: lightColors.urgentBg,
    borderColor: lightColors.urgentBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  urgentBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.urgentText
  },
  routineBadge: {
    backgroundColor: lightColors.routineBg,
    borderColor: lightColors.routineBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  routineBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.routineText
  },
  categoryBadge: {
    backgroundColor: lightColors.surfaceSubtle,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  categoryBadgeText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary
  },
  slaPill: {
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  slaPillNormal: {
    backgroundColor: lightColors.surfaceSubtle
  },
  slaPillWarning: {
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
    borderWidth: 1
  },
  slaPillBreached: {
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1
  },
  slaPillText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600'
  },
  slaPillTextNormal: {
    color: lightColors.textMuted
  },
  slaPillTextWarning: {
    color: lightColors.warningText
  },
  slaPillTextBreached: {
    color: lightColors.emergencyText
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spaceScale.xs
  },
  patientName: {
    fontSize: fontSizeScale.md,
    fontWeight: '700',
    color: lightColors.text
  },
  screenedBadge: {
    backgroundColor: lightColors.successBg,
    borderColor: lightColors.successBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.xs,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  screenedBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.successText
  },
  contentText: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textSecondary,
    lineHeight: 18,
    marginBottom: spaceScale.md
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spaceScale.xs
  },
  answerButton: {
    flexGrow: 1,
    minWidth: 80,
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    backgroundColor: lightColors.primary,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  answerButtonText: {
    color: lightColors.onPrimary,
    fontWeight: '600',
    fontSize: fontSizeScale.xs
  },
  visitButton: {
    flexGrow: 1,
    minWidth: 80,
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    backgroundColor: lightColors.surfaceSubtle,
    borderColor: lightColors.borderDark,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  visitButtonText: {
    color: lightColors.text,
    fontWeight: '600',
    fontSize: fontSizeScale.xs
  },
  routeButton: {
    flexGrow: 1,
    minWidth: 80,
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    backgroundColor: lightColors.surfaceSubtle,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  routeButtonText: {
    color: lightColors.textSecondary,
    fontWeight: '600',
    fontSize: fontSizeScale.xs
  },
  declineButton: {
    flexGrow: 1,
    minWidth: 80,
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  declineButtonText: {
    color: lightColors.emergencyText,
    fontWeight: '600',
    fontSize: fontSizeScale.xs
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: lightColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spaceScale.lg
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: lightColors.surface,
    borderRadius: radiusScale.md,
    padding: spaceScale.lg,
    borderColor: lightColors.border,
    borderWidth: 1
  },
  modalTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: spaceScale.md
  },
  modalDescription: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textSecondary,
    marginBottom: spaceScale.md
  },
  modalFieldLabel: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: spaceScale.xs
  },
  declinePills: {
    flexDirection: 'row',
    marginBottom: spaceScale.md
  },
  reasonPill: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle,
    marginRight: spaceScale.xs,
    justifyContent: 'center',
    alignItems: 'center'
  },
  reasonPillActive: {
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1
  },
  reasonPillText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary
  },
  reasonPillTextActive: {
    color: lightColors.emergencyText,
    fontWeight: '700'
  },
  modalInput: {
    backgroundColor: lightColors.surfaceSubtle,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    fontSize: fontSizeScale.sm,
    color: lightColors.text,
    marginBottom: spaceScale.md,
    textAlignVertical: 'top'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spaceScale.sm
  },
  modalCancelButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.lg,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalCancelText: {
    fontSize: fontSizeScale.sm,
    fontWeight: '600',
    color: lightColors.textSecondary
  },
  modalSubmitButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.lg,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalSubmitText: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spaceScale.xl
  },
  stateText: {
    marginTop: spaceScale.sm,
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted
  },
  // Skeleton Loaders
  skeletonCard: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.md,
    padding: spaceScale.md,
    marginBottom: spaceScale.md
  },
  skeletonBadge: {
    width: 48,
    height: 20,
    borderRadius: radiusScale.xs,
    backgroundColor: lightColors.skeletonBase
  },
  skeletonCategory: {
    width: 72,
    height: 20,
    borderRadius: radiusScale.xs,
    backgroundColor: lightColors.skeletonHighlight
  },
  skeletonSlaPill: {
    width: 110,
    height: 20,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.skeletonBase
  },
  skeletonPatientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spaceScale.sm
  },
  skeletonPatientName: {
    width: 150,
    height: 18,
    borderRadius: radiusScale.xs,
    backgroundColor: lightColors.skeletonBase
  },
  skeletonContentLine1: {
    width: '100%',
    height: 14,
    borderRadius: radiusScale.xs,
    backgroundColor: lightColors.skeletonHighlight,
    marginBottom: spaceScale.xs
  },
  skeletonContentLine2: {
    width: '75%',
    height: 14,
    borderRadius: radiusScale.xs,
    backgroundColor: lightColors.skeletonHighlight,
    marginBottom: spaceScale.md
  },
  skeletonButton: {
    flexGrow: 1,
    minWidth: 80,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.skeletonBase
  },

  // Structured Error Alert
  errorAlertContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: lightColors.emergencySubtle,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1,
    borderRadius: radiusScale.md,
    padding: spaceScale.lg,
    alignItems: 'center'
  },
  errorIconContainer: {
    width: sizes.controlLg,
    height: sizes.controlLg,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spaceScale.sm
  },
  errorIconGlyph: {
    fontSize: fontSizeScale.xl,
    fontWeight: '700',
    color: lightColors.emergencyText
  },
  errorAlertTitle: {
    fontSize: fontSizeScale.md,
    fontWeight: '700',
    color: lightColors.emergencyText,
    marginBottom: spaceScale.xs,
    textAlign: 'center'
  },
  errorAlertSubtitle: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted,
    textAlign: 'center',
    marginBottom: spaceScale.md
  },
  errorRetryButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.xl,
    backgroundColor: lightColors.emergency,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  errorRetryButtonText: {
    color: lightColors.onPrimary,
    fontWeight: '600',
    fontSize: fontSizeScale.sm
  },

  // Actionable Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spaceScale.xl
  },
  shieldIconContainer: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.primarySubtle,
    borderColor: lightColors.primaryBorder,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spaceScale.md
  },
  checkmarkGlyph: {
    width: 14,
    height: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: lightColors.primary,
    transform: [{ rotate: '45deg' }],
    marginBottom: spaceScale.xs
  },
  emptyTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: spaceScale.xs,
    textAlign: 'center'
  },
  emptySubtitle: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted,
    textAlign: 'center',
    maxWidth: 340,
    marginBottom: spaceScale.lg
  },
  emptyMetricsStrip: {
    flexDirection: 'row',
    gap: spaceScale.sm,
    width: '100%',
    maxWidth: 360,
    marginBottom: spaceScale.lg
  },
  emptyMetricCard: {
    flex: 1,
    backgroundColor: lightColors.surfaceSubtle,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.md,
    paddingVertical: spaceScale.sm,
    paddingHorizontal: spaceScale.xs,
    alignItems: 'center'
  },
  emptyMetricValue: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: spaceScale.xxs
  },
  metricSuccess: {
    color: lightColors.successText
  },
  emptyMetricLabel: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted,
    fontWeight: '500'
  },
  emptyRefreshButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.xl,
    backgroundColor: lightColors.primary,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyRefreshButtonText: {
    color: lightColors.onPrimary,
    fontWeight: '600',
    fontSize: fontSizeScale.sm
  }
});
