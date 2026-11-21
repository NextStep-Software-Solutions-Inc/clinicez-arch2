using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Adversarial Stress & Empirical Verification Test Suite for Milestone 2:
/// 1. Transaction rollback behavior & failure isolation (failed saves stage 0 outbox messages).
/// 2. Manila timezone boundary behavior (UTC to Asia/Manila conversion, midnight cutoffs, zero-PHI UpNext).
/// 3. Auto-prefixed join codes with 4-char clinic discriminator.
/// 4. Prescription token minting and external dispense relay cryptographic verification.
/// </summary>
public class ChallengerM2_1AdversarialProjectionTests
{
    private readonly Guid _clinicId = Guid.Parse("b4c78d12-34ef-47a1-89ab-cdef01234567");
    private readonly string _tenantId = "tenant-adv-proj";
    private readonly IClinicContext _clinicContext;
    private readonly IDocumentSecurityService _securityService = new DocumentSecurityService();

    public ChallengerM2_1AdversarialProjectionTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    private ApplicationDbContext CreateContext(string sharedDbName, IInterceptor? additionalInterceptor = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[]
            {
                new KeyValuePair<string, string?>("DbSchema", "public")
            })
            .Build();

        var projectionInterceptor = new ClinicPortalProjectionInterceptor(_securityService);

