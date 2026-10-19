namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Audit;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Privacy;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

public class AuditLogQueueTests
{
    private static AuditLogMessage CreateSampleMessage(string action = "auth.login.success", string? patientName = null)
    {
        return new AuditLogMessage
        {
            TenantId = "tenant_test",
            ClinicId = Guid.NewGuid(),
            Timestamp = DateTime.UtcNow,
            Category = "Security",
            Severity = "Routine",
            Action = action,
            ActorName = "Test Actor",
            ActorRole = "Administrator",
            TargetEntityType = "StaffMember",
            TargetEntityId = Guid.NewGuid().ToString(),
            PatientName = patientName,
            Outcome = "Success",
            Description = "Sample operation executed",
            MetadataJson = "{\"sampleKey\": \"sampleValue\"}"
        };
    }

    [Fact]
    public void TryEnqueue_WhenWithinCapacity_ReturnsTrueSynchronously()
    {
        // Arrange
        var queue = new AuditLogQueue(capacity: 100);
        var message = CreateSampleMessage();

        // Act
        var success = queue.TryEnqueue(message);

        // Assert
        success.Should().BeTrue();
        queue.Count.Should().Be(1);
    }

    [Fact]
    public async Task EnqueueAsync_And_TryDequeue_RoundTripsMessageCorrectly()
    {
        // Arrange
        var queue = new AuditLogQueue(capacity: 10);
        var original = CreateSampleMessage("clinical.consultation.signed");

        // Act
        await queue.EnqueueAsync(original);
        var readSuccess = queue.TryDequeue(out var dequeued);

        // Assert
        readSuccess.Should().BeTrue();
        dequeued.Should().NotBeNull();
        dequeued!.Action.Should().Be("clinical.consultation.signed");
        dequeued.TenantId.Should().Be(original.TenantId);
        dequeued.ClinicId.Should().Be(original.ClinicId);
        queue.Count.Should().Be(0);
    }

    [Fact]
    public void BoundedCapacity_RejectsSyncEnqueueWhenFull()
    {
        // Arrange: small queue with capacity 3
        var queue = new AuditLogQueue(capacity: 3);

        // Act: Enqueue 3 items
        queue.TryEnqueue(CreateSampleMessage()).Should().BeTrue();
        queue.TryEnqueue(CreateSampleMessage()).Should().BeTrue();
        queue.TryEnqueue(CreateSampleMessage()).Should().BeTrue();

        // 4th item should return false without blocking
        var overflowResult = queue.TryEnqueue(CreateSampleMessage());

        // Assert
        overflowResult.Should().BeFalse();
        queue.Count.Should().Be(3);

        // Drain one item and verify enqueue succeeds again
        queue.TryDequeue(out _).Should().BeTrue();
        queue.TryEnqueue(CreateSampleMessage()).Should().BeTrue();
    }

    [Fact]
    public async Task ConcurrentThroughput_UnderHighLoad_PreservesAllMessages()
    {
        // Arrange: 10 writers publishing 100 messages each (1,000 total) into queue with capacity 10,000
        var queue = new AuditLogQueue(capacity: 10000);
        const int writersCount = 10;
        const int messagesPerWriter = 100;
        const int totalExpected = writersCount * messagesPerWriter;

        // Act: Concurrent producers
        var tasks = Enumerable.Range(0, writersCount).Select(writerIndex => Task.Run(async () =>
        {
            for (int i = 0; i < messagesPerWriter; i++)
            {
                var msg = CreateSampleMessage($"action.writer_{writerIndex}.msg_{i}");
                await queue.EnqueueAsync(msg);
            }
        }));

        await Task.WhenAll(tasks);

        // Assert
        queue.Count.Should().Be(totalExpected);

        // Drain and assert all received
        int drainedCount = 0;
        while (queue.TryDequeue(out var msg))
        {
            msg.Should().NotBeNull();
            drainedCount++;
        }

        drainedCount.Should().Be(totalExpected);
    }

    [Fact]
    public async Task AuditLogBackgroundWorker_ProcessesBatchAndPersistsWithRedaction()
    {
        // Arrange
        var services = new ServiceCollection();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var dbName = $"ClinicEz_WorkerTest_{Guid.NewGuid()}";
        services.AddDbContext<ApplicationDbContext>(opts => opts.UseInMemoryDatabase(dbName));
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<IPhiRedactionService, PhiRedactionService>();
        services.AddSingleton<IAuditLogQueue, AuditLogQueue>();

        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        var queue = provider.GetRequiredService<IAuditLogQueue>();

        var worker = new AuditLogBackgroundWorker(
            queue,
            scopeFactory,
            NullLogger<AuditLogBackgroundWorker>.Instance);

        // Enqueue messages with sensitive clinical prose and raw patient names
        var msg1 = new AuditLogMessage
        {
            TenantId = "tenant_worker",
            ClinicId = Guid.NewGuid(),
            Category = "Clinical",
            Severity = "Routine",
            Action = "clinical.consultation.signed",
            ActorName = "Dr. Santos",
            ActorRole = "Doctor",
            TargetEntityType = "ConsultationEncounter",
            PatientName = "Juan Dela Cruz",
            PatientPin = "12-000005678-9",
            Outcome = "Success",
            Description = "Encounter signed",
            MetadataJson = "{\"subjective\": \"Patient has confidential notes\", \"icd10Code\": \"I10\"}"
        };

        var msg2 = new AuditLogMessage
        {
            TenantId = "tenant_worker",
            ClinicId = Guid.NewGuid(),
            Category = "Security",
            Severity = "Routine",
            Action = "auth.login.success",
            ActorName = "Nurse Reyes",
            ActorRole = "Nurse",
            TargetEntityType = "StaffMember",
            Outcome = "Success",
            Description = "Nurse login",
            MetadataJson = "{\"password\": \"Secret123!\"}"
        };

        // Act: Run batch process directly
        await worker.ProcessBatchAsync(new[] { msg1, msg2 }, CancellationToken.None);

        // Assert: Query ApplicationDbContext to verify persistence and PHI redaction
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var savedEntries = await db.ClinicAuditEntries.IgnoreQueryFilters().ToListAsync();

        savedEntries.Should().HaveCount(2);

        var clinicalEntry = savedEntries.First(e => e.Action == "clinical.consultation.signed");
        clinicalEntry.PatientNameMasked.Should().Be("J*** D*** C***");
        clinicalEntry.PatientPinMasked.Should().Be("12-****5678-9");
        clinicalEntry.MetadataJson.Should().NotContain("Patient has confidential notes");
        clinicalEntry.MetadataJson.Should().Contain("[Clinical Text Redacted - DPA RA 10173]");
        clinicalEntry.MetadataJson.Should().Contain("I10");

        var securityEntry = savedEntries.First(e => e.Action == "auth.login.success");
        securityEntry.MetadataJson.Should().NotContain("Secret123!");
        securityEntry.MetadataJson.Should().Contain("[REDACTED_SECRET]");
    }
}
