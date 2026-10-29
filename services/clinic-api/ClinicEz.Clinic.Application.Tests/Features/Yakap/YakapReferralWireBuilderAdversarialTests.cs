using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

/// <summary>
/// Empirical Adversarial Stress-Testing Suite for YakapReferralWireBuilder (PCAPI v2.0 Annex F).
/// Rigorously challenges:
/// 1. Dependent (DD) vs Member (MM) guardian rules (strictly required for DD, strictly omitted for MM)
/// 2. Conditional referral types (01: Specialist, 02: Primary Care, 03: Facility, 99: Others, and multi-type combos)
/// 3. AES-256-CBC encryption round-trip with Annex C 0x00 null-byte padding boundaries and tampering defenses
/// 4. Physician credentials, diagnostic requirements, and age/transaction formatting boundaries
/// </summary>
public sealed class YakapReferralWireBuilderAdversarialTests
{
    private const string TestCipherKey = "0123456789abcdef0123456789abcdef";
    private readonly YakapReferralWireBuilder _builder = new();
    private readonly IPhilHealthPayloadEncryptor _encryptor = new PhilHealthPayloadEncryptor();

    private static FacilitySettings CreateFacility(string accreNo = "H91000001") => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-adv",
        ClinicId = Guid.NewGuid(),
        ClinicName = "Metro Health Referral Hub",
        AccreditationNumber = accreNo,
        PmccNumber = "123456",
        SoftwareCertificateId = "CERT-REF-001"
    };

    private static Patient CreatePatient(string pin = "12-345678901-2", PhilHealthMemberType memberType = PhilHealthMemberType.MM)
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-adv",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-REF-0001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            MiddleName = "Protacio",
            Suffix = "Jr.",
            DateOfBirth = new DateOnly(1995, 8, 20),
            Sex = BiologicalSex.Male,
            CivilStatus = CivilStatus.Single,
            ContactNumber = "09171234567",
            Email = "juan.delacruz@example.ph",
            PhilHealthNumber = pin
        };

        patient.PhilHealthMembership = new PatientPhilHealthMembership
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            MemberType = memberType,
            MemberPin = "123456789012",
            PrincipalMemberPin = memberType == PhilHealthMemberType.DD ? "987654321012" : null
        };

        return patient;
    }

    private static PatientGuardian CreateGuardian(Patient patient) => new()
    {
        PatientId = patient.Id,
        TenantId = patient.TenantId,
        ClinicId = patient.ClinicId,
        FirstName = "Maria Clara",
        LastName = "Santos",
        Sex = BiologicalSex.Female,
        BirthDate = new DateOnly(1975, 4, 12),
        ContactNumber = "09181234567",
        RelationshipCode = "MTH", // Mother (LIB-067)
        PhilHealthPin = "987654321012"
    };

    private static ReferralLetter CreateValidReferral(Patient patient, string referralTypes = "01") => new()
    {
        Id = Guid.NewGuid(),
        TenantId = patient.TenantId,
        ClinicId = patient.ClinicId,
        PatientId = patient.Id,
        PatientName = $"{patient.FirstName} {patient.LastName}",
        ReferralNumber = "REF-20261028-9999",
        ReferralDate = new DateOnly(2026, 10, 28),
        ReferringDoctorId = Guid.NewGuid(),
        ReferringDoctorName = "Dr. Jose Rizal",
        ReferringDoctorPrcNumber = "1234567",
        ReferringDoctorPhilHealthPan = "PAN-123456",
        ReferredToFacility = "National Kidney and Transplant Institute",
        ReferredDepartment = "Nephrology",
        SpecialistType = "Nephrology",
        ReasonForReferral = "Evaluation for persistent microalbuminuria and hypertension",
        ProvisionalDiagnosis = "Hypertensive Nephrosclerosis",
        ClinicalSummary = "Detailed clinical summary and workup findings.",
        ReferralTypeCodes = referralTypes
    };

    // =========================================================================
    // SECTION 1: DEPENDENT (DD) VS MEMBER (MM) GUARDIAN RULES
    // =========================================================================

    [Fact]
    public void Challenge_Dependent_WithoutGuardian_StrictlyFailsValidation()
    {
        // Arrange: Dependent patient (DD) with null guardian on both context and patient entity
        var patient = CreatePatient(memberType: PhilHealthMemberType.DD);
        patient.Guardians.Clear();

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = null
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert: Must reject payload with explicit dependent guardian error
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Guardian information is required for dependent patients (patient_type = DD)", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("", "Santos", "Guardian full name is required")]
    [InlineData("   ", "Santos", "Guardian full name is required")]
    [InlineData("Maria", "", "Guardian full name is required")]
    [InlineData("Maria", "   ", "Guardian full name is required")]
    public void Challenge_Dependent_GuardianWithIncompleteName_StrictlyFailsValidation(
        string firstName, string lastName, string expectedErrorSubstring)
    {
        // Arrange
        var patient = CreatePatient(memberType: PhilHealthMemberType.DD);
        var guardian = CreateGuardian(patient);
        guardian.FirstName = firstName;
        guardian.LastName = lastName;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = guardian
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains(expectedErrorSubstring, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_Dependent_GuardianMissingBirthDate_StrictlyFailsValidation()
    {
        // Arrange
        var patient = CreatePatient(memberType: PhilHealthMemberType.DD);
        var guardian = CreateGuardian(patient);
        guardian.BirthDate = null;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = guardian
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Guardian birth date is required for dependent patients", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Challenge_Dependent_GuardianMissingContactNumber_StrictlyFailsValidation(string contact)
    {
        // Arrange
        var patient = CreatePatient(memberType: PhilHealthMemberType.DD);
        var guardian = CreateGuardian(patient);
        guardian.ContactNumber = contact;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = guardian
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Guardian contact number is required for dependent patients", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Challenge_Dependent_GuardianMissingRelationshipCode_StrictlyFailsValidation(string relCode)
    {
        // Arrange
        var patient = CreatePatient(memberType: PhilHealthMemberType.DD);
        var guardian = CreateGuardian(patient);
        guardian.RelationshipCode = relCode;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = guardian
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Guardian relationship code is required for dependent patients", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_Dependent_WithValidGuardian_IncludesBothGuardianAndPGuardianBlocks()
    {
        // Arrange
        var patient = CreatePatient(memberType: PhilHealthMemberType.DD);
        var guardian = CreateGuardian(patient);

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = guardian,
            ReferralDate = new DateOnly(2026, 10, 28)
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;

        root.GetProperty("pPatientType").GetString().Should().Be("DD");

        // 1. Root pGuardian object verification
        root.TryGetProperty("pGuardian", out var pGuardian).Should().BeTrue();
        pGuardian.GetProperty("pGuardianName").GetString().Should().Be("Maria Clara Santos");
        pGuardian.GetProperty("pGuardianAge").GetInt32().Should().Be(51); // 1975-04-12 as of 2026-10-28 = 51 yrs
        pGuardian.GetProperty("pGuardianSex").GetString().Should().Be("F");
        pGuardian.GetProperty("pGuardianBirthday").GetString().Should().Be("1975-04-12");
        pGuardian.GetProperty("pGuardianContactNo").GetString().Should().Be("09181234567");
        pGuardian.GetProperty("pGuardianRelationship").GetString().Should().Be("MTH");
        pGuardian.GetProperty("pGuardianPin").GetString().Should().Be("987654321012");

        // 2. Annex F nested guardian object verification
        root.TryGetProperty("guardian", out var guardianBlock).Should().BeTrue();
        guardianBlock.GetProperty("guardian_name").GetString().Should().Be("Maria Clara Santos");
        guardianBlock.GetProperty("guardian_age").GetInt32().Should().Be(51);
        guardianBlock.GetProperty("guardian_sex").GetString().Should().Be("F");
        guardianBlock.GetProperty("guardian_birthday").GetString().Should().Be("04/12/1975");
        guardianBlock.GetProperty("guardian_contact_no").GetString().Should().Be("09181234567");
        guardianBlock.GetProperty("guardian_relationship").GetString().Should().Be("MTH");
        guardianBlock.GetProperty("guardian_pin").GetString().Should().Be("987654321012");
    }

    [Fact]
    public void Challenge_PrincipalMemberMM_StrictlyOmitsGuardianAndPGuardianBlocks_EvenIfGuardianSupplied()
    {
        // Arrange: Principal member (MM) with a guardian entity accidentally attached
        var patient = CreatePatient(memberType: PhilHealthMemberType.MM);
        var guardian = CreateGuardian(patient);

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = guardian, // Provided on context
            PatientType = "MM"
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;

        root.GetProperty("pPatientType").GetString().Should().Be("MM");

        // Guardian blocks MUST NOT exist in payload for principal members
        root.TryGetProperty("pGuardian", out _).Should().BeFalse("pGuardian MUST be omitted for MM members");
        root.TryGetProperty("guardian", out _).Should().BeFalse("guardian block MUST be omitted for MM members");

        // Raw JSON text check
        result.Value.Should().NotContain("\"guardian\"");
        result.Value.Should().NotContain("\"pGuardian\"");
    }

    [Theory]
    [InlineData("mm", "MM", false)]
    [InlineData("MM", "MM", false)]
    [InlineData("dd", "DD", true)]
    [InlineData("DD", "DD", true)]
    public void Challenge_PatientType_CaseInsensitiveResolution(
        string inputType, string expectedNormalizedType, bool expectGuardianBlock)
    {
        // Arrange
        var patient = CreatePatient();
        var guardian = CreateGuardian(patient);

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient),
            Guardian = guardian,
            PatientType = inputType
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;

        root.GetProperty("pPatientType").GetString().Should().Be(expectedNormalizedType);
        root.TryGetProperty("guardian", out _).Should().Be(expectGuardianBlock);
        root.TryGetProperty("pGuardian", out _).Should().Be(expectGuardianBlock);
    }

    // =========================================================================
    // SECTION 2: CONDITIONAL REFERRAL TYPES (01, 02, 03, 99)
    // =========================================================================

    [Theory]
    [InlineData(null, null)]
    [InlineData("", "")]
    [InlineData("   ", "   ")]
    public void Challenge_ReferralType01_MissingSpecialist_StrictlyFailsValidation(
        string? specialistType, string? referredDept)
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "01");
        referral.SpecialistType = specialistType;
        referral.ReferredDepartment = referredDept!;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Referral specialist is required when referral type includes 01", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_ReferralType01_OtherSpecialist_MissingOtherSpecify_StrictlyFailsValidation()
    {
        // Arrange: Type 01 with specialist named "Other Specialist", but SpecialistOtherSpecify is blank
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "01");
        referral.SpecialistType = "Other Specialist";
        referral.SpecialistOtherSpecify = "   ";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Specialist other specify is required when referral specialist is 'Other Specialist'", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_ReferralType01_OtherSpecialist_CaseInsensitive_WithOtherSpecify_Succeeds()
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "01");
        referral.SpecialistType = "other specialist";
        referral.SpecialistOtherSpecify = "Pediatric Gastroenterologist";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pReferralSpecialist").GetString().Should().Be("other specialist");
        root.GetProperty("pReferralSpecialistOtherSpec").GetString().Should().Be("Pediatric Gastroenterologist");
    }

    [Fact]
    public void Challenge_ReferralType01_SpecialistFallbackToReferredDepartment_Succeeds()
    {
        // Arrange: SpecialistType is null, but ReferredDepartment is "Cardiology"
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "01");
        referral.SpecialistType = null;
        referral.ReferredDepartment = "Cardiology";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pReferralSpecialist").GetString().Should().Be("Cardiology");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Challenge_ReferralType02_MissingPrimaryCareServices_StrictlyFailsValidation(string? primaryCareServices)
    {
        // Arrange: Type 02 (LIB-064 Primary Care Services) without primary care service codes
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "02");
        referral.PrimaryCareServiceCodes = primaryCareServices;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Referral primary care services are required when referral type includes 02 (LIB-064)", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_ReferralType02_WithPrimaryCareServices_Succeeds()
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "02");
        referral.PrimaryCareServiceCodes = "PC01,PC03";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pReferralType").GetString().Should().Be("02");
        root.GetProperty("pReferralPrimaryCareServices").GetString().Should().Be("PC01,PC03");
        root.GetProperty("referral").GetProperty("referral_primary_care_services").GetString().Should().Be("PC01,PC03");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Challenge_ReferralType03_MissingFacilityServices_StrictlyFailsValidation(string? facilityServices)
    {
        // Arrange: Type 03 (LIB-065 Facility Services) without facility service codes
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "03");
        referral.FacilityServiceCodes = facilityServices;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Referral facility service is required when referral type includes 03 (LIB-065)", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_ReferralType03_WithFacilityServices_Succeeds()
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "03");
        referral.FacilityServiceCodes = "FS01,FS02";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pReferralType").GetString().Should().Be("03");
        root.GetProperty("pReferralFacilityService").GetString().Should().Be("FS01,FS02");
        root.GetProperty("referral").GetProperty("referral_facility_service").GetString().Should().Be("FS01,FS02");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Challenge_ReferralType99_MissingOthersSpecify_StrictlyFailsValidation(string? othersSpecify)
    {
        // Arrange: Type 99 (Others) without explanation
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "99");
        referral.OthersSpecify = othersSpecify;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Referral others specify is required when referral type includes 99 (Others)", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_ReferralType99_WithOthersSpecify_Succeeds()
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "99");
        referral.OthersSpecify = "Holistic and alternative acupuncture therapy consultation";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pReferralType").GetString().Should().Be("99");
        root.GetProperty("pReferralOthersSpec").GetString().Should().Be("Holistic and alternative acupuncture therapy consultation");
        root.GetProperty("referral").GetProperty("referral_others_spec").GetString().Should().Be("Holistic and alternative acupuncture therapy consultation");
    }

    [Fact]
    public void Challenge_MultiTypeReferral_AggregatesAllValidationFailures()
    {
        // Arrange: Referral with types "01, 02, 03, 99" where all required details are missing
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "01, 02, 03, 99");
        referral.SpecialistType = null;
        referral.ReferredDepartment = "";
        referral.PrimaryCareServiceCodes = null;
        referral.FacilityServiceCodes = null;
        referral.OthersSpecify = null;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert: Must capture all 4 failure modes simultaneously
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("specialist is required when referral type includes 01", StringComparison.OrdinalIgnoreCase));
        result.Errors.Should().Contain(e => e.Contains("primary care services are required when referral type includes 02", StringComparison.OrdinalIgnoreCase));
        result.Errors.Should().Contain(e => e.Contains("facility service is required when referral type includes 03", StringComparison.OrdinalIgnoreCase));
        result.Errors.Should().Contain(e => e.Contains("others specify is required when referral type includes 99", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_MultiTypeReferral_WithAllDetailsSupplied_Succeeds()
    {
        // Arrange: Multi-type "01,02,03,99" with all required fields fully populated
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: "01, 02, 03, 99");
        referral.SpecialistType = "Pulmonology";
        referral.PrimaryCareServiceCodes = "PC01";
        referral.FacilityServiceCodes = "FS03";
        referral.OthersSpecify = "Comprehensive pulmonary rehab";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pReferralType").GetString().Should().Be("01, 02, 03, 99");
        root.GetProperty("pReferralSpecialist").GetString().Should().Be("Pulmonology");
        root.GetProperty("pReferralPrimaryCareServices").GetString().Should().Be("PC01");
        root.GetProperty("pReferralFacilityService").GetString().Should().Be("FS03");
        root.GetProperty("pReferralOthersSpec").GetString().Should().Be("Comprehensive pulmonary rehab");
    }

    [Theory]
    [InlineData("04")] // Mental Health
    [InlineData("05")] // Family Planning
    [InlineData("06")] // Developmental Pediatrician
    [InlineData("07")] // Palliative Care
    [InlineData("08")] // Dental
    public void Challenge_NonConditionalReferralTypes_DoNotRequireSpecialistOrServices(string typeCode)
    {
        // Arrange: Types that do not trigger 01, 02, 03, or 99 conditional validations
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient, referralTypes: typeCode);
        referral.SpecialistType = null;
        referral.PrimaryCareServiceCodes = null;
        referral.FacilityServiceCodes = null;
        referral.OthersSpecify = null;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pReferralType").GetString().Should().Be(typeCode);
    }

    // =========================================================================
    // SECTION 3: AES-256-CBC ENCRYPTION ROUND-TRIP & ANNEX C NULL-BYTE PADDING
    // =========================================================================

    [Fact]
    public void Challenge_EncryptionRoundTrip_DecryptedContentMatchesWireJsonExactly()
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient);
        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral
        };

        // Act 1: Build plain wire JSON
        var plainResult = _builder.BuildWirePayload(context);
        plainResult.IsSuccess.Should().BeTrue();
        var plainJson = plainResult.Value!;

        // Act 2: Build encrypted payload
        var encResult = _builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        encResult.IsSuccess.Should().BeTrue();
        var envelope = encResult.Value!;

        // Act 3: Decrypt envelope
        var decryptedJson = _encryptor.DecryptJson(envelope, TestCipherKey);

        // Assert
        decryptedJson.Should().Be(plainJson);

        // Assert Envelope Anatomy
        envelope.DocMimeType.Should().Be("application/json");
        envelope.Key1.Should().BeEmpty();
        envelope.Key2.Should().BeEmpty();
        Convert.FromBase64String(envelope.Iv).Length.Should().Be(16);
        (Convert.FromBase64String(envelope.Doc).Length % 16).Should().Be(0);

        // Verify Hash is SHA-256 of plain bytes
        var expectedHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plainJson))).ToLowerInvariant();
        envelope.Hash.Should().Be(expectedHash);
    }

    [Theory]
    [InlineData(16)]  // Exact multiple of 16 (0 bytes padding added)
    [InlineData(32)]  // Exact multiple of 16 (0 bytes padding added)
    [InlineData(48)]  // Exact multiple of 16 (0 bytes padding added)
    [InlineData(17)]  // Remainder 1 (15 null bytes added)
    [InlineData(31)]  // Remainder 15 (1 null byte added)
    [InlineData(25)]  // Remainder 9 (7 null bytes added)
    [InlineData(100)] // Arbitrary boundary
    public void Challenge_AnnexC_NullBytePadding_ExactMultiplesAndRemainders(int textLength)
    {
        // Arrange: Generate string of exact byte length
        var rawText = new string('A', textLength);
        var plainBytes = Encoding.UTF8.GetBytes(rawText);

        // Act: Encrypt
        var envelope = _encryptor.EncryptBytes(plainBytes, "application/json", TestCipherKey);

        // Verify ciphertext length is strictly multiple of 16
        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        (cipherBytes.Length % 16).Should().Be(0);

        // Verify SHA-256 pre-padding hash
        var expectedHash = Convert.ToHexString(SHA256.HashData(plainBytes)).ToLowerInvariant();
        envelope.Hash.Should().Be(expectedHash);

        // Act: Decrypt
        var decryptedBytes = _encryptor.DecryptBytes(envelope, TestCipherKey);

        // Assert: Unpadded bytes match raw bytes exactly
        decryptedBytes.Should().Equal(plainBytes);
        Encoding.UTF8.GetString(decryptedBytes).Should().Be(rawText);
    }

    [Fact]
    public void Challenge_BuildEncryptedPayload_WhenValidationFails_ReturnsFailureWithoutEncrypting()
    {
        // Arrange: Invalid context (missing accreditation number)
        var facility = CreateFacility();
        facility.AccreditationNumber = "";
        var patient = CreatePatient();

        var context = new YakapReferralContext
        {
            Facility = facility,
            Patient = patient,
            Referral = CreateValidReferral(patient)
        };

        // Act
        var result = _builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("accreditation number is required", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_TamperedCiphertext_ThrowsCryptographicException()
    {
        // Arrange
        var patient = CreatePatient();
        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient)
        };

        var encResult = _builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        var envelope = encResult.Value!;

        // Tamper with middle block of ciphertext
        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        cipherBytes[cipherBytes.Length / 2] ^= 0xFF;
        var tamperedEnvelope = envelope with { Doc = Convert.ToBase64String(cipherBytes) };

        // Act & Assert
        var act = () => _encryptor.DecryptJson(tamperedEnvelope, TestCipherKey);
        act.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void Challenge_TamperedHash_ThrowsCryptographicException()
    {
        // Arrange
        var patient = CreatePatient();
        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient)
        };

        var encResult = _builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        var envelope = encResult.Value!;

        // Tamper with integrity hash
        var tamperedEnvelope = envelope with { Hash = "0000000000000000000000000000000000000000000000000000000000000000" };

        // Act & Assert
        var act = () => _encryptor.DecryptJson(tamperedEnvelope, TestCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*Payload integrity check failed*");
    }

    [Fact]
    public void Challenge_IncorrectCipherKey_ThrowsCryptographicException()
    {
        // Arrange
        var patient = CreatePatient();
        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = CreateValidReferral(patient)
        };

        var encResult = _builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        var envelope = encResult.Value!;

        // Act & Assert: Decrypt with wrong cipher key
        var act = () => _encryptor.DecryptJson(envelope, "wrong-key-99999999999999999999");
        act.Should().Throw<CryptographicException>();
    }

    // =========================================================================
    // SECTION 4: DOCTOR CREDENTIALS, DIAGNOSIS, AND AGE/TRANSACTION FORMATTING
    // =========================================================================

    [Theory]
    [InlineData("", "1234567", "PAN-001", "Referring physician name is required")]
    [InlineData("Dr. Rizal", "", "PAN-001", "Referring physician PRC license number is required")]
    [InlineData("Dr. Rizal", "1234567", "", "Referring physician PhilHealth accreditation number (PAN) is required")]
    public void Challenge_PhysicianCredentials_MissingFields_FailsValidation(
        string doctorName, string prc, string pan, string expectedError)
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient);
        referral.ReferringDoctorName = doctorName;
        referral.ReferringDoctorPrcNumber = prc;
        referral.ReferringDoctorPhilHealthPan = pan;

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral,
            DoctorPan = null,
            DoctorPrc = null
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains(expectedError, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_PhysicianCredentials_OverrideHierarchy_ContextOverridesReferralAndEncounter()
    {
        // Arrange: Context values should override referral entity and encounter
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient);
        referral.ReferringDoctorPhilHealthPan = "PAN-REF";
        referral.ReferringDoctorPrcNumber = "PRC-REF";

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            DoctorPhilHealthPan = "PAN-ENC",
            DoctorPrcLicense = "PRC-ENC"
        };

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral,
            Encounter = encounter,
            DoctorPan = "PAN-OVERRIDE",
            DoctorPrc = "PRC-OVERRIDE"
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pDoctorPan").GetString().Should().Be("PAN-OVERRIDE");
        root.GetProperty("pDoctorPrc").GetString().Should().Be("PRC-OVERRIDE");
        root.GetProperty("physiciansignoff").GetProperty("physician_accre_no").GetString().Should().Be("PAN-OVERRIDE");
        root.GetProperty("physiciansignoff").GetProperty("physician_license_no").GetString().Should().Be("PRC-OVERRIDE");
    }

    [Fact]
    public void Challenge_MissingBothDiagnosisAndIcd10_StrictlyFailsValidation()
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient);
        referral.ProvisionalDiagnosis = "";

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral,
            Diagnoses = null,
            Encounter = null
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Referral must contain a provisional diagnosis or ICD-10 code", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Challenge_Diagnosis_PrimaryIcd10ResolvedFromDiagnosesList_WhenProvisionalMissing()
    {
        // Arrange
        var patient = CreatePatient();
        var referral = CreateValidReferral(patient);
        referral.ProvisionalDiagnosis = ""; // No text diagnosis

        var diagnoses = new List<EncounterDiagnosis>
        {
            new()
            {
                Icd10Code = "E11.9",
                Description = "Type 2 diabetes mellitus without complications",
                IsPrimary = false
            },
            new()
            {
                Icd10Code = "I10",
                Description = "Essential (primary) hypertension",
                IsPrimary = true // Primary
            }
        };

        var context = new YakapReferralContext
        {
            Facility = CreateFacility(),
            Patient = patient,
            Referral = referral,
            Diagnoses = diagnoses
        };

        // Act
        var result = _builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pDiagnosisIcdCode").GetString().Should().Be("I10");
    }

    [Theory]
    [InlineData("1990-01-01", "2026-10-28", "36 YR(S), 9 MO(S), 27 DAY(S)")]
    [InlineData("2026-05-15", "2026-10-28", "0 YR(S), 5 MO(S), 13 DAY(S)")]
    [InlineData("2026-10-28", "2026-10-28", "0 YR(S), 0 MO(S), 0 DAY(S)")]
    [InlineData("2028-01-01", "2026-10-28", "0 YR(S), 0 MO(S), 0 DAY(S)")] // Future date guard
    public void Challenge_FormatPhilHealthAge_CalculatesExactStatutoryAgeString(
        string dobStr, string asOfStr, string expectedAge)
    {
        var dob = DateOnly.Parse(dobStr);
        var asOf = DateOnly.Parse(asOfStr);

        var actual = YakapReferralWireBuilder.FormatPhilHealthAge(dob, asOf);

        actual.Should().Be(expectedAge);
    }
}
