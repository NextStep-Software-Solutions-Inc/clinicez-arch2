import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import {
  getWeekDays,
  toDateString,
  getManilaTodayStr,
} from './calendarUtils';

export interface DateCarouselProps {
  currentDate: Date;
  onSelectDate: (date: Date) => void;
}

export function DateCarousel({
  currentDate,
  onSelectDate,
}: DateCarouselProps) {
  const todayStr = getManilaTodayStr();
  const selectedDateStr = toDateString(currentDate);

  // Generate 7-day window
  const weekDays = useMemo(
    () => getWeekDays(currentDate, [], todayStr),
    [currentDate, todayStr]
  );

  const handlePrev = () => {
    const prev = new Date(currentDate.getTime() - 7 * 86400000);
    onSelectDate(prev);
  };

  const handleNext = () => {
    const next = new Date(currentDate.getTime() + 7 * 86400000);
    onSelectDate(next);
  };

  return (
    <View
      data-testid="date-carousel"
      testID="date-carousel"
      style={styles.container}
    >
      <Pressable
        data-testid="btn-carousel-prev"
        testID="btn-carousel-prev"
        accessibilityRole="button"
        accessibilityLabel="Previous 7 days"
        onPress={handlePrev}
        style={({ pressed }) => [
          styles.arrowButton,
          pressed && styles.pressed,
        ]}
      >
        <Icon
          name="chevronLeft"
          size={theme.sizes.iconSm}
          color={theme.colors.text}
        />
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {weekDays.map((col) => {
          const isSelected = col.dateString === selectedDateStr;
          const isToday = col.isToday;

          return (
            <Pressable
              key={col.dateString}
              data-testid={`carousel-day-${col.dateString}`}
              testID={`carousel-day-${col.dateString}`}
              data-selected={String(isSelected)}
              accessibilityRole="button"
              accessibilityLabel={`${col.dayName} ${col.date.getDate()}${
                isSelected ? ', selected' : ''
              }`}
              onPress={() => onSelectDate(col.date)}
              style={({ pressed }) => [
                styles.dayPill,
                isSelected && styles.dayPillSelected,
                isToday && !isSelected && styles.dayPillToday,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                variant="caption"
                color={
                  isSelected
                    ? theme.colors.onPrimary
                    : isToday
                    ? theme.colors.primary
                    : theme.colors.textMuted
                }
                style={{ fontWeight: '600' }}
              >
                {col.dayName}
              </ThemedText>
              <ThemedText
                variant="smallBold"
                color={
                  isSelected
                    ? theme.colors.onPrimary
                    : isToday
                    ? theme.colors.primary
                    : theme.colors.text
                }
              >
                {col.date.getDate()}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        data-testid="btn-carousel-next"
        testID="btn-carousel-next"
        accessibilityRole="button"
        accessibilityLabel="Next 7 days"
        onPress={handleNext}
        style={({ pressed }) => [
          styles.arrowButton,
          pressed && styles.pressed,
        ]}
      >
        <Icon
          name="chevronRight"
          size={theme.sizes.iconSm}
          color={theme.colors.text}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  arrowButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  dayPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  dayPillSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  dayPillToday: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default DateCarousel;
