import { create } from "zustand";
import { audit } from "../services/auditLogger";
import {
	authenticateWithBiometrics,
	checkBiometricsAvailability,
	createPin,
	hasPinSet,
	verifyPin as verifyPinService,
} from "../services/authService";
import {
	StorageKey,
	secureDel,
	secureGet,
	secureSet,
} from "../services/secureStorage";

export type AuthStatus =
	| "loading"
	| "onboarding"
	| "setup_pin"
	| "biometrics_offer"
	| "locked"
	| "authenticated";

type AuthState = {
	status: AuthStatus;
	biometricsEnabled: boolean;
	biometricsAvailable: boolean;
	biometricType: string | null;
	pinAttempts: number;

	// Actions
	bootstrap: () => Promise<void>;
	setupPin: (pin: string) => Promise<void>;
	verifyPin: (pin: string) => Promise<boolean>;
	tryBiometrics: () => Promise<boolean>;
	enableBiometrics: () => Promise<void>;
	disableBiometrics: () => Promise<void>;
	confirmBiometricsOffer: () => void;
	lock: () => void;
	completeOnboarding: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
	status: "loading",
	biometricsEnabled: false,
	biometricsAvailable: false,
	biometricType: null,
	pinAttempts: 0,

	bootstrap: async () => {
		audit.debug("AUTH", "BOOTSTRAP_START");

		const [onboarded, biometricsEnabled] = await Promise.all([
			secureGet(StorageKey.ONBOARDED),
			secureGet(StorageKey.BIOMETRICS_ENABLED),
		]);

		const pinExists = await hasPinSet();

		const biometrics = await checkBiometricsAvailability();

		let status: AuthStatus;
		if (onboarded !== "true") {
			status = "onboarding";
		} else if (!pinExists) {
			status = "setup_pin";
		} else {
			status = "locked";
		}

		set({
			status,
			biometricsEnabled: biometricsEnabled === "true",
			biometricsAvailable: biometrics.available && biometrics.enrolled,
			biometricType: biometrics.type,
		});

		audit.info("AUTH", "BOOTSTRAP_COMPLETE", { status });
	},

	setupPin: async (pin: string) => {
		await createPin(pin);
		const { biometricsAvailable } = get();
		set({
			status: biometricsAvailable ? "biometrics_offer" : "authenticated",
			pinAttempts: 0,
		});
	},

	verifyPin: async (pin: string) => {
		const attempts = get().pinAttempts + 1;
		const isValid = await verifyPinService(pin, attempts);

		if (isValid) {
			set({ status: "authenticated", pinAttempts: 0 });
		} else {
			set({ pinAttempts: attempts });
		}

		return isValid;
	},

	tryBiometrics: async () => {
		const success = await authenticateWithBiometrics();
		if (success) {
			set({ status: "authenticated", pinAttempts: 0 });
		}
		return success;
	},

	enableBiometrics: async () => {
		await secureSet(StorageKey.BIOMETRICS_ENABLED, "true");
		set({ biometricsEnabled: true });
	},

	disableBiometrics: async () => {
		await secureDel(StorageKey.BIOMETRICS_ENABLED);
		set({ biometricsEnabled: false });
	},

	confirmBiometricsOffer: () => {
		set({ status: "authenticated" });
	},

	lock: () => {
		audit.info("AUTH", "SESSION_LOCKED");
		set({ status: "locked", pinAttempts: 0 });
	},

	completeOnboarding: async () => {
		await secureSet(StorageKey.ONBOARDED, "true");
		set({ status: "setup_pin" });
	},
}));
