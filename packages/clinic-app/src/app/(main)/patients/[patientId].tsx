import { useLocalSearchParams, Stack } from "expo-router";
import { useMemo } from "react";

import ThemedView from "@components/ThemedView";
import ThemedText from "@components/ThemedText";
import PatientProfileScreen from "@screens/main/patient/PatientProfileScreen";
import { getPatientProfileById } from "@data/patients";

const PatientProfileRoute = () => {
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();

  const numericId = useMemo(() => {
    if (!patientId) {
      return null;
    }

    const parsed = Number.parseInt(Array.isArray(patientId) ? patientId[0] : patientId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [patientId]);

  const patient = numericId != null ? getPatientProfileById(numericId) : null;

  if (!patient) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedView className="flex-1 items-center justify-center bg-surface dark:bg-surface-dark px-6">
          <ThemedText variant="header" className="mb-2 text-center">
            Patient Not Found
          </ThemedText>
          <ThemedText variant="caption" className="text-center text-muted-foreground dark:text-muted-foreground-dark">
            We couldn't locate the patient details you're looking for. Please return to the patient list and try again.
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
