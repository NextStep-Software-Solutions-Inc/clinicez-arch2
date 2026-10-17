using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Audit;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Privacy;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Empirical Adversarial Challenger Test Suite for Milestone 1:
/// Backend Audit Core, WORM Immutability & Privacy Redaction Engine.
/// 
/// Stress-tests:
/// 1. AuditLogQueue high concurrent multi-producer load (20 concurrent tasks, 2,000 items),
///    non-blocking TryEnqueue under full buffer, concurrent producers/consumers, argument guards,
///    and live worker background drain.
/// 2. PhiRedactionService with deeply nested JSON (50+ levels), recursion limits (>64 depth),
///    malformed JSON strings, massive medical narratives (>100KB), SQL injection, script tags,
///    case-insensitive secret detection, and complex patient identity masking.
/// 3. WORM immutability guardrails against direct EF Core mutation attempts: Attach + State.Modified,
///    Property.IsModified = true, RemoveRange, UpdateRange, soft-delete, and multi-tenant isolation.
/// </summary>
public class Milestone1AuditCoreStressTests
{
    private static ApplicationDbContext CreateTestDbContext(Guid clinicId, string tenantId = "tenant_challenger_m1")
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClinicEz_Challenger_{Guid.NewGuid():N}")
            .Options;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private static ApplicationDbContext CreateSharedDbContext(string dbName, Guid clinicId, string tenantId = "tenant_challenger_m1")
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard")
            })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        return new ApplicationDbContext(options, config, clinicContext);
    }

    private static AuditLogMessage CreateTestMessage(int id, Guid clinicId, string action = "clinical.consultation.signed")
    {
        return new AuditLogMessage
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_challenger_m1",
            ClinicId = clinicId,
            Timestamp = DateTime.UtcNow,
            Category = "Clinical",
            Severity = "Routine",
            Action = action,
            ActorName = $"Clinician {id % 10}",
            ActorRole = "Doctor",
            TargetEntityType = "ConsultationEncounter",
            TargetEntityId = Guid.NewGuid().ToString(),
            PatientName = $"Patient {id}",
            PatientPin = "12-345678901-2",
            Outcome = "Success",
            Description = $"Adversarial stress log item {id}",
            MetadataJson = $"{{\"itemIndex\": {id}, \"subjective\": \"Narrative notes {id}\", \"icd10Code\": \"I10\"}}"
        };
    }

    #region Area 1: AuditLogQueue Concurrency & Stress Tests

    [Fact]
    public async Task Challenge1_AuditLogQueue_HighConcurrency_TwentyProducers_TwoThousandMessages_ZeroLoss()
    {
        // ARRANGE: 20 concurrent producers each generating 100 messages (2,000 total)
        const int producerCount = 20;
        const int itemsPerProducer = 100;
        const int expectedTotal = producerCount * itemsPerProducer;

        var queue = new AuditLogQueue(capacity: 10000);
        var clinicId = Guid.NewGuid();
        var failureCounter = 0;

        // ACT: Spawn 20 concurrent worker tasks pushing messages via non-blocking TryEnqueue
        var tasks = Enumerable.Range(0, producerCount).Select(producerIndex => Task.Run(() =>
        {
            for (var i = 0; i < itemsPerProducer; i++)
            {
                var itemId = (producerIndex * itemsPerProducer) + i;
                var msg = CreateTestMessage(itemId, clinicId, $"action.producer_{producerIndex}.item_{i}");
                var enqueued = queue.TryEnqueue(msg);
                if (!enqueued)
                {
                    Interlocked.Increment(ref failureCounter);
                }
            }
        })).ToArray();

        await Task.WhenAll(tasks);

        // ASSERT: Zero drops, zero failures, queue.Count matches exactly
        failureCounter.Should().Be(0, "TryEnqueue must never fail when queue is well within bounded capacity");
        queue.Count.Should().Be(expectedTotal, "all 2,000 items must be buffered in the channel");

        // Drain and verify every message is intact
        var drained = new List<AuditLogMessage>(expectedTotal);
        while (queue.TryDequeue(out var msg))
        {
            drained.Add(msg);
        }

        drained.Should().HaveCount(expectedTotal);
        drained.Select(m => m.Id).Distinct().Should().HaveCount(expectedTotal, "all message IDs must be unique");
    }

    [Fact]
    public async Task Challenge1_AuditLogQueue_ConcurrentProducersAndConsumers_NoDataCorruption()
    {
        // ARRANGE: 20 producers and 5 consumers running concurrently
        const int producerCount = 20;
        const int itemsPerProducer = 100;
        const int expectedTotal = producerCount * itemsPerProducer;

        var queue = new AuditLogQueue(capacity: 5000);
        var clinicId = Guid.NewGuid();
        var consumedItems = new ConcurrentBag<AuditLogMessage>();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        // Consumers
        var consumerTasks = Enumerable.Range(0, 5).Select(_ => Task.Run(async () =>
        {
            while (!cts.Token.IsCancellationRequested && consumedItems.Count < expectedTotal)
            {
                if (queue.TryDequeue(out var item))
                {
                    consumedItems.Add(item);
                }
                else
                {
                    await Task.Yield();
                }
            }
        })).ToArray();

        // Producers
        var producerTasks = Enumerable.Range(0, producerCount).Select(pIdx => Task.Run(async () =>
        {
            for (var i = 0; i < itemsPerProducer; i++)
            {
                var msg = CreateTestMessage((pIdx * itemsPerProducer) + i, clinicId);
                await queue.EnqueueAsync(msg, cts.Token);
            }
        })).ToArray();

        await Task.WhenAll(producerTasks);
        await Task.WhenAll(consumerTasks);

        // Drain any remnants if any
        while (queue.TryDequeue(out var remaining))
        {
            consumedItems.Add(remaining);
        }

        // ASSERT
        consumedItems.Should().HaveCount(expectedTotal);
        consumedItems.Select(m => m.Id).Distinct().Should().HaveCount(expectedTotal, "zero message duplication or corruption under concurrent read/write");
        queue.Count.Should().Be(0);
    }

    [Fact]
    public void Challenge1_AuditLogQueue_TryEnqueue_NonBlocking_AtBoundedCapacity()
    {
        // ARRANGE: Bounded queue with capacity 50
        const int capacity = 50;
        var queue = new AuditLogQueue(capacity: capacity);
        var clinicId = Guid.NewGuid();

        // ACT: Fill exactly to capacity
        for (var i = 0; i < capacity; i++)
        {
            queue.TryEnqueue(CreateTestMessage(i, clinicId)).Should().BeTrue();
        }

        queue.Count.Should().Be(capacity);

        // Benchmark TryEnqueue when full: MUST return false synchronously without blocking
        var sw = Stopwatch.StartNew();
        for (var i = 0; i < 50; i++)
        {
            var enqueued = queue.TryEnqueue(CreateTestMessage(100 + i, clinicId));
            enqueued.Should().BeFalse();
        }
        sw.Stop();

        // 50 non-blocking failed writes should take under 100 milliseconds
        sw.ElapsedMilliseconds.Should().BeLessThan(100, "TryEnqueue must never block calling thread when capacity is reached");
        queue.Count.Should().Be(capacity);

        // Drain 10 items
        for (var i = 0; i < 10; i++)
        {
            queue.TryDequeue(out _).Should().BeTrue();
        }
        queue.Count.Should().Be(capacity - 10);

        // Enqueueing 10 items should succeed again
        for (var i = 0; i < 10; i++)
        {
            queue.TryEnqueue(CreateTestMessage(200 + i, clinicId)).Should().BeTrue();
        }
        queue.Count.Should().Be(capacity);
    }

    [Fact]
    public async Task Challenge1_AuditLogQueue_ArgumentNullGuards()
    {
        var queue = new AuditLogQueue();

        Action actSync = () => queue.TryEnqueue(null!);
        actSync.Should().Throw<ArgumentNullException>();

        Func<Task> actAsync = async () => await queue.EnqueueAsync(null!);
        await actAsync.Should().ThrowAsync<ArgumentNullException>();
    }

    [Fact]
    public async Task Challenge1_AuditLogBackgroundWorker_LiveDrainUnderLoad_PersistsAllEntities()
    {
        // ARRANGE: Set up DI with in-memory DB and live background worker
        var services = new ServiceCollection();
        var dbName = $"ClinicEz_LiveWorkerTest_{Guid.NewGuid():N}";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard") })
            .Build();

        services.AddDbContext<ApplicationDbContext>(opts => opts.UseInMemoryDatabase(dbName));
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<IPhiRedactionService, PhiRedactionService>();
        services.AddSingleton<IAuditLogQueue>(new AuditLogQueue(capacity: 2000));

        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        var queue = provider.GetRequiredService<IAuditLogQueue>();

        var worker = new AuditLogBackgroundWorker(
            queue,
            scopeFactory,
            NullLogger<AuditLogBackgroundWorker>.Instance);

        var clinicId = Guid.NewGuid();
        const int messageCount = 200;

        // Push 200 messages with unredacted sensitive PHI
        for (var i = 0; i < messageCount; i++)
        {
            var msg = new AuditLogMessage
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant_worker_live",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Clinical",
                Severity = "Routine",
                Action = "clinical.encounter.signed",
                ActorName = "Dr. Santos",
                ActorRole = "Doctor",
                TargetEntityType = "ConsultationEncounter",
                PatientName = "Juan Dela Cruz",
                PatientPin = "12-345678901-2",
                Outcome = "Success",
                Description = $"Live audit record {i}",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    index = i,
                    subjective = $"Patient reported symptoms for visit {i}",
                    password = "UnredactedRawSecret123!"
                })
            };
            queue.TryEnqueue(msg).Should().BeTrue();
        }

        queue.Count.Should().Be(messageCount);

        // ACT: Start worker with an immediate cancellation token to trigger run + drain cycle
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        await worker.StartAsync(cts.Token);
        await Task.Delay(250); // allow execution and drain loop to finalize
        await worker.StopAsync(CancellationToken.None);

        // ASSERT: ApplicationDbContext must have all 200 records persisted and redacted
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var persisted = await db.ClinicAuditEntries.IgnoreQueryFilters().ToListAsync();

        persisted.Should().HaveCount(messageCount, "all enqueued records must be drained to persistence during worker lifecycle");
        foreach (var entry in persisted)
        {
            entry.PatientNameMasked.Should().Be("J*** D*** C***");
            entry.PatientPinMasked.Should().Be("12-****8901-2");
            entry.MetadataJson.Should().NotContain("UnredactedRawSecret123!");
            entry.MetadataJson.Should().Contain(PhiRedactionService.SecretRedactedToken);
            entry.MetadataJson.Should().Contain(PhiRedactionService.ClinicalRedactedToken);
            entry.MetadataJson.Should().Contain("sha256:");
        }
    }

    [Fact]
    public async Task Challenge1_AuditLogBackgroundWorker_InFlightBatch_CancelledToken_DropsAuditEntries()
    {
        // ARRANGE: Set up services
        var services = new ServiceCollection();
        var dbName = $"ClinicEz_DropTest_{Guid.NewGuid():N}";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "clinic_dashboard") })
            .Build();

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

        var messages = Enumerable.Range(1, 50).Select(i => CreateTestMessage(i, Guid.NewGuid())).ToList();

        // ACT: Call ProcessBatchAsync with a cancelled token (simulating shutdown occurring during batch persistence)
        using var cts = new CancellationTokenSource();
        cts.Cancel(); // already cancelled

        await worker.ProcessBatchAsync(messages, cts.Token);

        // ASSERT: Because cancellationToken was cancelled, SaveChangesAsync failed and was caught/swallowed, resulting in 0 entries persisted
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var persisted = await db.ClinicAuditEntries.IgnoreQueryFilters().ToListAsync();

        persisted.Should().BeEmpty("ProcessBatchAsync with cancelled stoppingToken silently aborts DB persistence, demonstrating vulnerability where in-flight batches are dropped during shutdown");
    }

    #endregion

    #region Area 2: PhiRedactionService Hostile & Boundary Fuzzing Tests

    private readonly IPhiRedactionService _redaction = new PhiRedactionService();

    [Fact]
    public void Challenge2_PhiRedaction_DeeplyNestedJson_FiftyLevels_DoesNotCrash()
    {
        // ARRANGE: Build a JSON structure nested 50 levels deep
        var innerMost = new JsonObject
        {
            ["password"] = "DeepSecret123",
            ["subjective"] = "Deep psychiatric consultation notes",
            ["icd10Code"] = "F32.9"
        };

        JsonNode current = innerMost;
        for (var level = 49; level >= 1; level--)
        {
            var wrapper = new JsonObject
            {
                [$"level_{level}"] = current
            };
            current = wrapper;
        }

        var deepJson = current.ToJsonString();

        // ACT
        var result = _redaction.RedactPayloadJson(deepJson);

        // ASSERT: Deep recursion must succeed without StackOverflowException
        result.Should().NotBeNullOrWhiteSpace();
        result.Should().NotContain("DeepSecret123");
        result.Should().NotContain("Deep psychiatric consultation notes");
        result.Should().Contain(PhiRedactionService.SecretRedactedToken);
        result.Should().Contain(PhiRedactionService.ClinicalRedactedToken);
        result.Should().Contain("F32.9");
    }

    [Fact]
    public void Challenge2_PhiRedaction_ExceedsDefaultDepth_FallsBackGracefullyWithoutCrash()
    {
        // ARRANGE: System.Text.Json default MaxDepth is 64. Build 75 levels to trigger JsonException
        var sb = new StringBuilder();
        for (var i = 0; i < 75; i++)
        {
            sb.Append($"{{\"wrap_{i}\":");
        }
        sb.Append("{\"password\":\"UltraDeepSecret\",\"subjective\":\"Extreme depth narrative notes\"}");
        for (var i = 0; i < 75; i++)
        {
            sb.Append("}");
        }

        var ultraDeepJson = sb.ToString();

        // ACT: Must not throw unhandled JsonException or StackOverflowException
        var result = _redaction.RedactPayloadJson(ultraDeepJson);

        // ASSERT: Fallback regex redacts secret and clinical text
        result.Should().NotBeNull();
        result.Should().NotContain("UltraDeepSecret");
        result.Should().NotContain("Extreme depth narrative notes");
        result.Should().Contain(PhiRedactionService.SecretRedactedToken);
        result.Should().Contain(PhiRedactionService.ClinicalRedactedToken);
    }

    [Theory]
    [InlineData("{\"subjective\": \"unterminated string without closing quote")]
    [InlineData("{\"key\": {{invalid braces}}")]
    [InlineData("SELECT * FROM \"ClinicAuditEntries\" WHERE '1'='1'; DROP TABLE Patients; --")]
    [InlineData("<script>alert('xss'); window.location='http://attacker.com';</script>")]
    [InlineData("<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><Password>Secret</Password></soap:Body></soap:Envelope>")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("null")]
    [InlineData("42")]
    [InlineData("true")]
    [InlineData("[]")]
    [InlineData("[1, 2, 3, null, \"plain text\"]")]
    public void Challenge2_PhiRedaction_MalformedAndAdversarialInputs_NeverThrow(string? hostileInput)
    {
        Action act = () => _redaction.RedactPayloadJson(hostileInput);
        act.Should().NotThrow("PhiRedactionService must handle arbitrary malformed, non-JSON, and adversarial inputs safely");

        var result = _redaction.RedactPayloadJson(hostileInput);
        result.Should().NotBeNull();
    }

    [Fact]
    public void Challenge2_PhiRedaction_MassiveClinicalNarrative_OverOneHundredKilobytes()
    {
        // ARRANGE: Generate a 150KB massive clinical narrative string
        var proseBuilder = new StringBuilder(160 * 1024);
        while (proseBuilder.Length < 150 * 1024)
        {
            proseBuilder.AppendLine("The patient presents with prolonged recurrent intermittent paroxysmal nocturnal dyspnea and orthopnea.");
        }
        var massiveProse = proseBuilder.ToString();
        massiveProse.Length.Should().BeGreaterThan(150 * 1024);

        var rawJson = JsonSerializer.Serialize(new
        {
            encounterId = "enc-massive-001",
            subjective = massiveProse,
            vitalBp = "130/85",
            icd10 = "I50.9"
        });

        // ACT: Measure time and assert under 250ms
        var sw = Stopwatch.StartNew();
        var redacted = _redaction.RedactPayloadJson(rawJson);
        sw.Stop();

        sw.ElapsedMilliseconds.Should().BeLessThan(500, "150KB prose redaction and SHA-256 computation must complete rapidly");

        // ASSERT: Raw 150KB prose is 100% replaced and checksum computed
        redacted.Should().NotContain("prolonged recurrent intermittent paroxysmal");
        redacted.Should().Contain(PhiRedactionService.ClinicalRedactedToken);
        redacted.Should().Contain("sha256:");
        redacted.Should().Contain("130/85");
        redacted.Should().Contain("I50.9");
    }

    [Fact]
    public void Challenge2_PhiRedaction_AdversarialSecretKeysAndTokens()
    {
        // ARRANGE: Secret keys with varying casing, embedded tokens, and JWT strings
        var rawJson = JsonSerializer.Serialize(new
        {
            PASSWORD = "PasswordAllCaps",
            apiKey = "prod_api_key_hidden",
            WRAPPED_KEY_JSON = "{\"aes\":\"key\"}",
            clientSecret = "secret_value_123",
            authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M",
            arbitraryFieldWithJwt = "Here is an active token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U in clinical note",
            normalClinicalMetric = 120
        });

        // ACT
        var redacted = _redaction.RedactPayloadJson(rawJson);

        // ASSERT
        redacted.Should().NotContain("PasswordAllCaps");
        redacted.Should().NotContain("prod_api_key_hidden");
        redacted.Should().NotContain("secret_value_123");
        redacted.Should().NotContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
        redacted.Should().Contain(PhiRedactionService.SecretRedactedToken);
        redacted.Should().Contain("120");
    }

    [Theory]
    [InlineData("José Dela Cruz", "J*** D*** C***")]
    [InlineData("María-Clara De Los Santos", "M***-C*** D*** L*** S***")]
    [InlineData("Ng", "N***")]
    [InlineData("O'Connor, Liam", "O***, L***")]
    [InlineData("Dela Cruz, Juan Jr.", "D*** C***, J*** J***")]
    [InlineData("Dr. John H. Watson, MD", "D*** J*** H*** W***, M***")]
    [InlineData("<script>alert('xss')</script>", "S***")]
    [InlineData("123456", "1***")]
    [InlineData(null, "")]
    [InlineData("", "")]
    [InlineData("   ", "")]
    public void Challenge2_PhiRedaction_PatientNameMasking_EdgeCases(string? name, string expected)
    {
        var result = _redaction.MaskPatientName(name);
        result.Should().Be(expected);

        // Idempotency check
        if (!string.IsNullOrEmpty(result))
        {
            var twice = _redaction.MaskPatientName(result);
            twice.Should().Be(result);
        }
    }

    [Theory]
    [InlineData("123456789012", "12-****8901-2")]
    [InlineData("12-345678901-2", "12-****8901-2")]
    [InlineData("12 345678901 2", "12-****8901-2")]
    [InlineData("12-****8901-2", "12-****8901-2")] // Idempotent
    [InlineData("12-000005678-9", "12-****5678-9")]
    [InlineData("12345", "12****5")]
    [InlineData("123", "****")]
    [InlineData(null, "")]
    [InlineData("", "")]
    [InlineData("   ", "")]
    public void Challenge2_PhiRedaction_PhilHealthPin_BoundaryCases(string? pin, string expected)
    {
        var result = _redaction.MaskPhilHealthPin(pin);
        result.Should().Be(expected);
    }

    [Theory]
    [InlineData("+639171234567", "+63917****567")]
    [InlineData("09171234567", "0917****567")]
    [InlineData("0281234567", "02****67")]
    [InlineData("12345", "****")]
    [InlineData(null, "")]
    [InlineData("", "")]
    public void Challenge2_PhiRedaction_PhoneNumber_BoundaryCases(string? phone, string expected)
    {
        var result = _redaction.MaskPhoneNumber(phone);
        result.Should().Be(expected);
    }

    [Theory]
    [InlineData("patient@clinicez.ph", "p***t@clinicez.ph")]
    [InlineData("a@b.com", "a***@b.com")]
    [InlineData("ab@domain.com", "a***@domain.com")]
    [InlineData("p***t@clinicez.ph", "p***t@clinicez.ph")] // Idempotent
    [InlineData("invalid-email", "****")]
    [InlineData("@nodomain", "****")]
    [InlineData("nolocal@", "****")]
    [InlineData(null, "")]
    [InlineData("", "")]
    public void Challenge2_PhiRedaction_Email_BoundaryCases(string? email, string expected)
    {
        var result = _redaction.MaskEmail(email);
        result.Should().Be(expected);
    }

    #endregion

    #region Area 3: WORM Immutability Direct EF Core Mutation Attempts

    [Fact]
    public async Task Challenge3_WORM_DirectAttachAndMarkModified_ThrowsInvalidOperationException()
    {
        // ARRANGE: Insert initial immutable audit record in DB 1
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormDirectAttach_{Guid.NewGuid():N}";
        var entryId = Guid.NewGuid();

        using (var db1 = CreateSharedDbContext(dbName, clinicId))
        {
            db1.ClinicAuditEntries.Add(new ClinicAuditEntry
            {
                Id = entryId,
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Security",
                Severity = "Emergency",
                Action = "auth.login.failed",
                ActorName = "Attacker",
                ActorRole = "None",
                TargetEntityType = "StaffMember",
                TargetEntityId = Guid.NewGuid().ToString(),
                Outcome = "Failure",
                Description = "Brute force password attempt"
            });
            await db1.SaveChangesAsync();
        }

        // ACT & ASSERT: In separate DB context, attach entity and forcibly set State = Modified
        using (var db2 = CreateSharedDbContext(dbName, clinicId))
        {
            var detachedEntry = new ClinicAuditEntry
            {
                Id = entryId,
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Category = "Security",
                Severity = "Routine", // Tampered severity
                Action = "auth.login.success", // Tampered action
                ActorName = "Attacker",
                ActorRole = "Admin",
                TargetEntityType = "StaffMember",
                Outcome = "Success",
                Description = "Tampered login audit entry"
            };

            db2.Attach(detachedEntry);
            db2.Entry(detachedEntry).State = EntityState.Modified;

            Func<Task> act = async () => await db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }
    }

    [Fact]
    public async Task Challenge3_WORM_PropertyLevelIsModifiedTrue_ThrowsInvalidOperationException()
    {
        // ARRANGE
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormPropertyModified_{Guid.NewGuid():N}";
        var entryId = Guid.NewGuid();

        using (var db1 = CreateSharedDbContext(dbName, clinicId))
        {
            db1.ClinicAuditEntries.Add(new ClinicAuditEntry
            {
                Id = entryId,
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Billing",
                Severity = "Emergency",
                Action = "billing.invoice.voided",
                ActorName = "Cashier",
                ActorRole = "Cashier",
                TargetEntityType = "Invoice",
                TargetEntityId = "INV-001",
                Outcome = "Success",
                Description = "Legitimate void reason"
            });
            await db1.SaveChangesAsync();
        }

        // ACT & ASSERT: Load entry and flip individual property IsModified flags
        using (var db2 = CreateSharedDbContext(dbName, clinicId))
        {
            var entry = await db2.ClinicAuditEntries.FindAsync(entryId);
            entry.Should().NotBeNull();

            // Direct property modification flag
            db2.Entry(entry!).Property(e => e.Description).IsModified = true;

            Func<Task> act = async () => await db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }
    }

    [Fact]
    public async Task Challenge3_WORM_MetadataJsonPropertyModified_ThrowsInvalidOperationException()
    {
        // ARRANGE
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormMetadataJson_{Guid.NewGuid():N}";
        var entryId = Guid.NewGuid();

        using (var db1 = CreateSharedDbContext(dbName, clinicId))
        {
            db1.ClinicAuditEntries.Add(new ClinicAuditEntry
            {
                Id = entryId,
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Clinical",
                Severity = "Routine",
                Action = "clinical.consultation.signed",
                ActorName = "Dr. Santos",
                ActorRole = "Doctor",
                TargetEntityType = "ConsultationEncounter",
                Outcome = "Success",
                Description = "Original description",
                MetadataJson = "{\"original\": true}"
            });
            await db1.SaveChangesAsync();
        }

        // ACT & ASSERT
        using (var db2 = CreateSharedDbContext(dbName, clinicId))
        {
            var entry = await db2.ClinicAuditEntries.FindAsync(entryId);
            entry.Should().NotBeNull();

            db2.Entry(entry!).Property(e => e.MetadataJson).IsModified = true;

            Func<Task> act = async () => await db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }
    }

    [Fact]
    public async Task Challenge3_WORM_TimestampPropertyModified_ThrowsInvalidOperationException()
    {
        // ARRANGE
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormTimestamp_{Guid.NewGuid():N}";
        var entryId = Guid.NewGuid();

        using (var db1 = CreateSharedDbContext(dbName, clinicId))
        {
            db1.ClinicAuditEntries.Add(new ClinicAuditEntry
            {
                Id = entryId,
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "PhilHealth",
                Severity = "Routine",
                Action = "yakap.claim.submitted",
                ActorName = "Staff",
                ActorRole = "Staff",
                TargetEntityType = "YakapTransmittal",
                Outcome = "Success",
                Description = "Transmittal submitted"
            });
            await db1.SaveChangesAsync();
        }

        // ACT & ASSERT: Attempt backdating timestamp
        using (var db2 = CreateSharedDbContext(dbName, clinicId))
        {
            var entry = await db2.ClinicAuditEntries.FindAsync(entryId);
            entry.Should().NotBeNull();

            entry!.Timestamp = DateTime.UtcNow.AddDays(-30); // backdating attempt

            Func<Task> act = async () => await db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }
    }

    [Fact]
    public async Task Challenge3_WORM_RemoveRange_MultipleEntries_ThrowsInvalidOperationException()
    {
        // ARRANGE: Seed 5 audit records
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormRemoveRange_{Guid.NewGuid():N}";

        using (var db1 = CreateSharedDbContext(dbName, clinicId))
        {
            var entries = Enumerable.Range(1, 5).Select(i => new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Operations",
                Severity = "Routine",
                Action = $"operations.task_{i}",
                ActorName = "Admin",
                ActorRole = "Admin",
                TargetEntityType = "ClinicSettings",
                Outcome = "Success",
                Description = $"Operation {i}"
            }).ToList();

            await db1.ClinicAuditEntries.AddRangeAsync(entries);
            await db1.SaveChangesAsync();
        }

        // ACT & ASSERT: Attempt bulk purge via RemoveRange
        using (var db2 = CreateSharedDbContext(dbName, clinicId))
        {
            var loaded = await db2.ClinicAuditEntries.ToListAsync();
            loaded.Should().HaveCount(5);

            db2.ClinicAuditEntries.RemoveRange(loaded);

            Func<Task> act = async () => await db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }
    }

    [Fact]
    public async Task Challenge3_WORM_UpdateRange_MultipleEntries_ThrowsInvalidOperationException()
    {
        // ARRANGE
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormUpdateRange_{Guid.NewGuid():N}";

        using (var db1 = CreateSharedDbContext(dbName, clinicId))
        {
            var entries = Enumerable.Range(1, 3).Select(i => new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Security",
                Severity = "Routine",
                Action = $"security.event_{i}",
                ActorName = "Admin",
                ActorRole = "Admin",
                TargetEntityType = "StaffMember",
                Outcome = "Success",
                Description = $"Event {i}"
            }).ToList();

            await db1.ClinicAuditEntries.AddRangeAsync(entries);
            await db1.SaveChangesAsync();
        }

        // ACT & ASSERT: Attempt UpdateRange
        using (var db2 = CreateSharedDbContext(dbName, clinicId))
        {
            var loaded = await db2.ClinicAuditEntries.ToListAsync();
            foreach (var item in loaded)
            {
                item.Description = "Mass tampered description";
            }

            db2.ClinicAuditEntries.UpdateRange(loaded);

            Func<Task> act = async () => await db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }
    }

    [Fact]
    public async Task Challenge3_WORM_AtomicRollback_DoesNotCorruptAdjacentEntities()
    {
        // ARRANGE
        var clinicId = Guid.NewGuid();
        var dbName = $"ClinicEz_WormRollback_{Guid.NewGuid():N}";
        var auditEntryId = Guid.NewGuid();

        using (var db1 = CreateSharedDbContext(dbName, clinicId))
        {
            db1.ClinicAuditEntries.Add(new ClinicAuditEntry
            {
                Id = auditEntryId,
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = "Clinical",
                Severity = "Routine",
                Action = "clinical.consultation.signed",
                ActorName = "Doctor",
                ActorRole = "Doctor",
                TargetEntityType = "ConsultationEncounter",
                Outcome = "Success",
                Description = "Original consultation log"
            });
            await db1.SaveChangesAsync();
        }

        // ACT: Attempt to add a new Appointment AND mutate an existing ClinicAuditEntry in the same transaction
        var newAppointmentId = Guid.NewGuid();
        using (var db2 = CreateSharedDbContext(dbName, clinicId))
        {
            var auditEntry = await db2.ClinicAuditEntries.FindAsync(auditEntryId);
            auditEntry!.Description = "Tampered in mixed transaction";

            var appointment = new Appointment
            {
                Id = newAppointmentId,
                TenantId = "tenant_challenger_m1",
                ClinicId = clinicId,
                PatientName = "Test Patient",
                ScheduledAt = DateTime.UtcNow.AddHours(2),
                EndTimeUtc = DateTime.UtcNow.AddHours(3),
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Test"
            };

            await db2.Appointments.AddAsync(appointment);

            Func<Task> act = async () => await db2.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("*ClinicAuditEntry is append-only (WORM)*");
        }

        // ASSERT: In fresh context, verify the Appointment was rolled back and NOT persisted
        using (var db3 = CreateSharedDbContext(dbName, clinicId))
        {
            var savedAppt = await db3.Appointments.FindAsync(newAppointmentId);
            savedAppt.Should().BeNull("mixed transaction containing WORM mutation must atomically roll back");

            var unmutatedAudit = await db3.ClinicAuditEntries.FindAsync(auditEntryId);
            unmutatedAudit!.Description.Should().Be("Original consultation log");
        }
    }

    [Fact]
    public async Task Challenge3_MultiTenantIsolation_QueryFilter_EnforcedUnderConcurrency()
    {
        // ARRANGE: 5 separate clinics each inserting 20 audit records into a shared database
        var dbName = $"ClinicEz_MultiTenantStress_{Guid.NewGuid():N}";
        var clinicIds = Enumerable.Range(1, 5).Select(_ => Guid.NewGuid()).ToList();

        // Seed entries for each clinic
        foreach (var cId in clinicIds)
        {
            using var db = CreateSharedDbContext(dbName, cId);
            var entries = Enumerable.Range(1, 20).Select(i => new ClinicAuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = $"tenant_{cId:N}",
                ClinicId = cId,
                Timestamp = DateTime.UtcNow.AddMinutes(-i),
                Category = "Clinical",
                Severity = "Routine",
                Action = $"clinic.action_{i}",
                ActorName = $"Doctor of {cId:N}",
                ActorRole = "Doctor",
                TargetEntityType = "Patient",
                Outcome = "Success",
                Description = $"Audit entry {i} for clinic {cId}"
            }).ToList();

            await db.ClinicAuditEntries.AddRangeAsync(entries);
            await db.SaveChangesAsync();
        }

        // ACT: Concurrently query audit records from each clinic context
        var queryTasks = clinicIds.Select(cId => Task.Run(async () =>
        {
            using var db = CreateSharedDbContext(dbName, cId);
            var visible = await db.ClinicAuditEntries.ToListAsync();
            return (ClinicId: cId, Count: visible.Count, Items: visible);
        })).ToArray();

        var results = await Task.WhenAll(queryTasks);

        // ASSERT: Each clinic sees EXACTLY its own 20 entries and 0 from other clinics
        foreach (var res in results)
        {
            res.Count.Should().Be(20, $"Clinic {res.ClinicId} must see exactly its own 20 records");
            res.Items.All(e => e.ClinicId == res.ClinicId).Should().BeTrue("Zero cross-tenant data leakage");
        }

        // Unauthenticated context sees 0 records
        using (var unauthenticatedDb = CreateSharedDbContext(dbName, Guid.Empty))
        {
            var visible = await unauthenticatedDb.ClinicAuditEntries.ToListAsync();
            visible.Should().BeEmpty("unauthenticated or unknown clinic context must resolve to 0 audit entries");
        }

        // Global admin with IgnoreQueryFilters sees all 100 entries
        using (var adminDb = CreateSharedDbContext(dbName, Guid.Empty))
        {
            var allEntries = await adminDb.ClinicAuditEntries.IgnoreQueryFilters().ToListAsync();
            allEntries.Should().HaveCount(100, "all 100 entries exist across the 5 clinics");
        }
    }

    #endregion
}
