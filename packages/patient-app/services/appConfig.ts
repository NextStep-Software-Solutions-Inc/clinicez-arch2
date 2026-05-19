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

function readEnv(key: string): string | undefined {
	return (process.env as Record<string, string | undefined>)[key];
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
