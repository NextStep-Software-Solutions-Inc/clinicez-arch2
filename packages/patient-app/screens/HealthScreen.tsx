import React from 'react';
import { ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import MedicalHistorySection from './health-sections/MedicalHistorySection';
import ChronicConditionsSection from './health-sections/ChronicConditionsSection';
import ProceduresSection from './health-sections/ProceduresSection';
import ClinicVisitsSection from './health-sections/ClinicVisitsSection';
import LaboratoryResultsSection from './health-sections/LaboratoryResultsSection';
import AllergiesSection from './health-sections/AllergiesSection';

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

