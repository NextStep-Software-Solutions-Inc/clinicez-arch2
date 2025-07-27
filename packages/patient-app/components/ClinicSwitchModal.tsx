import React from 'react';
import { ActivityIndicator, View, Modal, Pressable } from 'react-native';
import { ThemedView } from './ThemedView';
import { ThemedText } from './ThemedText';
import { Colors } from '@/constants/Colors';
import type { Clinic } from './ClinicContext';


type ClinicSwitchModalProps = {
    visible: boolean;
    onClose: () => void;
    clinics: Clinic[];
    selectedId: string;
    onSelectClinic: (id: string) => void;
    loading: boolean;
    colorScheme: string | null | undefined;
};

export function ClinicSwitchModal({
    visible,
    onClose,
    clinics,
    selectedId,
    onSelectClinic,
    loading,
    colorScheme,
}: ClinicSwitchModalProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}
                onPress={onClose}
            >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ThemedView
                        style={{
                            backgroundColor: colorScheme === 'dark' ? '#23272e' : Colors.light.background,
                            borderRadius: 12,
                            padding: 20,
                            minWidth: 260,
                            elevation: 8,
                        }}
                    >
                        <ThemedText
                            style={{
                                fontWeight: 'bold',
                                fontSize: 16,
                                marginBottom: 12,
                                textAlign: 'center',
                                color: colorScheme === 'dark' ? '#fff' : Colors.light.text,
                            }}
                        >
                            Select Clinic
                        </ThemedText>
                        {loading ? (
                            <ThemedView style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                                <ActivityIndicator size="large" color={Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint} />
                                <ThemedText style={{ marginTop: 12, color: colorScheme === 'dark' ? '#fff' : Colors.light.text }}>
                                    Switching clinic...
                                </ThemedText>
                            </ThemedView>
                        ) : (
                            clinics.map((clinic) => (
                                <Pressable
                                    key={clinic.id}
                                    onPress={() => onSelectClinic(clinic.id)}
                                    style={{
                                        paddingVertical: 10,
                                        paddingHorizontal: 8,
                                        borderRadius: 6,
                                        backgroundColor:
                                            clinic.id === selectedId
                                                ? (colorScheme === 'dark' ? '#0a7ea4' : Colors.light.tint) + '22'
                                                : 'transparent',
                                        marginBottom: 4,
                                    }}
                                    disabled={loading}
                                >
                                    <ThemedText
                                        style={{
                                            color: clinic.id === selectedId
                                                ? colorScheme === 'dark'
                                                    ? '#0a7ea4'
                                                    : Colors.light.tint
                                                : colorScheme === 'dark'
                                                    ? '#fff'
                                                    : Colors.light.text,
                                            fontWeight: clinic.id === selectedId ? 'bold' : 'normal',
                                        }}
                                    >
                                        {clinic.name}
                                    </ThemedText>
                                    <ThemedText
                                        style={{
                                            fontSize: 12,
                                            color: colorScheme === 'dark' ? '#9BA1A6' : Colors.light.icon,
                                        }}
                                    >
                                        {clinic.address}
                                    </ThemedText>
                                </Pressable>
                            ))
                        )}
                    </ThemedView>
                </View>
            </Pressable>
        </Modal>
    );
}
