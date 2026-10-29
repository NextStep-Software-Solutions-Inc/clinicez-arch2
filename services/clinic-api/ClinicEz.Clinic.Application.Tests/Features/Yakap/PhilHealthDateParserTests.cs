using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

public class PhilHealthDateParserTests
{
    [Theory]
    [InlineData("2026-01-15", "2026-01-15")]
    [InlineData("2026-1-5", "2026-01-05")]
    [InlineData("2026-01-05", "2026-01-05")]
    [InlineData("2024-02-29", "2024-02-29")]
    [InlineData("2025-12-31", "2025-12-31")]
    [InlineData("2026-01-01", "2026-01-01")]
    [InlineData("20260115", "2026-01-15")]
    public void TryNormalizeDate_ValidStandardDates_ReturnsNormalizedIsoDate(string input, string expected)
    {
        var success = PhilHealthDateParser.TryNormalizeDate(input, out var normalized);
        success.Should().BeTrue();
        normalized.Should().Be(expected);
    }

    [Theory]
    [InlineData("2026-01-15 08:30:00", "2026-01-15")]
    [InlineData("2026-01-15T23:59:59.999Z", "2026-01-15")]
    [InlineData("2026-01-15 23:59:59.999Z", "2026-01-15")]
    [InlineData("2026-01-15 01:00:00", "2026-01-15")]
    [InlineData("2026-01-15T01:00:00+08:00", "2026-01-15")]
    [InlineData("2026-01-15T23:00:00-05:00", "2026-01-15")]
    [InlineData("  2026-01-15T23:59:59.999Z  ", "2026-01-15")]
    [InlineData("2026-01-15t12:00:00", "2026-01-15")]
    [InlineData("2026-07-20T00:00:00Z", "2026-07-20")]
    public void TryNormalizeDate_TimestampsAndOffsets_PreservesCalendarDateWithoutTimezoneSkew(string input, string expected)
    {
        var success = PhilHealthDateParser.TryNormalizeDate(input, out var normalized);
        success.Should().BeTrue();
        normalized.Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("invalid")]
    [InlineData("not-a-date")]
    [InlineData("2025-02-29")] // Non-leap year
    [InlineData("2026-13-01")]
    public void TryNormalizeDate_InvalidInputs_ReturnsFalseAndNull(string? input)
    {
        var success = PhilHealthDateParser.TryNormalizeDate(input, out var normalized);
        success.Should().BeFalse();
        normalized.Should().BeNull();
    }

    [Fact]
    public void NormalizeOrDefault_ValidDate_ReturnsNormalizedDate()
    {
        var result = PhilHealthDateParser.NormalizeOrDefault("2026-07-20T12:00:00Z", "2026-01-01");
        result.Should().Be("2026-07-20");
    }

    [Fact]
    public void NormalizeOrDefault_InvalidDate_ReturnsDefaultDate()
    {
        var result = PhilHealthDateParser.NormalizeOrDefault("invalid-date", "2026-01-01");
        result.Should().Be("2026-01-01");
    }

    [Fact]
    public void TryParseDate_ValidDate_ReturnsDateOnly()
    {
        var success = PhilHealthDateParser.TryParseDate("2026-01-15T23:59:59.999Z", out var dateOnly);
        success.Should().BeTrue();
        dateOnly.Should().Be(new DateOnly(2026, 1, 15));
    }

    [Fact]
    public void TryParseDate_InvalidDate_ReturnsFalseAndDefault()
    {
        var success = PhilHealthDateParser.TryParseDate("invalid", out var dateOnly);
        success.Should().BeFalse();
        dateOnly.Should().Be(default);
    }

    [Fact]
    public void ExtractEffectiveYear_FromExplicitEffectiveYear_ReturnsParsedYear()
    {
        var year = PhilHealthDateParser.ExtractEffectiveYear("2025", "2026-07-20T00:00:00Z");
        year.Should().Be(2025);
    }

    [Fact]
    public void ExtractEffectiveYear_FromAssignedDateWhenExplicitYearEmpty_ReturnsDateYear()
    {
        var year = PhilHealthDateParser.ExtractEffectiveYear("", "2026-07-20T00:00:00Z");
        year.Should().Be(2026);
    }

    [Fact]
    public void ExtractEffectiveYear_WhenBothMissing_ReturnsDefaultOrUtcYear()
    {
        var defaultYear = 2028;
        var year = PhilHealthDateParser.ExtractEffectiveYear(null, null, defaultYear);
        year.Should().Be(2028);

        var currentUtcYear = PhilHealthDateParser.ExtractEffectiveYear(null, null);
        currentUtcYear.Should().Be(DateTime.UtcNow.Year);
    }

    [Theory]
    [InlineData("2026-07-20", "2026-07-20", 2026)]
    [InlineData("2026-07-20T00:00:00Z", "2026-07-20", 2026)]
    [InlineData("2026-07-20T08:30:00Z", "2026-07-20", 2026)]
    [InlineData("2026-07-20T08:30:00+08:00", "2026-07-20", 2026)]
    [InlineData("2026-07-20 08:30:00", "2026-07-20", 2026)]
    [InlineData("2026-7-20", "2026-07-20", 2026)]
    public async Task MasterlistSyncService_WithIso8601AssignedDate_CorrectlyExtractsStatutoryDate(
        string rawAssignedDate,
        string expectedEnlistedAt,
        int expectedEffectiveYear)
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-date-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-ISO-01",
            FirstName = "Maria",
            LastName = "Santos",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09170000001",
            DateOfBirth = new DateOnly(1985, 5, 15),
            Sex = BiologicalSex.Female
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        var items = new List<YakapMasterlistSyncItem>
        {
            new(
                Pin: "123456789012",
                AssignedDate: rawAssignedDate,
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
        enlistments[0].EnlistmentDate.Should().Be(DateOnly.Parse(expectedEnlistedAt));
        enlistments[0].EffectiveYear.Should().Be(expectedEffectiveYear);
        enlistments[0].ValidUntil.Should().Be(new DateOnly(expectedEffectiveYear, 12, 31));
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Active);
    }
}
