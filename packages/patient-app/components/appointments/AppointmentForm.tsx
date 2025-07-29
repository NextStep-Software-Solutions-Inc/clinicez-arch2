import React, { useState } from 'react';
import SelectModal from './SelectModal';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { TextInput, TouchableOpacity, Platform } from 'react-native';
import { TimeSlotGrid } from './DateSlotGrid';
import { CalendarGrid } from './CalendarGrid';
import { Feather } from '@expo/vector-icons';

interface AppointmentFormProps {
    onSuccess: () => void;
}

const doctorSpecialties: Record<string, string> = {
    'Dr. Alexandra Smith-Johnson': 'General Practitioner',
    'Dr. Benjamin Lee, MD, PhD': 'Pediatrics',
    'Dr. Priyanka Patel-Ramirez': 'Cardiology',
    'Dr. Guillermo Gomez de la Fuente': 'Dentist',
    'Dr. Catherine Carter-Williams': 'Orthopedics',
    'Dr. Smith': 'General Practitioner',
    'Dr. Lee': 'Pediatrics',
    'Dr. Patel': 'Cardiology',
    'Dr. Gomez': 'Dentist',
    'Dr. Carter': 'Orthopedics',
};

export default function AppointmentForm({ onSuccess }: AppointmentFormProps) {
    const [about, setAbout] = useState('');
    const [doctor, setDoctor] = useState('');
    const [department, setDepartment] = useState('General');
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [showDoctorModal, setShowDoctorModal] = useState(false);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    // Calendar state
    const today = new Date();
    const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
    const [calendarYear, setCalendarYear] = useState(today.getFullYear());

    // Helper to check if a month/year is before today
    const isPastMonth = (year: number, month: number) => {
        return year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());
    };

    // Helper to handle date selection and sync month/year if needed
    const handleDateSelect = (dateStr: string) => {
        setDate(dateStr);
        const [y, m, d] = dateStr.split('-').map(Number);
        if (y !== calendarYear || m - 1 !== calendarMonth) {
            setCalendarYear(y);
            setCalendarMonth(m - 1);
        }
    };

    // Example: available slots per doctor/department/date (mocked)
    const allSlots = [
        '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM',
        '10:30 AM', '11:00 AM', '11:30 AM', '01:00 PM', '01:30 PM',
        '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM',
    ];
    // In a real app, filter slots based on doctor/department/date
    const availableSlots = date ? allSlots : [];
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            onSuccess();
        }, 900);
    };

    return (
        <ThemedView className="gap-5">
            <ThemedView>
                <ThemedText className="font-semibold mb-2">Department / Service</ThemedText>
                <TouchableOpacity
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 bg-transparent flex-row items-center justify-between"
                    onPress={() => setShowDeptModal(true)}
                    activeOpacity={0.85}
                >
                    <ThemedText className="text-base text-slate-700 dark:text-slate-200">
                        {department || 'Select department'}
                    </ThemedText>
                    <Feather name="chevron-down" size={18} color="#64748b" />
                </TouchableOpacity>
                <SelectModal
                    visible={showDeptModal}
                    onClose={() => setShowDeptModal(false)}
                    options={[
                        { label: 'General', value: 'General' },
                        { label: 'Dental', value: 'Dental' },
                        { label: 'Eye', value: 'Eye' },
                        { label: 'Pediatrics', value: 'Pediatrics' },
                        { label: 'Cardiology', value: 'Cardiology' },
                        { label: 'Orthopedics', value: 'Orthopedics' },
                        { label: 'ENT', value: 'ENT' },
                        { label: 'Other', value: 'Other' },
                    ]}
                    value={department}
                    onSelect={setDepartment}
                    title="Select Department / Service"
                />
            </ThemedView>
            <ThemedView>
                <ThemedText className="font-semibold mb-2">Reason / About</ThemedText>
                <TextInput
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base bg-transparent min-h-[80px]"
                    placeholder="Describe your reason for the appointment..."
                    value={about}
                    onChangeText={setAbout}
                    placeholderTextColor="#94a3b8"
                    multiline
                    textAlignVertical="top"
                    maxLength={1000}
                    autoCorrect
                    autoCapitalize="sentences"
                />
            </ThemedView>
            <ThemedView>
                <ThemedText className="font-semibold mb-2">Doctor (optional)</ThemedText>
                <TouchableOpacity
                    className="border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 bg-transparent flex-row items-center justify-between"
                    onPress={() => setShowDoctorModal(true)}
                    activeOpacity={0.85}
                >
                    <ThemedText className="text-base text-slate-700 dark:text-slate-200">
                        {doctor || 'No preference / First time'}
                    </ThemedText>
                    <Feather name="chevron-down" size={18} color="#64748b" />
                </TouchableOpacity>
                <SelectModal
                    visible={showDoctorModal}
                    onClose={() => setShowDoctorModal(false)}
                    options={[
                        { label: 'No preference / First time', value: '' },
                        { label: 'Dr. Alexandra Smith-Johnson — General Practitioner', value: 'Dr. Alexandra Smith-Johnson' },
                        { label: 'Dr. Benjamin Lee, MD, PhD — Pediatrics', value: 'Dr. Benjamin Lee, MD, PhD' },
                        { label: 'Dr. Priyanka Patel-Ramirez — Cardiology', value: 'Dr. Priyanka Patel-Ramirez' },
                        { label: 'Dr. Guillermo Gomez de la Fuente — Dentist', value: 'Dr. Guillermo Gomez de la Fuente' },
                        { label: 'Dr. Catherine Carter-Williams — Orthopedics', value: 'Dr. Catherine Carter-Williams' },
                    ]}
                    value={doctor}
                    onSelect={setDoctor}
                    title="Select Doctor"
                />
                {doctor && (
                    <ThemedView className="mt-2 ml-1 max-w-full">
                        <ThemedText className="text-sm text-slate-500 dark:text-slate-400" numberOfLines={2} ellipsizeMode="tail">
                            Specialization: {doctorSpecialties[doctor] || 'N/A'}
                        </ThemedText>
                    </ThemedView>
                )}
            </ThemedView>
            <ThemedView>
                <ThemedText className="font-semibold mb-2">Date</ThemedText>
                <ThemedView className="flex-row items-center justify-between mb-2">
                    <TouchableOpacity
                        onPress={() => {
                            if (calendarMonth === 0) {
                                if (!isPastMonth(calendarYear - 1, 11)) {
                                    setCalendarMonth(11);
                                    setCalendarYear(y => y - 1);
                                }
                            } else {
                                if (!isPastMonth(calendarYear, calendarMonth - 1)) {
                                    setCalendarMonth(m => m - 1);
                                }
                            }
                        }}
                        disabled={isPastMonth(calendarMonth === 0 ? calendarYear - 1 : calendarYear, calendarMonth === 0 ? 11 : calendarMonth - 1)}
                        style={{ opacity: isPastMonth(calendarMonth === 0 ? calendarYear - 1 : calendarYear, calendarMonth === 0 ? 11 : calendarMonth - 1) ? 0.3 : 1 }}
                    >
                        <Feather name="chevron-left" size={20} color="#334155" />
                    </TouchableOpacity>
                    <ThemedText className="font-semibold text-base">
                        {new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long' })} {calendarYear}
                    </ThemedText>
                    <TouchableOpacity
                        onPress={() => {
                            if (calendarMonth === 11) {
                                setCalendarMonth(0);
                                setCalendarYear(y => y + 1);
                            } else {
                                setCalendarMonth(m => m + 1);
                            }
                        }}
                    >
                        <Feather name="chevron-right" size={20} color="#334155" />
                    </TouchableOpacity>
                </ThemedView>
                <CalendarGrid
                    year={calendarYear}
                    month={calendarMonth}
                    selectedDate={date}
                    onSelect={handleDateSelect}
                    minDate={`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`}
                />
            </ThemedView>
            {date && (
                <ThemedView>
                    <ThemedText className="font-semibold mb-2">Time Slot</ThemedText>
                    <TimeSlotGrid slots={availableSlots} selectedTime={time} onSelect={setTime} />
                </ThemedView>
            )}
            {error ? (
                <ThemedText className="text-red-600 text-center mt-2">{error}</ThemedText>
            ) : null}
            <TouchableOpacity
                className="bg-blue-600 dark:bg-blue-700 rounded-xl py-4 flex-row items-center justify-center mt-2"
                onPress={handleSubmit}
                disabled={loading}
                style={{ opacity: loading ? 0.7 : 1 }}
            >
                {loading ? (
                    <Feather name="loader" size={20} color="#fff" style={{ marginRight: 8 }} />
                ) : (
                    <Feather name="plus-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                )}
                <ThemedText className="text-white font-bold text-base">
                    {loading ? 'Booking...' : 'Book Appointment'}
                </ThemedText>
            </TouchableOpacity>
        </ThemedView>
    );
}
