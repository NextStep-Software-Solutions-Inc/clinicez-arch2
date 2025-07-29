import React from 'react';
import { Modal, TouchableOpacity, View, FlatList } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';

interface SelectModalProps {
    visible: boolean;
    onClose: () => void;
    options: { label: string; value: string }[];
    value: string;
    onSelect: (value: string) => void;
    title?: string;
}

export default function SelectModal({ visible, onClose, options, value, onSelect, title }: SelectModalProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View className="flex-1 justify-end bg-black/40">
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={onClose}
                    style={{ flex: 1 }}
                />
                <ThemedView className="bg-white dark:bg-neutral-900 rounded-t-3xl p-6 pb-10">
                    <ThemedView className="flex-row items-center justify-between mb-4">
                        <ThemedText className="text-lg font-bold text-slate-700 dark:text-slate-100">
                            {title || 'Select'}
                        </ThemedText>
                        <TouchableOpacity onPress={onClose}>
                            <Feather name="x" size={22} color="#64748b" />
                        </TouchableOpacity>
                    </ThemedView>
                    <FlatList
                        data={options}
                        keyExtractor={item => item.value}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                className="py-3 px-2 flex-row items-center"
                                onPress={() => {
                                    onSelect(item.value);
                                    onClose();
                                }}
                            >
                                <ThemedText className={`text-base flex-1 ${value === item.value ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-100'}`}>
                                    {item.label}
                                </ThemedText>
                                {value === item.value && <Feather name="check" size={18} color="#2563eb" />}
                            </TouchableOpacity>
                        )}
                        ItemSeparatorComponent={() => <View className="h-px bg-slate-200 dark:bg-slate-700" />}
                    />
                </ThemedView>
            </View>
        </Modal>
    );
}
