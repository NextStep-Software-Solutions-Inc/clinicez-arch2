
import '../../global.css';
import { View, Text } from 'react-native';
import React from 'react';
import RoundedButton from '../../components/RoundedButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type ConfirmScreenProps = {
    onContinue: () => void;
    onBack?: () => void;
};

export default function ConfirmScreen({ onContinue }: ConfirmScreenProps) {
    return (
        <View className="flex-1 bg-[#f7fafd] p-0">
            {/* Main content distributed vertically */}
            <View className="flex-1 w-full flex-col justify-between items-center px-6 pb-10">
                <View className="flex-1 w-full justify-center items-center">
                    <MaterialCommunityIcons name="check-circle" size={100} color="#22c55e" style={{ marginBottom: 24 }} />
                    <Text className="text-3xl font-extrabold text-green-600 mb-4 text-center">You're All Set!</Text>
                    <Text className="text-base text-[#4a5568] text-center mb-10 leading-7 max-w-xl">
                        You have successfully joined your clinic. You can now access all features of ClinicEZ.
                    </Text>
                    <RoundedButton onPress={onContinue}>
                        <Text className="text-white font-bold text-lg tracking-wide text-center">Continue to App</Text>
                    </RoundedButton>
                </View>
            </View>
        </View>
    );
}
