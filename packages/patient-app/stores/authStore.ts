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

export type UserIdentity = {
	clerkId: string;
	name: string | null;
	email: string | null;
	avatarUrl: string | null;
};

export const MAX_PIN_ATTEMPTS = 5;
const COOLDOWN_BASE_MS = 30_000; // 30 s base
const MAX_COOLDOWN_MS = 3_600_000; // 1 h cap

type AuthState = {
	status: AuthStatus;
	biometricsEnabled: boolean;
	biometricsAvailable: boolean;
	biometricType: string | null;
	pinAttempts: number;
	lockoutUntil: number | null;
	userIdentity: UserIdentity | null;

	// Actions
	bootstrap: () => Promise<void>;
	setupPin: (pin: string) => Promise<void>;
	verifyPin: (pin: string) => Promise<boolean>;
	clearLockout: () => Promise<void>;
	tryBiometrics: () => Promise<boolean>;
	enableBiometrics: () => Promise<void>;
	disableBiometrics: () => Promise<void>;
	confirmBiometricsOffer: () => void;
	lock: () => void;
	completeOnboarding: () => Promise<void>;
	storeUserIdentity: (identity: UserIdentity) => Promise<void>;
	signOut: (clerkSignOut: () => Promise<void>) => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
	status: "loading",
	biometricsEnabled: false,
	biometricsAvailable: false,
	biometricType: null,
	pinAttempts: 0,
	lockoutUntil: null,
	userIdentity: null,

	bootstrap: async () => {
		audit.debug("AUTH", "BOOTSTRAP_START");

		const [
			onboarded,
			biometricsEnabled,
			debugAlwaysOnboard,
			identityJson,
			lockoutUntilStr,
			pinAttemptsStr,
		] = await Promise.all([
			secureGet(StorageKey.ONBOARDED),
			secureGet(StorageKey.BIOMETRICS_ENABLED),
			secureGet(StorageKey.DEBUG_ALWAYS_ONBOARD),
			secureGet(StorageKey.USER_IDENTITY),
			secureGet(StorageKey.LOCKOUT_UNTIL),
			secureGet(StorageKey.PIN_ATTEMPTS),
		]);
		const userIdentity: UserIdentity | null = identityJson
			? (JSON.parse(identityJson) as UserIdentity)
			: null;
		const restoredLockoutUntil = lockoutUntilStr
			? Number(lockoutUntilStr)
			: null;
		const restoredPinAttempts = pinAttemptsStr ? Number(pinAttemptsStr) : 0;

		if (debugAlwaysOnboard === "true") {
			audit.debug("AUTH", "DEBUG_ALWAYS_ONBOARD_ACTIVE");
			set({ status: "onboarding" });
			return;
		}

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
			userIdentity,
			// Restore lockout only if it hasn't already expired
			lockoutUntil:
				restoredLockoutUntil && restoredLockoutUntil > Date.now()
					? restoredLockoutUntil
					: null,
			pinAttempts: restoredPinAttempts,
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
		// Defensive guard — UI should block input during lockout
		const { lockoutUntil } = get();
		if (lockoutUntil && Date.now() < lockoutUntil) return false;

		const attempts = get().pinAttempts + 1;
		const isValid = await verifyPinService(pin, attempts);

		if (isValid) {
			await Promise.all([
				secureDel(StorageKey.LOCKOUT_UNTIL),
				secureDel(StorageKey.PIN_ATTEMPTS),
			]);
			set({ status: "authenticated", pinAttempts: 0, lockoutUntil: null });
		} else {
			await secureSet(StorageKey.PIN_ATTEMPTS, String(attempts));
			if (attempts >= MAX_PIN_ATTEMPTS) {
				const lockoutN = attempts - MAX_PIN_ATTEMPTS + 1;
				const cooldownMs = Math.min(
					COOLDOWN_BASE_MS * 2 ** (lockoutN - 1),
					MAX_COOLDOWN_MS,
				);
				const newLockoutUntil = Date.now() + cooldownMs;
				await secureSet(StorageKey.LOCKOUT_UNTIL, String(newLockoutUntil));
				set({ pinAttempts: attempts, lockoutUntil: newLockoutUntil });
			} else {
				set({ pinAttempts: attempts });
			}
		}

		return isValid;
	},

	clearLockout: async () => {
		await secureDel(StorageKey.LOCKOUT_UNTIL);
		set({ lockoutUntil: null });
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
		set({ status: "locked" });
	},

	completeOnboarding: async () => {
		await secureSet(StorageKey.ONBOARDED, "true");
		set({ status: "setup_pin" });
	},

	storeUserIdentity: async (identity: UserIdentity) => {
		await secureSet(StorageKey.USER_IDENTITY, JSON.stringify(identity));
		set({ userIdentity: identity });
	},

	signOut: async (clerkSignOut: () => Promise<void>) => {
		try {
			await clerkSignOut();
		} catch (error) {
			audit.warn("AUTH", "CLERK_SIGNOUT_FAILED", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
		await Promise.all([
			secureDel(StorageKey.ONBOARDED),
			secureDel(StorageKey.USER_IDENTITY),
			secureDel(StorageKey.PIN_HASH),
			secureDel(StorageKey.PIN_SALT),
			secureDel(StorageKey.BIOMETRICS_ENABLED),
			secureDel(StorageKey.LOCKOUT_UNTIL),
			secureDel(StorageKey.PIN_ATTEMPTS),
		]);
		audit.info("AUTH", "USER_SIGNED_OUT");
		set({
			status: "onboarding",
			userIdentity: null,
			biometricsEnabled: false,
			biometricsAvailable: false,
			pinAttempts: 0,
			lockoutUntil: null,
		});
	},
}));
