using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class PhilHealthSequenceGeneratorTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_seq_test";
    private readonly IClinicContext _clinicContext;
    private readonly PhilHealthSequenceGenerator _generator;
    private readonly Infrastructure.Persistence.ApplicationDbContext _dbContext;

    public PhilHealthSequenceGeneratorTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);

        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        _dbContext = context;

        _generator = new PhilHealthSequenceGenerator(_dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);
    }

    [Fact]
    public async Task GenerateCaseNumberAsync_IncrementsSequentially()
    {
        var case1 = await _generator.GenerateCaseNumberAsync(_tenantId, _clinicId, "HCI-NCR-00921", "2026");
        var case2 = await _generator.GenerateCaseNumberAsync(_tenantId, _clinicId, "HCI-NCR-00921", "2026");

        case1.Should().Be("C000921202600001");
        case2.Should().Be("C000921202600002");
    }

    [Fact]
    public async Task GenerateTransactionNumberAsync_UsesCorrectPrefixPerType()
    {
        var enlist = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Enlistment, "HCI-NCR-00921", "2026");
        var prof = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Profiling, "HCI-NCR-00921", "2026");
        var soap = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Soap, "HCI-NCR-00921", "2026");
        var med = await _generator.GenerateTransactionNumberAsync(_tenantId, _clinicId, PhilHealthSequenceType.Medicine, "HCI-NCR-00921", "2026");
        var trans = await _generator.GenerateTransmittalNumberAsync(_tenantId, _clinicId, "HCI-NCR-00921", "2026");

        enlist.Should().StartWith("E0009212026");
        prof.Should().StartWith("P0009212026");
        soap.Should().StartWith("S0009212026");
        med.Should().StartWith("M0009212026");
        trans.Should().StartWith("R0009212026");
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_AssignsAndPersistsNumbersOnPatientAndEncounter()
    {
        // Arrange
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567",
            PhilHealthNumber = "030263078507",
            DateOfBirth = new DateOnly(1985, 5, 15)
        };
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-15",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = null,
                ["enlistment_no"] = null,
                ["profiling_trans_no"] = null
            }
        };
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 3, 20, 9, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        // Assert
        result.Should().NotBeNull();
        result.CaseNumber.Should().Be("C000921202600001");
        result.EnlistmentTransactionNumber.Should().Be("E000921202600001");
        result.ProfilingTransactionNumber.Should().Be("P000921202600001");
        result.SoapTransactionNumber.Should().Be("S000921202600001");

        // Verify persisted on active entry in CustomFields
        var enlistments = patient.CustomFields["yakap_enlistments"] as List<Dictionary<string, object?>>;
        enlistments.Should().NotBeNull();
        enlistments!.Should().HaveCount(1);
        enlistments[0]["case_no"]!.ToString().Should().Be("C000921202600001");
        enlistments[0]["enlistment_no"]!.ToString().Should().Be("E000921202600001");
        enlistments[0]["profiling_trans_no"]!.ToString().Should().Be("P000921202600001");
        enlistments[0]["enlisted_at"]!.ToString().Should().Be("2026-01-15");
        enlistments[0]["valid_until"]!.ToString().Should().Be("2026-12-31");
        enlistments[0]["status"]!.ToString().Should().Be("Active");

        // Verify persisted on encounter
        encounter.PhilHealthCaseNo.Should().Be("C000921202600001");
        encounter.HciCaseNo.Should().Be("C000921202600001");
        encounter.HciTransNo.Should().Be("E000921202600001");
        encounter.PhilHealthSoapTransNo.Should().Be("S000921202600001");
        encounter.SoapTransNo.Should().Be("S000921202600001");

        // Calling again does not overwrite existing numbers (idempotent)
        var result2 = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        result2.CaseNumber.Should().Be("C000921202600001");
        result2.EnlistmentTransactionNumber.Should().Be("E000921202600001");
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_ThrowsInvalidOperationException_WhenEnlistmentsMissing()
    {
        // Arrange: Patient without yakap_enlistments key
        var patientWithoutKey = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-NOKEY",
            FirstName = "Maria",
            LastName = "Clara",
            ContactNumber = "09171112233",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        _dbContext.Patients.Add(patientWithoutKey);

        // Patient with empty array
        var patientWithEmptyList = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-EMPTY",
            FirstName = "Crisostomo",
            LastName = "Ibarra",
            ContactNumber = "09172223344",
            DateOfBirth = new DateOnly(1988, 6, 19)
        };
        patientWithEmptyList.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>();
        _dbContext.Patients.Add(patientWithEmptyList);

        await _dbContext.SaveChangesAsync();

        // Act & Assert 1: Missing key
        Func<Task> act1 = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patientWithoutKey.Id, null, "HCI-NCR-00921", "2026");

        await act1.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*enlistment*");

        // Act & Assert 2: Empty list
        Func<Task> act2 = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patientWithEmptyList.Id, null, "HCI-NCR-00921", "2026");

        await act2.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*enlistment*");

        // Verify DB unchanged: no auto-creation
        patientWithoutKey.CustomFields.ContainsKey("yakap_enlistments").Should().BeFalse();
        ((List<Dictionary<string, object?>>)patientWithEmptyList.CustomFields["yakap_enlistments"]!).Should().BeEmpty();
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_ThrowsInvalidOperationException_WhenEnlistmentExpired()
    {
        // Arrange: Patient with 2025 enlistment that expired on 2025-12-31
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-EXPIRED",
            FirstName = "Elias",
            LastName = "Piloto",
            ContactNumber = "09173334455",
            DateOfBirth = new DateOnly(1982, 3, 10)
        };
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202500042",
                ["enlistment_no"] = "E000921202500042",
                ["profiling_trans_no"] = "P000921202500042"
            }
        };
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Elias Piloto",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 2, 1, 10, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act & Assert
        Func<Task> act = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*expire*");

        // Verify DB unchanged: array length remains 1, encounter PhilHealthCaseNo remains null
        var list = patient.CustomFields["yakap_enlistments"] as List<Dictionary<string, object?>>;
        list.Should().HaveCount(1);
        list![0]["case_no"]!.ToString().Should().Be("C000921202500042");
        encounter.PhilHealthCaseNo.Should().BeNull();
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_ThrowsInvalidOperationException_WhenEnlistmentTransferred()
    {
        // Arrange: Patient with 2026 enlistment marked Transferred
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-XFER",
            FirstName = "Sisa",
            LastName = "Basilio",
            ContactNumber = "09174445566",
            DateOfBirth = new DateOnly(1975, 8, 22)
        };
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Transferred",
                ["source"] = "PhilHealthMasterlist",
                ["case_no"] = "C000921202600099",
                ["enlistment_no"] = "E000921202600099",
                ["profiling_trans_no"] = "P000921202600099"
            }
        };
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Sisa Basilio",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 4, 15, 14, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act & Assert
        Func<Task> act = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Transferred*");

        encounter.PhilHealthCaseNo.Should().BeNull();
        encounter.PhilHealthSoapTransNo.Should().BeNull();
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_Succeeds_WhenNewRenewalPeriodAdded()
    {
        // Arrange: Expired 2025 entry alongside explicit 2026 renewal entry
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-RENEW",
            FirstName = "Basilio",
            LastName = "Crispin",
            ContactNumber = "09175556677",
            DateOfBirth = new DateOnly(2000, 12, 25)
        };
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202500050",
                ["enlistment_no"] = "E000921202500050",
                ["profiling_trans_no"] = "P000921202500050"
            },
            new()
            {
                ["enlisted_at"] = "2026-01-15",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = null,
                ["enlistment_no"] = null,
                ["profiling_trans_no"] = null
            }
        };
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Basilio Crispin",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 3, 10, 8, 30, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        // Assert
        result.CaseNumber.Should().StartWith("C0009212026");
        result.EnlistmentTransactionNumber.Should().StartWith("E0009212026");

        var enlistments = patient.CustomFields["yakap_enlistments"] as List<Dictionary<string, object?>>;
        enlistments.Should().HaveCount(2);

        // 2025 entry completely preserved
        enlistments![0]["effective_year"]!.ToString().Should().Be("2025");
        enlistments[0]["status"]!.ToString().Should().Be("Expired");
        enlistments[0]["case_no"]!.ToString().Should().Be("C000921202500050");
        enlistments[0]["enlistment_no"]!.ToString().Should().Be("E000921202500050");

        // 2026 entry updated with newly generated numbers
        enlistments[1]["effective_year"]!.ToString().Should().Be("2026");
        enlistments[1]["status"]!.ToString().Should().Be("Active");
        enlistments[1]["case_no"]!.ToString().Should().Be(result.CaseNumber);
        enlistments[1]["enlistment_no"]!.ToString().Should().Be(result.EnlistmentTransactionNumber);
        enlistments[1]["profiling_trans_no"]!.ToString().Should().Be(result.ProfilingTransactionNumber);

        encounter.PhilHealthCaseNo.Should().Be(result.CaseNumber);
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_PreservesPastEnlistedAtDate()
    {
        // Arrange: Patient with historical registration date from external eGovPH portal
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-PASTDATE",
            FirstName = "Padre",
            LastName = "Florentino",
            ContactNumber = "09176667788",
            DateOfBirth = new DateOnly(1960, 4, 12)
        };
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-03", // Enlisted at start of year via eGovPH
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "SelfReported",
                ["case_no"] = null,
                ["enlistment_no"] = null,
                ["profiling_trans_no"] = null
            }
        };
        _dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient.Id,
            PatientName = "Padre Florentino",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 9, 20, 11, 0, 0, DateTimeKind.Utc), // Consultation months later
            IsYakapEligible = true
        };
        _dbContext.Consultations.Add(encounter);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        // Assert
        result.CaseNumber.Should().StartWith("C0009212026");

        var list = patient.CustomFields["yakap_enlistments"] as List<Dictionary<string, object?>>;
        list.Should().HaveCount(1);
        var entry = list![0];

        // enlisted_at MUST retain its original historical value "2026-01-03"
        entry["enlisted_at"]!.ToString().Should().Be("2026-01-03");
        entry["source"]!.ToString().Should().Be("SelfReported");
        entry["valid_until"]!.ToString().Should().Be("2026-12-31");
        entry["case_no"]!.ToString().Should().Be(result.CaseNumber);
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_Succeeds_WithoutEncounter_AllocatesPatientKeysOnly()
    {
        // Arrange
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-NOENC",
            FirstName = "Isagani",
            LastName = "Lopez",
            ContactNumber = "09177778899",
            DateOfBirth = new DateOnly(1995, 2, 14)
        };
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-10",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = null,
                ["enlistment_no"] = null,
                ["profiling_trans_no"] = null
            }
        };
        _dbContext.Patients.Add(patient);
        await _dbContext.SaveChangesAsync();

        // Act: encounterId is null
        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, null, "HCI-NCR-00921", "2026");

        // Assert
        result.Should().NotBeNull();
        result.CaseNumber.Should().StartWith("C0009212026");
        result.EnlistmentTransactionNumber.Should().StartWith("E0009212026");
        result.ProfilingTransactionNumber.Should().StartWith("P0009212026");
        result.SoapTransactionNumber.Should().BeNull();

        var list = patient.CustomFields["yakap_enlistments"] as List<Dictionary<string, object?>>;
        list![0]["case_no"]!.ToString().Should().Be(result.CaseNumber);
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_HandlesJsonElementArray_InCustomFields()
    {
        // Arrange: CustomFields contains JsonElement array (as deserialized from PostgreSQL JSONB)
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-JSONELEM",
            FirstName = "Simoun",
            LastName = "Ibarra",
            ContactNumber = "09178889900",
            DateOfBirth = new DateOnly(1978, 10, 31)
        };

        var rawJson = @"[
            {
                ""enlisted_at"": ""2026-01-20"",
                ""valid_until"": ""2026-12-31"",
                ""effective_year"": 2026,
                ""status"": ""Active"",
                ""source"": ""ClinicEnlistment"",
                ""case_no"": null,
                ""enlistment_no"": null,
                ""profiling_trans_no"": null
            }
        ]";
        using var doc = JsonDocument.Parse(rawJson);
        patient.CustomFields["yakap_enlistments"] = doc.RootElement.Clone();
        _dbContext.Patients.Add(patient);
        await _dbContext.SaveChangesAsync();

        // Act
        var result = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, null, "HCI-NCR-00921", "2026");

        // Assert
        result.Should().NotBeNull();
        result.CaseNumber.Should().StartWith("C0009212026");
        result.EnlistmentTransactionNumber.Should().StartWith("E0009212026");
        result.ProfilingTransactionNumber.Should().StartWith("P0009212026");
    }
}
