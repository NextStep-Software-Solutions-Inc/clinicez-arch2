import React from "react";
import { useUser } from "@clerk/clerk-expo";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedText from "@components/ThemedText";
import ThemedCard from "@components/ThemedCard";
import ThemedBadge from "@components/ThemedBadge";
import ThemedButton from "@components/ThemedButton";
import ThemedIcon from "@components/ThemedIcon";
import UserAvatar from "@components/UserAvatar";
import type {
  HealthcareProviderRole,
  FieldOfStudy,
} from "@app-types/healthcare-provider";

type InfoRowProps = {
  icon: string;
  label: string;
  value: string | React.ReactNode;
  onPress?: () => void;
};

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, onPress }) => {
  const content = (
    <>
      <View className="flex-row items-center gap-3 flex-1">
        <View className="w-10 h-10 items-center justify-center rounded-full bg-accent dark:bg-accent-dark">
          <ThemedIcon icon={icon} size="sm" color="primary" />
        </View>
        <View className="flex-1">
          <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark mb-1 text-left">
            {label}
          </ThemedText>
          {typeof value === "string" ? (
            <ThemedText variant="body" className="font-medium text-left">
              {value}
            </ThemedText>
          ) : (
            value
          )}
        </View>
      </View>
      {onPress && (
        <ThemedIcon icon="chevron-right" size="sm" color="muted" />
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className="flex-row items-center justify-between py-3 active:bg-accent/10 dark:active:bg-accent-dark/10"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View className="flex-row items-center justify-between py-3">
      {content}
    </View>
  );
};
InfoRow.displayName = "InfoRow";

// Mock Data
const mockHealthcareProvider = {
  role: "doctor" as HealthcareProviderRole,
  fieldOfStudy: "internal_medicine" as FieldOfStudy,
  yearsOfExperience: 15,
  specializations: ["Cardiology", "Internal Medicine", "Preventive Care"],
  licenseNumber: "MD-2024-12345",
  licenseIssued: "2024-01-15",
  licenseExpiry: "2026-01-15",
  ptrNumber: "PTR-2024-67890",
  tinNumber: "123-456-789-000",
  clinic: "City Medical Center",
  education: [
    { degree: "Doctor of Medicine (MD)", institution: "Harvard Medical School", year: "2009" },
    { degree: "Bachelor of Science in Biology", institution: "Stanford University", year: "2005" },
  ],
  phoneNumber: "+1 (555) 123-4567",
  emergencyContact: "+1 (555) 987-6543",
};

const roleLabels: Record<HealthcareProviderRole, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  physician_assistant: "Physician Assistant",
  medical_technologist: "Medical Technologist",
  therapist: "Therapist",
  administrative_staff: "Administrative Staff",
};

const fieldOfStudyLabels: Record<FieldOfStudy, string> = {
  general_medicine: "General Medicine",
  pediatrics: "Pediatrics",
  internal_medicine: "Internal Medicine",
  surgery: "Surgery",
  nursing: "Nursing",
  physical_therapy: "Physical Therapy",
  radiology: "Radiology",
  pharmacy: "Pharmacy",
};

const HPProfileScreen: React.FC = () => {
  const { user } = useUser();

  const handleEditProfile = () => {
    // TODO: Navigate to edit profile screen
    console.log("Edit profile");
  };

  const handleContactPress = (type: string) => {
    console.log(`Contact via ${type}`);
  };

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 32 }}
      >
        {/* Personal Information Card */}
        <ThemedCard className="mx-4 mt-4 shadow-none bg-base dark:bg-surface-elevated-dark">
          <ThemedCard.Content>
            {/* Avatar and Personal Details */}
            <View className="items-center gap-4">
              <UserAvatar
                imageUrl={user?.imageUrl}
                name={user?.fullName || ""}
                size={80}
                className="border-2 border-border dark:border-border-dark"
              />
              <View className="flex-1">
                <ThemedText variant="header" className="text-xl font-bold text-left">
                  {user?.fullName || "Healthcare Provider"}
                </ThemedText>
              </View>
            </View>

            {/* Specialization and Role */}
            <View className="items-center">
              <ThemedText variant="body" className="text-foreground dark:text-foreground-dark mb-2 text-left">
                {fieldOfStudyLabels[mockHealthcareProvider.fieldOfStudy]}
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                <ThemedBadge variant="outline" size="sm">
                  {roleLabels[mockHealthcareProvider.role]}
                </ThemedBadge>
              </View>
            </View>

            {/* Edit Profile Button */}
            <ThemedButton
              variant="default"
              size="sm"
              leftIcon="edit"
              onPress={handleEditProfile}
            >
              <ThemedText className="font-semibold text-primary-foreground dark:text-primary-foreground-dark">
                Edit Profile
              </ThemedText>
            </ThemedButton>
          </ThemedCard.Content>
        </ThemedCard>

        {/* Credentials and Education Card */}
        <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
          <ThemedCard.Header>
            <ThemedCard.Title className="text-2xl text-left">Credentials and Education</ThemedCard.Title>
          </ThemedCard.Header>
          <ThemedCard.Content>
            {mockHealthcareProvider.education.map((edu, index) => (
              <View
                key={index}
                className="py-3"
              >
                <ThemedText variant="body" className="font-semibold mb-1 text-left">
                  {edu.degree}
                </ThemedText>
                <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark text-left">
                  {edu.institution}
                </ThemedText>
              </View>
            ))}
          </ThemedCard.Content>
        </ThemedCard>

        {/* About Card */}
        <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
          <ThemedCard.Header>
            <ThemedCard.Title className="text-2xl text-left">About</ThemedCard.Title>
          </ThemedCard.Header>
          <ThemedCard.Content>
            <InfoRow
              icon="briefcase"
              label="Experience"
              value={`${mockHealthcareProvider.yearsOfExperience}+ years`}
            />
            <InfoRow
              icon="building-2"
              label="Clinic"
              value={mockHealthcareProvider.clinic}
            />
          </ThemedCard.Content>
        </ThemedCard>

        {/* Specializations Card */}
        <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
          <ThemedCard.Header>
            <ThemedCard.Title className="text-2xl text-left">Specializations</ThemedCard.Title>
          </ThemedCard.Header>
          <ThemedCard.Content>
            {mockHealthcareProvider.specializations.map((spec, index) => (
              <View key={index} className="flex-row items-start gap-3 py-3">
                <View className="w-10 h-10 items-center justify-center rounded-full bg-accent dark:bg-accent-dark mt-1">
                  <ThemedIcon icon="check-circle" size="sm" color="primary" />
                </View>
                <View className="flex-1">
                  <ThemedText variant="body" className="font-semibold mb-1 text-left">
                    {spec}
                  </ThemedText>
                  <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark text-left">
                    Specialized expertise in {spec.toLowerCase()} treatment and care
                  </ThemedText>
                </View>
              </View>
            ))}
          </ThemedCard.Content>
        </ThemedCard>

        {/* License Information Card */}
        <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
          <ThemedCard.Header>
            <ThemedCard.Title className="text-2xl text-left">License Information</ThemedCard.Title>
          </ThemedCard.Header>
          <ThemedCard.Content>
            <InfoRow
              icon="file-text"
              label="License Number"
              value={mockHealthcareProvider.licenseNumber}
            />
            <InfoRow
              icon="calendar"
              label="Issued Date"
              value={mockHealthcareProvider.licenseIssued}
            />
            <InfoRow
              icon="calendar-clock"
              label="Expiry Date"
              value={mockHealthcareProvider.licenseExpiry}
            />
            <InfoRow
              icon="file-badge"
              label="PTR Number"
              value={mockHealthcareProvider.ptrNumber}
            />
            <InfoRow
              icon="receipt"
              label="TIN Number"
              value={mockHealthcareProvider.tinNumber}
            />
          </ThemedCard.Content>
        </ThemedCard>

        {/* Contact Details Card */}
        <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
          <ThemedCard.Header>
            <ThemedCard.Title className="text-2xl text-left">Contact Detail</ThemedCard.Title>
          </ThemedCard.Header>
          <ThemedCard.Content>
            <InfoRow
              icon="mail"
              label="Email"
              value={user?.primaryEmailAddress?.emailAddress || ""}
              onPress={() => handleContactPress("email")}
            />
            <InfoRow
              icon="phone"
              label="Phone Number"
              value={mockHealthcareProvider.phoneNumber}
              onPress={() => handleContactPress("phone")}
            />
            <InfoRow
              icon="phone-call"
              label="Emergency Contact"
              value={mockHealthcareProvider.emergencyContact}
              onPress={() => handleContactPress("emergency")}
            />
          </ThemedCard.Content>
        </ThemedCard>
      </ScrollView>
    </View>
  );
};
HPProfileScreen.displayName = "HPProfileScreen";

export default HPProfileScreen;
