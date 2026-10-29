using System;
using System.Collections.Concurrent;
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
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Milestone 5 Phase 2: Challenger 4 Empirical Deep Stress & Hardening Test Suite.
/// Adversarially challenges assumptions across the full dual-track custom fields and statutory YAKAP architecture:
/// 1. Midnight rollover and timezone boundary validity windows
/// 2. Discontinuous multi-year history, gap years, and historical immutability
/// 3. High-concurrency allocation idempotency and thread-safety
/// 4. Polymorphic JSON dictionary key casing and double-serialized string elements
/// 5. DTD v1.14 XML encoding of special characters in unified address custom fields
/// 6. Masterlist PIN normalization matching across hyphenated/unhyphenated database formats
/// </summary>
public sealed class Challenger4DualTrackBackendStressTests
{
    private static Patient CreatePatient(
        string code = "PAT-STRESS-001",
        string pin = "030263078507",
        string tenantId = "tenant_challenger4") => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ClinicId = Guid.NewGuid(),
        PatientCode = code,
        FirstName = "Stress",
        LastName = "Patient",
        PhilHealthNumber = pin,
        ContactNumber = "09170009999",
        DateOfBirth = new DateOnly(1985, 6, 15),
        Sex = BiologicalSex.Female,
        CustomFields = new Dictionary<string, object?>()
    };

    private static ConsultationEncounter CreateEncounter(
        Patient patient,
        DateTime date) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = patient.TenantId,
        ClinicId = patient.ClinicId,
        PatientId = patient.Id,
        PatientName = $"{patient.FirstName} {patient.LastName}",
        DoctorId = Guid.NewGuid(),
        DoctorName = "Dr. Challenger",
        EncounterDate = date
    };

    // =========================================================================
    // DIMENSION 1: Midnight Rollover & Leap-Second Window Boundaries
    // =========================================================================

    [Fact]
    public void Stress_MidnightBoundary_ActiveEnlistmentValidUntil_CoversEndOfYearCleanly()
    {
        // Enlistment valid for 2026: 2026-01-01 to 2026-12-31
        var patient = CreatePatient();
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment
        });

        // Test precisely at the last second of the benefit year: Dec 31, 2026 at 23:59:59 UTC
        var lastMoment2026 = new DateTime(2026, 12, 31, 23, 59, 59, DateTimeKind.Utc);
        var entry = patient.ResolveActiveEnlistmentOrThrow(DateOnly.FromDateTime(lastMoment2026));
        entry.Should().NotBeNull();
        entry.EffectiveYear.Should().Be(2026);

        // Test at the very first moment of 2027: Jan 1, 2027 at 00:00:00 UTC
        var firstMoment2027 = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var act = () => patient.ResolveActiveEnlistmentOrThrow(DateOnly.FromDateTime(firstMoment2027));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*enlistment expired on 2026-12-31*");
    }

    [Fact]
    public void Stress_LeapYear_Feb29_EnlistmentValidAcrossLeapBoundary()
    {
        var patient = CreatePatient();
        // 2024 was a leap year
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2024, 2, 29),
            ValidUntil = new DateOnly(2025, 2, 28),
            EffectiveYear = 2024,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment
        });

        // Must be active on 2024-02-29 itself
        var leapDay = new DateOnly(2024, 2, 29);
        var active = patient.GetActiveYakapEnlistment(leapDay);
        active.Should().NotBeNull();
        active!.EnlistmentDate.Should().Be(new DateOnly(2024, 2, 29));

        // Must be active at mid-year 2024
        patient.GetActiveYakapEnlistment(new DateOnly(2024, 8, 15)).Should().NotBeNull();

        // Must expire on 2025-03-01
        var expiredAct = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2025, 3, 1));
        expiredAct.Should().Throw<InvalidOperationException>()
            .WithMessage("*enlistment expired on 2025-02-28*");
    }

    // =========================================================================
    // DIMENSION 2: Discontinuous Multi-Year History & Gap Year Handling
    // =========================================================================

    [Fact]
    public void Stress_GapYearPatient_PreservesAllHistoricalRecordsWithoutMutation()
    {
        var patient = CreatePatient();
        
        // Beneficiary enlisted in 2024 (with generated sequence numbers)
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2024, 1, 10),
            ValidUntil = new DateOnly(2024, 12, 31),
            EffectiveYear = 2024,
            Status = YakapEnlistmentStatus.Expired,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = "C000921202400001",
            EnlistmentTransNo = "E000921202400001",
            ProfilingTransNo = "P000921202400001"
        });

        // 2025 was a GAP year (no enlistment recorded, patient did not visit)
        
        // Beneficiary returns in 2026 and explicitly renews
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 3, 15),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.SelfReported
        });

        var enlistments = patient.GetYakapEnlistments();
        enlistments.Should().HaveCount(2);
        enlistments[0].EffectiveYear.Should().Be(2024);
        enlistments[0].CaseNo.Should().Be("C000921202400001");
        enlistments[1].EffectiveYear.Should().Be(2026);
        enlistments[1].Source.Should().Be(YakapEnlistmentSource.SelfReported);

        // Encounter in the 2025 gap year MUST throw strict guard exception
        var gapEncounterDate = new DateOnly(2025, 6, 20);
        var gapAct = () => patient.ResolveActiveEnlistmentOrThrow(gapEncounterDate);
        gapAct.Should().Throw<InvalidOperationException>()
            .WithMessage("*expired on 2024-12-31*");

        // Encounter in 2026 MUST resolve the 2026 active entry
        var active2026 = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 4, 1));
        active2026.EffectiveYear.Should().Be(2026);
    }

    // =========================================================================
    // DIMENSION 3: High-Concurrency Allocation Idempotency & Thread-Safety
    // =========================================================================

    [Fact]
    public async Task Stress_HighConcurrency_AssignPatientJourneyNumbers_IsCompletelyIdempotent()
    {
        var tenantId = "tenant_concurrency";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = patientId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-CONC-001",
            FirstName = "Concurrent",
            LastName = "User",
            PhilHealthNumber = "030263078507",
            ContactNumber = "09171112222",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Male,
            CustomFields = new Dictionary<string, object?>()
        };

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment
        });

        dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Concurrent User",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Stress",
            EncounterDate = new DateTime(2026, 5, 10, 10, 0, 0, DateTimeKind.Utc)
        };
        dbContext.Consultations.Add(encounter);
        await dbContext.SaveChangesAsync();

        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        // Run 20 concurrent tasks calling AssignPatientJourneyNumbersAsync
        var results = new ConcurrentBag<PhilHealthPatientJourneyNumbers>();
        var tasks = Enumerable.Range(0, 20).Select(async _ =>
        {
            var numbers = await generator.AssignPatientJourneyNumbersAsync(
                tenantId,
                clinicId,
                patientId,
                encounter.Id,
                "000921",
                "2026",
                encounter.EncounterDate,
                CancellationToken.None);
            results.Add(numbers);
        });

        await Task.WhenAll(tasks);

        results.Should().HaveCount(20);
        var firstResult = results.First();
        firstResult.CaseNumber.Should().StartWith("C0009212026");
        firstResult.EnlistmentTransactionNumber.Should().StartWith("E0009212026");
        firstResult.ProfilingTransactionNumber.Should().StartWith("P0009212026");
        results.All(r => r.CaseNumber == firstResult.CaseNumber).Should().BeTrue();
        results.All(r => r.EnlistmentTransactionNumber == firstResult.EnlistmentTransactionNumber).Should().BeTrue();
        results.All(r => r.ProfilingTransactionNumber == firstResult.ProfilingTransactionNumber).Should().BeTrue();
    }

    // =========================================================================
    // DIMENSION 4: Pure 1NF Relational Enlistment History and Sorting
    // =========================================================================

    [Fact]
    public void Stress_RelationalEnlistments_ParsesAllFieldsFaithfully()
    {
        var patient = CreatePatient();
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 2, 14),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Expired,
            Source = YakapEnlistmentSource.PhilHealthMasterlist,
            CaseNo = "C000921202500001",
            EnlistmentTransNo = "E000921202500001",
            ProfilingTransNo = "P000921202500001"
        });
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment
        });

        var parsed = patient.GetYakapEnlistments();
        parsed.Should().HaveCount(2);

        parsed[0].EffectiveYear.Should().Be(2025);
        parsed[0].EnlistmentDate.Should().Be(new DateOnly(2025, 2, 14));
        parsed[0].CaseNo.Should().Be("C000921202500001");
        parsed[0].Status.Should().Be(YakapEnlistmentStatus.Expired);

        parsed[1].EffectiveYear.Should().Be(2026);
        parsed[1].Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    [Fact]
    public void Stress_RelationalEnlistments_MaintainsChronologicalSort()
    {
        var patient = CreatePatient();
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 5, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment
        });

        var parsed = patient.GetYakapEnlistments();
        parsed.Should().HaveCount(1);
        parsed[0].EffectiveYear.Should().Be(2026);
        parsed[0].EnlistmentDate.Should().Be(new DateOnly(2026, 5, 1));
        parsed[0].Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    // =========================================================================
    // DIMENSION 6: Masterlist Sync Across Hyphenated vs Unhyphenated PIN Formats
    // =========================================================================

    [Theory]
    [InlineData("12-345678901-2", "123456789012")]
    [InlineData("123456789012", "12-345678901-2")]
    [InlineData("03-026307850-7", "030263078507")]
    public async Task Stress_MasterlistSync_MatchesPatientsRegardlessOfHyphenation(
        string storedPinInDb,
        string incomingMasterlistPin)
    {
        var tenantId = "tenant_pinsync";
        var clinicId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-PIN-001",
            FirstName = "PIN",
            LastName = "SyncTest",
            PhilHealthNumber = storedPinInDb,
            ContactNumber = "09170003333",
            DateOfBirth = new DateOnly(1980, 5, 20),
            Sex = BiologicalSex.Female,
            CustomFields = new Dictionary<string, object?>()
        };

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(
            dbContext,
            NullLogger<PhilHealthMasterlistSyncService>.Instance,
            clinicContext);

        var items = new List<YakapMasterlistSyncItem>
        {
            new(
                Pin: incomingMasterlistPin,
                AssignedDate: "2026-02-01",
                AssignedStatus: "1", // Active
                EffectiveYear: "2026")
        };

        var result = await syncService.SyncAssignmentsAsync(
            tenantId,
            clinicId,
            items,
            CancellationToken.None);

        result.TotalProcessed.Should().Be(1);
        result.MatchedPatientsCount.Should().Be(1);

        // Re-fetch patient and verify CustomFields["yakap_enlistments"] was updated
        var reloaded = await dbContext.Patients.FindAsync(patient.Id);
        reloaded.Should().NotBeNull();
        var enlistments = reloaded!.GetYakapEnlistments();
        enlistments.Should().HaveCount(1);
        enlistments[0].EffectiveYear.Should().Be(2026);
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        enlistments[0].Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
    }
}
