namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Behaviors;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Application.Features.Audit.Queries;
using ClinicEz.Clinic.Application.Features.Audit.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Audit;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Privacy;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

/// <summary>
/// Empirical Adversarial Challenger Test Suite for Milestone 4 (challenger_m4_1).
/// Rigorously stress-tests:
/// 1. Multi-tenant isolation, cross-tenant ID probing rejection, and cursor replay protection.
/// 2. WORM immutability guard (sync and async, update and delete, attached and detached).
/// 3. CSV export RFC 4180 compliance, UTF-8 BOM bytes (0xEF, 0xBB, 0xBF), zero exposed plaintext PHI, and formula injection behavior.
/// 4. Non-blocking behavior and bounded capacity semantics of IAuditLogQueue under pressure.
/// </summary>
public sealed class AuditChallengerM4EmpiricalTests
{
    private readonly IPhiRedactionService _redactionService = new PhiRedactionService();

    private static (ApplicationDbContext Context, Guid ClinicId, string TenantId, IRepository<ClinicAuditEntry> Repo)
        CreateIsolatedContext(Guid? customClinicId = null, string? customTenantId = null)
    {
        var clinicId = customClinicId ?? Guid.NewGuid();
        var tenantId = customTenantId ?? $"tenant_challenger_m4_{Guid.NewGuid():N}";

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var dbName = $"ClinicEz_ChallengerM4_{Guid.NewGuid()}";
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var context = new ApplicationDbContext(options, config, clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, null!);

        return (context, clinicId, tenantId, repo);
    }

