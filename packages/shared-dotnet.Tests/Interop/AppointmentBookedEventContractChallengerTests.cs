using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Interop;

/// <summary>
/// Adversarial contract and compatibility challenges for <see cref="AppointmentBookedEvent"/>.
/// Verifies backward and forward compatibility, serialization variations, edge-case values,
/// and InteropEnvelope transport resilience.
/// </summary>
public class AppointmentBookedEventContractChallengerTests
{
    // Mock representation of a legacy consumer compiled before AppointmentType was added.
    private sealed record LegacyAppointmentBookedEventPayload
    {
        public Guid Id { get; init; }
        public Guid DraftId { get; init; }
        public Guid PatientId { get; init; }
        public Guid ClinicId { get; init; }
        public string? TenantId { get; init; }
        public DateOnly? PreferredDate { get; init; }
        public string? PreferredTime { get; init; }
        public string? Reason { get; init; }
        public string? Notes { get; init; }
        public DateTime CreatedAt { get; init; }
        // Note: No AppointmentType property declared.
    }

    [Fact]
    public void BackwardCompatibility_LegacyProducer_WithoutAppointmentType_DeserializesToNull()
    {
        var id = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var preferredDate = "2026-11-20";
        var preferredTime = "14:30";

        var legacyJson = $$"""
        {
          "id": "{{id}}",
          "draftId": "{{draftId}}",
          "patientId": "{{patientId}}",
          "clinicId": "{{clinicId}}",
          "tenantId": "tenant-alpha",
          "preferredDate": "{{preferredDate}}",
          "preferredTime": "{{preferredTime}}",
          "reason": "Routine Checkup",
          "shareFieldsJson": "[\"allergies\"]",
          "createdAt": "2026-11-12T10:00:00Z"
        }
        """;

        // Under InteropJson.Options
        var eventUnderInterop = JsonSerializer.Deserialize<AppointmentBookedEvent>(legacyJson, InteropJson.Options);
        eventUnderInterop.Should().NotBeNull();
        eventUnderInterop!.AppointmentType.Should().BeNull();
        eventUnderInterop.Id.Should().Be(id);
        eventUnderInterop.DraftId.Should().Be(draftId);
        eventUnderInterop.PatientId.Should().Be(patientId);
        eventUnderInterop.ClinicId.Should().Be(clinicId);
        eventUnderInterop.PreferredDate.Should().Be(DateOnly.Parse(preferredDate));
        eventUnderInterop.PreferredTime.Should().Be(preferredTime);
        eventUnderInterop.Reason.Should().Be("Routine Checkup");

        // Under default JsonSerializerOptions
        var eventUnderDefault = JsonSerializer.Deserialize<AppointmentBookedEvent>(legacyJson, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        eventUnderDefault.Should().NotBeNull();
        eventUnderDefault!.AppointmentType.Should().BeNull();
        eventUnderDefault.Id.Should().Be(id);
    }

    [Fact]
    public void BackwardCompatibility_LegacyProducer_ExplicitNullAppointmentType_DeserializesToNull()
    {
        var jsonWithNull = """
        {
          "draftId": "11111111-1111-1111-1111-111111111111",
          "appointmentType": null
        }
        """;

        var result = JsonSerializer.Deserialize<AppointmentBookedEvent>(jsonWithNull, InteropJson.Options);
        result.Should().NotBeNull();
        result!.AppointmentType.Should().BeNull();
    }

    [Fact]
    public void ForwardCompatibility_OlderConsumer_WithoutAppointmentType_IgnoresNewProperty()
    {
        var modernEvent = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            TenantId = "tenant-beta",
            AppointmentType = "Teleconsult",
            Reason = "Remote Consultation",
            PreferredTime = "10:00"
        };

        var modernJson = JsonSerializer.Serialize(modernEvent, InteropJson.Options);
        modernJson.Should().Contain("\"appointmentType\":\"Teleconsult\"");

        // Older consumer deserializing modern payload that contains unexpected "appointmentType"
        var olderConsumerResult = JsonSerializer.Deserialize<LegacyAppointmentBookedEventPayload>(modernJson, InteropJson.Options);
        olderConsumerResult.Should().NotBeNull();
        olderConsumerResult!.DraftId.Should().Be(modernEvent.DraftId);
        olderConsumerResult.PatientId.Should().Be(modernEvent.PatientId);
        olderConsumerResult.ClinicId.Should().Be(modernEvent.ClinicId);
        olderConsumerResult.TenantId.Should().Be("tenant-beta");
        olderConsumerResult.Reason.Should().Be("Remote Consultation");
        olderConsumerResult.PreferredTime.Should().Be("10:00");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n")]
    [InlineData("teleconsult")]
    [InlineData("TELECONSULT")]
    [InlineData("tElEcOnSuLt")]
    [InlineData("inperson")]
    [InlineData("INPERSON")]
    [InlineData("In_Person")]
    [InlineData("UnknownArbitraryType")]
    [InlineData("Teleconsult 🩺 👨‍⚕️")]
    public void AdversarialValues_StringValuesPreservedFaithfully(string testValue)
    {
        var evt = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            AppointmentType = testValue
        };

        var json = JsonSerializer.Serialize(evt, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<AppointmentBookedEvent>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.AppointmentType.Should().Be(testValue);
    }

    [Fact]
    public void AdversarialValues_VeryLongString_DoesNotCorruptPayload()
    {
        var largeString = new string('A', 50_000);
        var evt = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            AppointmentType = largeString
        };

        var json = JsonSerializer.Serialize(evt, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<AppointmentBookedEvent>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.AppointmentType.Should().Be(largeString);
        deserialized.AppointmentType!.Length.Should().Be(50_000);
    }

    [Fact]
    public void AdversarialValues_InjectionPayloads_SurviveJsonEscapingWithoutCorruption()
    {
        var xss = "<script>alert('xss');</script>";
        var sqli = "Teleconsult'; DROP TABLE Appointments; --";
        var unicodeControl = "Teleconsult\u0000\u001f\b\f";

        var evt = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            AppointmentType = xss + "|" + sqli + "|" + unicodeControl
        };

        var json = JsonSerializer.Serialize(evt, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<AppointmentBookedEvent>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.AppointmentType.Should().Be(evt.AppointmentType);
    }

    [Theory]
    [InlineData("{\"appointmentType\": 12345}")]
    [InlineData("{\"appointmentType\": true}")]
    [InlineData("{\"appointmentType\": [\"Teleconsult\"]}")]
    [InlineData("{\"appointmentType\": {\"nested\": \"value\"}}")]
    public void AdversarialTypes_NonStringTokens_ThrowJsonException(string malformedJson)
    {
        // System.Text.Json enforces strong typing on string? properties.
        // It must reject invalid token types instead of silently converting or corrupting.
        Action act = () => JsonSerializer.Deserialize<AppointmentBookedEvent>(malformedJson, InteropJson.Options);
        act.Should().Throw<JsonException>();
    }

    [Fact]
    public void SerializationOptions_Comparison_InteropJson_Vs_DefaultSerializerOptions()
    {
        var evt = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            AppointmentType = "Teleconsult"
        };

        // 1. InteropJson uses camelCase: "appointmentType"
        var interopJson = JsonSerializer.Serialize(evt, InteropJson.Options);
        interopJson.Should().Contain("\"appointmentType\":\"Teleconsult\"");
        interopJson.Should().NotContain("\"AppointmentType\"");

        // 2. Default JsonSerializerOptions uses PascalCase: "AppointmentType"
        var defaultJson = JsonSerializer.Serialize(evt, new JsonSerializerOptions());
        defaultJson.Should().Contain("\"AppointmentType\":\"Teleconsult\"");

        // 3. When AppointmentType is null:
        var nullEvent = new AppointmentBookedEvent { DraftId = Guid.NewGuid(), AppointmentType = null };
        var interopJsonNull = JsonSerializer.Serialize(nullEvent, InteropJson.Options);
        interopJsonNull.Should().NotContain("appointmentType"); // omitted due to WhenWritingNull

        var defaultJsonNull = JsonSerializer.Serialize(nullEvent, new JsonSerializerOptions());
        defaultJsonNull.Should().Contain("\"AppointmentType\":null"); // included by default

        // 4. InteropJson is case-insensitive, so it can read default PascalCase JSON:
        var readByInterop = JsonSerializer.Deserialize<AppointmentBookedEvent>(defaultJson, InteropJson.Options);
        readByInterop.Should().NotBeNull();
        readByInterop!.AppointmentType.Should().Be("Teleconsult");

        // 5. Default JsonSerializerOptions is case-sensitive by default, so it ignores camelCase:
        var readByDefaultCaseSensitive = JsonSerializer.Deserialize<AppointmentBookedEvent>(interopJson, new JsonSerializerOptions());
        readByDefaultCaseSensitive.Should().NotBeNull();
        readByDefaultCaseSensitive!.AppointmentType.Should().BeNull(
            because: "default JsonSerializerOptions is case-sensitive and does not match 'appointmentType' to 'AppointmentType'");
    }

