import JoinClinicScreen from '../screens/onboarding/JoinClinicScreen';
import ConfirmScreen from '../screens/onboarding/ConfirmScreen';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useClinicContext } from '@/components/ClinicContext';

export default function JoinClinicRoute() {
    const [joined, setJoined] = useState(false);
    const [clinicId, setClinicId] = useState<string | null>(null);
    const router = useRouter();
    const { setCurrentClinicId } = useClinicContext();

    const handleJoinClinic = (code: string) => {
        const clinicId = code; // Assuming the code is the clinic ID
        setClinicId(clinicId);
        setJoined(true);
    }

    const handleConfirm = () => {
        setCurrentClinicId(clinicId); // Set to the clinic ID you want to use
        router.replace('/(tabs)');
    }

    if (!joined) {
        return (
            <JoinClinicScreen
                onJoin={handleJoinClinic}
                onBack={() => router.canGoBack() ? router.back() : null}
                onExit={() => router.replace('/')}
            />
        );
    }
    return (
        <ConfirmScreen
            onContinue={handleConfirm}
            onBack={() => setJoined(false)}
        />
    );
}
