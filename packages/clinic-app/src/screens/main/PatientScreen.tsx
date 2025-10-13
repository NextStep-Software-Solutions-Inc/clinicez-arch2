import React, { useState } from "react";
import { View } from "react-native";

import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedView from "@components/ThemedView";
import { ThemedInput } from "@components/ThemedInput";
import ThemedButton from "@components/ThemedButton";
import ThemedText from "@components/ThemedText";
import ThemedIcon from "@components/ThemedIcon";
import PatientList, { PatientData } from "@components/PatientList";
import Drawer from "@components/Drawer";
import AddNewPatientForm, { NewPatientFormData } from "@components/patient/AddNewPatientForm";

const PATIENTS: PatientData[] = [
  {
    id: 1,
    name: "John Doe",
    age: 45,
    gender: "male",
    lastVisit: "2023-09-15",
    nextAppointment: "2023-10-15",
    diagnosis: "Hypertension",
    hp: {
      name: "Dr. Smith",
      specialization: "Cardiologist",
    },
  },
  {
    id: 2,
    name: "Jane Smith",
    age: 30,
    gender: "female",
    lastVisit: "2023-09-10",
    nextAppointment: "2023-10-10",
    diagnosis: "Anxiety",
    hp: {
      name: "Dr. Johnson",
      specialization: "Psychiatrist",
    },
  },
  {
    id: 3,
    name: "Michael Brown",
    age: 60,
    gender: "male",
    lastVisit: "2023-09-05",
    nextAppointment: "2023-10-05",
    diagnosis: "Diabetes",
    hp: {
      name: "Dr. Lee",
      specialization: "Endocrinologist",
    },
  },
  {
    id: 4,
    name: "Emily Davis",
    age: 25,
    gender: "female",
    lastVisit: "2023-09-01",
    nextAppointment: "2023-10-01",
    diagnosis: "Asthma",
    hp: {
      name: "Dr. Wilson",
      specialization: "Pulmonologist",
    },
  },
  {
    id: 5,
    name: "David Wilson",
    age: 50,
    gender: "male",
    lastVisit: "2023-08-28",
    nextAppointment: "2023-09-28",
    diagnosis: "Hyperlipidemia",
    hp: {
      name: "Dr. Taylor",
      specialization: "Cardiologist",
    },
  }
];
const PatientsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSpacing = Math.max(tabBarHeight - insets.bottom - 4, 0);

  const [searchQuery, setSearchQuery] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleAddPatient = async (data: NewPatientFormData) => {
    console.log("Adding new patient:", data);
    // TODO: Implement patient creation API call
    setIsDrawerOpen(false);
  };

  const handleInvite = () => {
    console.log("Invite patient");
    // TODO: Implement invite functionality
  };

  const filteredPatients = searchQuery
    ? PATIENTS.filter((patient) =>
      patient.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : PATIENTS;

  return (
    <View
      style={{
        paddingTop: 16,
        paddingBottom: 0,
      }}
      className="flex-1 bg-background dark:bg-background-dark"
    >
      <ThemedView variant="transparent" className="flex-1 px-6">
        <View className="gap-3 mb-4">
          <ThemedInput
            placeholder="Search patients..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            variant="outlined"
            size="md"
            className="rounded-full"
            leftIcon={
              <ThemedIcon
                icon="search"
                size="default"
                className="text-muted dark:text-muted-dark"
              />
            }
          />
          <View className="flex-row gap-3">
            <ThemedButton
              className="flex-1 flex-row items-center justify-center"
              onPress={() => setIsDrawerOpen(true)}
            >
              <View className="flex-row items-center gap-2">
                <ThemedIcon
                  icon="plus"
                  size={18}
                  color="white"
                />
                <ThemedText variant="button" className="text-primary-foreground dark:text-primary-contrast font-semibold">
                  Add Patient
                </ThemedText>
              </View>
            </ThemedButton>
            <ThemedButton
              variant="outline"
              size="default"
              className="flex-1 flex-row items-center justify-center"
              onPress={handleInvite}
            >
              <View className="flex-row items-center gap-2">
                <ThemedIcon
                  icon="mail"
                  size={18}
                  className="text-primary dark:text-primary-dark"
                />
                <ThemedText className="font-semibold">Invite</ThemedText>
              </View>
            </ThemedButton>
          </View>
        </View>

        {/* Patient List */}
        <PatientList
          patients={filteredPatients}
          contentContainerStyle={{ paddingBottom: bottomSpacing }}
        />
      </ThemedView>

      {/* Add Patient Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Add New Patient"
        description="Enter the patient's basic information"
      >
        <AddNewPatientForm
          onSubmit={handleAddPatient}
          onCancel={() => setIsDrawerOpen(false)}
        />
      </Drawer>
    </View>
  );
};

PatientsScreen.displayName = "PatientsScreen";

export default PatientsScreen;
