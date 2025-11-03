
import { useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import FeatureCarousel from './FeatureCarousel';
import JoinClinicScreen from './JoinClinicScreen';
import ConfirmScreen from './ConfirmScreen';

export default function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
    const [step, setStep] = useState(0);

    // Handler to exit onboarding (calls onFinish)
    const handleExit = () => {
        onFinish();
    };

    if (step === 0) {
        return (
            <WelcomeScreen
                onNext={() => setStep(1)}
                onExit={handleExit}
            />
        );
    }
    if (step === 1) {
        return (
            <FeatureCarousel
                onNext={() => setStep(2)}
                onBack={() => setStep(0)}
            />
        );
    }
    if (step === 2) {
        return (
            <JoinClinicScreen
                onJoin={() => setStep(3)}
                onBack={() => setStep(1)}
                onExit={handleExit}
            />
        );
    }
    if (step === 3) {
        return (
            <ConfirmScreen
                onContinue={onFinish}
                onBack={() => setStep(2)}
            />
        );
    }
    return null;
}
