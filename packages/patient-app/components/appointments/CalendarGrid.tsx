import React from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { TouchableOpacity } from 'react-native';

interface CalendarGridProps {
    year: number;
    month: number; // 0-indexed
    selectedDate: string;
    onSelect: (date: string) => void;
    minDate?: string; // yyyy-mm-dd
    fullWidth?: boolean;
}

export function CalendarGrid({ year, month, selectedDate, onSelect, minDate, fullWidth }: CalendarGridProps) {
    // Calculate previous and next month
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDay = firstDay.getDay(); // 0 (Sun) - 6 (Sat)

    // Previous month's last days for padding
    const prevMonthLastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
    const prevMonthDays = Array.from({ length: startDay }, (_, i) => ({
        day: prevMonthLastDay - startDay + i + 1,
        month: prevMonth,
        year: prevYear,
        isCurrent: false,
    }));

    // Current month days
    const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => ({
        day: i + 1,
        month,
        year,
        isCurrent: true,
    }));

    // Next month's first days for padding
    const totalDays = prevMonthDays.length + currentMonthDays.length;
    const nextMonthPad = (7 - (totalDays % 7)) % 7;
    const nextMonthDays = Array.from({ length: nextMonthPad }, (_, i) => ({
        day: i + 1,
        month: nextMonth,
        year: nextYear,
        isCurrent: false,
    }));

    const days = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
    const todayStr = new Date().toISOString().slice(0, 10);

    // Parse minDate if provided
    let minDateObj: Date | null = null;
    if (minDate) {
        const [minY, minM, minD] = minDate.split('-').map(Number);
        minDateObj = new Date(minY, minM - 1, minD);
    }

    // Weekday labels
    const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    // Render as rows of 7 columns
    const rows = [];
    for (let i = 0; i < days.length; i += 7) {
        rows.push(days.slice(i, i + 7));
    }

    return (
        <ThemedView className={`mb-2 ${fullWidth ? 'w-full px-1' : ''}`} style={fullWidth ? { maxWidth: 420, alignSelf: 'center' } : {}}>
            <ThemedView className="flex-row justify-center gap-1 mb-1">
                {weekdayLabels.map((label, idx) => (
                    <ThemedText key={label + idx} className={`text-center font-semibold text-slate-500 dark:text-slate-400 ${fullWidth ? 'w-[44px] text-base' : 'w-10 text-xs'}`}>
                        {label}
                    </ThemedText>
                ))}
            </ThemedView>
            {rows.map((week, rowIdx) => (
                <ThemedView key={rowIdx} className="flex-row justify-center gap-1 mb-0.5">
                    {week.map((d, colIdx) => {
                        const dateStr = `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
                        const isSelected = selectedDate === dateStr;
                        const isToday = todayStr === dateStr;
                        const thisDate = new Date(d.year, d.month, d.day);
                        const isDisabled = !!(minDateObj && thisDate < minDateObj);
                        return (
                            <TouchableOpacity
                                key={dateStr}
                                className={`${fullWidth ? 'w-[44px] h-[44px]' : 'w-10 h-10'} rounded-full items-center justify-center border ${isSelected
                                        ? 'bg-blue-600 border-blue-600'
                                        : isToday
                                            ? 'border-blue-400'
                                            : d.isCurrent
                                                ? 'bg-white dark:bg-neutral-800 border-slate-300 dark:border-slate-700'
                                                : 'bg-slate-100 dark:bg-neutral-900 border-slate-200 dark:border-slate-800 opacity-60'
                                    } ${isDisabled ? 'opacity-40' : ''}`}
                                onPress={() => !isDisabled && onSelect(dateStr)}
                                disabled={isDisabled}
                            >
                                <ThemedText className={
                                    isSelected
                                        ? 'text-white font-bold text-lg'
                                        : isToday
                                            ? 'text-blue-600 font-bold text-lg'
                                            : d.isCurrent
                                                ? 'text-slate-700 dark:text-slate-200 text-lg'
                                                : 'text-slate-400 dark:text-slate-500 text-lg'
                                }>
                                    {d.day}
                                </ThemedText>
                            </TouchableOpacity>
                        );
                    })}
                </ThemedView>
            ))}
        </ThemedView>
    );
}
