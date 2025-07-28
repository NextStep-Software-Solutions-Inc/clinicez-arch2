import React from 'react';
import { ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { LinearGradient } from 'expo-linear-gradient';
import MedicalHistorySection from './sections/MedicalHistorySection';
import ChronicConditionsSection from './sections/ChronicConditionsSection';
import ProceduresSection from './sections/ProceduresSection';
import ClinicVisitsSection from './sections/ClinicVisitsSection';
import LaboratoryResultsSection from './sections/LaboratoryResultsSection';
import AllergiesSection from './sections/AllergiesSection';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function HealthScreen() {
    const colorScheme = useColorScheme();
    const gradientColors: [string, string] = colorScheme === 'dark'
        ? ['#18181b', '#27272a'] // dark mode gradient
        : ['#e0e7ff', '#f8fafc']; // light mode gradient
    return (
        <ThemedView style={{ flex: 1 }}>
            <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{ flex: 1 }}
            >
                <ThemedView
                    style={{ flex: 1 }}
                    lightColor="transparent"
                    darkColor="transparent"
                >
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
                        <MedicalHistorySection />
                        <ChronicConditionsSection />
                        <ProceduresSection />
                        <ClinicVisitsSection />
                        <LaboratoryResultsSection />
                        <AllergiesSection />
                    </ScrollView>
                </ThemedView>
            </LinearGradient>
        </ThemedView>
    );
}

