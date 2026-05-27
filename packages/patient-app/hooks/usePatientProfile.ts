import { useUser } from "@clerk/expo";
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
	const { user } = useUser();
	const [patient, setPatient] = useState<Patient | null>(null);
	const [addresses, setAddresses] = useState<PatientAddress[]>([]);
	const [contacts, setContacts] = useState<EmergencyContact[]>([]);
	const [declarations, setDeclarations] = useState<HealthDeclaration[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const load = useCallback(async () => {
		if (!user?.id) {
			setPatient(null);
			setAddresses([]);
			setContacts([]);
			setDeclarations([]);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		try {
			const p = await getLocalPatient(user.id);
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
			} else {
				setAddresses([]);
				setContacts([]);
				setDeclarations([]);
			}
		} finally {
			setIsLoading(false);
		}
	}, [user?.id]);

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
