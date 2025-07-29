import JoinClinicScreen from '../screens/onboarding/JoinClinicScreen';
import ConfirmScreen from '../screens/onboarding/ConfirmScreen';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useClinicContext } from '@/components/ClinicContext';

export default function JoinClinicRoute() {
    const { setCurrentClinicId, clinics, currentClinicId } = useClinicContext();
    const [joined, setJoined] = useState(currentClinicId !== null);
    const [errorJoining, setErrorJoining] = useState(false);
    const [message, setMessage] = useState<string>();
    const [clinicId, setClinicId] = useState<string | null>(null);
    const router = useRouter();

    const handleJoinClinic = (code: string) => {
        const clinicId = code; // Assuming the code is the clinic ID
        if (!clinics.some(clinic => clinic.id === clinicId)) {
            setErrorJoining(true);
            setMessage('Please enter a valid clinic ID');
            return;
        }
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
                error={errorJoining}
                message={message}
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
