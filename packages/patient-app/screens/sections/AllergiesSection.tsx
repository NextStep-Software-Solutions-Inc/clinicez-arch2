import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from "@/screens/HealthScreenData"

export default function AllergiesSection({ onSelect }: { onSelect?: (item: any) => void }) {
    return (
        <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 }}>
            <ThemedText style={{ fontSize: 17, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 6, letterSpacing: 0.2 }}>
                <Feather name="alert-circle" size={16} color={Colors.light.tint} /> Allergies
            </ThemedText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {dummyHealth.allergies.map((allergy, i) => (
                    <TouchableOpacity key={i} onPress={() => onSelect && onSelect(allergy)}>
                        <View style={{ backgroundColor: Colors.light.tint + '18', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 4, marginRight: 4, flexDirection: 'row', alignItems: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.04, shadowRadius: 1, elevation: 1 }}>
                            <Feather name="alert-circle" size={10} color={Colors.light.tint} style={{ marginRight: 3 }} />
                            <ThemedText style={{ fontSize: 12, color: Colors.light.tint, fontWeight: 'bold', marginRight: 4 }}>{allergy.allergen}</ThemedText>
                            <ThemedText style={{ fontSize: 11, color: '#888', fontWeight: '500' }}>({allergy.reaction})</ThemedText>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </ThemedView>
    );
}
