import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTriageQueue } from '@clinicez/comms-sdk/react';
import { TriageQueueView } from '@clinicez/comms-sdk/native-ui';
import type { TriageDispositionPayload, TriageQueueItem } from '@clinicez/comms-sdk/native-ui';
import { lightColors } from '@clinicez/design-tokens';
import { useAuth } from '../../components/AuthGate';

export default function TriageScreen() {
  const { user } = useAuth();
  const facilityId = user?.pharmacyId || 'default-pharmacy';

  const {
    items,
    isLoading,
    error,
    refresh,
    answerRequest,
    requestVisit,
    declineRequest,
    routeToStaff,
  } = useTriageQueue(facilityId);

  const [activeFilter, setActiveFilter] = useState<'All' | 'Emergency' | 'Urgent' | 'Routine'>('All');

  const handleExecuteDisposition = useCallback(
    async (payload: TriageDispositionPayload) => {
      try {
        if (payload.disposition === 'Answered') {
          await answerRequest(
            payload.conversationId,
            payload.replyText || 'Rx clarification answered by pharmacist.',
          );
        } else if (payload.disposition === 'NeedsVisit') {
          await requestVisit(
            payload.conversationId,
            payload.replyText || 'Patient advised to consult prescribing physician.',
          );
        } else if (payload.disposition === 'Declined') {
          await declineRequest(
            payload.conversationId,
            payload.declineReasonCode || 'OTHER',
            payload.declineNotes || 'Clarification request could not be fulfilled.',
          );
        } else if (payload.disposition === 'Routed') {
          await routeToStaff(
            payload.conversationId,
            payload.routedStaffId || user?.id || 'pharmacist',
            'Lead Pharmacist',
            payload.routedPriority || 'Routine',
            payload.replyText,
          );
        }
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to execute disposition');
      }
    },
    [answerRequest, requestVisit, declineRequest, routeToStaff, user?.id],
  );

  const mappedItems: TriageQueueItem[] = items.map((i) => ({
    conversationId: i.id,
    requestId: i.id,
    patientId: i.contextId || i.id,
    patientNameMasked: i.patientFullName || i.title || 'Prescription Clarification',
    patientDobMasked: '',
    patientAgeGender: `${i.patientAge || 'Adult'} • ${i.patientSex || 'Patient'}`,
    category: i.category || 'Prescription',
    contentText: i.lastMessageSnippet || 'Prescription inquiry pending pharmacy review.',
    priority: (i.priority as 'Emergency' | 'Urgent' | 'Routine') || 'Routine',
    status: (i.status as 'Submitted' | 'WithTriage' | 'Routed') || 'Submitted',
    submittedAtUtc: i.createdAtUtc,
    triageDueAtUtc: i.triageDueAtUtc || i.createdAtUtc,
    isOffHours: false,
    slaBreached: i.isSlaBreached,
    slaTimeRemainingSeconds: i.slaTimeRemainingSeconds,
    isEmergencyConfirmed: i.isEmergencyConfirmed ?? false,
    assignedStaffId: i.assignedStaffId ?? undefined,
    assignedStaffName: i.assignedStaffName ?? undefined,
  }));

  return (
    <View style={styles.container}>
      <TriageQueueView
        items={mappedItems}
        facilityName={user?.name ? `${user.name} (Pharmacy)` : 'Pharmacy Triage'}
        onExecuteDisposition={handleExecuteDisposition}
        onRefresh={refresh}
        isLoading={isLoading}
        error={error ? error.message : null}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
});
