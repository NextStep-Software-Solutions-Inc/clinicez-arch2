import React, { useEffect, useMemo, useState } from 'react';
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

export type SlaTier = 'breached' | 'warning' | 'onSchedule';

export function getSlaTier(item: TriageQueueItem): SlaTier {
  if (isItemSlaBreached(item)) {
    return 'breached';
  }

  let remainingSec: number | null = null;
  if (typeof item.slaTimeRemainingSeconds === 'number' && !isNaN(item.slaTimeRemainingSeconds)) {
    remainingSec = item.slaTimeRemainingSeconds;
  } else if (item.triageDueAtUtc) {
    const dueTime = new Date(item.triageDueAtUtc).getTime();
    if (!isNaN(dueTime)) {
      remainingSec = Math.floor((dueTime - Date.now()) / 1000);
    }
  }

  if (remainingSec === null || remainingSec === undefined) {
    return 'onSchedule';
  }
  if (remainingSec <= 0) {
    return 'breached';
  }
  if (remainingSec <= 900) {
    return 'warning';
  }
  return 'onSchedule';
}

function formatSlaCountdown(item: TriageQueueItem): string {
  if (isItemSlaBreached(item)) {
    return 'Response Overdue';
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
    return 'Response Overdue';
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
  onSelectCard,
  isLoading = false,
  error = null,
  activeFilter = 'All',
  onFilterChange,
  colors,
  style
}) => {
  const colorsKey = colors
    ? `${colors.primary ?? ''}|${colors.primaryLight ?? ''}|${colors.primarySubtle ?? ''}|${colors.primaryBorder ?? ''}|${colors.primaryDark ?? ''}|${colors.routineBg ?? ''}|${colors.routineBorder ?? ''}|${colors.routineText ?? ''}|${colors.background ?? ''}|${colors.surface ?? ''}|${colors.text ?? ''}`
    : '';
  const c = useMemo<ResolvedCommsColors>(() => ({ ...lightColors, ...colors }), [colors, colorsKey]);
  const styles = useMemo(() => createStyles(c), [c]);

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
      {/* Header with Filter Bar */}
      {onFilterChange && (
        <View style={styles.header}>
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
                    {filter === 'Emergency' ? 'Emergency' : filter === 'Urgent' ? 'Urgent' : filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

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
              <TouchableOpacity
                key={item.conversationId}
                style={styles.card}
                activeOpacity={onSelectCard ? 0.7 : 1}
                onPress={() => onSelectCard?.(item.conversationId)}
                accessibilityRole="button"
                accessibilityLabel={`Inquiry from ${item.patientNameMasked || 'Patient'}`}
              >
                {/* Urgency & SLA Header */}
                <View style={styles.cardTopRow}>
                  <View style={styles.badgesRow}>
                    {isStat ? (
                      <View style={styles.statBadge}>
                        <Text style={styles.statBadgeText}>Emergency</Text>
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
                      getSlaTier(item) === 'breached'
                        ? styles.slaPillBreached
                        : getSlaTier(item) === 'warning'
                          ? styles.slaPillWarning
                          : styles.slaPillOnSchedule
                    ]}
                  >
                    <Text
                      style={[
                        styles.slaPillText,
                        getSlaTier(item) === 'breached'
                          ? styles.slaPillTextBreached
                          : getSlaTier(item) === 'warning'
                            ? styles.slaPillTextWarning
                            : styles.slaPillTextOnSchedule
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
              </TouchableOpacity>
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
                placeholderTextColor={c.textMuted}
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
                  placeholderTextColor={c.textMuted}
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
                  {isSubmitting ? 'Submitting...' : 'Confirm Clinical Decision'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

type ResolvedCommsColors = Record<keyof typeof lightColors, string>;

function createStyles(c: ResolvedCommsColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background
    },
    header: {
      padding: spaceScale.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border
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
      color: c.text
    },
    headerSubtitle: {
      fontSize: fontSizeScale.xs,
      color: c.textSecondary,
      marginTop: 2
    },
    refreshButton: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radiusScale.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    refreshButtonText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.text,
    },
    filterBar: {
      flexDirection: 'row',
      gap: spaceScale.xs,
    },
    filterPill: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      borderRadius: radiusScale.full,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    filterPillActive: {
      backgroundColor: c.primaryLight,
      borderColor: c.primaryBorder,
    },
    filterPillText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '500',
      color: c.textSecondary
    },
    filterPillTextActive: {
      color: c.primaryDark,
      fontWeight: '700'
    },
    list: {
      flex: 1,
      padding: spaceScale.md
    },
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
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
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1,
      paddingHorizontal: spaceScale.sm,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    statBadgeText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.emergencyText
    },
    urgentBadge: {
      backgroundColor: c.urgentBg,
      borderColor: c.urgentBorder,
      borderWidth: 1,
      paddingHorizontal: spaceScale.sm,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    urgentBadgeText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.urgentText
    },
    routineBadge: {
      backgroundColor: c.routineBg,
      borderColor: c.routineBorder,
      borderWidth: 1,
      paddingHorizontal: spaceScale.sm,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    routineBadgeText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.routineText
    },
    categoryBadge: {
      backgroundColor: c.surfaceSubtle,
      paddingHorizontal: spaceScale.sm,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    categoryBadgeText: {
      fontSize: fontSizeScale.xs,
      color: c.textSecondary
    },
    slaPill: {
      paddingHorizontal: spaceScale.sm,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    slaPillNormal: {
      backgroundColor: c.surfaceSubtle
    },
    slaPillOnSchedule: {
      backgroundColor: c.successBg,
      borderColor: c.successBorder,
      borderWidth: 1
    },
    slaPillWarning: {
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
      borderWidth: 1
    },
    slaPillBreached: {
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1
    },
    slaPillText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600'
    },
    slaPillTextNormal: {
      color: c.textMuted
    },
    slaPillTextOnSchedule: {
      color: c.successText
    },
    slaPillTextWarning: {
      color: c.warningText
    },
    slaPillTextBreached: {
      color: c.emergencyText
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
      color: c.text
    },
    screenedBadge: {
      backgroundColor: c.successBg,
      borderColor: c.successBorder,
      borderWidth: 1,
      paddingHorizontal: spaceScale.xs,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    screenedBadgeText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.successText
    },
    contentText: {
      fontSize: fontSizeScale.sm,
      color: c.textSecondary,
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
      backgroundColor: c.primary,
      borderRadius: radiusScale.sm,
      justifyContent: 'center',
      alignItems: 'center'
    },
    answerButtonText: {
      color: c.onPrimary,
      fontWeight: '600',
      fontSize: fontSizeScale.xs
    },
    visitButton: {
      flexGrow: 1,
      minWidth: 80,
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      backgroundColor: c.surfaceSubtle,
      borderColor: c.borderDark,
      borderWidth: 1,
      borderRadius: radiusScale.sm,
      justifyContent: 'center',
      alignItems: 'center'
    },
    visitButtonText: {
      color: c.text,
      fontWeight: '600',
      fontSize: fontSizeScale.xs
    },
    routeButton: {
      flexGrow: 1,
      minWidth: 80,
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      backgroundColor: c.surfaceSubtle,
      borderRadius: radiusScale.sm,
      justifyContent: 'center',
      alignItems: 'center'
    },
    routeButtonText: {
      color: c.textSecondary,
      fontWeight: '600',
      fontSize: fontSizeScale.xs
    },
    declineButton: {
      flexGrow: 1,
      minWidth: 80,
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.md,
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1,
      borderRadius: radiusScale.sm,
      justifyContent: 'center',
      alignItems: 'center'
    },
    declineButtonText: {
      color: c.emergencyText,
      fontWeight: '600',
      fontSize: fontSizeScale.xs
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spaceScale.lg
    },
    modalContent: {
      width: '100%',
      maxWidth: 480,
      backgroundColor: c.surface,
      borderRadius: radiusScale.md,
      padding: spaceScale.lg,
      borderColor: c.border,
      borderWidth: 1
    },
    modalTitle: {
      fontSize: fontSizeScale.lg,
      fontWeight: '700',
      color: c.text,
      marginBottom: spaceScale.md
    },
    modalDescription: {
      fontSize: fontSizeScale.sm,
      color: c.textSecondary,
      marginBottom: spaceScale.md
    },
    modalFieldLabel: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.text,
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
      backgroundColor: c.surfaceSubtle,
      marginRight: spaceScale.xs,
      justifyContent: 'center',
      alignItems: 'center'
    },
    reasonPillActive: {
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1
    },
    reasonPillText: {
      fontSize: fontSizeScale.xs,
      color: c.textSecondary
    },
    reasonPillTextActive: {
      color: c.emergencyText,
      fontWeight: '700'
    },
    modalInput: {
      backgroundColor: c.surfaceSubtle,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radiusScale.sm,
      padding: spaceScale.md,
      fontSize: fontSizeScale.sm,
      color: c.text,
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
      backgroundColor: c.surfaceSubtle,
      justifyContent: 'center',
      alignItems: 'center'
    },
    modalCancelText: {
      fontSize: fontSizeScale.sm,
      fontWeight: '600',
      color: c.textSecondary
    },
    modalSubmitButton: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.lg,
      borderRadius: radiusScale.sm,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center'
    },
    modalSubmitText: {
      fontSize: fontSizeScale.sm,
      fontWeight: '700',
      color: c.onPrimary
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
      color: c.textMuted
    },
    // Skeleton Loaders
    skeletonCard: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radiusScale.md,
      padding: spaceScale.md,
      marginBottom: spaceScale.md
    },
    skeletonBadge: {
      width: 48,
      height: 20,
      borderRadius: radiusScale.xs,
      backgroundColor: c.skeletonBase
    },
    skeletonCategory: {
      width: 72,
      height: 20,
      borderRadius: radiusScale.xs,
      backgroundColor: c.skeletonHighlight
    },
    skeletonSlaPill: {
      width: 110,
      height: 20,
      borderRadius: radiusScale.full,
      backgroundColor: c.skeletonBase
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
      backgroundColor: c.skeletonBase
    },
    skeletonContentLine1: {
      width: '100%',
      height: 14,
      borderRadius: radiusScale.xs,
      backgroundColor: c.skeletonHighlight,
      marginBottom: spaceScale.xs
    },
    skeletonContentLine2: {
      width: '75%',
      height: 14,
      borderRadius: radiusScale.xs,
      backgroundColor: c.skeletonHighlight,
      marginBottom: spaceScale.md
    },
    skeletonButton: {
      flexGrow: 1,
      minWidth: 80,
      minHeight: sizes.touchTarget,
      borderRadius: radiusScale.sm,
      backgroundColor: c.skeletonBase
    },

    // Structured Error Alert
    errorAlertContainer: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: c.emergencySubtle,
      borderColor: c.emergencyBorder,
      borderWidth: 1,
      borderRadius: radiusScale.md,
      padding: spaceScale.lg,
      alignItems: 'center'
    },
    errorIconContainer: {
      width: sizes.controlLg,
      height: sizes.controlLg,
      borderRadius: radiusScale.full,
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spaceScale.sm
    },
    errorIconGlyph: {
      fontSize: fontSizeScale.xl,
      fontWeight: '700',
      color: c.emergencyText
    },
    errorAlertTitle: {
      fontSize: fontSizeScale.md,
      fontWeight: '700',
      color: c.emergencyText,
      marginBottom: spaceScale.xs,
      textAlign: 'center'
    },
    errorAlertSubtitle: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
      textAlign: 'center',
      marginBottom: spaceScale.md
    },
    errorRetryButton: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.xl,
      backgroundColor: c.emergency,
      borderRadius: radiusScale.sm,
      justifyContent: 'center',
      alignItems: 'center'
    },
    errorRetryButtonText: {
      color: c.onPrimary,
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
      backgroundColor: c.primarySubtle,
      borderColor: c.primaryBorder,
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
      borderColor: c.primary,
      transform: [{ rotate: '45deg' }],
      marginBottom: spaceScale.xs
    },
    emptyTitle: {
      fontSize: fontSizeScale.lg,
      fontWeight: '700',
      color: c.text,
      marginBottom: spaceScale.xs,
      textAlign: 'center'
    },
    emptySubtitle: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
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
      backgroundColor: c.surfaceSubtle,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radiusScale.md,
      paddingVertical: spaceScale.sm,
      paddingHorizontal: spaceScale.xs,
      alignItems: 'center'
    },
    emptyMetricValue: {
      fontSize: fontSizeScale.lg,
      fontWeight: '700',
      color: c.text,
      marginBottom: spaceScale.xxs
    },
    metricSuccess: {
      color: c.successText
    },
    emptyMetricLabel: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
      fontWeight: '500'
    },
    emptyRefreshButton: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.xl,
      backgroundColor: c.primary,
      borderRadius: radiusScale.sm,
      justifyContent: 'center',
      alignItems: 'center'
    },
    emptyRefreshButtonText: {
      color: c.onPrimary,
      fontWeight: '600',
      fontSize: fontSizeScale.sm
    }
  });
}
