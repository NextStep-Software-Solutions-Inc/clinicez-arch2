import React, { useState } from "react";
import { ScrollView, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";

export default function BookAppointmentScreen() {
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [selectedTime, setSelectedTime] = useState<string | null>(null);

	// Dummy doctors data
	const doctors = [
		{
			id: "1",
			name: "Dr. Sarah Smith",
			specialization: "General Practitioner",
			available: true,
		},
		{
			id: "2",
			name: "Dr. James Lee",
			specialization: "Cardiologist",
			available: true,
		},
		{
			id: "3",
			name: "Dr. Maria Patel",
			specialization: "Pediatrician",
			available: false,
		},
		{
			id: "4",
			name: "Dr. Robert Johnson",
			specialization: "Orthopedist",
			available: true,
		},
	];

	const availableTimes = [
		"09:00 AM",
		"10:00 AM",
		"11:00 AM",
		"02:00 PM",
		"03:00 PM",
		"04:00 PM",
	];

	return (
		<ThemedView className="flex-1">
			<ScrollView
				contentContainerStyle={{ padding: 16 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Doctor Selection */}
				<ThemedText className="text-lg font-bold mb-3">
					Select Doctor
				</ThemedText>
				<ThemedView className="mb-6">
					{doctors.map((doctor) => (
						<TouchableOpacity
							key={doctor.id}
							className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg p-4 mb-2"
							disabled={!doctor.available}
						>
							<ThemedView className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 items-center justify-center mr-3">
								<Feather name="user" size={24} color={Colors.light.tint} />
							</ThemedView>
							<ThemedView className="flex-1">
								<ThemedText className="font-semibold text-base">
									{doctor.name}
								</ThemedText>
								<ThemedText className="text-xs text-slate-600 dark:text-slate-400">
									{doctor.specialization}
								</ThemedText>
							</ThemedView>
							{!doctor.available && (
								<ThemedText className="text-xs text-red-500 font-semibold">
									Unavailable
								</ThemedText>
							)}
						</TouchableOpacity>
					))}
				</ThemedView>

				{/* Time Selection */}
				<ThemedText className="text-lg font-bold mb-3">Select Time</ThemedText>
				<ThemedView className="flex-row flex-wrap mb-6">
					{availableTimes.map((time) => (
						<TouchableOpacity
							key={time}
							onPress={() => setSelectedTime(time)}
							className={`w-1/3 p-2 mb-2`}
						>
							<ThemedView
								className={`rounded-lg py-3 items-center justify-center border ${
									selectedTime === time
										? "bg-blue-600 border-blue-600"
										: "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
								}`}
							>
								<ThemedText
									className={`text-sm font-semibold ${
										selectedTime === time
											? "text-white"
											: "text-slate-900 dark:text-slate-100"
									}`}
								>
									{time}
								</ThemedText>
							</ThemedView>
						</TouchableOpacity>
					))}
				</ThemedView>

				{/* Book Button */}
				<TouchableOpacity
					className="bg-blue-600 rounded-lg py-4 items-center mb-4"
					onPress={() => {
						// Handle booking
						alert("Appointment booked!");
					}}
				>
					<ThemedText className="text-white font-bold text-base">
						Book Appointment
					</ThemedText>
				</TouchableOpacity>
			</ScrollView>
		</ThemedView>
	);
}
