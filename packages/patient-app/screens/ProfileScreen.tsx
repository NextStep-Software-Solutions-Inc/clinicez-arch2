import React, { useState, useRef } from 'react';
import { Image, TouchableOpacity, View, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useClinicContext } from '@/components/ClinicContext';
import { Colors } from '@/constants/Colors';
import EditProfileModal from '@/components/EditProfileModal';
import EditSheet from '@/components/EditSheet';
import ProfileCard from '@/components/ProfileCard';


export default function ProfileScreen() {
    const { clinics, currentClinicId } = useClinicContext();
    const clinic = clinics.find(c => c.id === currentClinicId);

    // Mock user data (replace with Clerk data when available)
    const user = {
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Marie Doe',
        gender: 'Female',
        birthdate: '1990-05-12',
        blood_type: 'O+',
        religion: 'Christian',
        email_address: 'jane.doe@example.com',
        phone_number: '+1 (555) 123-4567',
        image_url: 'https://ui-avatars.com/api/?name=Jane+Doe',
        created_at: '2024-01-15',
        role: 'Patient',
        primary_address: '456 Maple Ave, Cityville, CA 90001',
        secondary_address: '789 Oak St, Cityville, CA 90002',
        emergency_contacts: {
            primary: { name: 'John Doe', relation: 'Spouse', contact: '+1 (555) 987-6543' },
            secondary: { name: 'Emily Doe', relation: 'Daughter', contact: '+1 (555) 222-3333' },
        },
    };


    return (
        <>
            <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ alignItems: 'center', padding: 14 }}>
                {/* Avatar with shadow and ring */}
                <View style={{
                    shadowColor: Colors.light.tint,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                    elevation: 8,
                    marginBottom: 16,
                }}>
                    <Image
                        source={{ uri: "https://reactjs.org/logo-og.png" }}
                        style={{
                            width: 110,
                            height: 110,
                            borderRadius: 55,
                            borderWidth: 3,
                            borderColor: Colors.light.tint,
                            backgroundColor: '#fff',
                        }}
                    />
                </View>
                {/* Full Name */}
                <ThemedText style={{ fontSize: 30, fontWeight: 'bold', marginBottom: 2, color: Colors.light.tint }}>
                    {user.full_name}
                </ThemedText>
                {/* Role */}
                <ThemedText style={{ fontSize: 15, color: Colors.light.tint, marginBottom: 8 }}>
                    {user.role}
                </ThemedText>
                <ProfileCard
                    title="Basic Information"
                    editTitle="Edit Basic Information"
                    user={user}
                >
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Gender: {user.gender}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Birthdate: {user.birthdate}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Blood Type: {user.blood_type}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Religion: {user.religion}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Email: {user.email_address}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Phone: {user.phone_number}
                    </ThemedText>
                </ProfileCard>
                <ProfileCard
                    title="Address"
                    editTitle="Edit Address"

                >
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Primary: {user.primary_address}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}>
                        Secondary: {user.secondary_address}
                    </ThemedText>
                </ProfileCard>
                <ProfileCard
                    title="Emergency Contacts"
                    editTitle="Edit Emergency Contacts"
                >
                    <ThemedText style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 4 }}>
                        Primary
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15 }}>
                        {user.emergency_contacts.primary.name} ({user.emergency_contacts.primary.relation})
                    </ThemedText>
                    <ThemedText style={{ fontSize: 14, marginBottom: 8 }}>
                        Contact: {user.emergency_contacts.primary.contact}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 4 }}>
                        Secondary
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15 }}>
                        {user.emergency_contacts.secondary.name} ({user.emergency_contacts.secondary.relation})
                    </ThemedText>
                    <ThemedText style={{ fontSize: 14 }}>
                        Contact: {user.emergency_contacts.secondary.contact}
                    </ThemedText>
                </ProfileCard>
                <ThemedView style={{
                    backgroundColor: '#fff',
                    borderRadius: 14,
                    padding: 18,
                    marginBottom: 24,
                    width: '100%',
                    shadowColor: Colors.light.tint,
                    shadowOpacity: 0.12,
                    shadowRadius: 8,
                    elevation: 2,
                    alignItems: 'center',
                }}>
                    <ThemedText style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 2 }}>
                        Active Clinic
                    </ThemedText>
                    <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint }}>
                        {clinic?.name}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 14, color: Colors.light.icon }}>
                        {clinic?.address}
                    </ThemedText>
                </ThemedView>
                {/* Actions */}
                <TouchableOpacity
                    style={{
                        backgroundColor: '#fff',
                        borderRadius: 8,
                        paddingVertical: 12,
                        paddingHorizontal: 32,
                        marginTop: 12,
                        borderWidth: 1,
                        borderColor: Colors.light.tint,
                        shadowColor: Colors.light.tint,
                        shadowOpacity: 0.08,
                        shadowRadius: 4,
                        elevation: 1,
                    }}
                    onPress={() => {/* TODO: Implement logout */ }}
                >
                    <ThemedText style={{ color: Colors.light.tint, fontWeight: 'bold', fontSize: 16 }}>
                        Log Out
                    </ThemedText>
                </TouchableOpacity>
            </ScrollView>

        </>
    );
}
