import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  Modal,
  ThemedText,
  Button,
  Input,
  Icon,
  Badge,
} from '@ui';
import { notify } from '@utils/feedback';
import { theme } from '../../constants/theme';
import {
  clinicService,
  DoctorScheduleTemplateItem,
  DoctorBreakTimeItem,
  DoctorLeaveItem,
  StaffMember,
} from '../../services/clinicService';

export interface DoctorRosterCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  doctors: StaffMember[];
  initialDoctorId?: string;
}

const DAYS_OF_WEEK = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

const SLOT_INTERVALS = [15, 30, 60];

const LEAVE_TYPES = ['Vacation', 'SickLeave', 'CME', 'Emergency', 'Holiday'];

export const DoctorRosterCalendarModal: React.FC<DoctorRosterCalendarModalProps> = ({
  visible,
  onClose,
  doctors,
  initialDoctorId,
}) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'leaves'>('templates');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    initialDoctorId || doctors[0]?.id || ''
  );

  // Template Tab State
  const [selectedDay, setSelectedDay] = useState<number>(1); // Monday default
  const [templates, setTemplates] = useState<DoctorScheduleTemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [savingTemplate, setSavingTemplate] = useState<boolean>(false);

  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('17:00');
  const [isOvernight, setIsOvernight] = useState<boolean>(false);
  const [slotInterval, setSlotInterval] = useState<number>(30);
  const [isActiveDay, setIsActiveDay] = useState<boolean>(true);
  const [breaks, setBreaks] = useState<DoctorBreakTimeItem[]>([]);

  // Leaves Tab State
  const [leaves, setLeaves] = useState<DoctorLeaveItem[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState<boolean>(false);
  const [submittingLeave, setSubmittingLeave] = useState<boolean>(false);

  const [leaveStartDate, setLeaveStartDate] = useState<string>('');
  const [leaveEndDate, setLeaveEndDate] = useState<string>('');
  const [leaveType, setLeaveType] = useState<string>('Vacation');
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [isPartialDay, setIsPartialDay] = useState<boolean>(false);
  const [partialStartTime, setPartialStartTime] = useState<string>('13:00');
  const [partialEndTime, setPartialEndTime] = useState<string>('17:00');

  useEffect(() => {
    if (initialDoctorId) {
      setSelectedDoctorId(initialDoctorId);
    } else if (doctors.length > 0 && !selectedDoctorId) {
      setSelectedDoctorId(doctors[0].id);
    }
  }, [initialDoctorId, doctors, selectedDoctorId]);

  const loadTemplates = useCallback(async (docId: string) => {
    if (!docId) return;
    try {
      setLoadingTemplates(true);
      const [data, err] = await clinicService.getDoctorScheduleTemplates(docId);
      if (err) {
        notify.error(err.message || 'Failed to load doctor templates.');
      } else {
        setTemplates(data || []);
      }
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load doctor templates.');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const loadLeaves = useCallback(async (docId: string) => {
    if (!docId) return;
    try {
      setLoadingLeaves(true);
      const [data, err] = await clinicService.getDoctorLeaves(docId);
      if (err) {
        notify.error(err.message || 'Failed to load doctor leaves.');
      } else {
        setLeaves(data || []);
      }
    } catch (err: any) {
      notify.error(err?.message || 'Failed to load doctor leaves.');
    } finally {
      setLoadingLeaves(false);
    }
  }, []);

  useEffect(() => {
    if (visible && selectedDoctorId) {
      if (activeTab === 'templates') {
        loadTemplates(selectedDoctorId);
      } else {
        loadLeaves(selectedDoctorId);
      }
    }
  }, [visible, selectedDoctorId, activeTab, loadTemplates, loadLeaves]);

  // Sync form when day or templates change
  useEffect(() => {
    const existing = templates.find((t) => {
      const tDay = typeof t.dayOfWeek === 'string' ? parseInt(t.dayOfWeek, 10) : t.dayOfWeek;
      return tDay === selectedDay;
    });

    if (existing) {
      setStartTime(existing.startTime ? existing.startTime.substring(0, 5) : '09:00');
      setEndTime(existing.endTime ? existing.endTime.substring(0, 5) : '17:00');
      setIsOvernight(existing.isOvernightShift || false);
      setSlotInterval(existing.slotDurationMinutes || 30);
      setIsActiveDay(existing.isActive ?? true);
      setBreaks(
        (existing.breaks || []).map((b) => ({
          id: b.id,
          description: b.description,
          startTime: b.startTime ? b.startTime.substring(0, 5) : '12:00',
          endTime: b.endTime ? b.endTime.substring(0, 5) : '13:00',
        }))
      );
    } else {
      setStartTime('09:00');
      setEndTime('17:00');
      setIsOvernight(false);
      setSlotInterval(30);
      setIsActiveDay(true);
      setBreaks([]);
    }
  }, [selectedDay, templates]);

  const handleSaveTemplate = async () => {
    if (!selectedDoctorId) {
      notify.error('Please select a doctor.');
      return;
    }

    const doctor = doctors.find((d) => d.id === selectedDoctorId);
    const doctorName = doctor ? `${doctor.firstName} ${doctor.lastName}`.trim() : undefined;

    try {
      setSavingTemplate(true);
      const [, err] = await clinicService.upsertDoctorScheduleTemplate(selectedDoctorId, {
        doctorName,
        dayOfWeek: selectedDay,
        startTime: startTime.length === 5 ? `${startTime}:00` : startTime,
        endTime: endTime.length === 5 ? `${endTime}:00` : endTime,
        isOvernightShift: isOvernight,
        slotDurationMinutes: slotInterval,
        isActive: isActiveDay,
        breaks: breaks.map((b) => ({
          description: b.description,
          startTime: b.startTime.length === 5 ? `${b.startTime}:00` : b.startTime,
          endTime: b.endTime.length === 5 ? `${b.endTime}:00` : b.endTime,
        })),
      });

      if (err) {
        notify.error(err.message || 'Failed to save schedule template.');
        return;
      }

      notify.success('Doctor schedule template saved successfully.');
      await loadTemplates(selectedDoctorId);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to save schedule template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleAddBreak = () => {
    setBreaks((prev) => [
      ...prev,
      {
        description: 'Lunch Break',
        startTime: '12:00',
        endTime: '13:00',
      },
    ]);
  };

  const handleRemoveBreak = (index: number) => {
    setBreaks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateBreak = (index: number, field: keyof DoctorBreakTimeItem, val: string) => {
    setBreaks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: val } : b))
    );
  };

  const handleCreateLeave = async () => {
    if (!selectedDoctorId) {
      notify.error('Please select a doctor.');
      return;
    }
    if (!leaveStartDate || !leaveEndDate) {
      notify.error('Please enter both start date and end date (YYYY-MM-DD).');
      return;
    }

    const doctor = doctors.find((d) => d.id === selectedDoctorId);
    const doctorName = doctor ? `${doctor.firstName} ${doctor.lastName}`.trim() : undefined;

    try {
      setSubmittingLeave(true);
      const [, err] = await clinicService.createDoctorLeave(selectedDoctorId, {
        doctorName,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        leaveType,
        reason: leaveReason,
        partialDayStartTime: isPartialDay ? (partialStartTime.length === 5 ? `${partialStartTime}:00` : partialStartTime) : undefined,
        partialDayEndTime: isPartialDay ? (partialEndTime.length === 5 ? `${partialEndTime}:00` : partialEndTime) : undefined,
      });

      if (err) {
        notify.error(err.message || 'Failed to record doctor leave.');
        return;
      }

      notify.success('Doctor leave recorded successfully.');
      setLeaveStartDate('');
      setLeaveEndDate('');
      setLeaveReason('');
      setIsPartialDay(false);
      await loadLeaves(selectedDoctorId);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to record doctor leave.');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleDeleteLeave = async (leaveId: string) => {
    try {
      const [, err] = await clinicService.deleteDoctorLeave(selectedDoctorId, leaveId);
      if (err) {
        notify.error(err.message || 'Failed to delete leave.');
        return;
      }
      notify.success('Leave deleted successfully.');
      await loadLeaves(selectedDoctorId);
    } catch (err: any) {
      notify.error(err?.message || 'Failed to delete leave.');
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Doctor Rostering & Schedules"
      subtitle="Configure weekly shift templates, intervals, and blackout dates"
      maxWidth={720}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {/* Doctor Selector */}
        <View style={styles.doctorSelectorRow}>
          <ThemedText variant="captionBold" style={styles.sectionLabel}>
            Select Physician:
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.doctorPills}>
            {doctors.map((doc) => {
              const isSelected = doc.id === selectedDoctorId;
              return (
                <Pressable
                  key={doc.id}
                  style={[styles.doctorPill, isSelected && styles.doctorPillSelected]}
                  onPress={() => setSelectedDoctorId(doc.id)}
                >
                  <Icon
                    name="consultations"
                    size={theme.sizes.iconSm}
                    color={isSelected ? theme.colors.onPrimary : theme.colors.primary}
                  />
                  <ThemedText
                    variant="smallBold"
                    style={[styles.doctorPillText, isSelected && styles.doctorPillTextSelected]}
                  >
                    Dr. {doc.firstName} {doc.lastName}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tabButton, activeTab === 'templates' && styles.tabButtonActive]}
            onPress={() => setActiveTab('templates')}
          >
            <Icon
              name="calendar"
              size={theme.sizes.iconSm}
              color={activeTab === 'templates' ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              style={[styles.tabButtonText, activeTab === 'templates' && styles.tabButtonTextActive]}
            >
              Weekly Templates
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === 'leaves' && styles.tabButtonActive]}
            onPress={() => setActiveTab('leaves')}
          >
            <Icon
              name="clock"
              size={theme.sizes.iconSm}
              color={activeTab === 'leaves' ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              style={[styles.tabButtonText, activeTab === 'leaves' && styles.tabButtonTextActive]}
            >
              Leaves & Blackout Dates
            </ThemedText>
          </Pressable>
        </View>

        {activeTab === 'templates' ? (
          <View style={styles.tabContent}>
            {loadingTemplates ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <ThemedText variant="small" style={styles.loadingText}>
                  Loading templates...
                </ThemedText>
              </View>
            ) : (
              <>
                {/* Day Selector */}
                <View style={styles.daySelector}>
                  {DAYS_OF_WEEK.map((d) => {
                    const isSelected = selectedDay === d.day;
                    const hasTemplate = templates.some((t) => {
                      const tDay = typeof t.dayOfWeek === 'string' ? parseInt(t.dayOfWeek, 10) : t.dayOfWeek;
                      return tDay === d.day && t.isActive;
                    });

                    return (
                      <Pressable
                        key={d.day}
                        style={[
                          styles.dayPill,
                          isSelected && styles.dayPillSelected,
                          hasTemplate && !isSelected && styles.dayPillActive,
                        ]}
                        onPress={() => setSelectedDay(d.day)}
                      >
                        <ThemedText
                          variant="captionBold"
                          style={[styles.dayPillText, isSelected && styles.dayPillTextSelected]}
                        >
                          {d.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Day Working Status Switch */}
                <View style={styles.switchRow}>
                  <ThemedText variant="bodyBold">Doctor Working on this Day</ThemedText>
                  <Pressable
                    style={[styles.toggleBadge, isActiveDay ? styles.toggleBadgeActive : styles.toggleBadgeInactive]}
                    onPress={() => setIsActiveDay(!isActiveDay)}
                  >
                    <ThemedText
                      variant="captionBold"
                      style={isActiveDay ? styles.toggleTextActive : styles.toggleTextInactive}
                    >
                      {isActiveDay ? 'Working' : 'Off Duty'}
                    </ThemedText>
                  </Pressable>
                </View>

                {isActiveDay ? (
                  <>
                    {/* Shift Times */}
                    <View style={styles.formRow}>
                      <View style={styles.flexFill}>
                        <Input
                          label="Shift Start Time"
                          placeholder="09:00"
                          value={startTime}
                          onChangeText={setStartTime}
                        />
                      </View>
                      <View style={styles.flexFill}>
                        <Input
                          label="Shift End Time"
                          placeholder="17:00"
                          value={endTime}
                          onChangeText={setEndTime}
                        />
                      </View>
                    </View>

                    {/* Overnight Shift & Interval Row */}
                    <View style={styles.formRow}>
                      <View style={styles.flexFill}>
                        <ThemedText variant="captionBold" style={styles.fieldLabel}>
                          Overnight Shift (crosses midnight)
                        </ThemedText>
                        <Pressable
                          style={[styles.toggleBadge, isOvernight ? styles.toggleBadgeActive : styles.toggleBadgeInactive]}
                          onPress={() => setIsOvernight(!isOvernight)}
                        >
                          <ThemedText
                            variant="captionBold"
                            style={isOvernight ? styles.toggleTextActive : styles.toggleTextInactive}
                          >
                            {isOvernight ? 'Yes (Overnight)' : 'No (Standard)'}
                          </ThemedText>
                        </Pressable>
                      </View>

                      <View style={styles.flexFill}>
                        <ThemedText variant="captionBold" style={styles.fieldLabel}>
                          Slot Interval
                        </ThemedText>
                        <View style={styles.intervalRow}>
                          {SLOT_INTERVALS.map((mins) => {
                            const isChosen = slotInterval === mins;
                            return (
                              <Pressable
                                key={mins}
                                style={[styles.intervalPill, isChosen && styles.intervalPillSelected]}
                                onPress={() => setSlotInterval(mins)}
                              >
                                <ThemedText
                                  variant="captionBold"
                                  style={[styles.intervalPillText, isChosen && styles.intervalPillTextSelected]}
                                >
                                  {mins}m
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </View>

                    {/* Break Times */}
                    <View style={styles.breaksSection}>
                      <View style={styles.breaksHeader}>
                        <ThemedText variant="bodyBold">Shift Breaks (Lunch, Rounds)</ThemedText>
                        <Button
                          title="Add Break"
                          variant="outline"
                          size="sm"
                          icon="plus"
                          onPress={handleAddBreak}
                        />
                      </View>

                      {breaks.map((brk, idx) => (
                        <View key={idx} style={styles.breakRow}>
                          <View style={styles.breakDescCol}>
                            <Input
                              placeholder="Description (e.g. Lunch)"
                              value={brk.description}
                              onChangeText={(v) => handleUpdateBreak(idx, 'description', v)}
                            />
                          </View>
                          <View style={styles.breakTimeCol}>
                            <Input
                              placeholder="12:00"
                              value={brk.startTime}
                              onChangeText={(v) => handleUpdateBreak(idx, 'startTime', v)}
                            />
                          </View>
                          <View style={styles.breakTimeCol}>
                            <Input
                              placeholder="13:00"
                              value={brk.endTime}
                              onChangeText={(v) => handleUpdateBreak(idx, 'endTime', v)}
                            />
                          </View>
                          <Pressable style={styles.removeBreakBtn} onPress={() => handleRemoveBreak(idx)}>
                            <Icon name="trash" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <View style={styles.submitRow}>
                  <Button
                    title="Save Template"
                    variant="primary"
                    loading={savingTemplate}
                    onPress={handleSaveTemplate}
                  />
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={styles.tabContent}>
            {/* Record Leave Form */}
            <View style={styles.leaveFormCard}>
              <ThemedText variant="bodyBold" style={styles.leaveFormTitle}>
                Record Blackout Date / Leave
              </ThemedText>

              <View style={styles.formRow}>
                <View style={styles.flexFill}>
                  <Input
                    label="Start Date"
                    placeholder="YYYY-MM-DD"
                    value={leaveStartDate}
                    onChangeText={setLeaveStartDate}
                  />
                </View>
                <View style={styles.flexFill}>
                  <Input
                    label="End Date"
                    placeholder="YYYY-MM-DD"
                    value={leaveEndDate}
                    onChangeText={setLeaveEndDate}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.flexFill}>
                  <ThemedText variant="captionBold" style={styles.fieldLabel}>
                    Leave Type
                  </ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typePills}>
                    {LEAVE_TYPES.map((t) => {
                      const isChosen = leaveType === t;
                      return (
                        <Pressable
                          key={t}
                          style={[styles.typePill, isChosen && styles.typePillSelected]}
                          onPress={() => setLeaveType(t)}
                        >
                          <ThemedText
                            variant="captionBold"
                            style={[styles.typePillText, isChosen && styles.typePillTextSelected]}
                          >
                            {t}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.flexFill}>
                  <ThemedText variant="captionBold" style={styles.fieldLabel}>
                    Partial-Day Only?
                  </ThemedText>
                  <Pressable
                    style={[styles.toggleBadge, isPartialDay ? styles.toggleBadgeActive : styles.toggleBadgeInactive]}
                    onPress={() => setIsPartialDay(!isPartialDay)}
                  >
                    <ThemedText
                      variant="captionBold"
                      style={isPartialDay ? styles.toggleTextActive : styles.toggleTextInactive}
                    >
                      {isPartialDay ? 'Partial Day' : 'Full Day'}
                    </ThemedText>
                  </Pressable>
                </View>

                {isPartialDay ? (
                  <>
                    <View style={styles.flexFill}>
                      <Input
                        label="From Time"
                        placeholder="13:00"
                        value={partialStartTime}
                        onChangeText={setPartialStartTime}
                      />
                    </View>
                    <View style={styles.flexFill}>
                      <Input
                        label="To Time"
                        placeholder="17:00"
                        value={partialEndTime}
                        onChangeText={setPartialEndTime}
                      />
                    </View>
                  </>
                ) : null}
              </View>

              <Input
                label="Reason / Notes"
                placeholder="e.g. Attending Annual Pediatric Conference"
                value={leaveReason}
                onChangeText={setLeaveReason}
              />

              <View style={styles.leaveSubmitRow}>
                <Button
                  title="Submit Leave"
                  variant="primary"
                  loading={submittingLeave}
                  onPress={handleCreateLeave}
                />
              </View>
            </View>

            {/* Existing Leaves List */}
            <ThemedText variant="bodyBold" style={styles.existingLeavesTitle}>
              Scheduled Leaves & Closures
            </ThemedText>

            {loadingLeaves ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : leaves.length === 0 ? (
              <ThemedText variant="small" style={styles.emptyLeavesText}>
                No upcoming leaves scheduled.
              </ThemedText>
            ) : (
              leaves.map((l) => (
                <View key={l.id} style={styles.leaveItemCard}>
                  <View style={styles.leaveItemInfo}>
                    <View style={styles.leaveItemHeader}>
                      <ThemedText variant="bodyBold">
                        {l.startDate} {l.startDate !== l.endDate ? `to ${l.endDate}` : ''}
                      </ThemedText>
                      <Badge variant="emergency" label={l.leaveType || 'Leave'} size="sm" />
                    </View>
                    {l.partialDayStartTime ? (
                      <ThemedText variant="caption" style={styles.leaveTimeText}>
                        Time: {l.partialDayStartTime} - {l.partialDayEndTime}
                      </ThemedText>
                    ) : null}
                    {l.reason ? (
                      <ThemedText variant="small" style={styles.leaveReasonText}>
                        {l.reason}
                      </ThemedText>
                    ) : null}
                  </View>
                  <Pressable style={styles.deleteLeaveBtn} onPress={() => handleDeleteLeave(l.id)}>
                    <Icon name="trash" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
  },
  doctorSelectorRow: {
    marginBottom: theme.spacing.md,
  },
  sectionLabel: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  doctorPills: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  doctorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  doctorPillSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  doctorPillText: {
    color: theme.colors.text,
  },
  doctorPillTextSelected: {
    color: theme.colors.onPrimary,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.transparent,
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
  },
  tabButtonText: {
    color: theme.colors.textMuted,
  },
  tabButtonTextActive: {
    color: theme.colors.primary,
  },
  tabContent: {
    paddingTop: theme.spacing.xs,
  },
  loadingBox: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    color: theme.colors.textMuted,
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  dayPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  dayPillActive: {
    borderColor: theme.colors.primaryLight,
    backgroundColor: theme.colors.primarySubtle,
  },
  dayPillSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  dayPillText: {
    color: theme.colors.text,
  },
  dayPillTextSelected: {
    color: theme.colors.onPrimary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  toggleBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
  },
  toggleBadgeActive: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  toggleBadgeInactive: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
  },
  toggleTextActive: {
    color: theme.colors.successText,
  },
  toggleTextInactive: {
    color: theme.colors.textMuted,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  flexFill: {
    flex: 1,
  },
  fieldLabel: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  intervalRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  intervalPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  intervalPillSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  intervalPillText: {
    color: theme.colors.text,
  },
  intervalPillTextSelected: {
    color: theme.colors.primaryDark,
  },
  breaksSection: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  breaksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  breakDescCol: {
    flex: 2,
  },
  breakTimeCol: {
    flex: 1,
  },
  removeBreakBtn: {
    padding: theme.spacing.sm,
  },
  submitRow: {
    marginTop: theme.spacing.md,
    alignItems: 'flex-end',
  },
  leaveFormCard: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  leaveFormTitle: {
    marginBottom: theme.spacing.sm,
  },
  typePills: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  typePill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  typePillSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  typePillText: {
    color: theme.colors.text,
  },
  typePillTextSelected: {
    color: theme.colors.primaryDark,
  },
  leaveSubmitRow: {
    marginTop: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  existingLeavesTitle: {
    marginBottom: theme.spacing.sm,
  },
  emptyLeavesText: {
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  leaveItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  leaveItemInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  leaveItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  leaveTimeText: {
    color: theme.colors.textMuted,
  },
  leaveReasonText: {
    color: theme.colors.textSecondary,
  },
  deleteLeaveBtn: {
    padding: theme.spacing.sm,
  },
});
