
import { use, useEffect, useState } from 'react';
import { SignedIn, SignedOut, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import WelcomeScreen from './WelcomeScreen';
import FeatureCarousel from './FeatureCarousel';

export default function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
    const [step, setStep] = useState(0);
    const router = useRouter();

    // Handler to exit onboarding (calls onFinish)
    const handleExit = () => {
        onFinish();
    };
    // When signed in, check if patient has a clinic and route accordingly
    function FinishedOnboarding({ onFinish }: { onFinish: () => void }) {
        useEffect(() => {
            onFinish();
        }, [onFinish]);
        return null;
    }

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
                {/* Joining Clinic and Confirming have been moved to a separate route and will only show when patient has no clinic. */}
            </SignedOut>
            <SignedIn>
                <FinishedOnboarding onFinish={onFinish} />
            </SignedIn>
        </>
    );
}
// FinishedOnboarding is now defined inline above