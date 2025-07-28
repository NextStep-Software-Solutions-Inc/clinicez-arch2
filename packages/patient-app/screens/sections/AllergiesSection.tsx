import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from '@/screens/HealthScreenData';
import { HealthSectionModal } from '../../components/HealthSectionModal';

type AllergyItem = typeof dummyHealth.allergies[number];

export default function AllergiesSection() {
    const [selectedItem, setSelectedItem] = useState<AllergyItem | null>(null);

    return (
        <>
            <ThemedView className="bg-white dark:bg-neutral-900 rounded-lg py-2 px-3 mb-3 self-center shadow-md w-full" style={{ shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 1 }}>
                <ThemedText style={{ fontSize: 17, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 6, letterSpacing: 0.2 }}>
                    <Feather name="alert-circle" size={16} color={Colors.light.tint} /> Allergies
                </ThemedText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {dummyHealth.allergies.map((allergy: AllergyItem, i: number) => (
                        <TouchableOpacity key={i} onPress={() => setSelectedItem(allergy)}>
                            <ThemedView
                                style={{ shadowColor: Colors.light.tint, shadowOpacity: 0.04, elevation: 1 }}
                                className='flex-row items-center bg-slate-100 dark:bg-neutral-800 rounded-lg px-2 py-2 mb-1'
                            >
                                <Feather name="alert-circle" size={10} color={Colors.light.tint} style={{ marginRight: 3 }} />
                                <ThemedText style={{ fontSize: 12, color: Colors.light.tint, fontWeight: 'bold', marginRight: 4 }}>{allergy.allergen}</ThemedText>
                                <ThemedText style={{ fontSize: 11, color: '#888', fontWeight: '500' }}>({allergy.reaction})</ThemedText>
                            </ThemedView>
                        </TouchableOpacity>
                    ))}
                </View>
            </ThemedView>
            <HealthSectionModal
                visible={!!selectedItem}
                onClose={() => setSelectedItem(null)}
            >
                {selectedItem ? (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.allergen}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#e11d48', marginBottom: 4 }}>
                            Reaction: {selectedItem.reaction}
                        </ThemedText>
                    </>
                ) : null}
            </HealthSectionModal>
        </>
    );
}
