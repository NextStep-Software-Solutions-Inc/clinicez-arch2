using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Empirical E2E Challenger Tests for Milestone 1.
/// Pumps real envelopes through TestCell (Portal SDK -> Hub Mailbox -> Clinic Inbox Poller -> PatientJoinRequestedHandler -> Clinic DB).
/// Validates:
/// 1. End-to-end delivery with real poller pumping.
/// 2. Join code security gating via poller.
/// 3. Idempotent redelivery via poller.
/// 4. Soft-deleted patient code jumping via poller.
/// </summary>
public class PatientJoinE2EChallengerTests
{
    private const string MessageType = InteropTypes.PatientJoinRequested;

    private static PatientJoinRequestedPayload CreatePayload(
        string tenantSlug = "tenant-challenger",
        string facilitySlug = "challenger-clinic",
        string joinCode = "JOIN2026",
        string memberType = "MM")
    {
        return new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = tenantSlug,
            FacilitySlug = facilitySlug,
            JoinCode = joinCode,
            FirstName = "Emilio",
            MiddleName = "Famy",
            LastName = "Aguinaldo",
            DateOfBirth = new DateOnly(1869, 3, 22),
            Sex = "Male",
            ContactNumber = "0917-888-7777",
            Email = "emilio@cavite.ph",
            PhilHealthPin = "12-345678901-8",
            MemberType = memberType,
            ReasonForVisit = "Executive Checkup",
            Allergies =
            [
                new PatientJoinAllergyItem
                {
                    Allergen = "Aspirin",
                    Category = "Medication",
                    Severity = "Severe",
                    IsAnaphylactic = true
                }
            ],
            Attachments =
            [
                new PatientJoinAttachmentItem
                {
                    FileName = "xray.pdf",
                    FileType = "application/pdf",
                    StorageKey = "docs/xray.pdf",
                    FileSizeBytes = 500000,
                    Category = "Radiology"
                }
            ]
        };
    }

    [Fact]
    public async Task E2E_PumpAsync_IngestsPatientThroughRealHubPoller()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        // Configure facility slug and join code in clinic DB
        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";
            await db.SaveChangesAsync();
            return 0;
        });

        var payload = CreatePayload();
        var correlationId = Guid.NewGuid();

        var envelope = InteropEnvelope.Create(
            MessageType,
            Party.Portal,
            fac.Party,
            correlationId,
            payload);

        // Send via Portal SDK to Hub
        var sendResults = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        sendResults.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);

        // Pump message through Hub -> Clinic poller -> PatientJoinRequestedHandler
        await cell.PumpAsync();

        // Verify Clinic DB state
        await cell.Clinic.DbAsync(async db =>
        {
            var patient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ClinicId == fac.Id);
            patient.Should().NotBeNull("patient must be ingested into clinic DB after PumpAsync");
            patient!.FirstName.Should().Be("Emilio");
            patient.LastName.Should().Be("Aguinaldo");
            patient.VerificationStatus.Should().Be("PendingVerification");
            patient.PatientCode.Should().MatchRegex(@"^PAT-\d{4}-\d{5}$");

            var allergies = await db.PatientAllergies.IgnoreQueryFilters().Where(a => a.PatientId == patient.Id).ToListAsync();
            allergies.Should().ContainSingle();
            allergies[0].Allergen.Should().Be("Aspirin");

            var queueItems = await db.QueueItems.IgnoreQueryFilters().Where(q => q.PatientId == patient.Id).ToListAsync();
            queueItems.Should().ContainSingle();
            queueItems[0].QueueNumber.Should().Be("Q-001");

            var attachments = await db.RecordAttachments.IgnoreQueryFilters().Where(a => a.PatientId == patient.Id).ToListAsync();
            attachments.Should().ContainSingle();
            attachments[0].FileName.Should().Be("xray.pdf");
            attachments[0].VerificationStatus.Should().Be("PendingVerification");

            return 0;
        });
    }

    [Fact]
    public async Task E2E_PumpAsync_ExpiredCode_DroppedByHandlerWithoutCrashingPoller()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        // Configure EXPIRED join code
        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";
            settings.JoinCodeExpiresAt = DateTime.UtcNow.AddMinutes(-10); // Expired
            await db.SaveChangesAsync();
            return 0;
        });

        var payload = CreatePayload();
        var envelope = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, Guid.NewGuid(), payload);

        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        await cell.PumpAsync();

        // Clinic DB must have NO patients
        await cell.Clinic.DbAsync(async db =>
        {
            var patients = await db.Patients.IgnoreQueryFilters().Where(p => p.ClinicId == fac.Id).ToListAsync();
            patients.Should().BeEmpty("expired join code must be dropped by handler");
            return 0;
        });
    }

    [Fact]
    public async Task E2E_PumpAsync_IdempotentRedelivery_ExactlyOnePatientInClinicDb()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";
            await db.SaveChangesAsync();
            return 0;
        });

        var payload = CreatePayload();
        var correlationId = Guid.NewGuid();

        var envelope1 = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, correlationId, payload);
        var envelope2 = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, correlationId, payload);

        // Send first envelope and pump
        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope1], CancellationToken.None);
        await cell.PumpAsync();

        // Send second envelope (duplicate) and pump
        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope2], CancellationToken.None);
        await cell.PumpAsync();

        // Verify exactly one patient exists
        await cell.Clinic.DbAsync(async db =>
        {
            var count = await db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == fac.Id);
            count.Should().Be(1, "duplicate redelivery via poller must be idempotent");

            var queueCount = await db.QueueItems.IgnoreQueryFilters().CountAsync(q => q.ClinicId == fac.Id);
            queueCount.Should().Be(1);
            return 0;
        });
    }

    [Fact]
    public async Task E2E_PumpAsync_SoftDeletedCollision_SequentialCodeJumpsOverDeleted()
    {
        await using var cell = new TestCell();
        var fac = await cell.ProvisionAsync(Fac.Clinic("tenant-challenger", "Challenger Clinic"));

        var year = DateTime.UtcNow.Year;

        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.ClinicSettings.IgnoreQueryFilters().FirstAsync(s => s.ClinicId == fac.Id);
            settings.FacilitySlug = "challenger-clinic";
            settings.IsJoinEnabled = true;
            settings.JoinCode = "JOIN2026";

            // Seed soft-deleted patient with PAT-yyyy-00007
            db.Patients.Add(new ClinicPatient
            {
                Id = Guid.NewGuid(),
                TenantId = fac.Tenant,
                ClinicId = fac.Id,
                PatientCode = $"PAT-{year}-00007",
                FirstName = "Deleted",
                LastName = "Hero",
                DateOfBirth = new DateOnly(1970, 1, 1),
                ContactNumber = "0911-000-0000",
                IsDeleted = true,
                DeletedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "seed"
            });

            await db.SaveChangesAsync();
            return 0;
        });

        var payload = CreatePayload();
        var envelope = InteropEnvelope.Create(MessageType, Party.Portal, fac.Party, Guid.NewGuid(), payload);

        await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        await cell.PumpAsync();

        await cell.Clinic.DbAsync(async db =>
        {
            var activePatient = await db.Patients.IgnoreQueryFilters().FirstOrDefaultAsync(p => !p.IsDeleted && p.ClinicId == fac.Id);
            activePatient.Should().NotBeNull();
            activePatient!.PatientCode.Should().Be($"PAT-{year}-00008");
            return 0;
        });
    }
}
