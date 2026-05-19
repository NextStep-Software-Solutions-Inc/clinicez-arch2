export type AppConfigIssue = {
	code: "MISSING_ENV";
	key: string;
	message: string;
};

const REQUIRED_ENV_VARS = [
	{
		key: "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
		label: "Clerk publishable key",
	},
] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_VARS)[number]["key"];

function readEnv(key: RequiredEnvKey): string | undefined {
	const envMap: Record<RequiredEnvKey, string | undefined> = {
		EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
			process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
	};
	return envMap[key];
}

export function getAppConfigIssues(): AppConfigIssue[] {
	return REQUIRED_ENV_VARS.flatMap(({ key, label }) => {
		const value = readEnv(key);
		if (value && value.trim().length > 0) {
			return [];
		}

		return [
			{
				code: "MISSING_ENV" as const,
				key,
				message: `${label} is required.`,
			},
		];
	});
}

export function getClerkPublishableKey(): string | null {
	const value = readEnv("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
	return value?.trim() ? value : null;
}
