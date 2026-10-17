namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Audit.DTOs;
using ClinicEz.Clinic.Application.Features.Audit.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

public class AuditApiQueryTests
{
    private static (ApplicationDbContext context, Guid clinicId, string tenantId, IRepository<ClinicAuditEntry> repo)
        CreateTestContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_audit_api_test";

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var dbName = $"ClinicEz_AuditApiTest_{Guid.NewGuid()}";
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

    [Fact]
    public async Task GetAuditLogs_CursorBackwardPagination_PagesDeterministically()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateTestContext();
        var now = DateTime.UtcNow;

        var entries = new List<ClinicAuditEntry>();
        for (int i = 0; i < 15; i++)
        {
            entries.Add(new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = now.AddMinutes(i),
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Routine,
                Action = "clinical.consultation.signed",
                ActorName = $"Doctor {i}",
                ActorRole = "Doctor",
                TargetEntityType = "ConsultationEncounter",
                TargetEntityId = $"enc-{i}",
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Consultation {i} signed",
                MetadataJson = "{}"
            });
        }

        await context.ClinicAuditEntries.AddRangeAsync(entries);
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);

        // Act: Fetch Page 1 (PageSize = 5)
        var page1 = await handler.Handle(new GetAuditLogsQuery(PageSize: 5), CancellationToken.None);

        // Assert Page 1
        page1.Items.Should().HaveCount(5);
        page1.HasMore.Should().BeTrue();
        page1.NextCursor.Should().NotBeNullOrEmpty();
        page1.Items[0].Description.Should().Be("Consultation 14 signed"); // Latest first

        // Act: Fetch Page 2 using NextCursor
        var page2 = await handler.Handle(new GetAuditLogsQuery(Before: page1.NextCursor, PageSize: 5), CancellationToken.None);

        // Assert Page 2
        page2.Items.Should().HaveCount(5);
        page2.HasMore.Should().BeTrue();
        page2.NextCursor.Should().NotBeNullOrEmpty();
        page2.Items[0].Description.Should().Be("Consultation 9 signed");

        // Act: Fetch Page 3 using NextCursor
        var page3 = await handler.Handle(new GetAuditLogsQuery(Before: page2.NextCursor, PageSize: 5), CancellationToken.None);

        // Assert Page 3
        page3.Items.Should().HaveCount(5);
        page3.HasMore.Should().BeFalse();
        page3.NextCursor.Should().BeNull();
        page3.Items[^1].Description.Should().Be("Consultation 0 signed");
    }

    [Fact]
    public async Task GetAuditLogs_FilterByCategoryAndSeverity_FiltersCorrectly()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateTestContext();
        var now = DateTime.UtcNow;

        await context.ClinicAuditEntries.AddRangeAsync(
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = now.AddMinutes(1),
                Category = ClinicAuditCategories.Security,
                Severity = ClinicAuditSeverities.Emergency,
                Action = "auth.login.failure",
                ActorName = "Attacker",
                ActorRole = "Unknown",
                TargetEntityType = "StaffMember",
                Outcome = ClinicAuditOutcomes.Failure,
                Description = "Failed password attempt",
                MetadataJson = "{}"
            },
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = now.AddMinutes(2),
                Category = ClinicAuditCategories.Billing,
                Severity = ClinicAuditSeverities.Urgent,
                Action = "billing.invoice.voided",
                ActorName = "Cashier Jane",
                ActorRole = "Cashier",
                TargetEntityType = "Invoice",
                Outcome = ClinicAuditOutcomes.Warning,
                Description = "Voided invoice #102",
                MetadataJson = "{}"
            }
        );
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);

        // Act
        var securityResult = await handler.Handle(new GetAuditLogsQuery(Category: ClinicAuditCategories.Security), CancellationToken.None);
        var urgentResult = await handler.Handle(new GetAuditLogsQuery(Severity: ClinicAuditSeverities.Urgent), CancellationToken.None);

        // Assert
        securityResult.Items.Should().HaveCount(1);
        securityResult.Items[0].Action.Should().Be("auth.login.failure");

        urgentResult.Items.Should().HaveCount(1);
        urgentResult.Items[0].Action.Should().Be("billing.invoice.voided");
    }

    [Fact]
    public async Task GetAuditLogs_FilterByDateRange_FiltersCorrectly()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateTestContext();
        var baseDate = new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);

        await context.ClinicAuditEntries.AddRangeAsync(
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = baseDate.AddDays(-2),
                Category = ClinicAuditCategories.Operations,
                Severity = ClinicAuditSeverities.Routine,
                Action = "operations.settings.updated",
                ActorName = "Admin",
                ActorRole = "Administrator",
                TargetEntityType = "ClinicSettings",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "Old update",
                MetadataJson = "{}"
            },
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = baseDate,
                Category = ClinicAuditCategories.Operations,
                Severity = ClinicAuditSeverities.Routine,
                Action = "operations.settings.updated",
                ActorName = "Admin",
                ActorRole = "Administrator",
                TargetEntityType = "ClinicSettings",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "Target date update",
                MetadataJson = "{}"
            },
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = baseDate.AddDays(2),
                Category = ClinicAuditCategories.Operations,
                Severity = ClinicAuditSeverities.Routine,
                Action = "operations.settings.updated",
                ActorName = "Admin",
                ActorRole = "Administrator",
                TargetEntityType = "ClinicSettings",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "Future update",
                MetadataJson = "{}"
            }
        );
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);

        // Act: Filter to [baseDate - 1 day, baseDate + 1 day]
        var result = await handler.Handle(new GetAuditLogsQuery(
            StartDate: baseDate.AddDays(-1),
            EndDate: baseDate.AddDays(1)), CancellationToken.None);

        // Assert
        result.Items.Should().HaveCount(1);
        result.Items[0].Description.Should().Be("Target date update");
    }

    [Fact]
    public async Task GetAuditLogs_SearchQuery_MatchesMultipleFields()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateTestContext();

        await context.ClinicAuditEntries.AddRangeAsync(
            new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = ClinicAuditCategories.PhilHealth,
                Severity = ClinicAuditSeverities.Routine,
                Action = PhilHealthAuditEvents.PinVerified,
                ActorName = "Dr. Phil Santos",
                ActorRole = "Doctor",
                TargetEntityType = "PhilHealthMember",
                TargetEntityId = "12-****5678-9",
                PatientPinMasked = "12-****5678-9",
                Outcome = ClinicAuditOutcomes.Success,
                Description = "PIN verified",
                MetadataJson = "{}"
            }
        );
        await context.SaveChangesAsync();

        var handler = new GetAuditLogsQueryHandler(repo);

        // Act & Assert: Search by partial PIN
        var resultByPin = await handler.Handle(new GetAuditLogsQuery(Search: "5678-9"), CancellationToken.None);
        resultByPin.Items.Should().HaveCount(1);

        // Search by actor name
        var resultByActor = await handler.Handle(new GetAuditLogsQuery(Search: "Santos"), CancellationToken.None);
        resultByActor.Items.Should().HaveCount(1);

        // Search by action
        var resultByAction = await handler.Handle(new GetAuditLogsQuery(Search: "pin.verified"), CancellationToken.None);
        resultByAction.Items.Should().HaveCount(1);
    }

    [Fact]
    public async Task GetAuditLogDetail_ReturnsSanitizedMetadataAndProseChecksums()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateTestContext();
        var entryId = Guid.NewGuid();

        var metadataWithChecksums = "{\"subjective\":\"[Clinical Text Redacted - DPA RA 10173]\",\"subjectiveChecksum\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\"}";

        await context.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
        {
            Id = entryId,
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "clinical.consultation.signed",
            ActorName = "Dr. Smith",
            ActorRole = "Doctor",
            TargetEntityType = "ConsultationEncounter",
            TargetEntityId = "enc-101",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Encounter signed with SOAP note",
            MetadataJson = metadataWithChecksums
        });
        await context.SaveChangesAsync();

        var handler = new GetAuditLogDetailQueryHandler(repo);

        // Act
        var result = await handler.Handle(new GetAuditLogDetailQuery(entryId), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result!.Id.Should().Be(entryId);
        result.ProseChecksums.Should().ContainKey("subjectiveChecksum");
        result.ProseChecksums["subjectiveChecksum"].Should().Be("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    [Fact]
    public async Task GetAuditLogDetail_NotFound_ReturnsNull()
    {
        // Arrange
        var (_, _, _, repo) = CreateTestContext();
        var handler = new GetAuditLogDetailQueryHandler(repo);

        // Act
        var result = await handler.Handle(new GetAuditLogDetailQuery(Guid.NewGuid()), CancellationToken.None);

        // Assert
        result.Should().BeNull();
    }

    [Fact]
    public async Task ExportAuditLogs_CsvFormat_GeneratesValidUtf8BomAndRfc4180()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateTestContext();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        await context.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Billing,
            Severity = ClinicAuditSeverities.Urgent,
            Action = "billing.invoice.voided",
            ActorName = "Cashier, Maria",
            ActorRole = "Cashier",
            TargetEntityType = "Invoice",
            TargetEntityId = "inv-999",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Voided invoice with comma, and \"quotes\"",
            MetadataJson = "{}"
        });
        await context.SaveChangesAsync();

        var handler = new ExportAuditLogsQueryHandler(repo, clinicContext);

        // Act
        var result = await handler.Handle(new ExportAuditLogsQuery(Format: "csv"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ContentType.Should().Be("text/csv; charset=utf-8");
        result.FileName.Should().EndWith(".csv");
        result.RowCount.Should().Be(1);

        // Check BOM header (0xEF, 0xBB, 0xBF)
        result.ContentBytes[0].Should().Be(0xEF);
        result.ContentBytes[1].Should().Be(0xBB);
        result.ContentBytes[2].Should().Be(0xBF);

        var csvText = Encoding.UTF8.GetString(result.ContentBytes);
        csvText.Should().Contain("\"Cashier, Maria\"");
        csvText.Should().Contain("\"Voided invoice with comma, and \"\"quotes\"\"\"");
    }

    [Fact]
    public async Task ExportAuditLogs_JsonFormat_GeneratesValidJsonArray()
    {
        // Arrange
        var (context, clinicId, tenantId, repo) = CreateTestContext();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        await context.ClinicAuditEntries.AddAsync(new ClinicAuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Security,
            Severity = ClinicAuditSeverities.Routine,
            Action = "auth.login.success",
            ActorName = "Admin User",
            ActorRole = "Administrator",
            TargetEntityType = "StaffMember",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Successful sign-in",
            MetadataJson = "{}"
        });
        await context.SaveChangesAsync();

        var handler = new ExportAuditLogsQueryHandler(repo, clinicContext);

        // Act
        var result = await handler.Handle(new ExportAuditLogsQuery(Format: "json"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ContentType.Should().Be("application/json; charset=utf-8");
        result.FileName.Should().EndWith(".json");
        result.RowCount.Should().Be(1);

        var jsonText = Encoding.UTF8.GetString(result.ContentBytes);
        jsonText.Should().StartWith("[");
        jsonText.Should().EndWith("]");
        jsonText.Should().Contain("\"action\": \"auth.login.success\"");
    }
}
