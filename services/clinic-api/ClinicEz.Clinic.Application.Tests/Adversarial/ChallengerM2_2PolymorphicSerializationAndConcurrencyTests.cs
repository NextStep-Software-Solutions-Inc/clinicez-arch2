using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Milestone 2 Challenger 2:
/// 1. Pure 1NF relational PatientYakapEnlistments querying, renewal, and sorting.
/// 2. Effective year and date window lifecycle management.
/// 3. Retaining existing control numbers on update without regression.
/// 4. Strict no-auto-renewal guards (throws when expired, throws when transferred).
/// 5. Sequence generator concurrency stress testing, thread volume, and race condition resilience.
/// 6. Boundary conditions (leap year, exact date cutoffs).
/// </summary>
public sealed class ChallengerM2_2PolymorphicSerializationAndConcurrencyTests
{
    private static Patient CreatePatient()
    {
        return new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-001",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09181234567",
            YakapEnlistments = new List<PatientYakapEnlistment>()
        };
    }

    // =========================================================================
    // SECTION 1: RELATIONAL ENLISTMENTS COLLECTION INTEGRITY
    // =========================================================================

    [Fact]
    public void WhenPatientOrYakapEnlistmentsNull_ReturnsEmptyListWithoutException()
    {
        Patient? nullPatient = null;
        nullPatient.GetYakapEnlistments().Should().BeEmpty();

        var patientWithNullList = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-002",
            FirstName = "Gregoria",
            LastName = "de Jesus",
            ContactNumber = "09187654321",
            YakapEnlistments = null!
        };
        patientWithNullList.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void WhenNoEnlistments_HasActiveReturnsFalse()
    {
        var patient = CreatePatient();
        patient.HasActiveYakapEnlistment(new DateOnly(2026, 6, 1)).Should().BeFalse();
        patient.GetActiveYakapEnlistment(new DateOnly(2026, 6, 1)).Should().BeNull();
        patient.HasEverEnlistedInYakap().Should().BeFalse();
    }

    [Fact]
    public void AddOrRenewYakapEnlistment_InsertsNewRelationalEntity()
    {
        var patient = CreatePatient();
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 2, 15),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = "C000921202600100",
            EnlistmentTransNo = "E000921202600100",
            ProfilingTransNo = "P000921202600100"
        });

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].EnlistmentDate.Should().Be(new DateOnly(2026, 2, 15));
        entries[0].ValidUntil.Should().Be(new DateOnly(2026, 12, 31));
        entries[0].EffectiveYear.Should().Be(2026);
        entries[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        entries[0].Source.Should().Be(YakapEnlistmentSource.ClinicEnlistment);
        entries[0].CaseNo.Should().Be("C000921202600100");
        entries[0].EnlistmentTransNo.Should().Be("E000921202600100");
        entries[0].ProfilingTransNo.Should().Be("P000921202600100");
    }

    // =========================================================================
    // SECTION 2: CHRONOLOGICAL ORDERING & MUTATION
    // =========================================================================

    [Fact]
    public void SetYakapEnlistments_EnforcesChronologicalOrdering()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-ORDER",
            FirstName = "Melchora",
            LastName = "Aquino",
            ContactNumber = "09183334444"
        };

        var unsorted = new[]
        {
            new PatientYakapEnlistment { EnlistmentDate = new DateOnly(2027, 1, 10), EffectiveYear = 2027 },
            new PatientYakapEnlistment { EnlistmentDate = new DateOnly(2025, 5, 1), EffectiveYear = 2025 },
            new PatientYakapEnlistment { EnlistmentDate = new DateOnly(2026, 1, 1), EffectiveYear = 2026 }
        };

        patient.SetYakapEnlistments(unsorted);

        var retrieved = patient.GetYakapEnlistments();
        retrieved.Should().HaveCount(3);
        retrieved[0].EffectiveYear.Should().Be(2025);
        retrieved[1].EffectiveYear.Should().Be(2026);
        retrieved[2].EffectiveYear.Should().Be(2027);
    }

    [Fact]
    public void AddOrRenewYakapEnlistment_PreservesExistingControlNumbers_WhenUpdatingDates()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-RENEW",
            FirstName = "Emilio",
            LastName = "Aguinaldo",
            ContactNumber = "09185556666"
        };

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600123",
            EnlistmentTransNo = "E000921202600123",
            ProfilingTransNo = "P000921202600123"
        });

        // Extend validity into next year without specifying control numbers
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2027, 3, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        });

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].ValidUntil.Should().Be(new DateOnly(2027, 3, 31));
        entries[0].CaseNo.Should().Be("C000921202600123");
        entries[0].EnlistmentTransNo.Should().Be("E000921202600123");
        entries[0].ProfilingTransNo.Should().Be("P000921202600123");
    }

    [Fact]
    public void CancelAndSuspend_UpdatesStatusAndReasons()
    {
        var patient = CreatePatient();
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });

        patient.SuspendYakapEnlistment(2026, "Temporary suspension");
        var suspended = patient.YakapEnlistments!.Single();
        suspended.Status.Should().Be(YakapEnlistmentStatus.Suspended);
        suspended.SuspensionReason.Should().Be("Temporary suspension");
        suspended.SuspendedAt.Should().NotBeNull();

        patient.CancelYakapEnlistment(2026, "User requested");
        var cancelled = patient.YakapEnlistments!.Single();
        cancelled.Status.Should().Be(YakapEnlistmentStatus.Cancelled);
        cancelled.Remarks.Should().Be("User requested");
    }

    // =========================================================================
    // SECTION 3: STRICT NO-AUTO-RENEWAL GUARD VERIFICATION
    // =========================================================================

    [Fact]
    public void StrictGuard_ThrowsWhenEnlistmentExpired()
    {
        var patient = CreatePatient();
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Expired
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 4, 15));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-04-15*")
            .WithMessage("*expired on 2025-12-31*");
    }

    [Fact]
    public void StrictGuard_ThrowsWhenEnlistmentTransferred()
    {
        var patient = CreatePatient();
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Transferred
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 5, 20));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*is marked as Transferred*");
    }

    // =========================================================================
    // SECTION 4: SEQUENCE ALLOCATION CONCURRENCY & IDEMPOTENCY
    // =========================================================================

    [Fact]
    public async Task Concurrency_SequentialAllocations_IncrementDeterministically()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_1";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var c1 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");
        var c2 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");
        var c3 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");

        c1.Should().Be("C000921202600001");
        c2.Should().Be("C000921202600002");
        c3.Should().Be("C000921202600003");
    }

    [Fact]
    public async Task Concurrency_AssignPatientJourneyNumbersAsync_IsIdempotentOnRepeatedCalls()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_idemp";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-ADV-IDEMP",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09181112233",
            DateOfBirth = new DateOnly(1980, 10, 23),
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    EnlistmentDate = new DateOnly(2026, 1, 1),
                    ValidUntil = new DateOnly(2026, 12, 31),
                    EffectiveYear = 2026,
                    Status = YakapEnlistmentStatus.Active
                }
            }
        };
        dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Luna",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 6, 1, 10, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        dbContext.Consultations.Add(encounter);
        await dbContext.SaveChangesAsync();

        // Call 1
        var result1 = await generator.AssignPatientJourneyNumbersAsync(
            tenantId, clinicId, patient.Id, encounter.Id, "000921", "2026");

        // Call 2
        var result2 = await generator.AssignPatientJourneyNumbersAsync(
            tenantId, clinicId, patient.Id, encounter.Id, "000921", "2026");

        // Call 3
        var result3 = await generator.AssignPatientJourneyNumbersAsync(
            tenantId, clinicId, patient.Id, encounter.Id, "000921", "2026");

        // Numbers must be completely identical across all calls
        result2.CaseNumber.Should().Be(result1.CaseNumber);
        result2.EnlistmentTransactionNumber.Should().Be(result1.EnlistmentTransactionNumber);
        result2.ProfilingTransactionNumber.Should().Be(result1.ProfilingTransactionNumber);
        result2.SoapTransactionNumber.Should().Be(result1.SoapTransactionNumber);

        result3.CaseNumber.Should().Be(result1.CaseNumber);
    }

    [Fact]
    public async Task Concurrency_MultiplePatients_AllocatesUniqueSequentialNumbers()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_multi";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        const int patientCount = 20;
        var allocatedCaseNumbers = new List<string>();

        for (int i = 1; i <= patientCount; i++)
        {
            var patient = new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                PatientCode = $"PAT-MULTI-{i:D3}",
                FirstName = $"Patient{i}",
                LastName = "Test",
                ContactNumber = "09180000000",
                YakapEnlistments = new List<PatientYakapEnlistment>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        EnlistmentDate = new DateOnly(2026, 1, 1),
                        ValidUntil = new DateOnly(2026, 12, 31),
                        EffectiveYear = 2026,
                        Status = YakapEnlistmentStatus.Active
                    }
                }
            };
            dbContext.Patients.Add(patient);
            await dbContext.SaveChangesAsync();

            var result = await generator.AssignPatientJourneyNumbersAsync(
                tenantId, clinicId, patient.Id, null, "000921", "2026");

            allocatedCaseNumbers.Add(result.CaseNumber);
        }

        // Verify all 20 case numbers are strictly unique
        allocatedCaseNumbers.Should().HaveCount(patientCount);
        allocatedCaseNumbers.Distinct().Should().HaveCount(patientCount);

        // Verify strictly formatted and sequential from 1 to 20
        for (int i = 1; i <= patientCount; i++)
        {
            allocatedCaseNumbers[i - 1].Should().Be($"C0009212026{i:D5}");
        }
    }

    [Fact]
    public async Task Concurrency_ParallelTasks_WithSharedDb_AllocatesUniqueCaseNumbers()
    {
        var dbName = $"ClinicEz_SharedTestDb_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_parallel";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        // Pre-seed tracker with sequence 0
        var (setupDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, clinicContext);
        await using (setupDb)
        {
            var tracker = new PhilHealthSequenceTracker
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                SequenceType = PhilHealthSequenceType.Case,
                EffectiveYear = "2026",
                CurrentSequence = 0,
                LastAssignedAt = DateTime.UtcNow
            };
            setupDb.PhilHealthSequenceTrackers.Add(tracker);
            await setupDb.SaveChangesAsync();
        }

        const int concurrencyDegree = 10;
        var generatedNumbers = new ConcurrentBag<string>();

        // Run sequential batch across distinct contexts to verify sequence increment
        var tasks = Enumerable.Range(1, concurrencyDegree).Select(async i =>
        {
            var (ctx, _, _) = TestDbHelper.CreateSharedTestContext(dbName, clinicContext);
            var gen = new PhilHealthSequenceGenerator(ctx, NullLogger<PhilHealthSequenceGenerator>.Instance);
            var num = await gen.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");
            generatedNumbers.Add(num);
        });

        await Task.WhenAll(tasks);

        // All numbers must be distinct
        generatedNumbers.Should().HaveCount(concurrencyDegree);
        generatedNumbers.Distinct().Should().HaveCount(concurrencyDegree);
    }

    // =========================================================================
    // SECTION 5: BOUNDARY CONDITIONS & MULTI-YEAR RESOLUTION
    // =========================================================================

    [Fact]
    public void Boundary_IsCoveringDate_ExactStartAndEndDates_CoverAccurately()
    {
        var entry = new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 3, 1),
            ValidUntil = new DateOnly(2026, 3, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        };

        // Day before start
        entry.IsCoveringDate(new DateOnly(2026, 2, 28)).Should().BeFalse();
        // Exact start day
        entry.IsCoveringDate(new DateOnly(2026, 3, 1)).Should().BeTrue();
        // Mid period
        entry.IsCoveringDate(new DateOnly(2026, 3, 15)).Should().BeTrue();
        // Exact end day
        entry.IsCoveringDate(new DateOnly(2026, 3, 31)).Should().BeTrue();
        // Day after end
        entry.IsCoveringDate(new DateOnly(2026, 4, 1)).Should().BeFalse();
    }

    [Fact]
    public void Boundary_LeapYear_HandlesFebruary29WithoutCrash()
    {
        var entry = new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2024, 2, 29),
            ValidUntil = new DateOnly(2024, 12, 31),
            EffectiveYear = 2024,
            Status = YakapEnlistmentStatus.Active
        };

        entry.IsCoveringDate(new DateOnly(2024, 2, 29)).Should().BeTrue();
        entry.IsCoveringDate(new DateOnly(2024, 3, 1)).Should().BeTrue();
        entry.IsCoveringDate(new DateOnly(2024, 2, 28)).Should().BeFalse();
    }

    [Fact]
    public void MultiYear_TransferredInCurrentYear_DoesNotBlockPriorActiveYearResolution()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-001",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09181234567",
            YakapEnlistments = new List<PatientYakapEnlistment>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = "tenant_adv_m2",
                    ClinicId = Guid.NewGuid(),
                    EnlistmentDate = new DateOnly(2025, 1, 1),
                    ValidUntil = new DateOnly(2025, 12, 31),
                    EffectiveYear = 2025,
                    Status = YakapEnlistmentStatus.Active
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = "tenant_adv_m2",
                    ClinicId = Guid.NewGuid(),
                    EnlistmentDate = new DateOnly(2026, 1, 1),
                    ValidUntil = new DateOnly(2026, 12, 31),
                    EffectiveYear = 2026,
                    Status = YakapEnlistmentStatus.Transferred
                }
            }
        };

        var resolved2025 = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2025, 6, 15));
        resolved2025.Should().NotBeNull();
        resolved2025.EffectiveYear.Should().Be(2025);
    }
}
