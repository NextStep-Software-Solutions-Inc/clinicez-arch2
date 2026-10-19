using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Clinic.Application.Tests.E2E.Fixtures;

using static E2EContracts;

/// <summary>
/// Domain test engines and calculation algorithms for E2E testing of the 27 features.
/// These implementations strictly reflect the domain logic in comprehensive-clinic-features-plan.md.
/// </summary>
public static class E2ETestHarness
{
    // =========================================================================
    // 1. Doctor Schedule & Availability Engine (Features 1-6)
    // =========================================================================
    public static class Scheduling
    {
        public static List<TimeSlotDto> CalculateAvailableSlots(
            Guid clinicId,
            Guid doctorId,
            DateOnly date,
            DoctorScheduleTemplateDto? template,
            IReadOnlyList<DoctorLeaveDto> leaves,
            IReadOnlyList<AppointmentRange> existingAppointments)
        {
            var result = new List<TimeSlotDto>();

            // If no active template exists for this day of week, doctor does not work
            if (template == null || !template.IsActive || template.DayOfWeek != date.DayOfWeek)
            {
                return result;
            }

            // Check if full date falls within an approved leave blackout
            var dayStartUtc = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var dayEndUtc = date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

            var isOnLeave = leaves.Any(l => l.IsApproved &&
                                            l.ClinicId == clinicId &&
                                            l.DoctorId == doctorId &&
                                            l.StartUtc < dayEndUtc &&
                                            l.EndUtc > dayStartUtc);

            var slotDurationMinutes = (int)template.SlotDuration;
            var currentTime = template.StartTime;

            while (currentTime.AddMinutes(slotDurationMinutes) <= template.EndTime)
            {
                var slotEnd = currentTime.AddMinutes(slotDurationMinutes);
                var slotStartUtc = date.ToDateTime(currentTime, DateTimeKind.Utc);
                var slotEndUtc = date.ToDateTime(slotEnd, DateTimeKind.Utc);

                // Check conflict: Leave blackout
                if (isOnLeave)
                {
                    result.Add(new TimeSlotDto(slotStartUtc, slotEndUtc, false, "Doctor is on approved leave"));
                    currentTime = slotEnd;
                    continue;
                }

                // Check conflict: Break time window
                var isBreak = template.Breaks.Any(b =>
                    (currentTime >= b.StartTime && currentTime < b.EndTime) ||
                    (slotEnd > b.StartTime && slotEnd <= b.EndTime) ||
                    (currentTime <= b.StartTime && slotEnd >= b.EndTime));

                if (isBreak)
                {
                    result.Add(new TimeSlotDto(slotStartUtc, slotEndUtc, false, "Doctor scheduled break interval"));
                    currentTime = slotEnd;
                    continue;
                }

                // Check conflict: Existing booked appointment overlap
                // GiST exclusion semantics: [slotStartUtc, slotEndUtc) && [a.StartUtc, a.EndUtc)
                var hasBookingOverlap = existingAppointments.Any(a =>
                    a.ClinicId == clinicId &&
                    a.DoctorId == doctorId &&
                    a.Status != "Cancelled" &&
                    slotStartUtc < a.EndUtc &&
                    a.StartUtc < slotEndUtc);

                if (hasBookingOverlap)
                {
                    result.Add(new TimeSlotDto(slotStartUtc, slotEndUtc, false, "Slot is already booked"));
                }
                else
                {
                    result.Add(new TimeSlotDto(slotStartUtc, slotEndUtc, true, null));
                }

                currentTime = slotEnd;
            }

            return result;
        }

        public static void AssertNoBookingCollision(
            Guid clinicId,
            Guid doctorId,
            DateTime newStartUtc,
            DateTime newEndUtc,
            IReadOnlyList<AppointmentRange> existingBookings)
        {
            if (newEndUtc <= newStartUtc)
            {
                throw new ArgumentException("Appointment EndTimeUtc must be strictly greater than ScheduledAt.");
            }

            var collision = existingBookings.FirstOrDefault(a =>
                a.ClinicId == clinicId &&
                a.DoctorId == doctorId &&
                a.Status != "Cancelled" &&
                newStartUtc < a.EndUtc &&
                a.StartUtc < newEndUtc);

            if (collision != null)
            {
                // Simulates PostgreSQL 23P01 GiST exclusion constraint violation mapped to HTTP 409
                throw new ConflictException("The selected doctor already has an appointment during this time window.");
            }
        }
    }

