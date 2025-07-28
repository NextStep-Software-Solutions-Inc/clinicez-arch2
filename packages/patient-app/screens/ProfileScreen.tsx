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
import { SignOutButton } from '@/components/SignOutButton';


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

    // Disabilities and Illnesses (previously in HealthScreen)
    const disabilities = [
        {
            name: 'Hearing Impairment',
            diagnosed: '2020-06-15',
            doctor: 'Dr. Carter',
            notes: 'Uses hearing aid, regular audiology checkups.'
        },
        {
            name: 'Mobility Limitation',
            diagnosed: '2022-11-01',
            doctor: 'Dr. Lee',
            notes: 'Uses cane for walking, physical therapy ongoing.'
        }
    ];
    const illnesses = [
        {
            name: 'Diabetes Type 2',
            diagnosed: '2021-07-22',
            doctor: 'Dr. Patel',
            notes: 'Managed with medication and diet.'
        },
        {
            name: 'Asthma',
            diagnosed: '2023-01-28',
            doctor: 'Dr. Patel',
            notes: 'Prescribed inhaler.'
        }
    ];


    return (
        <>
            <ScrollView
                className='flex-1'
                contentContainerStyle={{ alignItems: 'center', padding: 14 }}>
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
                    <ThemedText style={{ fontSize: 14, marginBottom: 4 }}
                        className='dark:text-slate-500'
                    >
                        Gender: {user.gender}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}
                        className='dark:text-slate-500'
                    >
                        Birthdate: {user.birthdate}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}
                        className='dark:text-slate-500'
                    >
                        Blood Type: {user.blood_type}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}
                        className='dark:text-slate-500'
                    >
                        Religion: {user.religion}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}
                        className='dark:text-slate-500'
                    >
                        Email: {user.email_address}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 15, marginBottom: 4 }}
                        className='dark:text-slate-500'
                    >
                        Phone: {user.phone_number}
                    </ThemedText>
                </ProfileCard>

                {/* Disabilities & Illnesses Card */}
                <ProfileCard
                    title="Disabilities & Illnesses"
                    editTitle="Edit Disabilities & Illnesses"
                >
                    <ThemedText style={{ fontSize: 17, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>
                        Disabilities
                    </ThemedText>
                    {disabilities.map((dis, i) => (
                        <ThemedView key={i}
                            className='mb-4 p-4 bg-slate-200 dark:bg-slate-900 rounded-lg shadow-sm'
                        >
                            <ThemedText style={{ fontSize: 16, color: Colors.light.tint, fontWeight: 'bold' }}>{dis.name}</ThemedText>
                            <ThemedText style={{ fontSize: 14, color: '#666' }}>Diagnosed: {dis.diagnosed}</ThemedText>
                            <ThemedText style={{ fontSize: 14, color: '#666' }}>By: {dis.doctor}</ThemedText>
                            <ThemedText style={{ fontSize: 13, color: '#888' }}>{dis.notes}</ThemedText>
                        </ThemedView>
                    ))}
                    <ThemedText style={{ fontSize: 17, fontWeight: 'bold', color: Colors.light.tint, marginTop: 12, marginBottom: 8 }}>
                        Illnesses
                    </ThemedText>
                    {illnesses.map((ill, i) => (
                        <ThemedView key={i} className='mb-4 p-4 bg-slate-200 dark:bg-slate-900 rounded-lg shadow-sm'>
                            <ThemedText style={{ fontSize: 16, color: Colors.light.tint, fontWeight: 'bold' }}>{ill.name}</ThemedText>
                            <ThemedText style={{ fontSize: 14, color: '#666' }}>Diagnosed: {ill.diagnosed}</ThemedText>
                            <ThemedText style={{ fontSize: 14, color: '#666' }}>By: {ill.doctor}</ThemedText>
                            <ThemedText style={{ fontSize: 13, color: '#888' }}>{ill.notes}</ThemedText>
                        </ThemedView>
                    ))}
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
                <ThemedView
                    style={{
                        shadowColor: Colors.light.tint,
                        shadowOpacity: 0.12,
                        shadowRadius: 8,
                        elevation: 2,
                    }}
                    className="bg-slate-100 dark:bg-slate-800  rounded-lg p-4 mb-4 self-center shadow-md"
                >
                    <ThemedText style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 2 }}
                        className='dark:text-slate-500'
                    >
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
                <SignOutButton />
            </ScrollView>

        </>
    );
}
