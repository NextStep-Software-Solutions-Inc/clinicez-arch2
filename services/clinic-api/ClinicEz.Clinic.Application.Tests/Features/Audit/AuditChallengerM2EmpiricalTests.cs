namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Application.Features.Audit.Queries;
using ClinicEz.Clinic.Application.Features.Audit.Services;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

public class AuditChallengerM2EmpiricalTests
{
    private static (ApplicationDbContext context, Guid clinicId, string tenantId, IRepository<ClinicAuditEntry> repo)
        CreateIsolatedContext(Guid? customClinicId = null)
    {
        var clinicId = customClinicId ?? Guid.NewGuid();
        var tenantId = "tenant_challenger_test";

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var dbName = $"ClinicEz_ChallengerTest_{Guid.NewGuid()}";
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

    // ─────────────────────────────────────────────────────────────────────────
    // Requirement 2: Backward Cursor Pagination Edge Cases & Multi-Tenancy
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CursorPagination_EmptySet_ReturnsEmptyItemsAndNullCursor()
    {
        // Edge Case A: Empty set
        var (_, _, _, repo) = CreateIsolatedContext();
        var handler = new GetAuditLogsQueryHandler(repo);

        var result = await handler.Handle(new GetAuditLogsQuery(PageSize: 10), CancellationToken.None);

        result.Should().NotBeNull();
        result.Items.Should().BeEmpty();
        result.HasMore.Should().BeFalse();
        result.NextCursor.Should().BeNull();
        result.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task CursorPagination_SingleItem_ReturnsOneItemAndNullCursor()
    {
        // Edge Case B: Single item
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        await context.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Security,
            Severity = ClinicAuditSeverities.Routine,
            Action = "auth.login.success",
            ActorName = "User 1",
            ActorRole = "Staff",
            TargetEntityType = "StaffMember",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Single item test",
            MetadataJson = "{}"
        });
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);
        var result = await handler.Handle(new GetAuditLogsQuery(PageSize: 10), CancellationToken.None);