    // =========================================================================
    // 2. WHO Pediatric Growth & Z-Score Engine (Features 12-13)
    // =========================================================================
    public static class Growth
    {
        public static string SanitizeStatutoryDoubleDot(string rawWeight)
        {
            if (string.IsNullOrWhiteSpace(rawWeight)) return "0.0";
            // Corrects statutory seed catalog bug where item 1381 contains "7..9"
            return rawWeight.Replace("..", ".");
        }

        public static decimal SnapToNearestHalfCentimeter(decimal lengthCm)
        {
            // PhilHealth lib_zscore operates on discrete 0.5 cm intervals
            return Math.Round(lengthCm * 2, MidpointRounding.AwayFromZero) / 2m;
        }

        public static WhoZScoreEvaluation? EvaluatePediatricGrowth(
            int ageMonths,
            string gender,
            decimal lengthHeightCm,
            decimal weightKg)
        {
            // Under-5 cohort strict gate: 0 to 60 months
            if (ageMonths < 0 || ageMonths > 60)
            {
                return null;
            }

            var snappedLength = SnapToNearestHalfCentimeter(lengthHeightCm);

            // Reference median benchmarks for WHO 2006 child growth standards
            // Median length for 12 months: ~75.7 cm (boys), ~74.0 cm (girls)
            // Median weight for 12 months: ~9.6 kg (boys), ~8.9 kg (girls)
            var isMale = gender.Equals("Male", StringComparison.OrdinalIgnoreCase);
            var expectedMedianLength = isMale ? 50m + (ageMonths * 2.1m) : 49m + (ageMonths * 2.05m);
            var expectedMedianWeight = isMale ? 3.3m + (ageMonths * 0.52m) : 3.2m + (ageMonths * 0.48m);

            // Calculate z-scores using (observed - median) / SD approximation
            var lengthSd = 3.2m;
            var weightSd = 1.1m;

            var hfaZScore = Math.Round((snappedLength - expectedMedianLength) / lengthSd, 2);
            var wfaZScore = Math.Round((weightKg - expectedMedianWeight) / weightSd, 2);

            // Weight-for-height (wasting/obesity)
            var expectedWeightForLength = snappedLength * 0.13m;
            var wfhZScore = Math.Round((weightKg - expectedWeightForLength) / 1.0m, 2);

            var heightCategory = hfaZScore switch
            {
                < -3.0m => ZScoreCategory.SeverelyStunted,
                < -2.0m => ZScoreCategory.Stunted,
                > 3.0m => ZScoreCategory.Tall,
                _ => ZScoreCategory.Normal
            };

            var weightCategory = wfhZScore switch
            {
                < -3.0m => ZScoreCategory.SeverelyWasted,
                < -2.0m => ZScoreCategory.Wasted,
                > 3.0m => ZScoreCategory.Obese,
                > 2.0m => ZScoreCategory.Overweight,
                > 1.0m => ZScoreCategory.RiskOfOverweight,
                _ => ZScoreCategory.Normal
            };

            return new WhoZScoreEvaluation(
                AgeMonths: ageMonths,
                Gender: gender,
                LengthHeightCm: snappedLength,
                WeightKg: weightKg,
                WeightForAgeZScore: wfaZScore,
                HeightForAgeZScore: hfaZScore,
                WeightForHeightZScore: wfhZScore,
                HeightCategory: heightCategory,
                WeightCategory: weightCategory,
                IsUnderFiveCohort: true);
        }
    }

