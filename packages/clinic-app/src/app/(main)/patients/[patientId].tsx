import { useLocalSearchParams, Stack } from "expo-router";
import { useMemo } from "react";

import ThemedView from "@components/ThemedView";
import ThemedText from "@components/ThemedText";
import PatientProfileScreen from "@screens/main/patient/PatientProfileScreen";
import { usePatient } from "@hooks/usePatient";
import { transformPatientToProfile } from "@lib/patient-transform";
import { ActivityIndicator } from "react-native";

// TODO: Replace with actual tenant ID from authentication context
const TEMP_TENANT_ID = "temp-tenant-id";

const PatientProfileRoute = () => {
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();

  const patientIdString = useMemo(() => {
    if (!patientId) return null;
    return Array.isArray(patientId) ? patientId[0] : patientId;
  }, [patientId]);

  const { patient: dbPatient, isLoading, error } = usePatient({
    patientId: patientIdString || "",
    tenantId: TEMP_TENANT_ID,
    enabled: !!patientIdString,
  });

  const patient = useMemo(() => {
    if (!dbPatient) return null;
    return transformPatientToProfile(dbPatient);
  }, [dbPatient]);

  console.log("PatientProfileRoute - patient:", patient);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedView className="flex-1 items-center justify-center bg-surface dark:bg-surface-dark px-6">
          <ActivityIndicator size="large" />
          <ThemedText variant="caption" className="mt-4 text-muted-foreground dark:text-muted-foreground-dark">
            Loading patient profile...
          </ThemedText>
        </ThemedView>
      </>
    );
  }

  if (error || !patient) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedView className="flex-1 items-center justify-center bg-surface dark:bg-surface-dark px-6">
          <ThemedText variant="header" className="mb-2 text-center">
            Patient Not Found
          </ThemedText>
          <ThemedText variant="caption" className="text-center text-muted-foreground dark:text-muted-foreground-dark">
            {error?.userMessage || "We couldn't locate the patient details you're looking for. Please return to the patient list and try again."}
          </ThemedText>
        </ThemedView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PatientProfileScreen patient={patient} />
    </>
  );
};

PatientProfileRoute.displayName = "PatientProfileRoute";

export default PatientProfileRoute;
