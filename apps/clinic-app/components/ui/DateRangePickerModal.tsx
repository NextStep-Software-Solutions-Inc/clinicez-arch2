import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from './ThemedText';
import Button from './Button';
import { IconSlot } from './Icon';
import Modal from './Modal';
import { getDaysInMonth, formatDateMask, validateDateString } from './ValidatedDateInput';

export interface DateRangePickerModalProps {
  visible: boolean;
  onClose: () => void;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onApply: (start: string, end: string) => void;
  boundaryMode?: 'pastOrToday' | 'futureOrToday' | 'any';
  testID?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const QUICK_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'This Month' },
  { key: 'all', label: 'All Time' },
] as const;

function getManilaTodayStr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function computePresetRange(preset: 'today' | '7d' | '30d' | 'all'): { start: string; end: string } {
  const todayStr = getManilaTodayStr();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayDate = new Date(ty, tm - 1, td);

  if (preset === 'today') {
    return { start: todayStr, end: todayStr };
  }
  if (preset === '7d') {
    const sevenDaysAgo = new Date(todayDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;
    return { start: startStr, end: todayStr };
  }
  if (preset === '30d') {
    const startStr = `${ty}-${String(tm).padStart(2, '0')}-01`;
    return { start: startStr, end: todayStr };
  }
  return { start: '', end: '' };
}

export default function DateRangePickerModal({
  visible,
  onClose,
  startDate,
  endDate,
  onApply,
  boundaryMode = 'pastOrToday',
  testID = 'date-range-picker-modal',
}: DateRangePickerModalProps) {
  const todayStr = useMemo(() => getManilaTodayStr(), []);

  // Initialize draft selection
  const [draftStart, setDraftStart] = useState<string>(startDate || '');
  const [draftEnd, setDraftEnd] = useState<string>(endDate || '');

  // Active view year and month (1-indexed month)
  const initialYearMonth = useMemo(() => {
    const ref = startDate || endDate || todayStr;
    const parts = ref.split('-');
    if (parts.length === 3 && parts[0] && parts[1]) {
      return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
    }
    const [ty, tm] = todayStr.split('-').map(Number);
    return { year: ty, month: tm };
  }, [startDate, endDate, todayStr]);

  const [currentYear, setCurrentYear] = useState<number>(initialYearMonth.year);
  const [currentMonth, setCurrentMonth] = useState<number>(initialYearMonth.month);

  // Sync draft when opened
  React.useEffect(() => {
    if (visible) {
      setDraftStart(startDate || '');
      setDraftEnd(endDate || '');
      const ref = endDate || startDate || todayStr;
      const parts = ref.split('-');
      if (parts.length === 3 && parts[0] && parts[1]) {
        setCurrentYear(parseInt(parts[0], 10));
        setCurrentMonth(parseInt(parts[1], 10));
      }
    }
  }, [visible, startDate, endDate, todayStr]);

  // Calendar month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    // If boundaryMode is pastOrToday and current is current year/month of today, prevent forward
    const [ty, tm] = todayStr.split('-').map(Number);
    if (boundaryMode === 'pastOrToday' && (currentYear > ty || (currentYear === ty && currentMonth >= tm))) {
      return;
    }
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const isNextMonthDisabled = useMemo(() => {
    if (boundaryMode !== 'pastOrToday') return false;
    const [ty, tm] = todayStr.split('-').map(Number);
    return currentYear > ty || (currentYear === ty && currentMonth >= tm);
  }, [boundaryMode, currentYear, currentMonth, todayStr]);

  // Calendar grid calculations
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sun
    const totalDays = getDaysInMonth(currentYear, currentMonth);

    const cells: Array<{
      dayNumber: number | null;
      dateStr: string;
      isDisabled: boolean;
      isToday: boolean;
      isStart: boolean;
      isEnd: boolean;
      isInRange: boolean;
    }> = [];

    // Blank cells before month start
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({
        dayNumber: null,
        dateStr: '',
        isDisabled: true,
        isToday: false,
        isStart: false,
        isEnd: false,
        isInRange: false,
      });
    }

    // Actual month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isFuture = boundaryMode === 'pastOrToday' && dateStr > todayStr;
      const isToday = dateStr === todayStr;
      const isStart = draftStart === dateStr;
      const isEnd = draftEnd === dateStr;
      const isInRange = Boolean(
        draftStart && draftEnd && dateStr > draftStart && dateStr < draftEnd
      );

      cells.push({
        dayNumber: d,
        dateStr,
        isDisabled: isFuture,
        isToday,
        isStart,
        isEnd,
        isInRange,
      });
    }

    return cells;
  }, [currentYear, currentMonth, boundaryMode, todayStr, draftStart, draftEnd]);

  // Day click logic
  const handleSelectDay = (dateStr: string) => {
    if (!draftStart || (draftStart && draftEnd)) {
      // Starting new selection
      setDraftStart(dateStr);
      setDraftEnd('');
    } else if (draftStart && !draftEnd) {
      if (dateStr < draftStart) {
        // Earlier date clicked -> make it new start
        setDraftStart(dateStr);
      } else {
        // Complete range
        setDraftEnd(dateStr);
      }
    }
  };

  // Quick preset click
  const handleApplyPreset = (preset: 'today' | '7d' | '30d' | 'all') => {
    const { start, end } = computePresetRange(preset);
    setDraftStart(start);
    setDraftEnd(end);
    if (end) {
      const [ey, em] = end.split('-').map(Number);
      setCurrentYear(ey);
      setCurrentMonth(em);
    }
  };

  // Apply action
  const handleConfirm = () => {
    if (draftStart && draftEnd && draftStart > draftEnd) {
      // Auto-correct if inverted
      onApply(draftEnd, draftStart);
    } else if (draftStart && !draftEnd) {
      // Single day selected -> set start and end to same day
      onApply(draftStart, draftStart);
    } else {
      onApply(draftStart, draftEnd);
    }
    onClose();
  };

  const handleClear = () => {
    setDraftStart('');
    setDraftEnd('');
  };

  const monthName = useMemo(() => {
    const d = new Date(currentYear, currentMonth - 1, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [currentYear, currentMonth]);

  const rangeSummaryText = useMemo(() => {
    if (!draftStart && !draftEnd) return 'All dates (Unrestricted)';
    if (draftStart && !draftEnd) return `From ${draftStart} (Select end date)`;
    if (draftStart === draftEnd) return `Single day: ${draftStart}`;
    return `${draftStart}  →  ${draftEnd}`;
  }, [draftStart, draftEnd]);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Select Date Range"
      subtitle={rangeSummaryText}
      maxWidth={420}
      testID={testID}
      footer={
        <View style={styles.footerContainer}>
          <Button
            title="Clear"
            variant="ghost"
            size="sm"
            onPress={handleClear}
          />
          <View style={styles.footerRightButtons}>
            <Button
              title="Cancel"
              variant="outline"
              size="sm"
              onPress={onClose}
            />
            <Button
              title="Apply Range"
              variant="primary"
              size="sm"
              onPress={handleConfirm}
            />
          </View>
        </View>
      }
    >
      <View style={styles.modalBody}>
        {/* Presets Row */}
        <View style={styles.presetsRow}>
          {QUICK_PRESETS.map((p) => {
            const { start, end } = computePresetRange(p.key);
            const isPresetActive = draftStart === start && draftEnd === end;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityLabel={`Preset ${p.label}`}
                onPress={() => handleApplyPreset(p.key)}
                style={[
                  styles.presetChip,
                  isPresetActive ? styles.presetChipActive : styles.presetChipInactive,
                ]}
              >
                <ThemedText
                  style={[
                    styles.presetChipText,
                    isPresetActive ? styles.presetChipTextActive : styles.presetChipTextInactive,
                  ]}
                >
                  {p.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Month Navigation Header */}
        <View style={styles.monthHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={handlePrevMonth}
            style={styles.navButton}
            hitSlop={theme.spacing.sm}
          >
            <IconSlot value="chevronLeft" size={theme.sizes.iconMd} color={theme.colors.text} />
          </Pressable>

          <ThemedText style={styles.monthTitleText}>{monthName}</ThemedText>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={handleNextMonth}
            disabled={isNextMonthDisabled}
            style={[styles.navButton, isNextMonthDisabled && styles.navButtonDisabled]}
            hitSlop={theme.spacing.sm}
          >
            <IconSlot
              value="chevronRight"
              size={theme.sizes.iconMd}
              color={isNextMonthDisabled ? theme.colors.textLight : theme.colors.text}
            />
          </Pressable>
        </View>

        {/* Day of Week Row */}
        <View style={styles.weekdaysRow}>
          {WEEKDAYS.map((wd) => (
            <View key={wd} style={styles.weekdayCell}>
              <ThemedText style={styles.weekdayText}>{wd}</ThemedText>
            </View>
          ))}
        </View>

        {/* Days Grid */}
        <View style={styles.grid}>
          {calendarDays.map((cell, index) => {
            if (!cell.dayNumber) {
              return <View key={`blank-${index}`} style={styles.dayCell} />;
            }

            const isStart = cell.isStart;
            const isEnd = cell.isEnd;
            const isInRange = cell.isInRange;
            const isSingle = isStart && isEnd;

            return (
              <Pressable
                key={cell.dateStr}
                accessibilityRole="button"
                accessibilityLabel={cell.dateStr}
                disabled={cell.isDisabled}
                onPress={() => handleSelectDay(cell.dateStr)}
                style={[
                  styles.dayCell,
                  isInRange && styles.dayCellInRange,
                  isStart && !isSingle && styles.dayCellStart,
                  isEnd && !isSingle && styles.dayCellEnd,
                ]}
              >
                <View
                  style={[
                    styles.dayPill,
                    (isStart || isEnd) && styles.dayPillActive,
                    cell.isToday && !(isStart || isEnd) && styles.dayPillToday,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.dayText,
                      cell.isDisabled && styles.dayTextDisabled,
                      (isStart || isEnd) && styles.dayTextActive,
                      cell.isToday && !(isStart || isEnd) && styles.dayTextToday,
                    ]}
                  >
                    {cell.dayNumber}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBody: {
    gap: theme.spacing.md,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  presetChip: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
  },
  presetChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  presetChipInactive: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
  },
  presetChipText: {
    ...theme.typography.captionBold,
  },
  presetChipTextActive: {
    color: theme.colors.primary,
  },
  presetChipTextInactive: {
    color: theme.colors.textSecondary,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  navButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  monthTitleText: {
    ...theme.typography.bodyBold,
    color: theme.colors.text,
  },
  weekdaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
  },
  weekdayText: {
    ...theme.typography.captionBold,
    color: theme.colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInRange: {
    backgroundColor: theme.colors.primaryLight,
  },
  dayCellStart: {
    backgroundColor: theme.colors.primaryLight,
    borderTopLeftRadius: theme.radii.full,
    borderBottomLeftRadius: theme.radii.full,
  },
  dayCellEnd: {
    backgroundColor: theme.colors.primaryLight,
    borderTopRightRadius: theme.radii.full,
    borderBottomRightRadius: theme.radii.full,
  },
  dayPill: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillActive: {
    backgroundColor: theme.colors.primary,
  },
  dayPillToday: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primary,
  },
  dayText: {
    ...theme.typography.small,
    color: theme.colors.text,
  },
  dayTextDisabled: {
    color: theme.colors.textLight,
  },
  dayTextActive: {
    color: theme.colors.onPrimary,
    fontWeight: '600',
  },
  dayTextToday: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  footerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
