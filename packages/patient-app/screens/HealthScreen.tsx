import React, { useState } from 'react';
import { format } from 'date-fns';
import { ScrollView, TouchableOpacity, Modal, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

const dummyHealth = {
    // overview removed, now only health history and conditions
    allergies: [
        { allergen: 'Peanuts', reaction: 'Anaphylaxis' },
        { allergen: 'Penicillin', reaction: 'Rash' },
        { allergen: 'Latex', reaction: 'Hives' },
        { allergen: 'Shellfish', reaction: 'Swelling' },
        { allergen: 'Dust Mites', reaction: 'Sneezing' },
        { allergen: 'Ibuprofen', reaction: 'Stomach pain' },
    ],
    medicalHistory: [
        {
            date: '2018-04-12',
            event: 'Diagnosed with Hypertension',
            doctor: 'Dr. Lee',
            location: 'City Clinic',
            notes: 'Patient presented with elevated blood pressure during routine checkup.'
        },
        {
            date: '2019-09-03',
            event: 'Hospitalized for Pneumonia',
            doctor: 'Dr. Smith',
            location: 'General Hospital',
            notes: 'Admitted for 5 days, treated with antibiotics.'
        },
        {
            date: '2020-02-18',
            event: 'Gallbladder Removal Surgery',
            doctor: 'Dr. Carter',
            location: 'Surgical Center',
            notes: 'Laparoscopic cholecystectomy, no complications.'
        },
        {
            date: '2021-07-22',
            event: 'Diabetes Type 2 Diagnosis',
            doctor: 'Dr. Patel',
            location: 'Endocrine Clinic',
            notes: 'Diagnosed after abnormal HbA1c results.'
        },
        {
            date: '2022-03-10',
            event: 'Appendectomy',
            doctor: 'Dr. Gomez',
            location: 'General Hospital',
            notes: 'Emergency surgery, recovered well.'
        },
        {
            date: '2022-08-15',
            event: 'Routine Cardiology Checkup',
            doctor: 'Dr. Lee',
            location: 'City Clinic',
            notes: 'No new findings.'
        },
        {
            date: '2023-01-28',
            event: 'Asthma Diagnosis',
            doctor: 'Dr. Patel',
            location: 'Pulmonary Center',
            notes: 'Prescribed inhaler.'
        },
        {
            date: '2023-03-12',
            event: 'ER Visit for Migraine',
            doctor: 'Dr. Smith',
            location: 'General Hospital',
            notes: 'Treated with IV fluids and pain relief.'
        },
        {
            date: '2023-05-05',
            event: 'Physical Therapy for Back Pain',
            doctor: 'Dr. Carter',
            location: 'Rehab Center',
            notes: 'Attended 8 sessions.'
        },
        {
            date: '2024-02-14',
            event: 'Fractured Wrist',
            doctor: 'Dr. Gomez',
            location: 'General Hospital',
            notes: 'Cast for 6 weeks.'
        },
        {
            date: '2024-07-18',
            event: 'Hospitalized for Severe Allergic Reaction',
            doctor: 'Dr. Lee',
            location: 'General Hospital',
            notes: 'Treated with epinephrine and steroids.'
        },
        {
            date: '2025-01-05',
            event: 'Annual Physical Exam',
            doctor: 'Dr. Carter',
            location: 'City Clinic',
            notes: 'All labs normal.'
        },
        {
            date: '2025-03-20',
            event: 'Routine Blood Pressure Monitoring',
            doctor: 'Dr. Lee',
            location: 'City Clinic',
            notes: 'Stable readings.'
        },
        {
            date: '2025-06-02',
            event: 'Specialist Consultation: Endocrinology',
            doctor: 'Dr. Patel',
            location: 'Endocrine Clinic',
            notes: 'Reviewed diabetes management.'
        },
    ],
    chronicConditions: [
        {
            name: 'Hypertension',
            diagnosed: '2018-04-12',
            doctor: 'Dr. Lee',
            notes: 'Elevated blood pressure during routine checkup.'
        },
        {
            name: 'Diabetes Type 2',
            diagnosed: '2021-07-22',
            doctor: 'Dr. Patel',
            notes: 'Abnormal HbA1c results.'
        },
        {
            name: 'Asthma',
            diagnosed: '2023-01-28',
            doctor: 'Dr. Patel',
            notes: 'Prescribed inhaler.'
        },
        {
            name: 'Chronic Back Pain',
            diagnosed: '2023-05-05',
            doctor: 'Dr. Carter',
            notes: 'Attended 8 physical therapy sessions.'
        },
    ],
    procedures: [
        {
            year: 2020,
            procedure: 'Gallbladder Removal',
            doctor: 'Dr. Carter',
            location: 'Surgical Center',
            notes: 'Laparoscopic cholecystectomy, no complications.'
        },
        {
            year: 2022,
            procedure: 'Appendectomy',
            doctor: 'Dr. Gomez',
            location: 'General Hospital',
            notes: 'Emergency surgery, recovered well.'
        },
        {
            year: 2023,
            procedure: 'Physical Therapy',
            doctor: 'Dr. Carter',
            location: 'Rehab Center',
            notes: 'Attended 8 sessions.'
        },
    ],
    hospitalVisits: [
        { date: '2023-03-12', reason: 'Migraine' },
        { date: '2024-07-18', reason: 'Allergic Reaction' },
        { date: '2025-01-05', reason: 'Routine Checkup' },
    ],
    labs: [
        { date: '2025-06-10', test: 'CBC', result: 'Normal' },
        { date: '2025-05-22', test: 'Lipid Panel', result: 'High Cholesterol' },
        { date: '2025-04-15', test: 'Blood Sugar', result: 'Normal' },
        { date: '2025-03-10', test: 'HbA1c', result: '7.2%' },
        { date: '2025-02-20', test: 'Chest X-Ray', result: 'Clear' },
    ],
};

export default function HealthScreen() {
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [selectedType, setSelectedType] = useState<string | null>(null);

    // Helper to render modal content based on type
    const renderModalContent = () => {
        if (!selectedItem || !selectedType) return null;
        switch (selectedType) {
            case 'medicalHistory':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.event}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.date ? format(new Date(selectedItem.date), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="user" size={14} color={Colors.light.tint} /> {selectedItem.doctor}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.notes}</ThemedText>
                    </>
                );
            case 'chronicCondition':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.name}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.diagnosed ? format(new Date(selectedItem.diagnosed), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="user" size={14} color={Colors.light.tint} /> {selectedItem.doctor}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.notes}</ThemedText>
                    </>
                );
            case 'procedure':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.procedure}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.year}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="user" size={14} color={Colors.light.tint} /> {selectedItem.doctor}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="map-pin" size={14} color={Colors.light.tint} /> {selectedItem.location}</ThemedText>
                        <ThemedText style={{ fontSize: 14, color: '#888', marginBottom: 10 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.notes}</ThemedText>
                    </>
                );
            case 'clinicVisit':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>Clinic Visit</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.date ? format(new Date(selectedItem.date), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="info" size={14} color={Colors.light.tint} /> {selectedItem.reason}</ThemedText>
                    </>
                );
            case 'lab':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.test}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#444', marginBottom: 4 }}><Feather name="calendar" size={14} color={Colors.light.tint} /> {selectedItem.date ? format(new Date(selectedItem.date), 'MMM d, yyyy') : ''}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: selectedItem.result === 'Normal' ? '#059669' : '#e11d48', fontWeight: 'bold', marginBottom: 4 }}>Result: {selectedItem.result}</ThemedText>
                    </>
                );
            case 'allergy':
                return (
                    <>
                        <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8 }}>{selectedItem.allergen}</ThemedText>
                        <ThemedText style={{ fontSize: 15, color: '#e11d48', marginBottom: 4 }}>Reaction: {selectedItem.reaction}</ThemedText>
                    </>
                );
            default:
                return null;
        }
    };

    return (
        <ThemedView style={{ flex: 1, backgroundColor: 'linear-gradient(180deg, #e0e7ff 0%, #f8fafc 100%)' }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 0 }}>
                {/* Medical History - Compact Card with Unified Fonts */}
                <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12, marginBottom: 14, marginTop: 10, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
                    <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
                        <Feather name="book" size={16} color={Colors.light.tint} /> Medical History
                    </ThemedText>
                    {dummyHealth.medicalHistory.map((item, i) => (
                        <TouchableOpacity key={i} onPress={() => { setSelectedItem(item); setSelectedType('medicalHistory'); }}>
                            <ThemedView style={{ marginBottom: 8, backgroundColor: Colors.light.tint + '11', borderRadius: 8, padding: 8 }}>
                                <ThemedText style={{ fontSize: 13, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 2 }}>
                                    <Feather name="calendar" size={12} color={Colors.light.tint} /> {format(new Date(item.date), 'MMM d, yyyy')}: {item.event}
                                </ThemedText>
                                <ThemedText style={{ fontSize: 12, color: '#444', marginBottom: 2 }}>
                                    <Feather name="user" size={10} color={Colors.light.tint} /> {item.doctor}
                                </ThemedText>
                                <ThemedText style={{ fontSize: 12, color: '#888' }}>
                                    <Feather name="info" size={10} color={Colors.light.tint} /> {item.notes}
                                </ThemedText>
                            </ThemedView>
                        </TouchableOpacity>
                    ))}
                </ThemedView>

                {/* Chronic Conditions - Card with Vertical List (clickable) */}
                <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.09, shadowRadius: 6, elevation: 2 }}>
                    <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
                        <Feather name="alert-circle" size={15} color={Colors.light.tint} /> Chronic Conditions
                    </ThemedText>
                    {dummyHealth.chronicConditions.map((cond, i) => (
                        <TouchableOpacity key={i} onPress={() => { setSelectedItem(cond); setSelectedType('chronicCondition'); }}>
                            <ThemedView style={{ marginBottom: 8, backgroundColor: Colors.light.tint + '11', borderRadius: 8, padding: 8 }}>
                                <ThemedText style={{ fontSize: 14, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 2 }}>
                                    <Feather name="check-circle" size={12} color={Colors.light.tint} style={{ marginRight: 4 }} /> {cond.name}
                                </ThemedText>
                                <ThemedText style={{ fontSize: 12, color: '#888', marginBottom: 1 }}>
                                    <Feather name="calendar" size={10} color={Colors.light.tint} /> {format(new Date(cond.diagnosed), 'MMM d, yyyy')}
                                </ThemedText>
                                <ThemedText style={{ fontSize: 12, color: '#888', marginBottom: 1 }}>
                                    <Feather name="user" size={10} color={Colors.light.tint} /> {cond.doctor}
                                </ThemedText>
                                <ThemedText style={{ fontSize: 11, color: '#aaa' }} numberOfLines={2} ellipsizeMode="tail">
                                    <Feather name="info" size={9} color={Colors.light.tint} /> {cond.notes}
                                </ThemedText>
                            </ThemedView>
                        </TouchableOpacity>
                    ))}
                </ThemedView>

                {/* Procedures - Vertical Timeline with Details (clickable) */}
                <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.09, shadowRadius: 6, elevation: 2 }}>
                    <ThemedText style={{ fontSize: 17, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 7, letterSpacing: 0.2 }}>
                        <Feather name="tool" size={16} color={Colors.light.tint} /> Procedures
                    </ThemedText>
                    <ThemedView style={{ borderLeftWidth: 2, borderLeftColor: Colors.light.tint + '44', paddingLeft: 10 }}>
                        {dummyHealth.procedures.map((proc, i) => (
                            <TouchableOpacity key={i} onPress={() => { setSelectedItem(proc); setSelectedType('procedure'); }}>
                                <ThemedView style={{ marginBottom: 12, position: 'relative' }}>
                                    <View style={{ position: 'absolute', left: -16, top: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.light.tint, justifyContent: 'center', alignItems: 'center' }}>
                                        <Feather name="tool" size={7} color="#fff" />
                                    </View>
                                    <ThemedText style={{ fontSize: 14, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 1 }}>{proc.year}: {proc.procedure}</ThemedText>
                                    <ThemedText style={{ fontSize: 13, color: '#444', marginBottom: 1 }}><Feather name="user" size={11} color={Colors.light.tint} /> {proc.doctor}</ThemedText>
                                    <ThemedText style={{ fontSize: 12, color: '#888', marginBottom: 1 }}><Feather name="map-pin" size={10} color={Colors.light.tint} /> {proc.location}</ThemedText>
                                    <ThemedText style={{ fontSize: 12, color: '#888' }}><Feather name="info" size={10} color={Colors.light.tint} /> {proc.notes}</ThemedText>
                                </ThemedView>
                            </TouchableOpacity>
                        ))}
                    </ThemedView>
                </ThemedView>

                {/* Clinic Visits (clickable) */}
                <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
                    <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
                        <Feather name="map-pin" size={16} color={Colors.light.tint} /> Clinic Visits
                    </ThemedText>
                    <ThemedView style={{ borderLeftWidth: 2, borderLeftColor: Colors.light.tint + '55', paddingLeft: 10 }}>
                        {dummyHealth.hospitalVisits.map((visit, i) => (
                            <TouchableOpacity key={i} onPress={() => { setSelectedItem(visit); setSelectedType('clinicVisit'); }}>
                                <ThemedView style={{ marginBottom: 12, position: 'relative' }}>
                                    <View style={{ position: 'absolute', left: -16, top: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.light.tint, justifyContent: 'center', alignItems: 'center' }}>
                                        <Feather name="map-pin" size={7} color="#fff" />
                                    </View>
                                    <ThemedText style={{ fontSize: 13, color: Colors.light.tint, fontWeight: 'bold', marginBottom: 2 }}>{format(new Date(visit.date), 'MMM d, yyyy')}</ThemedText>
                                    <ThemedText style={{ fontSize: 12, color: '#444', marginBottom: 2 }}>{visit.reason}</ThemedText>
                                </ThemedView>
                            </TouchableOpacity>
                        ))}
                    </ThemedView>
                </ThemedView>

                {/* Laboratory Results (clickable) */}
                <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
                    <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
                        <Feather name="activity" size={16} color={Colors.light.tint} /> Laboratory Results
                    </ThemedText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                        {dummyHealth.labs.map((lab, i) => (
                            <TouchableOpacity key={i} onPress={() => { setSelectedItem(lab); setSelectedType('lab'); }}>
                                <ThemedView
                                    style={{
                                        minWidth: 100,
                                        maxWidth: 120,
                                        marginRight: 10,
                                        backgroundColor: '#f8fafc',
                                        borderRadius: 10,
                                        paddingVertical: 10,
                                        paddingHorizontal: 8,
                                        alignItems: 'flex-start',
                                        justifyContent: 'center',
                                        shadowColor: Colors.light.tint,
                                        shadowOpacity: 0.07,
                                        shadowRadius: 3,
                                        elevation: 1,
                                        borderLeftWidth: 4,
                                        borderLeftColor: lab.result === 'Normal' ? '#059669' : '#e11d48',
                                    }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                        <Feather name="activity" size={14} color={Colors.light.tint} style={{ marginRight: 4 }} />
                                        <ThemedText style={{ fontSize: 13, color: Colors.light.tint, fontWeight: 'bold', letterSpacing: 0.1 }}>{lab.test}</ThemedText>
                                    </View>
                                    <ThemedText style={{ fontSize: 12, color: '#444', marginBottom: 1 }}>
                                        <Feather name="calendar" size={10} color={Colors.light.tint} /> {format(new Date(lab.date), 'MMM d, yyyy')}
                                    </ThemedText>
                                    <ThemedText style={{ fontSize: 12, color: lab.result === 'Normal' ? '#059669' : '#e11d48', fontWeight: 'bold' }}>
                                        {lab.result}
                                    </ThemedText>
                                </ThemedView>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </ThemedView>

                {/* Allergies - Compact Badges, Tighter Grid (clickable) */}
                <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 }}>
                    <ThemedText style={{ fontSize: 17, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 6, letterSpacing: 0.2 }}>
                        <Feather name="alert-circle" size={16} color={Colors.light.tint} /> Allergies
                    </ThemedText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {dummyHealth.allergies.map((allergy, i) => (
                            <TouchableOpacity key={i} onPress={() => { setSelectedItem(allergy); setSelectedType('allergy'); }}>
                                <View style={{ backgroundColor: Colors.light.tint + '18', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 4, marginRight: 4, flexDirection: 'row', alignItems: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.04, shadowRadius: 1, elevation: 1 }}>
                                    <Feather name="alert-circle" size={10} color={Colors.light.tint} style={{ marginRight: 3 }} />
                                    <ThemedText style={{ fontSize: 12, color: Colors.light.tint, fontWeight: 'bold', marginRight: 4 }}>{allergy.allergen}</ThemedText>
                                    <ThemedText style={{ fontSize: 11, color: '#888', fontWeight: '500' }}>({allergy.reaction})</ThemedText>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ThemedView>
            </ScrollView>
            {/* Universal Details Modal for all sections */}
            <Modal
                visible={!!selectedItem}
                animationType="slide"
                transparent
                onRequestClose={() => { setSelectedItem(null); setSelectedType(null); }}
            >
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                    <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 18, minHeight: 160, shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
                        {renderModalContent()}
                        <TouchableOpacity onPress={() => { setSelectedItem(null); setSelectedType(null); }} style={{ alignSelf: 'flex-end', padding: 8, backgroundColor: Colors.light.tint + '22', borderRadius: 6 }}>
                            <ThemedText style={{ color: Colors.light.tint, fontWeight: 'bold', fontSize: 15 }}>Close</ThemedText>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ThemedView>
    );
}

