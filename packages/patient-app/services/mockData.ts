/**
 * Centralized mock data for the ClinicEZ patient app.
 *
 * All screens consume from this module when a real clinic backend is not
 * reachable (demo invite codes, development, offline). Data is keyed by
 * `clinicId` where relevant so multi-clinic rendering works correctly.
 */

// ── Clinic ───────────────────────────────────────────────────────────────────

export type MockClinicRecord = {
	id: string;
	name: string;
	address: string;
	baseUrl: string;
	inviteCode: string;
};

export const MOCK_CLINICS: MockClinicRecord[] = [
	{
		id: "mock-clinic-001",
		name: "Sunrise Medical Center",
		address: "123 Health Ave, Cityville, CA 90001",
		baseUrl: "https://mock-sunrise.clinicez.app",
		inviteCode: "DEMO-001",
	},
	{
		id: "mock-clinic-002",
		name: "Metro Health Clinic",
		address: "456 Wellness Blvd, Metro City, NY 10001",
		baseUrl: "https://mock-metro.clinicez.app",
		inviteCode: "DEMO-002",
	},
];

/** Returns the mock clinic record for a known demo invite code, or null. */
export function resolveMockInviteCode(code: string): MockClinicRecord | null {
	const upper = code.trim().toUpperCase();
	return MOCK_CLINICS.find((c) => c.inviteCode === upper) ?? null;
}

// ── Doctor ────────────────────────────────────────────────────────────────────

export type MockDoctor = {
	id: string;
	name: string;
	specialization: string;
	available: boolean;
};

const DOCTORS_CLINIC_001: MockDoctor[] = [
	{
		id: "d1-001",
		name: "Dr. Sarah Smith",
		specialization: "General Practitioner",
		available: true,
	},
	{
		id: "d2-001",
		name: "Dr. James Lee",
		specialization: "Cardiologist",
		available: true,
	},
	{
		id: "d3-001",
		name: "Dr. Maria Patel",
		specialization: "Pediatrician",
		available: false,
	},
	{
		id: "d4-001",
		name: "Dr. Robert Johnson",
		specialization: "Orthopedist",
		available: true,
	},
	{
		id: "d5-001",
		name: "Dr. Angela Cruz",
		specialization: "Dermatologist",
		available: true,
	},
];

const DOCTORS_CLINIC_002: MockDoctor[] = [
	{
		id: "d1-002",
		name: "Dr. Kevin Tan",
		specialization: "Internal Medicine",
		available: true,
	},
	{
		id: "d2-002",
		name: "Dr. Linda Gomez",
		specialization: "Neurologist",
		available: true,
	},
	{
		id: "d3-002",
		name: "Dr. Frank Carter",
		specialization: "Endocrinologist",
		available: false,
	},
	{
		id: "d4-002",
		name: "Dr. Helen Moore",
		specialization: "Pulmonologist",
		available: true,
	},
];

const FALLBACK_DOCTORS: MockDoctor[] = DOCTORS_CLINIC_001;

export function getMockDoctors(clinicId: string): MockDoctor[] {
	if (clinicId === "mock-clinic-001") return DOCTORS_CLINIC_001;
	if (clinicId === "mock-clinic-002") return DOCTORS_CLINIC_002;
	return FALLBACK_DOCTORS;
}

// ── Appointment ───────────────────────────────────────────────────────────────

export type MockAppointment = {
	id: string;
	clinicId: string;
	clinicName: string;
	about: string;
	doctor: string;
	date: string; // YYYY-MM-DD
	time: string;
	status: "Confirmed" | "Pending" | "Cancelled";
};

const REASONS = [
	"General Checkup",
	"Follow-up Visit",
	"Lab Results Discussion",
	"Prescription Renewal",
	"Vaccination",
	"Consultation",
	"Physical Therapy",
	"Specialist Referral",
	"Annual Physical",
	"Blood Test",
	"Imaging Review",
	"Mental Health",
	"Nutrition Advice",
	"Chronic Care",
	"Minor Procedure",
];

