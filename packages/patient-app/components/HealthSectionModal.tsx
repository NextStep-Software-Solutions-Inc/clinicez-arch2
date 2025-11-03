import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { ThemedView } from './ThemedView';

export interface HealthSectionModalProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function HealthSectionModal({ visible, onClose, children }: HealthSectionModalProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <TouchableOpacity
                activeOpacity={1}
                style={[styles.overlay, { flex: 1 }]}
                className="flex-1 bg-black/25 justify-end"
                onPress={onClose}
            >
                <ThemedView
                    style={styles.modalContent}
                    className="bg-white dark:bg-neutral-900 shadow-lg"
                    // Prevent modal content from closing when tapped
                    pointerEvents="box-none"
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={{ flex: 1 }}
                        onPress={() => { }}
                    >
                        {children}
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <ThemedText style={styles.closeText}>Close</ThemedText>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </ThemedView>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        padding: 18,
        minHeight: 160,
        shadowColor: Colors.light.tint,
        shadowOpacity: 0.10,
        shadowRadius: 8,
        elevation: 3,
    },
    closeButton: {
        alignSelf: 'flex-end',
        padding: 8,
        backgroundColor: Colors.light.tint + '22',
        borderRadius: 6,
    },
    closeText: {
        color: Colors.light.tint,
        fontWeight: 'bold',
        fontSize: 15,
    },
});
