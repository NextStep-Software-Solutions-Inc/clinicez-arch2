import { AuthStepHeader } from "@/components/auth/AuthStepHeader";
import { ForgotPasswordForm } from "@/components/auth/RequestPasswordResetForm";

type Props = {
	email: string;
	setEmail: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
	onBack: () => void;
};

export function ForgotPasswordStep({
	email,
	setEmail,
	loading,
	onSubmit,
	onBack,
}: Props) {
	return (
		<>
			<AuthStepHeader title="Forgot Password" />
			<ForgotPasswordForm
				email={email}
				setEmail={setEmail}
				loading={loading}
				onSubmit={onSubmit}
				onBack={onBack}
			/>
		</>
	);
}
