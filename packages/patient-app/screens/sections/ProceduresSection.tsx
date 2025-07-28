import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from '@/screens/HealthScreenData';

export default function ProceduresSection({ onSelect }: { onSelect?: (item: any) => void }) {
    return (
        <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.09, shadowRadius: 6, elevation: 2 }}>
            <ThemedText style={{ fontSize: 17, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 7, letterSpacing: 0.2 }}>
                <Feather name="tool" size={16} color={Colors.light.tint} /> Procedures
            </ThemedText>
            <ThemedView style={{ borderLeftWidth: 2, borderLeftColor: Colors.light.tint + '44', paddingLeft: 10 }}>
                {dummyHealth.procedures.map((proc, i) => (
                    <TouchableOpacity key={i} onPress={() => onSelect && onSelect(proc)}>
                        <ThemedView style={{ marginBottom: 12, position: 'relative' }}>
                            <View style={{ position: 'absolute', left: -16, top: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.light.tint, justifyContent: 'center', alignItems: 'center' }}>
                                <Feather name="tool" size={7} color="#fff" />
                            </View>
                            <ThemedText style={{ fontSize: 14, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 1 }}>{proc.year}: {proc.procedure}</ThemedText>
                            <ThemedText style={{ fontSize: 13, color: '#444', marginBottom: 1 }}><Feather name="user" size={11} color={Colors.light.tint} /> {proc.doctor}</ThemedText>
                            <ThemedText style={{ fontSize: 12, color: '#888', marginBottom: 1 }}><Feather name="map-pin" size={10} color={Colors.light.tint} /> {proc.location}</ThemedText>
                            <ThemedText style={{ fontSize: 12, color: '#888' }}><Feather name="info" size={10} color={Colors.light.tint} /> {proc.notes}</ThemedText>
                        </ThemedView>
                    </TouchableOpacity>
                ))}
            </ThemedView>
        </ThemedView>
    );
}
