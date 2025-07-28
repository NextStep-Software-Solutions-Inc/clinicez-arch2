import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { View, Platform, Modal, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedView } from './ThemedView';
import { ThemedText } from './ThemedText';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { ClinicSwitchModal } from './ClinicSwitchModal';
import { useClinicContext } from './ClinicContext';

const notificationCount = 3;

export function GlobalHeader() {
    const colorScheme = useColorScheme();
    const { clinics, currentClinicId, setCurrentClinicId } = useClinicContext();
    const [modalVisible, setModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const currentClinic = clinics.find(c => c.id === currentClinicId) ?? clinics[0];

    const handleSwitchClinic = () => {
        setModalVisible(true);
    };

    const handleSelectClinic = (id: string) => {
        setLoading(true);
        setTimeout(() => {
            setCurrentClinicId(id);
            setLoading(false);
            setModalVisible(false);
        }, 2000); // Simulate loading/transition
    };

    return (
        <ThemedView
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: Platform.select({
                    ios: 54,
                    android: 44,
                    default: 24,
                }),
                paddingBottom: 12,
                paddingHorizontal: 16,
                backgroundColor: Colors[colorScheme ?? 'light'].background,
                borderBottomWidth: 1,
                borderBottomColor: colorScheme === 'dark' ? '#222' : '#e5e7eb',
                elevation: 5,
            }}
        >
            {/* Clinic context */}
            <ThemedView
                style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    backgroundColor: Colors[colorScheme ?? 'light'].background,
                    borderRadius: 8,
                    paddingVertical: 2,
                    // maxWidth: 220,
                }}
            >
                <Feather name="home" size={18} color={Colors[colorScheme ?? 'light'].tint} style={{ marginRight: 4 }} />
                <ThemedText
                    style={{ fontSize: 14, fontWeight: 'bold', color: Colors[colorScheme ?? 'light'].tint }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                    {currentClinic.name}
                </ThemedText>
            </ThemedView>
            {/* No app name in center for cleaner look */}
            {/* Actions */}
            <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {/* Notification Bell with Badge */}
                <ThemedView style={{ position: 'relative', marginRight: 8 }}>
                    <Feather name="bell" size={24} color={Colors[colorScheme ?? 'light'].tint} />
                    <ThemedView
                        style={{
                            position: 'absolute',
                            top: -2,
                            right: -2,
                            backgroundColor: 'red',
                            borderRadius: 8,
                            width: 16,
                            height: 16,
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        <ThemedText style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{notificationCount}</ThemedText>
                    </ThemedView>
                </ThemedView>
                {/* Switch Clinic Icon */}
                <Feather
                    name="repeat"
                    size={24}
                    color={Colors[colorScheme ?? 'light'].tint}
                    onPress={handleSwitchClinic}
                    style={{ padding: 4 }}
                    accessibilityLabel="Switch Clinic"
                />
            </ThemedView>
            <ClinicSwitchModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                clinics={clinics}
                selectedId={currentClinicId}
                onSelectClinic={handleSelectClinic}
                loading={loading}
                colorScheme={colorScheme}
            />
        </ThemedView>
    );
}
