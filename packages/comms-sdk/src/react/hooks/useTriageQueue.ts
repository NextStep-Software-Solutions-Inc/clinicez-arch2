import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConversationDto } from '../../core/types';
import { useCommsContext } from '../CommsContext';
import {
  TriageDispositionInput,
  TriageQueueItem,
  UseTriageQueueOptions,
  UseTriageQueueResult
} from '../types';

export function useTriageQueue(
  facilityId: string,
  options?: UseTriageQueueOptions
): UseTriageQueueResult {
  const { client, staffId, staffDisplayName } = useCommsContext();

  const [rawItems, setRawItems] = useState<ConversationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmittingDisposition, setIsSubmittingDisposition] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      // In full client, queries GET /api/v1/comms/triage or facility endpoints
      setError(null);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubThread = client.events.on('threadStateChanged', ({ conversationId, newStatus, disposition }) => {
      setRawItems((prev) =>
        prev.map((item) =>
          item.id === conversationId
            ? { ...item, status: newStatus, triageDisposition: disposition }
            : item
        )
      );
    });

    const unsubCreated = client.events.on('conversationCreated', (conv) => {
      if (conv.scope === 'PatientFacility') {
        setRawItems((prev) => [conv, ...prev]);
      }
    });

    setIsLoading(false);

    return () => {
      unsubThread();
      unsubCreated();
    };
  }, [client]);

  const claimRequest = useCallback(
    async (conversationId: string): Promise<void> => {
      setRawItems((prev) =>
        prev.map((item) =>
          item.id === conversationId
            ? { ...item, assignedStaffId: staffId, assignedStaffName: staffDisplayName }
            : item
        )
      );
    },
    [staffDisplayName, staffId]
  );

  const recordDisposition = useCallback(
    async (conversationId: string, input: TriageDispositionInput): Promise<ConversationDto> => {
      setIsSubmittingDisposition(true);
      try {
        const item = rawItems.find((i) => i.id === conversationId);
        const updated: ConversationDto = {
          ...(item ?? {
            id: conversationId,
            tenantId: '',
            facilityId,
            scope: 'PatientFacility',
            kind: 'PatientTriage',
            title: 'Triage Inquiry',
            isEmergencyConfirmed: false,
            isLocalOnly: false,
            reopenCount: 0,
            messageCount: 0,
            lastSeq: 0,
            createdAtUtc: new Date().toISOString(),
            createdBy: 'patient',
            participants: []
          }),
          status: input.disposition === 'Routed' ? 'Routed' : 'Closed',
          triageDisposition: input.disposition,
          declineReasonCode: input.declineReasonCode,
          assignedStaffId: input.assignedStaffId ?? staffId,
          assignedStaffName: input.assignedStaffName ?? staffDisplayName,
          priority: input.priority,
          triagedAtUtc: new Date().toISOString(),
          triagedByStaffId: staffId,
          triagedByStaffName: staffDisplayName
        };

        setRawItems((prev) =>
          prev.map((i) => (i.id === conversationId ? updated : i))
        );

        client.events.emit('threadStateChanged', {
          conversationId,
          newStatus: updated.status,
          disposition: input.disposition,
          assignedStaffId: updated.assignedStaffId,
          assignedStaffName: updated.assignedStaffName
        });

        return updated;
      } finally {
        setIsSubmittingDisposition(false);
      }
    },
    [client, facilityId, rawItems, staffDisplayName, staffId]
  );

  const routeToStaff = useCallback(
    async (
      conversationId: string,
      targetStaffId: string,
      targetStaffName: string,
      priority: 'Routine' | 'Urgent',
      internalNote?: string
    ): Promise<ConversationDto> => {
      return await recordDisposition(conversationId, {
        disposition: 'Routed',
        assignedStaffId: targetStaffId,
        assignedStaffName: targetStaffName,
        priority,
        internalNote
      });
    },
    [recordDisposition]
  );

  const answerRequest = useCallback(
    async (
      conversationId: string,
      publicResponseText: string,
      internalNote?: string
    ): Promise<ConversationDto> => {
      return await recordDisposition(conversationId, {
        disposition: 'Answered',
        publicResponseText,
        internalNote
      });
    },
    [recordDisposition]
  );

  const requestVisit = useCallback(
    async (
      conversationId: string,
      appointmentReason: string,
      internalNote?: string
    ): Promise<ConversationDto> => {
      return await recordDisposition(conversationId, {
        disposition: 'NeedsVisit',
        publicResponseText: appointmentReason,
        internalNote
      });
    },
    [recordDisposition]
  );

  const declineRequest = useCallback(
    async (
      conversationId: string,
      reasonCode: string,
      publicExplanation?: string,
      internalNote?: string
    ): Promise<ConversationDto> => {
      return await recordDisposition(conversationId, {
        disposition: 'Declined',
        declineReasonCode: reasonCode,
        publicResponseText: publicExplanation,
        internalNote
      });
    },
    [recordDisposition]
  );

  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const items = useMemo<TriageQueueItem[]>(() => {
    const now = Date.now();
    return rawItems
      .filter((i) => i.status === 'Submitted' || i.status === 'WithTriage')
      .map((item) => {
        const dueTime = item.triageDueAtUtc ? new Date(item.triageDueAtUtc).getTime() : now + 3600000;
        const slaRemaining = Math.max(0, Math.floor((dueTime - now) / 1000));
        const isSlaBreached = dueTime < now || (item.slaBreached ?? false);

        return {
          ...item,
          slaTimeRemainingSeconds: slaRemaining,
          isSlaBreached,
          patientFullName: item.title || 'Patient Inquiry',
          patientAge: 'Adult',
          patientSex: 'Unknown',
          patientContact: ''
        };
      })
      .sort((a, b) => {
        if (options?.urgencySort === 'urgentFirst') {
          if (a.priority === 'Emergency' && b.priority !== 'Emergency') return -1;
          if (b.priority === 'Emergency' && a.priority !== 'Emergency') return 1;
          if (a.priority === 'Urgent' && b.priority !== 'Urgent') return -1;
          if (b.priority === 'Urgent' && a.priority !== 'Urgent') return 1;
        }
        return a.slaTimeRemainingSeconds - b.slaTimeRemainingSeconds;
      });
  }, [options?.urgencySort, rawItems, tick]);

  const pendingCount = items.length;
  const urgentCount = items.filter((i) => i.priority === 'Emergency' || i.priority === 'Urgent').length;
  const slaBreachedCount = items.filter((i) => i.isSlaBreached).length;

  return {
    items,
    pendingCount,
    urgentCount,
    slaBreachedCount,
    isLoading,
    isSubmittingDisposition,
    error,
    refresh,
    claimRequest,
    recordDisposition,
    routeToStaff,
    answerRequest,
    requestVisit,
    declineRequest
  };
}
