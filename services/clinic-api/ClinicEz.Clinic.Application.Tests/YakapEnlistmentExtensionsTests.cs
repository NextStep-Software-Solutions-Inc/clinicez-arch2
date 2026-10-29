using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class YakapEnlistmentExtensionsTests
{
    private static Patient CreatePatientWithEnlistments(params PatientYakapEnlistment[] enlistments)
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_test",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-2026-0001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09171234567",
            YakapEnlistments = new List<PatientYakapEnlistment>(enlistments)
        };

        foreach (var e in patient.YakapEnlistments)
        {
            e.PatientId = patient.Id;
            e.ClinicId = patient.ClinicId;
            e.TenantId = patient.TenantId;
        }

        return patient;
    }

    [Fact]
    public void GetYakapEnlistments_WhenCollectionEmpty_ReturnsEmptyList()
    {
        var patient = CreatePatientWithEnlistments();
        patient.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void GetYakapEnlistments_WhenEntitiesPresent_ReturnsChronologicalOrder()
    {
        var e2026 = new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 15),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = "C000921202600001",
            EnlistmentTransNo = "E000921202600001",
            ProfilingTransNo = "P000921202600001"
        };
        var e2025 = new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 2, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Expired,
            Source = YakapEnlistmentSource.PhilHealthMasterlist,
            CaseNo = "C000921202500001"
        };

        var patient = CreatePatientWithEnlistments(e2026, e2025);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(2);
        entries[0].EffectiveYear.Should().Be(2025);
        entries[0].Status.Should().Be(YakapEnlistmentStatus.Expired);
        entries[1].EffectiveYear.Should().Be(2026);
        entries[1].Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    [Fact]
    public void AddOrRenewYakapEnlistment_PreservesPreviousYearsEntries()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 10),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Expired,
            Source = YakapEnlistmentSource.PhilHealthMasterlist,
            CaseNo = "C000921202500001"
        });

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 5),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment
        });

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(2);
        entries[0].EffectiveYear.Should().Be(2025);
        entries[0].CaseNo.Should().Be("C000921202500001");
        entries[1].EffectiveYear.Should().Be(2026);
        entries[1].Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    [Fact]
    public void AddOrRenewYakapEnlistment_RetainsExistingControlNumbersWhenUpdating()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 10),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = "C000921202600001",
            EnlistmentTransNo = "E000921202600001",
            ProfilingTransNo = "P000921202600001"
        });

        // Update validity date without providing new control numbers
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 10),
            ValidUntil = new DateOnly(2027, 1, 10),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment
        });

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].ValidUntil.Should().Be(new DateOnly(2027, 1, 10));
        entries[0].CaseNo.Should().Be("C000921202600001");
        entries[0].EnlistmentTransNo.Should().Be("E000921202600001");
        entries[0].ProfilingTransNo.Should().Be("P000921202600001");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsOnMissingEnlistments()
    {
        var patient = CreatePatientWithEnlistments();
        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-06-01*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsOnExpired()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            EffectiveYear = 2025,
            Status = YakapEnlistmentStatus.Expired
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1), 2026);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-06-01*")
            .WithMessage("*expire*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsOnTransferred()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Transferred
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*is marked as Transferred*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_SucceedsOnActiveCoveringEntry()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600001"
        });

        var entry = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1));
        entry.Should().NotBeNull();
        entry.CaseNo.Should().Be("C000921202600001");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsWhenEncounterDateBeforeEnlistedAt()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 6, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 3, 15));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-03-15*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsWhenEncounterDateAfterCustomValidUntil()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 6, 30),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 9, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-09-01*")
            .WithMessage("*2026-06-30*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsWhenStatusRemainsActiveAfterCalendarExpiry()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            EffectiveYear = 2025,
            Status = YakapEnlistmentStatus.Active
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 1, 15), 2025);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-01-15*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ExactStartAndEndDates_CoverAccurately()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 3, 1),
            ValidUntil = new DateOnly(2026, 9, 30),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600001"
        });

        // Exact start date -> covered
        patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 3, 1)).CaseNo.Should().Be("C000921202600001");

        // Exact end date -> covered
        patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 9, 30)).CaseNo.Should().Be("C000921202600001");

        // 1 day before start -> throws
        var actBefore = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 2, 28));
        actBefore.Should().Throw<InvalidOperationException>();

        // 1 day after end -> throws
        var actAfter = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 10, 1));
        actAfter.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void ResolveActiveEnlistmentForYearOrThrow_SucceedsForActiveBenefitYear_WithoutEncounter()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 2, 15),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600099"
        });

        var entry = patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        entry.Should().NotBeNull();
        entry.CaseNo.Should().Be("C000921202600099");
    }

    [Fact]
    public void ResolveActiveEnlistmentForYearOrThrow_ThrowsWhenYearIsTransferred()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Transferred
        });

        var act = () => patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*is marked as Transferred*");
    }

    [Fact]
    public void ResolveActiveEnlistmentForYearOrThrow_ThrowsWhenYearIsExpired()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            EffectiveYear = 2025,
            Status = YakapEnlistmentStatus.Expired
        });

        var act = () => patient.ResolveActiveEnlistmentForYearOrThrow(2025);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*expired*");
    }

    [Fact]
    public void ResolveActiveEnlistmentForYearOrThrow_ThrowsWhenYearNotFound()
    {
        var patient = CreatePatientWithEnlistments(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            EffectiveYear = 2025,
            Status = YakapEnlistmentStatus.Active
        });

        var act = () => patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment for benefit year 2026*");
    }
}
