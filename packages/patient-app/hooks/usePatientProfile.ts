import { useUser } from "@clerk/expo";
import { useCallback, useEffect, useState } from "react";
import type {
	EmergencyContact,
	HealthDeclaration,
	Patient,
	PatientAddress,
	PatientImmunization,
	PatientMenstrualHistory,
	PatientSocialHistory,
	PhilhealthProfile,
} from "@/db/schema";
import {
	getEmergencyContacts,
	getHealthDeclarations,
	getImmunizationRecord,
	getLocalPatient,
	getMenstrualHistory,
	getPatientAddresses,
	getPhilhealthProfile,
	getSocialHistory,
} from "@/services/patientService";

export type PatientProfile = {
	patient: Patient | null;
	addresses: PatientAddress[];
	emergencyContacts: EmergencyContact[];
	healthDeclarations: HealthDeclaration[];
	philhealthProfile: PhilhealthProfile | null;
	socialHistory: PatientSocialHistory | null;
	immunization: PatientImmunization | null;
	menstrualHistory: PatientMenstrualHistory | null;
	isLoading: boolean;
	refresh: () => Promise<void>;
};

export function usePatientProfile(): PatientProfile {
	const { user } = useUser();
	const [patient, setPatient] = useState<Patient | null>(null);
	const [addresses, setAddresses] = useState<PatientAddress[]>([]);
	const [contacts, setContacts] = useState<EmergencyContact[]>([]);
	const [declarations, setDeclarations] = useState<HealthDeclaration[]>([]);
	const [philhealthProfile, setPhilhealthProfile] =
		useState<PhilhealthProfile | null>(null);
	const [socialHistory, setSocialHistory] =
		useState<PatientSocialHistory | null>(null);
	const [immunization, setImmunization] = useState<PatientImmunization | null>(
		null,
	);
	const [menstrualHistory, setMenstrualHistory] =
		useState<PatientMenstrualHistory | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const load = useCallback(async () => {
		if (!user?.id) {
			setPatient(null);
			setAddresses([]);
			setContacts([]);
			setDeclarations([]);
			setPhilhealthProfile(null);
			setSocialHistory(null);
			setImmunization(null);
			setMenstrualHistory(null);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		try {
			const p = await getLocalPatient(user.id);
			setPatient(p);

			if (p) {
				const [addr, ec, hd, ph, sh, imm, mh] = await Promise.all([
					getPatientAddresses(p.id),
					getEmergencyContacts(p.id),
					getHealthDeclarations(p.id),
					getPhilhealthProfile(p.id),
					getSocialHistory(p.id),
					getImmunizationRecord(p.id),
					getMenstrualHistory(p.id),
				]);
				setAddresses(addr);
				setContacts(ec);
				setDeclarations(hd);
				setPhilhealthProfile(ph);
				setSocialHistory(sh);
				setImmunization(imm);
				setMenstrualHistory(mh);
			} else {
				setAddresses([]);
				setContacts([]);
				setDeclarations([]);
				setPhilhealthProfile(null);
				setSocialHistory(null);
				setImmunization(null);
				setMenstrualHistory(null);
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
		philhealthProfile,
		socialHistory,
		immunization,
		menstrualHistory,
		isLoading,
		refresh: load,
	};
}
