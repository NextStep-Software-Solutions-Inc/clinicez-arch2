import { useMemo } from "react";
import { Image, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { differenceInYears, format, isValid, parseISO } from "date-fns";
import CharacterWink from "@images/clinicez-character-wink.png";

import ThemedView from "@components/ThemedView";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@components/ThemedCard";
import ThemedBadge from "@components/ThemedBadge";
import Each from "@components/Each";
import ThemedText from "@components/ThemedText";
import {
  PatientCollapsibleSection,
  VitalsHistoryView,
  ConsultationHistoryView,
  DiagnosisHistoryView,
  VaccinationRecordsView,
  LabImagingRequestsView,
  DisabilitiesView,
  PrescriptionHistoryView,
  FamilyHistoryView,
  PatientBillingView,
  EmergencyContactsView,
} from "@components/patient";
import { BloodTypeLabels, CivilStatusLabels, GenderLabels } from "@app-types/personal-details";
import type { PatientProfile } from "@app-types/patient";
import { buildFullName, cn } from "@lib/utils";
import PatientAvatar from "@components/patient/PatientAvatar";
import ThemedButton from "@components/ThemedButton";

export interface PatientProfileScreenProps {
  patient: PatientProfile;
}

type PatientVitalRecord = NonNullable<PatientProfile["vitalSigns"]>[number];

const formatIsoDate = (value: string) => {
  if (!value) {
    return "";
  }
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return "";
  }
  return format(parsed, "yyyy-MM-dd");
};

const buildVitalEntries = (vital?: PatientVitalRecord) => {
  if (!vital) return [];

  const entries: { key: string; label: string; value: string }[] = [];

  if (Number.isFinite(vital.temperature)) {
    entries.push({ key: "temperature", label: "Temp", value: `${vital.temperature.toFixed(1)}°C` });
  }
  if (vital.bloodPressure) {
    entries.push({ key: "bloodPressure", label: "Blood Pressure", value: vital.bloodPressure });
  }
  if (Number.isFinite(vital.heartRate)) {
    entries.push({ key: "heartRate", label: "Heart Rate", value: `${vital.heartRate} bpm` });
  }
  if (Number.isFinite(vital.respiratoryRate)) {
    entries.push({ key: "respiratoryRate", label: "Respiratory Rate", value: `${vital.respiratoryRate} breaths/min` });
  }
  if (Number.isFinite(vital.oxygenSaturation)) {
    entries.push({ key: "oxygenSaturation", label: "Oxygen Saturation", value: `${vital.oxygenSaturation}%` });
  }
  if (Number.isFinite(vital.height)) {
    entries.push({ key: "height", label: "Height", value: `${vital.height} cm` });
  }
  if (Number.isFinite(vital.weight)) {
    entries.push({ key: "weight", label: "Weight", value: `${vital.weight} kg` });
  }
  if (Number.isFinite(vital.bmi)) {
    entries.push({ key: "bmi", label: "BMI", value: vital.bmi.toFixed(1) });
  }
  return entries;
};

