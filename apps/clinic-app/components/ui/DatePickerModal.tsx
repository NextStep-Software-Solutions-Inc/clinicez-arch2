import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from './ThemedText';
import Button from './Button';
import { IconSlot } from './Icon';
import Modal from './Modal';
import { getDaysInMonth } from './ValidatedDateInput';

export interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  value: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  boundaryMode?: 'pastOrToday' | 'futureOrToday' | 'futureOnly' | 'any';
  minDate?: string;
  maxDate?: string;
  label?: string;
  testID?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getManilaTodayStr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export default function DatePickerModal({
  visible,
  onClose,
  value,
  onSelect,
  boundaryMode = 'any',
  minDate,
  maxDate,
  label = 'Select Date',
  testID = 'date-picker-modal',
}: DatePickerModalProps) {
  const todayStr = useMemo(() => getManilaTodayStr(), []);

  // Selected date draft
  const [selectedDate, setSelectedDate] = useState<string>(value || '');

  // Year and month for browsing
  const initialYearMonth = useMemo(() => {
    const ref = value || todayStr;
    const parts = ref.split('-');
    if (parts.length === 3 && parts[0] && parts[1]) {
      return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
    }
    const [ty, tm] = todayStr.split('-').map(Number);
    return { year: ty, month: tm };
  }, [value, todayStr]);

  const [currentYear, setCurrentYear] = useState<number>(initialYearMonth.year);
  const [currentMonth, setCurrentMonth] = useState<number>(initialYearMonth.month);

  useEffect(() => {
    if (visible) {
      setSelectedDate(value || '');
      const ref = value || todayStr;
      const parts = ref.split('-');
      if (parts.length === 3 && parts[0] && parts[1]) {
        setCurrentYear(parseInt(parts[0], 10));
        setCurrentMonth(parseInt(parts[1], 10));
      }
    }
  }, [visible, value, todayStr]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (isNextMonthDisabled) return;
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

  const isNextYearDisabled = useMemo(() => {
    if (boundaryMode !== 'pastOrToday') return false;
    const [ty] = todayStr.split('-').map(Number);
    return currentYear >= ty;
  }, [boundaryMode, currentYear, todayStr]);

  const isDateDisabled = (dateStr: string) => {
    if (boundaryMode === 'pastOrToday' && dateStr > todayStr) return true;
    if (boundaryMode === 'futureOrToday' && dateStr < todayStr) return true;
    if (boundaryMode === 'futureOnly' && dateStr <= todayStr) return true;
    if (minDate && dateStr < minDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    return false;
  };

  // Calendar cells
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sun
    const totalDays = getDaysInMonth(currentYear, currentMonth);

    const cells: Array<{
      dayNumber: number | null;
      dateStr: string;
      isDisabled: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    // Preceding empty slots
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({
        dayNumber: null,
        dateStr: '',
        isDisabled: true,
        isToday: false,
        isSelected: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isDisabled = isDateDisabled(dateStr);
      const isToday = dateStr === todayStr;
      const isSelected = selectedDate === dateStr;

      cells.push({
        dayNumber: d,
        dateStr,
        isDisabled,
        isToday,
        isSelected,
      });
    }

    return cells;
  }, [currentYear, currentMonth, todayStr, selectedDate, boundaryMode, minDate, maxDate]);

  const handleSelectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const handleApply = () => {
    if (selectedDate) {
      onSelect(selectedDate);
    }
    onClose();
  };

  const handleSetToday = () => {
    if (!isDateDisabled(todayStr)) {
      setSelectedDate(todayStr);
      const [ty, tm] = todayStr.split('-').map(Number);
      setCurrentYear(ty);
      setCurrentMonth(tm);
    }
  };

  const monthName = useMemo(() => {
    const d = new Date(currentYear, currentMonth - 1, 1);
    return d.toLocaleString('en-US', { month: 'long' });
  }, [currentYear, currentMonth]);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={label}
      subtitle={selectedDate ? `Selected: ${selectedDate}` : 'Pick a date on the calendar'}
      maxWidth={380}
      testID={testID}
      footer={
        <View style={styles.footerContainer}>
          <Button
            title="Today"
            variant="ghost"
            size="sm"
            onPress={handleSetToday}
            disabled={isDateDisabled(todayStr)}
          />
          <View style={styles.footerRight}>
            <Button
              title="Cancel"
              variant="outline"
              size="sm"
              onPress={onClose}
            />
            <Button
              title="Select"
              variant="primary"
              size="sm"
              onPress={handleApply}
              disabled={!selectedDate || isDateDisabled(selectedDate)}
            />
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        {/* Navigation Header */}
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous year"
            onPress={() => setCurrentYear((y) => y - 1)}
            style={styles.yearStepBtn}
            hitSlop={theme.spacing.xs}
          >
            <ThemedText style={styles.yearStepText}>-1Y</ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={handlePrevMonth}
            style={styles.navBtn}
            hitSlop={theme.spacing.xs}
          >
            <IconSlot value="chevronLeft" size={theme.sizes.iconMd} color={theme.colors.text} />
          </Pressable>

          <ThemedText style={styles.monthTitleText}>
            {monthName} {currentYear}
          </ThemedText>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={handleNextMonth}
            disabled={isNextMonthDisabled}
            style={[styles.navBtn, isNextMonthDisabled && styles.navBtnDisabled]}
            hitSlop={theme.spacing.xs}
          >
            <IconSlot
              value="chevronRight"
              size={theme.sizes.iconMd}
              color={isNextMonthDisabled ? theme.colors.textLight : theme.colors.text}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next year"
            onPress={() => setCurrentYear((y) => y + 1)}
            disabled={isNextYearDisabled}
            style={[styles.yearStepBtn, isNextYearDisabled && styles.navBtnDisabled]}
            hitSlop={theme.spacing.xs}
          >
            <ThemedText style={styles.yearStepText}>+1Y</ThemedText>
          </Pressable>
        </View>

        {/* Weekday Labels */}
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

            return (
              <Pressable
                key={cell.dateStr}
                accessibilityRole="button"
                accessibilityLabel={cell.dateStr}
                disabled={cell.isDisabled}
                onPress={() => handleSelectDay(cell.dateStr)}
                style={styles.dayCell}
              >
                <View
                  style={[
                    styles.dayPill,
                    cell.isSelected && styles.dayPillSelected,
                    cell.isToday && !cell.isSelected && styles.dayPillToday,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.dayText,
                      cell.isDisabled && styles.dayTextDisabled,
                      cell.isSelected && styles.dayTextSelected,
                      cell.isToday && !cell.isSelected && styles.dayTextToday,
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
  body: {
    gap: theme.spacing.md,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  navBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.25,
  },
  yearStepBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  yearStepText: {
    ...theme.typography.captionBold,
    color: theme.colors.textSecondary,
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
  dayPill: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillSelected: {
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
  dayTextSelected: {
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
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
