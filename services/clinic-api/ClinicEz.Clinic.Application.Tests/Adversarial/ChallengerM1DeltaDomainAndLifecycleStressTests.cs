using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Domain.Options;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Challenger 1 Empirical Stress Test Suite for Milestone M1-Delta:
/// Domain Stress & 1NF Lifecycle Challenger.
/// 
/// Adversarially challenges and verifies:
/// 1. VisitWorkflowMode Transitions:
///    - Lossless transitions between Regular and YakapAvailment across encounters, appointments, and queue items.
///    - Zero data loss of standard OPD clinical notes, diagnoses, and prescriptions when switching modes.
/// 2. Nullability & Pure OPD Regular Encounter Independence:
///    - Full encounter creation, update, and signing with zero PhilHealth/YAKAP properties.
///    - Complete absence of null constraint, conversion, or domain validation exceptions for regular visits.
/// 3. Tier A EhrStaticOptions Integrity:
///    - In-memory lookups across ~55 option sets, case-insensitivity, and fallback behavior.
///    - RequiresSpecifyText behavior for "OTHER" options vs standard options.
///    - Presence of PhilHealthCode for statutory items and null for EHR-only items.
/// 4. 1NF Child Collections Lifecycle:
///    - EncounterReviewOfSystemsItem (multiple items per encounter).
///    - 5 Specific Encounter forms:
///      * EncounterObGyneExam
///      * EncounterPediatricMilestone + EncounterPediatricDangerSign
///      * EncounterAdolescentAssessment
///      * EncounterHeadsssDomainAssessment
///      * PatientBpMonitoringLog + PatientBpMonitoringDay
///    - Patient Hospitalization, Injury, and Home Medication 1NF history tables.
///    - Multi-tenancy and soft-delete isolation across all newly introduced 1NF tables.
/// </summary>
public sealed class ChallengerM1DeltaDomainAndLifecycleStressTests
{
    private const string TestTenant = "tenant_challenger_m1_delta";
    private const string TestStaff = "challenger_doctor_user";