    [Fact]
    public void InteropEnvelope_FullRoundtrip_PreservesAllFieldsAndAppointmentType()
    {
        var original = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            TenantId = "tenant-roundtrip",
            AppointmentType = "Teleconsult",
            Reason = "Follow-up Consultation",
            PreferredDate = new DateOnly(2026, 11, 25),
            PreferredTime = "15:00",
            AttachedFiles = new List<BookedAttachmentItem>
            {
                new()
                {
                    FileId = Guid.NewGuid(),
                    FileName = "lab_results.pdf",
                    DocumentTypeCode = "LAB",
                    MimeType = "application/pdf",
                    SizeBytes = 2048
                }
            }
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentBooked,
            Party.ForPatient(original.PatientId.ToString()),
            Party.ForFacility("tenant-roundtrip", original.ClinicId.ToString(), FacilityType.Clinic),
            original.DraftId,
            original,
            schemaVersion: 1,
            ttl: TimeSpan.FromDays(7));

        // Serialize envelope to string wire representation
        var envelopeJson = envelope.ToJson();
        envelopeJson.Should().Contain("\"type\":\"patient.appointment.booked\"");
        envelopeJson.Should().Contain("\"appointmentType\":\"Teleconsult\"");

        // Reconstitute envelope from wire string
        var reconstitutedEnvelope = InteropEnvelope.FromJson(envelopeJson);
        reconstitutedEnvelope.Type.Should().Be(InteropTypes.PatientAppointmentBooked);
        reconstitutedEnvelope.CorrelationId.Should().Be(original.DraftId);
        reconstitutedEnvelope.SchemaVersion.Should().Be(1);

