import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import {
  clinicService,
  StaffMember,
  ClinicSettingsRecord,
  DoctorAvailabilityData,
  AvailableSlotItem,
} from '../../services/clinicService';
import { SettingsTabKey } from './types';
import { DoctorRosterCalendarModal } from '../roster/DoctorRosterCalendarModal';

export interface DoctorSchedulingTabProps {
  settings: ClinicSettingsRecord | null;
  staff: StaffMember[];
  onNavigateTab?: (tab: SettingsTabKey) => void;
  onRefresh?: () => Promise<void>;
}

export default function DoctorSchedulingTab({
  settings,
  staff,
  onNavigateTab,
  onRefresh,
}: DoctorSchedulingTabProps) {
  const doctors = (staff || []).filter((s) => s.role === 'Doctor' && s.isActive);

  // Roster Calendar Modal State
  const [rosterModalVisible, setRosterModalVisible] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | undefined>(
    doctors[0]?.id
  );

  // Live Slot Availability Inspector State
  const [inspectorDoctorId, setInspectorDoctorId] = useState<string>(
    doctors[0]?.id || ''
  );
  const [inspectorDate, setInspectorDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [availabilityData, setAvailabilityData] = useState<DoctorAvailabilityData | null>(null);

  // Sync selected doctor if list changes
  useEffect(() => {
    if (doctors.length > 0 && !inspectorDoctorId) {
      setInspectorDoctorId(doctors[0].id);
    }
  }, [doctors, inspectorDoctorId]);

  const fetchAvailability = useCallback(async (docId: string, dateStr: string) => {
    if (!docId || !dateStr) return;
    setLoadingSlots(true);
    try {
      const [data, err] = await clinicService.getDoctorAvailableSlots(docId, dateStr);
      if (err) {
        notify.error(err.message || 'Failed to inspect available slots.');
        setAvailabilityData(null);
      } else {
        setAvailabilityData(data ?? null);
      }
    } catch {
      notify.error('Network error inspecting available slots.');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (inspectorDoctorId && inspectorDate) {
      fetchAvailability(inspectorDoctorId, inspectorDate);
    }
  }, [inspectorDoctorId, inspectorDate, fetchAvailability]);

  const handleOpenRosterModal = (doctorId?: string) => {
    setSelectedDoctorId(doctorId || doctors[0]?.id);
    setRosterModalVisible(true);
  };

  const handleRosterModalClose = async () => {
    setRosterModalVisible(false);
    if (inspectorDoctorId && inspectorDate) {
      await fetchAvailability(inspectorDoctorId, inspectorDate);
    }
    if (onRefresh) {
      await onRefresh();
    }
  };

  const selectedInspectorDoctor = doctors.find((d) => d.id === inspectorDoctorId);

  return (
    <View style={styles.container}>
      {/* 1. Clinic Operating Hours & Policy Card */}
      <Card>
        <CardHeader
          title="Facility Operating & Scheduling Policy"
          subtitle="Baseline clinic hours, consultation slot duration, and booking parameters"
          rightAction={
            onNavigateTab ? (
              <Button
                title="Edit Policy"
                icon="edit"
                variant="outline"
                size="sm"
                onPress={() => onNavigateTab('general')}
              />
            ) : undefined
          }
        />
        <CardContent>
          <View style={styles.policyGrid}>
            <View style={styles.policyItem}>
              <View style={styles.policyIconBox}>
                <Icon name="clock" size={theme.sizes.iconMd} color={theme.colors.primary} />
              </View>
              <View style={styles.policyTextCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Operating Hours
                </ThemedText>
                <ThemedText variant="bodyBold">
                  {settings?.operatingHours || 'Mon-Sat 8:00 AM - 5:00 PM'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.policyItem}>
              <View style={styles.policyIconBox}>
                <Icon name="timer" size={theme.sizes.iconMd} color={theme.colors.primary} />
              </View>
              <View style={styles.policyTextCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Default Slot Duration
                </ThemedText>
                <ThemedText variant="bodyBold">
                  {settings?.defaultSlotDurationMinutes != null
                    ? `${settings.defaultSlotDurationMinutes} minutes`
                    : '30 minutes'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.policyItem}>
              <View style={styles.policyIconBox}>
                <Icon name="billing" size={theme.sizes.iconMd} color={theme.colors.primary} />
              </View>
              <View style={styles.policyTextCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Standard Consultation Fee
                </ThemedText>
                <ThemedText variant="bodyBold">
                  {settings?.defaultConsultationFee != null
                    ? `₱${settings.defaultConsultationFee.toFixed(2)}`
                    : '₱500.00'}
                </ThemedText>
              </View>
            </View>

            <View style={styles.policyItem}>
              <View style={styles.policyIconBox}>
                <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.success} />
              </View>
              <View style={styles.policyTextCol}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Double-Booking Collision Guard
                </ThemedText>
                <ThemedText variant="bodyBold" color={theme.colors.successText}>
                  PostgreSQL GiST Active
                </ThemedText>
              </View>
            </View>
          </View>
        </CardContent>
      </Card>

      {/* 2. Doctor Roster & Shift Schedules Card */}
      <Card>
        <CardHeader
          title="Doctor Roster & Working Hours"
          subtitle="Weekly recurring shift templates, lunch/break periods, and blackout leave dates"
          rightAction={
            doctors.length > 0 ? (
              <Button
                title="Manage Doctor Rosters"
                icon="calendar"
                onPress={() => handleOpenRosterModal(doctors[0]?.id)}
              />
            ) : undefined
          }
        />
        <CardContent>
          {doctors.length === 0 ? (
            <EmptyState
              icon="staff"
              title="No active physicians found"
              description="Add doctors with valid PRC license numbers in Staff Management to configure their schedules."
              actionTitle="Go to Staff Management"
              onAction={() => onNavigateTab && onNavigateTab('staff')}
            />
          ) : (
            <View style={styles.doctorList}>
              {doctors.map((doc) => {
                const fullName = `${doc.title ? `${doc.title} ` : ''}${doc.firstName} ${doc.lastName}`.trim();
                return (
                  <View key={doc.id} style={styles.doctorCard}>
                    <View style={styles.doctorInfoCol}>
                      <View style={styles.doctorNameRow}>
                        <ThemedText variant="bodyBold">{fullName}</ThemedText>
                        <Badge label="Physician" variant="primary" size="sm" />
                        {doc.specialty ? (
                          <Badge label={doc.specialty} variant="neutral" size="sm" />
                        ) : null}
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {[
                          doc.prcLicenseNumber ? `PRC: ${doc.prcLicenseNumber}` : null,
                          doc.philHealthPan ? `PAN: ${doc.philHealthPan}` : null,
                          doc.email || 'No email',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>

                    <View style={styles.doctorActionCol}>
                      <Button
                        title="Configure Schedule & Leaves"
                        icon="calendar"
                        variant="outline"
                        size="sm"
                        onPress={() => handleOpenRosterModal(doc.id)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </CardContent>
      </Card>

      {/* 3. Live Slot Availability Inspector Card */}
      {doctors.length > 0 ? (
        <Card>
          <CardHeader
            title="Live Slot Availability Inspector"
            subtitle="Preview calculated appointment slots for any date to test shift templates and collision rules"
          />
          <CardContent>
            {/* Controls Row */}
            <View style={styles.inspectorControlsRow}>
              {/* Doctor Selector */}
              <View style={styles.controlItem}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Select Physician:
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  <View style={styles.chipsRow}>
                    {doctors.map((doc) => {
                      const isSelected = doc.id === inspectorDoctorId;
                      const name = `${doc.firstName} ${doc.lastName}`.trim();
                      return (
                        <Pressable
                          key={doc.id}
                          style={[
                            styles.filterChip,
                            isSelected && styles.filterChipActive,
                          ]}
                          onPress={() => setInspectorDoctorId(doc.id)}
                        >
                          <ThemedText
                            variant="small"
                            color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                          >
                            Dr. {name}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Date Input */}
              <View style={styles.dateControlItem}>
                <Input
                  label="Inspection Date (YYYY-MM-DD)"
                  value={inspectorDate}
                  onChangeText={setInspectorDate}
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                />
              </View>
            </View>

            {/* Availability Inspection Results */}
            <View style={styles.resultsContainer}>
              {loadingSlots ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    Calculating available booking slots...
                  </ThemedText>
                </View>
              ) : availabilityData ? (
                <View style={styles.availabilitySummaryBox}>
                  <View style={styles.summaryHeader}>
                    <ThemedText variant="smallBold">
                      {selectedInspectorDoctor
                        ? `Dr. ${selectedInspectorDoctor.firstName} ${selectedInspectorDoctor.lastName}`
                        : 'Physician'}{' '}
                      — Schedule for {inspectorDate}
                    </ThemedText>
                    <Badge
                      label={
                        availabilityData.isOnDuty
                          ? 'On Duty — Available for Booking'
                          : availabilityData.nonAvailabilityReason || 'Off Duty'
                      }
                      variant={availabilityData.isOnDuty ? 'success' : 'neutral'}
                      size="sm"
                    />
                  </View>

                  {availabilityData.slots && availabilityData.slots.length > 0 ? (
                    <View style={styles.slotsGrid}>
                      {availabilityData.slots.map((slot: AvailableSlotItem, idx: number) => {
                        const isSlotAvailable = slot.isAvailable;
                        const isBreak = slot.status === 'Break';
                        const isLeave = slot.status === 'OnLeave';
                        const isBooked = slot.status === 'Booked';

                        let badgeVariant: 'success' | 'neutral' | 'warning' | 'emergency' = 'success';
                        if (isBreak) badgeVariant = 'neutral';
                        else if (isLeave) badgeVariant = 'emergency';
                        else if (isBooked) badgeVariant = 'warning';

                        return (
                          <View
                            key={idx}
                            style={[
                              styles.slotItem,
                              !isSlotAvailable && styles.slotItemUnavailable,
                            ]}
                          >
                            <ThemedText
                              variant="smallBold"
                              color={
                                isSlotAvailable
                                  ? theme.colors.primaryDark
                                  : theme.colors.textMuted
                              }
                            >
                              {slot.startTime} - {slot.endTime}
                            </ThemedText>
                            <Badge
                              label={slot.status || (isSlotAvailable ? 'Available' : 'Booked')}
                              variant={badgeVariant}
                              size="sm"
                            />
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.noSlotsText}>
                      No slots generated for this date. Ensure a shift template is configured for this day of the week.
                    </ThemedText>
                  )}
                </View>
              ) : null}
            </View>
          </CardContent>
        </Card>
      ) : null}

      {/* Doctor Roster Calendar Modal */}
      {rosterModalVisible ? (
        <DoctorRosterCalendarModal
          visible={rosterModalVisible}
          onClose={handleRosterModalClose}
          doctors={doctors}
          initialDoctorId={selectedDoctorId}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  policyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  policyItem: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    gap: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  policyIconBox: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  policyTextCol: {
    flex: 1,
    gap: 2,
  },
  doctorList: {
    gap: theme.spacing.sm,
  },
  doctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  doctorInfoCol: {
    flex: 1,
    minWidth: 260,
    gap: 4,
  },
  doctorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  doctorActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  inspectorControlsRow: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  controlItem: {
    gap: theme.spacing.xs,
  },
  chipsScroll: {
    marginTop: theme.spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  filterChip: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dateControlItem: {
    maxWidth: 240,
  },
  resultsContainer: {
    marginTop: theme.spacing.sm,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  availabilitySummaryBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  slotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
  },
  slotItemUnavailable: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  noSlotsText: {
    paddingVertical: theme.spacing.sm,
  },
});
