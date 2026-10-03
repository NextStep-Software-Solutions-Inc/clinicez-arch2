"use client";

import React, { useState } from "react";
import {
  GraduationCap,
  User,
  FileText,
  CheckCircle2,
  QrCode,
  Printer,
  AlertCircle,
  Building,
  Phone,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  UploadCloud,
  Check,
  Clock,
  FileCheck,
} from "lucide-react";

interface StudentIntakeClientProps {
  tenantSlug: string;
  tenantName: string;
}

interface UploadedDocItem {
  recordType: "OutsideChestXRay" | "CertificateOfRegistration" | "MedicalCertificate";
  title: string;
  fileName: string;
  fileSize: string;
  fileBase64?: string;
  notes?: string;
}

export default function StudentIntakeClient({
  tenantSlug,
  tenantName,
}: StudentIntakeClientProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State: Demographics
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [dob, setDob] = useState("2005-06-15");
  const [gender, setGender] = useState<"Male" | "Female">("Male");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("San Pedro");
  const [province, setProvince] = useState("Laguna");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("Parent / Guardian");

  // Form State: Academic & Institutional
  const [studentId, setStudentId] = useState("");
  const [college, setCollege] = useState("College of Computer Studies");
  const [program, setProgram] = useState("BS Computer Science");
  const [yearLevel, setYearLevel] = useState("1st Year (Freshman)");
  const [bloodType, setBloodType] = useState("O+");
  const [allergies, setAllergies] = useState("None known");
  const [chronicConditions, setChronicConditions] = useState("None");

  // Form State: Documents
  const [documents, setDocuments] = useState<UploadedDocItem[]>([
    {
      recordType: "OutsideChestXRay",
      title: "Outside Chest X-Ray PA View Film/Report",
      fileName: "chest_xray_outside_clinic.pdf",
      fileSize: "1.4 MB",
      notes: "Clear lung fields, normal heart size.",
    },
    {
      recordType: "CertificateOfRegistration",
      title: "Certificate of Registration (COR - 1st Sem)",
      fileName: "cor_assessment_2026.pdf",
      fileSize: "420 KB",
      notes: "Official enrollment slip for AY 2026-2027.",
    },
  ]);

  // Submission Result State
  const [registrationResult, setRegistrationResult] = useState<{
    queueToken: string;
    patientCode: string;
    fullName: string;
    submittedAt: string;
  } | null>(null);

  const handleFileUploadMock = (
    recordType: "OutsideChestXRay" | "CertificateOfRegistration" | "MedicalCertificate",
    title: string,
    file: File
  ) => {
    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    setDocuments((prev) => [
      ...prev.filter((d) => d.recordType !== recordType),
      {
        recordType,
        title,
        fileName: file.name,
        fileSize: sizeStr,
        notes: `Uploaded via student self-enrollment portal.`,
      },
    ]);
  };

  const handleNextStep1 = () => {
    if (!firstName.trim() || !lastName.trim() || !contactNumber.trim()) {
      setErrorMessage("Please fill in required fields: First Name, Last Name, and Contact Number.");
      return;
    }
    setErrorMessage(null);
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (!studentId.trim()) {
      setErrorMessage("Please enter your Student ID Number or Applicant Reference Code.");
      return;
    }
    setErrorMessage(null);
    setStep(3);
  };

  const handleSubmitIntake = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      dateOfBirth: dob,
      gender,
      contactNumber: contactNumber.trim(),
      email: email.trim() || undefined,
      addressLine: addressLine.trim() || undefined,
      barangay: barangay.trim() || undefined,
      city: city.trim() || undefined,
      province: province.trim() || undefined,
      emergencyContactName: emergencyContactName.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,
      emergencyContactRelationship: emergencyContactRelationship.trim() || undefined,
      bloodType: bloodType || undefined,
      studentId: studentId.trim(),
      college: college.trim() || undefined,
      program: program.trim() || undefined,
      yearLevel: yearLevel.trim() || undefined,
      additionalCustomFields: {
        allergies: allergies.trim() || "None known",
        chronicConditions: chronicConditions.trim() || "None",
        portalSubmissionSource: "StudentSelfEnrollWeb",
      },
      documents: documents.map((d) => ({
        recordType: d.recordType,
        title: d.title,
        fileName: d.fileName,
        storageUri: `https://storage.clinicez.ph/school-uploads/${studentId.trim()}/${d.fileName}`,
        notes: d.notes,
      })),
    };

    try {
      const response = await fetch("/api/v1/public/student-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.message || "Failed to submit student intake registration.");
      }

      const resData = resJson.data || resJson;
      setRegistrationResult({
        queueToken: resData.queueToken || `Q-${Math.floor(100 + Math.random() * 900)}`,
        patientCode: resData.patient?.patientCode || `PAT-${new Date().getFullYear()}-00100`,
        fullName: `${lastName}, ${firstName} ${middleName ? middleName[0] + "." : ""}`,
        submittedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      setStep(4);
    } catch (err: any) {
      setErrorMessage(err.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Institutional Top Brand Header */}
      <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-indigo-900 text-white p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-sky-600/50 backdrop-blur-sm border border-sky-400/30 px-3 py-1 rounded-full text-xs font-medium text-sky-100 mb-2">
              <GraduationCap className="w-3.5 h-3.5" />
              University Health Services • 80/20 Hybrid Pre-Enrollment
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {tenantName} Health Intake Portal
            </h1>
            <p className="text-sky-200 text-sm mt-1">
              Annual Student Medical Clearance & Document Verification System
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <span className="inline-block bg-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider uppercase text-sky-100 border border-white/20">
              AY 2026-2027
            </span>
          </div>
        </div>

        {/* Multi-step progress bar */}
        <div className="mt-8 grid grid-cols-4 gap-2 text-xs font-medium">
          <div
            className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
              step >= 1 ? "border-amber-400 text-amber-200" : "border-white/20 text-white/50"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
              1
            </span>
            <span className="hidden sm:inline">Demographics</span>
          </div>
          <div
            className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
              step >= 2 ? "border-amber-400 text-amber-200" : "border-white/20 text-white/50"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
              2
            </span>
            <span className="hidden sm:inline">Academic Program</span>
          </div>
          <div
            className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
              step >= 3 ? "border-amber-400 text-amber-200" : "border-white/20 text-white/50"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
              3
            </span>
            <span className="hidden sm:inline">Outside Documents</span>
          </div>
          <div
            className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
              step >= 4 ? "border-emerald-400 text-emerald-200" : "border-white/20 text-white/50"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
              4
            </span>
            <span className="hidden sm:inline">Routing Pass</span>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="mx-6 mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* STEP 1: Personal Demographics */}
      {step === 1 && (
        <div className="p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <User className="w-5 h-5 text-sky-600" />
              Step 1: Student Demographics & Identification
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Please enter your full legal name as it appears on your PSA birth certificate or Certificate of Registration.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                First Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="e.g. Juan"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Middle Name
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="e.g. Santos"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Last Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="e.g. Dela Cruz"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Birth <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Biological Sex <span className="text-rose-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={gender}
                onChange={(e) => setGender(e.target.value as "Male" | "Female")}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="0917-123-4567"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="juan.delacruz@school.edu.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Street Address / Unit
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="123 Mabini St."
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Barangay</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Brgy. San Antonio"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City / Municipality</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="San Pedro"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Province</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Laguna"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Emergency Contact Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Guardian Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  placeholder="Maria Dela Cruz"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  placeholder="Mother / Father / Guardian"
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Phone</label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  placeholder="0918-765-4321"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={handleNextStep1}
              className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-sm transition-all"
            >
              Next: Academic Program
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Academic & Institutional Info */}
      {step === 2 && (
        <div className="p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-5 h-5 text-sky-600" />
              Step 2: Campus Program & Medical History
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              Provide your school classification and institutional details for your permanent electronic clinic chart.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Student ID Number / LRN <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono"
                placeholder="e.g. 2026-10492"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                If not yet issued, input your Admission Reference Slip number.
              </span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Year Level
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={yearLevel}
                onChange={(e) => setYearLevel(e.target.value)}
              >
                <option value="1st Year (Freshman)">1st Year (Freshman)</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="Graduate / Post-Grad">Graduate / Post-Grad</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                College / Department
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
              >
                <option value="College of Computer Studies">College of Computer Studies</option>
                <option value="College of Engineering">College of Engineering</option>
                <option value="College of Business Administration">College of Business Administration</option>
                <option value="College of Nursing & Allied Health">College of Nursing & Allied Health</option>
                <option value="College of Education">College of Education</option>
                <option value="College of Arts & Sciences">College of Arts & Sciences</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Degree Program / Major
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="e.g. BS Computer Science"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Type</label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
              >
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Known Allergies</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="e.g. Penicillin, Peanuts, None"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Chronic Conditions</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="e.g. Asthma, None"
                value={chronicConditions}
                onChange={(e) => setChronicConditions(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium px-5 py-2.5 rounded-xl transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handleNextStep2}
              className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-sm transition-all"
            >
              Next: Upload Outside Documents
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Outside Diagnostic Documents */}
      {step === 3 && (
        <div className="p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-600" />
              Step 3: Upload Outside Diagnostic Documents
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              In accordance with university health entrance policies, pre-attach your external laboratory and enrollment forms.
            </p>
          </div>

          {/* Verification Protocol Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900">
            <ShieldCheck className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">Clinic Nurse Verification Protocol (Anti-Fraud Gate)</p>
              <p className="text-amber-800">
                All external medical records uploaded here are marked as{" "}
                <span className="font-semibold underline">Pending Verification</span>. A University Clinic nurse will inspect the official radiologist stamp and physical film/envelope during your physical visit before final clearance.
              </p>
            </div>
          </div>

          {/* Document Upload Slot 1: Outside Chest X-Ray */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-sky-100 text-sky-700 rounded-lg">
                  <FileText className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Outside Chest X-Ray PA View Film / Official Result
                  </h4>
                  <p className="text-xs text-slate-500">
                    Conducted within the last 6 months at any licensed diagnostic center.
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Quarantined for Review
              </span>
            </div>

            {documents.find((d) => d.recordType === "OutsideChestXRay") ? (
              <div className="bg-white border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      {documents.find((d) => d.recordType === "OutsideChestXRay")?.fileName}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {documents.find((d) => d.recordType === "OutsideChestXRay")?.fileSize} • Uploaded Ready
                    </span>
                  </div>
                </div>
                <label className="cursor-pointer text-xs font-semibold text-sky-600 hover:text-sky-700">
                  Replace File
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileUploadMock("OutsideChestXRay", "Outside Chest X-Ray PA View", e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100/50 transition-colors">
                <UploadCloud className="w-8 h-8 text-slate-400 mb-1" />
                <span className="text-xs font-medium text-slate-600">
                  Click to select X-Ray Report (PDF or Photo)
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileUploadMock("OutsideChestXRay", "Outside Chest X-Ray PA View", e.target.files[0]);
                    }
                  }}
                />
              </label>
            )}
          </div>

          {/* Document Upload Slot 2: Certificate of Registration (COR) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <GraduationCap className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Certificate of Registration (COR) / Assessment Slip
                  </h4>
                  <p className="text-xs text-slate-500">
                    Official proof of enrollment issued by the Registrar or College Dean.
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Quarantined for Review
              </span>
            </div>

            {documents.find((d) => d.recordType === "CertificateOfRegistration") ? (
              <div className="bg-white border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800">
                      {documents.find((d) => d.recordType === "CertificateOfRegistration")?.fileName}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {documents.find((d) => d.recordType === "CertificateOfRegistration")?.fileSize} • Uploaded Ready
                    </span>
                  </div>
                </div>
                <label className="cursor-pointer text-xs font-semibold text-sky-600 hover:text-sky-700">
                  Replace File
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileUploadMock("CertificateOfRegistration", "Certificate of Registration (COR)", e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100/50 transition-colors">
                <UploadCloud className="w-8 h-8 text-slate-400 mb-1" />
                <span className="text-xs font-medium text-slate-600">
                  Click to select Enrollment COR (PDF or Photo)
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileUploadMock("CertificateOfRegistration", "Certificate of Registration (COR)", e.target.files[0]);
                    }
                  }}
                />
              </label>
            )}
          </div>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium px-5 py-2.5 rounded-xl transition-all"
              disabled={submitting}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmitIntake}
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all text-sm disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating Routing Pass...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Submit Intake & Generate Digital Pass
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Digital Routing Pass */}
      {step === 4 && registrationResult && (
        <div className="p-6 sm:p-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              Medical Pre-Registration Confirmed!
            </h2>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Your institutional record has been saved. Present this digital routing pass at the University Clinic intake desk.
            </p>
          </div>

          {/* Printable Ticket / Pass Card */}
          <div className="bg-gradient-to-b from-sky-50 to-white border-2 border-sky-500/40 rounded-2xl p-6 sm:p-8 max-w-lg mx-auto shadow-md relative overflow-hidden">
            {/* Cutout circles for ticket effect */}
            <div className="absolute -left-3 top-1/2 w-6 h-6 rounded-full bg-white border border-slate-300 -translate-y-1/2" />
            <div className="absolute -right-3 top-1/2 w-6 h-6 rounded-full bg-white border border-slate-300 -translate-y-1/2" />

            <div className="flex items-center justify-between border-b border-sky-200 pb-4 mb-4">
              <div>
                <span className="text-[11px] font-bold tracking-wider text-sky-800 uppercase">
                  Digital Fast-Track Pass
                </span>
                <h3 className="text-lg font-bold text-slate-800">{tenantName}</h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Submitted</span>
                <span className="text-xs font-semibold text-slate-700">{registrationResult.submittedAt}</span>
              </div>
            </div>

            {/* Token Hero Display */}
            <div className="text-center py-4 bg-white rounded-xl border border-sky-100 shadow-sm my-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                Queue Routing Token
              </span>
              <span className="text-4xl sm:text-5xl font-black text-sky-600 tracking-tight">
                {registrationResult.queueToken}
              </span>
              <span className="text-xs text-emerald-700 font-semibold mt-1 inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                ● 80% Fast-Track Digital Lane
              </span>
            </div>

            {/* QR Code Simulation Graphic */}
            <div className="flex justify-center my-4">
              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
                <div className="w-36 h-36 bg-slate-900 rounded-lg p-2 flex flex-col justify-between items-center text-white">
                  <div className="flex justify-between w-full">
                    <div className="w-6 h-6 border-2 border-white rounded-sm" />
                    <div className="w-6 h-6 border-2 border-white rounded-sm" />
                  </div>
                  <QrCode className="w-12 h-12 text-white animate-pulse" />
                  <div className="flex justify-between w-full">
                    <div className="w-6 h-6 border-2 border-white rounded-sm" />
                    <div className="w-4 h-4 bg-white rounded-sm" />
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                  {registrationResult.patientCode}
                </span>
              </div>
            </div>

            {/* Student Demographics Summary */}
            <div className="text-xs space-y-2 border-t border-dashed border-slate-300 pt-4 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Student Name:</span>
                <span className="font-bold text-slate-800">{registrationResult.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Student ID / LRN:</span>
                <span className="font-mono font-bold text-sky-700">{studentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Program / Year:</span>
                <span className="font-medium text-slate-800">{program} • {yearLevel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Attached Documents:</span>
                <span className="font-bold text-amber-700">{documents.length} File(s) Quarantined</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-6 rounded-xl transition-all text-sm"
            >
              <Printer className="w-4 h-4" />
              Print / Save Pass (PDF)
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setRegistrationResult(null);
                setFirstName("");
                setLastName("");
                setMiddleName("");
                setStudentId("");
                setContactNumber("");
              }}
              className="inline-flex items-center justify-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium py-2.5 px-6 rounded-xl transition-all text-sm"
            >
              Register Another Student
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
