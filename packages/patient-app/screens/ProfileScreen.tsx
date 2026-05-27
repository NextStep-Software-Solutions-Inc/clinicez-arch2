import { useClerk, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DateTimeInput } from "@/components/DateTimeInput";
import {
	AvatarPickerSheet,
	EmergencyTab,
	MedicalTab,
	PersonalTab,
	ProfileHero,
	ProfileTabBar,
	type ProfileTabId,
} from "@/components/profile";
import { SelectInput, type SelectOption } from "@/components/SelectInput";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import type { HealthDeclarationCategory } from "@/db/schema";
import { useColorScheme } from "@/hooks/useColorScheme";
import { usePatientProfile } from "@/hooks/usePatientProfile";
import {
	deleteHealthDeclaration,
	updatePatientBasicInfo,
	upsertEmergencyContact,
	upsertHealthDeclaration,
	upsertPatientAddress,
} from "@/services/patientService";
import { useAuthStore } from "@/stores/authStore";

// ---------------------------------------------------------------------------
// Edit-form helpers (used only inside this screen)
// ---------------------------------------------------------------------------

function FieldInput({
	label,
	value,
	onChange,
	placeholder,
	keyboardType,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
}) {
	const scheme = useColorScheme();
	return (
		<ThemedView className="mb-3 bg-transparent">
			<ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-1">
				{label}
			</ThemedText>
			<TextInput
				value={value}
				onChangeText={onChange}
				placeholder={placeholder ?? label}
				placeholderTextColor={scheme === "dark" ? "#64748b" : "#94a3b8"}
				keyboardType={keyboardType ?? "default"}
				style={{
					borderWidth: 1,
					borderColor: scheme === "dark" ? "#475569" : "#e2e8f0",
					borderRadius: 8,
					paddingHorizontal: 12,
					paddingVertical: 8,
					fontSize: 14,
					color: scheme === "dark" ? "#f1f5f9" : "#1e293b",
					backgroundColor: scheme === "dark" ? "#0f172a" : "#f8fafc",
				}}
			/>
		</ThemedView>
	);
}

function EditModal({
	title,
	onClose,
	onSave,
	children,
}: {
	title: string;
	onClose: () => void;
	onSave: () => Promise<void>;
	children: React.ReactNode;
}) {
	const [saving, setSaving] = useState(false);
	const handleSave = async () => {
		setSaving(true);
		try {
			await onSave();
			onClose();
		} catch (e) {
			Alert.alert("Error", e instanceof Error ? e.message : "Failed to save.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<View
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: "rgba(0,0,0,0.5)",
				justifyContent: "flex-end",
				zIndex: 100,
			}}
		>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
			>
				<ThemedView className="rounded-t-3xl bg-white dark:bg-slate-800 px-5 pt-4 pb-8">
					<ThemedView className="flex-row items-center justify-between mb-4 bg-transparent">
						<ThemedText className="text-lg font-bold text-slate-800 dark:text-slate-100">
							{title}
						</ThemedText>
						<TouchableOpacity onPress={onClose} hitSlop={12}>
							<Feather name="x" size={22} color="#64748b" />
						</TouchableOpacity>
					</ThemedView>
					<ScrollView
						showsVerticalScrollIndicator={false}
						style={{ maxHeight: 420 }}
					>
						{children}
					</ScrollView>
					<TouchableOpacity
						onPress={handleSave}
						disabled={saving}
						style={{
							marginTop: 16,
							backgroundColor: "#0a7ea4",
							borderRadius: 12,
							paddingVertical: 12,
							alignItems: "center",
						}}
					>
						<ThemedText
							style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}
						>
							{saving ? "Saving…" : "Save Changes"}
						</ThemedText>
					</TouchableOpacity>
				</ThemedView>
			</KeyboardAvoidingView>
		</View>
	);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<HealthDeclarationCategory, string> = {
	allergy: "Allergies",
	disability: "Disabilities",
	illness: "Illnesses",
	chronic_condition: "Chronic Conditions",
	current_medication: "Current Medications",
	past_surgery: "Surgical History",
	family_history: "Family History",
	immunization: "Immunizations",
	lifestyle_habit: "Lifestyle & Habits",
};

const SEX_OPTIONS: SelectOption[] = [
	{ label: "Male", value: "Male" },
	{ label: "Female", value: "Female" },
	{ label: "Other", value: "Other" },
];

const CIVIL_STATUS_OPTIONS: SelectOption[] = [
	{ label: "Single", value: "Single" },
	{ label: "Married", value: "Married" },
	{ label: "Widowed", value: "Widowed" },
	{ label: "Separated", value: "Separated" },
	{ label: "Divorced", value: "Divorced" },
];

