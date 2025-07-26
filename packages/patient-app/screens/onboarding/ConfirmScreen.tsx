
import '../../global.css';
import { View, Text, Pressable } from 'react-native';

type ConfirmScreenProps = {
    onContinue: () => void;
    onBack?: () => void;
};

export default function ConfirmScreen({ onContinue, onBack }: ConfirmScreenProps) {
    return (
        <View className="flex-1 justify-center items-center p-6 bg-[#f7fafd]">
            <View className="bg-white rounded-3xl p-8 shadow-md items-center w-full max-w-[400px]">
                {onBack && (
                    <View className="flex-row w-full justify-start mb-2">
                        <Pressable onPress={onBack} className="py-1 px-2" android_ripple={{ color: '#e2e8f0' }}>
                            <Text className="text-blue-600 font-semibold">Back</Text>
                        </Pressable>
                    </View>
                )}
                <Text className="text-5xl mb-5">🎉</Text>
                <Text className="text-2xl font-bold text-[#1a365d] mb-3">You're All Set!</Text>
                <Text className="text-base text-[#4a5568] text-center mb-8 leading-6">
                    You have successfully joined your clinic. You can now access all features of ClinicEZ.
                </Text>
                <Pressable
                    onPress={onContinue}
                    className="bg-blue-600 rounded-2xl py-3 px-12 shadow-md shadow-blue-600/20"
                    android_ripple={{ color: '#2b6cb0' }}
                >
                    <Text className="text-white font-bold text-lg tracking-wide">Continue to App</Text>
                </Pressable>
            </View>
        </View>
    );
}
