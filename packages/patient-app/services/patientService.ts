import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import { db } from "@/db";
import {
	type EmergencyContact,
	emergencyContacts,
	type HealthDeclaration,
	type HealthDeclarationCategory,
	healthDeclarations,
	type NewEmergencyContact,
	type NewHealthDeclaration,
	type NewPatient,
	type NewPatientAddress,
	type Patient,
	type PatientAddress,
	patientAddresses,
	patients,
} from "@/db/schema";
import { audit } from "./auditLogger";
import { enqueueMutation } from "./syncService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal Clerk user shape we need for seeding. */
export type ClerkUserSeed = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	primaryEmailAddress?: { emailAddress: string } | null;
	imageUrl?: string | null;
};

export type PatientBasicInfoPatch = Partial<
	Pick<
		Patient,
		| "firstName"
		| "middleName"
		| "lastName"
		| "suffix"
		| "sex"
		| "dob"
		| "civilStatus"
		| "bloodType"
		| "nationality"
		| "religion"
		| "philhealthId"
		| "phone"
	>
>;

export type AddressPatch = Omit<
	NewPatientAddress,
	"id" | "patientId" | "createdAt" | "updatedAt" | "syncedAt"
>;

export type EmergencyContactInput = Omit<
	NewEmergencyContact,
	"id" | "patientId" | "createdAt" | "updatedAt" | "syncedAt"
>;

export type HealthDeclarationInput = Omit<
	NewHealthDeclaration,
	"id" | "patientId" | "createdAt" | "updatedAt" | "syncedAt" | "deletedAt"
>;

// ---------------------------------------------------------------------------
// Patient — seed & read
// ---------------------------------------------------------------------------

/**
 * Upsert the patient row from Clerk identity.
 * Called once after the user is authenticated and the DB is ready.
 * On subsequent boots it silently no-ops if the row exists.
 */
export async function seedPatientFromClerk(
	clerkUser: ClerkUserSeed,
): Promise<Patient> {
	const existing = await db
		.select()
		.from(patients)
		.where(eq(patients.clerkUserId, clerkUser.id))
		.get();

	if (existing) {
		// Keep avatar in sync with Clerk (user may update it there)
		if (clerkUser.imageUrl && existing.avatarUrl !== clerkUser.imageUrl) {
			await db
				.update(patients)
				.set({ avatarUrl: clerkUser.imageUrl, updatedAt: new Date() })
				.where(eq(patients.id, existing.id));
			return { ...existing, avatarUrl: clerkUser.imageUrl };
		}
		return existing;
	}

	const now = new Date();
	const newPatient: NewPatient = {
		id: randomUUID(),
		clerkUserId: clerkUser.id,
		firstName: clerkUser.firstName ?? "Patient",
		lastName: clerkUser.lastName ?? "",
		email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
		avatarUrl: clerkUser.imageUrl ?? null,
		createdAt: now,
		updatedAt: now,
	};

	await db.insert(patients).values(newPatient);
	audit.info("DATA", "PATIENT_SEEDED");

	// Enqueue initial create so clinic backends receive the profile on first sync
	await enqueueMutation(
		"patient",
		newPatient.id,
		"create",
		newPatient as Record<string, unknown>,
	);

	return newPatient as Patient;
}

/** Returns the single local patient row, or null if not yet seeded. */
export async function getLocalPatient(): Promise<Patient | null> {
	return (await db.select().from(patients).limit(1).get()) ?? null;
}

// ---------------------------------------------------------------------------
// Basic info update
// ---------------------------------------------------------------------------

