import { useClerk, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type React from "react";
import { useState } from "react";
import {
	Alert,
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
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
// Helpers
// ---------------------------------------------------------------------------

function LabeledValue({
	label,
	value,
}: {
	label: string;
	value?: string | null;
}) {
	return (
		<ThemedView className="mb-2 bg-transparent">
			<ThemedText className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
				{label}
			</ThemedText>
			<ThemedText className="text-base text-slate-800 dark:text-slate-200">
				{value || "—"}
			</ThemedText>
		</ThemedView>
	);
}

function SectionCard({
	title,
	onEdit,
	children,
}: {
	title: string;
	onEdit?: () => void;
	children: React.ReactNode;
}) {
	return (
		<ThemedView className="w-full rounded-2xl bg-white dark:bg-slate-800 shadow-sm mb-4 overflow-hidden">
			<ThemedView className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-transparent">
				<ThemedText className="text-base font-bold text-slate-800 dark:text-slate-100">
					{title}
				</ThemedText>
				{onEdit && (
					<TouchableOpacity onPress={onEdit} hitSlop={10}>
						<Feather name="edit-2" size={16} color={Colors.light.tint} />
					</TouchableOpacity>
				)}
			</ThemedView>
			<ThemedView className="px-4 py-3 bg-transparent">{children}</ThemedView>
		</ThemedView>
	);
}

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

type EditModalProps = {
	title: string;
	onClose: () => void;
	onSave: () => Promise<void>;
	children: React.ReactNode;
};

function EditModal({ title, onClose, onSave, children }: EditModalProps) {
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
							backgroundColor: "#2563eb",
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

const HEALTH_DECLARATION_CATEGORIES: HealthDeclarationCategory[] = [
	"allergy",
	"disability",
	"illness",
	"chronic_condition",
	"current_medication",
	"past_surgery",
	"family_history",
	"immunization",
	"lifestyle_habit",
];

// ---------------------------------------------------------------------------
// ProfileScreen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
	const { user: clerkUser } = useUser();
	const { signOut } = useClerk();
	const { lock } = useAuthStore();
	const router = useRouter();

	const {
		patient,
		addresses,
		emergencyContacts,
		healthDeclarations,
		isLoading,
		refresh,
	} = usePatientProfile();

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
		if (!patient || !ecForm.name || !ecForm.phone) {
			throw new Error("Name and phone are required.");
		}
		await upsertEmergencyContact(patient.id, {
			sortOrder: order,
			name: ecForm.name,
			relationship: ecForm.relationship || null,
			phone: ecForm.phone,
			email: ecForm.email || null,
		});
		await refresh();
	}

	async function saveHealthDeclaration(category: HealthDeclarationCategory) {
		if (!patient || !hdForm.description)
			throw new Error("Description is required.");
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
		`https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=2563eb&color=fff`;

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
				contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header */}
				<ThemedView className="flex-row justify-end pt-2 pb-1 bg-transparent">
					<TouchableOpacity
						onPress={() => router.push("/settings" as never)}
						hitSlop={12}
						className="p-2"
					>
						<Feather name="settings" size={20} color={Colors.light.tint} />
					</TouchableOpacity>
				</ThemedView>

				{/* Avatar + name */}
				<ThemedView className="items-center mb-6 bg-transparent">
					<View
						style={{
							shadowColor: Colors.light.tint,
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.3,
							shadowRadius: 12,
							elevation: 8,
							marginBottom: 12,
						}}
					>
						<Image
							source={{ uri: avatarUri }}
							style={{
								width: 100,
								height: 100,
								borderRadius: 50,
								borderWidth: 3,
								borderColor: Colors.light.tint,
								backgroundColor: "#e2e8f0",
							}}
						/>
					</View>
					<ThemedText className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
						{fullName}
					</ThemedText>
					<ThemedText className="text-sm text-slate-500 dark:text-slate-400">
						Patient
					</ThemedText>
					{patient?.philhealthId ? (
						<ThemedView className="mt-1 px-3 py-0.5 rounded-full bg-transparent">
							<ThemedText className="text-xs text-blue-600 dark:text-blue-300 font-medium">
								PhilHealth: {patient.philhealthId}
							</ThemedText>
						</ThemedView>
					) : null}
				</ThemedView>

				{/* Basic Information */}
				<SectionCard title="Basic Information" onEdit={openBasicEdit}>
					<LabeledValue label="First Name" value={patient?.firstName} />
					<LabeledValue label="Middle Name" value={patient?.middleName} />
					<LabeledValue label="Last Name" value={patient?.lastName} />
					<LabeledValue label="Suffix" value={patient?.suffix} />
					<LabeledValue label="Sex" value={patient?.sex} />
					<LabeledValue label="Date of Birth" value={patient?.dob} />
					<LabeledValue label="Civil Status" value={patient?.civilStatus} />
					<LabeledValue label="Blood Type" value={patient?.bloodType} />
					<LabeledValue label="Nationality" value={patient?.nationality} />
					<LabeledValue label="Religion" value={patient?.religion} />
					<LabeledValue
						label="Email"
						value={
							patient?.email ?? clerkUser?.primaryEmailAddress?.emailAddress
						}
					/>
					<LabeledValue label="Phone" value={patient?.phone} />
				</SectionCard>

				{/* Primary Address */}
				<SectionCard
					title="Primary Address"
					onEdit={() => openAddressEdit("primary")}
				>
					{primaryAddress ? (
						<>
							<LabeledValue
								label="House / Street"
								value={primaryAddress.houseStreet}
							/>
							<LabeledValue label="Barangay" value={primaryAddress.barangay} />
							<LabeledValue
								label="City / Municipality"
								value={primaryAddress.cityMunicipality}
							/>
							<LabeledValue label="Province" value={primaryAddress.province} />
							<LabeledValue label="Region" value={primaryAddress.region} />
							<LabeledValue label="ZIP Code" value={primaryAddress.zipCode} />
							<LabeledValue label="Country" value={primaryAddress.country} />
						</>
					) : (
						<ThemedText className="text-sm text-slate-400 dark:text-slate-500">
							No address on file. Tap edit to add.
						</ThemedText>
					)}
				</SectionCard>

				{/* Secondary Address */}
				<SectionCard
					title="Secondary Address"
					onEdit={() => openAddressEdit("secondary")}
				>
					{secondaryAddress ? (
						<>
							<LabeledValue
								label="House / Street"
								value={secondaryAddress.houseStreet}
							/>
							<LabeledValue
								label="Barangay"
								value={secondaryAddress.barangay}
							/>
							<LabeledValue
								label="City / Municipality"
								value={secondaryAddress.cityMunicipality}
							/>
							<LabeledValue
								label="Province"
								value={secondaryAddress.province}
							/>
							<LabeledValue label="Region" value={secondaryAddress.region} />
							<LabeledValue label="ZIP Code" value={secondaryAddress.zipCode} />
							<LabeledValue label="Country" value={secondaryAddress.country} />
						</>
					) : (
						<ThemedText className="text-sm text-slate-400 dark:text-slate-500">
							No secondary address. Tap edit to add.
						</ThemedText>
					)}
				</SectionCard>

				{/* Emergency Contacts */}
				<SectionCard title="Emergency Contacts">
					<ThemedView className="mb-3 bg-transparent">
						<ThemedView className="flex-row items-center justify-between mb-1 bg-transparent">
							<ThemedText className="text-sm font-semibold text-blue-600 dark:text-blue-400">
								Primary Contact
							</ThemedText>
							<TouchableOpacity onPress={() => openEcEdit(1)} hitSlop={10}>
								<Feather name="edit-2" size={14} color={Colors.light.tint} />
							</TouchableOpacity>
						</ThemedView>
						{primaryEc ? (
							<>
								<LabeledValue label="Name" value={primaryEc.name} />
								<LabeledValue
									label="Relationship"
									value={primaryEc.relationship}
								/>
								<LabeledValue label="Phone" value={primaryEc.phone} />
								<LabeledValue label="Email" value={primaryEc.email} />
							</>
						) : (
							<ThemedText className="text-sm text-slate-400 dark:text-slate-500">
								Not set. Tap edit to add.
							</ThemedText>
						)}
					</ThemedView>
					<ThemedView className="border-t border-slate-100 dark:border-slate-700 pt-3 bg-transparent">
						<ThemedView className="flex-row items-center justify-between mb-1 bg-transparent">
							<ThemedText className="text-sm font-semibold text-blue-600 dark:text-blue-400">
								Secondary Contact
							</ThemedText>
							<TouchableOpacity onPress={() => openEcEdit(2)} hitSlop={10}>
								<Feather name="edit-2" size={14} color={Colors.light.tint} />
							</TouchableOpacity>
						</ThemedView>
						{secondaryEc ? (
							<>
								<LabeledValue label="Name" value={secondaryEc.name} />
								<LabeledValue
									label="Relationship"
									value={secondaryEc.relationship}
								/>
								<LabeledValue label="Phone" value={secondaryEc.phone} />
								<LabeledValue label="Email" value={secondaryEc.email} />
							</>
						) : (
							<ThemedText className="text-sm text-slate-400 dark:text-slate-500">
								Not set. Tap edit to add.
							</ThemedText>
						)}
					</ThemedView>
				</SectionCard>

				{/* Health Declarations */}
				{HEALTH_DECLARATION_CATEGORIES.map((cat) => {
					const items = healthDeclarations.filter((d) => d.category === cat);
					return (
						<SectionCard key={cat} title={CATEGORY_LABELS[cat]}>
							{items.length === 0 ? (
								<ThemedText className="text-sm text-slate-400 dark:text-slate-500">
									None declared.
								</ThemedText>
							) : (
								items.map((item) => (
									<ThemedView
										key={item.id}
										className="mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50"
									>
										<ThemedView className="flex-row items-start justify-between bg-transparent">
											<ThemedText className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex-1 mr-2">
												{item.description}
											</ThemedText>
											<TouchableOpacity
												hitSlop={10}
												onPress={() =>
													Alert.alert(
														"Remove",
														`Remove "${item.description}"?`,
														[
															{ text: "Cancel", style: "cancel" },
															{
																text: "Remove",
																style: "destructive",
																onPress: async () => {
																	if (!patient) return;
																	await deleteHealthDeclaration(
																		item.id,
																		patient.id,
																	);
																	await refresh();
																},
															},
														],
													)
												}
											>
												<Feather name="trash-2" size={14} color="#ef4444" />
											</TouchableOpacity>
										</ThemedView>
										{item.detail ? (
											<ThemedText className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
												{item.detail}
											</ThemedText>
										) : null}
										{item.onsetDate ? (
											<ThemedText className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
												Since {item.onsetDate}
											</ThemedText>
										) : null}
										{item.treatingPhysician ? (
											<ThemedText className="text-xs text-slate-400 dark:text-slate-500">
												{item.treatingPhysician}
											</ThemedText>
										) : null}
										{item.notes ? (
											<ThemedText className="text-xs text-slate-400 dark:text-slate-500 italic mt-0.5">
												{item.notes}
											</ThemedText>
										) : null}
									</ThemedView>
								))
							)}
							<TouchableOpacity
								onPress={() => openHealthAdd(cat)}
								className="flex-row items-center mt-1"
							>
								<Feather
									name="plus-circle"
									size={15}
									color={Colors.light.tint}
								/>
								<ThemedText className="text-sm text-blue-600 dark:text-blue-400 ml-1">
									Add {CATEGORY_LABELS[cat]}
								</ThemedText>
							</TouchableOpacity>
						</SectionCard>
					);
				})}

				{/* Sign out */}
				<TouchableOpacity
					className="self-center mt-4 mb-2 border border-slate-300 dark:border-slate-600 rounded-xl px-8 py-3"
					onPress={async () => {
						await signOut();
						lock();
					}}
				>
					<ThemedText className="text-slate-600 dark:text-slate-300 font-semibold">
						Log Out
					</ThemedText>
				</TouchableOpacity>
			</ScrollView>

			{/* ======== MODALS ======== */}

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
					<FieldInput
						label="Sex (Male / Female / Other)"
						value={basicForm.sex}
						onChange={(v) => setBasicForm((p) => ({ ...p, sex: v }))}
					/>
					<FieldInput
						label="Date of Birth (YYYY-MM-DD)"
						value={basicForm.dob}
						onChange={(v) => setBasicForm((p) => ({ ...p, dob: v }))}
					/>
					<FieldInput
						label="Civil Status"
						value={basicForm.civilStatus}
						onChange={(v) => setBasicForm((p) => ({ ...p, civilStatus: v }))}
					/>
					<FieldInput
						label="Blood Type"
						value={basicForm.bloodType}
						onChange={(v) => setBasicForm((p) => ({ ...p, bloodType: v }))}
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
						<FieldInput
							label="Onset Date (YYYY-MM-DD)"
							value={hdForm.onsetDate}
							onChange={(v) => setHdForm((p) => ({ ...p, onsetDate: v }))}
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
