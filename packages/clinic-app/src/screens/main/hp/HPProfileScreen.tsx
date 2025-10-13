import React from "react";
import { useUser } from "@clerk/clerk-expo";
import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import ThemedText from "@components/ThemedText";
import ThemedCard from "@components/ThemedCard";
import ThemedBadge from "@components/ThemedBadge";
import ThemedButton from "@components/ThemedButton";
import ThemedIcon from "@components/ThemedIcon";
import UserAvatar from "@components/UserAvatar";
import type {
  HealthcareProviderRole,
  FieldOfStudy,
} from "../../../types/healthcare-provider";

/**
 * HP Profile Screen
 * 
 * Displays healthcare provider profile with sections:
 * - Personal Information (avatar, name, role, specialization)
 * - Credentials and Education
 * - About (experience)
 * - Specializations
 * - License Information
 * - Contact Details
 * 
 * Principles Applied:
 * - Single Responsibility: Each component handles one section
 * - DRY: Reusable InfoRow component
 * - Composition: Built with composable UI primitives
 */

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

// Mock data - replace with actual data from your backend
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
  const router = useRouter();

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
            {/* Avatar and Personal Details - Row Layout */}
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

// import React, { useState } from "react";
// import { ScrollView, View, Pressable, Alert } from "react-native";
// import { useRouter } from "expo-router";
// import { useUser, useAuth } from "@clerk/clerk-expo";
// import { useSafeAreaInsets } from "react-native-safe-area-context";

// import ThemedView from "@components/ThemedView";
// import ThemedText from "@components/ThemedText";
// import ThemedCard from "@components/ThemedCard";
// import ThemedIcon from "@components/ThemedIcon";
// import ThemedButton from "@components/ThemedButton";
// import ThemedBadge from "@components/ThemedBadge";
// import UserAvatar from "@components/UserAvatar";
// import { getThemeColor } from "@theme/colors";
// import { useColorScheme } from "nativewind";

// /**
//  * Healthcare Provider Profile Screen
//  * 
//  * Displays the authenticated user's healthcare provider profile information
//  * including personal details, professional credentials, and account settings.
//  * 
//  * Principles Applied:
//  * - Single Responsibility: Each component section handles one aspect of the profile
//  * - DRY (Don't Repeat Yourself): Reusable ProfileInfoItem and ProfileSection components
//  * - Composition over Inheritance: Built using composable UI components
//  */

// type ProfileInfoItemProps = {
//   label: string;
//   value?: string | null;
//   icon?: string;
//   onPress?: () => void;
// };

// const ProfileInfoItem: React.FC<ProfileInfoItemProps> = ({ label, value, icon, onPress }) => {
//   const content = (
//     <View className="flex-row items-center justify-between py-3 border-b border-border dark:border-border-dark">
//       <View className="flex-row items-center gap-3 flex-1">
//         {icon && (
//           <View className="w-10 h-10 items-center justify-center rounded-full bg-accent dark:bg-accent-dark">
//             <ThemedIcon icon={icon} size="sm" color="primary" />
//           </View>
//         )}
//         <View className="flex-1">
//           <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark mb-1">
//             {label}
//           </ThemedText>
//           <ThemedText variant="body" className="font-medium">
//             {value || "Not provided"}
//           </ThemedText>
//         </View>
//       </View>
//       {onPress && (
//         <ThemedIcon icon="chevron-right" size="sm" color="muted" />
//       )}
//     </View>
//   );

//   if (onPress) {
//     return (
//       <Pressable onPress={onPress} className="active:opacity-70">
//         {content}
//       </Pressable>
//     );
//   }

//   return content;
// };

// type ProfileSectionProps = {
//   title: string;
//   icon?: string;
//   children: React.ReactNode;
// };

// const ProfileSection: React.FC<ProfileSectionProps> = ({ title, icon, children }) => (
//   <ThemedCard className="mb-4">
//     <View className="flex-row items-center gap-2 mb-4 pb-3 border-b border-border dark:border-border-dark">
//       {icon && <ThemedIcon icon={icon} size="default" color="primary" />}
//       <ThemedText variant="header" className="text-lg font-semibold">
//         {title}
//       </ThemedText>
//     </View>
//     <View>{children}</View>
//   </ThemedCard>
// );