export async function updatePatientBasicInfo(
	patientId: string,
	patch: PatientBasicInfoPatch,
): Promise<void> {
	const now = new Date();
	await db
		.update(patients)
		.set({ ...patch, updatedAt: now, syncedAt: null })
		.where(eq(patients.id, patientId));

	await enqueueMutation(
		"patient",
		patientId,
		"update",
		patch as Record<string, unknown>,
	);
	audit.info("DATA", "PATIENT_UPDATED");
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export async function getPatientAddresses(
	patientId: string,
): Promise<PatientAddress[]> {
	return db
		.select()
		.from(patientAddresses)
		.where(eq(patientAddresses.patientId, patientId));
}

export async function upsertPatientAddress(
	patientId: string,
	data: AddressPatch,
): Promise<PatientAddress> {
	const now = new Date();

	const existing = await db
		.select()
		.from(patientAddresses)
		.where(
			and(
				eq(patientAddresses.patientId, patientId),
				eq(patientAddresses.type, data.type ?? "primary"),
			),
		)
		.get();

	if (existing) {
		await db
			.update(patientAddresses)
			.set({ ...data, updatedAt: now, syncedAt: null })
			.where(eq(patientAddresses.id, existing.id));

		await enqueueMutation("patient", patientId, "update", {
			addressType: data.type,
			...data,
		});
		return { ...existing, ...data, updatedAt: now };
	}

	const newAddress: NewPatientAddress = {
		id: randomUUID(),
		patientId,
		...data,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(patientAddresses).values(newAddress);
	await enqueueMutation("patient", patientId, "update", {
		addressType: data.type,
		...data,
	});
	return newAddress as PatientAddress;
}

// ---------------------------------------------------------------------------
// Emergency contacts
// ---------------------------------------------------------------------------

export async function getEmergencyContacts(
	patientId: string,
): Promise<EmergencyContact[]> {
	return db
		.select()
		.from(emergencyContacts)
		.where(eq(emergencyContacts.patientId, patientId))
		.orderBy(emergencyContacts.sortOrder);
}

export async function upsertEmergencyContact(
	patientId: string,
	data: EmergencyContactInput,
): Promise<EmergencyContact> {
	const now = new Date();

	const existing = await db
		.select()
		.from(emergencyContacts)
		.where(
			and(
				eq(emergencyContacts.patientId, patientId),
				eq(emergencyContacts.sortOrder, data.sortOrder ?? 1),
			),
		)
		.get();

	if (existing) {
		await db
			.update(emergencyContacts)
			.set({ ...data, updatedAt: now, syncedAt: null })
			.where(eq(emergencyContacts.id, existing.id));

		await enqueueMutation("patient", patientId, "update", {
			emergencyContact: { sortOrder: data.sortOrder, ...data },
		});
		return { ...existing, ...data, updatedAt: now };
	}

	const newContact: NewEmergencyContact = {
		id: randomUUID(),
		patientId,
		...data,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(emergencyContacts).values(newContact);
	await enqueueMutation("patient", patientId, "update", {
		emergencyContact: { sortOrder: data.sortOrder, ...data },
	});
	return newContact as EmergencyContact;
}

export async function deleteEmergencyContact(
	id: string,
	patientId: string,
): Promise<void> {
	await db.delete(emergencyContacts).where(eq(emergencyContacts.id, id));
	await enqueueMutation("patient", patientId, "update", {
		removedEmergencyContactId: id,
	});
}

// ---------------------------------------------------------------------------
// Health declarations
// ---------------------------------------------------------------------------

export async function getHealthDeclarations(
	patientId: string,
	category?: HealthDeclarationCategory,
): Promise<HealthDeclaration[]> {
	const conditions = [
		eq(healthDeclarations.patientId, patientId),
		isNull(healthDeclarations.deletedAt),
	];
	if (category) {
		conditions.push(eq(healthDeclarations.category, category));
	}
	return db
		.select()
		.from(healthDeclarations)
		.where(and(...conditions))
		.orderBy(healthDeclarations.createdAt);
}

export async function upsertHealthDeclaration(
	patientId: string,
	data: HealthDeclarationInput,
	existingId?: string,
): Promise<HealthDeclaration> {
	const now = new Date();

	if (existingId) {
		await db
			.update(healthDeclarations)
			.set({ ...data, updatedAt: now, syncedAt: null })
			.where(eq(healthDeclarations.id, existingId));

		await enqueueMutation("patient", patientId, "update", {
			healthDeclaration: { id: existingId, ...data },
		});
		return {
			id: existingId,
			patientId,
			...data,
			createdAt: now,
			updatedAt: now,
			syncedAt: null,
			deletedAt: null,
		} as HealthDeclaration;
	}

	const newDecl: NewHealthDeclaration = {
		id: randomUUID(),
		patientId,
		...data,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(healthDeclarations).values(newDecl);
	await enqueueMutation("patient", patientId, "update", {
		healthDeclaration: newDecl,
	});
	return newDecl as HealthDeclaration;
}

export async function deleteHealthDeclaration(
	id: string,
	patientId: string,
): Promise<void> {
	const now = new Date();
	// Soft delete
	await db
		.update(healthDeclarations)
		.set({ deletedAt: now, syncedAt: null })
		.where(eq(healthDeclarations.id, id));

	await enqueueMutation("patient", patientId, "update", {
		deletedHealthDeclarationId: id,
	});
}
