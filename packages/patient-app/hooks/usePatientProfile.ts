import { useCallback, useEffect, useState } from "react";
import type {
	EmergencyContact,
	HealthDeclaration,
	Patient,
	PatientAddress,
} from "@/db/schema";
import {
	getEmergencyContacts,
	getHealthDeclarations,
	getLocalPatient,
	getPatientAddresses,
} from "@/services/patientService";

export type PatientProfile = {
	patient: Patient | null;
	addresses: PatientAddress[];
	emergencyContacts: EmergencyContact[];
	healthDeclarations: HealthDeclaration[];
	isLoading: boolean;
	refresh: () => Promise<void>;
};

export function usePatientProfile(): PatientProfile {
	const [patient, setPatient] = useState<Patient | null>(null);
	const [addresses, setAddresses] = useState<PatientAddress[]>([]);
	const [contacts, setContacts] = useState<EmergencyContact[]>([]);
	const [declarations, setDeclarations] = useState<HealthDeclaration[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const load = useCallback(async () => {
		setIsLoading(true);
		try {
			const p = await getLocalPatient();
			setPatient(p);

			if (p) {
				const [addr, ec, hd] = await Promise.all([
					getPatientAddresses(p.id),
					getEmergencyContacts(p.id),
					getHealthDeclarations(p.id),
				]);
				setAddresses(addr);
				setContacts(ec);
				setDeclarations(hd);
			}
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	return {
		patient,
		addresses,
		emergencyContacts: contacts,
		healthDeclarations: declarations,
		isLoading,
		refresh: load,
	};
}
