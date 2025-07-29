
import { useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import WelcomeScreen from './WelcomeScreen';
import FeatureCarousel from './FeatureCarousel';
import LoadingScreen from '../LoadingScreen';

export default function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
    const [step, setStep] = useState(0);
    const { isLoaded } = useAuth();

    if (!isLoaded) {
        return <LoadingScreen />;
    }

    return (
        <>
            {step === 0 && (
                <WelcomeScreen
                    onNext={() => setStep(1)}
                    onSkip={onFinish}
                />
            )}
            {step === 1 && (
                <FeatureCarousel
                    onBack={() => setStep(0)}
                    onContinue={onFinish}
                />
            )}
        </>
    );
}