        var builder = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: sharedDbName)
            .AddInterceptors(projectionInterceptor);

        if (additionalInterceptor != null)
        {
            builder.AddInterceptors(additionalInterceptor);
        }

        return new ApplicationDbContext(builder.Options, config, _clinicContext);
    }

    // =========================================================================
    // 1. TRANSACTION ROLLBACK & FAILURE ISOLATION (ZERO OUTBOX LEAKS)
    // =========================================================================

    [Fact]
    public async Task Transaction_Cancelled_Token_Aborts_Save_And_Leaves_Zero_Outbox_In_Store()
    {
        var sharedDbName = $"Adv_Proj_Rollback_{Guid.NewGuid():N}";

        // Context 1 attempts to add settings with an already-cancelled token
        await using (var db1 = CreateContext(sharedDbName))
        {
            var settings = new FacilitySettings
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                ClinicName = "Rollback Clinic",
                JoinCode = "SHOULD_NOT_LEAK",
                IsJoinEnabled = true
            };
            db1.Settings.Add(settings);

            using var cts = new CancellationTokenSource();
            cts.Cancel();

            var act = () => db1.SaveChangesAsync(cts.Token);
            await act.Should().ThrowAsync<OperationCanceledException>();
        }

        // Context 2 queries the underlying store: verify ZERO outbox messages and ZERO entities exist
        await using (var db2 = CreateContext(sharedDbName))
        {
            var outboxMessages = await db2.InteropOutbox.ToListAsync();
            outboxMessages.Should().BeEmpty("Failed/cancelled transactions must leave 0 outbox messages in store");

            var settingsInDb = await db2.Settings.IgnoreQueryFilters().ToListAsync();
            settingsInDb.Should().BeEmpty("Entity must not be saved when transaction is cancelled");
        }
    }

    [Fact]
    public async Task Transaction_MidSave_Exception_Stages_Zero_Outbox_Messages_In_Store()
    {
        var sharedDbName = $"Adv_Proj_Exception_{Guid.NewGuid():N}";
        var throwingInterceptor = new ThrowingSaveChangesInterceptor();

        // Context 1 adds multiple entities, but second interceptor throws during saving
        await using (var db1 = CreateContext(sharedDbName, throwingInterceptor))
        {
            db1.Settings.Add(new FacilitySettings
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                ClinicName = "MidSave Fail Clinic",
                JoinCode = "FAIL_CODE",
                IsJoinEnabled = true
            });

            db1.QueueItems.Add(new QueueItem
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = "Q-FAIL",
                SequenceNumber = 1,
                QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
                PatientId = Guid.NewGuid(),
                PatientName = "Secret Patient",
                Status = QueueStatus.Waiting
            });

            var act = () => db1.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>()
                .WithMessage("Simulated mid-transaction failure");
        }

        // Context 2 inspects store: verify zero outbox records committed
        await using (var db2 = CreateContext(sharedDbName))
        {
            var outbox = await db2.InteropOutbox.ToListAsync();
            outbox.Should().BeEmpty("An aborted transaction must commit 0 outbox records to store");

            var queue = await db2.QueueItems.IgnoreQueryFilters().ToListAsync();
            queue.Should().BeEmpty("No queue items should be committed on transaction failure");
        }
    }

    [Fact]
    public async Task Transaction_Multiple_Entities_Fail_Atomically_Without_Partial_Outbox_Leak()
    {
        var sharedDbName = $"Adv_Proj_MultiEntity_{Guid.NewGuid():N}";
        var throwingInterceptor = new ThrowingSaveChangesInterceptor();

        await using (var db1 = CreateContext(sharedDbName, throwingInterceptor))
        {
            // Settings
            db1.Settings.Add(new FacilitySettings
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                ClinicName = "Atomic Test Clinic",
                JoinCode = "ATOMIC1"
            });

            // Med Cert
            db1.MedicalCertificates.Add(new MedicalCertificate
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                CertificateNumber = "MC-ATOMIC-001",
                PatientId = Guid.NewGuid(),
                PatientName = "Atom Patient",
                Diagnosis = "Atomic Diagnosis",
                DoctorId = Guid.NewGuid(),
                DoctorName = "Dr. Atom",
                PrcLicenseNumber = "PRC-ATOM",
                IsSigned = true,
                SignedAt = DateTime.UtcNow
            });

            // Paid Invoice
            db1.Invoices.Add(new Invoice
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                InvoiceNumber = "INV-ATOMIC-001",
                PatientId = Guid.NewGuid(),
                PatientName = "Paying Patient",
                Status = InvoiceStatus.Paid,
                GrossAmount = 100,
                NetAmount = 100,
                AmountPaid = 100,
                InvoiceDate = DateTime.UtcNow
            });

            var act = () => db1.SaveChangesAsync();
            await act.Should().ThrowAsync<InvalidOperationException>();
        }

        // Verify across all projection tables: exactly 0 outbox messages
        await using (var db2 = CreateContext(sharedDbName))
        {
            var outbox = await db2.InteropOutbox.ToListAsync();
            outbox.Should().BeEmpty("Multi-entity batch failure must not commit partial projection messages");
        }
    }

    // =========================================================================
    // 2. MANILA TIMEZONE BOUNDARY & DATE CUTOFF BEHAVIOR
    // =========================================================================

    [Fact]
    public void Manila_Timezone_Boundary_155959_UTC_Maps_To_Same_Manila_Date()
    {
        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");

        // 2026-10-25 15:59:59 UTC = 2026-10-25 23:59:59 PHT (same date)
        var utc = new DateTime(2026, 10, 25, 15, 59, 59, DateTimeKind.Utc);
        var manila = TimeZoneInfo.ConvertTimeFromUtc(utc, tz);

        DateOnly.FromDateTime(manila).Should().Be(new DateOnly(2026, 10, 25));
        manila.Hour.Should().Be(23);
        manila.Minute.Should().Be(59);
        manila.Second.Should().Be(59);
    }

    [Fact]
    public void Manila_Timezone_Boundary_160000_UTC_Maps_To_Next_Manila_Date()
    {
        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");

        // 2026-10-25 16:00:00 UTC = 2026-10-26 00:00:00 PHT (transitions to next calendar day in Manila)
        var utc = new DateTime(2026, 10, 25, 16, 0, 0, DateTimeKind.Utc);
        var manila = TimeZoneInfo.ConvertTimeFromUtc(utc, tz);

        DateOnly.FromDateTime(manila).Should().Be(new DateOnly(2026, 10, 26));
        manila.Hour.Should().Be(0);
        manila.Minute.Should().Be(0);
        manila.Second.Should().Be(0);
    }

    [Fact]
    public async Task QueueBoard_Excludes_Stale_Yesterday_And_Future_Tickets_From_Snapshot()
    {
        var sharedDbName = $"Adv_Proj_QueueBoundary_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var yesterdayManila = todayManila.AddDays(-1);
        var tomorrowManila = todayManila.AddDays(1);

        db.Settings.Add(new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Queue Boundary Clinic",
            IsJoinEnabled = true
        });

        // 1. Stale yesterday ticket (Waiting)
        var staleYesterday = new QueueItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-YESTERDAY",
            SequenceNumber = 99,
            QueueDate = yesterdayManila,
            PatientId = Guid.NewGuid(),
            PatientName = "Yesterday Patient",
            Status = QueueStatus.Waiting
        };

        // 2. Future tomorrow ticket (Waiting)
        var futureTomorrow = new QueueItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-TOMORROW",
            SequenceNumber = 100,
            QueueDate = tomorrowManila,
            PatientId = Guid.NewGuid(),
            PatientName = "Tomorrow Patient",
            Status = QueueStatus.Waiting
        };

        // 3. Today's ticket in consultation (NowServing)
        var todayServing = new QueueItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-TODAY-001",
            SequenceNumber = 1,
            QueueDate = todayManila,
            PatientId = Guid.NewGuid(),
            PatientName = "Today InConsultation Patient",
            DoctorName = "Dr. Santos",
            RoomOrStation = "Room 3",
            CalledTime = DateTime.UtcNow,
            Status = QueueStatus.InConsultation
        };

        // 4. Today's ticket waiting (UpNext)
        var todayWaiting = new QueueItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-TODAY-002",
            SequenceNumber = 2,
            QueueDate = todayManila,
            PatientId = Guid.NewGuid(),
            PatientName = "Today Waiting Patient",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Urgent
        };

        db.QueueItems.AddRange(staleYesterday, futureTomorrow, todayServing, todayWaiting);
        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var queueMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.QueueBoardUpdated);
        queueMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(queueMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<QueueBoardUpdatedPayload>();

        payload.QueueDate.Should().Be(todayManila);

        // Verify NowServing has exactly today's ticket, and zero yesterday/tomorrow tickets
        payload.NowServing.Should().HaveCount(1);
        payload.NowServing[0].TicketNumber.Should().Be("Q-TODAY-001");
        payload.NowServing.Select(s => s.TicketNumber).Should().NotContain("Q-YESTERDAY");
        payload.NowServing.Select(s => s.TicketNumber).Should().NotContain("Q-TOMORROW");

        // Verify UpNext has exactly today's waiting ticket, and zero yesterday/tomorrow tickets
        payload.UpNext.Should().HaveCount(1);
        payload.UpNext[0].TicketNumber.Should().Be("Q-TODAY-002");
        payload.UpNext.Select(u => u.TicketNumber).Should().NotContain("Q-YESTERDAY");
        payload.UpNext.Select(u => u.TicketNumber).Should().NotContain("Q-TOMORROW");

        // Verify PatientsWaitingCount reflects only today's waiting tickets
        payload.PatientsWaitingCount.Should().Be(1);
    }

    [Fact]
    public async Task QueueBoard_Stale_Yesterday_Tickets_In_Db_Are_Excluded_When_New_Ticket_Is_Added()
    {
        var sharedDbName = $"Adv_Proj_StaleDb_{Guid.NewGuid():N}";
        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var yesterdayManila = todayManila.AddDays(-1);

        // Pre-seed yesterday's stale ticket in DB
        await using (var dbSeed = CreateContext(sharedDbName))
        {
            dbSeed.Settings.Add(new FacilitySettings
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                ClinicName = "Stale Preseed Clinic"
            });
            dbSeed.QueueItems.Add(new QueueItem
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = "Q-STALE-OLD",
                SequenceNumber = 10,
                QueueDate = yesterdayManila,
                PatientId = Guid.NewGuid(),
                PatientName = "Leftover Stale Patient",
                Status = QueueStatus.Waiting
            });
            await dbSeed.SaveChangesAsync();

            // Clear outbox from preseed
            dbSeed.InteropOutbox.RemoveRange(dbSeed.InteropOutbox);
            await dbSeed.SaveChangesAsync();
        }

        // Today a new ticket is checked in
        await using (var dbToday = CreateContext(sharedDbName))
        {
            dbToday.QueueItems.Add(new QueueItem
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = "Q-NEW-TODAY",
                SequenceNumber = 1,
                QueueDate = todayManila,
                PatientId = Guid.NewGuid(),
                PatientName = "Fresh Patient",
                Status = QueueStatus.Waiting
            });
            await dbToday.SaveChangesAsync();

            var outbox = await dbToday.InteropOutbox.ToListAsync();
            var queueMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.QueueBoardUpdated);
            queueMsg.Should().NotBeNull();

            var envelope = InteropEnvelope.FromJson(queueMsg!.EnvelopeJson);
            var payload = envelope.GetPayload<QueueBoardUpdatedPayload>();

            // Pre-seeded yesterday ticket must NOT appear in today's UpNext
            payload.UpNext.Should().HaveCount(1);
            payload.UpNext[0].TicketNumber.Should().Be("Q-NEW-TODAY");
            payload.PatientsWaitingCount.Should().Be(1);
        }
    }

    // =========================================================================
    // 3. ZERO-PHI UP-NEXT & SERIALIZED ENVELOPE VERIFICATION
    // =========================================================================

    [Fact]
    public async Task UpNext_Strictly_Enforces_Null_DisplayName_And_Raw_Envelope_Contains_Zero_PHI()
    {
        var sharedDbName = $"Adv_Proj_ZeroPhi_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        var sensitivePatientName1 = "Juan Ponce Enrile Del Rosario";
        var sensitivePatientName2 = "Maria Mercedes De La Cruz";
        var sensitiveComplaint = "Confidential Psychiatric Evaluation";
        var patientId1 = Guid.Parse("11111111-2222-3333-4444-555555555555");
        var patientId2 = Guid.Parse("66666666-7777-8888-9999-000000000000");

        db.Settings.Add(new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Zero PHI Clinic"
        });

        db.QueueItems.AddRange(
            new QueueItem
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = "Q-PHI-01",
                SequenceNumber = 1,
                QueueDate = todayManila,
                PatientId = patientId1,
                PatientName = sensitivePatientName1,
                ChiefComplaint = sensitiveComplaint,
                Status = QueueStatus.Waiting,
                Priority = QueuePriority.Emergency
            },
            new QueueItem
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = "Q-PHI-02",
                SequenceNumber = 2,
                QueueDate = todayManila,
                PatientId = patientId2,
                PatientName = sensitivePatientName2,
                Status = QueueStatus.Triaged,
                Priority = QueuePriority.Urgent
            }
        );

        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var queueMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.QueueBoardUpdated);
        queueMsg.Should().NotBeNull();

        // 1. Strongly typed payload check: DisplayName must be strictly null
        var envelope = InteropEnvelope.FromJson(queueMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<QueueBoardUpdatedPayload>();

        payload.UpNext.Should().HaveCount(2);
        foreach (var upcoming in payload.UpNext)
        {
            upcoming.DisplayName.Should().BeNull("UpNext item DisplayName must be null to guarantee zero PHI leak");
        }

        // 2. Raw JSON string inspection: verify zero occurrence of patient names, IDs, or complaints
        var rawEnvelopeJson = queueMsg.EnvelopeJson;
        rawEnvelopeJson.Should().NotContain(sensitivePatientName1, "Raw JSON must never contain patient name");
        rawEnvelopeJson.Should().NotContain(sensitivePatientName2, "Raw JSON must never contain patient name");
        rawEnvelopeJson.Should().NotContain(sensitiveComplaint, "Raw JSON must never contain clinical complaint");
        rawEnvelopeJson.Should().NotContain(patientId1.ToString(), "Raw JSON must never contain patient GUID");
        rawEnvelopeJson.Should().NotContain(patientId2.ToString(), "Raw JSON must never contain patient GUID");
    }

    [Fact]
    public async Task NowServing_Contains_Zero_Patient_Identifiers()
    {
        var sharedDbName = $"Adv_Proj_NowServingPhi_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var todayManila = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var secretPatientName = "Extremely Confidential VIP Patient";

        db.Settings.Add(new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Now Serving VIP Clinic"
        });

        db.QueueItems.Add(new QueueItem
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-VIP-01",
            SequenceNumber = 1,
            QueueDate = todayManila,
            PatientId = Guid.NewGuid(),
            PatientName = secretPatientName,
            DoctorName = "Dr. Attending",
            RoomOrStation = "Executive Suite 1",
            Status = QueueStatus.InConsultation,
            CalledTime = DateTime.UtcNow
        });

        await db.SaveChangesAsync();

        var outbox = await db.InteropOutbox.ToListAsync();
        var queueMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.QueueBoardUpdated);
        queueMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(queueMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<QueueBoardUpdatedPayload>();

        payload.NowServing.Should().HaveCount(1);
        payload.NowServing[0].TicketNumber.Should().Be("Q-VIP-01");
        payload.NowServing[0].DoctorName.Should().Be("Dr. Attending");
        payload.NowServing[0].RoomOrStation.Should().Be("Executive Suite 1");

        // Verify raw JSON string does not leak the VIP patient name
        queueMsg.EnvelopeJson.Should().NotContain(secretPatientName);
    }

    // =========================================================================
    // 4. AUTO-PREFIXED JOIN CODES WITH 4-CHAR CLINIC DISCRIMINATOR
    // =========================================================================

    [Theory]
    [InlineData("b4c78d12-34ef-47a1-89ab-cdef01234567", "JOINNOW", "B4C7-JOINNOW")]
    [InlineData("00001111-2222-3333-4444-555555555555", "welcome", "0000-WELCOME")]
    [InlineData("e0a9b1c2-d3e4-f5a6-b7c8-d9e0f1a2b3c4", "  spaced  ", "E0A9-SPACED")]
    [InlineData("ffff9999-8888-7777-6666-555544443333", "ALREADY-HYPHEN", "ALREADY-HYPHEN")]
    [InlineData("b4c78d12-34ef-47a1-89ab-cdef01234567", "B4C7-JOINNOW", "B4C7-JOINNOW")]
    public async Task JoinCode_Prefixing_Handles_Various_ClinicIds_And_Idempotency(
        string clinicGuidStr,
        string inputJoinCode,
        string expectedJoinCode)
    {
        var targetClinicId = Guid.Parse(clinicGuidStr);
        var sharedDbName = $"Adv_Proj_JoinCode_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = targetClinicId,
            ClinicName = "Join Code Test Clinic",
            JoinCode = inputJoinCode,
            IsJoinEnabled = true
        };

        db.Settings.Add(settings);
        await db.SaveChangesAsync();

        // 1. Entity in DB should have the expected join code
        settings.JoinCode.Should().Be(expectedJoinCode);

        // 2. Outbox payload should also have the expected join code
        var outbox = await db.InteropOutbox.ToListAsync();
        var joinMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.FacilityJoinSettingsUpdated && m.CorrelationId == targetClinicId);
        joinMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(joinMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<FacilityJoinSettingsUpdatedPayload>();
        payload.JoinCode.Should().Be(expectedJoinCode);
        payload.FacilityId.Should().Be(targetClinicId);
    }

    [Fact]
    public async Task JoinCode_Null_Or_Whitespace_Does_Not_Throw_And_Remains_Unprefixed()
    {
        var sharedDbName = $"Adv_Proj_NullJoin_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Null Join Code Clinic",
            JoinCode = null,
            IsJoinEnabled = false
        };

        db.Settings.Add(settings);
        await db.SaveChangesAsync();

        settings.JoinCode.Should().BeNull();

        var outbox = await db.InteropOutbox.ToListAsync();
        var joinMsg = outbox.FirstOrDefault(m => m.Type == InteropTypes.FacilityJoinSettingsUpdated);
        joinMsg.Should().NotBeNull();

        var envelope = InteropEnvelope.FromJson(joinMsg!.EnvelopeJson);
        var payload = envelope.GetPayload<FacilityJoinSettingsUpdatedPayload>();
        payload.JoinCode.Should().BeNull();
        payload.IsJoinEnabled.Should().BeFalse();
    }

    [Fact]
    public async Task JoinCode_Multiple_Consecutive_Saves_Are_Strictly_Idempotent()
    {
        var sharedDbName = $"Adv_Proj_ConsecutiveJoin_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var settings = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Idempotent Join Clinic",
            JoinCode = "FIRSTCODE",
            IsJoinEnabled = true
        };

        db.Settings.Add(settings);
        await db.SaveChangesAsync();

        var expectedPrefix = _clinicId.ToString("N")[..4].ToUpperInvariant();
        settings.JoinCode.Should().Be($"{expectedPrefix}-FIRSTCODE");

        // Save 2: mutate operating hours
        settings.OperatingHours = "7:00 AM - 7:00 PM";
        await db.SaveChangesAsync();

        settings.JoinCode.Should().Be($"{expectedPrefix}-FIRSTCODE", "Repeated saves must not double-prefix");

        // Save 3: mutate address
        settings.LetterheadAddress = "Suite 500, Medical Plaza";
        await db.SaveChangesAsync();

        settings.JoinCode.Should().Be($"{expectedPrefix}-FIRSTCODE", "Third save must still preserve single prefix");
    }

    [Fact]
    public async Task JoinCode_Multiple_Clinics_In_Same_Batch_Get_Distinct_4Char_Discriminators()
    {
        var sharedDbName = $"Adv_Proj_MultiClinicJoin_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var clinic1 = Guid.Parse("1111aaaa-0000-0000-0000-000000000000");
        var clinic2 = Guid.Parse("2222bbbb-0000-0000-0000-000000000000");

        var settings1 = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = clinic1,
            ClinicName = "Clinic One",
            JoinCode = "COMMON"
        };
        var settings2 = new FacilitySettings
        {
            TenantId = _tenantId,
            ClinicId = clinic2,
            ClinicName = "Clinic Two",
            JoinCode = "COMMON"
        };

        db.Settings.AddRange(settings1, settings2);
        await db.SaveChangesAsync();

        settings1.JoinCode.Should().Be("1111-COMMON");
        settings2.JoinCode.Should().Be("2222-COMMON");

        var outbox = await db.InteropOutbox.ToListAsync();
        var joinMsgs = outbox.Where(m => m.Type == InteropTypes.FacilityJoinSettingsUpdated).ToList();
        joinMsgs.Should().HaveCount(2);

        var payload1 = InteropEnvelope.FromJson(joinMsgs.First(m => m.CorrelationId == clinic1).EnvelopeJson).GetPayload<FacilityJoinSettingsUpdatedPayload>();
        var payload2 = InteropEnvelope.FromJson(joinMsgs.First(m => m.CorrelationId == clinic2).EnvelopeJson).GetPayload<FacilityJoinSettingsUpdatedPayload>();

        payload1.JoinCode.Should().Be("1111-COMMON");
        payload2.JoinCode.Should().Be("2222-COMMON");
    }

    // =========================================================================
    // 5. RX VERIFICATION TOKEN & DISPENSE RELAY ADVERSARIAL CASES
    // =========================================================================

    [Fact]
    public async Task Rx_Token_Minting_Produces_65Char_Hex_With_ClinicId_Prefix()
    {
        var sharedDbName = $"Adv_Proj_RxMint_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Rx Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. RX Minter",
            PrescriptionNumber = "RX-MINT-001",
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            Prescriptions = new List<PrescriptionItem>
            {
                new() { GenericName = "Paracetamol", Dosage = "500mg", Form = "Tablet", Sig = "TID", Quantity = 10 }
            }
        };

        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        encounter.RxPublicVerificationToken.Should().NotBeNullOrWhiteSpace();
        encounter.RxPublicVerificationToken!.Length.Should().Be(65, "Format is {clinicId:N}.{secret:N} which is 32 + 1 + 32 = 65 chars");
        encounter.RxPublicVerificationToken.Should().StartWith(_clinicId.ToString("N"));
        encounter.RxPublicVerificationToken[32].Should().Be('.');
    }

    [Fact]
    public async Task ExternalPrescriptionDispensedHandler_Rejects_Token_Altered_By_Single_Character()
    {
        var sharedDbName = $"Adv_Proj_TamperToken_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var validToken = $"{_clinicId:N}.{Guid.NewGuid():N}";
        // Tamper with the very last character
        var lastChar = validToken[^1];
        var tamperedLastChar = lastChar == 'a' ? 'b' : 'a';
        var tamperedToken = validToken[..^1] + tamperedLastChar;

        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Tamper Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Tamper",
            PrescriptionNumber = "RX-TAMPER-01",
            RxPublicVerificationToken = validToken,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = tamperedToken,
            ExternalPharmacyName = "Attacker Drug",
            DispensedAt = DateTime.UtcNow
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);

        await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued, "Tampered token must be rejected in constant time");
    }

    [Fact]
    public async Task ExternalPrescriptionDispensedHandler_CrossClinic_Attack_Is_Rejected()
    {
        var sharedDbName = $"Adv_Proj_CrossClinic_{Guid.NewGuid():N}";
        await using var db = CreateContext(sharedDbName);

        var otherClinicId = Guid.NewGuid();
        var token = $"{otherClinicId:N}.{Guid.NewGuid():N}";

        // Encounter belongs to otherClinicId
        var encounter = new ConsultationEncounter
        {
            TenantId = _tenantId,
            ClinicId = otherClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Cross Patient",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Cross",
            PrescriptionNumber = "RX-CROSS-01",
            RxPublicVerificationToken = token,
            RxDispenseStatus = PrescriptionDispenseStatus.Issued,
            IsSigned = true,
            SignedAt = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        var recipientResolver = new ClinicRecipientResolver(db, NullLogger<ClinicRecipientResolver>.Instance);
        var handler = new ExternalPrescriptionDispensedHandler(
            db, recipientResolver, NullLogger<ExternalPrescriptionDispensedHandler>.Instance);

        var dispenseEvent = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = encounter.Id,
            VerificationToken = token,
            ExternalPharmacyName = "Mercury Drug",
            DispensedAt = DateTime.UtcNow
        };

        // Message is addressed to _clinicId, but prescription belongs to otherClinicId
        var envelope = InteropEnvelope.Create(
            InteropTypes.RxExternalDispensed,
            Party.Portal,
            Party.ForFacility(_tenantId, _clinicId.ToString(), FacilityType.Clinic),
            encounter.Id,
            dispenseEvent);

        await handler.HandleAsync(dispenseEvent, new InteropMessageContext(envelope), CancellationToken.None);

        encounter.RxDispenseStatus.Should().Be(PrescriptionDispenseStatus.Issued, "Cross-clinic dispense attempt must be rejected");
    }

    // =========================================================================
    // HELPER: Throwing SaveChangesInterceptor to simulate mid-transaction errors
    // =========================================================================

    private sealed class ThrowingSaveChangesInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            throw new InvalidOperationException("Simulated mid-transaction failure");
        }

        public override InterceptionResult<int> SavingChanges(
            DbContextEventData eventData,
            InterceptionResult<int> result)
        {
            throw new InvalidOperationException("Simulated mid-transaction failure");
        }
    }
}
