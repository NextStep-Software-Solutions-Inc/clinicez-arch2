import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from '@/screens/HealthScreenData';

export default function MedicalHistorySection({ onSelect }: { onSelect?: (item: any) => void }) {
    return (
        <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12, marginBottom: 14, marginTop: 10, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
            <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
                <Feather name="book" size={16} color={Colors.light.tint} /> Medical History
            </ThemedText>
            {dummyHealth.medicalHistory.map((item, i) => (
                <TouchableOpacity key={i} onPress={() => onSelect && onSelect(item)}>
                    <ThemedView style={{ marginBottom: 8, backgroundColor: Colors.light.tint + '11', borderRadius: 8, padding: 8 }}>
                        <ThemedText style={{ fontSize: 13, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 2 }}>
                            <Feather name="calendar" size={12} color={Colors.light.tint} /> {item.date}: {item.event}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 12, color: '#444', marginBottom: 2 }}>
                            <Feather name="user" size={10} color={Colors.light.tint} /> {item.doctor}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 12, color: '#888' }}>
                            <Feather name="info" size={10} color={Colors.light.tint} /> {item.notes}
                        </ThemedText>
                    </ThemedView>
                </TouchableOpacity>
            ))}
        </ThemedView>
    );
}
