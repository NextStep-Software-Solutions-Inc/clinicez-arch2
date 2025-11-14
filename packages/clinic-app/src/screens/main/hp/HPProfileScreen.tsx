import React from "react";
import { useUser } from "@clerk/clerk-expo";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedText from "@components/ThemedText";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ThemedCard";
import ThemedBadge from "@components/ThemedBadge";
import ThemedButton from "@components/ThemedButton";
import ThemedIcon from "@components/ThemedIcon";
import UserAvatar from "@components/UserAvatar";
import type {
  HealthcareProviderRole,
  FieldOfStudy,
} from "@app-types/healthcare-provider";
import Each from "@components/Each";
import { router } from "expo-router";
import EditProfileDialog from "@components/hp/EditProfileDialog";

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
        <View className="w-10 h-10 items-center justify-center rounded-full">
          <ThemedIcon icon={icon} size="md" color="primary" />
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
        <ThemedIcon icon="chevron-right" size="md" color="muted" />
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

// Mock Data Types
type Education = {
  degree: string;
  institution: string;
  year: string;
};

type Specialization = {
  name: string;
  subspecialization: string;
};

type HealthcareProviderProfile = {
  role: HealthcareProviderRole;
  fieldOfStudy: FieldOfStudy;
  yearsOfExperience: number;
  experienceSummary: string;
  about: string;
  specializations: Specialization[];
  licenseNumber: string;
  licenseIssued: string;
  licenseExpiry: string;
  ptrNumber: string;
  tinNumber: string;
  clinic: string;
  education: Education[];
  phoneNumber: string;
  emergencyContact: string;
  dateOfBirth: string;
  gender: "Male" | "Female";
  nationality: string;
  civilStatus: string;
  religion: string;
  bloodType: string;
};

