import React, { useMemo, useState } from "react";
import { View } from "react-native";

import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import ThemedView from "@components/ThemedView";
import { ThemedInput } from "@components/ThemedInput";
import ThemedButton from "@components/ThemedButton";
import ThemedText from "@components/ThemedText";
import ThemedIcon from "@components/ThemedIcon";
import PatientList from "@components/PatientList";
import Drawer from "@components/Drawer";
import AddNewPatientForm, { NewPatientFormData } from "@components/patient/AddNewPatientForm";
import InvitePatientDialog from "@components/InvitePatientDialog";
import type { PatientSummary } from "@app-types/patient";
import { PATIENT_SUMMARIES } from "@data/patients";
import { useLiveUsers } from "@hooks/useLiveUsers";

const PatientsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSpacing = Math.max(tabBarHeight - insets.bottom - 4, 0);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const patients = useMemo<PatientSummary[]>(() => PATIENT_SUMMARIES, []);
  const users = useLiveUsers();
  console.log("Users in the DB: ", users.users);

  const handleAddPatient = async (data: NewPatientFormData) => {
    console.log("Adding new patient:", data);
    // TODO: Implement patient creation API call
    setIsDrawerOpen(false);
  };

  const handleInvite = () => {
    setIsInviteDialogOpen(true);
  };

  const handleInviteComplete = () => {
    console.log("Invite completed - patient can now use the link");
    // TODO: Add analytics or additional tracking if needed
  };

  const filteredPatients = useMemo(() => {
    if (!searchQuery) {
      return patients;
    }

    const query = searchQuery.toLowerCase();
    return patients.filter((patient) =>
      patient.name.toLowerCase().includes(query)
      || patient.diagnosis?.name.toLowerCase().includes(query)
      || patient.hp?.name.toLowerCase().includes(query)
    );
  }, [patients, searchQuery]);

  const handlePatientPress = (patient: PatientSummary) => {
    router.push({
      pathname: "/(main)/patients/[patientId]",
      params: { patientId: patient.id.toString() },
    });
  };

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
                  color="primaryForeground"
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
                  color="primary"
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
          onPatientPress={handlePatientPress}
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

      {/* Invite Patient Dialog */}
      <InvitePatientDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        clinicLink="https://clinicez.app/invite/demo-clinic-123"
        onInviteComplete={handleInviteComplete}
      />
    </View>
  );
};

PatientsScreen.displayName = "PatientsScreen";

export default PatientsScreen;
