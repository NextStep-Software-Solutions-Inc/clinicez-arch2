import { useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuthStore } from "@/stores/authStore";

const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;

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
		setupPin,
		verifyPin,
		tryBiometrics,
		enableBiometrics,
		confirmBiometricsOffer,
	} = useAuthStore();

	const isSetupMode = status === "setup_pin";
	const isBiometricsOffer = status === "biometrics_offer";

	const [pin, setPin] = useState("");
	const [confirmPin, setConfirmPin] = useState("");
	const [confirmingPin, setConfirmingPin] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleBiometrics = useCallback(async () => {
		await tryBiometrics();
		// On success, authStore sets status → 'authenticated', layout transitions automatically
	}, [tryBiometrics]);

	// In verify mode, auto-prompt biometrics on mount if enabled
	useEffect(() => {
		if (status === "locked" && biometricsEnabled && biometricsAvailable) {
			handleBiometrics();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [status, handleBiometrics, biometricsEnabled, biometricsAvailable]);

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
					if (isValid) {
						// authStore sets status → 'authenticated', layout transitions automatically
					} else {
						const remaining = MAX_ATTEMPTS - (pinAttempts + 1);
						setError(
							remaining > 0
								? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
								: "Too many attempts. Please try again later.",
						);
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

	const currentLength = confirmingPin ? confirmPin.length : pin.length;

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

				{/* Bottom row: biometrics shortcut / 0 / delete */}
				<TouchableOpacity
					style={styles.key}
					onPress={
						status === "locked" && biometricsEnabled && biometricsAvailable
							? handleBiometrics
							: undefined
					}
				>
					{status === "locked" && biometricsEnabled && biometricsAvailable ? (
						<ThemedText style={styles.keyTextSmall}>
							{biometricType === "face" ? "Face" : "👆"}
						</ThemedText>
					) : (
						<View />
					)}
				</TouchableOpacity>

				<TouchableOpacity
					style={styles.key}
					onPress={() => handlePinInput("0")}
					disabled={currentLength >= PIN_LENGTH}
				>
					<ThemedText style={styles.keyText}>0</ThemedText>
				</TouchableOpacity>

				<TouchableOpacity style={styles.key} onPress={handleDelete}>
					<ThemedText style={styles.keyText}>⌫</ThemedText>
				</TouchableOpacity>
			</View>
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
});