// const HPProfileScreen: React.FC = () => {
//   const router = useRouter();
//   const { user } = useUser();
//   const { signOut } = useAuth();
//   const { colorScheme } = useColorScheme();
//   const insets = useSafeAreaInsets();
//   const [isSigningOut, setIsSigningOut] = useState(false);

//   const bottomSpacing = Math.max(insets.bottom + 16, 16);

//   // Mock healthcare provider data - in production, this would come from your backend
//   const hpData = {
//     // Basic Information
//     firstName: user?.firstName || "John",
//     lastName: user?.lastName || "Doe",
//     fullName: user?.fullName || "John Doe",
//     email: user?.emailAddresses?.[0]?.emailAddress || "john.doe@clinic.com",
//     phone: user?.phoneNumbers?.[0]?.phoneNumber || "+1 (555) 123-4567",

//     // Professional Information
//     role: "Doctor",
//     specialization: "General Medicine",
//     licenseNumber: "MD-123456",
//     clinic: "Sunrise Health Center",

//     // Professional Credentials
//     ptrNumber: "PTR-789012",
//     tinNumber: "123-45-6789",
//     issuedDate: "Jan 15, 2020",
//     expiryDate: "Jan 15, 2025",

//     // Additional Information
//     yearsOfExperience: "8 years",
//     patientsServed: "1,204",
//   };

//   const handleEditProfile = () => {
//     router.push("/(main)/complete-profile");
//   };

//   const handleChangePassword = () => {
//     // TODO: Implement change password flow
//     Alert.alert("Change Password", "This feature will be available soon.");
//   };

//   const handleNotificationSettings = () => {
//     // TODO: Implement notification settings
//     Alert.alert("Notification Settings", "This feature will be available soon.");
//   };

//   const handlePrivacySettings = () => {
//     // TODO: Implement privacy settings
//     Alert.alert("Privacy Settings", "This feature will be available soon.");
//   };

//   const handleSignOut = async () => {
//     Alert.alert(
//       "Sign Out",
//       "Are you sure you want to sign out?",
//       [
//         {
//           text: "Cancel",
//           style: "cancel",
//         },
//         {
//           text: "Sign Out",
//           style: "destructive",
//           onPress: async () => {
//             try {
//               setIsSigningOut(true);
//               await signOut();
//               router.replace("/(auth)/sign-in");
//             } catch (error) {
//               Alert.alert("Error", "Failed to sign out. Please try again.");
//               setIsSigningOut(false);
//             }
//           },
//         },
//       ]
//     );
//   };

//   const verificationBadgeColor = getThemeColor("success", colorScheme === "dark" ? "dark" : "light");

//   return (
//     <ScrollView
//       showsVerticalScrollIndicator={false}
//       className="flex-1 bg-background dark:bg-background-dark"
//       contentContainerStyle={{ paddingBottom: bottomSpacing }}
//     >
//       <ThemedView variant="transparent" className="flex-1 px-6 pt-6">
//         {/* Profile Header */}
//         <View className="items-center mb-6">
//           <View className="relative mb-4">
//             <UserAvatar
//               imageUrl={user?.imageUrl}
//               name={hpData.fullName}
//               email={hpData.email}
//               size={100}
//               className="border-4 border-background dark:border-background-dark shadow-lg"
//             />
//             {/* Verification Badge */}
//             <View className="absolute bottom-0 right-0 w-8 h-8 items-center justify-center rounded-full bg-success dark:bg-success-dark border-2 border-background dark:border-background-dark">
//               <ThemedIcon icon="badge-check" size={16} color={verificationBadgeColor} />
//             </View>
//           </View>

//           <ThemedText variant="header" className="text-2xl font-bold mb-1">
//             {hpData.fullName}
//           </ThemedText>

