import { useState } from "react";
import ClerkAuthScreen from "@/screens/auth/ClerkAuthScreen";
import FeatureCarousel from "./FeatureCarousel";
import WelcomeScreen from "./WelcomeScreen";

/**
 * Step map
 *  0 → Welcome
 *  1 → Feature slides  (getStarted path only)
 *  2 → Auth            (signUp for getStarted | signIn for signIn path)
 */
type FlowPath = "getStarted" | "signIn";

export default function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
	const [step, setStep] = useState(0);
	const [path, setPath] = useState<FlowPath>("getStarted");

	if (step === 0) {
		return (
			<WelcomeScreen
				onNext={() => {
					setPath("getStarted");
					setStep(1);
				}}
				onSignIn={() => {
					setPath("signIn");
					setStep(2);
				}}
			/>
		);
	}

	if (step === 1) {
		return (
			<FeatureCarousel onNext={() => setStep(2)} onBack={() => setStep(0)} />
		);
	}

	if (step === 2) {
		return (
			<ClerkAuthScreen
				initialMode={path === "signIn" ? "signIn" : "signUp"}
				onNext={onFinish}
				onBack={() => setStep(path === "signIn" ? 0 : 1)}
			/>
		);
	}

	return null;
}
