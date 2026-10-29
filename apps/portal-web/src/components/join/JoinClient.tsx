"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  User,
  Shield,
  FileText,
  AlertCircle,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  KeyRound,
  Plus,
  X,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Sparkles,
  UserCheck,
  Smartphone,
} from "lucide-react";
import { useUser, SignInButton, useAuth } from "@clerk/nextjs";
import {
  type PatientJoinRequestedPayload,
  type PatientJoinAllergyItem,
  type PatientJoinAttachmentItem,
  type DigitalRegistrationPass,
  type CustomFieldDefinition,
} from "@/components/join/types";
import {
  evaluateFieldVisibility,
  getCascadingChoices,
  sanitizeCustomFields,
  INSTITUTIONAL_CUSTOM_FIELDS,
} from "@/lib/join";

export { INSTITUTIONAL_CUSTOM_FIELDS };
import {
  formatPhilHealthPin,
  validatePhilHealthPinMod11,
} from "@/lib/philhealth";
import { JoinCodeModal } from "@/components/join/JoinCodeModal";
import { OutsideDocumentDropzone } from "@/components/join/OutsideDocumentDropzone";
import { DigitalPassCard } from "@/components/join/DigitalPassCard";
import { getPatientApiUrl, getPortalApiUrl } from "@/utils/domain";
import PsgcAddressPicker, { type PsgcAddressValue } from "@/components/common/PsgcAddressPicker";
import { useEhrOptions } from "@/hooks/useEhrOptions";

interface JoinClientProps {
  tenantSlug: string;
  facilitySlug: string;
  tenantName: string;
  facilityName: string;
  facilityAddress?: string;
  initialJoinCode?: string;
}

const ALLERGY_QUICK_PICKS: Record<PatientJoinAllergyItem["category"], string[]> = {
  Medication: ["Penicillin", "Amoxicillin", "Aspirin", "Ibuprofen", "Co-amoxiclav", "Sulfonamides"],
  Food: ["Peanuts", "Shellfish", "Crustaceans", "Eggs", "Cow's Milk", "Wheat", "Soy"],
  Environmental: ["Latex", "House Dust Mites", "Pollen", "Grass", "Mold", "Bee Venom"],
  Biologic: ["Blood Products", "Antivenom", "Monoclonal Antibodies", "Vaccines"],
  Other: ["Surgical Adhesive", "Contrast Dye", "Nickel", "Chlorhexidine"],
};

