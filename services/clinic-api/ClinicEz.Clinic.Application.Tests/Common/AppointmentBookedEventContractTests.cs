using System;
using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Common;

public class AppointmentBookedEventContractTests
{
    [Fact]
    public void Default_AppointmentType_is_null()
    {
        var evt = new AppointmentBookedEvent();
        evt.AppointmentType.Should().BeNull();
    }

    [Fact]
    public void Can_initialize_AppointmentType_as_Teleconsult_or_InPerson()
    {
        var teleconsult = new AppointmentBookedEvent { AppointmentType = "Teleconsult" };
        var inPerson = new AppointmentBookedEvent { AppointmentType = "InPerson" };

        teleconsult.AppointmentType.Should().Be("Teleconsult");
        inPerson.AppointmentType.Should().Be("InPerson");
    }

    [Fact]
    public void Serializing_with_InteropJson_omits_AppointmentType_when_null()
    {
        var evt = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            AppointmentType = null
        };

        var json = JsonSerializer.Serialize(evt, InteropJson.Options);
        json.Should().NotContain("appointmentType");
    }

    [Fact]
    public void Serializing_with_InteropJson_includes_camelCase_appointmentType_when_set()
    {
        var evt = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            AppointmentType = "Teleconsult"
        };

        var json = JsonSerializer.Serialize(evt, InteropJson.Options);
        json.Should().Contain("\"appointmentType\":\"Teleconsult\"");
    }

    [Fact]
    public void Deserializing_legacy_json_without_appointmentType_defaults_to_null()
    {
        var legacyJson = "{\"draftId\":\"" + Guid.NewGuid() + "\",\"patientId\":\"" + Guid.NewGuid() + "\",\"clinicId\":\"" + Guid.NewGuid() + "\"}";
        var deserialized = JsonSerializer.Deserialize<AppointmentBookedEvent>(legacyJson, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized!.AppointmentType.Should().BeNull();
    }

    [Fact]
    public void InteropEnvelope_roundtrip_preserves_AppointmentType()
    {
        var original = new AppointmentBookedEvent
        {
            DraftId = Guid.NewGuid(),
            PatientId = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            AppointmentType = "Teleconsult"
        };

        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientAppointmentBooked,
            Party.ForPatient(original.PatientId.ToString()),
            Party.ForFacility("tenant-1", original.ClinicId.ToString(), FacilityType.Clinic),
            original.DraftId,
            original);

        var payload = envelope.GetPayload<AppointmentBookedEvent>();
        payload.AppointmentType.Should().Be("Teleconsult");
    }
}
