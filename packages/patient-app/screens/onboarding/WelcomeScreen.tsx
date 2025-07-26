import '../../global.css';
import { View, Text, Image, Pressable } from 'react-native';


type WelcomeScreenProps = {
    onNext: () => void;
    onBack?: () => void;
    onExit?: () => void;
};

export default function WelcomeScreen({ onNext, onBack, onExit }: WelcomeScreenProps) {

    return (
        <View className="flex-1 justify-center items-center w-full min-h-screen bg-white dark:bg-slate-950">
            <View className="w-full max-w-[380px] px-4">
                <View className="items-center">
                    <Image
                        source={require('../../assets/images/icon.png')}
                        className="w-[72px] h-[72px] mb-8 mt-2"
                        style={{ resizeMode: 'contain' }}
                    />
                    <Text className="text-3xl font-bold text-blue-900 dark:text-blue-200 mb-3 text-center tracking-tight">Welcome to ClinicEZ</Text>
                    <Text className="text-base text-slate-500 dark:text-slate-300 text-center mb-10 leading-6">
                        Manage your health, appointments, and clinics — all in one place.
                    </Text>
                    <Pressable
                        onPress={onNext}
                        className="bg-blue-600 rounded-xl py-3 px-10 w-full items-center mb-2 active:scale-95"
                        android_ripple={{ color: '#2b6cb0' }}
                        style={{ elevation: 2 }}
                    >
                        <Text className="text-white font-semibold text-lg tracking-wide">Get Started</Text>
                    </Pressable>
                    {(onBack || onExit) && (
                        <View className="flex-row w-full justify-between mt-2">
                            {onBack ? (
                                <Pressable onPress={onBack} className="py-1 px-2" android_ripple={{ color: '#e2e8f0' }}>
                                    <Text className="text-blue-600 font-medium">Back</Text>
                                </Pressable>
                            ) : <View />}
                            {onExit ? (
                                <Pressable onPress={onExit} className="py-1 px-2" android_ripple={{ color: '#e2e8f0' }}>
                                    <Text className="text-slate-500 font-medium">Exit</Text>
                                </Pressable>
                            ) : <View />}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );

}