export default function JoinClient({
  tenantSlug,
  facilitySlug,
  tenantName,
  facilityName,
  facilityAddress,
  initialJoinCode,
}: JoinClientProps) {
  // Join Code Gating State
  const [joinCode, setJoinCode] = useState<string | undefined>(
    initialJoinCode ? initialJoinCode.toUpperCase() : undefined
  );
  const [isJoinCodeModalOpen, setIsJoinCodeModalOpen] = useState(!initialJoinCode);

  // Form State: Demographics
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("2000-01-01");
  const [sex, setSex] = useState<"Male" | "Female" | "Other">("Male");
  const [civilStatus, setCivilStatus] = useState("Single");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [psgcAddress, setPsgcAddress] = useState<Partial<PsgcAddressValue>>({});

  // Dynamic EHR Options
  const { selectOptions: rawSexOptions } = useEhrOptions("sex");
  const { selectOptions: rawCivilStatusOptions } = useEhrOptions("civil_status");

  const sexOptions = useMemo(() => {
    if (rawSexOptions && rawSexOptions.length > 0) {
      return rawSexOptions.map((o) => {
        let val: "Male" | "Female" | "Other" = "Other";
        const lowerVal = (o.value || "").toLowerCase();
        const lowerLabel = (o.label || "").toLowerCase();
        if (lowerVal === "male" || lowerLabel === "male") val = "Male";
        else if (lowerVal === "female" || lowerLabel === "female") val = "Female";
        return { label: o.label, value: val };
      });
    }
    return [
      { label: "Male", value: "Male" as const },
      { label: "Female", value: "Female" as const },
      { label: "Other", value: "Other" as const },
    ];
  }, [rawSexOptions]);

  const civilStatusOptions = useMemo(() => {
    if (rawCivilStatusOptions && rawCivilStatusOptions.length > 0) {
      return rawCivilStatusOptions.map((o) => ({
        label: o.label,
        value: o.label,
      }));
    }
    return [
      { label: "Single", value: "Single" },
      { label: "Married", value: "Married" },
      { label: "Widowed", value: "Widowed" },
      { label: "Separated", value: "Separated" },
      { label: "Other", value: "Other" },
    ];
  }, [rawCivilStatusOptions]);

  // Form State: PhilHealth & Member Type
  const [memberType, setMemberType] = useState<"MM" | "DD">("MM");
  const [philHealthPin, setPhilHealthPin] = useState("");
  const [principalFullName, setPrincipalFullName] = useState("");
  const [principalRelationship, setPrincipalRelationship] = useState<"C" | "S" | "P" | "D">("C");
  const [principalPin, setPrincipalPin] = useState("");
  const [principalDob, setPrincipalDob] = useState("");
  const [seniorCitizenId, setSeniorCitizenId] = useState("");
  const [pwdId, setPwdId] = useState("");

  // Form State: Reason for Visit
  const [reasonForVisit, setReasonForVisit] = useState("");

  // Form State: Dynamic Custom Fields
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({
    affiliation: "Student",
    college: "College of Engineering",
    program: "BS Computer Engineering",
    year_level: "1st Year",
  });

  // Form State: Structured Allergies
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);
  const [allergies, setAllergies] = useState<PatientJoinAllergyItem[]>([]);
  const [newAllergen, setNewAllergen] = useState("");
  const [newCategory, setNewCategory] = useState<PatientJoinAllergyItem["category"]>("Medication");
  const [newSeverity, setNewSeverity] = useState<PatientJoinAllergyItem["severity"]>("Moderate");
  const [newReaction, setNewReaction] = useState("");
  const [allergyError, setAllergyError] = useState<string | null>(null);

  // Form State: Attachments
  const [attachments, setAttachments] = useState<PatientJoinAttachmentItem[]>([]);

  // Submission & UX Lifecycle State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmedPass, setConfirmedPass] = useState<DigitalRegistrationPass | null>(null);

  // Clerk Authentication & Autofill State
  let clerkUser: ReturnType<typeof useUser>["user"] = null;
  let isSignedIn = false;
  let isInsideClerk = false;
  let getToken: (() => Promise<string | null>) | null = null;
  try {
    const userHook = useUser();
    const authHook = useAuth();
    clerkUser = userHook.user;
    isSignedIn = Boolean(userHook.isSignedIn);
    getToken = authHook.getToken;
    isInsideClerk = true;
  } catch {
    // Graceful fallback outside ClerkProvider (e.g. testing)
    isInsideClerk = false;
  }

  const [isAutofilled, setIsAutofilled] = useState(false);
  const [isHydratingProfile, setIsHydratingProfile] = useState(false);
  const hasAutoHydratedRef = useRef(false);

  // Profile Hydration from patient-api or BFF proxy
  const hydrateProfileFromPatientRecord = useCallback(async () => {
    if (!isSignedIn || !clerkUser) return;
    setIsHydratingProfile(true);

    try {
      const token = getToken ? await getToken() : null;
      const response = await fetch(`${getPatientApiUrl()}/patients/me`, {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (response.ok) {
        const payload = await response.json();
        const data = payload.data || payload;

        if (data.firstName) setFirstName(data.firstName);
        if (data.middleName) setMiddleName(data.middleName);
        if (data.lastName) setLastName(data.lastName);
        if (data.suffix) setSuffix(data.suffix);
        if (data.dateOfBirth) setDateOfBirth(data.dateOfBirth);
        if (data.sex) setSex(data.sex);
        if (data.civilStatus) setCivilStatus(data.civilStatus);
        if (data.contactNumber || data.mobile) setContactNumber(data.contactNumber || data.mobile);
        if (data.email) setEmail(data.email);
        if (data.address) setAddress(data.address);
        if (data.regionPsgc || data.cityMunicipalityPsgc) {
          setPsgcAddress({
            regionPsgc: data.regionPsgc,
            provincePsgc: data.provincePsgc,
            cityMunicipalityPsgc: data.cityMunicipalityPsgc,
            barangayPsgc: data.barangayPsgc,
            regionName: data.regionName,
            provinceName: data.provinceName,
            cityMunicipalityName: data.cityMunicipalityName,
            barangayName: data.barangayName,
            streetAddress: data.streetAddress,
            zipCode: data.zipCode,
            formattedAddress: data.address || "",
          });
        }

        const pin = data.philHealthPin || data.governmentIds?.find((g: any) => g.idType === "PHILHEALTH")?.idNumber;
        if (pin) {
          setPhilHealthPin(formatPhilHealthPin(pin));
        }

        if (Array.isArray(data.allergies) && data.allergies.length > 0) {
          const mappedAllergies: PatientJoinAllergyItem[] = data.allergies.map((a: any) => ({
            allergen: a.allergen || a.allergenName,
            category: a.category || a.allergyType || "Medication",
            severity: a.severity || "Moderate",
            isAnaphylactic: Boolean(a.isAnaphylactic),
            reactionManifestation: a.reactionManifestation || a.reaction || "",
          }));
          setAllergies(mappedAllergies);
          setNoKnownAllergies(false);
        }

        setIsAutofilled(true);
        setIsHydratingProfile(false);
        return;
      }
    } catch {
      // Fall through to Clerk user profile fallback
    }

    // Fallback: Populate basic info from Clerk user profile
    if (clerkUser.firstName) setFirstName(clerkUser.firstName);
    if (clerkUser.lastName) setLastName(clerkUser.lastName);
    const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress;
    if (primaryEmail) setEmail(primaryEmail);
    const primaryPhone = clerkUser.primaryPhoneNumber?.phoneNumber;
    if (primaryPhone) setContactNumber(primaryPhone);

    setIsAutofilled(true);
    setIsHydratingProfile(false);
  }, [isSignedIn, clerkUser]);

  useEffect(() => {
    if (isSignedIn) {
      if (!hasAutoHydratedRef.current) {
        hasAutoHydratedRef.current = true;
        hydrateProfileFromPatientRecord();
      }
    } else {
      hasAutoHydratedRef.current = false;
    }
  }, [isSignedIn, hydrateProfileFromPatientRecord]);

  const handleClearAutofill = () => {
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setSuffix("");
    setDateOfBirth("2000-01-01");
    setSex("Male");
    setCivilStatus("Single");
    setContactNumber("");
    setEmail("");
    setAddress("");
    setPhilHealthPin("");
    setAllergies([]);
    setIsAutofilled(false);
  };

  // PhilHealth Mod-11 Validations
  const patientPinValidation = useMemo(
    () => (philHealthPin.trim() ? validatePhilHealthPinMod11(philHealthPin) : null),
    [philHealthPin]
  );

  const principalPinValidation = useMemo(
    () => (principalPin.trim() ? validatePhilHealthPinMod11(principalPin) : null),
    [principalPin]
  );

  // Custom Field Change Handler with Child Auto-Reset
  const handleCustomFieldChange = (key: string, value: any) => {
    setCustomFieldValues((prev) => {
      const updated = { ...prev, [key]: value };

      // Check cascading dependents to auto-reset
      for (const field of INSTITUTIONAL_CUSTOM_FIELDS) {
        if (
          field.visibilityCondition?.parentKey === key &&
          field.cascadingOptions
        ) {
          const validChoices = field.cascadingOptions[value] || [];
          if (!validChoices.includes(updated[field.fieldKey])) {
            updated[field.fieldKey] = validChoices[0] || "";
          }
        }
      }

      return updated;
    });
  };

  // Allergy Add Handler
  const handleAddAllergy = () => {
    setAllergyError(null);
    const trimmed = newAllergen.trim();
    if (!trimmed) {
      setAllergyError("Allergen name is required (e.g. Penicillin, Peanuts).");
      return;
    }
    if (allergies.some((a) => a.allergen.toLowerCase() === trimmed.toLowerCase())) {
      setAllergyError(`Allergy "${trimmed}" is already recorded.`);
      return;
    }

    const item: PatientJoinAllergyItem = {
      allergen: trimmed,
      category: newCategory,
      severity: newSeverity,
      isAnaphylactic: newSeverity === "LifeThreatening",
      reactionManifestation: newReaction.trim() || undefined,
    };

    setAllergies([...allergies, item]);
    setNewAllergen("");
    setNewReaction("");
  };

  const handleRemoveAllergy = (idx: number) => {
    setAllergies(allergies.filter((_, i) => i !== idx));
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!joinCode) {
      setIsJoinCodeModalOpen(true);
      return;
    }

    // 1. Mandatory Validations
    if (!firstName.trim() || !lastName.trim()) {
      setFormError("Patient First Name and Last Name are required.");
      return;
    }

    if (!contactNumber.trim()) {
      setFormError("Contact number is required.");
      return;
    }

    // Patient PhilHealth PIN Submit Guard (Optional, but if entered, must be valid & complete)
    if (philHealthPin.trim()) {
      if (!patientPinValidation?.isValid || !patientPinValidation?.isComplete) {
        setFormError(
          patientPinValidation?.errorMessage
            ? `Patient PhilHealth PIN error: ${patientPinValidation.errorMessage}`
            : "Patient PhilHealth PIN is invalid or incomplete (must be 12 digits with valid Mod-11 check digit)."
        );
        return;
      }
    }

    // Dependent Validations
    if (memberType === "DD") {
      if (!principalFullName.trim()) {
        setFormError("Principal member full name is required for PhilHealth dependents.");
        return;
      }
      if (!principalPin.trim()) {
        setFormError("Principal member PhilHealth PIN is required.");
        return;
      }
      if (!principalPinValidation?.isValid || !principalPinValidation?.isComplete) {
        setFormError(
          principalPinValidation?.errorMessage
            ? `Principal PhilHealth PIN error: ${principalPinValidation.errorMessage}`
            : "Principal PhilHealth PIN is invalid (Mod-11 check digit verification failed)."
        );
        return;
      }
    }

    // Check visible required custom fields
    for (const field of INSTITUTIONAL_CUSTOM_FIELDS) {
      if (field.isRequired && evaluateFieldVisibility(field, customFieldValues)) {
        if (!customFieldValues[field.fieldKey]) {
          setFormError(`"${field.label}" is required.`);
          return;
        }
      }
    }

    // Sanitize custom fields (strip hidden ones)
    const sanitizedCustomFields = sanitizeCustomFields(
      INSTITUTIONAL_CUSTOM_FIELDS,
      customFieldValues
    );

    const payload: PatientJoinRequestedPayload = {
      joinRequestId: crypto.randomUUID(),
      tenantSlug,
      facilitySlug,
      joinCode,
      firstName: firstName.trim(),
      middleName: middleName.trim() || undefined,
      lastName: lastName.trim(),
      suffix: suffix.trim() || undefined,
      dateOfBirth,
      sex,
      civilStatus,
      contactNumber: contactNumber.trim(),
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      regionPsgc: psgcAddress.regionPsgc || undefined,
      provincePsgc: psgcAddress.provincePsgc || undefined,
      cityMunicipalityPsgc: psgcAddress.cityMunicipalityPsgc || undefined,
      barangayPsgc: psgcAddress.barangayPsgc || undefined,
      regionName: psgcAddress.regionName || undefined,
      provinceName: psgcAddress.provinceName || undefined,
      cityMunicipalityName: psgcAddress.cityMunicipalityName || undefined,
      barangayName: psgcAddress.barangayName || undefined,
      streetAddress: psgcAddress.streetAddress?.trim() || undefined,
      zipCode: psgcAddress.zipCode?.trim() || undefined,
      addresses: psgcAddress.regionPsgc
        ? [
            {
              addressType: "Current",
              isSameAsPermanent: true,
              regionPsgc: psgcAddress.regionPsgc,
              provincePsgc: psgcAddress.provincePsgc,
              cityMunicipalityPsgc: psgcAddress.cityMunicipalityPsgc,
              barangayPsgc: psgcAddress.barangayPsgc,
              regionName: psgcAddress.regionName,
              provinceName: psgcAddress.provinceName,
              cityMunicipalityName: psgcAddress.cityMunicipalityName,
              barangayName: psgcAddress.barangayName,
              streetAddress: psgcAddress.streetAddress?.trim() || undefined,
              zipCode: psgcAddress.zipCode?.trim() || undefined,
            },
          ]
        : undefined,
      philHealthPin: philHealthPin.trim() || undefined,
      memberType,
      principalMemberPin: memberType === "DD" ? principalPin.trim() : undefined,
      principalRelationship: memberType === "DD" ? principalRelationship : undefined,
      principalFullName: memberType === "DD" ? principalFullName.trim() : undefined,
      principalDateOfBirth: memberType === "DD" && principalDob ? principalDob : undefined,
      seniorCitizenId: seniorCitizenId.trim() || undefined,
      pwdId: pwdId.trim() || undefined,
      reasonForVisit: reasonForVisit.trim() || undefined,
      customFields: sanitizedCustomFields,
      allergies: noKnownAllergies ? [] : allergies,
      attachments,
    };

    setIsSubmitting(true);

    try {
      const joinUrl = `${getPortalApiUrl()}/public/join`;
      const response = await fetch(joinUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok && response.status !== 202) {
        throw new Error(result.message || `Submission failed with status ${response.status}`);
      }

      const basePass: DigitalRegistrationPass = result.data || {
        trackingId: result.trackingId || payload.joinRequestId!,
        registrationPassId: `PASS-${(result.trackingId || payload.joinRequestId!).slice(0, 8).toUpperCase()}`,
        queueToken: result.queueToken || "Q-105",
        patientCode: result.patientCode || `PAT-${new Date().getFullYear()}-00042`,
        fullName: `${payload.lastName}, ${payload.firstName}${payload.middleName ? ` ${payload.middleName[0]}.` : ""}`,
        facilityName,
        facilitySlug,
        tenantSlug,
        estimatedWaitMinutes: 15,
        issuedAt: new Date().toISOString(),
        qrDataString: JSON.stringify({
          code: result.patientCode || `PAT-${new Date().getFullYear()}-00042`,
          queue: result.queueToken || "Q-105",
          issued: new Date().toISOString(),
        }),
      };

      const extendedPass = {
        ...basePass,
        claimToken: result.claimToken || result.data?.claimToken || "claim-token-ephemeral",
        expiresAt: result.expiresAt || result.data?.expiresAt || "48h",
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        dateOfBirth: payload.dateOfBirth,
        memberType: payload.memberType,
      };

      setConfirmedPass(extendedPass);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`Registration relay error: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setConfirmedPass(null);
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setContactNumber("");
    setEmail("");
    setAddress("");
    setPhilHealthPin("");
    setPrincipalPin("");
    setPrincipalFullName("");
    setReasonForVisit("");
    setAllergies([]);
    setAttachments([]);
    setFormError(null);
  };

  // If Confirmed, render Success state (Digital Pass)
  if (confirmedPass) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto pt-6">
          <DigitalPassCard pass={confirmedPass} onReset={handleReset} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Join Code Prompt Modal */}
      <JoinCodeModal
        isOpen={isJoinCodeModalOpen}
        onUnlock={(code) => {
          setJoinCode(code);
          setIsJoinCodeModalOpen(false);
        }}
        facilityName={facilityName}
      />

      <div className="max-w-3xl w-full mx-auto space-y-8 pt-4 sm:pt-8">
        {/* Workstation Header */}
        <div className="space-y-3 border-b border-border pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Patient Pre-Registration Workstation
            </div>

            {joinCode && (
              <button
                type="button"
                onClick={() => setIsJoinCodeModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors cursor-pointer"
                title="Click to update Join Code"
              >
                <KeyRound className="w-3.5 h-3.5 text-primary" />
                <span>CODE: {joinCode}</span>
              </button>
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {facilityName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tenantName} {facilityAddress && `&bull; ${facilityAddress}`}
            </p>
          </div>
        </div>

        {/* Mobile Universal Link Smart App Banner */}
        {joinCode && (
          <div
            className="p-3.5 bg-muted/60 border border-border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            data-testid="deep-link-smart-banner"
          >
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <Smartphone className="w-4 h-4" />
              </span>
              <div>
                <span className="font-bold text-foreground block">
                  Have the Clinic EZ Patient App?
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Open on mobile for 1-Tap Fast Check-In without retyping your information.
                </span>
              </div>
            </div>
            <a
              href={`clinicez://join/${encodeURIComponent(joinCode)}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs transition-colors shrink-0 shadow-sm"
            >
              1-Tap Mobile Check-In
            </a>
          </div>
        )}

        {/* Existing User Fast-Track & Web Autofill Banner */}
        {!isSignedIn ? (
          <div
            className="p-4 sm:p-5 bg-primary/5 border border-primary/25 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs shadow-sm"
            data-testid="autofill-banner-unauthenticated"
          >
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5" />
              </span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground">
                  Already have a Clinic EZ account? Sign in to Autofill
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed max-w-lg">
                  Sign in with your Clinic EZ account to pre-populate demographics, 12-digit PhilHealth PIN, contact info, and structured allergies in 1 click.
                </p>
              </div>
            </div>
            {isInsideClerk ? (
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs transition-all shadow-md shadow-primary/15 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Sign In to Autofill
                </button>
              </SignInButton>
            ) : (
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs transition-all shadow-md shadow-primary/15 shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Sign In to Autofill
              </button>
            )}
          </div>
        ) : (
          <div
            className="p-4 sm:p-5 bg-primary/10 border border-primary/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs shadow-sm"
            data-testid="autofill-banner-authenticated"
          >
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl bg-primary/20 text-primary shrink-0 mt-0.5">
                <UserCheck className="w-5 h-5" />
              </span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground">
                  Signed in as {clerkUser?.fullName || clerkUser?.firstName || "Clinic EZ User"} ({clerkUser?.primaryEmailAddress?.emailAddress})
                </h3>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {isAutofilled
                    ? "Form autofilled from your Clinic EZ patient profile. You can review or edit any field below."
                    : "Clinic EZ account active. Click below to hydrate your profile data."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={hydrateProfileFromPatientRecord}
                disabled={isHydratingProfile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {isHydratingProfile ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Re-sync Profile
                  </>
                )}
              </button>
              {isAutofilled && (
                <button
                  type="button"
                  onClick={handleClearAutofill}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground font-medium rounded-xl text-xs transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Autofill
                </button>
              )}
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {formError && (
          <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3 animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Registration Incomplete</p>
              <p className="text-xs mt-0.5 text-destructive/80">{formError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Demographics */}
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <User className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-foreground">1. Patient Demographics</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Juan"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Middle Name
                </label>
                <input
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  placeholder="e.g. Protacio"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Suffix
                </label>
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="e.g. Jr., III"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Rizal"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  required
                  max={new Date().toISOString().split("T")[0]}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Sex at Birth *
                </label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  {sexOptions.map((opt) => (
                    <option key={opt.value + opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1">
                  Civil Status
                </label>
                <select
                  value={civilStatus}
                  onChange={(e) => setCivilStatus(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  {civilStatusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1">
                  Contact Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="09XXXXXXXXX"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="juan@example.ph"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <PsgcAddressPicker
                  value={psgcAddress}
                  onChange={(newAddress) => {
                    setPsgcAddress(newAddress);
                    setAddress(newAddress.formattedAddress);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: PhilHealth Statutory & Member Classification */}
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Shield className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-foreground">
                2. PhilHealth & Discount IDs
              </h2>
            </div>

            {/* Member Type Toggle Pills */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                PhilHealth Member Classification *
              </label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => setMemberType("MM")}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm border transition-all cursor-pointer ${
                    memberType === "MM"
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Member (MM)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMemberType("DD")}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm border transition-all cursor-pointer ${
                    memberType === "DD"
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Dependent (DD)</span>
                </button>
              </div>
            </div>

            {/* Patient PhilHealth PIN Input */}
            <div className="space-y-1 max-w-md">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-foreground">
                  Patient PhilHealth PIN (Optional)
                </label>
                {patientPinValidation?.isComplete && patientPinValidation.isValid && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                    <ShieldCheck className="w-3 h-3 text-primary" /> Verified
                  </span>
                )}
              </div>
              <input
                type="text"
                value={philHealthPin}
                onChange={(e) => setPhilHealthPin(formatPhilHealthPin(e.target.value))}
                placeholder="XX-XXXXXXXXX-X"
                maxLength={14}
                className="w-full px-3.5 py-2.5 rounded-xl border border-input text-sm font-mono tracking-wider bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
              />
              {patientPinValidation && !patientPinValidation.isValid && patientPinValidation.errorMessage && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{patientPinValidation.errorMessage}</span>
                </p>
              )}
            </div>

            {/* Principal Member Card when DD */}
            {memberType === "DD" && (
              <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5 space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between border-b border-primary/20 pb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-sm text-primary">
                      Principal Sponsor Details
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
                    Required for Konsulta
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Enter the primary PhilHealth member details for dependent coverage.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Principal Member Full Name *
                    </label>
                    <input
                      type="text"
                      required={memberType === "DD"}
                      value={principalFullName}
                      onChange={(e) => setPrincipalFullName(e.target.value)}
                      placeholder="e.g. Maria Santos Dela Cruz"
                      className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Relationship to Principal *
                    </label>
                    <select
                      value={principalRelationship}
                      onChange={(e) => setPrincipalRelationship(e.target.value as any)}
                      className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="C">Child (C) &bull; Under 21 years old</option>
                      <option value="S">Spouse (S) &bull; Legitimate spouse</option>
                      <option value="P">Parent (P) &bull; Dependent parent 60+</option>
                      <option value="D">Disabled Dependent (D) &bull; 21+ with disability</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-foreground mb-1">
                        Principal PhilHealth PIN *
                      </label>
                      {principalPinValidation?.isComplete && principalPinValidation.isValid && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                          <ShieldCheck className="w-3 h-3 text-primary" /> Verified
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      required={memberType === "DD"}
                      value={principalPin}
                      onChange={(e) => setPrincipalPin(formatPhilHealthPin(e.target.value))}
                      placeholder="XX-XXXXXXXXX-X"
                      maxLength={14}
                      className="w-full px-3.5 py-2 rounded-xl border border-input text-sm font-mono tracking-wider bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                    {principalPinValidation && !principalPinValidation.isValid && principalPinValidation.errorMessage && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{principalPinValidation.errorMessage}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Principal Date of Birth
                    </label>
                    <input
                      type="date"
                      max={new Date().toISOString().split("T")[0]}
                      value={principalDob}
                      onChange={(e) => setPrincipalDob(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Welfare IDs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Senior Citizen OSCA ID (Optional)
                </label>
                <input
                  type="text"
                  value={seniorCitizenId}
                  onChange={(e) => setSeniorCitizenId(e.target.value)}
                  placeholder="OSCA ID Number"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Person with Disability (PWD) ID (Optional)
                </label>
                <input
                  type="text"
                  value={pwdId}
                  onChange={(e) => setPwdId(e.target.value)}
                  placeholder="PWD ID Number"
                  className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Dynamic Institutional Metadata */}
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Building2 className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-foreground">
                3. Institutional Context & Custom Fields
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {INSTITUTIONAL_CUSTOM_FIELDS.map((field) => {
                const isVisible = evaluateFieldVisibility(field, customFieldValues);
                if (!isVisible) return null;

                const cascadingChoices = getCascadingChoices(field, customFieldValues);
                const optionsToRender =
                  cascadingChoices.length > 0 ? cascadingChoices : field.options || [];

                return (
                  <div key={field.fieldKey}>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      {field.label} {field.isRequired && <span className="text-primary">*</span>}
                    </label>

                    {field.dataType === "Select" ? (
                      <select
                        value={customFieldValues[field.fieldKey] || ""}
                        onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                      >
                        <option value="">Select option...</option>
                        {optionsToRender.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={customFieldValues[field.fieldKey] || ""}
                        onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Clinical Context & Structured Allergies */}
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <FileText className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-foreground">
                4. Reason for Visit & Structured Allergies
              </h2>
            </div>

            {/* Reason for Visit with 255-char counter */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-foreground">
                  Chief Complaint / Reason for Visit
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {reasonForVisit.length}/255
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={255}
                value={reasonForVisit}
                onChange={(e) => setReasonForVisit(e.target.value)}
                placeholder="Briefly state your symptoms or consultation purpose (e.g. Annual physical exam, fever for 2 days)..."
                className="w-full px-3.5 py-2 rounded-xl border border-input text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none resize-none"
              />
            </div>

            {/* Structured Allergies Intake */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
                  Documented Allergies
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noKnownAllergies}
                    onChange={(e) => {
                      setNoKnownAllergies(e.target.checked);
                      if (e.target.checked) setAllergies([]);
                    }}
                    className="rounded border-input text-primary focus:ring-primary"
                  />
                  <span>No known allergies (NKA)</span>
                </label>
              </div>

              {!noKnownAllergies && (
                <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                        Category
                      </label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as any)}
                        className="w-full px-3 py-1.5 rounded-lg border border-input text-xs bg-background text-foreground"
                      >
                        <option value="Medication">Medication</option>
                        <option value="Food">Food</option>
                        <option value="Environmental">Environmental</option>
                        <option value="Biologic">Biologic</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                        Severity
                      </label>
                      <select
                        value={newSeverity}
                        onChange={(e) => setNewSeverity(e.target.value as any)}
                        className="w-full px-3 py-1.5 rounded-lg border border-input text-xs bg-background text-foreground"
                      >
                        <option value="Mild">Mild</option>
                        <option value="Moderate">Moderate</option>
                        <option value="Severe">Severe</option>
                        <option value="LifeThreatening">Life-Threatening / Anaphylaxis</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                        Allergen Name *
                      </label>
                      <input
                        type="text"
                        value={newAllergen}
                        onChange={(e) => setNewAllergen(e.target.value)}
                        placeholder="e.g. Penicillin"
                        className="w-full px-3 py-1.5 rounded-lg border border-input text-xs bg-background text-foreground"
                      />
                    </div>
                  </div>

                  {/* Quick picks */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground mr-1">
                      Quick Picks:
                    </span>
                    {ALLERGY_QUICK_PICKS[newCategory].map((pick) => (
                      <button
                        key={pick}
                        type="button"
                        onClick={() => setNewAllergen(pick)}
                        className="px-2 py-0.5 rounded-full text-[11px] bg-card border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        {pick}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      Reaction Manifestation (Optional)
                    </label>
                    <input
                      type="text"
                      value={newReaction}
                      onChange={(e) => setNewReaction(e.target.value)}
                      placeholder="e.g. Urticaria, facial swelling, breathing difficulty"
                      className="w-full px-3 py-1.5 rounded-lg border border-input text-xs bg-background text-foreground"
                    />
                  </div>

                  {allergyError && (
                    <p className="text-xs text-destructive">{allergyError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleAddAllergy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Allergen</span>
                  </button>
                </div>
              )}

              {/* Added Allergy Pills */}
              {allergies.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {allergies.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl text-xs font-medium border ${
                        item.severity === "LifeThreatening"
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : item.severity === "Severe"
                          ? "bg-warning/10 text-warning border-warning/30"
                          : "bg-muted text-foreground border-border"
                      }`}
                    >
                      {item.isAnaphylactic && (
                        <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                      <span>
                        <strong>{item.allergen}</strong> ({item.category} &bull; {item.severity})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAllergy(idx)}
                        className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Outside Diagnostic Document Upload Dropzone */}
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <FileText className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-foreground">
                5. Diagnostic Documents & Clinical Attachments
              </h2>
            </div>

            <OutsideDocumentDropzone
              attachments={attachments}
              onChange={setAttachments}
            />
          </div>

          {/* Submit Action Toolbar */}
          <div className="pt-2 pb-12">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold py-4 px-6 rounded-2xl shadow-xl shadow-primary/20 text-base transition-all disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Submitting Patient Registration...</span>
                </>
              ) : (
                <>
                  <span>Submit Patient Registration</span>
                  <Sparkles className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