        // Extract payload
        var reconstitutedEvent = reconstitutedEnvelope.GetPayload<AppointmentBookedEvent>();
        reconstitutedEvent.Should().NotBeNull();
        reconstitutedEvent.DraftId.Should().Be(original.DraftId);
        reconstitutedEvent.PatientId.Should().Be(original.PatientId);
        reconstitutedEvent.ClinicId.Should().Be(original.ClinicId);
        reconstitutedEvent.TenantId.Should().Be(original.TenantId);
        reconstitutedEvent.AppointmentType.Should().Be("Teleconsult");
        reconstitutedEvent.Reason.Should().Be("Follow-up Consultation");
        reconstitutedEvent.PreferredDate.Should().Be(new DateOnly(2026, 11, 25));
        reconstitutedEvent.PreferredTime.Should().Be("15:00");
        reconstitutedEvent.AttachedFiles.Should().HaveCount(1);
        reconstitutedEvent.AttachedFiles[0].FileName.Should().Be("lab_results.pdf");
    }

    [Fact]
    public void InteropEnvelope_ForwardCompatibility_IgnoresExtraEnvelopeAndPayloadFields()
    {
        var rawEnvelopeWithExtraFields = $$"""
        {
          "messageId": "{{Guid.NewGuid()}}",
          "correlationId": "{{Guid.NewGuid()}}",
          "type": "patient.appointment.booked",
          "schemaVersion": 2,
          "from": { "kind": "Patient", "patientId": "p1" },
          "to": { "kind": "Facility", "tenantId": "t1", "facilityId": "c1", "facilityType": "Clinic" },
          "sentAtUtc": "2026-11-13T00:00:00Z",
          "futureEnvelopeHeader": "v2-experimental-header",
          "payload": {
            "draftId": "{{Guid.NewGuid()}}",
            "patientId": "{{Guid.NewGuid()}}",
            "clinicId": "{{Guid.NewGuid()}}",
            "appointmentType": "Teleconsult",
            "unknownFuturePayloadProperty": "ignored-value",
            "futureNestedObject": { "level": 1 }
          }
        }
        """;

        var envelope = InteropEnvelope.FromJson(rawEnvelopeWithExtraFields);
        envelope.Should().NotBeNull();
        envelope.SchemaVersion.Should().Be(2);

        var payload = envelope.GetPayload<AppointmentBookedEvent>();
        payload.Should().NotBeNull();
        payload.AppointmentType.Should().Be("Teleconsult");
    }

    [Fact]
    public void InteropEnvelope_EmptyOrNullPayload_ThrowsInvalidOperationException()
    {
        var emptyPayloadEnvelopeJson = $$"""
        {
          "messageId": "{{Guid.NewGuid()}}",
          "correlationId": "{{Guid.NewGuid()}}",
          "type": "patient.appointment.booked",
          "schemaVersion": 1,
          "from": { "kind": "Patient", "patientId": "p1" },
          "to": { "kind": "Facility", "tenantId": "t1", "facilityId": "c1", "facilityType": "Clinic" },
          "sentAtUtc": "2026-11-13T00:00:00Z",
          "payload": null
        }
        """;

        var envelope = InteropEnvelope.FromJson(emptyPayloadEnvelopeJson);
        Action act = () => envelope.GetPayload<AppointmentBookedEvent>();
        act.Should().Throw<InvalidOperationException>()
           .WithMessage("*has an empty payload*");
    }
}
