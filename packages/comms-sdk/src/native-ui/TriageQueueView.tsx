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

function formatSlaCountdown(item: TriageQueueItem): string {
  if (item.slaBreached || item.isSlaBreached) {
    return '⚠️ SLA Breached';
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
    return '⏳ Target: Queued';
  }

  if (remainingSec <= 0) {
    return '⚠️ SLA Breached';
  }

  if (remainingSec < 60) {
    return '⏳ Target: < 1m remaining';
  }

  const totalMinutes = Math.floor(remainingSec / 60);
  if (totalMinutes < 60) {
    return `⏳ Target: ${totalMinutes}m remaining`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? `⏳ Target: ${hours}h ${minutes}m remaining`
    : `⏳ Target: ${hours}h remaining`;
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
            <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
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
                    {filter === 'Emergency' ? '🚨 STAT' : filter === 'Urgent' ? '⚡ Urgent' : filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Content States */}
      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={lightColors.primary} />
          <Text style={styles.stateText}>Loading triage queue...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Error Loading Triage</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Triage Queue Clear</Text>
          <Text style={styles.emptySubtitle}>
            No patient inquiries require triage disposition at this time.
          </Text>
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
                        <Text style={styles.statBadgeText}>🚨 STAT</Text>
                      </View>
                    ) : isUrgent ? (
                      <View style={styles.urgentBadge}>
                        <Text style={styles.urgentBadgeText}>⚡ Urgent</Text>
                      </View>
                    ) : (
                      <View style={styles.routineBadge}>
                        <Text style={styles.routineBadgeText}>✓ Routine</Text>
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
                      item.slaBreached || (typeof item.slaTimeRemainingSeconds === 'number' && item.slaTimeRemainingSeconds <= 0)
                        ? styles.slaPillBreached
                        : item.triageDueAtUtc || item.slaTimeRemainingSeconds !== undefined
                          ? styles.slaPillWarning
                          : styles.slaPillNormal
                    ]}
                  >
                    <Text
                      style={[
                        styles.slaPillText,
                        item.slaBreached || (typeof item.slaTimeRemainingSeconds === 'number' && item.slaTimeRemainingSeconds <= 0)
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
                      <Text style={styles.screenedBadgeText}>✓ Non-Emergency Confirmed</Text>
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
                    <Text style={styles.answerButtonText}>💬 Answer</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.visitButton}
                    onPress={() => handle1ClickNeedsVisit(item)}
                    accessibilityLabel="Flag as needs visit"
                  >
                    <Text style={styles.visitButtonText}>🏥 Needs Visit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.routeButton}
                    onPress={() => handleOpenAction(item, 'Route')}
                    accessibilityLabel="Route to provider"
                  >
                    <Text style={styles.routeButtonText}>↪ Route</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.declineButton}
                    onPress={() => handleOpenAction(item, 'Decline')}
                    accessibilityLabel="Decline inquiry"
                  >
                    <Text style={styles.declineButtonText}>✕ Decline</Text>
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
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text
  },
  headerSubtitle: {
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 14,
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
    fontSize: 10,
    fontWeight: '600',
    color: lightColors.successText
  },
  contentText: {
    fontSize: 13,
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
    fontSize: 12
  },
  visitButton: {
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
    fontSize: 12
  },
  routeButton: {
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
    fontSize: 12
  },
  declineButton: {
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
    fontSize: 12
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
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: spaceScale.md
  },
  modalDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    marginBottom: spaceScale.md
  },
  modalFieldLabel: {
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 13,
    color: lightColors.textMuted
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: spaceScale.sm
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: spaceScale.xs
  },
  emptySubtitle: {
    fontSize: 13,
    color: lightColors.textMuted,
    textAlign: 'center'
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: spaceScale.sm
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.emergencyText,
    marginBottom: spaceScale.xs
  },
  errorSubtitle: {
    fontSize: 13,
    color: lightColors.textMuted,
    textAlign: 'center'
  }
});
