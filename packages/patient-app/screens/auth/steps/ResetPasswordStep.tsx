import { AuthStepHeader } from "@/components/auth/AuthStepHeader";
import { ResetPasswordForm } from "@/components/auth/ForgotPasswordForm";

type Props = {
	email: string;
	verifyCode: string;
	setVerifyCode: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
	onResendCode: () => void;
};

export function ResetPasswordStep({
	email,
	verifyCode,
	setVerifyCode,
	loading,
	onSubmit,
	onResendCode,
}: Props) {
	return (
		<>
			<AuthStepHeader
				title="Enter Code"
				subtitle="Check your email for the verification code"
			/>
			<ResetPasswordForm
				email={email}
				verifyCode={verifyCode}
				setVerifyCode={setVerifyCode}
				loading={loading}
				onSubmit={onSubmit}
				onResendCode={onResendCode}
			/>
		</>
	);
}
