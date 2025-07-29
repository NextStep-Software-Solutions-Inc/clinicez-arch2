import React, { useState, useRef } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { KeyboardAvoidingView, Platform, Dimensions, ScrollView } from 'react-native';
import EditSheet from '@/components/EditSheet';
import { Colors } from '@/constants/Colors';

export type ProfileCardProps = {
    title: string;
    children: React.ReactNode;
    editTitle: string;
};

export default function ProfileCard({ title, children, editTitle }: ProfileCardProps) {
    const scrollRef = useRef<ScrollView>(null);
    const [editVisible, setEditVisible] = useState(false);
    const { user } = useClerk();

    // Only show the form for Basic Information
    const isBasicInfo = editTitle === 'Edit Basic Information';
    const initialForm = user ? {
        first_name: user.firstName || '',
        last_name: user.lastName || '',
        gender: 'Male',
        birthdate: '08-01-2025', // Default date for demo purposes
        blood_type: 'O+',
        religion: 'Christian',
        email_address: user.emailAddresses?.[0]?.emailAddress || '',
        phone_number: user.phoneNumbers?.[0]?.phoneNumber || '',
    } : {
        first_name: '',
        last_name: '',
        gender: '',
        birthdate: '',
        blood_type: '',
        religion: '',
        email_address: '',
        phone_number: '',
    };
    const [form, setForm] = useState(initialForm);

    const handleChange = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    // Reset form when opening sheet
    const handleEditOpen = () => {
        if (user) setForm(initialForm);
        setEditVisible(true);
    };

    const handleSave = async () => {
        if (!user) return;
        try {
            await user.update({
                firstName: form.first_name,
                lastName: form.last_name,
            })
        } catch (error) {
            console.error('Error saving profile:', JSON.stringify(error, null, 2));
        }
        setEditVisible(false);
    };

    return (
        <ThemedView

            style={{
                shadowColor: Colors.light.tint,
                shadowOpacity: 0.08,
                shadowRadius: 6,
                elevation: 1,
            }}
            className='bg-slate-100 dark:bg-slate-800 rounded-xl p-4 mb-4 relative w-full'

        >
            <ThemedView style={{ position: 'absolute', top: 18, right: 18, zIndex: 10 }}>
                <TouchableOpacity
                    onPress={handleEditOpen}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Feather name="edit" size={24} color={Colors.light.tint} />
                </TouchableOpacity>
            </ThemedView>
            <ThemedText
                className='dark:text-slate-500 text-xl mb-1'
            >
                {title}
            </ThemedText>
            {children}
            <EditSheet visible={editVisible} onClose={() => setEditVisible(false)} title={editTitle}>
                {isBasicInfo ? (
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
                    >
                        <ScrollView
                            ref={scrollRef}
                            style={{ flex: 1 }}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={true}
                        >
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>First name</ThemedText>

                                <Input value={form.first_name} onChangeText={v => handleChange('first_name', v)}

                                    placeholder="First Name"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>Last name</ThemedText>

                                <Input value={form.last_name} onChangeText={v => handleChange('last_name', v)}

                                    placeholder="Last Name"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>Gender</ThemedText>
                                <Input value={form.gender} onChangeText={v => handleChange('gender', v)} placeholder="Gender"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>Birthdate</ThemedText>
                                <Input value={form.birthdate} onChangeText={v => handleChange('birthdate', v)} placeholder="YYYY-MM-DD"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>Blood Type</ThemedText>
                                <Input value={form.blood_type} onChangeText={v => handleChange('blood_type', v)} placeholder="Blood Type"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>Religion</ThemedText>
                                <Input value={form.religion} onChangeText={v => handleChange('religion', v)} placeholder="Religion"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>Email</ThemedText>
                                <Input value={form.email_address} onChangeText={v => handleChange('email_address', v)} placeholder="Email"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView className='mb-2'>
                                <ThemedText className='dark:text-slate-500'>Phone</ThemedText>
                                <Input value={form.phone_number} onChangeText={v => handleChange('phone_number', v)} placeholder="Phone"
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                />
                            </ThemedView>
                            <ThemedView style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18 }}>
                                <TouchableOpacity
                                    style={{ marginRight: 12, paddingVertical: 8, paddingHorizontal: 18, backgroundColor: '#eee', borderRadius: 8 }}
                                    onPress={() => setEditVisible(false)}
                                >
                                    <ThemedText>Cancel</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={{ backgroundColor: Colors.light.tint, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 }}
                                    onPress={handleSave}
                                >
                                    <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>Save</ThemedText>
                                </TouchableOpacity>
                            </ThemedView>
                        </ScrollView>
                    </KeyboardAvoidingView>
                ) : (
                    <ThemedText>Edit form goes here.</ThemedText>
                )}
            </EditSheet>
        </ThemedView >
    );
}

// Simple input component using ThemedView and TextInput
import { TextInput } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useClerk } from '@clerk/clerk-expo';
// Removed incorrect ScrollView import
function Input({ value, onChangeText, placeholder, onFocus }: { value: string; onChangeText: (v: string) => void; placeholder?: string; onFocus?: () => void }) {
    const colorScheme = useColorScheme();
    return (
        <ThemedView style={{ borderWidth: 1, borderColor: Colors.light.tint, borderRadius: 8, marginTop: 4, marginBottom: 2 }}>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                style={{ padding: 10, fontSize: 15, color: colorScheme === 'dark' ? '#aaa' : Colors.light.text }}
                placeholderTextColor="#999"
                onFocus={onFocus}
            />
        </ThemedView>
    );
}
