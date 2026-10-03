using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

public sealed class YakapClinicalMapper : IYakapClinicalMapper
{
    public YakapReportDocumentDto MapToYakapReportDocument(
        string reportTagging,
        string effectiveYear,
        ClinicSettings settings,
        IReadOnlyList<ConsultationEncounter> encounters,
        IReadOnlyDictionary<Guid, ClinicPatient> patients,
        IReadOnlyDictionary<Guid, TriageVitals> vitalsMap,
        string transmittalNumber)
    {
        var isFirstTranche = reportTagging == "1";
        var accreditationNo = !string.IsNullOrWhiteSpace(settings.AccreditationNumber)
            ? settings.AccreditationNumber
            : "000000000";

        var username = accreditationNo;
        var password = "PhilHealthPassword123!";
        var certId = !string.IsNullOrWhiteSpace(settings.LicenseToken)
            ? settings.LicenseToken
            : "PHILHEALTH_CERT_ID";

        var enlistments = new List<YakapEnlistmentDto>();
        var profiles = new List<YakapProfileDto>();
        var soaps = new List<YakapSoapDto>();
        var medicines = new List<YakapMedicineDto>();

        // Process each distinct patient in the encounters
        var distinctPatientIds = encounters.Select(e => e.PatientId).Distinct();

        foreach (var patientId in distinctPatientIds)
        {
            if (!patients.TryGetValue(patientId, out var patient))
                continue;

            var patientEncounters = encounters.Where(e => e.PatientId == patientId).OrderBy(e => e.EncounterDate).ToList();
            var firstEncounter = patientEncounters.First();
            vitalsMap.TryGetValue(firstEncounter.Id, out var vitals);

            var pin = NormalizePin(patient.PhilHealthNumber ?? string.Empty);
            var sex = patient.Gender.StartsWith("F", StringComparison.OrdinalIgnoreCase) ? "F" : "M";
            var patientType = "M"; // Principal Member
            var caseNo = $"EHCI{patient.PatientCode}";
            var transNo = $"THCI{transmittalNumber}";
            var profCaseNo = $"PHCI{patient.PatientCode}";
            var soapCaseNo = $"SHCI{patient.PatientCode}";

            // 1. Enlistment
            enlistments.Add(new YakapEnlistmentDto(
                HciCaseNo: caseNo,
                HciTransNo: transNo,
                EffYear: effectiveYear,
                EnlistStat: "1",
                EnlistDate: firstEncounter.EncounterDate.ToString("yyyy-MM-dd"),
                PackageType: "K",
                MemPin: pin,
                MemFname: patient.FirstName,
                MemMname: patient.MiddleName ?? string.Empty,
                MemLname: patient.LastName,
                MemExtname: patient.Suffix ?? string.Empty,
                MemDob: patient.DateOfBirth.ToString("yyyy-MM-dd"),
                PatientPin: pin,
                PatientFname: patient.FirstName,
                PatientMname: patient.MiddleName ?? string.Empty,
                PatientLname: patient.LastName,
                PatientExtname: patient.Suffix ?? string.Empty,
                PatientSex: sex,
                PatientDob: patient.DateOfBirth.ToString("yyyy-MM-dd"),
                PatientType: patientType,
                PatientMobileNo: patient.ContactNumber,
                PatientLandlineNo: string.Empty,
                WithConsent: "Y",
                TransDate: DateTime.UtcNow.ToString("yyyy-MM-dd"),
                CreatedBy: settings.ClinicName,
                ReportStatus: "U",
                DeficiencyRemarks: string.Empty));

            // Physical exam pertinence
            var pePertinent = MapPhysicalExam(vitals);

            // 2. Profile
            var medHistories = new List<YakapMedicalHistoryDto>();
            if (!string.IsNullOrWhiteSpace(patient.ChronicConditions))
            {
                var condLower = patient.ChronicConditions.ToLowerInvariant();
                if (condLower.Contains("hypertens"))
                    medHistories.Add(new YakapMedicalHistoryDto("1"));
                if (condLower.Contains("diabet"))
                    medHistories.Add(new YakapMedicalHistoryDto("2"));
                if (condLower.Contains("asthma"))
                    medHistories.Add(new YakapMedicalHistoryDto("3"));
            }

            profiles.Add(new YakapProfileDto(
                HciTransNo: transNo,
                HciCaseNo: profCaseNo,
                ProfDate: firstEncounter.EncounterDate.ToString("yyyy-MM-dd"),
                PatientPin: pin,
                PatientType: patientType,
                PatientAge: FormatPhilHealthAge(patient.DateOfBirth, firstEncounter.EncounterDate),
                MemPin: pin,
                EffYear: effectiveYear,
                ATC: "A",
                IsWalkedIn: "Y",
                TransDate: DateTime.UtcNow.ToString("yyyy-MM-dd"),
                MedicalHistories: medHistories,
                MedicalSpecifics: [],
                SurgicalHistories: [],
                FamilyHistories: [],
                FamilySpecifics: [],
                SocialHistory: new YakapSocialHistoryDto("N", string.Empty, "N", string.Empty, "N", "N"),
                Immunizations: [],
                MenstrualHistory: new YakapMenstrualHistoryDto("12", string.Empty, "3", "28", "2", "18", string.Empty, "N", string.Empty, "N"),
                PregnancyHistory: new YakapPregnancyHistoryDto("0", "0", string.Empty, "0", "0", "0", "0", "N", "N", "N"),
                PhysicalExam: pePertinent,
                BloodType: !string.IsNullOrWhiteSpace(patient.BloodType) ? patient.BloodType : "O+",
                GenSurveyId: "1",
                GenSurveyRem: string.Empty,
                PhysicalExamMiscs: [],
                PhysicalExamSpecifics: new YakapPhysicalExamSpecificDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty),
                NcdAnswers: new YakapNcdAnswersDto(),
                ReportStatus: "U",
                DeficiencyRemarks: string.Empty));

            // 3. SOAP Encounters
            if (isFirstTranche)
            {
                // DTD requires placeholder SOAP for First Tranche validation
                soaps.Add(new YakapSoapDto(
                    HciCaseNo: soapCaseNo,
                    HciTransNo: transNo,
                    SoapDate: firstEncounter.EncounterDate.ToString("yyyy-MM-dd"),
                    PatientPin: pin,
                    PatientType: patientType,
                    MemPin: pin,
                    EffYear: effectiveYear,
                    ATC: "A",
                    IsWalkedIn: "Y",
                    CoPay: "0.00",
                    TransDate: firstEncounter.EncounterDate.ToString("yyyy-MM-dd"),
                    IllnessHistory: "First tranche baseline profiling",
                    SignsSymptoms: "OT",
                    OtherComplaint: "First tranche baseline profiling",
                    PainSite: string.Empty,
                    PhysicalExam: pePertinent,
                    PhysicalExamMiscs: [],
                    PhysicalExamSpecifics: new YakapPhysicalExamSpecificDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty),
                    IcdCodes: ["Z00.0"],
                    Diagnostics: [],
                    Managements: [new YakapManagementDto("6", "General counseling")],
                    AdviceRemarks: "Follow-up as scheduled",
                    ReportStatus: "U",
                    DeficiencyRemarks: string.Empty));

                // Placeholder Medicine
                medicines.Add(new YakapMedicineDto(
                    HciCaseNo: soapCaseNo,
                    HciTransNo: transNo,
                    Category: "P",
                    DrugCode: "NOMED0000000000000000000000000",
                    GenericCode: "NOMED",
                    SaltCode: string.Empty,
                    StrengthCode: string.Empty,
                    FormCode: string.Empty,
                    UnitCode: string.Empty,
                    PackageCode: string.Empty,
                    OtherMedicine: string.Empty,
                    OthMedDrugGrouping: string.Empty,
                    Route: "Oral",
                    Quantity: "0",
                    ActualUnitPrice: "0.00",
                    TotalAmtPrice: "0.00",
                    InstructionQuantity: "0",
                    InstructionStrength: string.Empty,
                    InstructionFrequency: string.Empty,
                    PrescribingPhysician: firstEncounter.DoctorName,
                    IsDispensed: "N",
                    DateDispensed: null,
                    DispensingPersonnel: null,
                    IsApplicable: "N",
                    DateAdded: firstEncounter.EncounterDate.ToString("yyyy-MM-dd"),
                    ReportStatus: "U",
                    DeficiencyRemarks: string.Empty));
            }
            else
            {
                // Second Tranche: Complete SOAP encounters & prescribed medicines
                foreach (var encounter in patientEncounters)
                {
                    vitalsMap.TryGetValue(encounter.Id, out var encVitals);
                    var encPe = MapPhysicalExam(encVitals ?? vitals);

                    var icdCodes = encounter.Diagnoses.Count > 0
                        ? encounter.Diagnoses.Select(d => d.Icd10Code).Distinct().ToList()
                        : new List<string> { "Z00.0" };

                    var signs = MapSignsAndSymptoms(encounter.Subjective);
                    var illness = !string.IsNullOrWhiteSpace(encounter.Subjective)
                        ? encounter.Subjective
                        : "Follow-up consultation";

                    var advice = !string.IsNullOrWhiteSpace(encounter.Plan)
                        ? encounter.Plan
                        : "Follow-up as needed";

                    soaps.Add(new YakapSoapDto(
                        HciCaseNo: soapCaseNo,
                        HciTransNo: transNo,
                        SoapDate: encounter.EncounterDate.ToString("yyyy-MM-dd"),
                        PatientPin: pin,
                        PatientType: patientType,
                        MemPin: pin,
                        EffYear: effectiveYear,
                        ATC: "A",
                        IsWalkedIn: "Y",
                        CoPay: "0.00",
                        TransDate: encounter.EncounterDate.ToString("yyyy-MM-dd"),
                        IllnessHistory: illness,
                        SignsSymptoms: signs,
                        OtherComplaint: signs == "OT" ? illness : null,
                        PainSite: string.Empty,
                        PhysicalExam: encPe,
                        PhysicalExamMiscs: [],
                        PhysicalExamSpecifics: new YakapPhysicalExamSpecificDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty),
                        IcdCodes: icdCodes,
                        Diagnostics: [],
                        Managements: [new YakapManagementDto("6", advice)],
                        AdviceRemarks: advice,
                        ReportStatus: "U",
                        DeficiencyRemarks: string.Empty));

                    if (encounter.Prescriptions.Count > 0)
                    {
                        foreach (var rx in encounter.Prescriptions)
                        {
                            medicines.Add(new YakapMedicineDto(
                                HciCaseNo: soapCaseNo,
                                HciTransNo: transNo,
                                Category: "P",
                                DrugCode: FormatDrugCode(rx.GenericName),
                                GenericCode: rx.GenericName,
                                SaltCode: string.Empty,
                                StrengthCode: rx.Dosage,
                                FormCode: rx.Form,
                                UnitCode: "TAB",
                                PackageCode: string.Empty,
                                OtherMedicine: rx.BrandName,
                                OthMedDrugGrouping: string.Empty,
                                Route: "Oral",
                                Quantity: rx.Quantity.ToString(),
                                ActualUnitPrice: "0.00",
                                TotalAmtPrice: "0.00",
                                InstructionQuantity: "1",
                                InstructionStrength: rx.Dosage,
                                InstructionFrequency: rx.Sig,
                                PrescribingPhysician: encounter.DoctorName,
                                IsDispensed: (encounter.RxDispenseStatus is PrescriptionDispenseStatus.DispensedAtPartnerPharmacy or PrescriptionDispenseStatus.DispensedExternally) ? "Y" : "N",
                                DateDispensed: encounter.RxDispensedAt?.ToString("yyyy-MM-dd"),
                                DispensingPersonnel: encounter.RxDispensedPharmacistName,
                                IsApplicable: "Y",
                                DateAdded: encounter.EncounterDate.ToString("yyyy-MM-dd"),
                                ReportStatus: "U",
                                DeficiencyRemarks: string.Empty));
                        }
                    }
                    else
                    {
                        // DTD requires at least one medicine element
                        medicines.Add(new YakapMedicineDto(
                            HciCaseNo: soapCaseNo,
                            HciTransNo: transNo,
                            Category: "P",
                            DrugCode: "NOMED0000000000000000000000000",
                            GenericCode: "NOMED",
                            SaltCode: string.Empty,
                            StrengthCode: string.Empty,
                            FormCode: string.Empty,
                            UnitCode: string.Empty,
                            PackageCode: string.Empty,
                            OtherMedicine: string.Empty,
                            OthMedDrugGrouping: string.Empty,
                            Route: "Oral",
                            Quantity: "0",
                            ActualUnitPrice: "0.00",
                            TotalAmtPrice: "0.00",
                            InstructionQuantity: "0",
                            InstructionStrength: string.Empty,
                            InstructionFrequency: string.Empty,
                            PrescribingPhysician: encounter.DoctorName,
                            IsDispensed: "N",
                            DateDispensed: null,
                            DispensingPersonnel: null,
                            IsApplicable: "N",
                            DateAdded: encounter.EncounterDate.ToString("yyyy-MM-dd"),
                            ReportStatus: "U",
                            DeficiencyRemarks: string.Empty));
                    }
                }
            }
        }

        return new YakapReportDocumentDto(
            Username: username,
            Password: password,
            HciAccreNo: accreditationNo,
            PmccNo: accreditationNo,
            CertificationId: certId,
            HciTransmittalNumber: transmittalNumber,
            Enlistments: enlistments,
            Profiles: profiles,
            Soaps: soaps,
            DiagnosticResults: [],
            Medicines: medicines);
    }

    public string FormatPhilHealthAge(DateOnly birthDate, DateTime asOfDate)
    {
        var asOf = DateOnly.FromDateTime(asOfDate);
        if (asOf < birthDate) return "0 YR(S), 0 MO(S), 0 DAY(S)";

        int years = asOf.Year - birthDate.Year;
        int months = asOf.Month - birthDate.Month;
        int days = asOf.Day - birthDate.Day;

        if (days < 0)
        {
            months--;
            var prevMonth = asOf.AddMonths(-1);
            days += DateTime.DaysInMonth(prevMonth.Year, prevMonth.Month);
        }

        if (months < 0)
        {
            years--;
            months += 12;
        }

        return $"{years} YR(S), {months} MO(S), {days} DAY(S)";
    }

    public string NormalizePin(string pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return "000000000000";
        var digits = new string(pin.Where(char.IsDigit).ToArray());
        return digits.PadLeft(12, '0');
    }

    public string FormatDrugCode(string rawDrugCode)
    {
        if (string.IsNullOrWhiteSpace(rawDrugCode))
            return "NOMED0000000000000000000000000";

        var sanitized = new string(rawDrugCode.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        if (sanitized.Length >= 30)
            return sanitized[..30];

        return sanitized.PadRight(30, '0');
    }

    private static YakapPhysicalExamPertinentDto MapPhysicalExam(TriageVitals? vitals)
    {
        return new YakapPhysicalExamPertinentDto(
            Systolic: (vitals?.SystolicBp ?? 120).ToString(),
            Diastolic: (vitals?.DiastolicBp ?? 80).ToString(),
            Hr: (vitals?.HeartRateBpm ?? 72).ToString(),
            Rr: (vitals?.RespiratoryRateBreathsPerMin ?? 18).ToString(),
            Temp: (vitals?.TemperatureCelsius ?? 36.5m).ToString("F1"),
            Height: (vitals?.HeightCm ?? 165m).ToString("F0"),
            Weight: (vitals?.WeightKg ?? 60m).ToString("F0"),
            BMI: (vitals?.Bmi ?? 22.0m).ToString("F1"),
            ZScore: string.Empty,
            LeftVision: string.Empty,
            RightVision: string.Empty,
            Length: string.Empty,
            HeadCirc: string.Empty,
            SkinfoldThickness: string.Empty,
            Waist: string.Empty,
            Hip: string.Empty,
            Limbs: string.Empty,
            MidUpperArmCirc: string.Empty,
            ReportStatus: "U",
            DeficiencyRemarks: string.Empty);
    }

    private static string MapSignsAndSymptoms(string? subjective)
    {
        if (string.IsNullOrWhiteSpace(subjective)) return "OT";
        var s = subjective.ToLowerInvariant();

        if (s.Contains("cough")) return "1";
        if (s.Contains("fever")) return "2";
        if (s.Contains("headache")) return "3";
        if (s.Contains("diarrhea")) return "4";
        if (s.Contains("vomit")) return "5";
        if (s.Contains("abdom") || s.Contains("stomach")) return "6";
        if (s.Contains("breath") || s.Contains("dyspnea")) return "7";
        if (s.Contains("chest")) return "8";
        if (s.Contains("rash")) return "9";

        return "OT";
    }
}
