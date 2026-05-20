import { CodeVerifiedFeedback } from "@/components/auth/ForgotPasswordForm";

type Props = {
	onNext: () => void;
};

export function CodeVerifiedStep({ onNext }: Props) {
	return <CodeVerifiedFeedback onNext={onNext} />;
}
