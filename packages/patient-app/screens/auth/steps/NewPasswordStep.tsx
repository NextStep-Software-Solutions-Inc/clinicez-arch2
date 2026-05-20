import { useState } from "react";
import { AuthStepHeader } from "@/components/auth/AuthStepHeader";
import { NewPasswordForm } from "@/components/auth/ForgotPasswordForm";

type Props = {
	loading: boolean;
	onSubmit: (newPassword: string) => void;
};

export function NewPasswordStep({ loading, onSubmit }: Props) {
	const [newPassword, setNewPassword] = useState("");

	return (
		<>
			<AuthStepHeader
				title="New Password"
				subtitle="Almost there — set your new password"
			/>
			<NewPasswordForm
				newPassword={newPassword}
				setNewPassword={setNewPassword}
				loading={loading}
				onSubmit={() => onSubmit(newPassword)}
			/>
		</>
	);
}
