import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from "@/screens/HealthScreenData"

export default function ClinicVisitsSection({ onSelect }: { onSelect?: (item: any) => void }) {
    return (
        <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
            <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
                <Feather name="map-pin" size={16} color={Colors.light.tint} /> Clinic Visits
            </ThemedText>
            <ThemedView style={{ borderLeftWidth: 2, borderLeftColor: Colors.light.tint + '55', paddingLeft: 10 }}>
                {dummyHealth.hospitalVisits.map((visit, i) => (
                    <TouchableOpacity key={i} onPress={() => onSelect && onSelect(visit)}>
                        <ThemedView style={{ marginBottom: 12, position: 'relative' }}>
                            <View style={{ position: 'absolute', left: -16, top: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.light.tint, justifyContent: 'center', alignItems: 'center' }}>
                                <Feather name="map-pin" size={7} color="#fff" />
                            </View>
                            <ThemedText style={{ fontSize: 13, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 2 }}>{visit.date}</ThemedText>
                            <ThemedText style={{ fontSize: 12, color: '#444', marginBottom: 2 }}>{visit.reason}</ThemedText>
                        </ThemedView>
                    </TouchableOpacity>
                ))}
            </ThemedView>
        </ThemedView>
    );
}
