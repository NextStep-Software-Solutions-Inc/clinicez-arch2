import '../../global.css';
import { View, Text, Image } from 'react-native';

import RoundedButton from '../../components/RoundedButton';
import Constants from 'expo-constants';


type WelcomeScreenProps = {
    onNext: () => void;
    onBack?: () => void;
    onSkip?: () => void;
};

export default function WelcomeScreen({ onNext, onBack, onSkip }: WelcomeScreenProps) {

    const version = Constants.expoConfig?.version || '1.0.0';
    return (
        <View className="flex-1 w-full min-h-screen bg-white dark:bg-slate-950">
            <View className="flex-1 w-full max-w-[420px] mx-auto px-4 py-10 justify-between">
                <View className="flex-1 items-center justify-center">
                    <Image
                        source={require('../../assets/images/icon.png')}
                        className="w-[96px] h-[96px] mb-10 mt-2"
                        style={{ resizeMode: 'contain' }}
                    />
                    <Text className="text-4xl font-bold text-blue-900 dark:text-blue-200 mb-4 text-center tracking-tight">Welcome to ClinicEZ</Text>
                    <Text className="text-lg text-slate-500 dark:text-slate-300 text-center mb-12 leading-7">
                        Manage your health, appointments, and clinics — all in one place.
                    </Text>
                </View>
                <View className="w-full items-center">
                    <RoundedButton onPress={onNext} className="mb-2">
                        <Text className="text-white font-semibold text-lg tracking-wide">Get Started</Text>
                    </RoundedButton>
                    {(onBack || onSkip) && (
                        <View className="flex-row w-full justify-between mt-2">
                            {onBack ? (
                                <RoundedButton onPress={onBack} color="bg-white" rippleColor="#e2e8f0" className="py-1 px-2">
                                    <Text className="text-blue-600 font-medium">Back</Text>
                                </RoundedButton>
                            ) : <View />}
                            {/* {onSkip ? (
                                <RoundedButton onPress={onSkip} color="bg-white" rippleColor="#e2e8f0" className="py-1 px-2">
                                    <Text className="text-slate-500 font-medium">Skip</Text>
                                </RoundedButton>
                            ) : <View />} */}
                        </View>
                    )}
                </View>
                {/* App version at the very bottom */}
                <Text className="text-xs text-slate-400 text-center mt-8">v{version}</Text>
            </View>
        </View>
    );

}