import React from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { TouchableOpacity } from 'react-native';

export type EditProfileModalProps = {
    visible: boolean;
    onClose: () => void;
    user: {
        first_name: string;
        last_name: string;
        email_address: string;
        phone_number: string;
        role: string;
    };
};

export default function EditProfileModal({ visible, onClose, user }: EditProfileModalProps) {
    if (!visible) return null;
    return (
        <ThemedView style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
        }}>
            <ThemedView style={{
                backgroundColor: Colors.light.background,
                borderRadius: 16,
                padding: 24,
                minWidth: 280,
                elevation: 8,
                alignItems: 'center',
            }}>
                <ThemedText style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
                    Edit Profile
                </ThemedText>
                {/* Display user info here, add TextInputs for editing if needed */}
                <ThemedText style={{ fontSize: 16, marginBottom: 8 }}>
                    {user.first_name} {user.last_name}
                </ThemedText>
                <ThemedText style={{ fontSize: 14, marginBottom: 8 }}>
                    {user.email_address}
                </ThemedText>
                <ThemedText style={{ fontSize: 14, marginBottom: 8 }}>
                    {user.phone_number}
                </ThemedText>
                <ThemedText style={{ fontSize: 14, marginBottom: 16 }}>
                    {user.role}
                </ThemedText>
                <TouchableOpacity
                    style={{ backgroundColor: Colors.light.tint, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 32 }}
                    onPress={onClose}
                >
                    <ThemedText style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                        Close
                    </ThemedText>
                </TouchableOpacity>
            </ThemedView>
        </ThemedView>
    );
}
