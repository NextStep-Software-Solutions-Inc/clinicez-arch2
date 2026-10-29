using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

/// <summary>
/// Adversarial stress-testing suite for Milestone M2-B:
/// 1. 5 PCAPI v2.0 Wire Builders (FPE, Consultation, Diagnostic Request, Diagnostic Results, Medicine):
///    - Null/empty optional fields (smoking/social history, allergy text, physical exam, vitals, etc.)
///    - Multiple diagnoses and non-primary conditions
///    - GAMOT UPSC 29 vs 30 character exact validation boundaries (<29, >30, null, whitespace, catalog resolution)
///    - Date format requirements (strict ISO yyyy-MM-dd in wire payloads vs MM/dd/yyyy in query parameters)
/// 2. Annex C Payload Encryption (PhilHealthPayloadEncryptor):
///    - Null-byte manual padding round-trip across varied block boundaries (1, 15, exact 16, 17, 31, exact 32, 64 bytes)
///    - Tampered ciphertext rejection (tampered IV, corrupted payload bytes in first, middle, last blocks)
///    - Pre-padding SHA-256 payload hash verification failure on altered plaintext or tampered hash
///    - PDF %%EOF marker enforcement on encrypted diagnostic result attachments
/// </summary>
public sealed class YakapChallengerAdversarialTests
{
    private const string TestCipherKey = "0123456789abcdef0123456789abcdef";
    private readonly IPhilHealthPayloadEncryptor _encryptor = new PhilHealthPayloadEncryptor();