        result.Items.Should().HaveCount(1);
        result.HasMore.Should().BeFalse();
        result.NextCursor.Should().BeNull();
    }

    [Fact]
    public async Task CursorPagination_ExactBoundary_ReturnsExactPageAndHasMoreFalse()
    {
        // Edge Case C: Exactly PageSize (10) items in DB
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        var baseTime = DateTime.UtcNow;

        for (int i = 0; i < 10; i++)
        {
            await context.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = baseTime.AddMinutes(i),
                Category = ClinicAuditCategories.Operations,
                Severity = ClinicAuditSeverities.Routine,
                Action = "operations.test",
                ActorName = $"User {i}",
                ActorRole = "Staff",
                TargetEntityType = "TestEntity",
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Item {i}",
                MetadataJson = "{}"
            });
        }
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);
        var result = await handler.Handle(new GetAuditLogsQuery(PageSize: 10), CancellationToken.None);

        result.Items.Should().HaveCount(10);
        result.HasMore.Should().BeFalse();
        result.NextCursor.Should().BeNull();
    }

    [Fact]
    public async Task CursorPagination_CorruptedCursor_DoesNotThrowAndFallsBackToFirstPage()
    {
        // Edge Case D: Corrupted cursor string
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        await context.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Security,
            Severity = ClinicAuditSeverities.Routine,
            Action = "auth.login.success",
            ActorName = "User 1",
            ActorRole = "Staff",
            TargetEntityType = "StaffMember",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Fallback test",
            MetadataJson = "{}"
        });
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);

        // Pass invalid cursor
        var result = await handler.Handle(new GetAuditLogsQuery(Before: "INVALID_CORRUPTED_CURSOR_XYZ", PageSize: 10), CancellationToken.None);

        result.Should().NotBeNull();
        result.Items.Should().HaveCount(1);
    }

    [Fact]
    public async Task CursorPagination_IdenticalTimestamp_EdgeCase_ExposesTimestampTieSkipBehavior()
    {
        // Empirical Test: What happens when 15 entries share the EXACT SAME Timestamp across a page boundary of 10?
        var (context, clinicId, tenantId, repo) = CreateIsolatedContext();
        var identicalTimestamp = new DateTime(2026, 10, 17, 10, 0, 0, DateTimeKind.Utc);

        var entries = new List<ClinicAuditEntry>();
        for (int i = 0; i < 15; i++)
        {
            entries.Add(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = identicalTimestamp,
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Routine,
                Action = "clinical.consultation.signed",
                ActorName = $"Doctor {i}",
                ActorRole = "Doctor",
                TargetEntityType = "Encounter",
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Encounter {i}",
                MetadataJson = "{}"
            });
        }
        await context.ClinicAuditEntries.AddRangeAsync(entries);
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);

        // Fetch Page 1 (PageSize = 10)
        var page1 = await handler.Handle(new GetAuditLogsQuery(PageSize: 10), CancellationToken.None);
        page1.Items.Should().HaveCount(10);
        page1.HasMore.Should().BeTrue();
        page1.NextCursor.Should().NotBeNull();

        // Fetch Page 2 with Before = page1.NextCursor
        var page2 = await handler.Handle(new GetAuditLogsQuery(Before: page1.NextCursor, PageSize: 10), CancellationToken.None);

        // Because query does: e.Timestamp < cursorUtc, and remaining 5 items have e.Timestamp == cursorUtc,
        // page2 returns 0 items! The remaining 5 items with identical timestamp are skipped!
        // This is a documented empirical finding on pure timestamp cursor pagination without composite ID tie-breaker.
        page2.Items.Count.Should().Be(0, "Pure timestamp cursor pagination skips remaining records sharing the exact boundary timestamp");
    }

    [Fact]
    public async Task MultiTenantIsolation_EntriesFromOtherClinicsAreNeverReturned()
    {
        // Verify multi-tenant isolation
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var (contextA, _, tenantId, repoA) = CreateIsolatedContext(clinicA);

        // Add 3 entries for Clinic A
        await contextA.ClinicAuditEntries.AddRangeAsync(
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicA,
                Timestamp = DateTime.UtcNow.AddMinutes(1),
                Category = ClinicAuditCategories.Security,
                Severity = ClinicAuditSeverities.Routine,
                Action = "clinicA.action",
                ActorName = "Staff A",
                ActorRole = "Admin",
                TargetEntityType = "Clinic",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "Clinic A Entry",
                MetadataJson = "{}"
            },
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicB, // Other clinic!
                Timestamp = DateTime.UtcNow.AddMinutes(2),
                Category = ClinicAuditCategories.Security,
                Severity = ClinicAuditSeverities.Routine,
                Action = "clinicB.action",
                ActorName = "Staff B",
                ActorRole = "Admin",
                TargetEntityType = "Clinic",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "Clinic B Entry",
                MetadataJson = "{}"
            }
        );
        await contextA.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repoA);
        var result = await handler.Handle(new GetAuditLogsQuery(), CancellationToken.None);

        // EF Core HasQueryFilter(e => e.ClinicId == CurrentClinicId) strictly filters out Clinic B
        result.Items.Should().HaveCount(1);
        result.Items[0].ClinicId.Should().Be(clinicA);
        result.Items[0].Description.Should().Be("Clinic A Entry");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Requirement 3: CSV Export Hostile Characters & UTF-8 BOM
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public void CsvExport_StartsStrictlyWithUtf8BomBytes()
    {
        var items = new List<ClinicAuditEntryDto>
        {
            new(
                Id: Guid.NewGuid(),
                TenantId: "tenant_test",
                ClinicId: Guid.NewGuid(),
                Timestamp: DateTime.UtcNow,
                Category: "Security",
                Severity: "Routine",
                Action: "test.action",
                ActorStaffId: null,
                ActorName: "Tester",
                ActorRole: "Admin",
                ClientIpAddress: "127.0.0.1",
                UserAgent: null,
                TargetEntityType: "Test",
                TargetEntityId: null,
                PatientId: null,
                PatientNameMasked: null,
                PatientPinMasked: null,
                Outcome: "Success",
                Description: "Simple test",
                MetadataJson: "{}",
                CreatedAt: DateTime.UtcNow)
        };

        var bytes = AuditExportFormatter.FormatCsv(items);

        bytes.Length.Should().BeGreaterThan(3);
        bytes[0].Should().Be(0xEF);
        bytes[1].Should().Be(0xBB);
        bytes[2].Should().Be(0xBF);
    }

    [Fact]
    public void CsvExport_ProperlyEscapesHostileCharacters_QuotesCommasCrlfUnicode()
    {
        var hostileDescription = "Line1 with comma, and \"embedded quote\"\r\nLine2 with Philippine Unicode: Niño Dela Peña & Dr. José";
        var hostileActor = "Santos, María \"Specialist\"";

        var items = new List<ClinicAuditEntryDto>
        {
            new(
                Id: Guid.NewGuid(),
                TenantId: "tenant_test",
                ClinicId: Guid.NewGuid(),
                Timestamp: new DateTime(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc),
                Category: "Clinical",
                Severity: "Urgent",
                Action: "clinical.hostile.test",
                ActorStaffId: Guid.NewGuid(),
                ActorName: hostileActor,
                ActorRole: "Doctor",
                ClientIpAddress: "192.168.1.1",
                UserAgent: "Mozilla/5.0",
                TargetEntityType: "PatientRecord",
                TargetEntityId: "rec-123,456",
                PatientId: null,
                PatientNameMasked: "J*** D***",
                PatientPinMasked: "12-****5678-9",
                Outcome: "Success",
                Description: hostileDescription,
                MetadataJson: "{}",
                CreatedAt: DateTime.UtcNow)
        };

        var bytes = AuditExportFormatter.FormatCsv(items);
        var csvContent = Encoding.UTF8.GetString(bytes);

        // 1. Double-quotes escaped as ""
        csvContent.Should().Contain("\"Santos, María \"\"Specialist\"\"\"");

        // 2. Comma in TargetEntityId escaped in quotes
        csvContent.Should().Contain("\"rec-123,456\"");

        // 3. Multi-line CRLF and Unicode characters preserved
        csvContent.Should().Contain("\"Line1 with comma, and \"\"embedded quote\"\"\r\nLine2 with Philippine Unicode: Niño Dela Peña & Dr. José\"");

        // 4. Verify round-trip decoding produces authentic UTF-8 characters without corruption
        csvContent.Should().Contain("Niño Dela Peña");
        csvContent.Should().Contain("Dr. José");
    }

    [Fact]
    public void CsvExport_FormulaInjectionCharacters_EmpiricalObservation()
    {
        // Empirical observation: What happens with formula injection prefixes (=, +, -, @)?
        var formulaDescription = "=cmd|'/C calc'!A0";
        var items = new List<ClinicAuditEntryDto>
        {
            new(
                Id: Guid.NewGuid(),
                TenantId: "tenant_test",
                ClinicId: Guid.NewGuid(),
                Timestamp: DateTime.UtcNow,
                Category: "Security",
                Severity: "Emergency",
                Action: "test.injection",
                ActorStaffId: null,
                ActorName: "Hacker",
                ActorRole: "Unknown",
                ClientIpAddress: "127.0.0.1",
                UserAgent: null,
                TargetEntityType: "Test",
                TargetEntityId: null,
                PatientId: null,
                PatientNameMasked: null,
                PatientPinMasked: null,
                Outcome: "Warning",
                Description: formulaDescription,
                MetadataJson: "{}",
                CreatedAt: DateTime.UtcNow)
        };

        var bytes = AuditExportFormatter.FormatCsv(items);
        var csvContent = Encoding.UTF8.GetString(bytes);

        // When description does not contain quotes or commas, EscapeCsvField outputs raw "=cmd|'/C calc'!A0"
        csvContent.Should().Contain("=cmd|'/C calc'!A0");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Requirement 4: Auditing the Auditor Events on View and Export
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task AuditController_GetAuditLogs_EnqueuesAuditLogViewed()
    {
        var sender = Substitute.For<ISender>();
        var clinicContext = Substitute.For<IClinicContext>();
        var auditQueue = Substitute.For<IAuditLogQueue>();

        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.StaffId.Returns(staffId);
        clinicContext.TenantId.Returns("tenant_auditor");

        sender.Send(Arg.Any<GetAuditLogsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new AuditLogListDto(
                Items: new List<ClinicAuditEntryDto>().AsReadOnly(),
                HasMore: false,
                NextCursor: null,
                TotalCount: 0));

        var controller = new AuditController(sender, clinicContext, auditQueue);

        var httpContext = new DefaultHttpContext();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("127.0.0.1");
        httpContext.Request.Headers.UserAgent = "AdminBrowser/1.0";
        var claims = new[]
        {
            new Claim("sub", staffId.ToString()),
            new Claim("name", "Compliance Officer Maria"),
            new Claim("staff_role", "Administrator"),
            new Claim("clinic_id", clinicId.ToString()),
            new Claim("tenant_id", "tenant_auditor")
        };
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        // Act
        var response = await controller.GetAuditLogs(
            category: "Security",
            severity: null,
            action: null,
            actorId: null,
            entityId: null,
            search: "login",
            startDate: null,
            endDate: null,
            before: null,
            pageSize: 50,
            ct: CancellationToken.None);

        // Assert
        response.Result.Should().BeOfType<OkObjectResult>();

        auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == "audit.log.viewed" &&
            msg.Category == ClinicAuditCategories.Audit &&
            msg.Severity == ClinicAuditSeverities.Routine &&
            msg.ActorName == "Compliance Officer Maria" &&
            msg.Description.Contains("Audit log accessed by Compliance Officer Maria") &&
            msg.MetadataJson.Contains("Security") &&
            msg.MetadataJson.Contains("login")));
    }

    [Fact]
    public async Task AuditController_ExportAuditLogs_EnqueuesAuditLogExported()
    {
        var sender = Substitute.For<ISender>();
        var clinicContext = Substitute.For<IClinicContext>();
        var auditQueue = Substitute.For<IAuditLogQueue>();

        var clinicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.StaffId.Returns(staffId);
        clinicContext.TenantId.Returns("tenant_auditor");

        sender.Send(Arg.Any<ExportAuditLogsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new AuditExportResultDto(
                ContentBytes: new byte[] { 0xEF, 0xBB, 0xBF, 0x30 },
                ContentType: "text/csv; charset=utf-8",
                FileName: "audit-export.csv",
                RowCount: 42));

        var controller = new AuditController(sender, clinicContext, auditQueue);

        var httpContext = new DefaultHttpContext();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("127.0.0.1");
        httpContext.Request.Headers.UserAgent = "AdminBrowser/1.0";
        var claims = new[]
        {
            new Claim("sub", staffId.ToString()),
            new Claim("name", "Auditor Juan"),
            new Claim("staff_role", "Administrator"),
            new Claim("clinic_id", clinicId.ToString()),
            new Claim("tenant_id", "tenant_auditor")
        };
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));
        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };

        // Act
        var result = await controller.ExportAuditLogs(
            format: "csv",
            category: "Billing",
            severity: null,
            action: null,
            actorId: null,
            entityId: null,
            search: null,
            startDate: null,
            endDate: null,
            limit: 5000,
            ct: CancellationToken.None);

        // Assert
        result.Should().BeOfType<FileContentResult>();

        auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Action == "audit.log.exported" &&
            msg.Category == ClinicAuditCategories.Audit &&
            msg.Severity == ClinicAuditSeverities.Urgent &&
            msg.ActorName == "Auditor Juan" &&
            msg.Description.Contains("Audit log exported in CSV format (42 records) by Auditor Juan") &&
            msg.MetadataJson.Contains("42") &&
            msg.MetadataJson.Contains("Billing")));
    }
}