const BLOOD_TYPE_OPTIONS: SelectOption[] = [
	{ label: "A+", value: "A+" },
	{ label: "A-", value: "A-" },
	{ label: "B+", value: "B+" },
	{ label: "B-", value: "B-" },
	{ label: "AB+", value: "AB+" },
	{ label: "AB-", value: "AB-" },
	{ label: "O+", value: "O+" },
	{ label: "O-", value: "O-" },
	{ label: "Unknown", value: "Unknown" },
];

function validateSelectedValue(
	value: string,
	allowedValues: string[],
	label: string,
) {
	if (value && !allowedValues.includes(value)) {
		throw new Error(`Invalid ${label.toLowerCase()} selected.`);
	}
}

function validateIsoDate(value: string, label: string) {
	if (!value) return;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`${label} must be a valid date.`);
	}
}

// ---------------------------------------------------------------------------
// ProfileScreen — thin orchestrator
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
	const { user: clerkUser } = useUser();
	const { signOut } = useClerk();
	const { lock } = useAuthStore();

	const {
		patient,
		addresses,
		emergencyContacts,
		healthDeclarations,
		isLoading,
		refresh,
	} = usePatientProfile();

	// ---- Tab state ----
	const [activeTab, setActiveTab] = useState<ProfileTabId>("personal");

	// ---- Avatar picker state ----
	const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
	const [avatarUploading, setAvatarUploading] = useState(false);

	// ---- Edit modal state ----
	type ModalKey =
		| "basic"
		| "address_primary"
		| "address_secondary"
		| "ec_primary"
		| "ec_secondary"
		| { type: "health_add"; category: HealthDeclarationCategory }
		| null;
	const [activeModal, setActiveModal] = useState<ModalKey>(null);

	// ---- Forms ----
	const [basicForm, setBasicForm] = useState({
		firstName: "",
		middleName: "",
		lastName: "",
		suffix: "",
		sex: "",
		dob: "",
		civilStatus: "",
		bloodType: "",
		nationality: "Filipino",
		religion: "",
		philhealthId: "",
		email: "",
		phone: "",
	});
	const [addressForm, setAddressForm] = useState({
		houseStreet: "",
		barangay: "",
		cityMunicipality: "",
		province: "",
		region: "",
		zipCode: "",
		country: "Philippines",
	});
	const [ecForm, setEcForm] = useState({
		name: "",
		relationship: "",
		phone: "",
		email: "",
		address: "",
	});
	const [hdForm, setHdForm] = useState({
		description: "",
		detail: "",
		onsetDate: "",
		treatingPhysician: "",
		notes: "",
	});

	// ---- Open helpers ----
	function openBasicEdit() {
		setBasicForm({
			firstName: patient?.firstName ?? "",
			middleName: patient?.middleName ?? "",
			lastName: patient?.lastName ?? "",
			suffix: patient?.suffix ?? "",
			sex: patient?.sex ?? "",
			dob: patient?.dob ?? "",
			civilStatus: patient?.civilStatus ?? "",
			bloodType: patient?.bloodType ?? "",
			nationality: patient?.nationality ?? "Filipino",
			religion: patient?.religion ?? "",
			philhealthId: patient?.philhealthId ?? "",
			email:
				patient?.email ?? clerkUser?.primaryEmailAddress?.emailAddress ?? "",
			phone: patient?.phone ?? "",
		});
		setActiveModal("basic");
	}

	function openAddressEdit(type: "primary" | "secondary") {
		const addr = addresses.find((a) => a.type === type);
		setAddressForm({
			houseStreet: addr?.houseStreet ?? "",
			barangay: addr?.barangay ?? "",
			cityMunicipality: addr?.cityMunicipality ?? "",
			province: addr?.province ?? "",
			region: addr?.region ?? "",
			zipCode: addr?.zipCode ?? "",
			country: addr?.country ?? "Philippines",
		});
		setActiveModal(
			type === "primary" ? "address_primary" : "address_secondary",
		);
	}

	function openEcEdit(order: 1 | 2) {
		const ec = emergencyContacts.find((c) => c.sortOrder === order);
		setEcForm({
			name: ec?.name ?? "",
			relationship: ec?.relationship ?? "",
			phone: ec?.phone ?? "",
			email: ec?.email ?? "",
			address: ec?.address ?? "",
		});
		setActiveModal(order === 1 ? "ec_primary" : "ec_secondary");
	}

	function openHealthAdd(category: HealthDeclarationCategory) {
		setHdForm({
			description: "",
			detail: "",
			onsetDate: "",
			treatingPhysician: "",
			notes: "",
		});
		setActiveModal({ type: "health_add", category });
	}

	// ---- Save handlers ----
	async function saveBasicInfo() {
		if (!patient) return;
		validateSelectedValue(
			basicForm.sex,
			SEX_OPTIONS.map((o) => o.value),
			"Sex",
		);
		validateSelectedValue(
			basicForm.civilStatus,
			CIVIL_STATUS_OPTIONS.map((o) => o.value),
			"Civil Status",
		);
		validateSelectedValue(
			basicForm.bloodType,
			BLOOD_TYPE_OPTIONS.map((o) => o.value),
			"Blood Type",
		);
		validateIsoDate(basicForm.dob, "Date of Birth");
		await updatePatientBasicInfo(patient.id, {
			firstName: basicForm.firstName || undefined,
			middleName: basicForm.middleName || undefined,
			lastName: basicForm.lastName || undefined,
			suffix: basicForm.suffix || undefined,
			sex: (basicForm.sex as import("@/db/schema").Patient["sex"]) || undefined,
			dob: basicForm.dob || undefined,
			civilStatus:
				(basicForm.civilStatus as import("@/db/schema").Patient["civilStatus"]) ||
				undefined,
			bloodType:
				(basicForm.bloodType as import("@/db/schema").Patient["bloodType"]) ||
				undefined,
			nationality: basicForm.nationality || undefined,
			religion: basicForm.religion || undefined,
			philhealthId: basicForm.philhealthId || undefined,
			email: basicForm.email || undefined,
			phone: basicForm.phone || undefined,
		});
		await refresh();
	}

	async function saveAddress(type: "primary" | "secondary") {
		if (!patient) return;
		await upsertPatientAddress(patient.id, { type, ...addressForm });
		await refresh();
	}

	async function saveEmergencyContact(order: 1 | 2) {
		if (!patient || !ecForm.name || !ecForm.phone)
			throw new Error("Name and phone are required.");
		await upsertEmergencyContact(patient.id, {
			sortOrder: order,
			name: ecForm.name,
			relationship: ecForm.relationship || null,
			phone: ecForm.phone,
			email: ecForm.email || null,
			address: ecForm.address || null,
		});
		await refresh();
	}

	async function saveHealthDeclaration(category: HealthDeclarationCategory) {
		if (!patient || !hdForm.description)
			throw new Error("Description is required.");
		validateIsoDate(hdForm.onsetDate, "Onset Date");
		await upsertHealthDeclaration(patient.id, {
			category,
			description: hdForm.description,
			detail: hdForm.detail || null,
			onsetDate: hdForm.onsetDate || null,
			treatingPhysician: hdForm.treatingPhysician || null,
			notes: hdForm.notes || null,
			isActive: true,
		});
		await refresh();
	}

	async function handleDeleteDeclaration(id: string, patientId: string) {
		await deleteHealthDeclaration(id, patientId);
		await refresh();
	}

	// ---- Derived values ----
	const fullName = patient
		? [patient.firstName, patient.middleName, patient.lastName, patient.suffix]
				.filter(Boolean)
				.join(" ")
		: (clerkUser?.fullName ?? "—");
	const primaryAddress = addresses.find((a) => a.type === "primary");
	const secondaryAddress = addresses.find((a) => a.type === "secondary");
	const primaryEc = emergencyContacts.find((c) => c.sortOrder === 1);
	const secondaryEc = emergencyContacts.find((c) => c.sortOrder === 2);
	const avatarUri =
		patient?.avatarUrl ??
		clerkUser?.imageUrl ??
		`https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0a7ea4&color=fff`;

	if (isLoading) {
		return (
			<ThemedView className="flex-1 items-center justify-center">
				<ThemedText className="text-slate-400">Loading profile…</ThemedText>
			</ThemedView>
		);
	}

	return (
		<SafeAreaView edges={["left", "right", "bottom"]} className="flex-1">
			<ScrollView
				className="flex-1"
				contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
				showsVerticalScrollIndicator={false}
			>
				{/* ── Hero ── */}
				<ProfileHero
					avatarUri={avatarUri}
					fullName={fullName}
					bloodType={patient?.bloodType}
					sex={patient?.sex}
					dob={patient?.dob}
					civilStatus={patient?.civilStatus}
					philhealthId={patient?.philhealthId}
					avatarUploading={avatarUploading}
					onAvatarPress={() => setAvatarSheetVisible(true)}
				/>

				{/* ── Tab bar ── */}
				<ProfileTabBar active={activeTab} onChange={setActiveTab} />

				{/* ── Tab content ── */}
				{activeTab === "personal" && (
					<PersonalTab
						patient={patient}
						primaryAddress={primaryAddress}
						secondaryAddress={secondaryAddress}
						clerkEmail={clerkUser?.primaryEmailAddress?.emailAddress}
						onEditBasic={openBasicEdit}
						onEditPrimaryAddress={() => openAddressEdit("primary")}
						onEditSecondaryAddress={() => openAddressEdit("secondary")}
					/>
				)}

				{activeTab === "medical" && patient && (
					<MedicalTab
						declarations={healthDeclarations}
						patientId={patient.id}
						onAdd={openHealthAdd}
						onDelete={handleDeleteDeclaration}
					/>
				)}

				{activeTab === "emergency" && (
					<EmergencyTab
						primaryContact={primaryEc}
						secondaryContact={secondaryEc}
						onEditPrimary={() => openEcEdit(1)}
						onEditSecondary={() => openEcEdit(2)}
					/>
				)}

				{/* ── Sign out ── */}
				<TouchableOpacity
					style={{
						alignSelf: "center",
						marginTop: 24,
						marginBottom: 8,
						flexDirection: "row",
						alignItems: "center",
						gap: 8,
						borderWidth: 1,
						borderColor: "#e2e8f0",
						borderRadius: 14,
						paddingHorizontal: 28,
						paddingVertical: 12,
					}}
					onPress={async () => {
						await signOut();
						lock();
					}}
				>
					<Feather name="log-out" size={15} color="#64748b" />
					<ThemedText
						style={{ fontSize: 14, fontWeight: "600", color: "#64748b" }}
					>
						Log Out
					</ThemedText>
				</TouchableOpacity>
			</ScrollView>

			{/* ======== Avatar picker sheet ======== */}
			<AvatarPickerSheet
				visible={avatarSheetVisible}
				patientId={patient?.id}
				onSuccess={async (_newUri) => {
					setAvatarUploading(false);
					await refresh();
				}}
				onClose={() => setAvatarSheetVisible(false)}
			/>

			{/* ======== Edit modals ======== */}

			{activeModal === "basic" && (
				<EditModal
					title="Edit Basic Information"
					onClose={() => setActiveModal(null)}
					onSave={saveBasicInfo}
				>
					<FieldInput
						label="First Name"
						value={basicForm.firstName}
						onChange={(v) => setBasicForm((p) => ({ ...p, firstName: v }))}
					/>
					<FieldInput
						label="Middle Name"
						value={basicForm.middleName}
						onChange={(v) => setBasicForm((p) => ({ ...p, middleName: v }))}
					/>
					<FieldInput
						label="Last Name"
						value={basicForm.lastName}
						onChange={(v) => setBasicForm((p) => ({ ...p, lastName: v }))}
					/>
					<FieldInput
						label="Suffix (Jr., Sr., etc.)"
						value={basicForm.suffix}
						onChange={(v) => setBasicForm((p) => ({ ...p, suffix: v }))}
					/>
					<SelectInput
						label="Sex"
						value={basicForm.sex}
						options={SEX_OPTIONS}
						onChange={(v) => setBasicForm((p) => ({ ...p, sex: v }))}
						placeholder="Select sex"
					/>
					<DateTimeInput
						label="Date of Birth"
						value={basicForm.dob}
						onChange={(v) => setBasicForm((p) => ({ ...p, dob: v }))}
						placeholder="Select date of birth"
						maximumDate={new Date()}
					/>
					<SelectInput
						label="Civil Status"
						value={basicForm.civilStatus}
						options={CIVIL_STATUS_OPTIONS}
						onChange={(v) => setBasicForm((p) => ({ ...p, civilStatus: v }))}
						placeholder="Select civil status"
					/>
					<SelectInput
						label="Blood Type"
						value={basicForm.bloodType}
						options={BLOOD_TYPE_OPTIONS}
						onChange={(v) => setBasicForm((p) => ({ ...p, bloodType: v }))}
						placeholder="Select blood type"
					/>
					<FieldInput
						label="Nationality"
						value={basicForm.nationality}
						onChange={(v) => setBasicForm((p) => ({ ...p, nationality: v }))}
					/>
					<FieldInput
						label="Religion"
						value={basicForm.religion}
						onChange={(v) => setBasicForm((p) => ({ ...p, religion: v }))}
					/>
					<FieldInput
						label="PhilHealth ID"
						value={basicForm.philhealthId}
						onChange={(v) => setBasicForm((p) => ({ ...p, philhealthId: v }))}
					/>
					<FieldInput
						label="Email"
						value={basicForm.email}
						onChange={(v) => setBasicForm((p) => ({ ...p, email: v }))}
						keyboardType="email-address"
					/>
					<FieldInput
						label="Phone"
						value={basicForm.phone}
						onChange={(v) => setBasicForm((p) => ({ ...p, phone: v }))}
						keyboardType="phone-pad"
					/>
				</EditModal>
			)}

			{(activeModal === "address_primary" ||
				activeModal === "address_secondary") && (
				<EditModal
					title={
						activeModal === "address_primary"
							? "Edit Primary Address"
							: "Edit Secondary Address"
					}
					onClose={() => setActiveModal(null)}
					onSave={() =>
						saveAddress(
							activeModal === "address_primary" ? "primary" : "secondary",
						)
					}
				>
					<FieldInput
						label="House / Unit No., Building, Street"
						value={addressForm.houseStreet}
						onChange={(v) => setAddressForm((p) => ({ ...p, houseStreet: v }))}
					/>
					<FieldInput
						label="Barangay"
						value={addressForm.barangay}
						onChange={(v) => setAddressForm((p) => ({ ...p, barangay: v }))}
					/>
					<FieldInput
						label="City / Municipality"
						value={addressForm.cityMunicipality}
						onChange={(v) =>
							setAddressForm((p) => ({ ...p, cityMunicipality: v }))
						}
					/>
					<FieldInput
						label="Province"
						value={addressForm.province}
						onChange={(v) => setAddressForm((p) => ({ ...p, province: v }))}
					/>
					<FieldInput
						label="Region"
						value={addressForm.region}
						onChange={(v) => setAddressForm((p) => ({ ...p, region: v }))}
					/>
					<FieldInput
						label="ZIP Code"
						value={addressForm.zipCode}
						onChange={(v) => setAddressForm((p) => ({ ...p, zipCode: v }))}
						keyboardType="numeric"
					/>
					<FieldInput
						label="Country"
						value={addressForm.country}
						onChange={(v) => setAddressForm((p) => ({ ...p, country: v }))}
					/>
				</EditModal>
			)}

			{(activeModal === "ec_primary" || activeModal === "ec_secondary") && (
				<EditModal
					title={
						activeModal === "ec_primary"
							? "Primary Emergency Contact"
							: "Secondary Emergency Contact"
					}
					onClose={() => setActiveModal(null)}
					onSave={() =>
						saveEmergencyContact(activeModal === "ec_primary" ? 1 : 2)
					}
				>
					<FieldInput
						label="Full Name *"
						value={ecForm.name}
						onChange={(v) => setEcForm((p) => ({ ...p, name: v }))}
					/>
					<FieldInput
						label="Relationship"
						value={ecForm.relationship}
						onChange={(v) => setEcForm((p) => ({ ...p, relationship: v }))}
					/>
					<FieldInput
						label="Phone *"
						value={ecForm.phone}
						onChange={(v) => setEcForm((p) => ({ ...p, phone: v }))}
						keyboardType="phone-pad"
					/>
					<FieldInput
						label="Email"
						value={ecForm.email}
						onChange={(v) => setEcForm((p) => ({ ...p, email: v }))}
						keyboardType="email-address"
					/>
					<FieldInput
						label="Address"
						value={ecForm.address}
						onChange={(v) => setEcForm((p) => ({ ...p, address: v }))}
					/>
				</EditModal>
			)}

			{activeModal !== null &&
				typeof activeModal === "object" &&
				"category" in activeModal && (
					<EditModal
						title={`Add ${CATEGORY_LABELS[activeModal.category]}`}
						onClose={() => setActiveModal(null)}
						onSave={() => saveHealthDeclaration(activeModal.category)}
					>
						<FieldInput
							label="Description *"
							value={hdForm.description}
							onChange={(v) => setHdForm((p) => ({ ...p, description: v }))}
						/>
						<FieldInput
							label="Detail (e.g. reaction, dosage)"
							value={hdForm.detail}
							onChange={(v) => setHdForm((p) => ({ ...p, detail: v }))}
						/>
						<DateTimeInput
							label="Onset Date"
							value={hdForm.onsetDate}
							onChange={(v) => setHdForm((p) => ({ ...p, onsetDate: v }))}
							placeholder="Select onset date"
							maximumDate={new Date()}
						/>
						<FieldInput
							label="Treating Physician"
							value={hdForm.treatingPhysician}
							onChange={(v) =>
								setHdForm((p) => ({ ...p, treatingPhysician: v }))
							}
						/>
						<FieldInput
							label="Notes"
							value={hdForm.notes}
							onChange={(v) => setHdForm((p) => ({ ...p, notes: v }))}
						/>
					</EditModal>
				)}
		</SafeAreaView>
	);
}
