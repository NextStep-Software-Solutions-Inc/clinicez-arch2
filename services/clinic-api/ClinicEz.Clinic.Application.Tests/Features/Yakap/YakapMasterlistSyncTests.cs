using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

public class YakapMasterlistSyncTests
{
    [Theory]
    [InlineData("12-345678901-2", "123456789012")]
    [InlineData("12 345678901 2", "123456789012")]
    [InlineData("03-026307850-7", "030263078507")]
    [InlineData("12345", "000000012345")]
    [InlineData("   123456789012   ", "123456789012")]
    public void NormalizePin_HandlesAllSupportedVariations(string rawPin, string expected)
    {
        var result = PhilHealthPinNormalizer.Normalize(rawPin);
        result.Should().Be(expected);
        PhilHealthPinNormalizer.IsValidPin(rawPin).Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("000000000000")]
    [InlineData("00-000000000-0")]
    public void NormalizePin_ReturnsNull_ForEmptyOrAllZeros(string? rawPin)
    {
        var result = PhilHealthPinNormalizer.Normalize(rawPin);
        result.Should().BeNull();
        PhilHealthPinNormalizer.IsValidPin(rawPin).Should().BeFalse();
    }

    [Fact]
    public async Task ExtractMasterlist_MatchesPatient_ByNormalizedPin_HyphenatedVsUnhyphenated()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_masterlist_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-M-001",
            FirstName = "Maria",
            LastName = "Santos",
            PhilHealthNumber = "12-345678901-2", // Hyphenated in DB
            ContactNumber = "09170000001",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Female
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var beneficiaries = new List<YakapBeneficiaryDto>
        {
            new(
                PhilHealthIdentificationNumber: "123456789012", // Raw 12-digits in XML/Proxy
                MemberPhilHealthIdentificationNumber: "123456789012",
                LastName: "SANTOS",
                FirstName: "MARIA",
                MiddleName: "",
                ExtensionName: "",
                DateOfBirth: "1990-01-01",
                Sex: "F",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-01-15",
                PackageType: "K",
                AssignedStatus: "1")
        };

        var syncService = new YakapMasterlistSyncService(dbContext, clinicContext);

        // Act
        var syncedCount = await syncService.SyncMasterlistBeneficiariesAsync(beneficiaries, CancellationToken.None);

        // Assert
        syncedCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = updatedPatient.GetYakapEnlistments();

