import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ThemedText,
  Badge,
  BadgeVariant,
  Button,
  Card,
  CardHeader,
  CardContent,
  Icon,
  EmptyState,
  ErrorState,
  SkeletonList,
  Modal,
  SegmentedControl,
  StatCard,
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { notify } from '@utils/feedback';
import { getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import {
  clinicService,
  computeScopedStations,
  isPatientVisibleToStaff,
  resolveCallToRoom,
  PatientQueueItem,
  QueueStatus,
  QueueView,
  QueueMetrics,
  ClinicalProcedureRecord,
  ClinicRoom,
} from '../../services/clinicService';
import { ProcedureExecutionModal } from '../../components/chart/NursingProceduresTab';
import ForceEodConfirmationModal from '../../components/queue/ForceEodConfirmationModal';

export default function QueueScreen() {
  const navigation = useNavigation<any>();
  const { current: currentStaff } = useStaff();
  const { rooms = [] } = useClinic();

  const activeRooms = useMemo(() => (rooms || []).filter((r) => r.isActive), [rooms]);

  const staffKey = currentStaff?.id ? `clinicez:queue:${currentStaff.id}` : 'clinicez:queue:default';

  // Filters with persistence
  const [selectedView, setSelectedView] = useState<QueueView>(() => {
    const saved = getDeviceItem(`${staffKey}:view`);
    if (saved === 'All' || saved === 'MyRoom' || saved === 'WaitingForDoctor' || saved === 'Triage' || saved === 'PendingProcedure' || saved === 'Completed') {
      return saved as QueueView;
    }
    return 'All';
  });
  const [selectedStation, setSelectedStation] = useState<string>(() => {
    return getDeviceItem(`${staffKey}:station`) || 'ALL';
  });

  const didApplyStaffDefaults = useRef(false);
  useEffect(() => {
    if (didApplyStaffDefaults.current || !currentStaff || activeRooms.length === 0) return;
    didApplyStaffDefaults.current = true;
    const staffStorageKey = `clinicez:queue:${currentStaff.id}`;
    const savedView = getDeviceItem(`${staffStorageKey}:view`);
    const savedStation = getDeviceItem(`${staffStorageKey}:station`);

    if (savedView === 'All' || savedView === 'MyRoom' || savedView === 'WaitingForDoctor' || savedView === 'Triage' || savedView === 'PendingProcedure' || savedView === 'Completed') {
      setSelectedView(savedView as QueueView);
    }
    if (savedStation) {
      setSelectedStation(savedStation);
    }
  }, [currentStaff, activeRooms]);

  const { visibleRooms, allPillLabel } = useMemo(
    () => computeScopedStations(activeRooms, currentStaff, selectedView),
    [activeRooms, currentStaff, selectedView],
  );

  const handleViewChange = (newView: QueueView) => {
    setSelectedView(newView);
    if (currentStaff?.id) {
      setDeviceItem(`clinicez:queue:${currentStaff.id}:view`, newView);
    }
    const nextScope = computeScopedStations(activeRooms, currentStaff, newView);
    if (
      selectedStation !== 'ALL' &&
      !nextScope.visibleRooms.some((r) => r.name === selectedStation || r.id === selectedStation)
    ) {
      setSelectedStation('ALL');
      if (currentStaff?.id) {
        setDeviceItem(`clinicez:queue:${currentStaff.id}:station`, 'ALL');
      }
    }
  };

  const handleStationChange = (stationName: string) => {
    setSelectedStation(stationName);
    if (currentStaff?.id) {
      setDeviceItem(`clinicez:queue:${currentStaff.id}:station`, stationName);
    }
  };

  const [queue, setQueue] = useState<PatientQueueItem[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Call to room modal
  const [callModalItem, setCallModalItem] = useState<PatientQueueItem | null>(null);
  const [selectedCallRoom, setSelectedCallRoom] = useState<string>('Room 1');
  const [selectedCallRoomId, setSelectedCallRoomId] = useState<string | undefined>(undefined);
  const [isCalling, setIsCalling] = useState(false);

  // Procedure execution modal
  const [executingProc, setExecutingProc] = useState<ClinicalProcedureRecord | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    const doctorId = currentStaff?.id;
    const selectedRoomObj =
      selectedStation === 'ALL'
        ? undefined
        : activeRooms.find((r) => r.name === selectedStation || r.id === selectedStation);
    const [queueData, queueErr] = await clinicService.getQueue({
      view: selectedView,
      doctorId: selectedView === 'MyRoom' ? doctorId : undefined,
      roomId: selectedRoomObj?.id,
      roomOrStation: selectedStation === 'ALL' ? undefined : selectedStation,
    });

    const [metricsData] = await clinicService.getQueueMetrics();

    if (queueErr || !queueData) {
      setError(queueErr?.message || 'Failed to load queue items.');
    } else {
      const filtered = queueData.filter((item) =>
        isPatientVisibleToStaff(item, currentStaff, activeRooms),
      );
      setQueue(filtered);
    }

    if (metricsData) {
      setMetrics(metricsData);
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedView, selectedStation, currentStaff, activeRooms]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCallPatient = async () => {
    if (!callModalItem) return;
    setIsCalling(true);
    const doctorName = currentStaff ? formatStaffName(currentStaff) : undefined;
    const targetRoom = activeRooms.find((r) => r.name === selectedCallRoom || r.id === selectedCallRoomId);
    const targetRoomId = targetRoom?.id || selectedCallRoomId;
    const [, err] = await clinicService.callQueueItem(
      callModalItem.id,
      currentStaff?.id,
      doctorName,
      selectedCallRoom,
      targetRoomId,
    );

    setIsCalling(false);
    if (err) {
      notify.error(err.message || 'Failed to call patient.');
      return;
    }

    notify.success(`${callModalItem.patientName} called to ${selectedCallRoom}.`);
    setCallModalItem(null);
    loadData();
  };

  const getStatusBadge = (status: QueueStatus): { label: string; variant: BadgeVariant } => {
    switch (status) {
      case 'Waiting':
        return { label: 'Waiting for Triage', variant: 'warning' };
      case 'Triaged':
        return { label: 'Triaged (Ready)', variant: 'success' };
      case 'InConsultation':
        return { label: 'In Consultation', variant: 'purple' };
      case 'PendingProcedure':
        return { label: 'Procedure Bay', variant: 'urgent' };
      case 'ReEvaluation':
        return { label: 'Re-Evaluation Ready', variant: 'emergency' };
      case 'Completed':
        return { label: 'Completed', variant: 'neutral' };
      default:
        return { label: status, variant: 'neutral' };
    }
  };

  const getPriorityVariant = (priority: string): BadgeVariant => {
    if (priority === 'Emergency') return 'emergency';
    if (priority === 'Urgent') return 'urgent';
    return 'routine';
  };

  const waitingCount = useMemo(() => queue.filter((q) => q.status === 'Waiting').length, [queue]);
  const procedureBayCount = useMemo(() => queue.filter((q) => q.status === 'PendingProcedure').length, [queue]);
  const activeEodCount = useMemo(
    () => queue.filter((q) => q.status === 'Waiting' || q.status === 'Triaged' || q.status === 'OnHold').length,
    [queue]
  );
  const [showForceEodModal, setShowForceEodModal] = useState(false);

  return (
    <ResponsiveLayout headerTitle="Queue & Stations">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* STATS SUMMARY METRICS BAR */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <StatCard
              label="In Queue"
              value={metrics?.inQueue ?? queue.length}
              icon="ticket"
              valueColor={theme.colors.primary}
            />
          </View>
          <View style={styles.metricItem}>
            <StatCard
              label="Urgent / STAT"
              value={metrics?.urgentTriage ?? 0}
              icon="emergency"
              valueColor={theme.colors.emergency}
            />
          </View>
          <View style={styles.metricItem}>
            <StatCard
              label="Waiting for Triage"
              value={waitingCount}
              icon="clock"
              valueColor={theme.colors.warningText}
            />
          </View>
          <View style={styles.metricItem}>
            <StatCard
              label="Procedure Bay"
              value={procedureBayCount}
              icon="syringe"
              valueColor={theme.colors.urgentText}
            />
          </View>
          <View style={styles.metricItem}>
            <StatCard
              label="Completed Today"
              value={metrics?.completedToday ?? 0}
              icon="check"
              valueColor={theme.colors.successText}
            />
          </View>
        </View>

        {/* STATION / ROOM SELECTOR PILLS */}
        <View style={styles.filterSection}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            STATION / ROOM ASSIGNMENT:
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroll}>
            <Pressable
              onPress={() => handleStationChange('ALL')}
              style={[
                styles.stationPill,
                selectedStation === 'ALL' && styles.stationPillActive,
              ]}
            >
              <ThemedText
                variant="captionBold"
                color={selectedStation === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                {allPillLabel}
              </ThemedText>
            </Pressable>
            {visibleRooms.map((room) => {
              const isSelected = selectedStation === room.name;
              const isMine = (currentStaff?.assignedRoomIds?.includes(room.id)) || currentStaff?.assignedRoomId === room.id;
              return (
                <Pressable
                  key={room.id}
                  onPress={() => handleStationChange(room.name)}
                  style={[
                    styles.stationPill,
                    isSelected && styles.stationPillActive,
                  ]}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                  >
                    {isMine ? `${room.name} (Mine)` : room.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* FAST VIEW SEGMENTED CONTROLS & FORCE EOD */}
        <View style={styles.viewSwitcherSection}>
          <View style={styles.segmentedWrap}>
            <SegmentedControl<QueueView>
              options={[
                { value: 'WaitingForDoctor', label: 'Waiting for Doctor' },
                { value: 'MyRoom', label: 'My Room' },
                { value: 'Triage', label: 'Triage' },
                { value: 'PendingProcedure', label: 'Procedure Bay' },
                { value: 'Completed', label: 'Completed' },
                { value: 'All', label: 'All Queue' },
              ]}
              value={selectedView}
              onChange={handleViewChange}
            />
          </View>
          <Button
            title="Force EOD / Close Day"
            variant="outline"
            icon="clock"
            size="sm"
            onPress={() => setShowForceEodModal(true)}
          />
        </View>

        {/* QUEUE CARDS LIST */}
        {loading ? (
          <SkeletonList rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : queue.length === 0 ? (
          <EmptyState
            icon="ticket"
            title="Queue is clear"
            description="No patients matching the active station or filter criteria."
          />
        ) : (
          <View style={styles.queueList}>
            {queue.map((ticket) => {
              const statusBadge = getStatusBadge(ticket.status);
              return (
                <Card key={ticket.id} style={styles.ticketCard}>
                  <CardHeader
                    title={`${ticket.queueNumber}  ${ticket.patientName}`}
                    subtitle={ticket.chiefComplaint ? `Complaint: ${ticket.chiefComplaint}` : undefined}
                    rightAction={
                      <View style={styles.badgeRow}>
                        <Badge
                          label={ticket.priority}
                          variant={getPriorityVariant(ticket.priority)}
                          size="sm"
                        />
                        <Badge
                          label={statusBadge.label}
                          variant={statusBadge.variant}
                          size="sm"
                        />
                      </View>
                    }
                  />
                  <CardContent style={styles.ticketBody}>
                    <View style={styles.ticketMetaRow}>
                      <View style={styles.metaItem}>
                        <Icon name="clinic" size={14} color={theme.colors.textSecondary} />
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          Station: {ticket.roomOrStation || 'Unassigned'}
                        </ThemedText>
                      </View>
                      {ticket.doctorName ? (
                        <View style={styles.metaItem}>
                          <Icon name="staff" size={14} color={theme.colors.textSecondary} />
                          <ThemedText variant="caption" color={theme.colors.textSecondary}>
                            Doctor: {ticket.doctorName}
                          </ThemedText>
                        </View>
                      ) : null}
                      <View style={styles.metaItem}>
                        <Icon name="clock" size={14} color={theme.colors.textSecondary} />
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          In: {ticket.checkInTime ? new Date(ticket.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </ThemedText>
                      </View>
                    </View>

                    {/* ACTIONS BAR */}
                    <View style={styles.ticketActionsRow}>
                      {ticket.status === 'Triaged' && (
                        <Button
                          title="Call to Room"
                          variant="primary"
                          icon="bell"
                          size="sm"
                          onPress={() => {
                            const resolved = resolveCallToRoom({
                              ticket,
                              selectedStation,
                              currentStaff,
                              activeRooms,
                              visibleRooms,
                            });
                            setCallModalItem(ticket);
                            setSelectedCallRoom(resolved.roomName);
                            setSelectedCallRoomId(resolved.roomId);
                          }}
                        />
                      )}

                      {ticket.status === 'PendingProcedure' && (
                        <Button
                          title="Execute Procedure"
                          variant="primary"
                          icon="check"
                          size="sm"
                          onPress={() => {
                            setExecutingProc({
                              id: ticket.id,
                              tenantId: ticket.tenantId,
                              clinicId: ticket.clinicId,
                              patientId: ticket.patientId,
                              patientName: ticket.patientName,
                              procedureName: ticket.chiefComplaint || 'In-Clinic Procedure',
                              category: 'Procedure',
                              status: 'InProgress',
                              scheduledAt: new Date().toISOString(),
                            });
                          }}
                        />
                      )}

                      {(ticket.status === 'InConsultation' || ticket.status === 'ReEvaluation') && (
                        <Button
                          title={ticket.status === 'ReEvaluation' ? 'Resume Consultation (Re-Eval)' : 'Continue Consultation'}
                          variant={ticket.status === 'ReEvaluation' ? 'primary' : 'outline'}
                          icon="consultations"
                          size="sm"
                          onPress={() => {
                            navigation.navigate('Consultations', {
                              queueItemId: ticket.id,
                              patientId: ticket.patientId,
                            });
                          }}
                        />
                      )}

                      {ticket.status === 'Waiting' && (
                        <Button
                          title="Triage Patient"
                          variant="outline"
                          icon="heartPulse"
                          size="sm"
                          onPress={() => {
                            navigation.navigate('Consultations', {
                              queueItemId: ticket.id,
                              patientId: ticket.patientId,
                            });
                          }}
                        />
                      )}

                      {ticket.status === 'Completed' && (
                        <Button
                          title="View Chart"
                          variant="ghost"
                          icon="file"
                          size="sm"
                          onPress={() => {
                            navigation.navigate('Patients', {
                              patientId: ticket.patientId,
                            });
                          }}
                        />
                      )}
                    </View>
                  </CardContent>
                </Card>
              );
            })}
          </View>
        )}

        {/* CALL TO ROOM MODAL */}
        <Modal
          visible={!!callModalItem}
          title={`Call ${callModalItem?.patientName || ''}`}
          onClose={() => setCallModalItem(null)}
        >
          <View style={styles.modalContent}>
            <ThemedText variant="body" color={theme.colors.text}>
              Assign examination room or station for Ticket {callModalItem?.queueNumber}:
            </ThemedText>

            <View style={styles.roomOptionGroup}>
              {visibleRooms.map((room) => {
                const isSelected = selectedCallRoom === room.name;
                const isMine = (currentStaff?.assignedRoomIds?.includes(room.id)) || currentStaff?.assignedRoomId === room.id;
                return (
                  <Pressable
                    key={room.id}
                    onPress={() => {
                      setSelectedCallRoom(room.name);
                      setSelectedCallRoomId(room.id);
                    }}
                    style={[
                      styles.roomOptionCard,
                      isSelected && styles.roomOptionCardActive,
                    ]}
                  >
                    <Icon
                      name={isSelected ? 'checkCircle' : 'dot'}
                      size={16}
                      color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                    />
                    <ThemedText
                      variant="bodyBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                    >
                      {room.name}{isMine ? ' (Mine)' : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setCallModalItem(null)}
              />
              <Button
                title={`Call to ${selectedCallRoom}`}
                variant="primary"
                icon="bell"
                loading={isCalling}
                onPress={handleCallPatient}
              />
            </View>
          </View>
        </Modal>

        {/* PROCEDURE EXECUTION MODAL */}
        <ProcedureExecutionModal
          visible={!!executingProc}
          procedure={executingProc}
          onClose={() => setExecutingProc(null)}
          onSuccess={() => {
            setExecutingProc(null);
            loadData();
          }}
        />

        {/* FORCE EOD MODAL */}
        <ForceEodConfirmationModal
          visible={showForceEodModal}
          onClose={() => setShowForceEodModal(false)}
          activeTicketCount={activeEodCount}
          onSuccess={loadData}
        />
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  metricItem: {
    flex: 1,
    minWidth: 140,
  },
  filterSection: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  pillScroll: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  stationPill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  stationPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  viewSwitcherSection: {
    marginVertical: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  segmentedWrap: {
    flex: 1,
    minWidth: 280,
  },
  queueList: {
    gap: theme.spacing.sm,
  },
  ticketCard: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  ticketBody: {
    gap: theme.spacing.sm,
  },
  ticketMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ticketActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  modalContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  roomOptionGroup: {
    gap: theme.spacing.xs,
  },
  roomOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  roomOptionCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
});
