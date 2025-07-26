
import '../../global.css';
import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import RoundedButton from '../../components/RoundedButton';

type JoinClinicScreenProps = {
    onJoin: (code: string) => void;
    onBack?: () => void;
    onExit?: () => void;
};

export default function JoinClinicScreen({ onJoin, onBack, onExit }: JoinClinicScreenProps) {
    const [code, setCode] = useState('');
    return (
        <View className="flex-1 bg-white dark:bg-slate-900 p-0">
            {/* Top bar for navigation */}
            {(onBack || onExit) && (
                <View className="flex-row w-full justify-between items-center px-6 pt-10 pb-2">
                    {onBack ? (
                        <Pressable onPress={onBack} className="py-1 px-2" android_ripple={{ color: '#e2e8f0' }}>
                            <Text className="text-blue-600 font-semibold">Back</Text>
                        </Pressable>
                    ) : <View />}
                    {onExit ? (
                        <Pressable onPress={onExit} className="py-1 px-2" android_ripple={{ color: '#e2e8f0' }}>
                            <Text className="text-slate-500 font-semibold">Exit</Text>
                        </Pressable>
                    ) : <View />}
                </View>
            )}
            {/* Main content distributed vertically */}
            <View className="flex-1 w-full flex-col justify-between items-center px-6 pb-10">
                <View className="flex-1 w-full justify-center items-center">
                    <Text className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-3 text-center">Join Your Clinic</Text>
                    <Text className="text-base text-[#4a5568] dark:text-slate-300 text-center mb-8 max-w-xl">
                        Enter your invitation code or search for your clinic to get started.
                    </Text>
                    <TextInput
                        placeholder="Invitation Code"
                        value={code}
                        onChangeText={setCode}
                        className="border border-slate-300 rounded-xl p-4 w-full max-w-xl mb-6 text-base bg-[#f7fafc]"
                        placeholderTextColor="#94a3b8"
                    />
                    <RoundedButton onPress={() => onJoin(code)}>
                        <Text className="text-white font-bold text-lg tracking-wide text-center">Join Clinic</Text>
                    </RoundedButton>
                    <Text className="my-2 text-slate-500 text-base text-center">or</Text>
                    <RoundedButton onPress={() => { }} color="bg-slate-100" rippleColor="#e2e8f0">
                        <Text className="text-[#1a365d] font-bold text-base tracking-wide text-center">Search for Clinic</Text>
                    </RoundedButton>
                </View>
            </View>
        </View>
    );
}