    private static (ApplicationDbContext Context, IRepository<ClinicAuditEntry> Repo)
        CreateContextForExistingDb(string sharedDbName, Guid clinicId, string tenantId)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: sharedDbName)
            .Options;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var context = new ApplicationDbContext(options, config, clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicAuditEntry>(context, null!);

        return (context, repo);
    }

    // =========================================================================
    // DIMENSION 1: Multi-Tenant Isolation & Cross-Tenant ID Probing Rejection
    // =========================================================================

    [Fact]
    public async Task MultiTenantIsolation_SimultaneousQueries_GuaranteesZeroCrossFacilityLeakage()
    {
        // Arrange: Shared physical DB with Clinic Alpha (Makati) and Clinic Beta (BGC)
        var sharedDbName = $"SharedDb_Isolation_{Guid.NewGuid():N}";
        var clinicAlphaId = Guid.NewGuid();
        var clinicBetaId = Guid.NewGuid();
        var tenantId = "tenant_enterprise_ph";

        var (contextAlpha, repoAlpha) = CreateContextForExistingDb(sharedDbName, clinicAlphaId, tenantId);
        var (contextBeta, repoBeta) = CreateContextForExistingDb(sharedDbName, clinicBetaId, tenantId);

        var baseTime = DateTime.UtcNow.AddHours(-1);

        // Seed 10 records into Clinic Alpha
        var alphaEntries = Enumerable.Range(1, 10).Select(i => new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicAlphaId,
            Timestamp = baseTime.AddMinutes(i),
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = $"clinical.encounter.signed_{i}",
            ActorName = $"Dr. Alpha {i}",
            ActorRole = "Physician",
            TargetEntityType = "ConsultationEncounter",
            TargetEntityId = $"ENC-ALPHA-{i}",
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Confidential record #{i} for Clinic Alpha"
        }).ToList();
        await contextAlpha.ClinicAuditEntries.AddRangeAsync(alphaEntries);
        await contextAlpha.SaveChangesAsync();

        // Seed 8 records into Clinic Beta
        var betaEntries = Enumerable.Range(1, 8).Select(i => new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicBetaId,
            Timestamp = baseTime.AddMinutes(i + 15),
            Category = ClinicAuditCategories.Billing,
            Severity = ClinicAuditSeverities.Urgent,
            Action = $"billing.invoice.voided_{i}",
            ActorName = $"Cashier Beta {i}",
            ActorRole = "Cashier",
            TargetEntityType = "Invoice",
            TargetEntityId = $"INV-BETA-{i}",
            Outcome = ClinicAuditOutcomes.Warning,
            Description = $"Void record #{i} for Clinic Beta"
        }).ToList();
        await contextBeta.ClinicAuditEntries.AddRangeAsync(betaEntries);
        await contextBeta.SaveChangesAsync();

        // Act & Assert 1: Query handler for Clinic Beta returns strictly 8 items, 0 from Alpha
        var handlerBeta = new GetAuditLogsQueryHandler(repoBeta);
        var resultBeta = await handlerBeta.Handle(new GetAuditLogsQuery(PageSize: 100), CancellationToken.None);

        resultBeta.Items.Should().HaveCount(8);
        resultBeta.Items.Should().OnlyContain(x => x.ClinicId == clinicBetaId);
        resultBeta.Items.Should().NotContain(x => x.ClinicId == clinicAlphaId);

        // Act & Assert 2: LINQ Projections and Aggregates under Beta context
        var betaCount = await contextBeta.ClinicAuditEntries.CountAsync();
        betaCount.Should().Be(8);

        var hasAlphaRecord = await contextBeta.ClinicAuditEntries.AnyAsync(e => e.ClinicId == clinicAlphaId);
        hasAlphaRecord.Should().BeFalse();

        var betaIds = await contextBeta.ClinicAuditEntries.Select(e => e.Id).ToListAsync();
        betaIds.Should().IntersectWith(betaEntries.Select(e => e.Id));
        betaIds.Should().NotIntersectWith(alphaEntries.Select(e => e.Id));
    }

    [Fact]
    public async Task CrossTenantIdProbing_DirectIdLookup_ReturnsNullOrNotFound()
    {
        // Arrange
        var sharedDbName = $"SharedDb_Probing_{Guid.NewGuid():N}";
        var clinicAlphaId = Guid.NewGuid();
        var clinicBetaId = Guid.NewGuid();
        var tenantId = "tenant_enterprise_ph";

        var (contextAlpha, repoAlpha) = CreateContextForExistingDb(sharedDbName, clinicAlphaId, tenantId);
        var (contextBeta, repoBeta) = CreateContextForExistingDb(sharedDbName, clinicBetaId, tenantId);

        var alphaEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicAlphaId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Emergency,
            Action = "clinical.confidential_psych.accessed",
            ActorName = "Dr. Alpha Psych",
            ActorRole = "Psychiatrist",
            TargetEntityType = "PsychiatricChart",
            TargetEntityId = "PSYCH-SECRET-001",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Confidential psychiatric chart access trail"
        };
        await contextAlpha.ClinicAuditEntries.AddAsync(alphaEntry);
        await contextAlpha.SaveChangesAsync();

        // Act & Assert 1: Attacker in Clinic Beta attempts GetAuditLogDetailQuery with Alpha's entry ID
        var detailHandlerBeta = new GetAuditLogDetailQueryHandler(repoBeta);
        var probedDetail = await detailHandlerBeta.Handle(new GetAuditLogDetailQuery(alphaEntry.Id), CancellationToken.None);
        probedDetail.Should().BeNull("Global query filter must make foreign clinic audit entries completely invisible to detail queries");

        // Act & Assert 2: Attacker in Clinic Beta attempts repository lookup by ID
        var probedFromRepo = await repoBeta.GetByIdAsync(alphaEntry.Id);
        probedFromRepo.Should().BeNull("Repository GetByIdAsync must respect EF Core global query filter and return null");

        // Act & Assert 3: Attacker in Clinic Beta attempts direct query with search for TargetEntityId
        var handlerBeta = new GetAuditLogsQueryHandler(repoBeta);
        var searchResult = await handlerBeta.Handle(new GetAuditLogsQuery(EntityId: "PSYCH-SECRET-001"), CancellationToken.None);
        searchResult.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task CursorReplayProtection_TimestampCursor_CannotAccessForeignRecords()
    {
        // Arrange
        var sharedDbName = $"SharedDb_CursorReplay_{Guid.NewGuid():N}";
        var clinicAlphaId = Guid.NewGuid();
        var clinicBetaId = Guid.NewGuid();
        var tenantId = "tenant_enterprise_ph";

        var (contextAlpha, repoAlpha) = CreateContextForExistingDb(sharedDbName, clinicAlphaId, tenantId);
        var (contextBeta, repoBeta) = CreateContextForExistingDb(sharedDbName, clinicBetaId, tenantId);

        var t0 = DateTime.UtcNow.AddMinutes(-50);

        // Alpha entry timestamp
        var alphaEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicAlphaId,
            Timestamp = t0.AddMinutes(20),
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "clinical.alpha.event",
            ActorName = "Alpha Doctor",
            ActorRole = "Physician",
            TargetEntityType = "AlphaEntity",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Alpha confidential"
        };
        await contextAlpha.ClinicAuditEntries.AddAsync(alphaEntry);
        await contextAlpha.SaveChangesAsync();

        // Beta entries before and after Alpha's timestamp
        var betaEntry1 = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicBetaId,
            Timestamp = t0.AddMinutes(10), // before Alpha
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Routine,
            Action = "operations.beta.old",
            ActorName = "Beta Staff",
            ActorRole = "Staff",
            TargetEntityType = "BetaEntity",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Beta Old"
        };
        var betaEntry2 = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicBetaId,
            Timestamp = t0.AddMinutes(30), // after Alpha
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Routine,
            Action = "operations.beta.new",
            ActorName = "Beta Staff",
            ActorRole = "Staff",
            TargetEntityType = "BetaEntity",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Beta New"
        };
        await contextBeta.ClinicAuditEntries.AddRangeAsync(betaEntry1, betaEntry2);
        await contextBeta.SaveChangesAsync();

        // Act: Attacker in Clinic Beta replays the exact ISO-8601 cursor from Clinic Alpha's entry
        var alphaCursor = alphaEntry.Timestamp.ToUniversalTime().ToString("o");
        var handlerBeta = new GetAuditLogsQueryHandler(repoBeta);

        var queryWithAlphaCursor = await handlerBeta.Handle(
            new GetAuditLogsQuery(Before: alphaCursor, PageSize: 10),
            CancellationToken.None);

        // Assert: Strictly returns ONLY Beta records before that timestamp (betaEntry1), and zero Alpha records
        queryWithAlphaCursor.Items.Should().HaveCount(1);
        queryWithAlphaCursor.Items[0].Id.Should().Be(betaEntry1.Id);
        queryWithAlphaCursor.Items.Should().NotContain(x => x.ClinicId == clinicAlphaId);

        // Malformed / Hostile SQL Injection cursor string
        var maliciousCursor = "2026-10-17T00:00:00Z' OR '1'='1";
        var queryWithMaliciousCursor = await handlerBeta.Handle(
            new GetAuditLogsQuery(Before: maliciousCursor, PageSize: 10),
            CancellationToken.None);

        // Does not crash, ignores invalid cursor format, returns current page for Beta
        queryWithMaliciousCursor.Items.Should().HaveCount(2);
        queryWithMaliciousCursor.Items.Should().OnlyContain(x => x.ClinicId == clinicBetaId);
    }

    // =========================================================================
    // DIMENSION 2: Dual-Layer WORM Immutability Guard
    // =========================================================================

    [Fact]
    public async Task WormImmutability_DirectEntityModification_ThrowsInvalidOperationException()
    {
        var (context, clinicId, tenantId, _) = CreateIsolatedContext();

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Billing,
            Severity = ClinicAuditSeverities.Routine,
            Action = "billing.payment.recorded",
            ActorName = "Cashier Bob",
            ActorRole = "Cashier",
            TargetEntityType = "Invoice",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Official payment collected PHP 500"
        };

        await context.ClinicAuditEntries.AddAsync(entry);
        await context.SaveChangesAsync();

        // Malicious update attempt
        entry.Description = "Tampered payment amount PHP 50";
        var actAsync = () => context.SaveChangesAsync();

        var ex = await actAsync.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*append-only (WORM)*RA 10173*");
    }

    [Fact]
    public void WormImmutability_SynchronousSaveChanges_EnforcesWormGuard()
    {
        var (context, clinicId, tenantId, _) = CreateIsolatedContext();

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Security,
            Severity = ClinicAuditSeverities.Emergency,
            Action = "auth.lockout.triggered",
            ActorName = "System",
            ActorRole = "Security",
            TargetEntityType = "StaffMember",
            Outcome = ClinicAuditOutcomes.Warning,
            Description = "Account lockout enforced"
        };

        context.ClinicAuditEntries.Add(entry);
        context.SaveChanges();

        // Attempt synchronous deletion
        context.ClinicAuditEntries.Remove(entry);
        var actSync = () => context.SaveChanges();

        actSync.Should().Throw<InvalidOperationException>()
            .WithMessage("*append-only (WORM)*Deleted*");
    }

    [Fact]
    public async Task WormImmutability_DetachedEntityAttachAsModified_ThrowsInvalidOperationException()
    {
        var (context, clinicId, tenantId, _) = CreateIsolatedContext();

        var entry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Routine,
            Action = "operations.schedule.created",
            ActorName = "Admin Alice",
            ActorRole = "Administrator",
            TargetEntityType = "Schedule",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Original schedule description"
        };

        await context.ClinicAuditEntries.AddAsync(entry);
        await context.SaveChangesAsync();

        // Detach entry
        context.Entry(entry).State = EntityState.Detached;

        // Create untracked clone with same ID and modified description
        var forgedEntry = new ClinicAuditEntry
        {
            Id = entry.Id,
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = entry.Timestamp,
            Category = entry.Category,
            Severity = entry.Severity,
            Action = entry.Action,
            ActorName = entry.ActorName,
            ActorRole = entry.ActorRole,
            TargetEntityType = entry.TargetEntityType,
            Outcome = entry.Outcome,
            Description = "Forged schedule description"
        };

        context.Attach(forgedEntry).State = EntityState.Modified;

        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*append-only (WORM)*Modified*");
    }

    [Fact]
    public async Task WormImmutability_BulkBatchWithOneTamperedEntry_RejectsEntireBatch()
    {
        var (context, clinicId, tenantId, _) = CreateIsolatedContext();

        var existingEntry = new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "clinical.vital.recorded",
            ActorName = "Nurse Joy",
            ActorRole = "Nurse",
            TargetEntityType = "VitalSign",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "BP 120/80"
        };
        await context.ClinicAuditEntries.AddAsync(existingEntry);
        await context.SaveChangesAsync();

        // Stage 3 valid new entries
        var newEntries = Enumerable.Range(1, 3).Select(i => new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow.AddMinutes(i),
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = $"clinical.vital.recorded_{i}",
            ActorName = "Nurse Joy",
            ActorRole = "Nurse",
            TargetEntityType = "VitalSign",
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"BP 120/8{i}"
        }).ToList();
        await context.ClinicAuditEntries.AddRangeAsync(newEntries);

        // Sneak a modification into the existing entry
        existingEntry.Description = "Tampered BP 200/120";

        // Whole batch must be aborted
        var actBatch = () => context.SaveChangesAsync();
        await actBatch.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*append-only (WORM)*");

        // Verify none of the new entries were committed
        var dbCount = await context.ClinicAuditEntries.AsNoTracking().CountAsync();
        dbCount.Should().Be(1);
    }

    // =========================================================================
    // DIMENSION 3: CSV Export RFC 4180 Compliance & Data Privacy Integrity
    // =========================================================================

    [Fact]
    public void CsvExport_Rfc4180Compliance_EscapesSpecialCharactersCorrectly()
    {
        var entries = new List<ClinicAuditEntryDto>
        {
            new(
                Id: Guid.NewGuid(),
                TenantId: "tenant_rfc",
                ClinicId: Guid.NewGuid(),
                Timestamp: new DateTime(2026, 10, 17, 12, 30, 0, DateTimeKind.Utc),
                Category: ClinicAuditCategories.Clinical,
                Severity: ClinicAuditSeverities.Routine,
                Action: "clinical.consultation.signed",
                ActorStaffId: Guid.NewGuid(),
                ActorName: "Dr. Santos, MD", // Comma in name
                ActorRole: "Physician",
                ClientIpAddress: "10.0.0.5",
                UserAgent: "Mozilla/5.0",
                TargetEntityType: "ConsultationEncounter",
                TargetEntityId: "ENC-001",
                PatientId: Guid.NewGuid(),
                PatientNameMasked: "J*** D***",
                PatientPinMasked: "12-****5678-9",
                Outcome: ClinicAuditOutcomes.Success,
                Description: "Patient noted \"severe headache\", dizziness.\nAdvised follow-up.", // Quotes, commas, and newline
                MetadataJson: "{}",
                CreatedAt: DateTime.UtcNow)
        };

        var bytes = AuditExportFormatter.FormatCsv(entries);
        var csv = Encoding.UTF8.GetString(bytes);

        // Verify RFC 4180: field with comma is wrapped in double quotes
        csv.Should().Contain("\"Dr. Santos, MD\"");

        // Verify RFC 4180: field with quotes has quotes escaped as double double-quotes and is wrapped in double quotes
        csv.Should().Contain("\"Patient noted \"\"severe headache\"\", dizziness.\nAdvised follow-up.\"");
    }

    [Fact]
    public void CsvExport_Utf8BomEncoding_BeginsWithExactBomBytes()
    {
        var entries = new List<ClinicAuditEntryDto>
        {
            new(
                Id: Guid.NewGuid(),
                TenantId: "tenant_bom",
                ClinicId: Guid.NewGuid(),
                Timestamp: DateTime.UtcNow,
                Category: ClinicAuditCategories.Security,
                Severity: ClinicAuditSeverities.Routine,
                Action: "auth.login.success",
                ActorStaffId: null,
                ActorName: "User 1",
                ActorRole: "Staff",
                ClientIpAddress: "127.0.0.1",
                UserAgent: null,
                TargetEntityType: "User",
                TargetEntityId: null,
                PatientId: null,
                PatientNameMasked: null,
                PatientPinMasked: null,
                Outcome: ClinicAuditOutcomes.Success,
                Description: "Successful login with UTF-8 characters: Niño, Peña, ñ, ₱",
                MetadataJson: "{}",
                CreatedAt: DateTime.UtcNow)
        };

        var bytes = AuditExportFormatter.FormatCsv(entries);

        // Must strictly begin with UTF-8 BOM bytes 0xEF, 0xBB, 0xBF
        bytes.Length.Should().BeGreaterThan(3);
        bytes[0].Should().Be(0xEF);
        bytes[1].Should().Be(0xBB);
        bytes[2].Should().Be(0xBF);

        // Decodes without error and contains unicode characters
        var text = Encoding.UTF8.GetString(bytes);
        text.Should().Contain("Niño, Peña, ñ, ₱");
    }

    [Fact]
    public void CsvExport_ZeroPlaintextPhi_GuaranteesPrivacyByDesign()
    {
        var rawName = "Juan Carlos Dela Cruz";
        var rawPin = "12-345678901-2";
        var rawNotes = "Patient diagnosed with stage 2 hypertension. Highly sensitive psychiatric history.";
        var rawPassword = "SuperSecretPassword123!";

        var maskedName = _redactionService.MaskPatientName(rawName);
        var maskedPin = _redactionService.MaskPhilHealthPin(rawPin);

        var rawJson = JsonSerializer.Serialize(new
        {
            patientName = rawName,
            philHealthPin = rawPin,
            subjective = rawNotes,
            password = rawPassword,
            icd10 = "I10"
        });

        var redactedJson = _redactionService.RedactPayloadJson(rawJson);

        var entries = new List<ClinicAuditEntryDto>
        {
            new(
                Id: Guid.NewGuid(),
                TenantId: "tenant_privacy",
                ClinicId: Guid.NewGuid(),
                Timestamp: DateTime.UtcNow,
                Category: ClinicAuditCategories.Clinical,
                Severity: ClinicAuditSeverities.Routine,
                Action: "clinical.encounter.signed",
                ActorStaffId: Guid.NewGuid(),
                ActorName: "Dr. Maria Santos",
                ActorRole: "Physician",
                ClientIpAddress: "192.168.1.100",
                UserAgent: "ClinicBrowser",
                TargetEntityType: "ConsultationEncounter",
                TargetEntityId: "ENC-999",
                PatientId: Guid.NewGuid(),
                PatientNameMasked: maskedName,
                PatientPinMasked: maskedPin,
                Outcome: ClinicAuditOutcomes.Success,
                Description: $"Consultation completed for {maskedName}",
                MetadataJson: redactedJson,
                CreatedAt: DateTime.UtcNow)
        };

        var bytes = AuditExportFormatter.FormatCsv(entries);
        var csvString = Encoding.UTF8.GetString(bytes);

        // Verification of ZERO Plaintext PHI in CSV content
        csvString.Should().NotContain(rawName);
        csvString.Should().NotContain(rawPin);
        csvString.Should().NotContain(rawNotes);
        csvString.Should().NotContain(rawPassword);

        // Masked values and tokens preserved
        csvString.Should().Contain(maskedName);
        csvString.Should().Contain(maskedPin);
    }

    [Fact]
    public void CsvExport_FormulaInjectionPrefixes_EmpiricallyObservedAndDocumented()
    {
        // Adversarial test: entries containing formula trigger characters (=, +, -, @)
        var formulaPrefixes = new[]
        {
            "=cmd|' /C calc'!A0",
            "+12345",
            "-12345",
            "@SUM(A1:A10)"
        };

        foreach (var prefix in formulaPrefixes)
        {
            var entries = new List<ClinicAuditEntryDto>
            {
                new(
                    Id: Guid.NewGuid(),
                    TenantId: "tenant_formula",
                    ClinicId: Guid.NewGuid(),
                    Timestamp: DateTime.UtcNow,
                    Category: ClinicAuditCategories.Security,
                    Severity: ClinicAuditSeverities.Routine,
                    Action: "test.formula",
                    ActorStaffId: null,
                    ActorName: "Tester",
                    ActorRole: "Staff",
                    ClientIpAddress: "127.0.0.1",
                    UserAgent: null,
                    TargetEntityType: "Test",
                    TargetEntityId: null,
                    PatientId: null,
                    PatientNameMasked: null,
                    PatientPinMasked: null,
                    Outcome: ClinicAuditOutcomes.Success,
                    Description: prefix,
                    MetadataJson: "{}",
                    CreatedAt: DateTime.UtcNow)
            };

            var bytes = AuditExportFormatter.FormatCsv(entries);
            var csv = Encoding.UTF8.GetString(bytes);

            // AuditExportFormatter adheres strictly to RFC 4180 standard escaping (quotes on comma/quote/newline).
            // It preserves the verbatim data payload.
            csv.Should().Contain(prefix);
        }
    }

    // =========================================================================
    // DIMENSION 4: Non-Blocking Channel Pressure Semantics
    // =========================================================================

    [Fact]
    public void AuditLogQueue_TryEnqueueUnderCapacityPressure_ReturnsFalseSynchronouslyWithoutBlocking()
    {
        // Arrange: Constrained queue with capacity 3
        var queue = new AuditLogQueue(capacity: 3);

        var msg1 = new AuditLogMessage
        {
            TenantId = "tenant_test",
            Action = "msg1",
            Category = "Test",
            Severity = "Routine",
            ActorName = "System",
            ActorRole = "System",
            TargetEntityType = "TestEntity",
            Outcome = "Success",
            Description = "1"
        };
        var msg2 = new AuditLogMessage
        {
            TenantId = "tenant_test",
            Action = "msg2",
            Category = "Test",
            Severity = "Routine",
            ActorName = "System",
            ActorRole = "System",
            TargetEntityType = "TestEntity",
            Outcome = "Success",
            Description = "2"
        };
        var msg3 = new AuditLogMessage
        {
            TenantId = "tenant_test",
            Action = "msg3",
            Category = "Test",
            Severity = "Routine",
            ActorName = "System",
            ActorRole = "System",
            TargetEntityType = "TestEntity",
            Outcome = "Success",
            Description = "3"
        };
        var msg4 = new AuditLogMessage
        {
            TenantId = "tenant_test",
            Action = "msg4",
            Category = "Test",
            Severity = "Routine",
            ActorName = "System",
            ActorRole = "System",
            TargetEntityType = "TestEntity",
            Outcome = "Success",
            Description = "4"
        };

        // Act: Enqueue 3 items
        queue.TryEnqueue(msg1).Should().BeTrue();
        queue.TryEnqueue(msg2).Should().BeTrue();
        queue.TryEnqueue(msg3).Should().BeTrue();
        queue.Count.Should().Be(3);

        // 4th item under channel saturation: Measure elapsed time
        var sw = Stopwatch.StartNew();
        var overflowResult = queue.TryEnqueue(msg4);
        sw.Stop();

        // Assert: Must return false synchronously in under 10ms (non-blocking)
        overflowResult.Should().BeFalse();
        sw.ElapsedMilliseconds.Should().BeLessThan(10, "TryEnqueue must never block the calling thread when channel capacity is exhausted");
        queue.Count.Should().Be(3);
    }
}
