/**
 * Example Screen: Add Patient with Multi-Step Form
 * 
 * This example demonstrates how to integrate the AddPatientForm
 * into a React Native screen.
 */

import React, { useState } from "react";
import { View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { AddPatientForm } from "../../forms/add-patient";
import type { CreateBasicInfoInput } from "../../schemas/patient.schema";
import ThemedView from "@components/ThemedView";
import { ThemedText } from "@components/ThemedText";

export default function AddPatientScreen() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async (data: Partial<CreateBasicInfoInput>) => {
    try {
      setIsSubmitting(true);

      // Log the complete patient data
      console.log("Patient data received:", data);

      // TODO: Replace with actual API call or database insert
      // Example:
      // const tenantId = getCurrentTenantId();
      // const basicInfoId = await insertBasicInfo({ ...data, tenantId });
      // const patientId = await insertPatient({ basicInfo: basicInfoId, tenantId });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Show success message
      Alert.alert(
        "Success",
        "Patient has been added successfully!",
        [
          {
            text: "OK",
            onPress: () => {
              // Navigate back or to patient list
              router.back();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error adding patient:", error);
      Alert.alert(
        "Error",
        "Failed to add patient. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStepChange = (stepIndex: number, stepKey: string) => {
    console.log(`User is now on step ${stepIndex + 1}: ${stepKey}`);
    // You can track analytics here
    // analytics.track('form_step_changed', { step: stepKey, stepIndex });
  };

  return (
    <ThemedView className="flex-1">
      {isSubmitting && (
        <View className="absolute inset-0 bg-black/50 z-50 items-center justify-center">
          <ThemedText className="text-white text-lg">
            Adding patient...
          </ThemedText>
        </View>
      )}

      <AddPatientForm
        onComplete={handleComplete}
        onStepChange={handleStepChange}
      />
    </ThemedView>
  );
}
