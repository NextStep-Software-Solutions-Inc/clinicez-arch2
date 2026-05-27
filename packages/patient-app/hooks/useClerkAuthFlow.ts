import { useSignIn, useSignUp } from "@clerk/expo";
import { useState } from "react";

type ClerkError = { longMessage?: string | null; message?: string | null };
type Step =
	| "form"
	| "verify"
	| "forgotPassword"
	| "resetPassword"
	| "codeVerified"
	| "enterNewPassword";
type Mode = "signUp" | "signIn";

export function useClerkAuthFlow(
	onSuccess: () => void,
	initialMode: Mode = "signUp",
) {
	const { signUp } = useSignUp();
	const { signIn } = useSignIn();

	const [mode, setMode] = useState<Mode>(initialMode);
	const [step, setStep] = useState<Step>("form");
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const switchMode = (next: Mode) => {
		setMode(next);
		setStep("form");
		setErrorMsg(null);
	};

	const resetError = () => setErrorMsg(null);

	// ── Sign-up ───────────────────────────────────────────────────────────────
	const handleSignUp = async (
		email: string,
		password: string,
		firstName?: string,
	) => {
		if (!signUp) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signUp.password({
				emailAddress: email,
				password,
				firstName: firstName || undefined,
			});
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			const { error: sendError } = await signUp.verifications.sendEmailCode();
			if (sendError) {
				setErrorMsg(clerkMsg(sendError));
				return;
			}
			setStep("verify");
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	};

	const handleVerifySignUp = async (verifyCode: string) => {
		if (!signUp) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signUp.verifications.verifyEmailCode({
				code: verifyCode,
			});
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			if (signUp.status === "complete") {
				const { error: finalError } = await signUp.finalize({
					navigate: onSuccess,
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else {
				setErrorMsg("Verification incomplete. Please try again.");
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	};

	// ── Sign-in ───────────────────────────────────────────────────────────────
	const handleSignIn = async (email: string, password: string) => {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signIn.password({ identifier: email, password });
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			if (signIn.status === "complete") {
				const { error: finalError } = await signIn.finalize({
					navigate: onSuccess,
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else if (signIn.status === "needs_second_factor") {
				const { error: mfaError } = await signIn.mfa.sendEmailCode();
				if (mfaError) {
					setErrorMsg(clerkMsg(mfaError));
					return;
				}
				setStep("verify");
			} else {
				setErrorMsg(
					"Sign-in requires additional verification. Please try again.",
				);
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	};

	const handleVerifySignIn = async (verifyCode: string) => {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signIn.mfa.verifyEmailCode({ code: verifyCode });
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			if (signIn.status === "complete") {
				const { error: finalError } = await signIn.finalize({
					navigate: onSuccess,
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else {
				setErrorMsg("Invalid code. Please try again.");
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	};

	// ── Forgot / reset password ───────────────────────────────────────────────
	const handleForgotPassword = async (email: string) => {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error: createError } = await signIn.create({ identifier: email });
			if (createError) {
				setErrorMsg(clerkMsg(createError));
				return;
			}
			const { error: sendError } =
				await signIn.resetPasswordEmailCode.sendCode();
			if (sendError) {
				setErrorMsg(clerkMsg(sendError));
				return;
			}
			setStep("resetPassword");
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	};

	const handleVerifyResetCode = async (verifyCode: string) => {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signIn.resetPasswordEmailCode.verifyCode({
				code: verifyCode,
			});
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			setStep("codeVerified");
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	};

	const handleSubmitNewPassword = async (newPassword: string) => {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error: submitError } =
				await signIn.resetPasswordEmailCode.submitPassword({
					password: newPassword,
				});
			if (submitError) {
				setErrorMsg(clerkMsg(submitError));
				return;
			}
			if (signIn.status === "complete") {
				const { error: finalError } = await signIn.finalize({
					navigate: onSuccess,
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else {
				setErrorMsg("Password reset incomplete. Please try again.");
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	};

	return {
		mode,
		step,
		errorMsg,
		loading,
		switchMode,
		resetError,
		setStep,
		handleSignUp,
		handleVerifySignUp,
		handleSignIn,
		handleVerifySignIn,
		handleForgotPassword,
		handleVerifyResetCode,
		handleSubmitNewPassword,
	};
}

function clerkMsg(error: ClerkError): string {
	return error.longMessage ?? error.message ?? "An error occurred.";
}

function unknownMsg(e: unknown): string {
	if (e instanceof Error) return e.message;
	return "Something went wrong. Please try again.";
}