    // =========================================================================
    // 3. PhilPEN 24-Question CVD Risk Scorer (Feature 25)
    // =========================================================================
    public static class PhilPen
    {
        public static PhilPenRiskResultDto CalculateRisk(PhilPenSurveyAnswersDto answers)
        {
            // Crisis Overrides: Immediate High Risk (Band E)
            if (answers.SystolicBp >= 180 || answers.HasAnginaOrPreviousStroke || answers.RenalDiseasePresent)
            {
                return new PhilPenRiskResultDto(
                    RiskBand: CvdRiskBand.BandE_40PercentOrGreater,
                    CalculatedScorePercent: 42.5m,
                    UsedBmiFallback: false,
                    CrisisOverrideApplied: true,
                    ManagementRecommendation: "Immediate clinical specialist referral, intensive lifestyle intervention, and pharmacotherapy.");
            }

            // Severe Stage 2 Hypertension override (Band D)
            if (answers.SystolicBp >= 160)
            {
                return new PhilPenRiskResultDto(
                    RiskBand: CvdRiskBand.BandD_30ToUnder40Percent,
                    CalculatedScorePercent: 32.0m,
                    UsedBmiFallback: false,
                    CrisisOverrideApplied: true,
                    ManagementRecommendation: "Prompt medical therapy for severe hypertension and multifactorial risk reduction.");
            }

            // Standard WHO/ISH Western Pacific Region B scoring algorithm
            var points = 0;

            // Age points
            if (answers.AgeYears >= 70) points += 8;
            else if (answers.AgeYears >= 60) points += 6;
            else if (answers.AgeYears >= 50) points += 4;
            else if (answers.AgeYears >= 40) points += 2;

            // Sex & Smoking
            var isMale = answers.Gender.Equals("Male", StringComparison.OrdinalIgnoreCase);
            if (isMale) points += 1;
            if (answers.IsSmoker) points += 3;

            // Diabetes
            if (answers.HasDiabetes || (answers.FastingBloodSugarMgDl.HasValue && answers.FastingBloodSugarMgDl.Value >= 126m))
            {
                points += 4;
            }

            // Blood Pressure
            if (answers.SystolicBp >= 140) points += 3;
            else if (answers.SystolicBp >= 130) points += 1;

            // Cholesterol or BMI Fallback
            var usedBmiFallback = false;
            if (answers.TotalCholesterolMgDl.HasValue)
            {
                if (answers.TotalCholesterolMgDl.Value >= 240) points += 4;
                else if (answers.TotalCholesterolMgDl.Value >= 200) points += 2;
            }
            else if (answers.BodyMassIndex.HasValue)
            {
                usedBmiFallback = true;
                if (answers.BodyMassIndex.Value >= 30m) points += 3;
                else if (answers.BodyMassIndex.Value >= 25m) points += 1;
            }

            // Map points to WHO/ISH CVD Risk Bands
            var (riskBand, percent, rec) = points switch
            {
                >= 14 => (CvdRiskBand.BandE_40PercentOrGreater, 41.0m, "Intensive pharmacotherapy, strict glycemic/BP control, and cardiology review."),
                >= 11 => (CvdRiskBand.BandD_30ToUnder40Percent, 34.0m, "Combination pharmacotherapy (antihypertensive + statin) and close 1-month monitoring."),
                >= 8  => (CvdRiskBand.BandC_20ToUnder30Percent, 24.5m, "Active drug therapy indicated; dietary and physical lifestyle modification."),
                >= 5  => (CvdRiskBand.BandB_10ToUnder20Percent, 14.0m, "Lifestyle coaching, lipid monitoring, and follow-up in 3-6 months."),
                _     => (CvdRiskBand.BandA_LessThan10Percent, 6.5m, "Low CVD risk: Routine primary care follow-up every 12 months.")
            };

            return new PhilPenRiskResultDto(
                RiskBand: riskBand,
                CalculatedScorePercent: percent,
                UsedBmiFallback: usedBmiFallback,
                CrisisOverrideApplied: false,
                ManagementRecommendation: rec);
        }
    }

    // =========================================================================
    // 4. Clinical Decision Support (CDS) Rules Engine (Feature 24)
    // =========================================================================
    public static class Cds
    {
        public record CdsRuleAlert(
            string Severity, // "Critical", "Major", "Moderate"
            string RuleType, // "DrugAllergy", "CrossReactivity", "DrugDisease"
            string Title,
            string Description,
            bool IsHardStop);

