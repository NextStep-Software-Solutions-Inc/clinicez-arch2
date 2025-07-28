import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

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
    currentClinicId: string;
    setCurrentClinicId: (id: string) => void;
};

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ children }: { children: ReactNode }) {
    const [currentClinicId, setCurrentClinicIdState] = useState(defaultClinics[0].id);

    // Load persisted clinic id on mount
    useEffect(() => {
        SecureStore.getItemAsync('currentClinicId').then(val => {
            if (val && defaultClinics.some(c => c.id === val)) {
                setCurrentClinicIdState(val);
            }
        });
    }, []);

    // Persist clinic id on change
    const setCurrentClinicId = (id: string) => {
        setCurrentClinicIdState(id);
        SecureStore.setItemAsync('currentClinicId', id);
    };

    return (
        <ClinicContext.Provider value={{ clinics: defaultClinics, currentClinicId, setCurrentClinicId }}>
            {children}
        </ClinicContext.Provider>
    );
}

export function useClinicContext() {
    const ctx = useContext(ClinicContext);
    if (!ctx) throw new Error('useClinicContext must be used within a ClinicProvider');
    return ctx;
}
