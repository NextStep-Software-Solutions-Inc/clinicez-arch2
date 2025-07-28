import React, { useState } from 'react';
import { format } from 'date-fns';
import { ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { HealthSectionModal } from '@/components/HealthSectionModal';
import MedicalHistorySection from './sections/MedicalHistorySection';
import ChronicConditionsSection from './sections/ChronicConditionsSection';
import ProceduresSection from './sections/ProceduresSection';
import ClinicVisitsSection from './sections/ClinicVisitsSection';
import LaboratoryResultsSection from './sections/LaboratoryResultsSection';
import AllergiesSection from './sections/AllergiesSection';

export default function HealthScreen() {
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);

    // Helper to render modal content based on type
    const renderModalContent = () => {
        if (!selectedItem || !selectedType) return null;
        switch (selectedType) {
            case 'medicalHistory':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.event}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.date ? format(new Date(selectedItem.date), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="user" size={14} color={Colors.light.tint} /> {selectedItem.doctor}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.notes}</ThemedText>
                    </>
                );
            case 'chronicCondition':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.name}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.diagnosed ? format(new Date(selectedItem.diagnosed), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="user" size={14} color={Colors.light.tint} /> {selectedItem.doctor}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.notes}</ThemedText>
                    </>
                );
            case 'procedure':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.procedure}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.year}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="user" size={14} color={Colors.light.tint} /> {selectedItem.doctor}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="map-pin" size={14} color={Colors.light.tint} /> {selectedItem.location}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.notes}</ThemedText>
                    </>
                );
            case 'clinicVisit':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>Clinic Visit</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.date ? format(new Date(selectedItem.date), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.reason}</ThemedText>
                    </>
                );
            case 'lab':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.test}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.date ? format(new Date(selectedItem.date), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: selectedItem.result === 'Normal' ? '#059669' : '#e11d48', fontWeight: 'bold', marginBottom: 4 }}>Result: {selectedItem.result}</ThemedText>
                    </>
                );
            case 'allergy':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.allergen}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#e11d48', marginBottom: 4 }}>Reaction: {selectedItem.reaction}</ThemedText>
                    </>
                );
            default:
                return null;
        }
    };

    return (
        <ThemedView style={{ flex: 1, backgroundColor: 'linear-gradient(180deg, #e0e7ff 0%, #f8fafc 100%)' }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 0 }}>
                <MedicalHistorySection />
                <ChronicConditionsSection />
                <ProceduresSection />
                <ClinicVisitsSection />
                <LaboratoryResultsSection />
                <AllergiesSection />
            </ScrollView >
            {/* Universal Details Modal for all sections */}
            <HealthSectionModal
                visible={!!selectedItem}
                onClose={() => { setSelectedItem(null); setSelectedType(null); }}
            >
                {renderModalContent()}
            </HealthSectionModal>
        </ThemedView >
    );
}

