
import { use, useEffect, useState } from 'react';
import { SignedIn, SignedOut, useSignIn, useSignUp } from '@clerk/clerk-expo';
import WelcomeScreen from './WelcomeScreen';
import FeatureCarousel from './FeatureCarousel';
import JoinClinicScreen from './JoinClinicScreen';
import ConfirmScreen from './ConfirmScreen';
import { SignInScreen } from './ClerkAuthScreens';

export default function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
    // Call onFinish when signed in
    // Clerk hooks for authentication
    const { signIn } = useSignIn();
    const { signUp } = useSignUp();
    const [step, setStep] = useState(0);

    // Handler to exit onboarding (calls onFinish)
    const handleExit = () => {
        onFinish();
    };

    return (
        <>
            <SignedOut>
                {/* Show onboarding screens only if user is signed out */}
                {step === 0 && (
                    <WelcomeScreen
                        onNext={() => setStep(1)}
                        onExit={handleExit}
                    />
                )}
                {step === 1 && (
                    <FeatureCarousel
                        onBack={() => setStep(0)}
                        onContinue={onFinish}
                    />
                )}
                {/* {step === 2 && (
                    <JoinClinicScreen
                        onJoin={() => setStep(3)}
                        onBack={() => setStep(1)}
                        onExit={handleExit}
                    />
                )}
                {step === 3 && (
                    <ConfirmScreen
                        onContinue={onFinish}
                        onBack={() => setStep(2)}
                    />
                )} */}
            </SignedOut>
            <SignedIn>
                <FinishedOnboarding onFinish={onFinish} />
            </SignedIn>
        </>
    );
}

interface FinishedOnboardingProps {
    onFinish: () => void;
}
function FinishedOnboarding({ onFinish }: FinishedOnboardingProps) {
    useEffect(() => {
        // This component is just a placeholder to call onFinish
        onFinish();
    }, [onFinish]);
    return null; // No UI, just a side effect
}