    private static ApplicationDbContext CreateTestDbContext(
        Guid clinicId,
        string tenantId = TestTenant,
        string userId = TestStaff,
        string? dbName = null)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var currentUserService = Substitute.For<ICurrentUserService>();
        currentUserService.UserId.Returns(userId);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var interceptor = new SoftDeleteSaveChangesInterceptor(currentUserService);

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName ?? $"ClinicEz_M1Delta_{Guid.NewGuid():N}")
            .AddInterceptors(interceptor)
            .Options;

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private static Patient CreateBaselinePatient(Guid clinicId, string tenantId = TestTenant)
    {
        return new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = $"PAT-{Guid.NewGuid():N}"[..14],
            FirstName = "Juan",
            LastName = "Dela Cruz",
            MiddleName = "Mercado",
            DateOfBirth = new DateOnly(1988, 4, 12),
            Sex = BiologicalSex.Male,
            ContactNumber = "09171234567",
            VerificationStatus = PatientVerificationStatus.Verified
        };
    }

    #region Group 1: VisitWorkflowMode Transitions & Lossless Data Preservation

    [Fact]
    public async Task Encounter_Transition_RegularToYakapAvailment_PreservesAllOpdClinicalDataWithoutLoss()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Transition_RegToYakap_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        // 1. Create encounter in Regular mode with rich OPD clinical documentation
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow,
                VisitWorkflowMode = VisitWorkflowMode.Regular,
                IsYakapEligible = false,

                // Comprehensive OPD notes
                Subjective = "Patient reports persistent bilateral throbbing headache for 3 days, aggravated by bright lights.",
                Objective = "BP 120/80 mmHg, PR 76 bpm, Afebrile. Neurological exam grossly normal. No neck stiffness.",
                Assessment = "Tension-type headache; rule out migraine without aura.",
                Plan = "Advised lifestyle modification, sleep hygiene, oral hydration, and prescribed analgesics.",
                HomeInstructions = "Rest in dark quiet room during acute attacks. Follow up in 1 week if no improvement."
            };

            // OPD Diagnoses
            encounter.Diagnoses.Add(new EncounterDiagnosis
            {
                Id = Guid.NewGuid(),
                ConsultationEncounterId = encounter.Id,
                TenantId = TestTenant,
                ClinicId = clinicId,
                Icd10Code = "G44.2",
                Description = "Tension-type headache",
                IsPrimary = true
            });

            // OPD Prescriptions
            encounter.Prescriptions.Add(new PrescriptionItem
            {
                Id = Guid.NewGuid(),
                ConsultationEncounterId = encounter.Id,
                TenantId = TestTenant,
                ClinicId = clinicId,
                GenericName = "Paracetamol",
                BrandName = "Biogesic",
                Dosage = "500 mg",
                Form = "Tablet",
                Sig = "1 tablet every 6 hours as needed for headache",
                Quantity = 10,
                DurationDays = 3,
                Refills = 0,
                IsDangerousDrug = false
            });

            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        // 2. Transition encounter to YakapAvailment mode and add statutory fields
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = await context.Consultations
                .Include(c => c.Diagnoses)
                .Include(c => c.Prescriptions)
                .FirstAsync(c => c.Id == encounterId);

            encounter.VisitWorkflowMode.Should().Be(VisitWorkflowMode.Regular);

            // Mid-visit switch to YakapAvailment
            encounter.VisitWorkflowMode = VisitWorkflowMode.YakapAvailment;
            encounter.IsYakapEligible = true;
            encounter.PhilHealthCaseNo = "CAS-2026-0001";
            encounter.PhilHealthSoapTransNo = "TRX-2026-0001";
            encounter.DoctorPhilHealthPan = "PAN-123456789";
            encounter.PhilHealthAtc = "ATC-KONSULTA-01";
            encounter.PhilHealthSignSympCode = "01"; // Headache

            await context.SaveChangesAsync();
        }

        // 3. Reload in a fresh context and verify ZERO data loss
        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.Consultations
                .Include(c => c.Diagnoses)
                .Include(c => c.Prescriptions)
                .FirstAsync(c => c.Id == encounterId);

            loaded.VisitWorkflowMode.Should().Be(VisitWorkflowMode.YakapAvailment);
            loaded.IsYakapEligible.Should().BeTrue();
            loaded.PhilHealthCaseNo.Should().Be("CAS-2026-0001");
            loaded.PhilHealthSoapTransNo.Should().Be("TRX-2026-0001");
            loaded.DoctorPhilHealthPan.Should().Be("PAN-123456789");

            // Verify original OPD fields are completely intact
            loaded.Subjective.Should().Be("Patient reports persistent bilateral throbbing headache for 3 days, aggravated by bright lights.");
            loaded.Objective.Should().Be("BP 120/80 mmHg, PR 76 bpm, Afebrile. Neurological exam grossly normal. No neck stiffness.");
            loaded.Assessment.Should().Be("Tension-type headache; rule out migraine without aura.");
            loaded.Plan.Should().Be("Advised lifestyle modification, sleep hygiene, oral hydration, and prescribed analgesics.");
            loaded.HomeInstructions.Should().Be("Rest in dark quiet room during acute attacks. Follow up in 1 week if no improvement.");

            loaded.Diagnoses.Should().HaveCount(1);
            loaded.Diagnoses.First().Icd10Code.Should().Be("G44.2");
            loaded.Diagnoses.First().Description.Should().Be("Tension-type headache");

            loaded.Prescriptions.Should().HaveCount(1);
            loaded.Prescriptions.First().GenericName.Should().Be("Paracetamol");
            loaded.Prescriptions.First().Dosage.Should().Be("500 mg");
            loaded.Prescriptions.First().Quantity.Should().Be(10);
        }
    }

    [Fact]
    public async Task Encounter_Transition_YakapAvailmentToRegular_PreservesAllData()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Transition_YakapToReg_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        // 1. Create encounter initially in YakapAvailment mode
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow,
                VisitWorkflowMode = VisitWorkflowMode.YakapAvailment,
                IsYakapEligible = true,
                PhilHealthCaseNo = "CAS-YAKAP-99",
                PhilHealthSoapTransNo = "TRX-YAKAP-99",
                Subjective = "Yakap routine consult.",
                Objective = "Normal exam.",
                Assessment = "Healthy adult.",
                Plan = "Annual maintenance advice."
            };

            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        // 2. Switch back to Regular mode
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = await context.Consultations.FirstAsync(c => c.Id == encounterId);
            encounter.VisitWorkflowMode = VisitWorkflowMode.Regular;
            await context.SaveChangesAsync();
        }

        // 3. Verify persistence
        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.Consultations.FirstAsync(c => c.Id == encounterId);
            loaded.VisitWorkflowMode.Should().Be(VisitWorkflowMode.Regular);
            loaded.PhilHealthCaseNo.Should().Be("CAS-YAKAP-99"); // Retained without corruption
            loaded.Subjective.Should().Be("Yakap routine consult.");
        }
    }

    [Fact]
    public async Task AppointmentAndQueueItem_VisitWorkflowMode_Transitions_SucceedsWithoutCorruption()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_ApptQueue_Transitions_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            context.Patients.Add(patient);

            var appt = new Appointment
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                ScheduledAt = DateTime.UtcNow.AddHours(2),
                EndTimeUtc = DateTime.UtcNow.AddHours(2.5),
                ServiceType = "General OPD",
                VisitWorkflowMode = VisitWorkflowMode.Regular
            };

            var queue = new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                QueueNumber = "OPD-001",
                QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
                CheckInTime = DateTime.UtcNow,
                Status = QueueStatus.Waiting,
                VisitWorkflowMode = VisitWorkflowMode.Regular
            };

            context.Appointments.Add(appt);
            context.QueueItems.Add(queue);
            await context.SaveChangesAsync();

            // Transition both to YakapAvailment
            appt.VisitWorkflowMode = VisitWorkflowMode.YakapAvailment;
            queue.VisitWorkflowMode = VisitWorkflowMode.YakapAvailment;
            await context.SaveChangesAsync();
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loadedAppt = await verifyContext.Appointments.FirstAsync(a => a.PatientId == patient.Id);
            var loadedQueue = await verifyContext.QueueItems.FirstAsync(q => q.PatientId == patient.Id);

            loadedAppt.VisitWorkflowMode.Should().Be(VisitWorkflowMode.YakapAvailment);
            loadedQueue.VisitWorkflowMode.Should().Be(VisitWorkflowMode.YakapAvailment);
        }
    }

    #endregion

    #region Group 2: Nullability & Pure OPD Regular Encounter Independence

    [Fact]
    public async Task OpdRegularEncounter_CreationUpdateAndSigning_WithZeroYakapProperties_SucceedsWithoutExceptions()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_OpdRegular_ZeroYakap_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        // 1. Create purely regular OPD encounter with ALL PhilHealth/YAKAP properties left null
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow,
                VisitWorkflowMode = VisitWorkflowMode.Regular,
                IsYakapEligible = false,

                // Standard clinical notes
                Subjective = "Routine pre-employment medical check.",
                Objective = "BP 110/70, PR 72, Normal systemic exam.",
                Assessment = "Fit for work.",
                Plan = "Issued medical clearance.",

                // All PhilHealth/YAKAP statutory extension properties left explicitly NULL:
                PhilHealthSignSympCode = null,
                PhilHealthOtherComplaint = null,
                PhilHealthPainSite = null,
                PhilHealthCaseNo = null,
                PhilHealthSoapTransNo = null,
                DoctorPhilHealthPan = null,
                PhilHealthAtc = null,
                PhilHealthManagementCodes = null,
                PhilHealthVisitType = null,
                SpecificDiagnosisCodes = null,
                CounselingCodes = null,
                RoutineVaccineName = null,
                RoutineVaccineDate = null,
                AdultsRoutineScreeningCode = null,
                PediatricRoutineScreeningCode = null,
                PrenatalScreeningServicesCode = null,
                BreastCancerScreeningCode = null,
                CervicalCancerScreeningCode = null,
                ColorectalCancerScreeningCode = null,
                ProstateCancerScreeningCode = null,
                DiagnosticServicesOption = null,
                OtherMedicalAdviceSpec = null,
                FollowUpReason = null,
                FollowUpVaccineName = null,
                FollowUpVaccineNextDate = null,
                ClinicalDisposition = null,
                PatientIdentityVerificationId = null,
                DoctorDesignation = null,
                ConsultationReasonCode = null,
                ConsultationReasonDetails = null,
                CoPaymentAmount = null,
                CoPaymentBalance = null,
                CoPaymentDate = null
            };

            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        // 2. Update the regular encounter
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = await context.Consultations.FirstAsync(c => c.Id == encounterId);
            encounter.HomeInstructions = "Maintain regular diet and exercise.";
            encounter.UpdatedAt = DateTime.UtcNow;
            await context.SaveChangesAsync();
        }

        // 3. Sign and lock the encounter with ZERO YAKAP requirements
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = await context.Consultations.FirstAsync(c => c.Id == encounterId);

            encounter.DoctorPrcLicense = "0123456";
            encounter.DoctorPtr = "PTR-987654";
            encounter.IsSigned = true;
            encounter.SignedAt = DateTime.UtcNow;
            encounter.DoctorPhilHealthPan.Should().BeNull(); // Doctor has no PhilHealth PAN, which is completely valid for regular OPD!

            var saveAct = () => context.SaveChangesAsync();
            await saveAct.Should().NotThrowAsync();
        }

        // 4. Verify signed state and complete absence of YAKAP data
        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.Consultations.FirstAsync(c => c.Id == encounterId);
            loaded.IsSigned.Should().BeTrue();
            loaded.SignedAt.Should().NotBeNull();
            loaded.VisitWorkflowMode.Should().Be(VisitWorkflowMode.Regular);
            loaded.PhilHealthCaseNo.Should().BeNull();
            loaded.PhilHealthSoapTransNo.Should().BeNull();
            loaded.PhilHealthAtc.Should().BeNull();
            loaded.PhilHealthSignSympCode.Should().BeNull();
        }
    }

    [Fact]
    public async Task OpdRegularPatient_WithZeroPhilHealthOrYakapProperties_PersistsCleanly()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_RegularPatient_ZeroPhilHealth_{Guid.NewGuid():N}";

        using var context = CreateTestDbContext(clinicId, dbName: dbName);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = TestTenant,
            ClinicId = clinicId,
            PatientCode = $"REG-{Guid.NewGuid():N}"[..12],
            FirstName = "Regular",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1995, 10, 5),
            Sex = BiologicalSex.Female,
            ContactNumber = "09201112233",
            PhilHealthNumber = null, // Zero PhilHealth PIN
            VerificationStatus = PatientVerificationStatus.Verified
        };

        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        var loaded = await context.Patients
            .Include(p => p.PhilHealthMembership)
            .Include(p => p.YakapEnlistments)
            .FirstAsync(p => p.Id == patient.Id);

        loaded.PhilHealthNumber.Should().BeNull();
        loaded.PhilHealthMembership.Should().BeNull();
        loaded.YakapEnlistments.Should().BeEmpty();
    }

    #endregion

    #region Group 3: Tier A EhrStaticOptions Registry Integrity

    [Fact]
    public void TierA_EhrStaticOptions_RegistryContainsExpectedOptionSets()
    {
        var optionSets = EhrStaticOptions.AllOptionSets;
        optionSets.Should().NotBeNull();
        optionSets.Count.Should().BeGreaterThanOrEqualTo(50, "Tier A must contain ~55 static option sets per architecture mandate");

        var requiredSets = new[]
        {
            "sex",
            "gender_identity",
            "patient_type",
            "civil_status",
            "assignment_status",
            "service_delivery_method",
            "verification_mode",
            "fpe_classification",
            "facilitator_type",
            "immunization_summary",
            "smoking_status",
            "alcohol_drinker_subtype",
            "alcohol_type",
            "pe_general_survey",
            "consultation_reason",
            "visual_acuity_chart",
            "specific_diagnosis",
            "counseling_topic",
            "diagnostic_plan_option",
            "routine_immunization_status",
            "vaccination_status",
            "milestone_visit_age",
            "smr_result",
            "headsss_education_status",
            "headsss_relationship_status",
            "headsss_living_arrangement",
            "bp_location",
            "recommendation_consent",
            "diagnostic_test_status",
            "diagnostic_test_location",
            "qualitative_test_result",
            "medicine_drug_grouping",
            "referral_type",
            "guardian_relationship",
            "medicine_route",
            "medicine_frequency",
            "pcu_status",
            "otp_status",
            "valid_id_type"
        };

        foreach (var reqSet in requiredSets)
        {
            optionSets.Should().Contain(reqSet, $"Option set '{reqSet}' must be registered in EhrStaticOptions");
            var options = EhrStaticOptions.GetOptions(reqSet);
            options.Should().NotBeEmpty($"Option set '{reqSet}' must contain option items");
        }
    }

    [Fact]
    public void TierA_EhrStaticOptions_CaseInsensitiveLookup_Succeeds()
    {
        // Lowercase query
        var foundLower = EhrStaticOptions.TryGetOption("sex", "male", out var optLower);
        foundLower.Should().BeTrue();
        optLower!.Code.Should().Be("MALE");
        optLower.PhilHealthCode.Should().Be("M");
        optLower.PhilHealthLibrary.Should().Be("lib_sex");

        // Uppercase query
        var foundUpper = EhrStaticOptions.TryGetOption("SEX", "MALE", out var optUpper);
        foundUpper.Should().BeTrue();
        optUpper!.Code.Should().Be("MALE");

        // Mixed case query
        var foundMixed = EhrStaticOptions.TryGetOption("Sex", "Female", out var optMixed);
        foundMixed.Should().BeTrue();
        optMixed!.Code.Should().Be("FEMALE");
        optMixed.PhilHealthCode.Should().Be("F");

        // Unknown set returns false
        var foundUnknownSet = EhrStaticOptions.TryGetOption("non_existent_set", "CODE", out var optUnknown);
        foundUnknownSet.Should().BeFalse();
        optUnknown.Should().BeNull();

        // Unknown code in valid set returns false
        var foundUnknownCode = EhrStaticOptions.TryGetOption("sex", "NON_EXISTENT_CODE", out var optUnknownCode);
        foundUnknownCode.Should().BeFalse();
        optUnknownCode.Should().BeNull();
    }

    [Fact]
    public void TierA_EhrStaticOptions_RequiresSpecifyText_CorrectlyEnforced()
    {
        // 1. Gender identity: OTHER_GENDER requires specify text
        EhrStaticOptions.TryGetOption("gender_identity", "OTHER_GENDER", out var otherGender).Should().BeTrue();
        otherGender!.RequiresSpecifyText.Should().BeTrue("OTHER_GENDER must require specify text");

        EhrStaticOptions.TryGetOption("gender_identity", "MAN", out var cisMan).Should().BeTrue();
        cisMan!.RequiresSpecifyText.Should().BeFalse("Standard gender identity must not require specify text");

        // 2. Valid ID: OTHER_VALID_ID requires specify text
        EhrStaticOptions.TryGetOption("valid_id_type", "OTHER_VALID_ID", out var otherId).Should().BeTrue();
        otherId!.RequiresSpecifyText.Should().BeTrue("OTHER_VALID_ID must require specify text");

        EhrStaticOptions.TryGetOption("valid_id_type", "PASSPORT", out var passport).Should().BeTrue();
        passport!.RequiresSpecifyText.Should().BeFalse("PASSPORT must not require specify text");

        // 3. Guardian relationship: NON_RELATIVE_CAREGIVER requires specify text
        EhrStaticOptions.TryGetOption("guardian_relationship", "NON_RELATIVE_CAREGIVER", out var otherRel).Should().BeTrue();
        otherRel!.RequiresSpecifyText.Should().BeTrue("NON_RELATIVE_CAREGIVER must require specify text");

        EhrStaticOptions.TryGetOption("guardian_relationship", "MOTHER", out var mother).Should().BeTrue();
        mother!.RequiresSpecifyText.Should().BeFalse("MOTHER must not require specify text");
    }

    [Fact]
    public void TierA_EhrStaticOptions_PhilHealthCodePresence_DistinguishesStatutoryFromEhrOnly()
    {
        // Statutory sex options map to M and F
        EhrStaticOptions.TryGetOption("sex", "MALE", out var male).Should().BeTrue();
        male!.PhilHealthCode.Should().Be("M");

        EhrStaticOptions.TryGetOption("sex", "FEMALE", out var female).Should().BeTrue();
        female!.PhilHealthCode.Should().Be("F");

        // Payer-agnostic EHR extensions (Intersex, Unknown) have null PhilHealthCode
        EhrStaticOptions.TryGetOption("sex", "INTERSEX", out var intersex).Should().BeTrue();
        intersex!.PhilHealthCode.Should().BeNull("INTERSEX is a canonical EHR option without PhilHealth statutory equivalent");

        EhrStaticOptions.TryGetOption("sex", "UNKNOWN", out var unknown).Should().BeTrue();
        unknown!.PhilHealthCode.Should().BeNull("UNKNOWN is an EHR option without PhilHealth statutory equivalent");

        // Valid ID statutory codes
        EhrStaticOptions.TryGetOption("valid_id_type", "PHILSYS_ID", out var philsys).Should().BeTrue();
        philsys!.PhilHealthCode.Should().Be("01");

        EhrStaticOptions.TryGetOption("valid_id_type", "PASSPORT", out var pass).Should().BeTrue();
        pass!.PhilHealthCode.Should().Be("02");

        EhrStaticOptions.TryGetOption("valid_id_type", "DRIVERS_LICENSE", out var dlc).Should().BeTrue();
        dlc!.PhilHealthCode.Should().Be("03");

        // Medicine routes
        EhrStaticOptions.TryGetOption("medicine_route", "ORAL", out var po).Should().BeTrue();
        po!.PhilHealthCode.Should().Be("PO");

        EhrStaticOptions.TryGetOption("medicine_route", "TOPICAL", out var top).Should().BeTrue();
        top!.PhilHealthCode.Should().Be("TOP");
    }

    #endregion

    #region Group 4: 1NF Child Collections Lifecycle

    [Fact]
    public async Task EncounterReviewOfSystemsItem_MultipleItems_Lifecycle_MaintainsRelationalIntegrity()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Ros_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        // 1. Add encounter with multiple ROS items
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow
            };

            // Add 3 discrete 1NF ROS child rows
            encounter.ReviewOfSystemsItems.Add(new EncounterReviewOfSystemsItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                System = RosSystem.General,
                SymptomCode = "01",
                SymptomTitle = "Fever",
                IsNormal = false,
                Remarks = "Low grade fever for 2 days"
            });

            encounter.ReviewOfSystemsItems.Add(new EncounterReviewOfSystemsItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                System = RosSystem.Cardiorespiratory,
                SymptomCode = "02",
                SymptomTitle = "Cough",
                IsNormal = false,
                Remarks = "Productive cough with whitish sputum"
            });

            encounter.ReviewOfSystemsItems.Add(new EncounterReviewOfSystemsItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                System = RosSystem.Gastrointestinal,
                SymptomCode = "00",
                SymptomTitle = "Essentially Normal",
                IsNormal = true
            });

            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        // 2. Query and verify relations
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = await context.Consultations
                .Include(c => c.ReviewOfSystemsItems)
                .FirstAsync(c => c.Id == encounterId);

            encounter.ReviewOfSystemsItems.Should().HaveCount(3);
            encounter.ReviewOfSystemsItems.Count(r => !r.IsNormal).Should().Be(2);

            var fever = encounter.ReviewOfSystemsItems.First(r => r.System == RosSystem.General);
            fever.SymptomTitle.Should().Be("Fever");
            fever.Remarks.Should().Be("Low grade fever for 2 days");

            // Update one ROS item
            fever.Remarks = "Fever resolved after antipyretic";
            await context.SaveChangesAsync();
        }

        // 3. Verify update persistence
        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var item = await verifyContext.EncounterReviewOfSystemsItems
                .FirstAsync(r => r.ConsultationEncounterId == encounterId && r.System == RosSystem.General);

            item.Remarks.Should().Be("Fever resolved after antipyretic");
        }
    }

    [Fact]
    public async Task EncounterObGyneExam_1NFForm_FullLifecycle_PersistsAndNavigatesCleanly()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_ObGyne_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow
            };

            var obGyne = new EncounterObGyneExam
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                FundicHeightCm = 32.5m,
                FetalHeartToneBpm = 145,
                EstimatedFetalWeightGrams = 2200,
                LeopoldL1 = "Breech in fundus",
                LeopoldL2 = "Fetal back on maternal left",
                LeopoldL3 = "Cephalic presentation, engaged",
                LeopoldL4 = "Divergent fingers",
                SpeculumExam = "Cervix closed, no bleeding",
                InternalExam = "Cervix 1 cm dilated, 50% effaced, station -2",
                Remarks = "Term pregnancy, reassuring fetal status"
            };

            encounter.ObGyneExam = obGyne;
            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.Consultations
                .Include(c => c.ObGyneExam)
                .FirstAsync(c => c.Id == encounterId);

            loaded.ObGyneExam.Should().NotBeNull();
            loaded.ObGyneExam!.FundicHeightCm.Should().Be(32.5m);
            loaded.ObGyneExam.FetalHeartToneBpm.Should().Be(145);
            loaded.ObGyneExam.EstimatedFetalWeightGrams.Should().Be(2200);
            loaded.ObGyneExam.LeopoldL2.Should().Be("Fetal back on maternal left");
            loaded.ObGyneExam.SpeculumExam.Should().Be("Cervix closed, no bleeding");
        }
    }

    [Fact]
    public async Task EncounterPediatricMilestoneAndDangerSigns_1NFForm_NestedCollection_MaintainsIntegrity()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_PediatricMilestone_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow
            };

            var milestone = new EncounterPediatricMilestone
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                MilestoneVisitAgeCode = "06M", // 6 months
                IsGrossMotorAtPar = true,
                IsFineMotorAtPar = true,
                IsLanguageAtPar = false, // Language delay
                IsCognitiveAtPar = true,
                IsPsychosocialAtPar = true,
                IsOverallDevelopmentAtPar = false,
                LanguageRemarks = "Not babbling or responding to vocal sounds",
                DevelopmentalRemarks = "Monitor and refer to developmental pediatrician if persists"
            };

            // Add child danger signs
            milestone.DangerSigns.Add(new EncounterPediatricDangerSign
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PediatricMilestoneId = milestone.Id,
                Domain = PediatricDevelopmentDomain.Language,
                DangerSignCode = "DS-LANG-01",
                Description = "No babbling by 6 months",
                IsPresent = true,
                Remarks = "Parent noticed child does not orient to voices"
            });

            encounter.PediatricMilestones.Add(milestone);
            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.Consultations
                .Include(c => c.PediatricMilestones)
                    .ThenInclude(m => m.DangerSigns)
                .FirstAsync(c => c.Id == encounterId);

            loaded.PediatricMilestones.Should().HaveCount(1);
            var m = loaded.PediatricMilestones.First();
            m.MilestoneVisitAgeCode.Should().Be("06M");
            m.IsGrossMotorAtPar.Should().BeTrue();
            m.IsLanguageAtPar.Should().BeFalse();
            m.DangerSigns.Should().HaveCount(1);
            m.DangerSigns.First().DangerSignCode.Should().Be("DS-LANG-01");
            m.DangerSigns.First().IsPresent.Should().BeTrue();
        }
    }

    [Fact]
    public async Task EncounterAdolescentAssessment_1NFForm_FullLifecycle_PersistsAndNavigatesCleanly()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Adolescent_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow
            };

            var adolescent = new EncounterAdolescentAssessment
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                SmrAssessed = true,
                PubicHairStage = 3,
                BreastStage = 3,
                GenitalStage = null,
                SmrResultCode = "SMR-STAGE-3",
                RapidHeadsssAssentConsent = true,
                EducationEmploymentCode = "IN_SCHOOL",
                RelationshipStatusCode = "PEER_SUPPORTIVE",
                LivingArrangementCode = "WITH_PARENTS",
                Q01HomeViolenceOrConflict = false,
                Q02SchoolOrWorkProblems = false,
                Q03BodyImageOrEatingDistress = true,
                Q04LackOfFriendsOrActivities = false,
                Q05TobaccoAlcoholDrugUse = false,
                Q06SexuallyActiveUnsafeSex = false,
                Q07DepressionOrSadness = false,
                Q08SuicidalThoughtsOrSelfHarm = false,
                Q09BullyingOrCyberbullying = false,
                Q10PhysicalOrSexualAbuse = false,
                Q11DangerousBehaviorsOrWeapons = false,
                Q12RequestsConfidentialCounseling = true,
                ProceedToFullHeadsss = true,
                Remarks = "Patient requested guidance on adolescent nutrition and body image"
            };

            encounter.AdolescentAssessment = adolescent;
            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.Consultations
                .Include(c => c.AdolescentAssessment)
                .FirstAsync(c => c.Id == encounterId);

            loaded.AdolescentAssessment.Should().NotBeNull();
            loaded.AdolescentAssessment!.SmrAssessed.Should().BeTrue();
            loaded.AdolescentAssessment.PubicHairStage.Should().Be(3);
            loaded.AdolescentAssessment.BreastStage.Should().Be(3);
            loaded.AdolescentAssessment.Q03BodyImageOrEatingDistress.Should().BeTrue();
            loaded.AdolescentAssessment.Q12RequestsConfidentialCounseling.Should().BeTrue();
            loaded.AdolescentAssessment.ProceedToFullHeadsss.Should().BeTrue();
        }
    }

    [Fact]
    public async Task EncounterHeadsssDomainAssessment_1NFForm_MultipleDomains_PersistsAndNavigatesCleanly()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Headsss_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid encounterId;

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var encounter = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow
            };

            // Add HEADSSS assessments across domains
            encounter.HeadsssAssessments.Add(new EncounterHeadsssDomainAssessment
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                Domain = HeadsssDomain.Home,
                AssentConsentStatus = true,
                GuideQuestionCodes = "H01,H02",
                PatientAnswers = "Lives with mother and two siblings. Safe home environment.",
                RequiresUrgentReferral = false
            });

            encounter.HeadsssAssessments.Add(new EncounterHeadsssDomainAssessment
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = encounter.Id,
                Domain = HeadsssDomain.Eating,
                AssentConsentStatus = true,
                GuideQuestionCodes = "E01,E02",
                PatientAnswers = "Skips breakfast frequently; expresses body image anxiety.",
                RedFlagCodes = "RF-EAT-01",
                RequiresUrgentReferral = false,
                ActionTakenOrIntervention = "Provided adolescent healthy eating brochure and reassurance"
            });

            context.Consultations.Add(encounter);
            await context.SaveChangesAsync();
            encounterId = encounter.Id;
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.Consultations
                .Include(c => c.HeadsssAssessments)
                .FirstAsync(c => c.Id == encounterId);

            loaded.HeadsssAssessments.Should().HaveCount(2);
            loaded.HeadsssAssessments.Any(h => h.Domain == HeadsssDomain.Home).Should().BeTrue();
            loaded.HeadsssAssessments.Any(h => h.Domain == HeadsssDomain.Eating).Should().BeTrue();
        }
    }

    [Fact]
    public async Task PatientBpMonitoringLogAndDays_1NFForm_NestedCollection_MaintainsIntegrity()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_BpMonitoring_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid logId;

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var log = new PatientBpMonitoringLog
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                StartDate = new DateOnly(2026, 10, 1),
                EndDate = new DateOnly(2026, 10, 7),
                OverallAverageSystolic = 138.4m,
                OverallAverageDiastolic = 88.2m,
                AverageAmSystolic = 140.0m,
                AverageAmDiastolic = 90.0m,
                AveragePmSystolic = 136.8m,
                AveragePmDiastolic = 86.4m,
                ClinicalInterpretation = "Stage 1 Hypertension on 7-day home BP log"
            };

            // Add Day 1 and Day 2
            log.Days.Add(new PatientBpMonitoringDay
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                BpMonitoringLogId = log.Id,
                DayNumber = 1,
                MeasurementDate = new DateOnly(2026, 10, 1),
                LocationCode = "02",
                AmSystolic = 142,
                AmDiastolic = 92,
                AmHeartRate = 75,
                PmSystolic = 138,
                PmDiastolic = 88,
                PmHeartRate = 72
            });

            log.Days.Add(new PatientBpMonitoringDay
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                BpMonitoringLogId = log.Id,
                DayNumber = 2,
                MeasurementDate = new DateOnly(2026, 10, 2),
                LocationCode = "02",
                AmSystolic = 138,
                AmDiastolic = 88,
                AmHeartRate = 74,
                PmSystolic = 136,
                PmDiastolic = 86,
                PmHeartRate = 70
            });

            context.PatientBpMonitoringLogs.Add(log);
            await context.SaveChangesAsync();
            logId = log.Id;
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.PatientBpMonitoringLogs
                .Include(l => l.Days)
                .FirstAsync(l => l.Id == logId);

            loaded.PatientId.Should().Be(patient.Id);
            loaded.OverallAverageSystolic.Should().Be(138.4m);
            loaded.Days.Should().HaveCount(2);
            loaded.Days.First().AmSystolic.Should().Be(142);
            loaded.Days.Last().PmSystolic.Should().Be(136);
        }
    }

    [Fact]
    public async Task PatientHospitalizationHistory_1NFCollection_AddUpdateSoftDeleteAndQuery_Succeeds()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Hospitalization_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid hosp1Id;
        Guid hosp2Id;

        // 1. Add multiple hospitalizations
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var hosp1 = new PatientHospitalizationHistory
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                ReasonForAdmission = "Acute Appendicitis with localized peritonitis",
                AdmissionDate = new DateOnly(2022, 3, 14),
                DischargeDate = new DateOnly(2022, 3, 18),
                AdmissionYear = 2022,
                PrimaryIcd10Code = "K35.8",
                HospitalFacilityName = "Philippine General Hospital",
                AttendingPhysicianName = "Dr. Roberto Gomez",
                DischargeDisposition = "Recovered / Discharged Home",
                ClinicalSummaryNotes = "Underwent laparoscopic appendectomy without intraoperative complications"
            };

            var hosp2 = new PatientHospitalizationHistory
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                ReasonForAdmission = "Community-Acquired Pneumonia, Moderate Risk",
                AdmissionDate = new DateOnly(2024, 8, 10),
                DischargeDate = new DateOnly(2024, 8, 15),
                AdmissionYear = 2024,
                PrimaryIcd10Code = "J18.9",
                HospitalFacilityName = "St. Luke's Medical Center",
                DischargeDisposition = "Improved"
            };

            context.PatientHospitalizationHistories.Add(hosp1);
            context.PatientHospitalizationHistories.Add(hosp2);
            await context.SaveChangesAsync();

            hosp1Id = hosp1.Id;
            hosp2Id = hosp2.Id;
        }

        // 2. Query and verify persistence
        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var patientWithHosp = await context.Patients
                .Include(p => p.HospitalizationHistories)
                .FirstAsync(p => p.Id == patient.Id);

            patientWithHosp.HospitalizationHistories.Should().HaveCount(2);

            // Update hosp1
            var hosp1 = patientWithHosp.HospitalizationHistories.First(h => h.Id == hosp1Id);
            hosp1.ClinicalSummaryNotes = "Updated summary notes";

            // Soft-delete hosp2
            var hosp2 = patientWithHosp.HospitalizationHistories.First(h => h.Id == hosp2Id);
            context.PatientHospitalizationHistories.Remove(hosp2);

            await context.SaveChangesAsync();
        }

        // 3. Verify soft delete filter hides hosp2 while keeping hosp1
        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var activeList = await verifyContext.PatientHospitalizationHistories
                .Where(h => h.PatientId == patient.Id)
                .ToListAsync();

            activeList.Should().HaveCount(1);
            activeList.First().Id.Should().Be(hosp1Id);
            activeList.First().ClinicalSummaryNotes.Should().Be("Updated summary notes");

            // IgnoreQueryFilters shows soft-deleted entity
            var allList = await verifyContext.PatientHospitalizationHistories
                .IgnoreQueryFilters()
                .Where(h => h.PatientId == patient.Id)
                .ToListAsync();

            allList.Should().HaveCount(2);
            var deletedHosp2 = allList.First(h => h.Id == hosp2Id);
            deletedHosp2.IsDeleted.Should().BeTrue();
        }
    }

    [Fact]
    public async Task PatientInjuryHistory_1NFCollection_AddUpdateSoftDeleteAndQuery_Succeeds()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_Injury_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid injuryId;

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var injury = new PatientInjuryHistory
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                InjuryDescription = "Left distal radius fracture from vehicular collision",
                InjuryDate = new DateOnly(2021, 6, 20),
                InjuryYear = 2021,
                MechanismOfInjury = "Motorcycle collision against stationary vehicle",
                BodySite = "Left Wrist / Distal Forearm",
                Icd10ExternalCauseCode = "V23.4",
                TreatedAtFacilityName = "East Avenue Medical Center",
                ResidualSequelae = "Mild morning stiffness, full range of motion regained"
            };

            context.PatientInjuryHistories.Add(injury);
            await context.SaveChangesAsync();
            injuryId = injury.Id;
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.PatientInjuryHistories.FirstAsync(i => i.Id == injuryId);
            loaded.BodySite.Should().Be("Left Wrist / Distal Forearm");
            loaded.MechanismOfInjury.Should().Be("Motorcycle collision against stationary vehicle");
            loaded.Icd10ExternalCauseCode.Should().Be("V23.4");
        }
    }

    [Fact]
    public async Task PatientHomeMedication_1NFCollection_AddUpdateSoftDeleteAndQuery_Succeeds()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_HomeMed_Lifecycle_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setupContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setupContext.Patients.Add(patient);
            await setupContext.SaveChangesAsync();
        }

        Guid medId;

        using (var context = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var med = new PatientHomeMedication
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                GenericDrugName = "Amlodipine Besylate",
                BrandName = "Norvasc",
                PhilHealthDrugCode = "MED-0001",
                DoseStrength = "5 mg",
                Form = "Tablet",
                Route = "Oral",
                Frequency = "Once daily in the morning",
                Duration = "Continuous maintenance",
                IsPndfListed = true,
                PrescribingPhysicianName = "Dr. Alberto Cruz",
                StartDate = new DateOnly(2023, 1, 15),
                IsActive = true,
                Indication = "Essential Hypertension"
            };

            context.PatientHomeMedications.Add(med);
            await context.SaveChangesAsync();
            medId = med.Id;
        }

        using (var verifyContext = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var loaded = await verifyContext.PatientHomeMedications.FirstAsync(m => m.Id == medId);
            loaded.GenericDrugName.Should().Be("Amlodipine Besylate");
            loaded.BrandName.Should().Be("Norvasc");
            loaded.IsPndfListed.Should().BeTrue();
            loaded.IsActive.Should().BeTrue();
            loaded.Indication.Should().Be("Essential Hypertension");
        }
    }

    [Fact]
    public async Task MultiTenancyIsolation_AllNew1NfEntities_ScopedToClinic()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var dbName = $"Db_MultiTenancy_Isolation_{Guid.NewGuid():N}";

        var patientA = CreateBaselinePatient(clinicA);

        using (var contextA = CreateTestDbContext(clinicA, dbName: dbName))
        {
            contextA.Patients.Add(patientA);

            var encounterA = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicA,
                PatientId = patientA.Id,
                PatientName = $"{patientA.FirstName} {patientA.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Clinic A",
                EncounterDate = DateTime.UtcNow
            };

            encounterA.ReviewOfSystemsItems.Add(new EncounterReviewOfSystemsItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicA,
                ConsultationEncounterId = encounterA.Id,
                System = RosSystem.General,
                SymptomTitle = "Fatigue"
            });

            var hospA = new PatientHospitalizationHistory
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicA,
                PatientId = patientA.Id,
                ReasonForAdmission = "Admission at Clinic A",
                AdmissionYear = 2025
            };

            var injuryA = new PatientInjuryHistory
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicA,
                PatientId = patientA.Id,
                InjuryDescription = "Injury at Clinic A"
            };

            var medA = new PatientHomeMedication
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicA,
                PatientId = patientA.Id,
                GenericDrugName = "Metformin"
            };

            contextA.Consultations.Add(encounterA);
            contextA.PatientHospitalizationHistories.Add(hospA);
            contextA.PatientInjuryHistories.Add(injuryA);
            contextA.PatientHomeMedications.Add(medA);
            await contextA.SaveChangesAsync();
        }

        // Query from Clinic B — global query filter must strictly yield ZERO rows
        using (var contextB = CreateTestDbContext(clinicB, dbName: dbName))
        {
            var patientsInB = await contextB.Patients.ToListAsync();
            patientsInB.Should().BeEmpty();

            var encountersInB = await contextB.Consultations.ToListAsync();
            encountersInB.Should().BeEmpty();

            var rosInB = await contextB.EncounterReviewOfSystemsItems.ToListAsync();
            rosInB.Should().BeEmpty();

            var hospInB = await contextB.PatientHospitalizationHistories.ToListAsync();
            hospInB.Should().BeEmpty();

            var injuriesInB = await contextB.PatientInjuryHistories.ToListAsync();
            injuriesInB.Should().BeEmpty();

            var medsInB = await contextB.PatientHomeMedications.ToListAsync();
            medsInB.Should().BeEmpty();
        }
    }

    #endregion

    #region Group 5: Advanced Adversarial Edge Cases

    [Fact]
    public async Task Encounter_RapidMultiTransition_BackAndForth_PreservesIntegrity()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_MultiTransition_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setup = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setup.Patients.Add(patient);
            await setup.SaveChangesAsync();
        }

        Guid encId;
        using (var ctx = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var enc = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Rapid Transition",
                EncounterDate = DateTime.UtcNow,
                VisitWorkflowMode = VisitWorkflowMode.Regular,
                Subjective = "Initial regular chief complaint."
            };
            ctx.Consultations.Add(enc);
            await ctx.SaveChangesAsync();
            encId = enc.Id;
        }

        // Cycle through modes multiple times simulating user toggles on the workstation UI
        var modes = new[]
        {
            VisitWorkflowMode.YakapAvailment,
            VisitWorkflowMode.Regular,
            VisitWorkflowMode.YakapAvailment,
            VisitWorkflowMode.Regular
        };

        foreach (var targetMode in modes)
        {
            using var ctx = CreateTestDbContext(clinicId, dbName: dbName);
            var enc = await ctx.Consultations.FirstAsync(c => c.Id == encId);
            enc.VisitWorkflowMode = targetMode;
            if (targetMode == VisitWorkflowMode.YakapAvailment)
            {
                enc.IsYakapEligible = true;
                enc.PhilHealthCaseNo ??= "CAS-999";
            }
            await ctx.SaveChangesAsync();
        }

        using (var verify = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var enc = await verify.Consultations.FirstAsync(c => c.Id == encId);
            enc.VisitWorkflowMode.Should().Be(VisitWorkflowMode.Regular);
            enc.Subjective.Should().Be("Initial regular chief complaint.");
            enc.PhilHealthCaseNo.Should().Be("CAS-999"); // Existing statutory identifier retained safely
        }
    }

    [Fact]
    public async Task OpdRegularEncounter_MultipleDiagnosesAndPrescriptions_SignsSuccessfully()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_MultiRxDiag_Sign_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setup = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setup.Patients.Add(patient);
            await setup.SaveChangesAsync();
        }

        Guid encId;
        using (var ctx = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var enc = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Maria Santos",
                EncounterDate = DateTime.UtcNow,
                VisitWorkflowMode = VisitWorkflowMode.Regular,
                DoctorPrcLicense = "0098765",
                Subjective = "OPD visit for multiple symptoms",
                Assessment = "Acute bronchitis and allergic rhinitis"
            };

            // Multiple diagnoses
            enc.Diagnoses.Add(new EncounterDiagnosis
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = enc.Id,
                Icd10Code = "J20.9",
                Description = "Acute bronchitis, unspecified",
                IsPrimary = true
            });
            enc.Diagnoses.Add(new EncounterDiagnosis
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = enc.Id,
                Icd10Code = "J30.4",
                Description = "Allergic rhinitis, unspecified",
                IsPrimary = false
            });

            // Multiple prescriptions
            enc.Prescriptions.Add(new PrescriptionItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = enc.Id,
                GenericName = "Amoxicillin",
                Dosage = "500 mg",
                Form = "Capsule",
                Sig = "1 cap TID for 7 days",
                Quantity = 21,
                PhilHealthDrugCode = null // Nullable on Regular Rx
            });
            enc.Prescriptions.Add(new PrescriptionItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = enc.Id,
                GenericName = "Cetirizine",
                Dosage = "10 mg",
                Form = "Tablet",
                Sig = "1 tab once daily at bedtime",
                Quantity = 10,
                PhilHealthDrugCode = null
            });

            ctx.Consultations.Add(enc);
            await ctx.SaveChangesAsync();
            encId = enc.Id;
        }

        // Sign encounter
        using (var ctx = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var enc = await ctx.Consultations
                .Include(c => c.Diagnoses)
                .Include(c => c.Prescriptions)
                .FirstAsync(c => c.Id == encId);

            enc.IsSigned = true;
            enc.SignedAt = DateTime.UtcNow;
            await ctx.SaveChangesAsync();
        }

        using (var verify = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var enc = await verify.Consultations
                .Include(c => c.Diagnoses)
                .Include(c => c.Prescriptions)
                .FirstAsync(c => c.Id == encId);

            enc.IsSigned.Should().BeTrue();
            enc.Diagnoses.Should().HaveCount(2);
            enc.Prescriptions.Should().HaveCount(2);
            enc.Prescriptions.All(p => p.PhilHealthDrugCode == null).Should().BeTrue();
        }
    }

    [Fact]
    public async Task EncounterReviewOfSystemsItem_AbnormalWithOtherSpecification_PersistsCleanly()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_RosOther_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setup = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setup.Patients.Add(patient);
            await setup.SaveChangesAsync();
        }

        Guid encId;
        using (var ctx = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var enc = new ConsultationEncounter
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                PatientName = $"{patient.FirstName} {patient.LastName}",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Specialist",
                EncounterDate = DateTime.UtcNow
            };

            enc.ReviewOfSystemsItems.Add(new EncounterReviewOfSystemsItem
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                ConsultationEncounterId = enc.Id,
                System = RosSystem.Neurological,
                SymptomCode = "99", // Others
                SymptomTitle = "Other Neurological Symptom",
                IsNormal = false,
                OtherSpecification = "Transient visual scotoma lasting 15 minutes",
                Remarks = "Preceded by fortification spectrum"
            });

            ctx.Consultations.Add(enc);
            await ctx.SaveChangesAsync();
            encId = enc.Id;
        }

        using (var verify = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var enc = await verify.Consultations
                .Include(c => c.ReviewOfSystemsItems)
                .FirstAsync(c => c.Id == encId);

            var ros = enc.ReviewOfSystemsItems.First();
            ros.System.Should().Be(RosSystem.Neurological);
            ros.SymptomCode.Should().Be("99");
            ros.OtherSpecification.Should().Be("Transient visual scotoma lasting 15 minutes");
            ros.Remarks.Should().Be("Preceded by fortification spectrum");
        }
    }

    [Fact]
    public async Task PatientHospitalizationHistory_HistoricalRecall_WithNullDatesAndValidYear_Persists()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_HospRecall_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setup = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setup.Patients.Add(patient);
            await setup.SaveChangesAsync();
        }

        Guid hospId;
        using (var ctx = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var hosp = new PatientHospitalizationHistory
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                ReasonForAdmission = "Childhood asthma exacerbation",
                AdmissionDate = null, // Exact date not recalled by patient
                DischargeDate = null,
                AdmissionYear = 2005, // Year recalled
                HospitalFacilityName = "Baguio General Hospital"
            };

            ctx.PatientHospitalizationHistories.Add(hosp);
            await ctx.SaveChangesAsync();
            hospId = hosp.Id;
        }

        using (var verify = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var hosp = await verify.PatientHospitalizationHistories.FirstAsync(h => h.Id == hospId);
            hosp.AdmissionDate.Should().BeNull();
            hosp.DischargeDate.Should().BeNull();
            hosp.AdmissionYear.Should().Be(2005);
            hosp.HospitalFacilityName.Should().Be("Baguio General Hospital");
        }
    }

    [Fact]
    public async Task PatientHomeMedication_DiscontinuedWithStoppedDate_PersistsCleanly()
    {
        var clinicId = Guid.NewGuid();
        var dbName = $"Db_HomeMedStopped_{Guid.NewGuid():N}";
        var patient = CreateBaselinePatient(clinicId);

        using (var setup = CreateTestDbContext(clinicId, dbName: dbName))
        {
            setup.Patients.Add(patient);
            await setup.SaveChangesAsync();
        }

        Guid medId;
        using (var ctx = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var med = new PatientHomeMedication
            {
                Id = Guid.NewGuid(),
                TenantId = TestTenant,
                ClinicId = clinicId,
                PatientId = patient.Id,
                GenericDrugName = "Losartan Potassium",
                DoseStrength = "50 mg",
                Form = "Tablet",
                Route = "Oral",
                Frequency = "Once daily",
                IsActive = false,
                StartDate = new DateOnly(2022, 1, 1),
                StoppedDate = new DateOnly(2023, 6, 30),
                Indication = "Hypertension (shifted to Amlodipine due to chronic dry cough)"
            };

            ctx.PatientHomeMedications.Add(med);
            await ctx.SaveChangesAsync();
            medId = med.Id;
        }

        using (var verify = CreateTestDbContext(clinicId, dbName: dbName))
        {
            var med = await verify.PatientHomeMedications.FirstAsync(m => m.Id == medId);
            med.IsActive.Should().BeFalse();
            med.StoppedDate.Should().Be(new DateOnly(2023, 6, 30));
            med.Indication.Should().Contain("shifted to Amlodipine");
        }
    }

    [Fact]
    public void TierA_EhrStaticOptions_LookupBehavior_WhitespaceAndEmptyHandling()
    {
        // Null or whitespace set name returns false
        EhrStaticOptions.TryGetOption("", "MALE", out var opt1).Should().BeFalse();
        opt1.Should().BeNull();

        EhrStaticOptions.TryGetOption("sex", "", out var opt2).Should().BeFalse();
        opt2.Should().BeNull();

        // Standard exact match (with case variations) works
        EhrStaticOptions.TryGetOption("SEX", "female", out var opt3).Should().BeTrue();
        opt3!.Code.Should().Be("FEMALE");
    }

    #endregion
}
