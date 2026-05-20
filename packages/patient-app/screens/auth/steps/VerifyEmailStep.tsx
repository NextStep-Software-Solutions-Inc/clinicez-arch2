import { AuthStepHeader } from "@/components/auth/AuthStepHeader";
import { VerifyCodeForm } from "@/components/auth/VerifyCodeForm";

type Props = {
	email: string;
	verifyCode: string;
	setVerifyCode: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
	onChangeEmail: () => void;
};

export function VerifyEmailStep({
	email,
	verifyCode,
	setVerifyCode,
	loading,
	onSubmit,
	onChangeEmail,
}: Props) {
	return (
		<>
			<AuthStepHeader title="Check Your Email" />
			<VerifyCodeForm
				email={email}
				verifyCode={verifyCode}
				setVerifyCode={setVerifyCode}
				loading={loading}
				onSubmit={onSubmit}
				onChangeEmail={onChangeEmail}
			/>
		</>
	);
}
