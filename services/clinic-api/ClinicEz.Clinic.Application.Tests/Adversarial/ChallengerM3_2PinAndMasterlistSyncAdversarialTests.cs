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
/// Empirical Adversarial Stress Testing Suite by Challenger 2 for Milestone 3 (M3).
/// Specifically validates:
/// 1. PhilHealthPinNormalizer:
///    - All valid permutations (hyphenated, spaced, mixed whitespace, leading zeros, raw 12 digits, shorter/longer padding).
///    - Zero-placeholder suppression ("000000000000", "00-000000000-0", "0", "", null, whitespace, non-digits -> returns null).
/// 2. PhilHealthMasterlistSyncService:
///    - Control number preservation (case_no, enlistment_no, profiling_trans_no strictly retained during status update to Active or Transferred).
///    - Multi-year chronological retention (2026 sync preserves 2024 and 2025 enlistments in sorted order).
///    - Idempotency (running sync multiple times with identical data maintains identical state without duplicates).
///    - XML synchronization robustness and zero-placeholder rejection during XML extraction.
///    - Tenant and Clinic boundary security under adversarial conditions.
/// </summary>
public class ChallengerM3_2PinAndMasterlistSyncAdversarialTests
{
    // =========================================================================
    // SECTION 1: PhilHealthPinNormalizer Adversarial Permutation Tests
    // =========================================================================

    [Theory]
    [InlineData("12-345678901-2", "123456789012")]
    [InlineData("12 345678901 2", "123456789012")]
    [InlineData("  12 - 345678901 - 2  ", "123456789012")]
    [InlineData("\t12-\n345678901-2\r\n", "123456789012")]
    [InlineData("03-026307850-7", "030263078507")]
    [InlineData("00-123456789-0", "001234567890")]
    [InlineData("123456789012", "123456789012")]
    [InlineData("12345", "000000012345")]
    [InlineData("1-2345", "000000012345")]
    [InlineData("12345678901", "012345678901")] // 11 digits left-padded
    [InlineData("99123456789012", "123456789012")] // 14 digits taking last 12
    [InlineData("PIN: 12-345678901-2 (Active)", "123456789012")]
    public void PinNormalizer_ValidPermutations_NormalizeToExact12Digits(string rawPin, string expected)
    {
        var normalized = PhilHealthPinNormalizer.Normalize(rawPin);
        normalized.Should().Be(expected);
        PhilHealthPinNormalizer.IsValidPin(rawPin).Should().BeTrue();
    }

    [Theory]
    [InlineData("000000000000")]
    [InlineData("00-000000000-0")]
    [InlineData("0")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("   ")]
    [InlineData("0000 0000 0000")]
    [InlineData("00000000000")]
    [InlineData("00000000000000")]
    [InlineData("0-0-0-0-0-0-0-0-0-0-0-0")]
    [InlineData("N/A")]
    [InlineData("NONE")]
    [InlineData("PENDING")]
    [InlineData("   -   -   ")]
    [InlineData("???")]
    public void PinNormalizer_ZeroPlaceholdersAndInvalid_StrictlyReturnNull(string? rawPin)
    {
        var normalized = PhilHealthPinNormalizer.Normalize(rawPin);
        normalized.Should().BeNull();
        PhilHealthPinNormalizer.IsValidPin(rawPin).Should().BeFalse();
    }

    // =========================================================================
    // SECTION 2: Zero-Placeholder Masterlist Non-Matching Guarantee
    // =========================================================================

