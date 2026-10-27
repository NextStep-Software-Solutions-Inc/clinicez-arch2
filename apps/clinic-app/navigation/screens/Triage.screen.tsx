import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTriageQueue } from '@clinicez/comms-sdk/react';
import { TriageQueueView } from '@clinicez/comms-sdk/native-ui';
import type { TriageDispositionPayload, TriageQueueItem } from '@clinicez/comms-sdk/native-ui';
import { ResponsiveLayout } from '../../components/layout';
import { useClinic } from '../../context/ClinicContext';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/feedback';
import { theme } from '../../constants/theme';

export default function TriageScreen() {
  const { facilityName, license } = useClinic();
  const { user } = useAuth();
  const facilityId = license?.clinicId || user?.clinicId || '';

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
            payload.replyText || 'Inquiry answered by clinic staff.',
          );
          notify.success('Inquiry disposition recorded: Answered.');
        } else if (payload.disposition === 'NeedsVisit') {
          await requestVisit(
            payload.conversationId,
            payload.replyText || 'In-clinic consultation recommended for patient evaluation.',
          );
          notify.success('Inquiry disposition recorded: In-Clinic Visit Requested.');
        } else if (payload.disposition === 'Declined') {
          await declineRequest(
            payload.conversationId,
            payload.declineReasonCode || 'OTHER',
            payload.declineNotes || 'Request could not be processed.',
          );
          notify.success('Inquiry disposition recorded: Declined.');
        } else if (payload.disposition === 'Routed') {
          await routeToStaff(
            payload.conversationId,
            payload.routedStaffId || user?.id || 'staff',
            'Attending Clinician',
            payload.routedPriority || 'Routine',
            payload.replyText,
          );
          notify.success('Inquiry routed to attending clinician.');
        }
      } catch (err: any) {
        notify.error(err?.message || 'Failed to record triage disposition.');
      }
    },
    [answerRequest, requestVisit, declineRequest, routeToStaff, user?.id],
  );

  const mappedItems: TriageQueueItem[] = items.map((i) => ({
    conversationId: i.id,
    requestId: i.id,
    patientId: i.contextId || i.id,
    patientNameMasked: i.patientFullName || i.title || 'Patient Inquiry',
    patientDobMasked: '',
    patientAgeGender: `${i.patientAge || 'Adult'} • ${i.patientSex || 'Patient'}`,
    category: i.category || 'General',
    contentText: i.lastMessageSnippet || 'Patient inquiry pending triage review.',
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
    <ResponsiveLayout
      headerTitle="Triage Desk"
      headerSubtitle="Real-time patient triage queue with 1-click clinical dispositions"
    >
      <View style={styles.container}>
        <TriageQueueView
          items={mappedItems}
          facilityName={facilityName || 'Clinic EZ'}
          onExecuteDisposition={handleExecuteDisposition}
          onRefresh={refresh}
          isLoading={isLoading}
          error={error ? error.message : null}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </View>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