        public static List<CdsRuleAlert> EvaluateOrderSafety(
            IReadOnlyList<string> orderedGenericDrugs,
            IReadOnlyList<PatientAllergyDto> patientAllergies,
            IReadOnlyList<PatientProblemDto> activeProblems)
        {
            var alerts = new List<CdsRuleAlert>();

            foreach (var drug in orderedGenericDrugs)
            {
                var drugName = drug.Trim();

                // 1. Direct Drug Allergy Check
                foreach (var allergy in patientAllergies)
                {
                    var isDirectMatch = allergy.Allergen.Equals(drugName, StringComparison.OrdinalIgnoreCase);
                    var isPenicillinClassMatch = allergy.Allergen.Contains("Penicillin", StringComparison.OrdinalIgnoreCase) &&
                        (drugName.Equals("Amoxicillin", StringComparison.OrdinalIgnoreCase) ||
                         drugName.Equals("Ampicillin", StringComparison.OrdinalIgnoreCase) ||
                         drugName.Equals("Co-Amoxiclav", StringComparison.OrdinalIgnoreCase) ||
                         drugName.Equals("Penicillin", StringComparison.OrdinalIgnoreCase));

                    if (allergy.Classification == AllergyClassification.Drug && (isDirectMatch || isPenicillinClassMatch))
                    {
                        alerts.Add(new CdsRuleAlert(
                            Severity: "Critical",
                            RuleType: "DrugAllergy",
                            Title: $"Direct Drug Allergy: {drugName}",
                            Description: $"Patient has documented allergy to {allergy.Allergen} with reaction: {allergy.ReactionManifestation}.",
                            IsHardStop: allergy.IsAnaphylacticRisk));
                    }
                }

                // 2. Class Cross-Reactivity Checks
                // Penicillin -> Cephalosporin cross-reactivity
                var hasPenicillinAllergy = patientAllergies.Any(a =>
                    a.Classification == AllergyClassification.Drug &&
                    a.Allergen.Contains("Penicillin", StringComparison.OrdinalIgnoreCase));

                var isCephalosporin = drugName.StartsWith("Cef", StringComparison.OrdinalIgnoreCase) ||
                                     drugName.StartsWith("Ceph", StringComparison.OrdinalIgnoreCase);

                if (hasPenicillinAllergy && isCephalosporin)
                {
                    alerts.Add(new CdsRuleAlert(
                        Severity: "Major",
                        RuleType: "CrossReactivity",
                        Title: $"Penicillin-Cephalosporin Cross-Reactivity: {drugName}",
                        Description: "Patients with severe penicillin hypersensitivity have up to 10% cross-reactivity risk with cephalosporins.",
                        IsHardStop: false));
                }

                // Aspirin -> NSAID cross-sensitivity
                var hasAspirinAllergy = patientAllergies.Any(a =>
                    a.Classification == AllergyClassification.Drug &&
                    a.Allergen.Contains("Aspirin", StringComparison.OrdinalIgnoreCase));

                var isNsaid = drugName.Equals("Ibuprofen", StringComparison.OrdinalIgnoreCase) ||
                             drugName.Equals("Naproxen", StringComparison.OrdinalIgnoreCase) ||
                             drugName.Equals("Mefenamic Acid", StringComparison.OrdinalIgnoreCase) ||
                             drugName.Equals("Ketorolac", StringComparison.OrdinalIgnoreCase) ||
                             drugName.Equals("Diclofenac", StringComparison.OrdinalIgnoreCase);

                if (hasAspirinAllergy && isNsaid)
                {
                    alerts.Add(new CdsRuleAlert(
                        Severity: "Critical",
                        RuleType: "CrossReactivity",
                        Title: $"Aspirin-Exacerbated Respiratory / NSAID Sensitivity: {drugName}",
                        Description: "Aspirin-sensitive patients have cross-reactive bronchospastic and cutaneous reactions to non-selective NSAIDs.",
                        IsHardStop: true));
                }

                // 3. Drug-Disease Interaction (DDI) Checks
                // NSAIDs with Active Peptic Ulcer Disease (K25-K28) or Chronic Kidney Disease (N18)
                if (isNsaid)
                {
                    var hasPud = activeProblems.Any(p =>
                        p.Status == ProblemStatus.Active &&
                        (p.Icd10Code.StartsWith("K25") || p.Icd10Code.StartsWith("K26") || p.Icd10Code.StartsWith("K27")));

                    if (hasPud)
                    {
                        alerts.Add(new CdsRuleAlert(
                            Severity: "Critical",
                            RuleType: "DrugDisease",
                            Title: $"Contraindication: NSAID in Active Peptic Ulcer Disease",
                            Description: $"{drugName} is contraindicated in patients with active peptic ulceration due to severe gastrointestinal bleeding risk.",
                            IsHardStop: true));
                    }

                    var hasCkd = activeProblems.Any(p =>
                        p.Status == ProblemStatus.Active &&
                        p.Icd10Code.StartsWith("N18"));

                    if (hasCkd)
                    {
                        alerts.Add(new CdsRuleAlert(
                            Severity: "Critical",
                            RuleType: "DrugDisease",
                            Title: $"Contraindication: NSAID in Chronic Kidney Disease",
                            Description: $"{drugName} inhibits renal prostaglandin synthesis, exacerbating renal failure in CKD.",
                            IsHardStop: false));
                    }
                }

                // Non-selective Beta-blockers with Asthma (J45) or COPD (J44)
                var isNonSelectiveBetaBlocker = drugName.Equals("Propranolol", StringComparison.OrdinalIgnoreCase) ||
                                               drugName.Equals("Timolol", StringComparison.OrdinalIgnoreCase) ||
                                               drugName.Equals("Nadolol", StringComparison.OrdinalIgnoreCase) ||
                                               drugName.Equals("Carvedilol", StringComparison.OrdinalIgnoreCase);

                if (isNonSelectiveBetaBlocker)
                {
                    var hasAsthmaOrCopd = activeProblems.Any(p =>
                        p.Status == ProblemStatus.Active &&
                        (p.Icd10Code.StartsWith("J45") || p.Icd10Code.StartsWith("J44")));

                    if (hasAsthmaOrCopd)
                    {
                        alerts.Add(new CdsRuleAlert(
                            Severity: "Critical",
                            RuleType: "DrugDisease",
                            Title: $"Contraindication: Beta-Blocker in Bronchospastic Disease",
                            Description: $"{drugName} causes beta-2 receptor blockade, triggering severe bronchospasm in asthma and COPD.",
                            IsHardStop: true));
                    }
                }
            }

            return alerts;
        }
    }

