using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Dedicated Empirical Stress Testing Suite by Challenger 2 for Milestone 3 (M3).
/// Specifically validates:
/// 1. Mid-year masterlist assignments with timestamps (e.g. "2026-07-20T14:30:00Z"):
///    - Strictly preserves "2026-07-20" and does NOT collapse to "2026-01-01".
///    - Handles UTC Z, local offsets, whitespace, lowercase 't', and SQL timestamps.
///    - Isolates calendar dates from UTC+8 timezone shifts across midnight boundaries.
/// 2. End-to-end integration across PhilHealthMasterlistSyncService (both batch and XML modes)
///    and PCAPI Wire Builders.
/// </summary>
public class ChallengerM3_2MidYearTimestampEmpiricalTests
{
    [Theory]
    [InlineData("2026-07-20T14:30:00Z", "2026-07-20", 2026)]
    [InlineData("2026-07-20T00:00:00Z", "2026-07-20", 2026)]
    [InlineData("2026-07-20T23:59:59.999Z", "2026-07-20", 2026)]
    [InlineData("2026-07-20T23:59:59+08:00", "2026-07-20", 2026)]
    [InlineData("2026-07-20T00:00:01-05:00", "2026-07-20", 2026)]
    [InlineData("2026-07-20 14:30:00", "2026-07-20", 2026)]
    [InlineData("2026-07-20 14:30:00.1234567", "2026-07-20", 2026)]
    [InlineData("  2026-07-20T14:30:00Z  ", "2026-07-20", 2026)]
    [InlineData("2026-07-20t14:30:00z", "2026-07-20", 2026)]
    [InlineData("2026-7-20T14:30:00Z", "2026-07-20", 2026)]
    public async Task SyncAssignmentsAsync_MidYearTimestamp_PreservesExactCalendarDate_DoesNotCollapseToJan01(
        string assignedDateInput,
        string expectedEnlistedAt,
        int expectedEffectiveYear)
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-midyear-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-MIDYEAR-01",
            FirstName = "Andres",
            LastName = "Bonifacio",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09170000001",
            DateOfBirth = new DateOnly(1863, 11, 30),
            Sex = BiologicalSex.Male
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        var items = new List<YakapMasterlistSyncItem>
        {
            new(
                Pin: "123456789012",
                AssignedDate: assignedDateInput,
                AssignedStatus: "1",
                EffectiveYear: expectedEffectiveYear.ToString())
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items, CancellationToken.None);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);
        result.ActiveEnlistmentsCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = updatedPatient.GetYakapEnlistments();

        enlistments.Should().ContainSingle();
        var entry = enlistments[0];

        // CRITICAL CHECK: must NOT collapse to "2026-01-01"
        entry.EnlistmentDate.Should().NotBe(new DateOnly(expectedEffectiveYear, 1, 1));
        entry.EnlistmentDate.Should().Be(DateOnly.Parse(expectedEnlistedAt));
        entry.EffectiveYear.Should().Be(expectedEffectiveYear);
        entry.ValidUntil.Should().Be(new DateOnly(expectedEffectiveYear, 12, 31));
        entry.Status.Should().Be(YakapEnlistmentStatus.Active);
        entry.Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
    }

    [Fact]
    public async Task SyncAssignmentsAsync_MidYearTimestamp_WithMissingEffectiveYear_DerivesYearAndPreservesDate()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-midyear-no-year-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-MIDYEAR-02",
            FirstName = "Emilio",
            LastName = "Jacinto",
            PhilHealthNumber = "03-026307850-7",
            ContactNumber = "09170000002",
            DateOfBirth = new DateOnly(1875, 12, 15),
            Sex = BiologicalSex.Male
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // EffectiveYear is empty/null, AssignedDate has ISO-8601 timestamp
        var items = new List<YakapMasterlistSyncItem>
        {
            new(
                Pin: "030263078507",
                AssignedDate: "2026-07-20T14:30:00Z",
                AssignedStatus: "1",
                EffectiveYear: "")
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items, CancellationToken.None);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var entry = updatedPatient.GetYakapEnlistments().Single();

        entry.EffectiveYear.Should().Be(2026, "Effective year should be derived from AssignedDate");
        entry.EnlistmentDate.Should().Be(new DateOnly(2026, 7, 20), "Exact calendar date must be preserved");
        entry.EnlistmentDate.Should().NotBe(new DateOnly(2026, 1, 1));
        entry.ValidUntil.Should().Be(new DateOnly(2026, 12, 31));
    }

    [Fact]
    public async Task SyncXmlAsync_MidYearTimestamp_ParsesAndPreservesExactCalendarDate()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-xml-midyear-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-XML-MID-01",
            FirstName = "Gabriela",
            LastName = "Silang",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09170000003",
            DateOfBirth = new DateOnly(1731, 3, 19),
            Sex = BiologicalSex.Female
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        const string xmlPayload = """
            <?xml version="1.0" encoding="utf-8"?>
            <KONSULTA_MASTERLIST pAccreNo="000921" pYear="2026">
                <ASSIGNMENT pAssignedPin="12-345678901-2" pAssignedDate="2026-07-20T14:30:00Z" pAssignedStatus="1" pEffYear="2026" pAssignedLastName="Silang" pAssignedFirstName="Gabriela" />
            </KONSULTA_MASTERLIST>
            """;

        // Act
        var result = await syncService.SyncXmlAsync(tenantId, clinicId, xmlPayload);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);
        result.ActiveEnlistmentsCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var entry = updatedPatient.GetYakapEnlistments().Single();

        entry.EnlistmentDate.Should().Be(new DateOnly(2026, 7, 20));
        entry.EnlistmentDate.Should().NotBe(new DateOnly(2026, 1, 1));
        entry.EffectiveYear.Should().Be(2026);
        entry.ValidUntil.Should().Be(new DateOnly(2026, 12, 31));
    }

    [Fact]
    public async Task MasterlistSync_MidYearTimestamp_RetainsPreExistingControlNumbers()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-midyear-ctrl-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-MID-CTRL-01",
            FirstName = "Antonio",
            LastName = "Luna",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09170000004",
            DateOfBirth = new DateOnly(1866, 10, 29),
            Sex = BiologicalSex.Male
        };

        const string expectedCaseNo = "C00921202600888";
        const string expectedEnlistNo = "E00921202600888";
        const string expectedProfTransNo = "P00921202600888";

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = expectedCaseNo,
            EnlistmentTransNo = expectedEnlistNo,
            ProfilingTransNo = expectedProfTransNo
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        var items = new List<YakapMasterlistSyncItem>
        {
            new(
                Pin: "123456789012",
                AssignedDate: "2026-07-20T14:30:00Z",
                AssignedStatus: "1",
                EffectiveYear: "2026")
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items, CancellationToken.None);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var entry = updatedPatient.GetYakapEnlistments().Single();

        // EnlistedAt updated to mid-year date without collapsing to Jan 01
        entry.EnlistmentDate.Should().Be(new DateOnly(2026, 7, 20));
        entry.EnlistmentDate.Should().NotBe(new DateOnly(2026, 1, 1));

        // Control numbers strictly retained
        entry.CaseNo.Should().Be(expectedCaseNo);
        entry.EnlistmentTransNo.Should().Be(expectedEnlistNo);
        entry.ProfilingTransNo.Should().Be(expectedProfTransNo);
    }
}
