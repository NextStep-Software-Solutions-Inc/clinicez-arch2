import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { db } from "@/db";
import { clinics as clinicsTable } from "@/db/schema/clinics";

// Re-export the canonical DB type so consumers always use the same definition.
export type { Clinic } from "@/db/schema/clinics";

import type { Clinic } from "@/db/schema/clinics";

export type ClinicContextType = {
	/** All clinics the patient has joined. No "current clinic" concept. */
	clinics: Clinic[];
};

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ children }: { children: ReactNode }) {
	const [clinics, setClinics] = useState<Clinic[]>([]);

	useEffect(() => {
		db.select().from(clinicsTable).then(setClinics).catch(console.error);
	}, []);

	return (
		<ClinicContext.Provider value={{ clinics }}>
			{children}
		</ClinicContext.Provider>
	);
}

export function useClinicContext() {
	const ctx = useContext(ClinicContext);
	if (!ctx)
		throw new Error("useClinicContext must be used within a ClinicProvider");
	return ctx;
}
