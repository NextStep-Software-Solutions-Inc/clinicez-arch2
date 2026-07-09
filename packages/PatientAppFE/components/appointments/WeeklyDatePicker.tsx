import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { format, addDays, startOfDay, isToday, parseISO } from 'date-fns';

const CELL_WIDTH = 52;
const DAYS_BEFORE_TODAY = 14;
const TOTAL_DAYS = 70; // 10 weeks of slots

interface WeeklyDatePickerProps {
    selectedDate: string;          // YYYY-MM-DD
    onSelectDate: (date: string) => void;
    /** Dates that have at least one available slot (show a dot indicator) */
    availableDates?: string[];
}

interface DayItem {
    dateStr: string;   // YYYY-MM-DD
    date: Date;
}

function buildDays(): DayItem[] {
    const today = startOfDay(new Date());
    return Array.from({ length: TOTAL_DAYS }, (_, i) => {
        const date = addDays(today, i - DAYS_BEFORE_TODAY);
        return {
            dateStr: format(date, 'yyyy-MM-dd'),
            date,
        };
    });
}

export default function WeeklyDatePicker({ selectedDate, onSelectDate, availableDates = [] }: WeeklyDatePickerProps) {
    const { colors } = useTheme();
    const listRef = useRef<FlatList<DayItem>>(null);
    const days = useRef(buildDays()).current;
    const availableSet = useRef(new Set(availableDates)).current;

    // Month label shown above the strip — reflects the first visible day
    const [visibleMonth, setVisibleMonth] = useState(() =>
        format(startOfDay(new Date()), 'MMMM yyyy')
    );

    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: Array<{ item: DayItem }> }) => {
            if (viewableItems.length > 0) {
                setVisibleMonth(format(viewableItems[0].item.date, 'MMMM yyyy'));
            }
        },
        []
    );

    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

    // Scroll to today on mount
    useEffect(() => {
        const todayIndex = days.findIndex(d => isToday(d.date));
        if (todayIndex >= 0) {
            // Small timeout to ensure FlatList has laid out
            const timer = setTimeout(() => {
                listRef.current?.scrollToIndex({
                    index: todayIndex,
                    animated: false,
                    viewPosition: 0.3,
                });
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [days]);

    let selectedDate_ = selectedDate;
    try {
        parseISO(selectedDate);
    } catch {
        selectedDate_ = format(new Date(), 'yyyy-MM-dd');
    }

    return (
        <View>
            {/* Month indicator */}
            <View style={styles.monthRow}>
                <ThemedText style={[styles.monthLabel, { color: colors.text }]}>
                    {visibleMonth}
                </ThemedText>
            </View>

            <FlatList
                ref={listRef}
                data={days}
                keyExtractor={item => item.dateStr}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.list}
                getItemLayout={(_, index) => ({
                    length: CELL_WIDTH,
                    offset: CELL_WIDTH * index,
                    index,
                })}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onScrollToIndexFailed={({ index }) => {
                    setTimeout(() => {
                        listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
                    }, 150);
                }}
            renderItem={({ item }) => {
                const isSelected = item.dateStr === selectedDate_;
                const isNow = isToday(item.date);
                const isPast = item.date < startOfDay(new Date());
                const hasSlots = availableSet.has(item.dateStr);

                return (
                    <Pressable
                        onPress={() => { if (!isPast) onSelectDate(item.dateStr); }}
                        accessibilityRole="button"
                        accessibilityLabel={format(item.date, 'MMMM d, yyyy')}
                        accessibilityState={{ selected: isSelected, disabled: isPast }}
                        disabled={isPast}
                        style={({ pressed }) => [styles.cell, { opacity: isPast && !isSelected ? 0.45 : pressed ? 0.7 : 1 }]}
                    >
                        <ThemedText style={[styles.dayName, { color: isSelected ? colors.primary : colors.text }]}>
                            {format(item.date, 'EEE')}
                        </ThemedText>

                        <View style={[
                            styles.numberCircle,
                            isSelected && { backgroundColor: colors.primary },
                        ]}>
                            <ThemedText style={[
                                styles.dayNumber,
                                isSelected && styles.dayNumberSelected,
                                isNow && !isSelected && { color: colors.primary, fontWeight: '800' },
                            ]}>
                                {format(item.date, 'd')}
                            </ThemedText>
                        </View>

                        {/* Availability dot */}
                        {hasSlots && !isSelected && (
                            <View style={[styles.availDot, { backgroundColor: colors.primary }]} />
                        )}
                        {!hasSlots && <View style={styles.availDotPlaceholder} />}
                    </Pressable>
                );
            }}
        />
        </View>
    );
}

const styles = StyleSheet.create({
    monthRow: {
        paddingHorizontal: 12,
        paddingBottom: 4,
        paddingTop: 2,
    },
    monthLabel: {
        fontSize: 13,
        fontWeight: '700',
        opacity: 0.6,
        letterSpacing: 0.3,
    },
    list: {
        paddingHorizontal: 8,
        gap: 0,
    },
    cell: {
        width: CELL_WIDTH,
        alignItems: 'center',
        gap: 3,
        paddingVertical: 6,
    },
    dayName: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    numberCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayNumber: {
        fontSize: 16,
        fontWeight: '600',
    },
    dayNumberSelected: {
        color: '#fff',
        fontWeight: '800',
    },
    availDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    availDotPlaceholder: {
        width: 5,
        height: 5,
    },
});
