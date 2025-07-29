import React from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { TouchableOpacity } from 'react-native';

interface DateSlotGridProps {
    dates: string[];
    selectedDate: string;
    onSelect: (date: string) => void;
}

export function DateSlotGrid({ dates, selectedDate, onSelect }: DateSlotGridProps) {
    return (
        <ThemedView className="flex-row flex-wrap gap-2 justify-center mb-2">
            {dates.map(date => (
                <TouchableOpacity
                    key={date}
                    className={`px-4 py-2 rounded-xl border ${selectedDate === date ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-neutral-800 border-slate-300 dark:border-slate-700'}`}
                    onPress={() => onSelect(date)}
                >
                    <ThemedText className={selectedDate === date ? 'text-white font-bold' : 'text-slate-700 dark:text-slate-200'}>
                        {date}
                    </ThemedText>
                </TouchableOpacity>
            ))}
        </ThemedView>
    );
}

interface TimeSlotGridProps {
    slots: string[];
    selectedTime: string;
    onSelect: (time: string) => void;
}

export function TimeSlotGrid({ slots, selectedTime, onSelect }: TimeSlotGridProps) {
    return (
        <ThemedView className="flex-row flex-wrap gap-2 justify-center">
            {slots.map(time => (
                <TouchableOpacity
                    key={time}
                    className={`px-4 py-2 rounded-xl border ${selectedTime === time ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-neutral-800 border-slate-300 dark:border-slate-700'}`}
                    onPress={() => onSelect(time)}
                >
                    <ThemedText className={selectedTime === time ? 'text-white font-bold' : 'text-slate-700 dark:text-slate-200'}>
                        {time}
                    </ThemedText>
                </TouchableOpacity>
            ))}
        </ThemedView>
    );
}
