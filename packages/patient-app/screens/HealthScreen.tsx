import React from 'react';
import { ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import MedicalHistorySection from './sections/MedicalHistorySection';
import ChronicConditionsSection from './sections/ChronicConditionsSection';
import ProceduresSection from './sections/ProceduresSection';
import ClinicVisitsSection from './sections/ClinicVisitsSection';
import LaboratoryResultsSection from './sections/LaboratoryResultsSection';
import AllergiesSection from './sections/AllergiesSection';

export default function HealthScreen() {
    return (
        <ThemedView className='flex-1'>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
                <MedicalHistorySection />
                <ChronicConditionsSection />
                <ProceduresSection />
                <ClinicVisitsSection />
                <LaboratoryResultsSection />
                <AllergiesSection />
            </ScrollView>
        </ThemedView>
    );
}

