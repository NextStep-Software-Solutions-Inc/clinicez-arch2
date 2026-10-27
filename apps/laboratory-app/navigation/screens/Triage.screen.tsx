import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTriageQueue } from '@clinicez/comms-sdk/react';
import { TriageQueueView } from '@clinicez/comms-sdk/native-ui';
import type { TriageDispositionPayload, TriageQueueItem } from '@clinicez/comms-sdk/native-ui';
import { lightColors } from '@clinicez/design-tokens';
import { useFacilityLicense } from '../../components/FacilityActivationGate';

export default function TriageScreen() {
  const { license } = useFacilityLicense();
  const facilityId = license?.laboratoryId || 'default-lab';

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
            payload.replyText || 'Specimen inquiry answered by laboratory medtech.',
          );
        } else if (payload.disposition === 'NeedsVisit') {
          await requestVisit(
            payload.conversationId,
            payload.replyText || 'Patient advised to visit collection center for repeat specimen collection.',
          );
        } else if (payload.disposition === 'Declined') {
          await declineRequest(
            payload.conversationId,
            payload.declineReasonCode || 'OTHER',
            payload.declineNotes || 'Specimen inquiry could not be processed.',
          );
        } else if (payload.disposition === 'Routed') {
          await routeToStaff(
            payload.conversationId,
            payload.routedStaffId || 'lead-pathologist',
            'Attending Pathologist',
            payload.routedPriority || 'Routine',
            payload.replyText,
          );
        }
      } catch (err: any) {
        Alert.alert('Error', err?.message || 'Failed to execute disposition');
      }
    },
    [answerRequest, requestVisit, declineRequest, routeToStaff],
  );

  const mappedItems: TriageQueueItem[] = items.map((i) => ({
    conversationId: i.id,
    requestId: i.id,
    patientId: i.contextId || i.id,
    patientNameMasked: i.patientFullName || i.title || 'Specimen Inquiry',
    patientDobMasked: '',
    patientAgeGender: `${i.patientAge || 'Adult'} • ${i.patientSex || 'Patient'}`,
    category: i.category || 'Laboratory',
    contentText: i.lastMessageSnippet || 'Specimen inquiry pending laboratory review.',
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
        facilityName={license?.laboratoryName || 'Diagnostic Laboratory Triage'}
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
