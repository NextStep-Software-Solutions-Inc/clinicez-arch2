import React, { useMemo, useState } from "react";
import { View } from "react-native";
import Toast from "react-native-toast-message";

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
import { AddPatientForm } from "../../../forms/add-patient";
import type { CreateBasicInfoInput } from "../../../schemas/patient.schema";
import { useCreatePatient } from "../../../hooks/useCreatePatient";
import { usePatients } from "../../../hooks/usePatients";
import { transformPatientsToSummaries } from "../../../lib/patient-transform";
import InvitePatientDialog from "@components/InvitePatientDialog";
import type { PatientSummary } from "@app-types/patient";
// import { useLiveUsers } from "@hooks/useLiveUsers";

const PatientsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomSpacing = Math.max(tabBarHeight - insets.bottom - 4, 0);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  // TODO: Replace with actual tenant ID from authentication context once backend is ready
  // Example: const { user } = useAuth(); const tenantId = user?.tenantId;
  // This temporary value should be replaced when integrating with the backend authentication system
  const TEMP_TENANT_ID = "temp-tenant-id";

  // Fetch patients from SQLite
  const { patients: dbPatients, isLoading: isLoadingPatients, error: patientsError, refetch: refetchPatients } = usePatients({
    tenantId: TEMP_TENANT_ID,
  });

  // Transform database patients to UI format
  const patients = useMemo<PatientSummary[]>(
    () => transformPatientsToSummaries(dbPatients),
    [dbPatients]
  );

  const { createPatient, isCreating, error } = useCreatePatient({
    tenantId: TEMP_TENANT_ID,
    onSuccess: (result) => {
      // Refresh patient list
      refetchPatients();

      // Show toast and close drawer after it's visible
      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Patient has been added successfully!",
        position: "top",
        visibilityTime: 6000,
        topOffset: 60,
        onShow: () => {
          // Close drawer once toast is visible
          setIsDrawerOpen(false);
        },
      });
    },
    onError: (errorMsg) => {
      // Show error toast
      Toast.show({
        type: "error",
        text1: "Error",
        text2: errorMsg,
        position: "top",
        visibilityTime: 4000,
      });
    },
  });

  const handleAddPatient = async (data: Partial<CreateBasicInfoInput>) => {
    // Validate required fields
    if (!data.firstName || !data.lastName || !data.email || !data.phoneNumber) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please fill in all required fields",
        position: "top",
        visibilityTime: 3000,
      });
      return;
    }

    // Create patient with SQLite
    await createPatient(data as CreateBasicInfoInput);
  };

  const handleStepChange = (stepIndex: number, stepKey: string) => {
    // Optional: Track analytics
  };

  const handleInvite = () => {
    setIsInviteDialogOpen(true);
  };

  const handleInviteComplete = () => {
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
      params: { patientId: patient.id },
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
        {isLoadingPatients ? (
          <View className="flex-1 items-center justify-center">
            <ThemedText className="text-muted dark:text-muted-dark">
              Loading patients...
            </ThemedText>
          </View>
        ) : patientsError ? (
          <View className="flex-1 items-center justify-center px-6">
            <ThemedIcon icon="alert-circle" size={48} className="text-destructive dark:text-destructive-dark mb-4" />
            <ThemedText className="text-destructive dark:text-destructive-dark text-center mb-4">
              {patientsError}
            </ThemedText>
            <ThemedButton onPress={refetchPatients} variant="outline">
              <ThemedText>Try Again</ThemedText>
            </ThemedButton>
          </View>
        ) : patients.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <ThemedIcon icon="users" size={48} className="text-muted dark:text-muted-dark mb-4" />
            <ThemedText className="text-muted dark:text-muted-dark text-center mb-2">
              No patients yet
            </ThemedText>
            <ThemedText className="text-muted dark:text-muted-dark text-center text-sm">
              Add your first patient to get started
            </ThemedText>
          </View>
        ) : (
          <PatientList
            patients={filteredPatients}
            contentContainerStyle={{ paddingBottom: bottomSpacing }}
            onPatientPress={handlePatientPress}
          />
        )}
      </ThemedView>

      {/* Add Patient Drawer with Multi-Step Form */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => !isCreating && setIsDrawerOpen(false)}
      >
        <AddPatientForm
          onComplete={handleAddPatient}
          onStepChange={handleStepChange}
          isSubmitting={isCreating}
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