//           <View className="flex-row items-center gap-2 mb-3">
//             <ThemedBadge variant="default" size="md">
//               <ThemedText className="text-primary-foreground dark:text-primary-contrast font-semibold">
//                 {hpData.role}
//               </ThemedText>
//             </ThemedBadge>
//             <ThemedBadge variant="outline" size="md">
//               <ThemedText className="text-primary dark:text-primary-dark font-medium">
//                 {hpData.specialization}
//               </ThemedText>
//             </ThemedBadge>
//           </View>

//           <ThemedText variant="body" className="text-muted-foreground dark:text-muted-foreground-dark text-center mb-4">
//             {hpData.clinic}
//           </ThemedText>

//           <ThemedButton
//             variant="outline"
//             size="default"
//             onPress={handleEditProfile}
//             className="w-full max-w-xs"
//           >
//             <View className="flex-row items-center gap-2">
//               <ThemedIcon icon="edit" size={18} className="text-primary dark:text-primary-dark" />
//               <ThemedText className="font-semibold">Edit Profile</ThemedText>
//             </View>
//           </ThemedButton>
//         </View>

//         {/* Statistics Cards */}
//         <View className="flex-row gap-4 mb-6">
//           <ThemedCard className="flex-1 items-center py-4">
//             <ThemedText variant="header" className="text-2xl font-bold mb-1">
//               {hpData.yearsOfExperience}
//             </ThemedText>
//             <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
//               Experience
//             </ThemedText>
//           </ThemedCard>

//           <ThemedCard className="flex-1 items-center py-4">
//             <ThemedText variant="header" className="text-2xl font-bold mb-1">
//               {hpData.patientsServed}
//             </ThemedText>
//             <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
//               Patients
//             </ThemedText>
//           </ThemedCard>
//         </View>

//         {/* Personal Information */}
//         <ProfileSection title="Personal Information" icon="user">
//           <ProfileInfoItem label="Email Address" value={hpData.email} icon="mail" />
//           <ProfileInfoItem label="Phone Number" value={hpData.phone} icon="phone" />
//           <ProfileInfoItem label="License Number" value={hpData.licenseNumber} icon="file-badge" />
//         </ProfileSection>

//         {/* Professional Credentials */}
//         <ProfileSection title="Professional Credentials" icon="shield-check">
//           <ProfileInfoItem label="PTR Number" value={hpData.ptrNumber} icon="file-text" />
//           <ProfileInfoItem label="TIN Number" value={hpData.tinNumber} icon="hash" />
//           <ProfileInfoItem label="License Issued" value={hpData.issuedDate} icon="calendar" />
//           <ProfileInfoItem label="License Expiry" value={hpData.expiryDate} icon="calendar-clock" />
//         </ProfileSection>

//         {/* Account Settings */}
//         <ProfileSection title="Account Settings" icon="settings">
//           <ProfileInfoItem
//             label="Change Password"
//             value="Update your password"
//             icon="lock"
//             onPress={handleChangePassword}
//           />
//           <ProfileInfoItem
//             label="Notification Settings"
//             value="Manage your notifications"
//             icon="bell"
//             onPress={handleNotificationSettings}
//           />
//           <ProfileInfoItem
//             label="Privacy & Security"
//             value="Control your privacy settings"
//             icon="shield"
//             onPress={handlePrivacySettings}
//           />
//         </ProfileSection>

//         {/* Sign Out Button */}
//         <ThemedButton
//           variant="destructive"
//           size="lg"
//           onPress={handleSignOut}
//           disabled={isSigningOut}
//           className="mb-6"
//         >
//           <View className="flex-row items-center gap-2">
//             <ThemedIcon icon="log-out" size={20} color="white" />
//             <ThemedText variant="button" className="text-white font-semibold">
//               {isSigningOut ? "Signing Out..." : "Sign Out"}
//             </ThemedText>
//           </View>
//         </ThemedButton>

//         {/* App Version */}
//         <View className="items-center py-4">
//           <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
//             ClinicEZ v1.0.0
//           </ThemedText>
//         </View>
//       </ThemedView>
//     </ScrollView>
//   );
// };

// HPProfileScreen.displayName = "HPProfileScreen";

// export default HPProfileScreen;