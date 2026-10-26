using System;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Interop;

public class PortalProjectionAdversarialTests
{
    [Fact]
    public void FacilityJoinSettingsUpdatedPayload_EmptyJson_DefaultsAppropriately()
    {
        // When all fields are missing from JSON
        var emptyJson = "{}";
        var payload = JsonSerializer.Deserialize<FacilityJoinSettingsUpdatedPayload>(emptyJson, InteropJson.Options);

        payload.Should().NotBeNull();
        payload!.TenantId.Should().BeEmpty();
        payload.FacilityId.Should().Be(Guid.Empty);
        payload.IsJoinEnabled.Should().BeTrue("IsJoinEnabled must default to true when missing");
        payload.JoinCode.Should().BeNull();
        payload.JoinCodeExpiresAtUtc.Should().BeNull();
        payload.FacilityAddress.Should().BeNull();
        payload.OperatingHours.Should().BeNull();
        payload.UpdatedAtUtc.Should().NotBe(default, "UpdatedAtUtc should initialize with a non-default timestamp");
    }

    [Fact]
    public void FacilityJoinSettingsUpdatedPayload_ExplicitNullsAndUnknownFields_DeserializesCleanly()
    {
        var jsonWithNullsAndExtra = """
        {
            "tenantId": "tenant-abc",
            "facilityId": "3c8cca56-0e4f-4494-aef0-18f89c736346",
            "isJoinEnabled": false,
            "joinCode": null,
            "joinCodeExpiresAtUtc": null,
            "facilityAddress": null,
            "operatingHours": null,
            "unknownAdversarialField": "should_be_ignored",
            "nestedUnknown": { "evil": true }
        }
        """;

        var payload = JsonSerializer.Deserialize<FacilityJoinSettingsUpdatedPayload>(jsonWithNullsAndExtra, InteropJson.Options);

        payload.Should().NotBeNull();
        payload!.TenantId.Should().Be("tenant-abc");
        payload.FacilityId.Should().Be(Guid.Parse("3c8cca56-0e4f-4494-aef0-18f89c736346"));
        payload.IsJoinEnabled.Should().BeFalse();
        payload.JoinCode.Should().BeNull();
        payload.JoinCodeExpiresAtUtc.Should().BeNull();
        payload.FacilityAddress.Should().BeNull();
        payload.OperatingHours.Should().BeNull();
    }