const VitalGrid = ({ vital }: { vital?: PatientVitalRecord }) => {
  const entries = buildVitalEntries(vital);

  if (entries.length === 0) {
    return (
      <View className="rounded-xl bg-muted/10 dark:bg-muted-dark/10 px-4 py-3">
        <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
          No vital data available.
        </ThemedText>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap justify-between gap-3">
      {entries.map((entry) => (
        <View
          key={entry.key}
          className="flex-1 rounded-xl bg-muted/20 dark:bg-muted-dark/20 px-4 py-3"
        >
          <ThemedText variant="caption" className="mb-1 text-muted-foreground dark:text-muted-foreground-dark">
            {entry.label}
          </ThemedText>
          <ThemedText className="text-base font-semibold text-text dark:text-text-dark">
            {entry.value}
          </ThemedText>
        </View>
      ))}
    </View>
  );
};

export default function PatientProfileScreen({ patient }: PatientProfileScreenProps) {
  const insets = useSafeAreaInsets();

  const fullName = useMemo(() => buildFullName({
    firstName: patient.firstName,
    middleName: patient.middleName,
    lastName: patient.lastName,
    suffix: patient.suffix,
  }), [patient.firstName, patient.middleName, patient.lastName, patient.suffix]);

  const displayName = fullName || "Unknown Patient";
  const contactEmail = patient.contactInfo.email;

  const displayGender = GenderLabels[patient.gender] ?? patient.gender;

  const age = useMemo(() => {
    if (!patient.dateOfBirth) {
      return null;
    }
    const birthDate = parseISO(patient.dateOfBirth);
    if (!isValid(birthDate)) {
      return null;
    }
    const years = differenceInYears(new Date(), birthDate);
    return Number.isFinite(years) && years >= 0 ? years : null;
  }, [patient.dateOfBirth]);

  const genderAndAge = `${displayGender}, ${age ?? 0} year(s) old`;

  const bloodTypeLabel = BloodTypeLabels[patient.bloodType] ?? patient.bloodType;
  const civilStatusLabel = CivilStatusLabels[patient.civilStatus] ?? patient.civilStatus;

  const sortedVitals = useMemo(() => {
    if (!patient.vitalSigns?.length) {
      return [];
    }

    return [...patient.vitalSigns]
      .filter((record): record is PatientVitalRecord => Boolean(record))
      .sort((a, b) => {
        const aDate = parseISO(a.createdAt);
        const bDate = parseISO(b.createdAt);
        const aTime = isValid(aDate) ? aDate.getTime() : 0;
        const bTime = isValid(bDate) ? bDate.getTime() : 0;
        return bTime - aTime;
      });
  }, [patient.vitalSigns]);

  const latestVital = sortedVitals[0];
  const historyVitals = sortedVitals.slice(1);
  const avatarAlt = fullName ? `Profile image of ${fullName}` : undefined;

  return (
    <ThemedView style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom, paddingHorizontal: 16 }}>
      <View className="content-center flex-row justify-center mx-auto gap-4">
        <View className="flex-1">
          <ScrollView
            showsVerticalScrollIndicator={false}
          >
            <View className={cn("w-full", "gap-3")}>
              {/** Patient Basic Information Card */}
              <View className="flex-row gap-6 bg-background dark:bg-background-dark rounded-2xl p-6 border border-border dark:border-border-dark">
                <PatientAvatar
                  uri={patient.profile?.imageUrl || undefined}
                  name={displayName}
                  alt={avatarAlt}
                  className="rounded-full bg-accent dark:bg-accent-dark border-2 border-accent dark:border-accent-dark"
                  fallbackClassName="text-primary"
                />
                <View className="flex-1 justify-center gap-3">
                  <ThemedText variant="header" className="text-3xl font-bold text-text dark:text-text-dark">
                    {displayName}
                  </ThemedText>

                  <ThemedText variant="label" className="text-base text-muted-foreground dark:text-muted-foreground-dark">
                    {genderAndAge}
                  </ThemedText>

                  <View className="flex-row flex-wrap items-center gap-2">
                    {bloodTypeLabel && (
                      <ThemedBadge variant="outline" size="md" className="border border-error dark:border-error-dark">
                        <ThemedText className="text-sm font-medium text-error dark:text-error-dark">
                          Blood Type: {bloodTypeLabel}
                        </ThemedText>
                      </ThemedBadge>
                    )}

                    {civilStatusLabel && (
                      <ThemedBadge variant="outline" size="md" className="border border-primary dark:border-primary-dark">
                        <ThemedText className="text-sm font-medium text-primary dark:text-primary-dark">
                          {civilStatusLabel}
                        </ThemedText>
                      </ThemedBadge>
                    )}
                  </View>
                </View>
              </View>
              <Card className={"bg-base dark:bg-surface-elevated-dark"}>
                <CardHeader>
                  <CardTitle className="text-2xl">Allergies</CardTitle>
                </CardHeader>
                <CardContent>
                  <View className="flex-row flex-wrap gap-2">
                    <Each
                      items={patient.allergy}
                      render={(item) => (
                        <ThemedBadge key={item.id} variant="outline" size="sm" className="border border-error dark:border-error-dark">
                          <ThemedText className="text-sm text-error dark:text-error-dark">
                            {item.name}
                          </ThemedText>
                        </ThemedBadge>
                      )}
                    />
                  </View>
                </CardContent>
              </Card>
              <Card className={"bg-base dark:bg-surface-elevated-dark"}>
                <CardHeader>
                  <CardTitle className="text-2xl">Current Medications</CardTitle>
                </CardHeader>
                <CardContent>
                  <View className="flex-row flex-wrap gap-2">
                    <Each
                      items={patient.medication}
                      render={(item, index) => (
                        <ThemedBadge key={`${item}-${index}`} variant="outline" size="sm" className="border border-primary dark:border-primary-dark">
                          <ThemedText className="text-sm text-primary dark:text-primary-dark">
                            {item.name} {item.dosage}
                          </ThemedText>
                        </ThemedBadge>
                      )}
                    />
                  </View>
                </CardContent>
              </Card>

              <Card className={"bg-base dark:bg-surface-elevated-dark"}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-2xl">Last Recorded Vital Signs</CardTitle>
                  <ThemedText variant="label" className="text-muted dark:text-muted-dark">
                    {latestVital ? formatIsoDate(latestVital.createdAt) : "No records"}
                  </ThemedText>
                </CardHeader>
                <CardContent>
                  <VitalGrid vital={latestVital} />
                </CardContent>
              </Card>

              <PatientCollapsibleSection
                title="Vitals History"
                icon="heart"
              >
                <VitalsHistoryView vitals={historyVitals} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Consultation History"
                icon="stethoscope"
              >
                <ConsultationHistoryView
                  consultations={patient.consultationHistory}
                  onViewDetails={(consultation) => {
                    console.log("View consultation details:", consultation);
                    // TODO: Implement navigation to consultation details
                  }}
                />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Diagnosis"
                icon="clipboard"
              >
                <DiagnosisHistoryView diagnoses={patient.diagnosisHistory} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Vaccination Records"
                icon="shield"
              >
                <VaccinationRecordsView vaccinations={patient.vaccinationRecords} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Lab & Imaging Requests"
                icon="flask-conical"
              >
                <LabImagingRequestsView requests={patient.labImagingRequests} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Disabilities"
                icon="accessibility"
              >
                <DisabilitiesView disabilities={patient.disabilities} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Prescription History"
                icon="pill"
              >
                <PrescriptionHistoryView prescriptions={patient.prescriptionHistory} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Family History"
                icon="users"
              >
                <FamilyHistoryView familyHistory={patient.familyHistory} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Billing History"
                icon="credit-card"
              >
                <PatientBillingView billingHistory={patient.billingHistory} />
              </PatientCollapsibleSection>

              <PatientCollapsibleSection
                title="Emergency Contacts"
                icon="phone"
              >
                <EmergencyContactsView contacts={patient.emergencyContacts} />
              </PatientCollapsibleSection>
            </View>
          </ScrollView>
        </View>

        {/** Consultation Meeting */}
        <View className="flex-1 items-center px-6 py-8">
          <View className="flex-1 items-center justify-center gap-4">
            <Image source={CharacterWink} className="w-64 h-64 mb-4" />
            <ThemedText className="text-3xl font-semibold text-text dark:text-dark text-center">
              Ready to start the consultation?
            </ThemedText>

            <ThemedText className="text-base text-text dark:text-dark text-center">
              Start the consultation to record findings, requests, and prescriptions.
            </ThemedText>

            <ThemedBadge variant="outline" className="p-4 mt-4">
              <ThemedText className="text-base text-gray-500 dark:text-gray-400 w-full text-center underline">
                {/** Dummy Google Meet Link */}
                https://meet.google.com/abc-defg-hij
              </ThemedText>
            </ThemedBadge>
          </View>

          <View className="w-full flex-row justify-between items-center gap-4">
            <ThemedButton variant="outline" className="flex-1 px-6 py-3 border-primary dark:border-primary-dark">
              <ThemedText className="text-base font-medium text-primary dark:text-primary-dark">
                Cancel
              </ThemedText>
            </ThemedButton>
            <ThemedButton className="flex-1 px-6 py-3 bg-primary dark:bg-primary-dark">
              <ThemedText className="text-base font-medium text-primary-foreground dark:text-primary-foreground-dark">
                Start Consultation
              </ThemedText>
            </ThemedButton>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

// const PatientProfileScreen = ({ patient }: PatientProfileScreenProps) => {
//   const insets = useSafeAreaInsets();
//   const { width } = useWindowDimensions();
//   const isTablet = width >= 768;

//   const patientFullName = useMemo(
//     () => buildFullName(patient.name),
//     [patient.name.firstName, patient.name.middleName, patient.name.lastName, patient.name.suffix],
//   );

//   const displayName = patientFullName || "Unknown Patient";
//   const profileImageUrl = patient.profile.imageUrl || undefined;
//   const contactEmail = patient.contactInfo.email;

//   const displayGender = GenderLabels[patient.gender] ?? patient.gender;

//   const age = useMemo(() => {
//     if (!patient.dateOfBirth) {
//       return null;
//     }
//     const birthDate = parseISO(patient.dateOfBirth);
//     if (!isValid(birthDate)) {
//       return null;
//     }
//     const years = differenceInYears(new Date(), birthDate);
//     return Number.isFinite(years) && years >= 0 ? years : null;
//   }, [patient.dateOfBirth]);

//   const genderAndAge = age != null ? `${displayGender}, ${age} years old` : displayGender;

//   const bloodTypeLabel = BloodTypeLabels[patient.bloodType] ?? patient.bloodType;
//   const civilStatusLabel = CivilStatusLabels[patient.civilStatus] ?? patient.civilStatus;

//   const sortedVitals = useMemo(() => {
//     if (!patient.vitalSigns?.length) {
//       return [];
//     }

//     return [...patient.vitalSigns]
//       .filter((record): record is PatientVitalRecord => Boolean(record))
//       .sort((a, b) => {
//         const aDate = parseISO(a.createdAt);
//         const bDate = parseISO(b.createdAt);
//         const aTime = isValid(aDate) ? aDate.getTime() : 0;
//         const bTime = isValid(bDate) ? bDate.getTime() : 0;
//         return bTime - aTime;
//       });
//   }, [patient.vitalSigns]);

//   const latestVital = sortedVitals[0];
//   const historyVitals = sortedVitals.slice(1);

//   const paddingHorizontal = isTablet ? 32 : 16;
//   const cardWidthClass = isTablet ? "mx-auto w-full max-w-4xl" : "w-full";

//   return (
//     <ThemedView className="flex-1 bg-surface dark:bg-surface-dark">
//       <ScrollView
//         showsVerticalScrollIndicator={false}
//         contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 48, paddingHorizontal }}
//       >

//         {/* Patient Profile */}
//         <View className={cn("w-full", isTablet ? "gap-6" : "gap-4")}>
//           <Card className={cn(cardWidthClass, "shadow-none bg-base dark:bg-surface-elevated-dark")}>
//             <CardContent className={cn(isTablet ? "flex-row items-center gap-6" : "gap-4")}>
//               <UserAvatar
//                 imageUrl={profileImageUrl}
//                 name={displayName}
//                 email={contactEmail}
//                 size={isTablet ? 96 : 80}
//                 className="mt-4 border-2 border-border dark:border-border-dark"
//               />
//               <View>
//                 <ThemedText variant="header" className="text-left text-2xl font-semibold">
//                   {displayName}
//                 </ThemedText>
//                 <ThemedText variant="label" className="mt-2 text-left text-muted dark:text-muted-dark">
//                   {genderAndAge}
//                 </ThemedText>

//                 <View className="mt-3 flex-row flex-wrap items-center gap-2">
//                   {bloodTypeLabel && (
//                     <ThemedBadge variant="outline" size="sm" className="border border-error dark:border-error-dark">
//                       <ThemedText className="text-sm text-error dark:text-error-dark">
//                         Blood Type: {bloodTypeLabel}
//                       </ThemedText>
//                     </ThemedBadge>
//                   )}
//                   {civilStatusLabel && (
//                     <ThemedBadge variant="outline" size="sm" className="border border-primary dark:border-primary-dark">
//                       <ThemedText className="text-sm text-primary dark:text-primary-dark">
//                         {civilStatusLabel}
//                       </ThemedText>
//                     </ThemedBadge>
//                   )}
//                 </View>

//                 {/* <View className="mt-4 flex-row flex-wrap items-center gap-x-6 gap-y-2">
//                   {contactEmail ? (
//                     <View className="flex-row items-center gap-2">
//                       <ThemedIcon icon="mail" size="sm" color="muted" />
//                       <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
//                         {contactEmail}
//                       </ThemedText>
//                     </View>
//                   ) : null}
//                   {contactMobile ? (
//                     <View className="flex-row items-center gap-2">
//                       <ThemedIcon icon="phone" size="sm" color="muted" />
//                       <ThemedText variant="caption" className="text-muted-foreground dark:text-muted-foreground-dark">
//                         {contactMobile}
//                       </ThemedText>
//                     </View>
//                   ) : null}
//                 </View> */}
//               </View>
//             </CardContent>
//           </Card>

//           <View className={cn(isTablet ? "flex-row justify-center items-center gap-4" : "gap-4")}>
//             <Card className={cn(cardWidthClass, "shadow-none bg-base dark:bg-surface-elevated-dark")}>
//               <CardHeader>
//                 <CardTitle>Allergies</CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <View className="flex-row flex-wrap gap-2">
//                   <Each
//                     items={patient.allergy}
//                     render={(item) => (
//                       <ThemedBadge key={item.id} variant="outline" size="sm" className="border border-error dark:border-error-dark">
//                         <ThemedText className="text-sm text-error dark:text-error-dark">
//                           {item.name}
//                         </ThemedText>
//                       </ThemedBadge>
//                     )}
//                   />
//                 </View>
//               </CardContent>
//             </Card>


//         </View>
//       </ScrollView>
//     </ThemedView>
//   );

// };
// PatientProfileScreen.displayName = "PatientProfileScreen";

// export default PatientProfileScreen;