    private static FacilitySettings CreateFacility(string accreNo = "H91000001") => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-challenger",
        ClinicId = Guid.NewGuid(),
        ClinicName = "Adversarial Stress Test Clinic",
        AccreditationNumber = accreNo,
        PmccNumber = "123456",
        SoftwareCertificateId = "CERT-CHALLENGER-01"
    };

    private static Patient CreateMinimalPatient(string pin = "12-345678901-2") => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-challenger",
        ClinicId = Guid.NewGuid(),
        PatientCode = "PAT-ADV-0001",
        FirstName = "Maria",
        LastName = "Santos",
        DateOfBirth = new DateOnly(1990, 5, 20),
        Sex = BiologicalSex.Female,
        ContactNumber = "09170000000",
        PhilHealthNumber = pin
    };

    // =========================================================================
    // SECTION 1: PCAPI v2.0 WIRE BUILDERS - NULL/EMPTY OPTIONAL FIELDS
    // =========================================================================

    [Fact]
    public void YakapFpeWireBuilder_WithNullOptionalFields_BuildsValidJsonWithExpectedDefaults()
    {
        // Arrange: Patient with NO addresses, NO middle name, NO suffix, NO alternate contact, NO email, NO blood type
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();

        var context = new YakapFpeContext
        {
            Facility = facility,
            Patient = patient,
            Address = null,
            Vitals = null,
            MedicalHistory = null,
            FamilyHistory = null,
            Allergies = null,
            Immunizations = null,
            SocialHistory = null,
            PhysicalExam = null,
            NcdAssessment = null,
            Encounter = null,
            EnlistmentCaseNo = null,
            EffectiveDate = null
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;

        // Address fallbacks should be empty strings, not null or missing
        root.GetProperty("pStreet").GetString().Should().Be(string.Empty);
        root.GetProperty("pBrgyCode").GetString().Should().Be(string.Empty);
        root.GetProperty("pMunCode").GetString().Should().Be(string.Empty);
        root.GetProperty("pProvCode").GetString().Should().Be(string.Empty);
        root.GetProperty("pRegCode").GetString().Should().Be(string.Empty);
        root.GetProperty("pZipCode").GetString().Should().Be(string.Empty);

        // Optional patient demographics
        root.GetProperty("pPatientMName").GetString().Should().Be(string.Empty);
        root.GetProperty("pPatientExtName").GetString().Should().Be(string.Empty);
        root.GetProperty("pContactNo").GetString().Should().Be("09170000000");
        root.GetProperty("pEmailAdd").GetString().Should().Be(string.Empty);
        root.GetProperty("pBloodType").ValueKind.Should().Be(JsonValueKind.Null);

        // Optional sections omitted when null
        root.TryGetProperty("pVitals", out _).Should().BeFalse();
        root.TryGetProperty("pPastMedHistory", out _).Should().BeFalse();
        root.TryGetProperty("pFamilyHistory", out _).Should().BeFalse();
        root.TryGetProperty("pAllergies", out _).Should().BeFalse();
        root.TryGetProperty("pImmunizations", out _).Should().BeFalse();

        // Effective date defaults to today
        root.GetProperty("pEffectiveDate").GetString().Should().MatchRegex(@"^\d{4}-\d{2}-\d{2}$");
        // Enlistment case number falls back to PatientCode
        root.GetProperty("pHciCaseNo").GetString().Should().Be(patient.PatientCode);
    }

    [Fact]
    public void YakapFpeWireBuilder_WithEmptyCollections_OmitsOptionalSections()
    {
        // Arrange
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();

        var context = new YakapFpeContext
        {
            Facility = facility,
            Patient = patient,
            MedicalHistory = new List<PatientMedicalHistory>(),
            FamilyHistory = new List<PatientFamilyHistory>(),
            Allergies = new List<PatientAllergy>(),
            Immunizations = new List<PatientImmunization>()
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.TryGetProperty("pPastMedHistory", out _).Should().BeFalse();
        root.TryGetProperty("pFamilyHistory", out _).Should().BeFalse();
        root.TryGetProperty("pAllergies", out _).Should().BeFalse();
        root.TryGetProperty("pImmunizations", out _).Should().BeFalse();
    }

    [Fact]
    public void YakapFpeWireBuilder_WithSparseChildRecords_HandlesNullFieldsWithoutException()
    {
        // Arrange: Child entities with empty/null optional fields
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();

        var sparseMedHistory = new List<PatientMedicalHistory>
        {
            new()
            {
                PatientId = patient.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                ConditionTitle = null!,
                SpecificDescription = "Some unspecified condition",
                Icd10Code = null,
                PhilHealthMdiseaseCode = null,
                OnsetDate = null,
                Status = ProblemStatus.Resolved
            }
        };

        var sparseAllergies = new List<PatientAllergy>
        {
            new()
            {
                PatientId = patient.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                Allergen = "Peanuts",
                ReactionManifestation = null,
                Severity = AllergySeverity.Moderate
            }
        };

        var sparseFamilyHistory = new List<PatientFamilyHistory>
        {
            new()
            {
                PatientId = patient.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                ConditionTitle = "Hypertension",
                SpecificDescription = null,
                Relationship = FamilyRelationship.Mother
            }
        };

        var context = new YakapFpeContext
        {
            Facility = facility,
            Patient = patient,
            MedicalHistory = sparseMedHistory,
            Allergies = sparseAllergies,
            FamilyHistory = sparseFamilyHistory
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;

        var medHistoryArray = root.GetProperty("pPastMedHistory");
        medHistoryArray[0].GetProperty("pCondition").GetString().Should().Be("Some unspecified condition");
        medHistoryArray[0].GetProperty("pIcd10Code").GetString().Should().Be(string.Empty);
        medHistoryArray[0].GetProperty("pDiseaseCode").GetString().Should().Be(string.Empty);
        medHistoryArray[0].GetProperty("pDiagnosedYear").ValueKind.Should().Be(JsonValueKind.Null);
        medHistoryArray[0].GetProperty("pIsControlled").GetBoolean().Should().BeFalse();

        var allergyArray = root.GetProperty("pAllergies");
        allergyArray[0].GetProperty("pAllergen").GetString().Should().Be("Peanuts");
        allergyArray[0].GetProperty("pReaction").GetString().Should().Be(string.Empty);
        allergyArray[0].GetProperty("pSeverity").GetString().Should().Be("Moderate");

        var familyArray = root.GetProperty("pFamilyHistory");
        familyArray[0].GetProperty("pCondition").GetString().Should().Be("Hypertension");
        familyArray[0].GetProperty("pRelationship").GetString().Should().Be("Mother");
    }

    [Theory]
    [InlineData("", "Dela Cruz", "Juan", "12-345678901-2", "Accreditation")]
    [InlineData("H91000001", "", "Juan", "12-345678901-2", "last name")]
    [InlineData("H91000001", "Dela Cruz", "", "12-345678901-2", "first name")]
    [InlineData("H91000001", "Dela Cruz", "Juan", "", "PhilHealth Identification Number")]
    public void YakapFpeWireBuilder_MissingMandatoryDemographics_ReturnsFailure(
        string accreNo, string lastName, string firstName, string pin, string errorSubstring)
    {
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility(accreNo);
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-001",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-001",
            ContactNumber = "09170000000",
            LastName = lastName,
            FirstName = firstName,
            PhilHealthNumber = pin,
            DateOfBirth = new DateOnly(1990, 1, 1)
        };

        var context = new YakapFpeContext { Facility = facility, Patient = patient };
        var result = builder.BuildWirePayload(context);

        result.IsFailure.Should().BeTrue();
        result.Errors.Should().Contain(e => e.Contains(errorSubstring, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void YakapFpeWireBuilder_FutureOrBirthDateDefault_FailsValidation()
    {
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility();
        var futurePatient = CreateMinimalPatient();
        futurePatient.DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(5));

        var context = new YakapFpeContext { Facility = facility, Patient = futurePatient };
        var result = builder.BuildWirePayload(context);

        result.IsFailure.Should().BeTrue();
        result.Errors.Should().ContainMatch("*date of birth must be a valid past date*");
    }

    [Fact]
    public void YakapFpeWireBuilder_ResolvesPinFromMembership_WhenPatientPhilHealthNumberEmpty()
    {
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient(pin: ""); // empty direct PIN
        patient.PhilHealthMembership = new PatientPhilHealthMembership
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            MemberPin = "11-223344556-7"
        };

        var context = new YakapFpeContext { Facility = facility, Patient = patient };
        var result = builder.BuildWirePayload(context);

        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        doc.RootElement.GetProperty("pPatientPin").GetString().Should().Be("11-223344556-7");
    }

    // =========================================================================
    // SECTION 2: CONSULTATIONS - MULTIPLE DIAGNOSES & NON-PRIMARY CONDITIONS
    // =========================================================================

    [Fact]
    public void YakapConsultationWireBuilder_MultipleDiagnoses_PreservesPrimaryAndNonPrimaryFlags()
    {
        // Arrange: 1 primary diagnosis and 2 secondary/non-primary conditions
        var builder = new YakapConsultationWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Alberto Ramos",
            EncounterDate = new DateTime(2026, 10, 28, 14, 30, 0, DateTimeKind.Utc),
            DoctorPhilHealthPan = "PAN-12345678",
            DoctorPrcLicense = "0123456",
            PhilHealthCaseNo = "C00921202600001",
            Subjective = "Patient complains of headache and high BP",
            Objective = "BP 150/95 mmHg",
            Assessment = "Uncontrolled hypertension with asthma",
            Plan = "Increase amlodipine, monitor peak flow"
        };

        var diagnoses = new List<EncounterDiagnosis>
        {
            new()
            {
                ConsultationEncounterId = encounter.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                Icd10Code = "I10",
                Description = "Essential (primary) hypertension",
                IsPrimary = true
            },
            new()
            {
                ConsultationEncounterId = encounter.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                Icd10Code = "E11.9",
                Description = "Type 2 diabetes mellitus without complications",
                IsPrimary = false
            },
            new()
            {
                ConsultationEncounterId = encounter.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                Icd10Code = "J45.909",
                Description = "Unspecified asthma, uncomplicated",
                IsPrimary = false
            }
        };

        var context = new YakapConsultationContext
        {
            Facility = facility,
            Patient = patient,
            Encounter = encounter,
            Diagnoses = diagnoses
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;

        var diagArray = root.GetProperty("pDiagnoses");
        diagArray.GetArrayLength().Should().Be(3);

        // Verify Primary diagnosis
        diagArray[0].GetProperty("pIcdCode").GetString().Should().Be("I10");
        diagArray[0].GetProperty("pDescription").GetString().Should().Be("Essential (primary) hypertension");
        diagArray[0].GetProperty("pIsPrimary").GetBoolean().Should().BeTrue();

        // Verify Non-primary diagnoses
        diagArray[1].GetProperty("pIcdCode").GetString().Should().Be("E11.9");
        diagArray[1].GetProperty("pDescription").GetString().Should().Be("Type 2 diabetes mellitus without complications");
        diagArray[1].GetProperty("pIsPrimary").GetBoolean().Should().BeFalse();

        diagArray[2].GetProperty("pIcdCode").GetString().Should().Be("J45.909");
        diagArray[2].GetProperty("pDescription").GetString().Should().Be("Unspecified asthma, uncomplicated");
        diagArray[2].GetProperty("pIsPrimary").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public void YakapConsultationWireBuilder_ZeroDiagnoses_FailsValidation()
    {
        var builder = new YakapConsultationWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Alberto Ramos",
            EncounterDate = DateTime.UtcNow
        };

        var context = new YakapConsultationContext
        {
            Facility = facility,
            Patient = patient,
            Encounter = encounter,
            Diagnoses = new List<EncounterDiagnosis>() // Empty
        };

        var result = builder.BuildWirePayload(context);
        result.IsFailure.Should().BeTrue();
        result.Errors.Should().ContainMatch("*at least one diagnosis ICD-10 code*");
    }

    [Fact]
    public void YakapConsultationWireBuilder_NullSoapFieldsAndVitals_MapsEmptyStrings()
    {
        var builder = new YakapConsultationWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Alberto Ramos",
            EncounterDate = new DateTime(2026, 10, 28, 10, 0, 0, DateTimeKind.Utc),
            Subjective = string.Empty,
            Objective = string.Empty,
            Assessment = string.Empty,
            Plan = string.Empty,
            PhilHealthOtherComplaint = null
        };

        var context = new YakapConsultationContext
        {
            Facility = facility,
            Patient = patient,
            Encounter = encounter,
            Diagnoses = new List<EncounterDiagnosis>
            {
                new()
                {
                    ConsultationEncounterId = encounter.Id,
                    TenantId = patient.TenantId,
                    ClinicId = patient.ClinicId,
                    Icd10Code = "Z00.00",
                    Description = "General routine medical examination",
                    IsPrimary = true
                }
            },
            Vitals = null
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeTrue();

        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pSubjective").GetString().Should().Be(string.Empty);
        root.GetProperty("pObjective").GetString().Should().Be(string.Empty);
        root.GetProperty("pAssessment").GetString().Should().Be(string.Empty);
        root.GetProperty("pPlan").GetString().Should().Be(string.Empty);
        root.GetProperty("pChiefComplaint").GetString().Should().Be(string.Empty);
        root.TryGetProperty("pVitals", out _).Should().BeFalse();
    }

    // =========================================================================
    // SECTION 3: DIAGNOSTIC REQUESTS & RESULTS WIRE BUILDERS
    // =========================================================================

    [Fact]
    public void YakapDiagnosticRequestWireBuilder_NullOptionalFields_MapsCleanDefaults()
    {
        var builder = new YakapDiagnosticRequestWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            OrderNumber = "   ", // whitespace order number -> falls back to order.Id
            OrderDate = new DateTime(2026, 10, 28, 8, 0, 0, DateTimeKind.Utc),
            Notes = null,
            ClinicalDiagnosis = null,
            RequestingPhysicianPan = null
        };

        var items = new List<LabOrderItem>
        {
            new()
            {
                LabOrderId = order.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                PhilHealthServiceCode = null, // null PhilHealth code -> falls back to TestCode
                TestCode = "CBC-001",
                TestName = "Complete Blood Count",
                Category = "Hematology",
                RecommendationCode = null, // null -> defaults to ROUTINE
                Instructions = null,
                ResultRemarks = null
            }
        };

        var context = new YakapDiagnosticRequestContext
        {
            Facility = facility,
            Patient = patient,
            Order = order,
            Items = items
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeTrue();

        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pOrderNo").GetString().Should().Be(order.Id.ToString());
        root.GetProperty("pClinicalIndication").GetString().Should().Be(string.Empty);
        root.GetProperty("pDoctorPan").GetString().Should().Be(string.Empty);

        var itemArray = root.GetProperty("pItems");
        itemArray[0].GetProperty("pDiagnosticCode").GetString().Should().Be("CBC-001");
        itemArray[0].GetProperty("pUrgency").GetString().Should().Be("ROUTINE");
        itemArray[0].GetProperty("pNotes").GetString().Should().Be(string.Empty);
    }

    [Fact]
    public void YakapDiagnosticRequestWireBuilder_EmptyItems_ReturnsFailure()
    {
        var builder = new YakapDiagnosticRequestWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            OrderNumber = "ORD-001",
            OrderDate = new DateTime(2026, 10, 28, 8, 0, 0, DateTimeKind.Utc)
        };

        var context = new YakapDiagnosticRequestContext
        {
            Facility = facility,
            Patient = patient,
            Order = order,
            Items = new List<LabOrderItem>() // Empty
        };

        var result = builder.BuildWirePayload(context);
        result.IsFailure.Should().BeTrue();
        result.Errors.Should().ContainMatch("*at least one order item*");
    }

    [Fact]
    public void YakapDiagnosticResultsWireBuilder_ResultsOnlyWithoutObservations_Succeeds()
    {
        var builder = new YakapDiagnosticResultsWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            OrderNumber = "ORD-999"
        };

        var results = new List<LabResult>
        {
            new()
            {
                LabOrderId = order.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                FileName = "chest_xray.pdf",
                Verification = VerificationState.Verified,
                ReviewRemarks = "Normal chest findings"
            }
        };

        var context = new YakapDiagnosticResultsContext
        {
            Facility = facility,
            Patient = patient,
            Order = order,
            Observations = [],
            Results = results,
            DiagnosticPdfAttachmentBase64 = null
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeTrue();

        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pObservations").GetArrayLength().Should().Be(0);
        root.GetProperty("pResults").GetArrayLength().Should().Be(1);
        root.GetProperty("pResults")[0].GetProperty("pFileName").GetString().Should().Be("chest_xray.pdf");
        root.TryGetProperty("pPdfAttachment", out _).Should().BeFalse();
    }

    [Fact]
    public void YakapDiagnosticResultsWireBuilder_BothObservationsAndResultsEmpty_Fails()
    {
        var builder = new YakapDiagnosticResultsWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            OrderNumber = "ORD-000"
        };

        var context = new YakapDiagnosticResultsContext
        {
            Facility = facility,
            Patient = patient,
            Order = order,
            Observations = [],
            Results = []
        };

        var result = builder.BuildWirePayload(context);
        result.IsFailure.Should().BeTrue();
        result.Errors.Should().ContainMatch("*at least one observation or result*");
    }

    // =========================================================================
    // SECTION 4: GAMOT 29 VS 30 CHARACTER UPSC CODES (EXACT VALIDATION BOUNDARY)
    // =========================================================================

    [Theory]
    [InlineData("1234567890123456789012345678", false, "28 chars (<29) must fail")]
    [InlineData("MED-PARACETAMOL-500MG-0000001", true, "29 chars must pass")]
    [InlineData("MED-PARACETAMOL-500MG-00000001", true, "30 chars must pass")]
    [InlineData("1234567890123456789012345678901", false, "31 chars (>30) must fail")]
    [InlineData("SHORT", false, "5 chars (<29) must fail")]
    [InlineData("12345678901234567890123456789012345", false, "35 chars (>30) must fail")]
    [InlineData("", false, "Empty string must fail")]
    [InlineData("   ", false, "Whitespace must fail")]
    public void YakapMedicineWireBuilder_ExactUpscLengthBoundaries_EnforcedStrictly(
        string upscCode, bool shouldSucceed, string scenario)
    {
        // Arrange
        var builder = new YakapMedicineWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();

        var items = new List<PrescriptionItem>
        {
            new()
            {
                ConsultationEncounterId = Guid.NewGuid(),
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                GenericName = "Amoxicillin",
                PhilHealthDrugCode = upscCode,
                Quantity = 21,
                Dosage = "500 mg",
                Form = "Capsule",
                Sig = "Take 1 cap every 8 hours"
            }
        };

        var context = new YakapMedicineContext
        {
            Facility = facility,
            Patient = patient,
            Items = items
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        if (shouldSucceed)
        {
            result.IsSuccess.Should().BeTrue(because: scenario);
            using var doc = JsonDocument.Parse(result.Value!);
            doc.RootElement.GetProperty("pItems")[0].GetProperty("pDrugCode").GetString().Should().Be(upscCode.Trim());
        }
        else
        {
            result.IsFailure.Should().BeTrue(because: scenario);
            result.Errors.Should().ContainMatch("*29-30 character GAMOT UPSC drug code*");
        }
    }

    [Fact]
    public void YakapMedicineWireBuilder_CatalogLookupFallback_ValidatesBoundaries()
    {
        // Arrange
        var builder = new YakapMedicineWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();

        var mockLookup = Substitute.For<IPhilHealthCatalogLookup>();
        // Mock 29-char code returned from catalog
        const string valid29Char = "LIB-METFORMIN-500MG-TAB-00001"; // 29 chars
        valid29Char.Length.Should().Be(29);
        mockLookup.FindByDescription("lib_drugs", "Metformin")
            .Returns(new PhilHealthCatalogRecord("lib_drugs", valid29Char, "Metformin 500mg", true, null));

        var items = new List<PrescriptionItem>
        {
            new()
            {
                ConsultationEncounterId = Guid.NewGuid(),
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                GenericName = "Metformin",
                PhilHealthDrugCode = null, // null on entity, must resolve from lookup
                Quantity = 30,
                Dosage = "500 mg",
                Form = "Tablet",
                Sig = "Take 1 tab with meals"
            }
        };

        var context = new YakapMedicineContext
        {
            Facility = facility,
            Patient = patient,
            Items = items,
            CatalogLookup = mockLookup
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        doc.RootElement.GetProperty("pItems")[0].GetProperty("pDrugCode").GetString().Should().Be(valid29Char);
    }

    [Fact]
    public void YakapMedicineWireBuilder_CatalogLookupReturningInvalidLength_Fails()
    {
        // Arrange
        var builder = new YakapMedicineWireBuilder();
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();

        var mockLookup = Substitute.For<IPhilHealthCatalogLookup>();
        // Mock invalid 19-char code from catalog
        mockLookup.FindByDescription("lib_drugs", "Aspirin")
            .Returns(new PhilHealthCatalogRecord("lib_drugs", "ASPIRIN-100MG-TAB01", "Aspirin 100mg", true, null)); // 19 chars

        var items = new List<PrescriptionItem>
        {
            new()
            {
                ConsultationEncounterId = Guid.NewGuid(),
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                GenericName = "Aspirin",
                PhilHealthDrugCode = null,
                Quantity = 30,
                Dosage = "100 mg",
                Form = "Tablet",
                Sig = "Take 1 tab daily"
            }
        };

        var context = new YakapMedicineContext
        {
            Facility = facility,
            Patient = patient,
            Items = items,
            CatalogLookup = mockLookup
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Errors.Should().ContainMatch("*29-30 character GAMOT UPSC drug code*");
    }

    // =========================================================================
    // SECTION 5: DATE FORMAT REQUIREMENTS (PCAPI SPEC: ISO yyyy-MM-dd IN WIRE)
    // =========================================================================

    [Fact]
    public void AllFiveWireBuilders_OutputStrictIsoDate_NeverUsDate()
    {
        var facility = CreateFacility();
        var patient = CreateMinimalPatient();
        var fixedDate = new DateOnly(2026, 7, 4);

        // 1. FPE Wire Builder
        var fpeBuilder = new YakapFpeWireBuilder();
        var fpeContext = new YakapFpeContext
        {
            Facility = facility,
            Patient = patient,
            EffectiveDate = fixedDate,
            Immunizations = new List<PatientImmunization>
            {
                new()
                {
                    PatientId = patient.Id,
                    TenantId = patient.TenantId,
                    ClinicId = patient.ClinicId,
                    PatientName = $"{patient.FirstName} {patient.LastName}",
                    VaccineName = "BCG",
                    DoseSequence = 1,
                    AdministeredAtUtc = new DateTime(2026, 7, 4, 8, 30, 0, DateTimeKind.Utc)
                }
            }
        };
        var fpeResult = fpeBuilder.BuildWirePayload(fpeContext);
        fpeResult.IsSuccess.Should().BeTrue();
        using (var doc = JsonDocument.Parse(fpeResult.Value!))
        {
            var root = doc.RootElement;
            root.GetProperty("pPatientDob").GetString().Should().Be("1990-05-20");
            root.GetProperty("pEffectiveDate").GetString().Should().Be("2026-07-04");
            root.GetProperty("pImmunizations")[0].GetProperty("pDateAdministered").GetString().Should().Be("2026-07-04");

            // Verify none of them use MM/dd/yyyy format
            root.GetProperty("pPatientDob").GetString().Should().NotMatchRegex(@"^\d{2}/\d{2}/\d{4}$");
            root.GetProperty("pEffectiveDate").GetString().Should().NotMatchRegex(@"^\d{2}/\d{2}/\d{4}$");
        }

        // 2. Consultation Wire Builder
        var consultBuilder = new YakapConsultationWireBuilder();
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Alberto Ramos",
            EncounterDate = new DateTime(2026, 7, 4, 15, 45, 30, DateTimeKind.Utc)
        };
        var consultContext = new YakapConsultationContext
        {
            Facility = facility,
            Patient = patient,
            Encounter = encounter,
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Icd10Code = "I10", Description = "HTN", IsPrimary = true }
            }
        };
        var consultResult = consultBuilder.BuildWirePayload(consultContext);
        consultResult.IsSuccess.Should().BeTrue();
        using (var doc = JsonDocument.Parse(consultResult.Value!))
        {
            var root = doc.RootElement;
            root.GetProperty("pConsultDate").GetString().Should().Be("2026-07-04");
            root.GetProperty("pConsultTime").GetString().Should().Be("15:45:30");
            root.GetProperty("pConsultDate").GetString().Should().NotMatchRegex(@"^\d{2}/\d{2}/\d{4}$");
        }

        // 3. Diagnostic Request Wire Builder
        var diagReqBuilder = new YakapDiagnosticRequestWireBuilder();
        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            OrderNumber = "ORD-001",
            OrderDate = new DateTime(2026, 7, 4, 0, 0, 0, DateTimeKind.Utc),
            Items = new List<LabOrderItem>
            {
                new() { TestCode = "FBS", TestName = "Fasting Blood Sugar", Category = "Clinical Chemistry" }
            }
        };
        var diagReqResult = diagReqBuilder.BuildWirePayload(new YakapDiagnosticRequestContext
        {
            Facility = facility,
            Patient = patient,
            Order = order
        });
        diagReqResult.IsSuccess.Should().BeTrue();
        using (var doc = JsonDocument.Parse(diagReqResult.Value!))
        {
            doc.RootElement.GetProperty("pOrderDate").GetString().Should().Be("2026-07-04");
            doc.RootElement.GetProperty("pOrderDate").GetString().Should().NotMatchRegex(@"^\d{2}/\d{2}/\d{4}$");
        }

        // 4. Diagnostic Results Wire Builder
        var diagResBuilder = new YakapDiagnosticResultsWireBuilder();
        var diagResResult = diagResBuilder.BuildWirePayload(new YakapDiagnosticResultsContext
        {
            Facility = facility,
            Patient = patient,
            Order = order,
            ResultDate = fixedDate,
            Observations = new List<LabObservation>
            {
                new()
                {
                    AnalyteCode = "GLU",
                    AnalyteName = "Glucose",
                    ValueText = "100",
                    CreatedAt = new DateTime(2026, 7, 4, 10, 0, 0, DateTimeKind.Utc)
                }
            }
        });
        diagResResult.IsSuccess.Should().BeTrue();
        using (var doc = JsonDocument.Parse(diagResResult.Value!))
        {
            doc.RootElement.GetProperty("pResultDate").GetString().Should().Be("2026-07-04");
            doc.RootElement.GetProperty("pObservations")[0].GetProperty("pPerformedAt").GetString().Should().Be("2026-07-04 10:00:00");
            doc.RootElement.GetProperty("pResultDate").GetString().Should().NotMatchRegex(@"^\d{2}/\d{2}/\d{4}$");
        }

        // 5. Medicine Wire Builder
        var medBuilder = new YakapMedicineWireBuilder();
        const string validUpsc = "MED-METFORMIN-500MG-TAB-000001";
        var medResult = medBuilder.BuildWirePayload(new YakapMedicineContext
        {
            Facility = facility,
            Patient = patient,
            PrescriptionDate = fixedDate,
            Items = new List<PrescriptionItem>
            {
                new()
                {
                    GenericName = "Metformin",
                    PhilHealthDrugCode = validUpsc,
                    Quantity = 30,
                    Dosage = "500 mg",
                    Form = "Tablet",
                    Sig = "Take 1 daily"
                }
            }
        });
        medResult.IsSuccess.Should().BeTrue();
        using (var doc = JsonDocument.Parse(medResult.Value!))
        {
            doc.RootElement.GetProperty("pPrescriptionDate").GetString().Should().Be("2026-07-04");
            doc.RootElement.GetProperty("pPrescriptionDate").GetString().Should().NotMatchRegex(@"^\d{2}/\d{2}/\d{4}$");
        }
    }

    // =========================================================================
    // SECTION 6: ANNEX C ENCRYPTION - MANUAL NULL-BYTE PADDING ROUND-TRIP
    // =========================================================================

    [Theory]
    [InlineData(1, 15, 16)]   // 1 byte: 15 null bytes added -> 16 bytes ciphertext
    [InlineData(2, 14, 16)]   // 2 bytes: 14 null bytes added -> 16 bytes ciphertext
    [InlineData(7, 9, 16)]    // 7 bytes: 9 null bytes added -> 16 bytes ciphertext
    [InlineData(15, 1, 16)]   // 15 bytes: 1 null byte added -> 16 bytes ciphertext
    [InlineData(16, 0, 16)]   // 16 bytes: 0 null bytes added -> exact 16 bytes ciphertext!
    [InlineData(17, 15, 32)]  // 17 bytes: 15 null bytes added -> 32 bytes ciphertext
    [InlineData(31, 1, 32)]   // 31 bytes: 1 null byte added -> 32 bytes ciphertext
    [InlineData(32, 0, 32)]   // 32 bytes: 0 null bytes added -> exact 32 bytes ciphertext!
    [InlineData(48, 0, 48)]   // 48 bytes: 0 null bytes added -> exact 48 bytes ciphertext!
    [InlineData(64, 0, 64)]   // 64 bytes: 0 null bytes added -> exact 64 bytes ciphertext!
    [InlineData(127, 1, 128)] // 127 bytes: 1 null byte added -> 128 bytes ciphertext
    [InlineData(128, 0, 128)] // 128 bytes: 0 null bytes added -> exact 128 bytes ciphertext!
    public void PhilHealthPayloadEncryptor_NullByteManualPadding_VariedBlockSizes_RoundTrips(
        int plainLength, int expectedPadBytes, int expectedCipherLength)
    {
        // Arrange: Generate deterministic pseudo-random non-zero ASCII bytes
        var plainBytes = new byte[plainLength];
        for (int i = 0; i < plainLength; i++)
        {
            // Non-zero printable ASCII character (range 65 'A' to 90 'Z')
            plainBytes[i] = (byte)(65 + (i % 26));
        }

        // Act: Encrypt
        var envelope = _encryptor.EncryptBytes(plainBytes, "application/json", TestCipherKey);
        var cipherBytes = Convert.FromBase64String(envelope.Doc);

        // Assert: Length check
        cipherBytes.Length.Should().Be(expectedCipherLength,
            because: $"plain length {plainLength} with {expectedPadBytes} padding bytes must yield {expectedCipherLength} cipher bytes");

        // Act: Decrypt
        var decryptedBytes = _encryptor.DecryptBytes(envelope, TestCipherKey);

        // Assert: Exact recovery of unpadded bytes
        decryptedBytes.Length.Should().Be(plainLength);
        decryptedBytes.Should().Equal(plainBytes);
    }

    // =========================================================================
    // SECTION 7: ANNEX C ENCRYPTION - TAMPERED CIPHERTEXT & IV REJECTION
    // =========================================================================

    [Theory]
    [InlineData(0, "Tampering first byte of IV")]
    [InlineData(7, "Tampering middle byte of IV")]
    [InlineData(15, "Tampering last byte of IV")]
    public void PhilHealthPayloadEncryptor_TamperedIv_RejectsWithCryptographicException(
        int byteIndexToFlip, string scenario)
    {
        // Arrange
        const string plainJson = "{\"pHciAccreNo\":\"H91000001\",\"pSecret\":\"Sensitive Clinical Data\"}";
        var envelope = _encryptor.EncryptJson(plainJson, TestCipherKey);

        // Corrupt IV
        var ivBytes = Convert.FromBase64String(envelope.Iv);
        ivBytes[byteIndexToFlip] ^= 0xAA; // flip bits
        var tamperedEnvelope = envelope with { Iv = Convert.ToBase64String(ivBytes) };

        // Act & Assert: Must throw CryptographicException due to payload integrity hash failure
        var act = () => _encryptor.DecryptJson(tamperedEnvelope, TestCipherKey);
        act.Should().Throw<CryptographicException>(because: scenario)
            .WithMessage("*Payload integrity check failed*");
    }

    [Theory]
    [InlineData(0, "Tampering first ciphertext block")]
    [InlineData(16, "Tampering second ciphertext block")]
    [InlineData(31, "Tampering last byte of ciphertext")]
    public void PhilHealthPayloadEncryptor_CorruptedCiphertextBytes_RejectsWithCryptographicException(
        int byteIndexToFlip, string scenario)
    {
        // Arrange: 32+ bytes payload to span multiple AES-CBC blocks
        const string plainJson = "{\"pHciAccreNo\":\"H91000001\",\"pHciCaseNo\":\"C202610280001\",\"data\":\"Payload block test\"}";
        var envelope = _encryptor.EncryptJson(plainJson, TestCipherKey);

        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        cipherBytes[byteIndexToFlip % cipherBytes.Length] ^= 0xFF;
        var tamperedEnvelope = envelope with { Doc = Convert.ToBase64String(cipherBytes) };

        // Act & Assert
        var act = () => _encryptor.DecryptJson(tamperedEnvelope, TestCipherKey);
        act.Should().Throw<CryptographicException>(because: scenario)
            .WithMessage("*Payload integrity check failed*");
    }

    [Fact]
    public void PhilHealthPayloadEncryptor_TamperedPayloadHash_ThrowsCryptographicException()
    {
        // Arrange: Valid ciphertext, but hash property altered
        const string plainJson = "{\"clinicalNote\":\"Normal exam\"}";
        var envelope = _encryptor.EncryptJson(plainJson, TestCipherKey);

        // Replace valid hash with a fake SHA-256
        var fakeHash = new string('0', 64);
        var tamperedEnvelope = envelope with { Hash = fakeHash };

        // Act & Assert
        var act = () => _encryptor.DecryptJson(tamperedEnvelope, TestCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*Payload integrity check failed*");
    }

    [Fact]
    public void PhilHealthPayloadEncryptor_TruncatedCiphertext_ThrowsCryptographicException()
    {
        // Arrange
        const string plainJson = "{\"message\":\"Full payload\"}";
        var envelope = _encryptor.EncryptJson(plainJson, TestCipherKey);

        // Truncate doc by 1 byte (making it not a multiple of 16)
        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        var truncated = cipherBytes[..^1];
        var tamperedEnvelope = envelope with { Doc = Convert.ToBase64String(truncated) };

        // Act & Assert
        var act = () => _encryptor.DecryptJson(tamperedEnvelope, TestCipherKey);
        act.Should().Throw<CryptographicException>();
    }

    // =========================================================================
    // SECTION 8: PDF %%EOF MARKER ENFORCEMENT
    // =========================================================================

    [Fact]
    public void PhilHealthPayloadEncryptor_ValidPdf_WithTrailingWhitespace_RoundTripsSuccessfully()
    {
        // Arrange: Valid PDF ending with %%EOF and trailing newlines/spaces
        var pdfContent = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n99\n%%EOF\r\n\n  ";
        var pdfBytes = Encoding.ASCII.GetBytes(pdfContent);

        // Act
        var envelope = _encryptor.EncryptBytes(pdfBytes, "application/pdf", TestCipherKey);
        var decrypted = _encryptor.DecryptPdf(envelope, TestCipherKey);

        // Assert
        decrypted.Should().Equal(pdfBytes);
        Encoding.ASCII.GetString(decrypted).Should().Contain("%%EOF");
    }

    [Fact]
    public void PhilHealthPayloadEncryptor_MissingPdfEofMarker_ThrowsCryptographicException()
    {
        // Arrange: Payload encrypted as application/pdf, but lacking the %%EOF marker
        var nonPdfContent = "This is a corrupted document or text report without any PDF trailer marker.";
        var nonPdfBytes = Encoding.ASCII.GetBytes(nonPdfContent);

        var envelope = _encryptor.EncryptBytes(nonPdfBytes, "application/pdf", TestCipherKey);

        // Act & Assert: DecryptPdf must detect missing %%EOF and throw CryptographicException
        var act = () => _encryptor.DecryptPdf(envelope, TestCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*missing mandatory %%EOF marker*");
    }

    [Fact]
    public void PhilHealthPayloadEncryptor_PdfEofMarkerBuriedFarFromEnd_ThrowsCryptographicException()
    {
        // Arrange: PDF %%EOF marker is present, but buried >1024 bytes before end of file
        var sb = new StringBuilder();
        sb.Append("%PDF-1.4\n%%EOF\n");
        sb.Append(new string('X', 1200)); // 1200 bytes of trailing garbage
        var corruptedPdfBytes = Encoding.ASCII.GetBytes(sb.ToString());

        var envelope = _encryptor.EncryptBytes(corruptedPdfBytes, "application/pdf", TestCipherKey);

        // Act & Assert: DecryptPdf inspects the last 1024 bytes; since %%EOF is outside, it must throw
        var act = () => _encryptor.DecryptPdf(envelope, TestCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*missing mandatory %%EOF marker*");
    }
}