    [Fact]
    public void DocumentAttestationPublishedPayload_MinimalJson_PreservesDefaultsAndNulls()
    {
        var minimalJson = """
        {
            "sourceDocumentId": "11111111-1111-1111-1111-111111111111",
            "tenantId": "t-1",
            "facilityId": "22222222-2222-2222-2222-222222222222",
            "documentKind": "medical-certificate",
            "documentNumber": "MC-20261025-0001",
            "securityDigest": "SEC-SHA256-123456789ABC"
        }
        """;

        var payload = JsonSerializer.Deserialize<DocumentAttestationPublishedPayload>(minimalJson, InteropJson.Options);

        payload.Should().NotBeNull();
        payload!.SourceDocumentId.Should().Be(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        payload.DocumentKind.Should().Be("medical-certificate");
        payload.DocumentNumber.Should().Be("MC-20261025-0001");
        payload.SecurityDigest.Should().Be("SEC-SHA256-123456789ABC");

        // Omitted optional fields must default cleanly
        payload.VerificationTokenHash.Should().BeNull();
        payload.ClinicAddress.Should().BeNull();
        payload.ClinicContact.Should().BeNull();
        payload.DoctorName.Should().BeNull();
        payload.DoctorPrcLicense.Should().BeNull();
        payload.DoctorPtr.Should().BeNull();
        payload.DoctorS2License.Should().BeNull();
        payload.ExpiresAtUtc.Should().BeNull();
        payload.DispenseStatus.Should().BeNull();
        payload.DispensedPharmacyName.Should().BeNull();
        payload.DispensedAtUtc.Should().BeNull();

        // Enforced defaults
        payload.Status.Should().Be("VALID");
        payload.IsAlreadyDispensed.Should().BeFalse();
        payload.HasDangerousDrug.Should().BeFalse();
        payload.ItemCount.Should().Be(0);
    }

    [Fact]
    public void DocumentAttestationPublishedPayload_StrictZeroPhiReflectionAudit()
    {
        // Assert that DocumentAttestationPublishedPayload contains ZERO clinical PHI property definitions
        var forbiddenSubstrings = new[]
        {
            "Patient", "Diagnosis", "Complaint", "Symptom", "Allergy", "Medication",
            "Note", "History", "Vitals", "PhysicalExam", "RxDetail", "PrescriptionItem"
        };

        var properties = typeof(DocumentAttestationPublishedPayload).GetProperties(BindingFlags.Public | BindingFlags.Instance);

        foreach (var prop in properties)
        {
            foreach (var forbidden in forbiddenSubstrings)
            {
                prop.Name.Should().NotContainEquivalentOf(
                    forbidden,
                    $"DocumentAttestationPublishedPayload must strictly maintain zero PHI, but property '{prop.Name}' matches forbidden substring '{forbidden}'");
            }
        }
    }

    [Fact]
    public void QueueBoardUpcomingItemDto_DisplayName_EnforcesZeroPhiContract()
    {
        // 1. Default constructor sets DisplayName to null
        var dto = new QueueBoardUpcomingItemDto
        {
            QueueItemId = Guid.NewGuid(),
            TicketNumber = "T-01"
        };
        dto.DisplayName.Should().BeNull("default upcoming queue item must have null DisplayName");

        // 2. Serialized to JSON without setting DisplayName:
        // Because InteropJson.Options uses JsonIgnoreCondition.WhenWritingNull,
        // null DisplayName is omitted from the JSON payload completely!
        var json = JsonSerializer.Serialize(dto, InteropJson.Options);
        json.Should().NotContain("displayName", "null DisplayName is omitted from wire JSON due to WhenWritingNull");

        // 3. Deserialized from JSON where displayName is missing
        var missingDisplayNameJson = """{"queueItemId":"11111111-1111-1111-1111-111111111111","ticketNumber":"T-02"}""";
        var deserializedMissing = JsonSerializer.Deserialize<QueueBoardUpcomingItemDto>(missingDisplayNameJson, InteropJson.Options);
        deserializedMissing!.DisplayName.Should().BeNull();

        // 4. Deserialized from JSON where displayName is explicitly null
        var explicitNullJson = """{"queueItemId":"11111111-1111-1111-1111-111111111111","ticketNumber":"T-02","displayName":null}""";
        var deserializedExplicit = JsonSerializer.Deserialize<QueueBoardUpcomingItemDto>(explicitNullJson, InteropJson.Options);
        deserializedExplicit!.DisplayName.Should().BeNull();
    }

    [Fact]
    public void QueueBoardUpdatedPayload_DateOnly_AndCollectionsHandling()
    {
        // 1. Missing collections in JSON should default to empty lists, NOT null
        var jsonMissingCollections = """
        {
            "tenantId": "tenant-xyz",
            "facilityId": "3c8cca56-0e4f-4494-aef0-18f89c736346",
            "queueDate": "2026-10-25",
            "patientsWaitingCount": 5
        }
        """;

        var payload = JsonSerializer.Deserialize<QueueBoardUpdatedPayload>(jsonMissingCollections, InteropJson.Options);
        payload.Should().NotBeNull();
        payload!.QueueDate.Should().Be(new DateOnly(2026, 10, 25));
        payload.IsAcceptingWalkIns.Should().BeTrue("IsAcceptingWalkIns must default to true");
        payload.NowServing.Should().NotBeNull("NowServing must not be null when omitted in JSON");
        payload.NowServing.Should().BeEmpty();
        payload.UpNext.Should().NotBeNull("UpNext must not be null when omitted in JSON");
        payload.UpNext.Should().BeEmpty();

        // 2. DateOnly roundtrips leap years correctly
        var leapPayload = new QueueBoardUpdatedPayload
        {
            TenantId = "tenant-xyz",
            FacilityId = Guid.NewGuid(),
            QueueDate = new DateOnly(2028, 2, 29)
        };
        var leapJson = JsonSerializer.Serialize(leapPayload, InteropJson.Options);
        leapJson.Should().Contain("2028-02-29");

        var deserializedLeap = JsonSerializer.Deserialize<QueueBoardUpdatedPayload>(leapJson, InteropJson.Options);
        deserializedLeap!.QueueDate.Should().Be(new DateOnly(2028, 2, 29));
    }

    [Fact]
    public void FacilityHeartbeatPayload_SelfHealingFields_NullVsMissing()
    {
        // Missing self-healing fields
        var minimalJson = """
        {
            "appVersion": "1.0.0",
            "clockUtc": "2026-10-25T05:00:00Z"
        }
        """;

        var payload = JsonSerializer.Deserialize<FacilityHeartbeatPayload>(minimalJson, InteropJson.Options);
        payload.Should().NotBeNull();
        payload!.IsJoinEnabled.Should().BeNull();
        payload.JoinCode.Should().BeNull();
        payload.JoinCodeExpiresAtUtc.Should().BeNull();
        payload.FacilityAddress.Should().BeNull();
        payload.OperatingHours.Should().BeNull();
        payload.UpdatedAtUtc.Should().BeNull();

        // Populated self-healing fields
        var fullPayload = new FacilityHeartbeatPayload
        {
            AppVersion = "2.0.0",
            ClockUtc = DateTime.UtcNow,
            IsJoinEnabled = false,
            JoinCode = "CODE-1234",
            JoinCodeExpiresAtUtc = DateTime.UtcNow.AddDays(14),
            FacilityAddress = "Manila, PH",
            OperatingHours = "8am - 4pm",
            UpdatedAtUtc = DateTime.UtcNow
        };

        var fullJson = JsonSerializer.Serialize(fullPayload, InteropJson.Options);
        var deserializedFull = JsonSerializer.Deserialize<FacilityHeartbeatPayload>(fullJson, InteropJson.Options);
        deserializedFull!.IsJoinEnabled.Should().BeFalse();
        deserializedFull.JoinCode.Should().Be("CODE-1234");
        deserializedFull.FacilityAddress.Should().Be("Manila, PH");
    }

    [Fact]
    public void ExternalPrescriptionDispensedEvent_ReceiptAndToken_NullVsMissing()
    {
        // Missing receipt/token fields (backward compatibility with Phase 3 tests)
        var legacyJson = """
        {
            "prescriptionId": "3c8cca56-0e4f-4494-aef0-18f89c736346",
            "prescriptionNumber": "RX-2026-0001",
            "externalPharmacyName": "Rose Pharmacy"
        }
        """;

        var evt = JsonSerializer.Deserialize<ExternalPrescriptionDispensedEvent>(legacyJson, InteropJson.Options);
        evt.Should().NotBeNull();
        evt!.VerificationToken.Should().BeNull();
        evt.ReceiptFileName.Should().BeNull();
        evt.ReceiptContentType.Should().BeNull();

        // Explicit nulls
        var nullJson = """
        {
            "prescriptionId": "3c8cca56-0e4f-4494-aef0-18f89c736346",
            "prescriptionNumber": "RX-2026-0001",
            "externalPharmacyName": "Rose Pharmacy",
            "verificationToken": null,
            "receiptFileName": null,
            "receiptContentType": null
        }
        """;
        var evtNull = JsonSerializer.Deserialize<ExternalPrescriptionDispensedEvent>(nullJson, InteropJson.Options);
        evtNull!.VerificationToken.Should().BeNull();
        evtNull.ReceiptFileName.Should().BeNull();
        evtNull.ReceiptContentType.Should().BeNull();
    }
}