// Mock Data
const mockHealthcareProvider: HealthcareProviderProfile = {
  role: "doctor" as HealthcareProviderRole,
  fieldOfStudy: "internal_medicine" as FieldOfStudy,
  yearsOfExperience: 15,
  experienceSummary: "15+ years",
  about: "General Medicine with over 15 years of experience in patient care, specializing in cardiology and preventive medicine.",
  specializations: [
    {
      name: "Cardiology",
      subspecialization: "Heart Failure and Electrophysiology"
    },
    {
      name: "Internal Medicine",
      subspecialization: "General Adult Medicine"
    },
    {
      name: "Preventive Care",
      subspecialization: "Lifestyle Medicine and Wellness"
    },
  ],
  licenseNumber: "MD-2024-12345",
  licenseIssued: "January 15, 2024",
  licenseExpiry: "January 15, 2026",
  ptrNumber: "PTR-2024-67890",
  tinNumber: "123-456-789-000",
  clinic: "City Medical Center",
  education: [
    {
      degree: "Doctor of Medicine (MD)",
      institution: "Harvard Medical School",
      year: "2009"
    },
    {
      degree: "Bachelor of Science in Biology",
      institution: "Stanford University",
      year: "2005"
    },
  ],
  phoneNumber: "+1 (555) 123-4567",
  emergencyContact: "+1 (555) 987-6543",
  dateOfBirth: "March 15, 1983",
  gender: "Male",
  nationality: "American",
  civilStatus: "Married",
  religion: "Christian",
  bloodType: "O+",
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
    router.push("/(main)/hp/profile/edit");
  };

  const handleContactPress = (type: string) => {
    console.log(`Contact via ${type}`);
  };

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      >
        <View className="flex-col gap-6 px-4">
          {/** HP Profile w/ Picture */}
          <View className="flex-row items-center gap-6 rounded-2xl border border-border dark:border-border-dark p-6 bg-base dark:bg-background-dark shadow-sm">
            <UserAvatar
              imageUrl={user?.imageUrl}
              name={user?.fullName || "Healthcare Provider"}
              size={80}
            />

            <View className="flex-1">
              <View className="flex-row items-center gap-3 mb-2">
                <ThemedText variant="header" className="text-2xl font-bold">
                  {user?.fullName || "Healthcare Provider"}
                </ThemedText>

                <ThemedBadge variant="outline" className="border-primary dark:border-primary-dark">
                  <ThemedText className="text-primary dark:text-primary-dark font-medium">
                    {roleLabels[mockHealthcareProvider.role]}
                  </ThemedText>
                </ThemedBadge>
              </View>
              <ThemedText variant="body" className="text-muted-foreground dark:text-muted-foreground-dark">
                {fieldOfStudyLabels[mockHealthcareProvider.fieldOfStudy]}
              </ThemedText>
            </View>

            <View className="ml-auto">
              {/* <ThemedButton
                size="sm"
                leftIcon={
                  <ThemedIcon icon="edit" size={16} color={"base"} />
                }
                onPress={handleEditProfile}
              >
                <ThemedText className="font-semibold text-primary-foreground dark:text-primary-foreground-dark">
                  Edit Profile
                </ThemedText>
              </ThemedButton> */}
              <EditProfileDialog />
            </View>
          </View>

          <View className="sm:flex-row flex-col justify-between gap-2">
            <View className="flex-1 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <View className="py-3">
                    <View className="flex-row items-center gap-3">
                      <View className="w-10 h-10 items-center rounded-full">
                        <ThemedIcon icon="briefcase" size="md" color="primary" />
                      </View>
                      <View className="flex-1">
                        <ThemedText variant="body" className="font-semibold mb-2 text-left">
                          {mockHealthcareProvider.experienceSummary}
                        </ThemedText>
                        <ThemedText variant="body" className="text-left leading-6 text-muted-foreground dark:text-muted-foreground-dark">
                          {mockHealthcareProvider.about}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Credentials and Education</CardTitle>
                </CardHeader>
                <CardContent>
                  <Each
                    items={mockHealthcareProvider.education}
                    render={(education, index) => (
                      <View
                        key={index}
                        className={`flex-row gap-3 py-3`}
                      >
                        <View className="w-10 h-10 items-center justify-center rounded-full mt-1">
                          <ThemedIcon icon="graduation-cap" size="md" color="primary" />
                        </View>
                        <View className="flex-1">
                          <ThemedText variant="body" className="font-semibold mb-1 text-left">
                            {education.degree}
                          </ThemedText>
                          <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark text-left">
                            {education.institution}
                          </ThemedText>
                        </View>
                      </View>
                    )}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Specialization</CardTitle>
                </CardHeader>
                <CardContent>
                  <Each
                    items={mockHealthcareProvider.specializations}
                    render={(specialization, index) => (
                      <View
                        key={index}
                        className={`flex-row gap-3 py-3`}
                      >
                        <View className="w-10 h-10 items-center justify-center rounded-full mt-1">
                          <ThemedIcon icon="stethoscope" size="md" color="primary" />
                        </View>
                        <View className="flex-1">
                          <ThemedText variant="body" className="font-semibold mb-1 text-left">
                            {specialization.name}
                          </ThemedText>
                          <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark text-left">
                            {specialization.subspecialization}
                          </ThemedText>
                        </View>
                      </View>
                    )}
                  />
                </CardContent>
              </Card>
            </View>

            <View className="flex-1 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Personal Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <View className="flex-row justify-center items-center gap-2">
                    <View className="flex-1">
                      <InfoRow
                        icon="calendar"
                        label="Date of Birth"
                        value={mockHealthcareProvider.dateOfBirth}
                      />
                      <InfoRow
                        icon={mockHealthcareProvider.gender === "Male" ? "mars" : "venus"}
                        label="Gender"
                        value={mockHealthcareProvider.gender}
                      />
                      <InfoRow
                        icon="heart-handshake"
                        label="Civil Status"
                        value={mockHealthcareProvider.civilStatus}
                      />
                    </View>
                    <View className="flex-1">
                      <InfoRow
                        icon="flag"
                        label="Nationality"
                        value={mockHealthcareProvider.nationality}
                      />
                      <InfoRow
                        icon="church"
                        label="Religion"
                        value={mockHealthcareProvider.religion}
                      />
                      <InfoRow
                        icon="droplet"
                        label="Blood Type"
                        value={mockHealthcareProvider.bloodType}
                      />
                    </View>
                  </View>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">License Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <View className="flex-row justify-center gap-2">
                    <View className="flex-1">
                      <InfoRow
                        icon="file-text"
                        label="License Number"
                        value={mockHealthcareProvider.licenseNumber}
                      />
                      <InfoRow
                        icon="calendar-check"
                        label="Issued Date"
                        value={mockHealthcareProvider.licenseIssued}
                      />
                      <InfoRow
                        icon="calendar-clock"
                        label="Expiry Date"
                        value={mockHealthcareProvider.licenseExpiry}
                      />
                    </View>
                    <View className="flex-1">
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
                    </View>
                  </View>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Contact Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow
                    icon="mail"
                    label="Email"
                    value={user?.primaryEmailAddress?.emailAddress || "Not provided"}
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
                </CardContent>
              </Card>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};
HPProfileScreen.displayName = "HPProfileScreen";

export default HPProfileScreen;

// {/* Personal Information Card */}
// <ThemedCard className="mx-4 mt-4 shadow-none bg-base dark:bg-surface-elevated-dark">
//   <ThemedCard.Content>
//     {/* Avatar and Personal Details */}
//     <View className="items-center gap-4">
//       <UserAvatar
//         imageUrl={user?.imageUrl}
//         name={user?.fullName || ""}
//         size={80}
//         className="mt-4 border-2 border-border dark:border-border-dark"
//       />
//       <View className="flex-1">
//         <ThemedText variant="header" className="text-xl font-bold text-left">
//           {user?.fullName || "Healthcare Provider"}
//         </ThemedText>
//       </View>
//     </View>