function buildAppointments(
	clinicId: string,
	clinicName: string,
	doctors: MockDoctor[],
	count: number,
	baseOffset: number,
): MockAppointment[] {
	const statuses: MockAppointment["status"][] = [
		"Confirmed",
		"Pending",
		"Cancelled",
	];
	return Array.from({ length: count }, (_, i) => {
		const doc = doctors[i % doctors.length];
		const dateObj = new Date(2026, 4, 20 + i + baseOffset); // May 2026 +
		const date = dateObj.toISOString().slice(0, 10);
		const hour = 8 + (i % 9);
		const minute = i % 2 === 0 ? "00" : "30";
		const ampm = hour < 12 ? "AM" : "PM";
		const displayHour = hour > 12 ? hour - 12 : hour;
		return {
			id: `appt-${clinicId}-${i + 1}`,
			clinicId,
			clinicName,
			about: REASONS[i % REASONS.length],
			doctor: doc.name,
			date,
			time: `${displayHour}:${minute} ${ampm}`,
			status: statuses[i % statuses.length],
		};
	});
}

const APPTS_CLINIC_001 = buildAppointments(
	"mock-clinic-001",
	"Sunrise Medical Center",
	DOCTORS_CLINIC_001,
	20,
	0,
);

const APPTS_CLINIC_002 = buildAppointments(
	"mock-clinic-002",
	"Metro Health Clinic",
	DOCTORS_CLINIC_002,
	15,
	5,
);

/**
 * Returns appointments for a specific clinic, or all mock appointments when
 * no `clinicId` is provided (used by Home screen to show across all clinics).
 */
export function getMockAppointments(clinicId?: string): MockAppointment[] {
	if (clinicId === "mock-clinic-001") return APPTS_CLINIC_001;
	if (clinicId === "mock-clinic-002") return APPTS_CLINIC_002;
	// All clinics merged (Home screen)
	return [...APPTS_CLINIC_001, ...APPTS_CLINIC_002];
}

// ── Available time slots ──────────────────────────────────────────────────────

export const MOCK_AVAILABLE_TIMES: string[] = [
	"09:00 AM",
	"10:00 AM",
	"11:00 AM",
	"01:00 PM",
	"02:00 PM",
	"03:00 PM",
	"04:00 PM",
];

// ── Files ─────────────────────────────────────────────────────────────────────

export type MockFile = {
	id: string;
	clinicId: string;
	name: string;
	date: string; // YYYY-MM-DD
	type: "PDF" | "Image" | "DOCX";
	size: string;
};

const FILES_CLINIC_001: MockFile[] = [
	{
		id: "f1-001",
		clinicId: "mock-clinic-001",
		name: "Lab Report – CBC",
		date: "2026-04-10",
		type: "PDF",
		size: "2.4 MB",
	},
	{
		id: "f2-001",
		clinicId: "mock-clinic-001",
		name: "Chest X-Ray Results",
		date: "2026-03-28",
		type: "Image",
		size: "5.1 MB",
	},
	{
		id: "f3-001",
		clinicId: "mock-clinic-001",
		name: "Prescription – Hypertension Meds",
		date: "2026-03-15",
		type: "PDF",
		size: "0.9 MB",
	},
	{
		id: "f4-001",
		clinicId: "mock-clinic-001",
		name: "Annual Physical Notes",
		date: "2026-01-05",
		type: "PDF",
		size: "1.2 MB",
	},
	{
		id: "f5-001",
		clinicId: "mock-clinic-001",
		name: "HbA1c Report",
		date: "2025-12-20",
		type: "PDF",
		size: "1.8 MB",
	},
];

