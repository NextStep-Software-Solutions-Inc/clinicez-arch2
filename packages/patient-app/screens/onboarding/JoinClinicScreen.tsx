
import '../../global.css';
import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';

type JoinClinicScreenProps = {
    onJoin: (code: string) => void;
    onBack?: () => void;
    onExit?: () => void;
};

export default function JoinClinicScreen({ onJoin, onBack, onExit }: JoinClinicScreenProps) {
    const [code, setCode] = useState('');
    return (
        <View className="flex-1 justify-center items-center p-6 bg-[#f7fafd]">
            <View className="bg-white rounded-3xl p-8 shadow-md items-center w-full max-w-[400px]">
                {(onBack || onExit) && (
                    <View className="flex-row w-full justify-between mb-2">
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
                <Text className="text-2xl font-bold text-[#1a365d] mb-4">Join Your Clinic</Text>
                <Text className="text-base text-[#4a5568] text-center mb-6">
                    Enter your invitation code or search for your clinic to get started.
                </Text>
                <TextInput
                    placeholder="Invitation Code"
                    value={code}
                    onChangeText={setCode}
                    className="border border-slate-300 rounded-xl p-3 w-full mb-4 text-base bg-[#f7fafc]"
                    placeholderTextColor="#94a3b8"
                />
                <Pressable
                    onPress={() => onJoin(code)}
                    className="bg-blue-600 rounded-2xl py-3 px-12 mb-3 shadow-md shadow-blue-600/20"
                    android_ripple={{ color: '#2b6cb0' }}
                >
                    <Text className="text-white font-bold text-lg tracking-wide">Join Clinic</Text>
                </Pressable>
                <Text className="my-3 text-slate-500 text-base">or</Text>
                <Pressable
                    onPress={() => { }}
                    className="bg-slate-100 rounded-2xl py-3 px-9"
                    android_ripple={{ color: '#e2e8f0' }}
                >
                    <Text className="text-[#1a365d] font-bold text-base tracking-wide">Search for Clinic</Text>
                </Pressable>
            </View>
        </View>
    );
}