        enlistments.Should().ContainSingle();
        enlistments[0].EffectiveYear.Should().Be(2026);
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        enlistments[0].EnlistmentDate.Should().Be(new DateOnly(2026, 1, 15));
        enlistments[0].ValidUntil.Should().Be(new DateOnly(2026, 12, 31));
        enlistments[0].Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
    }

    [Fact]
    public async Task ExtractMasterlist_MatchesPatient_ByNormalizedPin_UnhyphenatedVsHyphenated()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_masterlist_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-M-002",
            FirstName = "Pedro",
            LastName = "Penduko",
            PhilHealthNumber = "123456789012", // Unhyphenated in DB
            ContactNumber = "09170000002",
            DateOfBirth = new DateOnly(1982, 3, 4),
            Sex = BiologicalSex.Male
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var beneficiaries = new List<YakapBeneficiaryDto>
        {
            new(
                PhilHealthIdentificationNumber: "12-345678901-2", // Hyphenated in XML
                MemberPhilHealthIdentificationNumber: "12-345678901-2",
                LastName: "PENDUKO",
                FirstName: "PEDRO",
                MiddleName: "",
                ExtensionName: "",
                DateOfBirth: "1982-03-04",
                Sex: "M",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-01-20",
                PackageType: "K",
                AssignedStatus: "1")
        };

        var syncService = new YakapMasterlistSyncService(dbContext, clinicContext);

        // Act
        var syncedCount = await syncService.SyncMasterlistBeneficiariesAsync(beneficiaries, CancellationToken.None);

        // Assert
        syncedCount.Should().Be(1);
        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistment = updatedPatient.GetYakapEnlistments().FirstOrDefault(e => e.EffectiveYear == 2026);
        enlistment.Should().NotBeNull();
        enlistment!.Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    [Fact]
    public async Task ExtractMasterlist_AssignedStatus1_SetsStatusToActive()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_masterlist_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-M-003A",
            FirstName = "Clara",
            LastName = "Santos",
            PhilHealthNumber = "03-026307850-7",
            ContactNumber = "09170000003",
            DateOfBirth = new DateOnly(1985, 8, 15),
            Sex = BiologicalSex.Female
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var beneficiaries = new List<YakapBeneficiaryDto>
        {
            new(
                PhilHealthIdentificationNumber: "030263078507",
                MemberPhilHealthIdentificationNumber: "030263078507",
                LastName: "SANTOS",
                FirstName: "CLARA",
                MiddleName: "",
                ExtensionName: "",
                DateOfBirth: "1985-08-15",
                Sex: "F",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-01-10",
                PackageType: "K",
                AssignedStatus: "1")
        };

        var syncService = new YakapMasterlistSyncService(dbContext, clinicContext);

        // Act
        await syncService.SyncMasterlistBeneficiariesAsync(beneficiaries, CancellationToken.None);

        // Assert
        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistment = updatedPatient.GetYakapEnlistments().FirstOrDefault(e => e.EffectiveYear == 2026);
        enlistment.Should().NotBeNull();
        enlistment!.Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    [Fact]
    public async Task ExtractMasterlist_AssignedStatus2_SetsStatusToTransferred()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_masterlist_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-M-003",
            FirstName = "Elena",
            LastName = "Adarna",
            PhilHealthNumber = "030263078507",
            ContactNumber = "09170000003",
            DateOfBirth = new DateOnly(1985, 8, 15),
            Sex = BiologicalSex.Female
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var beneficiaries = new List<YakapBeneficiaryDto>
        {
            new(
                PhilHealthIdentificationNumber: "030263078507",
                MemberPhilHealthIdentificationNumber: "030263078507",
                LastName: "ADARNA",
                FirstName: "ELENA",
                MiddleName: "",
                ExtensionName: "",
                DateOfBirth: "1985-08-15",
                Sex: "F",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-03-01",
                PackageType: "K",
                AssignedStatus: "2") // "2" = Transferred
        };

        var syncService = new YakapMasterlistSyncService(dbContext, clinicContext);

        // Act
        await syncService.SyncMasterlistBeneficiariesAsync(beneficiaries, CancellationToken.None);

        // Assert
        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistment = updatedPatient.GetYakapEnlistments().FirstOrDefault(e => e.EffectiveYear == 2026);
        enlistment.Should().NotBeNull();
        enlistment!.Status.Should().Be(YakapEnlistmentStatus.Transferred);

        // Strictly cannot assign journey control numbers on Transferred entry
        Action act = () => updatedPatient.ResolveActiveEnlistmentOrThrow(DateOnly.Parse("2026-03-15"));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Transferred*");
    }

    [Fact]
    public async Task ExtractMasterlist_PreservesPreExistingControlNumbers()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_masterlist_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-M-004",
            FirstName = "Diego",
            LastName = "Silang",
            PhilHealthNumber = "03-026307850-7",
            ContactNumber = "09170000004",
            DateOfBirth = new DateOnly(1978, 12, 16),
            Sex = BiologicalSex.Male
        };

        // Pre-existing 2026 enlistment with allocated control numbers
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = "tenant-001",
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.AssistedIntake,
            CaseNo = "CINCR009212026010100099",
            ProfilingTransNo = "PINCR009212026010100099"
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var beneficiaries = new List<YakapBeneficiaryDto>
        {
            new(
                PhilHealthIdentificationNumber: "030263078507",
                MemberPhilHealthIdentificationNumber: "030263078507",
                LastName: "SILANG",
                FirstName: "DIEGO",
                MiddleName: "",
                ExtensionName: "",
                DateOfBirth: "1978-12-16",
                Sex: "M",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-01-10", // Updated date from PhilHealth
                PackageType: "K",
                AssignedStatus: "1")
        };

        var syncService = new YakapMasterlistSyncService(dbContext, clinicContext);

        // Act
        await syncService.SyncMasterlistBeneficiariesAsync(beneficiaries, CancellationToken.None);

        // Assert
        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistment = updatedPatient.GetYakapEnlistments().FirstOrDefault(e => e.EffectiveYear == 2026);

        enlistment.Should().NotBeNull();
        enlistment!.EnlistmentDate.Should().Be(new DateOnly(2026, 1, 10), "Enlisted date updated from masterlist");
        enlistment.Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);

        // Control numbers MUST be preserved!
        enlistment.CaseNo.Should().Be("CINCR009212026010100099");
        enlistment.ProfilingTransNo.Should().Be("PINCR009212026010100099");
    }

    [Fact]
    public async Task ExtractMasterlist_PreservesPriorHistoricalBenefitYears()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_masterlist_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-M-005",
            FirstName = "Gabriela",
            LastName = "Silang",
            PhilHealthNumber = "03-026307850-7",
            ContactNumber = "09170000005",
            DateOfBirth = new DateOnly(1980, 3, 19),
            Sex = BiologicalSex.Female
        };

        // Pre-existing 2025 expired entry
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = "tenant-001",
            ClinicId = clinicId,
            PatientId = patient.Id,
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 10),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Expired,
            Source = YakapEnlistmentSource.AssistedIntake,
            CaseNo = "C000921202500001",
            ProfilingTransNo = "P000921202500001"
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var beneficiaries = new List<YakapBeneficiaryDto>
        {
            new(
                PhilHealthIdentificationNumber: "030263078507",
                MemberPhilHealthIdentificationNumber: "030263078507",
                LastName: "SILANG",
                FirstName: "GABRIELA",
                MiddleName: "",
                ExtensionName: "",
                DateOfBirth: "1980-03-19",
                Sex: "F",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-01-15",
                PackageType: "K",
                AssignedStatus: "1")
        };

        var syncService = new YakapMasterlistSyncService(dbContext, clinicContext);

        // Act
        await syncService.SyncMasterlistBeneficiariesAsync(beneficiaries, CancellationToken.None);

        // Assert
        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = updatedPatient.GetYakapEnlistments();

        enlistments.Should().HaveCount(2);
        enlistments[0].EffectiveYear.Should().Be(2025);
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Expired);
        enlistments[0].CaseNo.Should().Be("C000921202500001");

        enlistments[1].EffectiveYear.Should().Be(2026);
        enlistments[1].Status.Should().Be(YakapEnlistmentStatus.Active);
        enlistments[1].Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
    }

    [Fact]
    public async Task ExtractMasterlist_SkipsUnregisteredPatients_Safely()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_masterlist_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var beneficiaries = new List<YakapBeneficiaryDto>
        {
            new(
                PhilHealthIdentificationNumber: "99-999999999-9", // Non-existent in clinic
                MemberPhilHealthIdentificationNumber: "99-999999999-9",
                LastName: "UNKNOWN",
                FirstName: "PERSON",
                MiddleName: "",
                ExtensionName: "",
                DateOfBirth: "1999-12-31",
                Sex: "M",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-01-01",
                PackageType: "K",
                AssignedStatus: "1")
        };

        var syncService = new YakapMasterlistSyncService(dbContext, clinicContext);

        // Act
        var syncedCount = await syncService.SyncMasterlistBeneficiariesAsync(beneficiaries, CancellationToken.None);

        // Assert
        syncedCount.Should().Be(0);
    }

    [Fact]
    public async Task ExtractMasterlist_TenantAndClinicIsolation()
    {
        // Arrange
        var tenantA = "tenant_A";
        var tenantB = "tenant_B";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();

        var clinicContextA = Substitute.For<IClinicContext>();
        clinicContextA.ClinicId.Returns(clinicA);
        clinicContextA.TenantId.Returns(tenantA);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContextA);

        var patientA = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantA,
            ClinicId = clinicA,
            PatientCode = "PAT-A",
            FirstName = "Patient",
            LastName = "A",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09170000001",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Male
        };

        var patientB = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantB,
            ClinicId = clinicB,
            PatientCode = "PAT-B",
            FirstName = "Patient",
            LastName = "B",
            PhilHealthNumber = "12-345678901-2", // Same PIN in different tenant
            ContactNumber = "09170000002",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Female
        };

        dbContext.Patients.AddRange(patientA, patientB);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContextA);

        var items = new List<YakapMasterlistSyncItem>
        {
            new("123456789012", "2026-01-15", "1", "2026")
        };

        // Act - Sync only for Tenant A
        var result = await syncService.SyncAssignmentsAsync(tenantA, clinicA, items);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);
        result.MatchedPatientCodes.Should().Contain("PAT-A");

        var updatedA = await dbContext.Patients.FirstAsync(p => p.Id == patientA.Id);
        updatedA.GetYakapEnlistments().Should().ContainSingle();

        var updatedB = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == patientB.Id);
        updatedB.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public async Task ExtractMasterlist_ControllerEndpoint_CallsProxyAndSynchronizes()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_ctrl_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-CTRL-01",
            FirstName = "Andres",
            LastName = "Bonifacio",
            PhilHealthNumber = "03-026307850-7",
            ContactNumber = "09170000099",
            DateOfBirth = new DateOnly(1863, 11, 30),
            Sex = BiologicalSex.Male
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        var downloadResponse = new MasterlistDownloadResponse(
            AccreNo: "H00000921",
            TransmittalNo: "RH000009212026012000001",
            EffYear: "2026",
            StartDate: "01/01/2026",
            EndDate: "01/20/2026",
            TotalRecords: 1,
            Assignments: new List<MasterlistAssignmentItem>
            {
                new(
                    PatientPin: "030263078507",
                    LastName: "BONIFACIO",
                    FirstName: "ANDRES",
                    MiddleName: "",
                    ExtName: "",
                    BirthDate: "1863-11-30",
                    Sex: "M",
                    AssignedDate: "2026-01-20",
                    Status: "1")
            });

        var proxyClient = Substitute.For<IPhilHealthProxyClient>();
        var pcapiClient = Substitute.For<IYakapPcapiClient>();
        pcapiClient.DownloadBatchMasterlistAsync(Arg.Any<MasterlistBatchRequest>(), Arg.Any<CancellationToken>())
            .Returns(ApiResponse<MasterlistDownloadResponse>.Success(downloadResponse));

        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(dbContext, sieve);
        dbContext.Settings.Add(new FacilitySettings { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, ClinicName = "Test Clinic" });
        await dbContext.SaveChangesAsync();

        var cmdHandler = new SyncYakapMasterlistCommandHandler(pcapiClient, syncService, settingsRepo, clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Any<SyncYakapMasterlistCommand>(), Arg.Any<CancellationToken>())
            .Returns(ci => cmdHandler.Handle(ci.Arg<SyncYakapMasterlistCommand>(), ci.Arg<CancellationToken>()));

        var controller = new YakapTransmittalsController(sender, proxyClient, pcapiClient);

        // Act
        var actionResult = await controller.SyncMasterlist(
            new SyncMasterlistApiRequest(
                StartDate: new DateOnly(2026, 1, 1),
                EndDate: new DateOnly(2026, 1, 20)),
            CancellationToken.None);

        // Assert
        var okResult = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        var apiResponse = okResult.Value.Should().BeOfType<ApiResponse<PortalYakapMasterlistSyncResultDto>>().Subject;
        apiResponse.Succeeded.Should().BeTrue();
        apiResponse.Data!.RecordsUpdated.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = updatedPatient.GetYakapEnlistments();
        enlistments.Should().ContainSingle();
        enlistments[0].EffectiveYear.Should().Be(2026);
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        enlistments[0].EnlistmentDate.Should().Be(new DateOnly(2026, 1, 20));
    }
}