    // =========================================================================
    // 5. PhilHealth DTD v1.14 XML Generator & Validator (Features 20, 26, 27)
    // =========================================================================
    public static class TransmittalXml
    {
        public static string BuildKonsultaXml(
            string transmittalNo,
            string accreditationNo,
            string pmccNo,
            string effectiveYear,
            string caseNo,
            string patientPin,
            string patientLastName,
            string patientFirstName,
            string patientSex,
            string patientDob,
            IReadOnlyList<PatientImmunizationDto> immunizations,
            NineSystemPhysicalExamDto? physicalExam = null,
            ExtendedTriageVitalsDto? vitals = null)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
            sb.AppendLine("<!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\">");
            sb.AppendLine($"<PCB pUsername=\"\" pPassword=\"\" pHciAccreNo=\"{accreditationNo}\" pPMCCNo=\"{pmccNo}\" pEnlistTotalCnt=\"1\" pProfileTotalCnt=\"1\" pSoapTotalCnt=\"1\" pCertificationId=\"KON-TEST\" pHciTransmittalNumber=\"{transmittalNo}\">");

            // ENLISTMENTS
            sb.AppendLine("  <ENLISTMENTS>");
            sb.AppendLine($"    <ENLISTMENT pHciCaseNo=\"{caseNo}\" pHciTransNo=\"E{transmittalNo}\" pEffYear=\"{effectiveYear}\" pEnlistStat=\"1\" pEnlistDate=\"2026-10-01\" pPackageType=\"K\" pMemPin=\"{patientPin}\" pMemFname=\"{patientFirstName}\" pMemMname=\"\" pMemLname=\"{patientLastName}\" pMemExtname=\"\" pMemDob=\"{patientDob}\" pPatientPin=\"{patientPin}\" pPatientFname=\"{patientFirstName}\" pPatientMname=\"\" pPatientLname=\"{patientLastName}\" pPatientExtname=\"\" pPatientSex=\"{patientSex}\" pPatientDob=\"{patientDob}\" pPatientType=\"MM\" pPatientMobileNo=\"09171234567\" pPatientLandlineNo=\"\" pWithConsent=\"Y\" pTransDate=\"2026-10-01\" pCreatedBy=\"ADMIN\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("  </ENLISTMENTS>");

            // PROFILING
            sb.AppendLine("  <PROFILING>");
            sb.AppendLine($"    <PROFILE pHciTransNo=\"P{transmittalNo}\" pHciCaseNo=\"{caseNo}\" pProfDate=\"2026-10-01\" pPatientPin=\"{patientPin}\" pPatientType=\"MM\" pPatientAge=\"35 YR(S), 0 MO(S), 0 DAY(S)\" pMemPin=\"{patientPin}\" pEffYear=\"{effectiveYear}\" pATC=\"ATC123456789\" pIsWalkedIn=\"N\" pTransDate=\"2026-10-01\" pReportStatus=\"U\" pDeficiencyRemarks=\"\">");
            sb.AppendLine("      <MEDHISTS>");
            sb.AppendLine("        <MEDHIST pMdiseaseCode=\"999\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </MEDHISTS>");
            sb.AppendLine("      <MHSPECIFICS>");
            sb.AppendLine("        <MHSPECIFIC pMdiseaseCode=\"999\" pSpecificDesc=\"None\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </MHSPECIFICS>");
            sb.AppendLine("      <SURGHISTS>");
            sb.AppendLine("        <SURGHIST pSurgDesc=\"None\" pSurgDate=\"1900-01-01\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </SURGHISTS>");
            sb.AppendLine("      <FAMHISTS>");
            sb.AppendLine("        <FAMHIST pMdiseaseCode=\"999\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </FAMHISTS>");
            sb.AppendLine("      <FHSPECIFICS>");
            sb.AppendLine("        <FHSPECIFIC pMdiseaseCode=\"999\" pSpecificDesc=\"None\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </FHSPECIFICS>");
            sb.AppendLine("      <SOCHIST pIsSmoker=\"N\" pNoCigpk=\"\" pIsAdrinker=\"N\" pNoBottles=\"\" pIllDrugUser=\"N\" pIsSexuallyActive=\"N\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");

            // IMMUNIZATIONS: DTD v1.14 demands <!ELEMENT IMMUNIZATIONS (IMMUNIZATION)+>
            sb.AppendLine("      <IMMUNIZATIONS>");
            if (immunizations.Count == 0)
            {
                // Statutory fallback 999
                sb.AppendLine("        <IMMUNIZATION pChildImmcode=\"\" pYoungwImmcode=\"\" pPregwImmcode=\"\" pElderlyImmcode=\"999\" pOtherImm=\"\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            }
            else
            {
                foreach (var imm in immunizations)
                {
                    var childCode = imm.StatutoryLibrary == "lib_immchild" ? imm.VaccineCode : "";
                    var youngCode = imm.StatutoryLibrary == "lib_immyoungw" ? imm.VaccineCode : "";
                    var pregCode = imm.StatutoryLibrary == "lib_immpregw" ? imm.VaccineCode : "";
                    var elderlyCode = imm.StatutoryLibrary == "lib_immelderly" ? imm.VaccineCode : "";
                    var otherCode = imm.StatutoryLibrary == "OtherImm" ? imm.VaccineCode : "";

                    sb.AppendLine($"        <IMMUNIZATION pChildImmcode=\"{childCode}\" pYoungwImmcode=\"{youngCode}\" pPregwImmcode=\"{pregCode}\" pElderlyImmcode=\"{elderlyCode}\" pOtherImm=\"{otherCode}\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
                }
            }
            sb.AppendLine("      </IMMUNIZATIONS>");

            sb.AppendLine("      <MENSHIST pMenarchePeriod=\"0\" pLastMensPeriod=\"\" pPeriodDuration=\"0\" pMensInterval=\"0\" pPadsPerDay=\"0\" pOnsetSexIc=\"0\" pBirthCtrlMethod=\"\" pIsMenopause=\"\" pMenopauseAge=\"\" pIsApplicable=\"N\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      <PREGHIST pPregCnt=\"0\" pDeliveryCnt=\"0\" pDeliveryTyp=\"X\" pFullTermCnt=\"0\" pPrematureCnt=\"0\" pAbortionCnt=\"0\" pLivChildrenCnt=\"0\" pWPregIndhyp=\"N\" pWFamPlan=\"N\" pIsApplicable=\"N\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");

            // PEPERT
            var sBp = vitals?.SystolicBp?.ToString() ?? "120";
            var dBp = vitals?.DiastolicBp?.ToString() ?? "80";
            var hr = vitals?.HeartRateBpm?.ToString() ?? "75";
            var rr = vitals?.RespiratoryRateBreathsPerMin?.ToString() ?? "18";
            var temp = vitals?.TemperatureCelsius?.ToString("0.0") ?? "36.5";
            var ht = vitals?.HeightCm?.ToString("0.0") ?? "165.0";
            var wt = vitals?.WeightKg?.ToString("0.0") ?? "60.0";
            var bmi = vitals?.Bmi?.ToString("0.0") ?? "22.0";
            var lVis = vitals?.VisualAcuityLeft ?? "20/20";
            var rVis = vitals?.VisualAcuityRight ?? "20/20";

            sb.AppendLine($"      <PEPERT pSystolic=\"{sBp}\" pDiastolic=\"{dBp}\" pHr=\"{hr}\" pRr=\"{rr}\" pTemp=\"{temp}\" pHeight=\"{ht}\" pWeight=\"{wt}\" pBMI=\"{bmi}\" pZScore=\"\" pLeftVision=\"{lVis}\" pRightVision=\"{rVis}\" pLength=\"\" pHeadCirc=\"\" pSkinfoldThickness=\"\" pWaist=\"\" pHip=\"\" pLimbs=\"\" pMidUpperArmCirc=\"\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      <BLOODTYPE pBloodType=\"O+\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      <PEGENSURVEY pGenSurveyId=\"1\" pGenSurveyRem=\"Conscious, coherent\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");

            // PEMISCS & PESPECIFIC
            var skinRem = physicalExam?.SkinRemarks ?? "";
            var heentRem = physicalExam?.HeentRemarks ?? "";
            var chestRem = physicalExam?.ChestLungsRemarks ?? "";
            var heartRem = physicalExam?.HeartCvsRemarks ?? "";
            var abdRem = physicalExam?.AbdomenRemarks ?? "";
            var neuroRem = physicalExam?.NeuroRemarks ?? "";
            var rectalRem = physicalExam?.RectalRemarks ?? "";
            var guRem = physicalExam?.GenitourinaryRemarks ?? "";

            sb.AppendLine("      <PEMISCS>");
            sb.AppendLine("        <PEMISC pSkinId=\"1\" pHeentId=\"1\" pChestId=\"1\" pHeartId=\"1\" pAbdomenId=\"1\" pNeuroId=\"1\" pGuId=\"1\" pRectalId=\"1\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </PEMISCS>");
            sb.AppendLine($"      <PESPECIFIC pSkinRem=\"{skinRem}\" pHeentRem=\"{heentRem}\" pChestRem=\"{chestRem}\" pHeartRem=\"{heartRem}\" pAbdomenRem=\"{abdRem}\" pNeuroRem=\"{neuroRem}\" pRectalRem=\"{rectalRem}\" pGuRem=\"{guRem}\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      <NCDQANS pQid1_Yn=\"N\" pQid2_Yn=\"N\" pQid3_Yn=\"N\" pQid4_Yn=\"N\" pQid5_Ynx=\"N\" pQid6_Yn=\"N\" pQid7_Yn=\"N\" pQid8_Yn=\"N\" pQid9_Yn=\"N\" pQid10_Yn=\"N\" pQid11_Yn=\"N\" pQid12_Yn=\"N\" pQid13_Yn=\"N\" pQid14_Yn=\"\" pQid15_Yn=\"N\" pQid16_Yn=\"N\" pQid17_Abcde=\"\" pQid18_Yn=\"N\" pQid19_Yn=\"N\" pQid19_Fbsmg=\"\" pQid19_Fbsmmol=\"\" pQid19_Fbsdate=\"\" pQid20_Yn=\"N\" pQid20_Choleval=\"\" pQid20_Choledate=\"\" pQid21_Yn=\"N\" pQid21_Ketonval=\"\" pQid21_Ketondate=\"\" pQid22_Yn=\"N\" pQid22_Proteinval=\"\" pQid22_Proteindate=\"\" pQid23_Yn=\"N\" pQid24_Yn=\"N\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("    </PROFILE>");
            sb.AppendLine("  </PROFILING>");

            // SOAPS
            sb.AppendLine("  <SOAPS>");
            sb.AppendLine($"    <SOAP pHciCaseNo=\"{caseNo}\" pHciTransNo=\"S{transmittalNo}\" pSoapDate=\"2026-10-01\" pPatientPin=\"{patientPin}\" pPatientType=\"MM\" pMemPin=\"{patientPin}\" pEffYear=\"{effectiveYear}\" pATC=\"ATC123456789\" pIsWalkedIn=\"N\" pCoPay=\"0.00\" pTransDate=\"2026-10-01\" pReportStatus=\"U\" pDeficiencyRemarks=\"\">");
            sb.AppendLine("      <SUBJECTIVE pIllnessHistory=\"Routine consultation\" pSignsSymptoms=\"\" pOtherComplaint=\"\" pPainSite=\"\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine($"      <PEPERT pSystolic=\"{sBp}\" pDiastolic=\"{dBp}\" pHr=\"{hr}\" pRr=\"{rr}\" pTemp=\"{temp}\" pHeight=\"{ht}\" pWeight=\"{wt}\" pBMI=\"{bmi}\" pZScore=\"\" pLeftVision=\"{lVis}\" pRightVision=\"{rVis}\" pLength=\"\" pHeadCirc=\"\" pSkinfoldThickness=\"\" pWaist=\"\" pHip=\"\" pLimbs=\"\" pMidUpperArmCirc=\"\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      <PEMISCS>");
            sb.AppendLine("        <PEMISC pSkinId=\"1\" pHeentId=\"1\" pChestId=\"1\" pHeartId=\"1\" pAbdomenId=\"1\" pNeuroId=\"1\" pGuId=\"1\" pRectalId=\"1\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </PEMISCS>");
            sb.AppendLine($"      <PESPECIFIC pSkinRem=\"{skinRem}\" pHeentRem=\"{heentRem}\" pChestRem=\"{chestRem}\" pHeartRem=\"{heartRem}\" pAbdomenRem=\"{abdRem}\" pNeuroRem=\"{neuroRem}\" pRectalRem=\"{rectalRem}\" pGuRem=\"{guRem}\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      <ICDS>");
            sb.AppendLine("        <ICD pIcdCode=\"Z00.0\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </ICDS>");
            sb.AppendLine("      <DIAGNOSTICS>");
            sb.AppendLine("        <DIAGNOSTIC pDiagnosticId=\"999\" pOthRemarks=\"None\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </DIAGNOSTICS>");
            sb.AppendLine("      <MANAGEMENTS>");
            sb.AppendLine("        <MANAGEMENT pManagementId=\"999\" pOthRemarks=\"None\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("      </MANAGEMENTS>");
            sb.AppendLine("      <ADVICE pRemarks=\"Follow up as needed\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("    </SOAP>");
            sb.AppendLine("  </SOAPS>");

            // MEDICINES
            sb.AppendLine("  <MEDICINES>");
            sb.AppendLine($"    <MEDICINE pHciCaseNo=\"{caseNo}\" pHciTransNo=\"M{transmittalNo}\" pSoapTransNo=\"S{transmittalNo}\" pDrugCode=\"NOMED0000000000000000000000000\" pGenericCode=\"NONE\" pSaltCode=\"NONE\" pStrengthCode=\"NONE\" pFormCode=\"NONE\" pUnitCode=\"NONE\" pPackageTypeCode=\"NONE\" pQuantity=\"0\" pActualUnitPrice=\"0.00\" pTotalAmount=\"0.00\" pInstructionQuantity=\"0\" pInstructionStrength=\"NONE\" pInstructionFrequency=\"NONE\" pInstructionTreatmentDays=\"0\" pPrescribedDate=\"2026-10-01\" pDispensedDate=\"2026-10-01\" pDispensedDrugCode=\"NOMED0000000000000000000000000\" pIsPndf=\"Y\" pCoPay=\"0.00\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
            sb.AppendLine("  </MEDICINES>");
            sb.AppendLine("</PCB>");

            return sb.ToString();
        }

        public static bool ValidateAgainstDtd(string xmlContent, out List<string> errors)
        {
            errors = new List<string>();

            // Find DTD in repository
            var dtdPath = Path.Combine(AppContext.BaseDirectory, "KonsultaData_v1.14.dtd");
            if (!File.Exists(dtdPath))
            {
                // Traverse up to find root
                var dir = new DirectoryInfo(AppContext.BaseDirectory);
                while (dir != null && !File.Exists(Path.Combine(dir.FullName, "KonsultaData_v1.14.dtd")))
                {
                    dir = dir.Parent;
                }
                if (dir != null)
                {
                    dtdPath = Path.Combine(dir.FullName, "KonsultaData_v1.14.dtd");
                }
            }

            var resolver = new LocalDtdResolver(dtdPath);

            var settings = new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Parse,
                ValidationType = ValidationType.DTD,
                XmlResolver = resolver
            };

            var capturedErrors = new List<string>();
            settings.ValidationEventHandler += (_, args) =>
            {
                capturedErrors.Add($"Line {args.Exception?.LineNumber}: {args.Message}");
            };

            try
            {
                using var stringReader = new StringReader(xmlContent);
                using var reader = XmlReader.Create(stringReader, settings);
                while (reader.Read()) { }
            }
            catch (Exception ex)
            {
                capturedErrors.Add($"Parsing exception: {ex.Message}");
            }

            errors = capturedErrors;
            return capturedErrors.Count == 0;
        }

        private sealed class LocalDtdResolver : XmlResolver
        {
            private readonly string _dtdFilePath;

            public LocalDtdResolver(string dtdFilePath)
            {
                _dtdFilePath = dtdFilePath;
            }

            public override object? GetEntity(Uri absoluteUri, string? role, Type? ofObjectToReturn)
            {
                if (File.Exists(_dtdFilePath))
                {
                    return File.OpenRead(_dtdFilePath);
                }
                return null;
            }
        }
    }
}
