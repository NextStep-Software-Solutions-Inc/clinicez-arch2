import React, { createContext, useContext, useState, ReactNode } from 'react';

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
    const [currentClinicId, setCurrentClinicId] = useState(defaultClinics[0].id);
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
