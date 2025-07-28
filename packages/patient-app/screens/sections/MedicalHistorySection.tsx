import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from '@/screens/HealthScreenData';
import { HealthSectionModal } from '../../components/HealthSectionModal';
import { format } from 'date-fns/format';

type MedicalHistoryItem = typeof dummyHealth.medicalHistory[number];

export default function MedicalHistorySection() {
    const [selectedItem, setSelectedItem] = useState<MedicalHistoryItem | null>(null);

    return (
        <>
            <ThemedView className="bg-white dark:bg-neutral-900 rounded-xl py-4 px-3 mb-3 mt-2  self-center shadow-md w-full" style={{ shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 1 }}>
                <ThemedText className="text-base font-bold mb-2 tracking-tight" style={{ color: Colors.light.tint }}>
                    <Feather name="book" size={16} color={Colors.light.tint} /> Medical History
                </ThemedText>
                {dummyHealth.medicalHistory.map((item: MedicalHistoryItem, i: number) => (
                    <TouchableOpacity key={i} onPress={() => setSelectedItem(item)}>
                        <ThemedView className="mb-2 bg-slate-100 dark:bg-neutral-800 rounded-lg py-2 px-2">
                            <ThemedText className="text-sm font-bold mb-0.5" style={{ color: Colors.light.tint }}>
                                <Feather name="calendar" size={12} color={Colors.light.tint} /> {format(item.date, 'MMMM d, yyyy')}: {item.event}
                            </ThemedText>
                            <ThemedText className="text-sm mb-0.5 text-neutral-700 dark:text-neutral-300">
                                <Feather name="user" size={10} color={Colors.light.tint} /> {item.doctor}
                            </ThemedText>
                            <ThemedText className="text-sm text-neutral-500 dark:text-neutral-300">
                                <Feather name="info" size={10} color={Colors.light.tint} /> {item.notes}
                            </ThemedText>
                        </ThemedView>
                    </TouchableOpacity>
                ))}
            </ThemedView>
            <HealthSectionModal
                visible={!!selectedItem}
                onClose={() => setSelectedItem(null)}
            >
                {selectedItem ? (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.event}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}>
                            <Feather name="calendar" size={14} color={Colors.light.tint} /> {format(selectedItem.date, 'MMMM d, yyyy')}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}>
                            <Feather name="user" size={14} color={Colors.light.tint} /> {selectedItem.doctor}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}>
                            <Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.notes}
                        </ThemedText>
                    </>
                ) : null}
            </HealthSectionModal>
        </>
    );
}
