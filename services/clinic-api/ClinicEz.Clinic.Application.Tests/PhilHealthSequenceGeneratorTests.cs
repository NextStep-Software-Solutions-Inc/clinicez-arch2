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
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567",
            PhilHealthNumber = "030263078507",
            DateOfBirth = new DateOnly(1985, 5, 15),
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    EffectiveYear = 2026,
                    Status = YakapEnlistmentStatus.Active,
                    Source = YakapEnlistmentSource.ClinicEnlistment,
                    EnlistmentDate = new DateOnly(2026, 1, 15),
                    ValidUntil = new DateOnly(2026, 12, 31)
                }
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

        // Verify persisted on active entry in YakapEnlistments
        var enlistment = patient.YakapEnlistments.First();
        enlistment.CaseNo.Should().Be("C000921202600001");
        enlistment.EnlistmentTransNo.Should().Be("E000921202600001");
        enlistment.ProfilingTransNo.Should().Be("P000921202600001");
        enlistment.EnlistmentDate.Should().Be(new DateOnly(2026, 1, 15));
        enlistment.ValidUntil.Should().Be(new DateOnly(2026, 12, 31));
        enlistment.Status.Should().Be(YakapEnlistmentStatus.Active);

        // Verify persisted on encounter
        encounter.PhilHealthCaseNo.Should().Be("C000921202600001");
        encounter.PhilHealthSoapTransNo.Should().Be("S000921202600001");

        // Calling again does not overwrite existing numbers (idempotent)
        var result2 = await _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patient.Id, encounter.Id, "HCI-NCR-00921", "2026");

        result2.CaseNumber.Should().Be("C000921202600001");
        result2.EnlistmentTransactionNumber.Should().Be("E000921202600001");
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_ThrowsInvalidOperationException_WhenEnlistmentsMissing()
    {
        // Arrange: Patient without YakapEnlistments
        var patientWithoutKey = new Patient
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

        // Patient with empty list
        var patientWithEmptyList = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-EMPTY",
            FirstName = "Crisostomo",
            LastName = "Ibarra",
            ContactNumber = "09172223344",
            DateOfBirth = new DateOnly(1988, 6, 19),
            YakapEnlistments = new List<PatientYakapEnlistment>()
        };
        _dbContext.Patients.Add(patientWithEmptyList);

        await _dbContext.SaveChangesAsync();

        // Act & Assert 1: Missing list
        Func<Task> act1 = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patientWithoutKey.Id, null, "HCI-NCR-00921", "2026");

        await act1.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*enlistment*");

        // Act & Assert 2: Empty list
        Func<Task> act2 = () => _generator.AssignPatientJourneyNumbersAsync(
            _tenantId, _clinicId, patientWithEmptyList.Id, null, "HCI-NCR-00921", "2026");

        await act2.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*enlistment*");
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_ThrowsInvalidOperationException_WhenEnlistmentExpired()
    {
        // Arrange: Patient with 2025 enlistment that expired on 2025-12-31
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-EXPIRED",
            FirstName = "Elias",
            LastName = "Piloto",
            ContactNumber = "09173334455",
            DateOfBirth = new DateOnly(1982, 3, 10),
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    EffectiveYear = 2025,
                    Status = YakapEnlistmentStatus.Expired,
                    Source = YakapEnlistmentSource.ClinicEnlistment,
                    EnlistmentDate = new DateOnly(2025, 1, 10),
                    ValidUntil = new DateOnly(2025, 12, 31),
                    CaseNo = "C000921202500042",
                    EnlistmentTransNo = "E000921202500042",
                    ProfilingTransNo = "P000921202500042"
                }
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

        // Verify DB unchanged: encounter PhilHealthCaseNo remains null
        encounter.PhilHealthCaseNo.Should().BeNull();
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_ThrowsInvalidOperationException_WhenEnlistmentTransferred()
    {
        // Arrange: Patient with 2026 enlistment marked Transferred
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-XFER",
            FirstName = "Sisa",
            LastName = "Basilio",
            ContactNumber = "09174445566",
            DateOfBirth = new DateOnly(1975, 8, 22),
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    EffectiveYear = 2026,
                    Status = YakapEnlistmentStatus.Transferred,
                    Source = YakapEnlistmentSource.PhilHealthMasterlist,
                    EnlistmentDate = new DateOnly(2026, 1, 1),
                    ValidUntil = new DateOnly(2026, 12, 31),
                    CaseNo = "C000921202600099",
                    EnlistmentTransNo = "E000921202600099",
                    ProfilingTransNo = "P000921202600099"
                }
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
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-RENEW",
            FirstName = "Basilio",
            LastName = "Crispin",
            ContactNumber = "09175556677",
            DateOfBirth = new DateOnly(2000, 12, 25),
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    EffectiveYear = 2025,
                    Status = YakapEnlistmentStatus.Expired,
                    Source = YakapEnlistmentSource.ClinicEnlistment,
                    EnlistmentDate = new DateOnly(2025, 1, 10),
                    ValidUntil = new DateOnly(2025, 12, 31),
                    CaseNo = "C000921202500050",
                    EnlistmentTransNo = "E000921202500050",
                    ProfilingTransNo = "P000921202500050"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    EffectiveYear = 2026,
                    Status = YakapEnlistmentStatus.Active,
                    Source = YakapEnlistmentSource.ClinicEnlistment,
                    EnlistmentDate = new DateOnly(2026, 1, 15),
                    ValidUntil = new DateOnly(2026, 12, 31)
                }
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

        patient.YakapEnlistments.Should().HaveCount(2);

        // 2025 entry completely preserved
        var e2025 = patient.YakapEnlistments.First(e => e.EffectiveYear == 2025);
        e2025.Status.Should().Be(YakapEnlistmentStatus.Expired);
        e2025.CaseNo.Should().Be("C000921202500050");
        e2025.EnlistmentTransNo.Should().Be("E000921202500050");

        // 2026 entry updated with newly generated numbers
        var e2026 = patient.YakapEnlistments.First(e => e.EffectiveYear == 2026);
        e2026.Status.Should().Be(YakapEnlistmentStatus.Active);
        e2026.CaseNo.Should().Be(result.CaseNumber);
        e2026.EnlistmentTransNo.Should().Be(result.EnlistmentTransactionNumber);
        e2026.ProfilingTransNo.Should().Be(result.ProfilingTransactionNumber);

        encounter.PhilHealthCaseNo.Should().Be(result.CaseNumber);
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_PreservesPastEnlistedAtDate()
    {
        // Arrange: Patient with historical registration date from external eGovPH portal
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-PASTDATE",
            FirstName = "Padre",
            LastName = "Florentino",
            ContactNumber = "09176667788",
            DateOfBirth = new DateOnly(1960, 4, 12),
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    EffectiveYear = 2026,
                    Status = YakapEnlistmentStatus.Active,
                    Source = YakapEnlistmentSource.SelfReported,
                    EnlistmentDate = new DateOnly(2026, 1, 3), // Enlisted at start of year via eGovPH
                    ValidUntil = new DateOnly(2026, 12, 31)
                }
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

        var entry = patient.YakapEnlistments.Single();

        // EnlistmentDate MUST retain its original historical value
        entry.EnlistmentDate.Should().Be(new DateOnly(2026, 1, 3));
        entry.Source.Should().Be(YakapEnlistmentSource.SelfReported);
        entry.ValidUntil.Should().Be(new DateOnly(2026, 12, 31));
        entry.CaseNo.Should().Be(result.CaseNumber);
    }

    [Fact]
    public async Task AssignPatientJourneyNumbersAsync_Succeeds_WithoutEncounter_AllocatesPatientKeysOnly()
    {
        // Arrange
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-NOENC",
            FirstName = "Isagani",
            LastName = "Lopez",
            ContactNumber = "09177778899",
            DateOfBirth = new DateOnly(1995, 2, 14),
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = _tenantId,
                    ClinicId = _clinicId,
                    EffectiveYear = 2026,
                    Status = YakapEnlistmentStatus.Active,
                    Source = YakapEnlistmentSource.ClinicEnlistment,
                    EnlistmentDate = new DateOnly(2026, 1, 10),
                    ValidUntil = new DateOnly(2026, 12, 31)
                }
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

        patient.YakapEnlistments.Single().CaseNo.Should().Be(result.CaseNumber);
    }
}