const FILES_CLINIC_002: MockFile[] = [
	{
		id: "f1-002",
		clinicId: "mock-clinic-002",
		name: "MRI Scan – Lumbar",
		date: "2026-04-22",
		type: "Image",
		size: "8.3 MB",
	},
	{
		id: "f2-002",
		clinicId: "mock-clinic-002",
		name: "Referral Letter – Neurology",
		date: "2026-04-18",
		type: "PDF",
		size: "0.6 MB",
	},
	{
		id: "f3-002",
		clinicId: "mock-clinic-002",
		name: "Blood Panel Results",
		date: "2026-03-10",
		type: "PDF",
		size: "3.1 MB",
	},
];

export function getMockFiles(clinicId?: string): MockFile[] {
	if (clinicId === "mock-clinic-001") return FILES_CLINIC_001;
	if (clinicId === "mock-clinic-002") return FILES_CLINIC_002;
	return [...FILES_CLINIC_001, ...FILES_CLINIC_002];
}

// ── Health data (mirrors HealthScreenData structure) ─────────────────────────

export type MockAllergy = { id: string; allergen: string; reaction: string };
export type MockMedicalHistory = {
	id: string;
	date: string;
	event: string;
	doctor: string;
	location: string;
	notes: string;
};
export type MockChronicCondition = {
	id: string;
	name: string;
	diagnosed: string;
	doctor: string;
	notes: string;
};
export type MockProcedure = {
	id: string;
	year: number;
	procedure: string;
	doctor: string;
	location: string;
	notes: string;
};
export type MockHospitalVisit = { id: string; date: string; reason: string };
export type MockLabResult = {
	id: string;
	date: string;
	test: string;
	result: string;
};

export type MockHealthData = {
	allergies: MockAllergy[];
	medicalHistory: MockMedicalHistory[];
	chronicConditions: MockChronicCondition[];
	procedures: MockProcedure[];
	hospitalVisits: MockHospitalVisit[];
	labs: MockLabResult[];
};

// ── Patient profile ───────────────────────────────────────────────────────────

export type MockPatient = {
	firstName: string;
	lastName: string;
	fullName: string;
	gender: string;
	birthdate: string;
	bloodType: string;
	religion: string;
	email: string;
	phone: string;
	imageUrl: string;
	primaryAddress: string;
	role: string;
	emergencyContacts: {
		primary: { name: string; relation: string; contact: string };
		secondary: { name: string; relation: string; contact: string };
	};
};

export const MOCK_PATIENT: MockPatient = {
	firstName: "Jane",
	lastName: "Doe",
	fullName: "Jane Marie Doe",
	gender: "Female",
	birthdate: "1990-05-12",
	bloodType: "O+",
	religion: "Christian",
	email: "jane.doe@example.com",
	phone: "+1 (555) 123-4567",
	imageUrl:
		"https://ui-avatars.com/api/?name=Jane+Doe&background=1565c0&color=fff",
	primaryAddress: "456 Maple Ave, Cityville, CA 90001",
	role: "Patient",
	emergencyContacts: {
		primary: {
			name: "John Doe",
			relation: "Spouse",
			contact: "+1 (555) 987-6543",
		},
		secondary: {
			name: "Emily Doe",
			relation: "Daughter",
			contact: "+1 (555) 222-3333",
		},
	},
};

// ── Health overview summary (for Home screen) ─────────────────────────────────

export type HealthOverviewItem = {
	id: string;
	label: string;
	value: string;
	color: string;
};

export const MOCK_HEALTH_OVERVIEW: HealthOverviewItem[] = [
	{
		id: "ho-1",
		label: "Lab Results",
		value: "2 New",
		color: "text-green-600 dark:text-green-400",
	},
	{
		id: "ho-2",
		label: "Prescriptions",
		value: "1 Update",
		color: "text-blue-600 dark:text-blue-300",
	},
	{
		id: "ho-3",
		label: "Alerts",
		value: "None",
		color: "text-slate-500 dark:text-slate-400",
	},
];
