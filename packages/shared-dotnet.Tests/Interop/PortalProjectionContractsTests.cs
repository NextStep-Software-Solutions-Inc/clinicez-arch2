using System;
using System.Text.Json;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Interop;

public class PortalProjectionContractsTests
{
    [Fact]
    public void FacilityJoinSettingsUpdatedPayload_SerializesAndDeserializesCleanly()
    {
        var payload = new FacilityJoinSettingsUpdatedPayload
        {
            TenantId = "tenant-001",
            FacilityId = Guid.NewGuid(),
            IsJoinEnabled = true,
            JoinCode = "CL01-JOIN99",
            JoinCodeExpiresAtUtc = DateTime.UtcNow.AddDays(30),
            FacilityAddress = "123 Medical Center Way, Makati City",
            OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM",
            UpdatedAtUtc = DateTime.UtcNow
        };

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);
        json.Should().Contain("tenant-001");
        json.Should().Contain("CL01-JOIN99");

        var deserialized = JsonSerializer.Deserialize<FacilityJoinSettingsUpdatedPayload>(json, InteropJson.Options);
        deserialized.Should().NotBeNull();
        deserialized!.TenantId.Should().Be(payload.TenantId);
        deserialized.FacilityId.Should().Be(payload.FacilityId);
        deserialized.IsJoinEnabled.Should().BeTrue();
        deserialized.JoinCode.Should().Be("CL01-JOIN99");
        deserialized.FacilityAddress.Should().Be("123 Medical Center Way, Makati City");
    }

    [Fact]
    public void DocumentAttestationPublishedPayload_EnforcesZeroPhiContract()
    {
        var payload = new DocumentAttestationPublishedPayload
        {
            SourceDocumentId = Guid.NewGuid(),
            TenantId = "tenant-001",
            FacilityId = Guid.NewGuid(),
            DocumentKind = "rx",
            DocumentNumber = "RX-20261025-0042",
            SecurityDigest = "SEC-SHA256-4FA8B19C30E291F0",
            VerificationTokenHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            ClinicName = "St. Jude Family Health Clinic",
            ClinicAddress = "Manila, Philippines",
            DoctorName = "Dr. Maria Santos, MD",
            DoctorPrcLicense = "PRC-0098765",
            DoctorPtr = "PTR-123456",
            DoctorS2License = "S2-987654",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddMonths(1),
            Status = "VALID",
            IsAlreadyDispensed = false,
            DispenseStatus = "Pending",
            HasDangerousDrug = false,
            ItemCount = 2
        };

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<DocumentAttestationPublishedPayload>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.DocumentKind.Should().Be("rx");
        deserialized.DocumentNumber.Should().Be("RX-20261025-0042");
        deserialized.SecurityDigest.Should().Be("SEC-SHA256-4FA8B19C30E291F0");
        deserialized.DoctorPrcLicense.Should().Be("PRC-0098765");
        deserialized.ItemCount.Should().Be(2);
    }

    [Fact]
    public void QueueBoardUpcomingItemDto_EnforcesZeroPhi_DisplayNameAlwaysNullByDefault()
    {
        var upcoming = new QueueBoardUpcomingItemDto
        {
            QueueItemId = Guid.NewGuid(),
            TicketNumber = "A-007",
            Priority = "Routine",
            Status = "Waiting",
            SequenceNumber = 7,
            CheckInTime = DateTime.UtcNow
        };

        upcoming.DisplayName.Should().BeNull("zero-PHI contract requires public queue display name to be null");

        var json = JsonSerializer.Serialize(upcoming, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<QueueBoardUpcomingItemDto>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.TicketNumber.Should().Be("A-007");
        deserialized.DisplayName.Should().BeNull();
    }

    [Fact]
    public void QueueBoardUpdatedPayload_SerializesWithDateOnlyAndCollections()
    {
        var payload = new QueueBoardUpdatedPayload
        {
            TenantId = "tenant-001",
            FacilityId = Guid.NewGuid(),
            QueueDate = new DateOnly(2026, 10, 25),
            GeneratedAtUtc = DateTime.UtcNow,
            IsAcceptingWalkIns = true,
            PatientsWaitingCount = 3,
            NowServing = new[]
            {
                new QueueBoardServingItemDto
                {
                    QueueItemId = Guid.NewGuid(),
                    TicketNumber = "A-001",
                    DoctorName = "Dr. Santos",
                    RoomOrStation = "Room 1",
                    CalledTime = DateTime.UtcNow,
                    Status = "InConsultation"
                }
            },
            UpNext = new[]
            {
                new QueueBoardUpcomingItemDto
                {
                    QueueItemId = Guid.NewGuid(),
                    TicketNumber = "A-002",
                    SequenceNumber = 2
                }
            }
        };

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);
        json.Should().Contain("2026-10-25");
        json.Should().Contain("A-001");
        json.Should().Contain("A-002");

        var deserialized = JsonSerializer.Deserialize<QueueBoardUpdatedPayload>(json, InteropJson.Options);
        deserialized.Should().NotBeNull();
        deserialized!.QueueDate.Should().Be(new DateOnly(2026, 10, 25));
        deserialized.NowServing.Should().HaveCount(1);
        deserialized.NowServing[0].TicketNumber.Should().Be("A-001");
        deserialized.NowServing[0].RoomOrStation.Should().Be("Room 1");
        deserialized.UpNext.Should().HaveCount(1);
        deserialized.UpNext[0].DisplayName.Should().BeNull();
    }

    [Fact]
    public void FacilityHeartbeatPayload_WithSelfHealingFields_SerializesCleanly()
    {
        var payload = new FacilityHeartbeatPayload
        {
            AppVersion = "2.5.0",
            ClockUtc = DateTime.UtcNow,
            IsJoinEnabled = true,
            JoinCode = "CODE1234",
            JoinCodeExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            FacilityAddress = "Quezon City",
            OperatingHours = "8am - 5pm",
            UpdatedAtUtc = DateTime.UtcNow
        };

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<FacilityHeartbeatPayload>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.IsJoinEnabled.Should().BeTrue();
        deserialized.JoinCode.Should().Be("CODE1234");
        deserialized.FacilityAddress.Should().Be("Quezon City");
    }

    [Fact]
    public void ExternalPrescriptionDispensedEvent_WithReceiptFields_SerializesCleanly()
    {
        var evt = new ExternalPrescriptionDispensedEvent
        {
            PrescriptionId = Guid.NewGuid(),
            PrescriptionNumber = "RX-001",
            ExternalPharmacyName = "Mercury Drug",
            VerificationToken = "clinic123.secret456",
            ReceiptFileName = "receipt.jpg",
            ReceiptContentType = "image/jpeg"
        };

        var json = JsonSerializer.Serialize(evt, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<ExternalPrescriptionDispensedEvent>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.VerificationToken.Should().Be("clinic123.secret456");
        deserialized.ReceiptFileName.Should().Be("receipt.jpg");
        deserialized.ReceiptContentType.Should().Be("image/jpeg");
    }
}
