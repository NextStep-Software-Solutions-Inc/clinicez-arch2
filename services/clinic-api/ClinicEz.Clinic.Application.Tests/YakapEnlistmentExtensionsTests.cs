using System;
using System.Collections.Generic;
using System.Text.Json;
using ClinicEz.Clinic.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class YakapEnlistmentExtensionsTests
{
    private static ClinicPatient CreatePatientWithEnlistments(object? raw)
    {
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_test",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-2026-0001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09171234567"
        };

        if (raw != null)
        {
            patient.CustomFields[ClinicPatientYakapExtensions.YakapEnlistmentsKey] = raw;
        }

        return patient;
    }

    [Fact]
    public void GetYakapEnlistments_WhenCustomFieldsEmpty_ReturnsEmptyList()
    {
        var patient = CreatePatientWithEnlistments(null);
        patient.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void GetYakapEnlistments_WhenListOfDictionaries_ParsesCorrectly()
    {
        var list = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-15",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202600001",
                ["enlistment_no"] = "E000921202600001",
                ["profiling_trans_no"] = "P000921202600001"
            }
        };

        var patient = CreatePatientWithEnlistments(list);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EffectiveYear.Should().Be(2026);
        entries[0].CaseNo.Should().Be("C000921202600001");
        entries[0].EnlistmentNo.Should().Be("E000921202600001");
        entries[0].ProfilingTransNo.Should().Be("P000921202600001");
        entries[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        entries[0].Source.Should().Be(YakapEnlistmentSource.ClinicEnlistment);
    }

    [Fact]
    public void GetYakapEnlistments_WhenJsonElementArray_ParsesCorrectly()
    {
        var json = """
        [
            {
                "enlisted_at": "2025-02-01",
                "valid_until": "2025-12-31",
                "effective_year": "2025",
                "status": "Expired",
                "source": "PhilHealthMasterlist",
                "case_no": "C000921202500001"
            },
            {
                "enlisted_at": "2026-01-10",
                "valid_until": "2026-12-31",
                "effective_year": 2026,
                "status": "Active",
                "source": "ClinicEnlistment",
                "case_no": "C000921202600001"
            }
        ]
        """;
        using var doc = JsonDocument.Parse(json);
        var patient = CreatePatientWithEnlistments(doc.RootElement.Clone());

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(2);
        entries[0].EffectiveYear.Should().Be(2025);
        entries[0].Status.Should().Be(YakapEnlistmentStatus.Expired);
        entries[1].EffectiveYear.Should().Be(2026);
        entries[1].Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    [Fact]
    public void GetYakapEnlistments_WhenRawJsonString_ParsesCorrectly()
    {
        var json = """
        [
            {
                "enlisted_at": "2026-03-01",
                "valid_until": "2026-12-31",
                "effective_year": 2026,
                "status": "Active",
                "source": "SelfReported"
            }
        ]
        """;
        var patient = CreatePatientWithEnlistments(json);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EffectiveYear.Should().Be(2026);
        entries[0].Source.Should().Be(YakapEnlistmentSource.SelfReported);
    }

    [Fact]
    public void AddOrRenewYakapEnlistment_PreservesPreviousYearsEntries()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["source"] = "PhilHealthMasterlist",
                ["case_no"] = "C000921202500001"
            }
        });

        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EnlistedAt = "2026-01-05",
            EffectiveYear = 2026,
            Status = "Active",
            Source = "ClinicEnlistment"
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
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-10",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202600001",
                ["enlistment_no"] = "E000921202600001",
                ["profiling_trans_no"] = "P000921202600001"
            }
        });

        // Update validity date without providing new control numbers
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EnlistedAt = "2026-01-10",
            ValidUntil = "2027-01-10",
            EffectiveYear = 2026,
            Status = "Active",
            Source = "ClinicEnlistment"
        });

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].ValidUntil.Should().Be("2027-01-10");
        entries[0].CaseNo.Should().Be("C000921202600001");
        entries[0].EnlistmentNo.Should().Be("E000921202600001");
        entries[0].ProfilingTransNo.Should().Be("P000921202600001");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsOnMissingEnlistments()
    {
        var patient = CreatePatientWithEnlistments(null);
        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-06-01*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsOnExpired()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired"
            }
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1), 2026);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-06-01*")
            .WithMessage("*expire*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsOnTransferred()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Transferred"
            }
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*is marked as Transferred*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_SucceedsOnActiveCoveringEntry()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C000921202600001"
            }
        });

        var entry = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 6, 1));
        entry.Should().NotBeNull();
        entry.CaseNo.Should().Be("C000921202600001");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsWhenEncounterDateBeforeEnlistedAt()
    {
        // Arrange: Patient enlisted on 2026-06-01, encounter on 2026-03-15
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-06-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active
            }
        });

        // Act & Assert
        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 3, 15));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-03-15*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsWhenEncounterDateAfterCustomValidUntil()
    {
        // Arrange: Patient enlistment valid until 2026-06-30, encounter on 2026-09-01
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-06-30",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active
            }
        });

        // Act & Assert
        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 9, 1));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-09-01*")
            .WithMessage("*2026-06-30*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ThrowsWhenStatusRemainsActiveAfterCalendarExpiry()
    {
        // Arrange: 2025 entry with status="Active", but valid_until was 2025-12-31. Encounter in 2026.
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Active
            }
        });

        // Act & Assert
        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 1, 15), 2025);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-01-15*");
    }

    [Fact]
    public void ResolveActiveEnlistmentOrThrow_StrictGuard_ExactStartAndEndDates_CoverAccurately()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-03-01",
                ["valid_until"] = "2026-09-30",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active,
                ["case_no"] = "C000921202600001"
            }
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
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-02-15",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Active,
                ["case_no"] = "C000921202600099"
            }
        });

        var entry = patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        entry.Should().NotBeNull();
        entry.CaseNo.Should().Be("C000921202600099");
    }

    [Fact]
    public void ResolveActiveEnlistmentForYearOrThrow_ThrowsWhenYearIsTransferred()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = YakapEnlistmentStatus.Transferred
            }
        });

        var act = () => patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*is marked as Transferred*");
    }

    [Fact]
    public void ResolveActiveEnlistmentForYearOrThrow_ThrowsWhenYearIsExpired()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Expired
            }
        });

        var act = () => patient.ResolveActiveEnlistmentForYearOrThrow(2025);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*expired*");
    }

    [Fact]
    public void ResolveActiveEnlistmentForYearOrThrow_ThrowsWhenYearNotFound()
    {
        var patient = CreatePatientWithEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = YakapEnlistmentStatus.Active
            }
        });

        var act = () => patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment for benefit year 2026*");
    }
}
