import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { MAX_PIN_ATTEMPTS, useAuthStore } from "@/stores/authStore";

const PIN_LENGTH = 6;

function formatCountdown(seconds: number): string {
	if (seconds >= 3600) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Unified PIN screen.
 *
 * Rendered directly by the root layout — no router.replace needed.
 * Auth status transitions (setup_pin → biometrics_offer → authenticated,
 * or locked → authenticated) are handled entirely through authStore,
 * which causes _layout.tsx to re-render and show the appropriate screen.
 */
export default function PinScreen() {
	const {
		status,
		biometricsEnabled,
		biometricsAvailable,
		biometricType,
		pinAttempts,
		lockoutUntil,
		userIdentity,
		setupPin,
		verifyPin,
		clearLockout,
		tryBiometrics,
		enableBiometrics,
		confirmBiometricsOffer,
		signOut,
	} = useAuthStore();
	const { signOut: clerkSignOut } = useAuth();

	const isSetupMode = status === "setup_pin";
	const isBiometricsOffer = status === "biometrics_offer";

	const [pin, setPin] = useState("");
	const [confirmPin, setConfirmPin] = useState("");
	const [confirmingPin, setConfirmingPin] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [remainingSeconds, setRemainingSeconds] = useState(0);
	// When biometrics is enabled, show the biometric unlock screen first.
	// The user can opt into the PIN keypad via "Use PIN instead".
	const [showPinFallback, setShowPinFallback] = useState(false);
	// For PIN-only users, show a lock screen before the PIN keypad.
	const [pinEntryActive, setPinEntryActive] = useState(false);

	const handleBiometrics = useCallback(async () => {
		await tryBiometrics();
		// On success, authStore sets status → 'authenticated', layout transitions automatically
	}, [tryBiometrics]);

	// Countdown timer for exponential lockout
	useEffect(() => {
		if (!lockoutUntil) return;
		const tick = () => {
			const secs = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
			setRemainingSeconds(secs);
			if (secs === 0) clearLockout();
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [lockoutUntil, clearLockout]);

	// In verify mode, auto-prompt biometrics on mount if enabled and not in PIN fallback
	useEffect(() => {
		if (
			status === "locked" &&
			biometricsEnabled &&
			biometricsAvailable &&
			!showPinFallback
		) {
			handleBiometrics();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		status,
		handleBiometrics,
		biometricsEnabled,
		biometricsAvailable,
		showPinFallback,
	]);

	// In PIN-only lock mode, show PIN entry immediately when the app is locked.
	useEffect(() => {
		if (status === "locked" && (!biometricsEnabled || !biometricsAvailable)) {
			setPinEntryActive(true);
		}
	}, [status, biometricsEnabled, biometricsAvailable]);

	const handlePinInput = useCallback(
		async (digit: string) => {
			setError(null);

			if (isSetupMode) {
				if (!confirmingPin) {
					const next = pin + digit;
					setPin(next);
					if (next.length === PIN_LENGTH) {
						setConfirmingPin(true);
					}
				} else {
					const next = confirmPin + digit;
					setConfirmPin(next);
					if (next.length === PIN_LENGTH) {
						if (next === pin) {
							await setupPin(pin);
							// authStore decides next status (biometrics_offer or authenticated)
						} else {
							setError("PINs do not match. Please try again.");
							setPin("");
							setConfirmPin("");
							setConfirmingPin(false);
						}
					}
				}
			} else {
				// locked / verify mode
				const next = pin + digit;
				setPin(next);
				if (next.length === PIN_LENGTH) {
					const isValid = await verifyPin(next);
					if (!isValid) {
						const newAttempts = pinAttempts + 1;
						// Only show inline error before lockout kicks in
						if (newAttempts < MAX_PIN_ATTEMPTS) {
							const remaining = MAX_PIN_ATTEMPTS - newAttempts;
							setError(
								`Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
							);
						}
						// Lockout screen takes over for >= MAX_PIN_ATTEMPTS
						setPin("");
					}
				}
			}
		},
		[
			isSetupMode,
			pin,
			confirmPin,
			confirmingPin,
			setupPin,
			verifyPin,
			pinAttempts,
		],
	);

	const handleDelete = useCallback(() => {
		setError(null);
		if (confirmingPin) {
			setConfirmPin((p) => p.slice(0, -1));
		} else {
			setPin((p) => p.slice(0, -1));
		}
	}, [confirmingPin]);

	// Navigate back to the lock screen, clearing all PIN state
	const handlePinBack = useCallback(() => {
		setPin("");
		setConfirmPin("");
		setConfirmingPin(false);
		setError(null);
		setPinEntryActive(false);
		setShowPinFallback(false);
	}, []);

	const handleSignOut = useCallback(async () => {
		await signOut(clerkSignOut);
	}, [signOut, clerkSignOut]);

	const currentLength = confirmingPin ? confirmPin.length : pin.length;

	// -------------------------------------------------------------------------
	// Lockout screen — shown when too many wrong attempts have been made
	// -------------------------------------------------------------------------
	if (status === "locked" && lockoutUntil && remainingSeconds > 0) {
		const retryAt = new Date(lockoutUntil).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
		return (
			<ThemedView style={styles.container}>
				<View style={styles.lockoutIconWrap}>
					<Feather name="alert-circle" size={48} color="#e53e3e" />
				</View>
				<ThemedText style={styles.title}>Too Many Attempts</ThemedText>
				<ThemedText style={styles.subtitle}>
					Too many incorrect PINs.
				</ThemedText>
				<ThemedText style={styles.countdownText}>
					{formatCountdown(remainingSeconds)}
				</ThemedText>
				<ThemedText style={styles.retryAtText}>
					Retry available at {retryAt}
				</ThemedText>
				<TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
					<Feather name="log-out" size={14} color="#e53e3e" />
					<ThemedText style={styles.signOutText}>Sign out</ThemedText>
				</TouchableOpacity>
			</ThemedView>
		);
	}

	// -------------------------------------------------------------------------
	// Biometrics unlock screen (shown when app is locked and biometrics is set up)
	// -------------------------------------------------------------------------
	if (
		status === "locked" &&
		biometricsEnabled &&
		biometricsAvailable &&
		!showPinFallback
	) {
		const typeLabel = biometricType === "face" ? "Face ID" : "Fingerprint";
		const displayName = userIdentity?.name ?? "";
		const avatarUrl = userIdentity?.avatarUrl ?? null;
		const initials = displayName
			.split(" ")
			.map((w) => w[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
		return (
			<ThemedView style={styles.container}>
				{/* Avatar */}
				{avatarUrl ? (
					<Image source={{ uri: avatarUrl }} style={styles.avatar} />
				) : (
					<View style={styles.avatarFallback}>
						<ThemedText style={styles.avatarInitials}>
							{initials || "👤"}
						</ThemedText>
					</View>
				)}

				{/* Name */}
				{displayName ? (
					<ThemedText style={styles.identityName}>{displayName}</ThemedText>
				) : null}

				{/* Instruction */}
				<ThemedText style={styles.identityLabel}>
					{displayName
						? `Use ${typeLabel} to sign in as ${displayName}`
						: `Use ${typeLabel} to sign in`}
				</ThemedText>

				<TouchableOpacity
					style={[styles.primaryButton, styles.rowCenter]}
					onPress={handleBiometrics}
				>
					<Feather
						name={biometricType === "face" ? "aperture" : "activity"}
						size={18}
						color="#fff"
					/>
					<ThemedText style={[styles.primaryButtonText, styles.iconGap]}>
						Authenticate
					</ThemedText>
				</TouchableOpacity>
				<TouchableOpacity
					style={styles.secondaryButton}
					onPress={() => setShowPinFallback(true)}
				>
					<ThemedText style={styles.secondaryButtonText}>
						Use PIN instead
					</ThemedText>
				</TouchableOpacity>
				<TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
					<Feather name="log-out" size={14} color="#e53e3e" />
					<ThemedText style={styles.signOutText}>Sign out</ThemedText>
				</TouchableOpacity>
			</ThemedView>
		);
	}

	// -------------------------------------------------------------------------
	// PIN lock screen — shown when locked without biometrics (PIN-only path)
	// The keypad only appears after the user explicitly taps "Enter PIN to unlock".
	// Note: when showPinFallback is true the user already tapped "Use PIN instead"
	// from the biometrics screen, so skip directly to the keypad.
	// -------------------------------------------------------------------------
	if (status === "locked" && !pinEntryActive && !showPinFallback) {
		const displayName = userIdentity?.name ?? "";
		const avatarUrl = userIdentity?.avatarUrl ?? null;
		const initials = displayName
			.split(" ")
			.map((w) => w[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
		return (
			<ThemedView style={styles.container}>
				{avatarUrl ? (
					<Image source={{ uri: avatarUrl }} style={styles.avatar} />
				) : (
					<View style={styles.avatarFallback}>
						<ThemedText style={styles.avatarInitials}>
							{initials || "👤"}
						</ThemedText>
					</View>
				)}
				{displayName ? (
					<ThemedText style={styles.identityName}>{displayName}</ThemedText>
				) : null}
				<ThemedText style={styles.identityLabel}>ClinicEZ is locked</ThemedText>
				<TouchableOpacity
					style={styles.primaryButton}
					onPress={() => setPinEntryActive(true)}
				>
					<ThemedText style={styles.primaryButtonText}>
						Enter PIN to unlock
					</ThemedText>
				</TouchableOpacity>
				<TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
					<Feather name="log-out" size={14} color="#e53e3e" />
					<ThemedText style={styles.signOutText}>Sign out</ThemedText>
				</TouchableOpacity>
			</ThemedView>
		);
	}

	// -------------------------------------------------------------------------
	// Biometrics offer screen (shown after PIN is set up)
	// -------------------------------------------------------------------------
	if (isBiometricsOffer) {
		const typeLabel = biometricType === "face" ? "Face ID" : "Fingerprint";
		return (
			<ThemedView style={styles.container}>
				<ThemedText style={styles.title}>Enable {typeLabel}?</ThemedText>
				<ThemedText style={styles.subtitle}>
					Use {typeLabel} to unlock ClinicEZ faster instead of your PIN.
				</ThemedText>
				<TouchableOpacity
					style={styles.primaryButton}
					onPress={async () => {
						await enableBiometrics();
						confirmBiometricsOffer(); // → sets status to 'authenticated'
					}}
				>
					<ThemedText style={styles.primaryButtonText}>
						Enable {typeLabel}
					</ThemedText>
				</TouchableOpacity>
				<TouchableOpacity
					style={styles.secondaryButton}
					onPress={confirmBiometricsOffer}
				>
					<ThemedText style={styles.secondaryButtonText}>
						Skip for now
					</ThemedText>
				</TouchableOpacity>
			</ThemedView>
		);
	}

	// -------------------------------------------------------------------------
	// PIN entry / setup screen
	// -------------------------------------------------------------------------
	const title = isSetupMode
		? confirmingPin
			? "Confirm your PIN"
			: "Create a PIN"
		: "Enter your PIN";

	const subtitle = isSetupMode
		? confirmingPin
			? "Re-enter your 6-digit PIN to confirm"
			: "Choose a 6-digit PIN to secure your account"
		: "Enter your PIN to unlock ClinicEZ";

	return (
		<ThemedView style={styles.container}>
			{/* Back button — only shown in verify (locked) mode, not during PIN setup */}
			{status === "locked" && (
				<TouchableOpacity style={styles.backButton} onPress={handlePinBack}>
					<Feather name="arrow-left" size={20} color="#0a7ea4" />
				</TouchableOpacity>
			)}
			<ThemedText style={styles.title}>{title}</ThemedText>
			<ThemedText style={styles.subtitle}>{subtitle}</ThemedText>

			{/* PIN dot indicators */}
			<View style={styles.dotsRow}>
				{Array.from({ length: PIN_LENGTH }, (_, i) => ({
					position: i + 1,
				})).map((dot) => (
					<View
						key={`dot-${dot.position}`}
						style={[
							styles.dot,
							dot.position - 1 < currentLength && styles.dotFilled,
						]}
					/>
				))}
			</View>

			{error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

			{/* Numeric keypad */}
			<View style={styles.keypad}>
				{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
					<TouchableOpacity
						key={d}
						style={styles.key}
						onPress={() => handlePinInput(d)}
						disabled={currentLength >= PIN_LENGTH}
					>
						<ThemedText style={styles.keyText}>{d}</ThemedText>
					</TouchableOpacity>
				))}

				{/* Bottom row: empty spacer / 0 / delete */}
				<View style={styles.key} />

				<TouchableOpacity
					style={styles.key}
					onPress={() => handlePinInput("0")}
					disabled={currentLength >= PIN_LENGTH}
				>
					<ThemedText style={styles.keyText}>0</ThemedText>
				</TouchableOpacity>

				<TouchableOpacity style={styles.key} onPress={handleDelete}>
					<Feather name="delete" size={22} color="#0a7ea4" />
				</TouchableOpacity>
			</View>

			{/* Biometrics option — visible whenever the device supports it */}
			{status === "locked" && biometricsAvailable && biometricsEnabled && (
				<TouchableOpacity
					style={styles.biometricButton}
					onPress={handleBiometrics}
				>
					<Feather
						name={biometricType === "face" ? "aperture" : "shield"}
						size={18}
						color="#0a7ea4"
					/>
					<ThemedText style={styles.biometricButtonText}>
						Use {biometricType === "face" ? "Face ID" : "Fingerprint"} instead
					</ThemedText>
				</TouchableOpacity>
			)}
		</ThemedView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
	},
	title: {
		fontSize: 26,
		fontWeight: "700",
		marginBottom: 8,
		textAlign: "center",
	},
	subtitle: {
		fontSize: 15,
		opacity: 0.6,
		marginBottom: 40,
		textAlign: "center",
	},
	dotsRow: {
		flexDirection: "row",
		gap: 16,
		marginBottom: 24,
	},
	dot: {
		width: 16,
		height: 16,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: "#0a7ea4",
		backgroundColor: "transparent",
	},
	dotFilled: {
		backgroundColor: "#0a7ea4",
	},
	errorText: {
		color: "#e53e3e",
		fontSize: 14,
		marginBottom: 16,
		textAlign: "center",
	},
	keypad: {
		flexDirection: "row",
		flexWrap: "wrap",
		width: 280,
		gap: 12,
		marginTop: 8,
	},
	key: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: "rgba(10,126,164,0.08)",
		alignItems: "center",
		justifyContent: "center",
	},
	keyText: {
		fontSize: 24,
		fontWeight: "600",
	},
	keyTextSmall: {
		fontSize: 16,
		fontWeight: "600",
	},
	biometricButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 24,
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: "#0a7ea4",
	},
	biometricButtonText: {
		fontSize: 15,
		color: "#0a7ea4",
		fontWeight: "600",
	},
	primaryButton: {
		backgroundColor: "#0a7ea4",
		paddingVertical: 16,
		paddingHorizontal: 40,
		borderRadius: 12,
		marginTop: 24,
		width: "100%",
		alignItems: "center",
	},
	primaryButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
	secondaryButton: {
		marginTop: 16,
		paddingVertical: 12,
		alignItems: "center",
	},
	secondaryButtonText: {
		fontSize: 15,
		opacity: 0.6,
	},
	backButton: {
		position: "absolute",
		top: 52,
		left: 24,
		padding: 8,
	},
	signOutButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 32,
		paddingVertical: 10,
	},
	signOutText: {
		fontSize: 14,
		color: "#e53e3e",
		opacity: 0.85,
	},
	avatar: {
		width: 96,
		height: 96,
		borderRadius: 48,
		marginBottom: 20,
		borderWidth: 3,
		borderColor: "#0a7ea4",
	},
	avatarFallback: {
		width: 96,
		height: 96,
		borderRadius: 48,
		marginBottom: 20,
		backgroundColor: "#0a7ea4",
		alignItems: "center",
		justifyContent: "center",
	},
	avatarInitials: {
		fontSize: 34,
		fontWeight: "700",
		color: "#fff",
	},
	identityName: {
		fontSize: 22,
		fontWeight: "700",
		marginBottom: 6,
		textAlign: "center",
	},
	identityLabel: {
		fontSize: 15,
		opacity: 0.6,
		marginBottom: 32,
		textAlign: "center",
	},
	lockoutIconWrap: {
		marginBottom: 20,
	},
	countdownText: {
		fontSize: 48,
		fontWeight: "800",
		color: "#e53e3e",
		marginTop: 4,
		marginBottom: 4,
		letterSpacing: 2,
	},
	retryAtText: {
		fontSize: 13,
		opacity: 0.55,
		marginBottom: 8,
	},
	rowCenter: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	iconGap: {
		marginLeft: 8,
	},
});