//     {/* Specialization and Role */}
//     <View className="items-center">
//       <ThemedText variant="body" className="text-foreground dark:text-foreground-dark mb-2 text-left">
//         {fieldOfStudyLabels[mockHealthcareProvider.fieldOfStudy]}
//       </ThemedText>
//       <View className="flex-row flex-wrap gap-2">
//         <ThemedBadge variant="outline" size="md">
//           {roleLabels[mockHealthcareProvider.role]}
//         </ThemedBadge>
//       </View>
//     </View>

//     {/* Edit Profile Button */}
//     <ThemedButton
//       variant="default"
//       size="md"
//       leftIcon={
//         <ThemedIcon icon="edit" size={16} color={"base"} />
//       }
//       onPress={handleEditProfile}
//     >
//       <ThemedText className="font-semibold text-primary-foreground dark:text-primary-foreground-dark">
//         Edit Profile
//       </ThemedText>
//     </ThemedButton>
//   </ThemedCard.Content>
// </ThemedCard>

// {/* Credentials and Education Card */}
{/* <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
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
</ThemedCard> */}

// {/* About Card */}
// <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
//   <ThemedCard.Header>
//     <ThemedCard.Title className="text-2xl text-left">About</ThemedCard.Title>
//   </ThemedCard.Header>
//   <ThemedCard.Content>
// <InfoRow
//   icon="briefcase"
//   label="Experience"
//   value={`${mockHealthcareProvider.yearsOfExperience}+ years`}
// />
// <InfoRow
//   icon="building-2"
//   label="Clinic"
//   value={mockHealthcareProvider.clinic}
// />
//   </ThemedCard.Content>
// </ThemedCard>

// {/* Specializations Card */}
// <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
//   <ThemedCard.Header>
//     <ThemedCard.Title className="text-2xl text-left">Specializations</ThemedCard.Title>
//   </ThemedCard.Header>
//   <ThemedCard.Content>
//     {mockHealthcareProvider.specializations.map((spec, index) => (
//       <View key={index} className="flex-row items-start gap-3 py-3">
//         <View className="w-10 h-10 items-center justify-center rounded-full bg-accent dark:bg-accent-dark mt-1">
//           <ThemedIcon icon="check-circle" size="md" color="primary" />
//         </View>
//         <View className="flex-1">
//           <ThemedText variant="body" className="font-semibold mb-1 text-left">
//             {spec}
//           </ThemedText>
//           <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark text-left">
//             Specialized expertise in {spec.toLowerCase()} treatment and care
//           </ThemedText>
//         </View>
//       </View>
//     ))}
//   </ThemedCard.Content>
// </ThemedCard>

// {/* License Information Card */}
// <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
//   <ThemedCard.Header>
//     <ThemedCard.Title className="text-2xl text-left">License Information</ThemedCard.Title>
//   </ThemedCard.Header>
//   <ThemedCard.Content>
//     <InfoRow
//       icon="file-text"
//       label="License Number"
//       value={mockHealthcareProvider.licenseNumber}
//     />
//     <InfoRow
//       icon="calendar"
//       label="Issued Date"
//       value={mockHealthcareProvider.licenseIssued}
//     />
//     <InfoRow
//       icon="calendar-clock"
//       label="Expiry Date"
//       value={mockHealthcareProvider.licenseExpiry}
//     />
//     <InfoRow
//       icon="file-badge"
//       label="PTR Number"
//       value={mockHealthcareProvider.ptrNumber}
//     />
//     <InfoRow
//       icon="receipt"
//       label="TIN Number"
//       value={mockHealthcareProvider.tinNumber}
//     />
//   </ThemedCard.Content>
// </ThemedCard>

// {/* Contact Details Card */}
// <ThemedCard className="mx-4 mt-4 border-0 shadow-none bg-base dark:bg-surface-elevated-dark">
//   <ThemedCard.Header>
//     <ThemedCard.Title className="text-2xl text-left">Contact Detail</ThemedCard.Title>
//   </ThemedCard.Header>
//   <ThemedCard.Content>
//     <InfoRow
//       icon="mail"
//       label="Email"
//       value={user?.primaryEmailAddress?.emailAddress || ""}
//       onPress={() => handleContactPress("email")}
//     />
//     <InfoRow
//       icon="phone"
//       label="Phone Number"
//       value={mockHealthcareProvider.phoneNumber}
//       onPress={() => handleContactPress("phone")}
//     />
//     <InfoRow
//       icon="phone-call"
//       label="Emergency Contact"
//       value={mockHealthcareProvider.emergencyContact}
//       onPress={() => handleContactPress("emergency")}
//     />
//   </ThemedCard.Content>
// </ThemedCard>
