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
        string transmittalNumber,
        IReadOnlyDictionary<Guid, YakapNcdAnswersDto>? ncdMap = null)
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
            var caseNo = !string.IsNullOrWhiteSpace(patient.PhilHealthCaseNo)
                ? patient.PhilHealthCaseNo
                : $"C{patient.PatientCode.Replace("-", string.Empty)}";
            var enlistTransNo = !string.IsNullOrWhiteSpace(patient.PhilHealthEnlistmentNo)
                ? patient.PhilHealthEnlistmentNo
                : $"E{patient.PatientCode.Replace("-", string.Empty)}";
            var profTransNo = !string.IsNullOrWhiteSpace(patient.PhilHealthProfilingTransNo)
                ? patient.PhilHealthProfilingTransNo
                : $"P{patient.PatientCode.Replace("-", string.Empty)}";
            var soapTransNo = !string.IsNullOrWhiteSpace(firstEncounter.PhilHealthSoapTransNo)
                ? firstEncounter.PhilHealthSoapTransNo
                : $"S{patient.PatientCode.Replace("-", string.Empty)}";

            // 1. Enlistment
            enlistments.Add(new YakapEnlistmentDto(
                HciCaseNo: caseNo,
                HciTransNo: enlistTransNo,
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

            // 2. Profile - age & gender responsiveness + standalone profile support
            var encDate = firstEncounter.EncounterDate;
            var birthDate = patient.DateOfBirth;
            int ageYears = encDate.Year - birthDate.Year;
            if (DateOnly.FromDateTime(encDate) < birthDate.AddYears(ageYears))
                ageYears--;

            bool isFemale = patient.Gender.StartsWith("F", StringComparison.OrdinalIgnoreCase);
            bool isPediatric = ageYears < 18;
            bool isSenior = ageYears >= 60;

            var customProfile = ExtractCustomProfile(patient);

            // Physical exam pertinence (age-responsive: pediatric anthropometrics vs adult waist/hip)
            var pePertinent = MapPhysicalExam(vitals, customProfile, isPediatric);

            // Medical histories & specifics (chronic conditions with 3-digit codes or DTD '+' fallback)
            var (medHistories, medSpecifics) = MapMedicalHistories(patient, customProfile);

            // Surgical histories (DTD '+' fallback to 'None' if none recorded)
            var surgHistories = MapSurgicalHistories(customProfile);

            // Family histories & specifics (DTD '+' fallback)
            var (famHistories, famSpecifics) = MapFamilyHistories(customProfile);

            // Social history (pediatric zeroes vs adult responses)
            var socHist = MapSocialHistory(customProfile, isPediatric);

            // Immunizations (recorded vaccines or non-opinionated statutory code 999 under OtherImm)
            var immunizations = MapImmunizations(customProfile);

            // Menstrual history (strictly N for male and pre-menarche female < 9)
            var mensHist = MapMenstrualHistory(customProfile, isFemale, ageYears);

            // Pregnancy history (strictly N for male and non-pregnant female, overwritable for pregnant adolescents and adults)
            var pregHist = MapPregnancyHistory(customProfile, isFemale);

            // Physical exam miscs & specifics (DTD '+' fallback with normal systems '1')
            var peMiscs = MapPhysicalExamMiscs(customProfile);
            var peSpecifics = MapPhysicalExamSpecifics(customProfile);

            var bloodType = customProfile?.BloodType 
                ?? (!string.IsNullOrWhiteSpace(patient.BloodType) ? patient.BloodType : string.Empty);
            var genSurveyId = customProfile?.GenSurveyId ?? "1";
            var genSurveyRem = customProfile?.GenSurveyRemarks ?? string.Empty;

            var ncdAnswers = isPediatric
                ? new YakapNcdAnswersDto("N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "A", "N", "N", "", "", "", "N", "", "", "N", "", "", "N", "", "", "N", "N")
                : (ncdMap != null && ncdMap.TryGetValue(patient.Id, out var patientNcd))
                    ? patientNcd
                    : (customProfile?.NcdAnswers != null && !string.IsNullOrWhiteSpace(customProfile.NcdAnswers.Qid1Yn))
                        ? customProfile.NcdAnswers
                        : MapNcdFromPatientCustomFields(patient);

            profiles.Add(new YakapProfileDto(
                HciTransNo: profTransNo,
                HciCaseNo: caseNo,
                ProfDate: firstEncounter.EncounterDate.ToString("yyyy-MM-dd"),
                PatientPin: pin,
                PatientType: patientType,
                PatientAge: FormatPhilHealthAge(patient.DateOfBirth, firstEncounter.EncounterDate),
                MemPin: pin,
                EffYear: effectiveYear,
                ATC: "A",
                IsWalkedIn: customProfile?.IsWalkedIn ?? "Y",
                TransDate: DateTime.UtcNow.ToString("yyyy-MM-dd"),
                MedicalHistories: medHistories,
                MedicalSpecifics: medSpecifics,
                SurgicalHistories: surgHistories,
                FamilyHistories: famHistories,
                FamilySpecifics: famSpecifics,
                SocialHistory: socHist,
                Immunizations: immunizations,
                MenstrualHistory: mensHist,
                PregnancyHistory: pregHist,
                PhysicalExam: pePertinent,
                BloodType: bloodType,
                GenSurveyId: genSurveyId,
                GenSurveyRem: genSurveyRem,
                PhysicalExamMiscs: peMiscs,
                PhysicalExamSpecifics: peSpecifics,
                NcdAnswers: ncdAnswers,
                ReportStatus: "U",
                DeficiencyRemarks: string.Empty));

            // 3. SOAP Encounters
            if (isFirstTranche)
            {
                // DTD requires placeholder SOAP for First Tranche validation
                soaps.Add(new YakapSoapDto(
                    HciCaseNo: caseNo,
                    HciTransNo: soapTransNo,
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
                    SignsSymptoms: "X",
                    OtherComplaint: "First tranche baseline profiling",
                    PainSite: string.Empty,
                    PhysicalExam: pePertinent,
                    PhysicalExamMiscs: [new YakapPhysicalExamMiscDto("1", "1", "1", "1", "1", "1", "1", "1")],
                    PhysicalExamSpecifics: new YakapPhysicalExamSpecificDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty),
                    IcdCodes: ["Z00.0"],
                    Diagnostics: [],
                    Managements: [new YakapManagementDto("6", "General counseling")],
                    AdviceRemarks: "Follow-up as scheduled",
                    ReportStatus: "U",
                    DeficiencyRemarks: string.Empty));

                // Placeholder Medicine
                medicines.Add(new YakapMedicineDto(
                    HciCaseNo: caseNo,
                    HciTransNo: soapTransNo,
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

                    var (signs, otherComplaint) = PhilHealthCatalogResolver.ResolveSignsAndSymptoms(encounter.Subjective);

                    var advice = !string.IsNullOrWhiteSpace(encounter.Plan)
                        ? encounter.Plan
                        : "Follow-up as needed";

                    var encSoapTransNo = !string.IsNullOrWhiteSpace(encounter.PhilHealthSoapTransNo)
                        ? encounter.PhilHealthSoapTransNo
                        : soapTransNo;

                    soaps.Add(new YakapSoapDto(
                        HciCaseNo: caseNo,
                        HciTransNo: encSoapTransNo,
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
                        OtherComplaint: otherComplaint,
                        PainSite: string.Empty,
                        PhysicalExam: encPe,
                        PhysicalExamMiscs: [new YakapPhysicalExamMiscDto("1", "1", "1", "1", "1", "1", "1", "1")],
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
                                HciCaseNo: caseNo,
                                HciTransNo: encSoapTransNo,
                                Category: "P",
                                DrugCode: PhilHealthCatalogResolver.ResolveDrugCode(rx.GenericName, rx.Dosage),
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
                            HciCaseNo: caseNo,
                            HciTransNo: encSoapTransNo,
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

    public string FormatDrugCode(string rawDrugCode) => PhilHealthCatalogResolver.ResolveDrugCode(rawDrugCode);

    private static PhilHealthPatientProfileDto? ExtractCustomProfile(ClinicPatient patient)
    {
        if (patient.CustomFields == null || !patient.CustomFields.TryGetValue("philhealth_profile", out var profObj) || profObj == null)
            return null;

        if (profObj is PhilHealthPatientProfileDto typed)
            return typed;

        try
        {
            var json = profObj.ToString();
            if (!string.IsNullOrWhiteSpace(json))
            {
                return System.Text.Json.JsonSerializer.Deserialize<PhilHealthPatientProfileDto>(json,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
        }
        catch
        {
            // Fall through
        }

        return null;
    }

    private static (List<YakapMedicalHistoryDto> Histories, List<YakapSpecificHistoryDto> Specifics) MapMedicalHistories(
        ClinicPatient patient,
        PhilHealthPatientProfileDto? customProfile)
    {
        return PhilHealthCatalogResolver.ResolveMedicalHistories(
            patient.ChronicConditions,
            customProfile?.MedicalHistories);
    }

    private static List<YakapSurgicalHistoryDto> MapSurgicalHistories(PhilHealthPatientProfileDto? customProfile)
    {
        var list = new List<YakapSurgicalHistoryDto>();
        if (customProfile?.SurgicalHistories?.Count > 0)
        {
            foreach (var s in customProfile.SurgicalHistories)
            {
                list.Add(new YakapSurgicalHistoryDto(s.ProcedureDesc, s.ProcedureDate ?? string.Empty));
            }
        }

        if (list.Count == 0)
        {
            list.Add(new YakapSurgicalHistoryDto("None", string.Empty));
        }

        return list;
    }

    private static (List<YakapMedicalHistoryDto> Histories, List<YakapSpecificHistoryDto> Specifics) MapFamilyHistories(
        PhilHealthPatientProfileDto? customProfile)
    {
        var histories = new List<YakapMedicalHistoryDto>();
        var specifics = new List<YakapSpecificHistoryDto>();

        if (customProfile?.FamilyHistories?.Count > 0)
        {
            foreach (var fh in customProfile.FamilyHistories)
            {
                histories.Add(new YakapMedicalHistoryDto(fh.Code));
                if (!string.IsNullOrWhiteSpace(fh.SpecificDesc))
                {
                    specifics.Add(new YakapSpecificHistoryDto(fh.Code, fh.SpecificDesc));
                }
            }
        }

        if (histories.Count == 0)
        {
            histories.Add(new YakapMedicalHistoryDto("99"));
            specifics.Add(new YakapSpecificHistoryDto("99", "None"));
        }
        else if (specifics.Count == 0)
        {
            specifics.Add(new YakapSpecificHistoryDto(histories[0].MdiseaseCode, "None"));
        }

        return (histories, specifics);
    }

    private static YakapSocialHistoryDto MapSocialHistory(PhilHealthPatientProfileDto? customProfile, bool isPediatric)
    {
        if (isPediatric)
        {
            return new YakapSocialHistoryDto("N", string.Empty, "N", string.Empty, "N", "N");
        }

        if (customProfile != null)
        {
            return new YakapSocialHistoryDto(
                IsSmoker: customProfile.IsSmoker ? "Y" : "N",
                NoCigpk: customProfile.CigarettesPerDay ?? string.Empty,
                IsAdrinker: customProfile.IsAlcoholDrinker ? "Y" : "N",
                NoBottles: customProfile.BottlesPerDay ?? string.Empty,
                IllDrugUser: customProfile.IllDrugUser ? "Y" : "N",
                IsSexuallyActive: customProfile.IsSexuallyActive ? "Y" : "N");
        }

        return new YakapSocialHistoryDto("N", string.Empty, "N", string.Empty, "N", "N");
    }

    private static List<YakapImmunizationDto> MapImmunizations(PhilHealthPatientProfileDto? customProfile)
    {
        var list = new List<YakapImmunizationDto>();

        if (customProfile != null)
        {
            foreach (var imm in customProfile.ChildImmunizations)
                list.Add(new YakapImmunizationDto(ChildImmcode: imm, YoungwImmcode: "", PregwImmcode: "", ElderlyImmcode: "", OtherImm: ""));
            foreach (var imm in customProfile.YoungWomanImmunizations)
                list.Add(new YakapImmunizationDto(ChildImmcode: "", YoungwImmcode: imm, PregwImmcode: "", ElderlyImmcode: "", OtherImm: ""));
            foreach (var imm in customProfile.PregnantWomanImmunizations)
                list.Add(new YakapImmunizationDto(ChildImmcode: "", YoungwImmcode: "", PregwImmcode: imm, ElderlyImmcode: "", OtherImm: ""));
            foreach (var imm in customProfile.ElderlyImmunizations)
                list.Add(new YakapImmunizationDto(ChildImmcode: "", YoungwImmcode: "", PregwImmcode: "", ElderlyImmcode: imm, OtherImm: ""));
            foreach (var imm in customProfile.OtherImmunizations)
                list.Add(new YakapImmunizationDto(ChildImmcode: "", YoungwImmcode: "", PregwImmcode: "", ElderlyImmcode: "", OtherImm: imm));
        }

        // PhilHealth DTD requires at least 1 IMMUNIZATION element (IMMUNIZATION+).
        // Code 999 is standard PhilHealth code for "None / Not Given" without assuming age group.
        if (list.Count == 0)
        {
            list.Add(new YakapImmunizationDto(ChildImmcode: "", YoungwImmcode: "", PregwImmcode: "", ElderlyImmcode: "", OtherImm: "999"));
        }

        return list;
    }

    private static YakapMenstrualHistoryDto MapMenstrualHistory(
        PhilHealthPatientProfileDto? customProfile,
        bool isFemale,
        int ageYears)
    {
        // Strictly non-applicable for males or females < 9 yrs
        if (!isFemale || ageYears < 9)
        {
            return new YakapMenstrualHistoryDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, "N", string.Empty, "N");
        }

        // Overwritable by patient / clinician profile response
        if (customProfile != null)
        {
            if (customProfile.MenstrualApplicable)
            {
                return new YakapMenstrualHistoryDto(
                    MenarchePeriod: customProfile.MenarcheAge ?? string.Empty,
                    LastMensPeriod: customProfile.LastMensPeriod ?? string.Empty,
                    PeriodDuration: customProfile.PeriodDurationDays ?? string.Empty,
                    MensInterval: customProfile.CycleIntervalDays ?? string.Empty,
                    PadsPerDay: customProfile.PadsPerDay ?? string.Empty,
                    OnsetSexIc: customProfile.CoitarcheAge ?? string.Empty,
                    BirthCtrlMethod: customProfile.BirthControlMethod ?? string.Empty,
                    IsMenopause: customProfile.IsMenopause ? "Y" : "N",
                    MenopauseAge: customProfile.MenopauseAge ?? string.Empty,
                    IsApplicable: "Y");
            }

            // Explicitly set to not applicable by clinician/patient -> blank fallback strings
            return new YakapMenstrualHistoryDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, "N", string.Empty, "N");
        }

        // Female >= 9 without custom profile: defaults to Applicable (Y), leaving unrecorded fields blank (no opinionated "12", "3", "28", etc.)
        return new YakapMenstrualHistoryDto(
            MenarchePeriod: string.Empty,
            LastMensPeriod: string.Empty,
            PeriodDuration: string.Empty,
            MensInterval: string.Empty,
            PadsPerDay: string.Empty,
            OnsetSexIc: string.Empty,
            BirthCtrlMethod: string.Empty,
            IsMenopause: "N",
            MenopauseAge: string.Empty,
            IsApplicable: "Y");
    }

    private static YakapPregnancyHistoryDto MapPregnancyHistory(
        PhilHealthPatientProfileDto? customProfile,
        bool isFemale)
    {
        if (!isFemale)
        {
            return new YakapPregnancyHistoryDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, "N");
        }

        // Adolescent females (age 10-17) or adults: if indicated in customProfile (overwritable by patient response)
        if (customProfile != null && customProfile.PregnancyApplicable)
        {
            return new YakapPregnancyHistoryDto(
                PregCnt: customProfile.Gravida.ToString(),
                DeliveryCnt: customProfile.Para.ToString(),
                DeliveryTyp: !string.IsNullOrWhiteSpace(customProfile.DeliveryType) ? customProfile.DeliveryType : "V",
                FullTermCnt: customProfile.FullTermCount.ToString(),
                PrematureCnt: customProfile.PrematureCount.ToString(),
                AbortionCnt: customProfile.AbortionCount.ToString(),
                LivChildrenCnt: customProfile.LivingChildrenCount.ToString(),
                WPregIndhyp: customProfile.PreEclampsiaHypertension ? "Y" : "N",
                WFamPlan: customProfile.FamilyPlanningCounseling ? "Y" : "N",
                IsApplicable: "Y");
        }

        // Default: pregnant history defaults to false/N with blank fallback strings for non-applicable fields
        return new YakapPregnancyHistoryDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, "N");
    }

    private static YakapPhysicalExamPertinentDto MapPhysicalExam(
        TriageVitals? vitals,
        PhilHealthPatientProfileDto? customProfile = null,
        bool isPediatric = false)
    {
        return new YakapPhysicalExamPertinentDto(
            Systolic: customProfile?.Systolic ?? (vitals?.SystolicBp?.ToString() ?? string.Empty),
            Diastolic: customProfile?.Diastolic ?? (vitals?.DiastolicBp?.ToString() ?? string.Empty),
            Hr: customProfile?.HeartRate ?? (vitals?.HeartRateBpm?.ToString() ?? string.Empty),
            Rr: customProfile?.RespiratoryRate ?? (vitals?.RespiratoryRateBreathsPerMin?.ToString() ?? string.Empty),
            Temp: customProfile?.Temperature ?? (vitals?.TemperatureCelsius?.ToString("F1") ?? string.Empty),
            Height: customProfile?.HeightCm ?? (vitals?.HeightCm?.ToString("F0") ?? string.Empty),
            Weight: customProfile?.WeightKg ?? (vitals?.WeightKg?.ToString("F0") ?? string.Empty),
            BMI: customProfile?.Bmi ?? (vitals?.Bmi?.ToString("F1") ?? string.Empty),
            ZScore: customProfile?.ZScore ?? string.Empty,
            LeftVision: customProfile?.VisualAcuityLeft ?? string.Empty,
            RightVision: customProfile?.VisualAcuityRight ?? string.Empty,
            Length: customProfile?.LengthCm ?? (vitals?.HeightCm?.ToString("F0") ?? string.Empty),
            HeadCirc: customProfile?.HeadCircCm ?? string.Empty,
            SkinfoldThickness: customProfile?.SkinfoldThicknessMm ?? string.Empty,
            Waist: customProfile?.WaistCm ?? string.Empty,
            Hip: customProfile?.HipCm ?? string.Empty,
            Limbs: string.Empty,
            MidUpperArmCirc: customProfile?.MuacCm ?? string.Empty,
            ReportStatus: "U",
            DeficiencyRemarks: string.Empty);
    }

    private static List<YakapPhysicalExamMiscDto> MapPhysicalExamMiscs(PhilHealthPatientProfileDto? customProfile)
    {
        if (customProfile != null)
        {
            return [new YakapPhysicalExamMiscDto(
                SkinId: customProfile.SkinId,
                HeentId: customProfile.HeentId,
                ChestId: customProfile.ChestId,
                HeartId: customProfile.HeartId,
                AbdomenId: customProfile.AbdomenId,
                NeuroId: customProfile.NeuroId,
                RectalId: customProfile.RectalId,
                GuId: customProfile.GuId)];
        }

        return [new YakapPhysicalExamMiscDto("1", "1", "1", "1", "1", "1", "1", "1")];
    }

    private static YakapPhysicalExamSpecificDto MapPhysicalExamSpecifics(PhilHealthPatientProfileDto? customProfile)
    {
        if (customProfile != null)
        {
            return new YakapPhysicalExamSpecificDto(
                SkinRem: customProfile.SkinRemarks ?? string.Empty,
                HeentRem: customProfile.HeentRemarks ?? string.Empty,
                ChestRem: customProfile.ChestRemarks ?? string.Empty,
                HeartRem: customProfile.HeartRemarks ?? string.Empty,
                AbdomenRem: customProfile.AbdomenRemarks ?? string.Empty,
                NeuroRem: customProfile.NeuroRemarks ?? string.Empty,
                RectalRem: customProfile.RectalRemarks ?? string.Empty,
                GuRem: customProfile.GuRemarks ?? string.Empty);
        }

        return new YakapPhysicalExamSpecificDto(string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, string.Empty);
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

    private static YakapNcdAnswersDto MapNcdFromPatientCustomFields(ClinicPatient patient)
    {
        if (patient.CustomFields == null || patient.CustomFields.Count == 0)
        {
            return new YakapNcdAnswersDto();
        }

        string GetVal(string key)
        {
            if (patient.CustomFields.TryGetValue(key, out var obj) && obj != null)
                return obj.ToString()?.Trim() ?? string.Empty;
            return string.Empty;
        }

        return new YakapNcdAnswersDto(
            Qid1Yn: GetVal("ncd_qid1") != string.Empty ? GetVal("ncd_qid1") : GetVal("qid1_yn"),
            Qid2Yn: GetVal("ncd_qid2") != string.Empty ? GetVal("ncd_qid2") : GetVal("qid2_yn"),
            Qid3Yn: GetVal("ncd_qid3") != string.Empty ? GetVal("ncd_qid3") : GetVal("qid3_yn"),
            Qid4Yn: GetVal("ncd_qid4") != string.Empty ? GetVal("ncd_qid4") : GetVal("qid4_yn"),
            Qid5Ynx: GetVal("ncd_qid5") != string.Empty ? GetVal("ncd_qid5") : GetVal("qid5_ynx"),
            Qid6Yn: GetVal("ncd_qid6") != string.Empty ? GetVal("ncd_qid6") : GetVal("qid6_yn"),
            Qid7Yn: GetVal("ncd_qid7") != string.Empty ? GetVal("ncd_qid7") : GetVal("qid7_yn"),
            Qid8Yn: GetVal("ncd_qid8") != string.Empty ? GetVal("ncd_qid8") : GetVal("qid8_yn"),
            Qid9Yn: GetVal("ncd_qid9") != string.Empty ? GetVal("ncd_qid9") : GetVal("qid9_yn"),
            Qid10Yn: GetVal("ncd_qid10") != string.Empty ? GetVal("ncd_qid10") : GetVal("qid10_yn"),
            Qid11Yn: GetVal("ncd_qid11") != string.Empty ? GetVal("ncd_qid11") : GetVal("qid11_yn"),
            Qid12Yn: GetVal("ncd_qid12") != string.Empty ? GetVal("ncd_qid12") : GetVal("qid12_yn"),
            Qid13Yn: GetVal("ncd_qid13") != string.Empty ? GetVal("ncd_qid13") : GetVal("qid13_yn"),
            Qid14Yn: GetVal("ncd_qid14") != string.Empty ? GetVal("ncd_qid14") : GetVal("qid14_yn"),
            Qid15Yn: GetVal("ncd_qid15") != string.Empty ? GetVal("ncd_qid15") : GetVal("qid15_yn"),
            Qid16Yn: GetVal("ncd_qid16") != string.Empty ? GetVal("ncd_qid16") : GetVal("qid16_yn"),
            Qid17Abcde: GetVal("ncd_qid17") != string.Empty ? GetVal("ncd_qid17") : GetVal("qid17_abcde"),
            Qid18Yn: GetVal("ncd_qid18") != string.Empty ? GetVal("ncd_qid18") : GetVal("qid18_yn"),
            Qid19Yn: GetVal("ncd_qid19") != string.Empty ? GetVal("ncd_qid19") : GetVal("qid19_yn"),
            Qid19Fbsmg: GetVal("ncd_fbs_mgdl") != string.Empty ? GetVal("ncd_fbs_mgdl") : GetVal("qid19_fbsmg"),
            Qid19Fbsmmol: GetVal("ncd_fbs_mmol") != string.Empty ? GetVal("ncd_fbs_mmol") : GetVal("qid19_fbsmmol"),
            Qid19Fbsdate: GetVal("ncd_fbs_date") != string.Empty ? GetVal("ncd_fbs_date") : GetVal("qid19_fbsdate"),
            Qid20Yn: GetVal("ncd_qid20") != string.Empty ? GetVal("ncd_qid20") : GetVal("qid20_yn"),
            Qid20Choleval: GetVal("ncd_chole_val") != string.Empty ? GetVal("ncd_chole_val") : GetVal("qid20_choleval"),
            Qid20Choledate: GetVal("ncd_chole_date") != string.Empty ? GetVal("ncd_chole_date") : GetVal("qid20_choledate"),
            Qid21Yn: GetVal("ncd_qid21") != string.Empty ? GetVal("ncd_qid21") : GetVal("qid21_yn"),
            Qid21Ketonval: GetVal("ncd_keton_val") != string.Empty ? GetVal("ncd_keton_val") : GetVal("qid21_ketonval"),
            Qid21Ketondate: GetVal("ncd_keton_date") != string.Empty ? GetVal("ncd_keton_date") : GetVal("qid21_ketondate"),
            Qid22Yn: GetVal("ncd_qid22") != string.Empty ? GetVal("ncd_qid22") : GetVal("qid22_yn"),
            Qid22Proteinval: GetVal("ncd_protein_val") != string.Empty ? GetVal("ncd_protein_val") : GetVal("qid22_proteinval"),
            Qid22Proteindate: GetVal("ncd_protein_date") != string.Empty ? GetVal("ncd_protein_date") : GetVal("qid22_proteindate"),
            Qid23Yn: GetVal("ncd_qid23") != string.Empty ? GetVal("ncd_qid23") : GetVal("qid23_yn"),
            Qid24Yn: GetVal("ncd_qid24") != string.Empty ? GetVal("ncd_qid24") : GetVal("qid24_yn"));
    }
}
