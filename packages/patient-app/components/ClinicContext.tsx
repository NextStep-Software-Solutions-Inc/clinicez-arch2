import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import JoinClinicScreen from '@/screens/onboarding/JoinClinicScreen';
import JoinClinicRoute from '@/app/join-clinic';
const CURRENT_CLINIC_ID = 'CURRENT_CLINIC_ID';

export type Clinic = {
    id: string; // generated UUID
    name: string;
    address: string;
};

const defaultClinics: Clinic[] = [
    {
        id: "uuid-1",
        name: 'Downtown Medical Center',
        address: '123 Main St, Cityville',
    },
    {
        id: "uuid-2",
        name: 'Uptown Health Clinic',
        address: '456 Elm St, Cityville',
    },
];

export type ClinicContextType = {
    clinics: Clinic[];
    currentClinicId: string | null;
    setCurrentClinicId: (id: string | null) => void;
};

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ children }: { children: ReactNode }) {
    const [currentClinicId, setCurrentClinicId] = useState<string | null>(defaultClinics[0].id);

    // Load persisted clinic id on mount
    useEffect(() => {
        SecureStore.getItemAsync(CURRENT_CLINIC_ID).then(val => {
            if (val && defaultClinics.some(c => c.id === val)) {
                setCurrentClinicId(val);
            }
        });
    }, []);

    // Persist clinic id on change
    const setCurrentClinicIdState = (id: string | null) => {

        setCurrentClinicId(id);
        if (id) {
            SecureStore.setItemAsync(CURRENT_CLINIC_ID, id);
        } else {
            SecureStore.deleteItemAsync(CURRENT_CLINIC_ID);
        }
    };


    return (
        <ClinicContext.Provider value={{ clinics: defaultClinics, currentClinicId, setCurrentClinicId: setCurrentClinicIdState }}>
            {children}
        </ClinicContext.Provider>
    );
}

export function useClinicContext() {
    const ctx = useContext(ClinicContext);
    if (!ctx) throw new Error('useClinicContext must be used within a ClinicProvider');
    return ctx;
}
