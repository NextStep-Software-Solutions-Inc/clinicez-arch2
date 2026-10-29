using System;
using System.Collections.Generic;
using System.Text.Json;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Application.Features.Yakap.WireBuilders;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

public sealed class YakapWireBuildersTests
{
    private const string TestCipherKey = "0123456789abcdef0123456789abcdef";
    private readonly IPhilHealthPayloadEncryptor _encryptor = new PhilHealthPayloadEncryptor();

    private static FacilitySettings CreateFacility() => new()
    {
        Id = Guid.NewGuid(),
        TenantId = "tenant-001",
        ClinicId = Guid.NewGuid(),
        ClinicName = "Metro Health Clinic",
        AccreditationNumber = "H91000001",
        PmccNumber = "123456",
        SoftwareCertificateId = "CERT-999"
    };

    private static Patient CreatePatient()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-001",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-2026-0001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            MiddleName = "Protacio",
            Suffix = "Jr.",
            DateOfBirth = new DateOnly(1985, 6, 15),
            Sex = BiologicalSex.Male,
            CivilStatus = CivilStatus.Married,
            ContactNumber = "09171234567",
            Email = "juan.delacruz@example.ph",
            PhilHealthNumber = "12-345678901-2",
            BloodType = BloodType.OPositive
        };

        patient.Addresses.Add(new PatientAddress
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            AddressType = PatientAddressType.Permanent,
            StreetAddress = "123 Rizal Street",
            BarangayPsgc = "137604001",
            CityMunicipalityPsgc = "137604000",
            ProvincePsgc = "137600000",
            RegionPsgc = "130000000",
            ZipCode = "1000"
        });

        return patient;
    }

    [Fact]
    public void YakapFpeWireBuilder_BuildsValidJson_And_EncryptsPayload()
    {
        // Arrange
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();

        var vitals = new PatientVitals
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.6m,
            HeightCm = 170m,
            WeightKg = 70m,
            Bmi = 24.2m,
            WaistCircumferenceCm = 82m
        };

        var medicalHistory = new List<PatientMedicalHistory>
        {
            new()
            {
                PatientId = patient.Id,
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                ConditionTitle = "Essential Hypertension",
                Icd10Code = "I10",
                PhilHealthMdiseaseCode = "001",
                OnsetDate = new DateOnly(2020, 1, 1),
                Status = ProblemStatus.Active
            }
        };

        var context = new YakapFpeContext
        {
            Facility = facility,
            Patient = patient,
            Vitals = vitals,
            MedicalHistory = medicalHistory,
            EnlistmentCaseNo = "C00921202600001"
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNullOrWhiteSpace();

        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pHciAccreNo").GetString().Should().Be("H91000001");
        root.GetProperty("pHciCaseNo").GetString().Should().Be("C00921202600001");
        root.GetProperty("pPatientPin").GetString().Should().Be("12-345678901-2");
        root.GetProperty("pPatientLName").GetString().Should().Be("Dela Cruz");
        root.GetProperty("pPatientFName").GetString().Should().Be("Juan");
        root.GetProperty("pPatientSex").GetString().Should().Be("M");
        root.GetProperty("pCivilStatus").GetString().Should().Be("M");
        root.GetProperty("pBloodType").GetString().Should().Be("O+");
        root.GetProperty("pContactNo").GetString().Should().Be("09171234567");
        root.GetProperty("pBrgyCode").GetString().Should().Be("137604001");

        var vitalsElem = root.GetProperty("pVitals");
        vitalsElem.GetProperty("pSystolic").GetInt32().Should().Be(120);
        vitalsElem.GetProperty("pDiastolic").GetInt32().Should().Be(80);
        vitalsElem.GetProperty("pHr").GetInt32().Should().Be(72);

        // Encrypt test
        var encResult = builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        encResult.IsSuccess.Should().BeTrue();
        encResult.Value!.DocMimeType.Should().Be("application/json");

        var decrypted = _encryptor.DecryptJson(encResult.Value!, TestCipherKey);
        decrypted.Should().Be(result.Value);
    }

    [Fact]
    public void YakapFpeWireBuilder_FailsWhenAccreditationMissing()
    {
        var builder = new YakapFpeWireBuilder();
        var facility = CreateFacility();
        facility.AccreditationNumber = "";
        var patient = CreatePatient();

        var context = new YakapFpeContext
        {
            Facility = facility,
            Patient = patient
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("accreditation", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void YakapConsultationWireBuilder_BuildsValidJson_And_EncryptsPayload()
    {
        // Arrange
        var builder = new YakapConsultationWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            DoctorPrcLicense = "1234567",
            DoctorPhilHealthPan = "PAN-001",
            EncounterDate = new DateTime(2026, 10, 28, 10, 30, 0, DateTimeKind.Utc),
            Subjective = "Patient reports intermittent headaches and dizziness for 3 days.",
            Objective = "BP 130/85, HR 76 regular, no focal neurological deficits.",
            Assessment = "Stage 1 Essential Hypertension.",
            Plan = "Prescribed Losartan 50mg OD, lifestyle counseling.",
            PhilHealthCaseNo = "C00921202600001"
        };

        var diagnoses = new List<EncounterDiagnosis>
        {
            new()
            {
                ConsultationEncounterId = encounter.Id,
                TenantId = encounter.TenantId,
                ClinicId = encounter.ClinicId,
                Icd10Code = "I10",
                Description = "Essential (primary) hypertension",
                IsPrimary = true
            }
        };

        var vitals = new PatientVitals
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            SystolicBp = 130,
            DiastolicBp = 85,
            HeartRateBpm = 76,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.7m
        };

        var context = new YakapConsultationContext
        {
            Facility = facility,
            Patient = patient,
            Encounter = encounter,
            Diagnoses = diagnoses,
            Vitals = vitals
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pHciAccreNo").GetString().Should().Be("H91000001");
        root.GetProperty("pHciCaseNo").GetString().Should().Be("C00921202600001");
        root.GetProperty("pConsultDate").GetString().Should().Be("2026-10-28");
        root.GetProperty("pDoctorPan").GetString().Should().Be("PAN-001");
        root.GetProperty("pDoctorPrc").GetString().Should().Be("1234567");
        root.GetProperty("pSubjective").GetString().Should().Contain("headaches");
        root.GetProperty("pAssessment").GetString().Should().Contain("Hypertension");

        var diagArray = root.GetProperty("pDiagnoses");
        diagArray.GetArrayLength().Should().Be(1);
        diagArray[0].GetProperty("pIcdCode").GetString().Should().Be("I10");

        // Encrypted payload test
        var encResult = builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        encResult.IsSuccess.Should().BeTrue();
        var decrypted = _encryptor.DecryptJson(encResult.Value!, TestCipherKey);
        decrypted.Should().Be(result.Value);
    }

    [Fact]
    public void YakapDiagnosticRequestWireBuilder_BuildsValidJson_And_EncryptsPayload()
    {
        // Arrange
        var builder = new YakapDiagnosticRequestWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();

        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            OrderNumber = "ORD-2026-0001",
            OrderDate = new DateTime(2026, 10, 28, 9, 0, 0, DateTimeKind.Utc),
            Notes = "Routine fasting blood sugar and lipid profile for NCD check",
            RequestingPhysicianPan = "PAN-001"
        };

        var items = new List<LabOrderItem>
        {
            new()
            {
                LabOrderId = order.Id,
                TenantId = order.TenantId,
                ClinicId = order.ClinicId,
                TestName = "Fasting Blood Sugar",
                Category = "Clinical Chemistry",
                PhilHealthServiceCode = "FBS001",
                RecommendationCode = "STAT",
                Instructions = "10 hours fasting required"
            }
        };

        var context = new YakapDiagnosticRequestContext
        {
            Facility = facility,
            Patient = patient,
            Order = order,
            Items = items,
            CaseNo = "C00921202600001"
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pHciAccreNo").GetString().Should().Be("H91000001");
        root.GetProperty("pHciCaseNo").GetString().Should().Be("C00921202600001");
        root.GetProperty("pOrderNo").GetString().Should().Be("ORD-2026-0001");
        root.GetProperty("pDoctorPan").GetString().Should().Be("PAN-001");
        root.GetProperty("pClinicalIndication").GetString().Should().Contain("fasting blood sugar");

        var itemsElem = root.GetProperty("pItems");
        itemsElem.GetArrayLength().Should().Be(1);
        itemsElem[0].GetProperty("pDiagnosticCode").GetString().Should().Be("FBS001");
        itemsElem[0].GetProperty("pDiagnosticName").GetString().Should().Be("Fasting Blood Sugar");
        itemsElem[0].GetProperty("pUrgency").GetString().Should().Be("STAT");

        // Encrypt test
        var encResult = builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        encResult.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void YakapDiagnosticResultsWireBuilder_BuildsValidJson_And_EncryptsPayload()
    {
        // Arrange
        var builder = new YakapDiagnosticResultsWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();

        var order = new LabOrder
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            OrderNumber = "ORD-2026-0001",
            PhilHealthRequestTransNo = "T00921202600001"
        };

        var observations = new List<LabObservation>
        {
            new()
            {
                LabOrderId = order.Id,
                TenantId = order.TenantId,
                ClinicId = order.ClinicId,
                AnalyteCode = "FBS",
                AnalyteName = "Fasting Blood Sugar",
                ValueText = "95.5",
                NumericValue = 95.5m,
                Unit = "mg/dL",
                ReferenceRangeLow = 70m,
                ReferenceRangeHigh = 100m,
                ReferenceRangeText = "70-100 mg/dL",
                AbnormalFlag = "N",
                CreatedAt = new DateTime(2026, 10, 28, 11, 0, 0, DateTimeKind.Utc)
            }
        };

        var context = new YakapDiagnosticResultsContext
        {
            Facility = facility,
            Patient = patient,
            Order = order,
            Observations = observations,
            DiagnosticPdfAttachmentBase64 = "JVBERi0xLjQKJUZha2VQZGY="
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pHciAccreNo").GetString().Should().Be("H91000001");
        root.GetProperty("pOrderNo").GetString().Should().Be("ORD-2026-0001");
        root.GetProperty("pPdfAttachment").GetString().Should().Be("JVBERi0xLjQKJUZha2VQZGY=");

        var obsArray = root.GetProperty("pObservations");
        obsArray.GetArrayLength().Should().Be(1);
        obsArray[0].GetProperty("pObservationCode").GetString().Should().Be("FBS");
        obsArray[0].GetProperty("pObservationValue").GetString().Should().Be("95.5");
        obsArray[0].GetProperty("pUnitOfMeasure").GetString().Should().Be("mg/dL");
        obsArray[0].GetProperty("pInterpretationCode").GetString().Should().Be("N");

        // Encrypt test
        var encResult = builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        encResult.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void YakapMedicineWireBuilder_BuildsValidJson_WithUpscCode()
    {
        // Arrange
        var builder = new YakapMedicineWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();

        // 30-character GAMOT UPSC code
        const string validUpsc = "MED-METFORMIN-500MG-TAB-000001";
        validUpsc.Length.Should().Be(30);

        var items = new List<PrescriptionItem>
        {
            new()
            {
                ConsultationEncounterId = Guid.NewGuid(),
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                GenericName = "Metformin Hydrochloride",
                BrandName = "Glucophage",
                Dosage = "500 mg",
                Form = "Tablet",
                Sig = "Take 1 tablet twice daily with meals",
                Quantity = 60,
                Frequency = "BID",
                DurationDays = 30,
                PhilHealthDrugCode = validUpsc,
                PrescriptionDate = new DateOnly(2026, 10, 28),
                PrescribingPhysicianPrcNo = "0123456"
            }
        };

        var context = new YakapMedicineContext
        {
            Facility = facility,
            Patient = patient,
            Items = items,
            DoctorPan = "PAN-001",
            CaseNo = "C00921202600001"
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pHciAccreNo").GetString().Should().Be("H91000001");
        root.GetProperty("pHciCaseNo").GetString().Should().Be("C00921202600001");
        root.GetProperty("pDoctorPan").GetString().Should().Be("PAN-001");

        var itemsArray = root.GetProperty("pItems");
        itemsArray.GetArrayLength().Should().Be(1);
        itemsArray[0].GetProperty("pDrugCode").GetString().Should().Be(validUpsc);
        itemsArray[0].GetProperty("pGenericName").GetString().Should().Be("Metformin Hydrochloride");
        itemsArray[0].GetProperty("pQuantity").GetInt32().Should().Be(60);

        // Encrypt test
        var encResult = builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        encResult.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void YakapMedicineWireBuilder_FailsWhenDrugCodeNot29To30Chars()
    {
        // Arrange
        var builder = new YakapMedicineWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();

        var items = new List<PrescriptionItem>
        {
            new()
            {
                ConsultationEncounterId = Guid.NewGuid(),
                TenantId = patient.TenantId,
                ClinicId = patient.ClinicId,
                GenericName = "Paracetamol",
                Dosage = "500 mg",
                Form = "Tablet",
                Sig = "Take 1 tab PRN",
                Quantity = 10,
                PhilHealthDrugCode = "SHORT-CODE" // only 10 chars, invalid UPSC
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
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("29-30 character GAMOT UPSC", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void YakapReferralWireBuilder_BuildsValidJson_ForMemberReferral_And_EncryptsPayload()
    {
        // Arrange
        var builder = new YakapReferralWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient(); // Member (MM), 12-345678901-2

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            ReferralNumber = "REF-20261028-0001",
            ReferralDate = new DateOnly(2026, 10, 28),
            ReferringDoctorId = Guid.NewGuid(),
            ReferringDoctorName = "Dr. Jose Rizal",
            ReferringDoctorPrcNumber = "1234567",
            ReferringDoctorPhilHealthPan = "PAN-001",
            ReferringDoctorDesignation = "Attending Physician",
            ReferredToFacility = "Philippine General Hospital",
            ReferredDepartment = "Cardiology",
            ReferredToDoctor = "Dr. Juan Luna",
            Urgency = "Urgent",
            ReasonForReferral = "Evaluation of unstable angina and abnormal ECG",
            ProvisionalDiagnosis = "Coronary Artery Disease; Angina Pectoris",
            ClinicalSummary = "Patient has 3-day history of exertional retrosternal chest tightness with radiation to left jaw.",
            PhilHealthReferralTransNo = "R910000012026102800001",
            ReferralTypeCodes = "01",
            SpecialistType = "Cardiology"
        };

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            DoctorId = referral.ReferringDoctorId,
            DoctorName = referral.ReferringDoctorName,
            DoctorPrcLicense = "1234567",
            DoctorPhilHealthPan = "PAN-001",
            EncounterDate = new DateTime(2026, 10, 28, 14, 30, 0, DateTimeKind.Utc),
            PhilHealthCaseNo = "T910000012026102800001",
            PhilHealthSoapTransNo = "S910000012026102800001"
        };

        var diagnoses = new List<EncounterDiagnosis>
        {
            new()
            {
                ConsultationEncounterId = encounter.Id,
                TenantId = encounter.TenantId,
                ClinicId = encounter.ClinicId,
                Icd10Code = "I20.9",
                Description = "Angina pectoris, unspecified",
                IsPrimary = true
            }
        };

        var context = new YakapReferralContext
        {
            Facility = facility,
            Patient = patient,
            Referral = referral,
            Encounter = encounter,
            Diagnoses = diagnoses,
            CaseNo = "T910000012026102800001",
            SoapTransNo = "S910000012026102800001"
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNullOrWhiteSpace();

        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pHciAccreNo").GetString().Should().Be("H91000001");
        root.GetProperty("pHciCaseNo").GetString().Should().Be("T910000012026102800001");
        root.GetProperty("pSoapTransNo").GetString().Should().Be("S910000012026102800001");
        root.GetProperty("pPatientPin").GetString().Should().Be("123456789012");
        root.GetProperty("pPatientType").GetString().Should().Be("MM");
        root.GetProperty("pReferralTransNo").GetString().Should().Be("R910000012026102800001");
        root.GetProperty("pReferralType").GetString().Should().Be("01");
        root.GetProperty("pReferralSpecialist").GetString().Should().Be("Cardiology");
        root.GetProperty("pReferralReason").GetString().Should().Contain("unstable angina");
        root.GetProperty("pReceivingFacilityName").GetString().Should().Be("Philippine General Hospital");
        root.GetProperty("pDiagnosisIcdCode").GetString().Should().Be("I20.9");
        root.GetProperty("pDoctorPan").GetString().Should().Be("PAN-001");
        root.GetProperty("pDoctorPrc").GetString().Should().Be("1234567");

        // Guardian block MUST be absent for MM
        root.TryGetProperty("guardian", out _).Should().BeFalse();
        root.TryGetProperty("pGuardian", out _).Should().BeFalse();

        // Encrypt test
        var encResult = builder.BuildEncryptedPayload(context, TestCipherKey, _encryptor);
        encResult.IsSuccess.Should().BeTrue();
        encResult.Value!.DocMimeType.Should().Be("application/json");

        var decrypted = _encryptor.DecryptJson(encResult.Value!, TestCipherKey);
        decrypted.Should().Be(result.Value);
    }

    [Fact]
    public void YakapReferralWireBuilder_BuildsValidJson_ForDependentReferral_WithGuardian()
    {
        // Arrange
        var builder = new YakapReferralWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();
        patient.PhilHealthMembership = new PatientPhilHealthMembership
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            MemberType = PhilHealthMemberType.DD, // Dependent
            MemberPin = "123456789012",
            PrincipalMemberPin = "129876543210"
        };

        var guardian = new PatientGuardian
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            FirstName = "Maria Clara",
            LastName = "Santos",
            Sex = BiologicalSex.Female,
            BirthDate = new DateOnly(1988, 3, 25),
            ContactNumber = "09181234567",
            RelationshipCode = "MTH", // LIB-067 Mother
            PhilHealthPin = "129876543210"
        };
        patient.Guardians.Add(guardian);

        var referral = new ReferralLetter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            ReferralNumber = "REF-20261028-0002",
            ReferralDate = new DateOnly(2026, 10, 28),
            ReferringDoctorId = Guid.NewGuid(),
            ReferringDoctorName = "Dr. Jose Rizal",
            ReferringDoctorPrcNumber = "1234567",
            ReferringDoctorPhilHealthPan = "PAN-001",
            ReferredToFacility = "National Children's Hospital",
            ReferredDepartment = "Developmental Pediatrics",
            ReasonForReferral = "Evaluation of developmental milestones delay",
            ProvisionalDiagnosis = "Speech and language developmental delay",
            ClinicalSummary = "Summary of speech delay",
            ReferralTypeCodes = "06" // LIB-063: Refer to Developmental Pediatrician
        };

        var context = new YakapReferralContext
        {
            Facility = facility,
            Patient = patient,
            Referral = referral,
            Guardian = guardian,
            DoctorPan = "PAN-001",
            DoctorPrc = "1234567"
        };

        // Act
        var result = builder.BuildWirePayload(context);

        // Assert
        result.IsSuccess.Should().BeTrue();
        using var doc = JsonDocument.Parse(result.Value!);
        var root = doc.RootElement;
        root.GetProperty("pPatientType").GetString().Should().Be("DD");

        // Guardian block MUST be present for DD
        root.TryGetProperty("guardian", out var guardianElem).Should().BeTrue();
        guardianElem.GetProperty("guardian_name").GetString().Should().Be("Maria Clara Santos");
        guardianElem.GetProperty("guardian_relationship").GetString().Should().Be("MTH");
        guardianElem.GetProperty("guardian_sex").GetString().Should().Be("F");
        guardianElem.GetProperty("guardian_contact_no").GetString().Should().Be("09181234567");
    }

    [Fact]
    public void YakapReferralWireBuilder_FailsWhenAccreditationMissing()
    {
        var builder = new YakapReferralWireBuilder();
        var facility = CreateFacility();
        facility.AccreditationNumber = "";
        var patient = CreatePatient();

        var context = new YakapReferralContext
        {
            Facility = facility,
            Patient = patient,
            Referral = new ReferralLetter
            {
                ReferralNumber = "REF-001",
                PatientName = "Test",
                ReferringDoctorName = "Dr. Test",
                ReferredToFacility = "Hospital",
                ReferredDepartment = "Pedia",
                ReasonForReferral = "Checkup",
                ProvisionalDiagnosis = "Cold",
                ClinicalSummary = "Summary"
            }
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("accreditation", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void YakapReferralWireBuilder_FailsWhenPatientPinMissing()
    {
        var builder = new YakapReferralWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();
        patient.PhilHealthNumber = "";
        patient.PhilHealthMembership = null;

        var context = new YakapReferralContext
        {
            Facility = facility,
            Patient = patient,
            Referral = new ReferralLetter
            {
                ReferralNumber = "REF-001",
                PatientName = "Test",
                ReferringDoctorName = "Dr. Test",
                ReferredToFacility = "Hospital",
                ReferredDepartment = "Pedia",
                ReasonForReferral = "Checkup",
                ProvisionalDiagnosis = "Cold",
                ClinicalSummary = "Summary"
            }
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("PIN", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void YakapReferralWireBuilder_FailsWhenSpecialistMissing_ForType01()
    {
        var builder = new YakapReferralWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();

        var referral = new ReferralLetter
        {
            ReferralNumber = "REF-001",
            PatientName = "Test",
            ReferringDoctorName = "Dr. Test",
            ReferringDoctorPrcNumber = "1234567",
            ReferringDoctorPhilHealthPan = "PAN-001",
            ReferredToFacility = "Hospital",
            ReferredDepartment = "",
            ReasonForReferral = "Cardio review",
            ProvisionalDiagnosis = "CAD",
            ClinicalSummary = "Summary",
            ReferralTypeCodes = "01",
            SpecialistType = "" // Missing specialist
        };

        var context = new YakapReferralContext
        {
            Facility = facility,
            Patient = patient,
            Referral = referral
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("specialist is required", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void YakapReferralWireBuilder_FailsWhenGuardianMissing_ForDependent()
    {
        var builder = new YakapReferralWireBuilder();
        var facility = CreateFacility();
        var patient = CreatePatient();
        patient.PhilHealthMembership = new PatientPhilHealthMembership
        {
            PatientId = patient.Id,
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            MemberType = PhilHealthMemberType.DD, // Dependent
            MemberPin = "123456789012"
        };
        patient.Guardians.Clear(); // No guardian

        var referral = new ReferralLetter
        {
            ReferralNumber = "REF-001",
            PatientName = "Test",
            ReferringDoctorName = "Dr. Test",
            ReferringDoctorPrcNumber = "1234567",
            ReferringDoctorPhilHealthPan = "PAN-001",
            ReferredToFacility = "Hospital",
            ReferredDepartment = "Surgery",
            ReasonForReferral = "Surgical eval",
            ProvisionalDiagnosis = "Appendicitis",
            ClinicalSummary = "Summary",
            ReferralTypeCodes = "01",
            SpecialistType = "Surgery"
        };

        var context = new YakapReferralContext
        {
            Facility = facility,
            Patient = patient,
            Referral = referral,
            Guardian = null
        };

        var result = builder.BuildWirePayload(context);
        result.IsSuccess.Should().BeFalse();
        result.Errors.Should().Contain(e => e.Contains("Guardian information is required", StringComparison.OrdinalIgnoreCase));
    }
}
