import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from '@/screens/HealthScreenData';

export default function ChronicConditionsSection({ onSelect }: { onSelect?: (item: any) => void }) {
    return (
        <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.09, shadowRadius: 6, elevation: 2 }}>
            <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
                <Feather name="alert-circle" size={15} color={Colors.light.tint} /> Chronic Conditions
            </ThemedText>
            {dummyHealth.chronicConditions.map((cond, i) => (
                <TouchableOpacity key={i} onPress={() => onSelect && onSelect(cond)}>
                    <ThemedView style={{ marginBottom: 8, backgroundColor: Colors.light.tint + '11', borderRadius: 8, padding: 8 }}>
                        <ThemedText style={{ fontSize: 14, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 2 }}>
                            <Feather name="check-circle" size={12} color={Colors.light.tint} style={{ marginRight: 4 }} /> {cond.name}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 12, color: '#888', marginBottom: 1 }}>
                            <Feather name="calendar" size={10} color={Colors.light.tint} /> {cond.diagnosed}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 12, color: '#888', marginBottom: 1 }}>
                            <Feather name="user" size={10} color={Colors.light.tint} /> {cond.doctor}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 11, color: '#aaa' }} numberOfLines={2} ellipsizeMode="tail">
                            <Feather name="info" size={9} color={Colors.light.tint} /> {cond.notes}
                        </ThemedText>
                    </ThemedView>
                </TouchableOpacity>
            ))}
        </ThemedView>
    );
}