    [Theory]
    [InlineData("000000000000")]
    [InlineData("00-000000000-0")]
    [InlineData("0")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("N/A")]
    public async Task MasterlistSync_ZeroPlaceholderPins_NeverMatchOrCorruptPatients(string? patientPin)
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-zero-pin-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var unassignedPatient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-ZERO-001",
            FirstName = "Unassigned",
            LastName = "Patient",
            PhilHealthNumber = patientPin,
            ContactNumber = "09170000001",
            DateOfBirth = new DateOnly(1995, 5, 20),
            Sex = BiologicalSex.Male
        };
        dbContext.Patients.Add(unassignedPatient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // Incoming masterlist items with all-zeros or valid PINs
        var incomingItems = new List<YakapMasterlistSyncItem>
        {
            new("000000000000", "2026-01-15", "1", "2026"),
            new("00-000000000-0", "2026-01-15", "1", "2026"),
            new("12-345678901-2", "2026-01-15", "1", "2026")
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, incomingItems);

        // Assert: zero matches
        result.MatchedPatientsCount.Should().Be(0);
        result.UnmatchedBeneficiariesCount.Should().Be(3);

        var patientFromDb = await dbContext.Patients.FirstAsync(p => p.Id == unassignedPatient.Id);
        patientFromDb.GetYakapEnlistments().Should().BeEmpty();
    }

    // =========================================================================
    // SECTION 3: Control Number Preservation Stress Tests
    // =========================================================================

    [Fact]
    public async Task MasterlistSync_StatusActive_StrictlyRetainsAllPreExistingControlNumbers()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-ctrl-no-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-CTRL-PRESERVE-01",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09180000001",
            DateOfBirth = new DateOnly(1980, 1, 1),
            Sex = BiologicalSex.Male
        };

        const string initialCaseNo = "C00921202600001";
        const string initialEnlistNo = "E00921202600001";
        const string initialProfTransNo = "P00921202600001";

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = initialCaseNo,
            EnlistmentTransNo = initialEnlistNo,
            ProfilingTransNo = initialProfTransNo
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // Masterlist update arrives with different format PIN and updated date
        var items = new List<YakapMasterlistSyncItem>
        {
            new(
                Pin: "123456789012", // Raw unhyphenated
                AssignedDate: "2026-02-15",
                AssignedStatus: "1", // Active
                EffectiveYear: "2026")
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);
        result.ActiveEnlistmentsCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = updatedPatient.GetYakapEnlistments();

        enlistments.Should().ContainSingle();
        var entry = enlistments[0];
        entry.EffectiveYear.Should().Be(2026);
        entry.Status.Should().Be(YakapEnlistmentStatus.Active);
        entry.EnlistmentDate.Should().Be(new DateOnly(2026, 2, 15));
        entry.Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);

        // All 3 control numbers MUST be strictly retained!
        entry.CaseNo.Should().Be(initialCaseNo);
        entry.EnlistmentTransNo.Should().Be(initialEnlistNo);
        entry.ProfilingTransNo.Should().Be(initialProfTransNo);
    }

    [Theory]
    [InlineData("2")]
    [InlineData("Transferred")]
    [InlineData("TRANSFERRED")]
    public async Task MasterlistSync_StatusTransferred_UpdatesStatus_AndStrictlyRetainsControlNumbers(string assignedStatus)
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-ctrl-no-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-CTRL-PRESERVE-02",
            FirstName = "Maria",
            LastName = "Clara",
            PhilHealthNumber = "03-026307850-7",
            ContactNumber = "09180000002",
            DateOfBirth = new DateOnly(1985, 6, 12),
            Sex = BiologicalSex.Female
        };

        const string initialCaseNo = "C00921202600002";
        const string initialEnlistNo = "E00921202600002";
        const string initialProfTransNo = "P00921202600002";

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 5),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = initialCaseNo,
            EnlistmentTransNo = initialEnlistNo,
            ProfilingTransNo = initialProfTransNo
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        var items = new List<YakapMasterlistSyncItem>
        {
            new(
                Pin: "030263078507",
                AssignedDate: "2026-03-01",
                AssignedStatus: assignedStatus,
                EffectiveYear: "2026")
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);
        result.TransferredCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var entry = updatedPatient.GetYakapEnlistments().Single(e => e.EffectiveYear == 2026);

        entry.Status.Should().Be(YakapEnlistmentStatus.Transferred);
        entry.EnlistmentDate.Should().Be(new DateOnly(2026, 3, 1));
        entry.Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);

        // Control numbers strictly retained
        entry.CaseNo.Should().Be(initialCaseNo);
        entry.EnlistmentTransNo.Should().Be(initialEnlistNo);
        entry.ProfilingTransNo.Should().Be(initialProfTransNo);

        // Verification that strict guard rejects future encounters on this transferred enlistment
        Action act = () => updatedPatient.ResolveActiveEnlistmentOrThrow(DateOnly.Parse("2026-04-01"));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Transferred*");
    }

    // =========================================================================
    // SECTION 4: Multi-Year Chronological Retention Stress Tests
    // =========================================================================

    [Fact]
    public async Task MasterlistSync_MultiYearHistory_Preserves2024And2025_WhenSynchronizing2026()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-multi-year-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-MULTI-01",
            FirstName = "Melchora",
            LastName = "Aquino",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09180000003",
            DateOfBirth = new DateOnly(1930, 1, 6),
            Sex = BiologicalSex.Female
        };

        // Historical 2024 enlistment
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2024,
            EnlistmentDate = new DateOnly(2024, 2, 1),
            ValidUntil = new DateOnly(2024, 12, 31),
            Status = YakapEnlistmentStatus.Expired,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = "C00921202400010",
            EnlistmentTransNo = "E00921202400010",
            ProfilingTransNo = "P00921202400010"
        });

        // Historical 2025 enlistment
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 15),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Expired,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = "C00921202500055",
            EnlistmentTransNo = "E00921202500055",
            ProfilingTransNo = "P00921202500055"
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // Syncing 2026 masterlist
        var items = new List<YakapMasterlistSyncItem>
        {
            new("123456789012", "2026-01-20", "1", "2026")
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);

        var updatedPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = updatedPatient.GetYakapEnlistments();

        enlistments.Should().HaveCount(3, "All 3 annual enlistments (2024, 2025, 2026) must exist");

        // Strict chronological ordering: 2024 -> 2025 -> 2026
        enlistments[0].EffectiveYear.Should().Be(2024);
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Expired);
        enlistments[0].CaseNo.Should().Be("C00921202400010");

        enlistments[1].EffectiveYear.Should().Be(2025);
        enlistments[1].Status.Should().Be(YakapEnlistmentStatus.Expired);
        enlistments[1].CaseNo.Should().Be("C00921202500055");

        enlistments[2].EffectiveYear.Should().Be(2026);
        enlistments[2].Status.Should().Be(YakapEnlistmentStatus.Active);
        enlistments[2].EnlistmentDate.Should().Be(new DateOnly(2026, 1, 20));
        enlistments[2].Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
    }

    // =========================================================================
    // SECTION 5: Idempotency Stress Tests
    // =========================================================================

    [Fact]
    public async Task MasterlistSync_IsStrictlyIdempotent_RunningThreeTimesProducesIdenticalState()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-idempotency-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-IDEM-01",
            FirstName = "Apolinario",
            LastName = "Mabini",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09180000004",
            DateOfBirth = new DateOnly(1864, 7, 23),
            Sex = BiologicalSex.Male
        };

        const string caseNo = "C00921202600777";
        const string enlistNo = "E00921202600777";
        const string profNo = "P00921202600777";

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = caseNo,
            EnlistmentTransNo = enlistNo,
            ProfilingTransNo = profNo
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        var items = new List<YakapMasterlistSyncItem>
        {
            new("123456789012", "2026-01-10", "1", "2026")
        };

        // Act - Run 1
        var result1 = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items);

        // Act - Run 2 (Immediately after)
        var result2 = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items);

        // Act - Run 3 (Third repetition)
        var result3 = await syncService.SyncAssignmentsAsync(tenantId, clinicId, items);

        // Assert
        result1.MatchedPatientsCount.Should().Be(1);
        result2.MatchedPatientsCount.Should().Be(1);
        result3.MatchedPatientsCount.Should().Be(1);

        var finalPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = finalPatient.GetYakapEnlistments();

        enlistments.Should().ContainSingle("Idempotent sync must not create duplicate benefit year entries");
        enlistments[0].EffectiveYear.Should().Be(2026);
        enlistments[0].EnlistmentDate.Should().Be(new DateOnly(2026, 1, 10));
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        enlistments[0].Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
        enlistments[0].CaseNo.Should().Be(caseNo);
        enlistments[0].EnlistmentTransNo.Should().Be(enlistNo);
        enlistments[0].ProfilingTransNo.Should().Be(profNo);
    }

    [Fact]
    public async Task MasterlistSync_DuplicateItemsInSameBatch_IsDeduplicatedCleanly()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-idempotency-batch-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-BATCH-01",
            FirstName = "Gregorio",
            LastName = "del Pilar",
            PhilHealthNumber = "03-026307850-7",
            ContactNumber = "09180000005",
            DateOfBirth = new DateOnly(1875, 11, 14),
            Sex = BiologicalSex.Male
        };
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // Batch contains duplicates of same patient with different date / same year
        var batchItems = new List<YakapMasterlistSyncItem>
        {
            new("03-026307850-7", "2026-01-01", "1", "2026"),
            new("030263078507", "2026-01-15", "1", "2026"), // Same PIN, unhyphenated, later date
            new(" 03 026307850 7 ", "2026-01-20", "1", "2026") // Spaced PIN, latest date
        };

        // Act
        var result = await syncService.SyncAssignmentsAsync(tenantId, clinicId, batchItems);

        // Assert
        result.TotalProcessed.Should().Be(3);
        result.MatchedPatientsCount.Should().Be(3); // Processed 3 items for 1 patient

        var finalPatient = await dbContext.Patients.FirstAsync(p => p.Id == patient.Id);
        var enlistments = finalPatient.GetYakapEnlistments();

        enlistments.Should().ContainSingle("Duplicate entries for same effective year must collapse into one entry");
        enlistments[0].EffectiveYear.Should().Be(2026);
        enlistments[0].EnlistmentDate.Should().Be(new DateOnly(2026, 1, 20), "Latest assigned date wins");
        enlistments[0].Status.Should().Be(YakapEnlistmentStatus.Active);
    }

    // =========================================================================
    // SECTION 6: XML Synchronization Adversarial Parsing & Extraction Tests
    // =========================================================================

    [Fact]
    public async Task SyncXmlAsync_ParsesVariedPinFormats_AndRejectsZeroPlaceholders()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-xml-adversarial-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patientActive = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-XML-01",
            FirstName = "Teresa",
            LastName = "Magbanua",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09180000006",
            DateOfBirth = new DateOnly(1868, 10, 13),
            Sex = BiologicalSex.Female
        };

        var patientTransferred = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-XML-02",
            FirstName = "Marcelo",
            LastName = "del Pilar",
            PhilHealthNumber = "030263078507",
            ContactNumber = "09180000007",
            DateOfBirth = new DateOnly(1850, 8, 30),
            Sex = BiologicalSex.Male
        };

        dbContext.Patients.AddRange(patientActive, patientTransferred);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // XML payload containing varied PIN formats and a dummy all-zero placeholder
        const string xmlPayload = """
            <?xml version="1.0" encoding="utf-8"?>
            <KONSULTA_MASTERLIST pAccreNo="000921" pYear="2026">
                <!-- Patient 1: Active, raw PIN format -->
                <ASSIGNMENT pAssignedPin="123456789012" pAssignedDate="2026-01-10" pAssignedStatus="1" pEffYear="2026" pAssignedLastName="Magbanua" pAssignedFirstName="Teresa" />
                <!-- Patient 2: Transferred, hyphenated PIN format -->
                <ASSIGNMENT pAssignedPin="03-026307850-7" pAssignedDate="2026-02-15" pAssignedStatus="2" pEffYear="2026" pAssignedLastName="del Pilar" pAssignedFirstName="Marcelo" />
                <!-- Adversarial Entry: All-zero placeholder PIN -->
                <ASSIGNMENT pAssignedPin="00-000000000-0" pAssignedDate="2026-01-01" pAssignedStatus="1" pEffYear="2026" pAssignedLastName="Dummy" pAssignedFirstName="Zero" />
            </KONSULTA_MASTERLIST>
            """;

        // Act
        var result = await syncService.SyncXmlAsync(tenantId, clinicId, xmlPayload);

        // Assert
        result.TotalProcessed.Should().Be(3);
        result.MatchedPatientsCount.Should().Be(2);
        result.ActiveEnlistmentsCount.Should().Be(1);
        result.TransferredCount.Should().Be(1);
        result.UnmatchedBeneficiariesCount.Should().Be(1, "All-zero placeholder must not match any patient");

        var updatedActive = await dbContext.Patients.FirstAsync(p => p.Id == patientActive.Id);
        updatedActive.GetYakapEnlistments().Should().ContainSingle();
        updatedActive.GetYakapEnlistments()[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        updatedActive.GetYakapEnlistments()[0].EnlistmentDate.Should().Be(new DateOnly(2026, 1, 10));

        var updatedTransferred = await dbContext.Patients.FirstAsync(p => p.Id == patientTransferred.Id);
        updatedTransferred.GetYakapEnlistments().Should().ContainSingle();
        updatedTransferred.GetYakapEnlistments()[0].Status.Should().Be(YakapEnlistmentStatus.Transferred);
        updatedTransferred.GetYakapEnlistments()[0].EnlistmentDate.Should().Be(new DateOnly(2026, 2, 15));
    }

    // =========================================================================
    // SECTION 7: Tenant & Clinic Boundary Security Isolation
    // =========================================================================

    [Fact]
    public async Task MasterlistSync_EnforcesTenantIsolation_DoesNotCrossTenantBoundaries()
    {
        // Arrange
        var clinicIdA = Guid.NewGuid();
        var clinicIdB = Guid.NewGuid();
        var tenantA = "tenant_isolation_alpha";
        var tenantB = "tenant_isolation_beta";

        var clinicContextA = Substitute.For<IClinicContext>();
        clinicContextA.ClinicId.Returns(clinicIdA);
        clinicContextA.TenantId.Returns(tenantA);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContextA);

        // Same PhilHealth PIN in two different tenants
        var patientInTenantA = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantA,
            ClinicId = clinicIdA,
            PatientCode = "PAT-A-01",
            FirstName = "Jose",
            LastName = "Rizal",
            PhilHealthNumber = "12-345678901-2",
            ContactNumber = "09180000008",
            DateOfBirth = new DateOnly(1861, 6, 19),
            Sex = BiologicalSex.Male
        };

        var patientInTenantB = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantB,
            ClinicId = clinicIdB,
            PatientCode = "PAT-B-01",
            FirstName = "Impostor",
            LastName = "Rizal",
            PhilHealthNumber = "12-345678901-2", // Same PIN
            ContactNumber = "09180000009",
            DateOfBirth = new DateOnly(1861, 6, 19),
            Sex = BiologicalSex.Male
        };

        dbContext.Patients.AddRange(patientInTenantA, patientInTenantB);
        await dbContext.SaveChangesAsync();

        var syncService = new PhilHealthMasterlistSyncService(dbContext, null, clinicContextA);

        var items = new List<YakapMasterlistSyncItem>
        {
            new("123456789012", "2026-01-25", "1", "2026")
        };

        // Act - Sync specifically for Tenant A
        var result = await syncService.SyncAssignmentsAsync(tenantA, clinicIdA, items);

        // Assert
        result.MatchedPatientsCount.Should().Be(1);
        result.MatchedPatientCodes.Should().Contain("PAT-A-01");
        result.MatchedPatientCodes.Should().NotContain("PAT-B-01");

        var updatedA = await dbContext.Patients.FirstAsync(p => p.Id == patientInTenantA.Id);
        updatedA.GetYakapEnlistments().Should().ContainSingle();

        // Tenant B patient must have zero enlistments
        var updatedB = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == patientInTenantB.Id);
        updatedB.GetYakapEnlistments().Should().BeEmpty();
    }
}
