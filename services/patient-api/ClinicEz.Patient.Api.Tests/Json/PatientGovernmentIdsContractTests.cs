using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ClinicEz.Patient.Api.Endpoints.Patients;
using ClinicEz.Patient.Api.Infrastructure;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientFullRecord;
using FluentAssertions;
using NSubstitute;

namespace ClinicEz.Patient.Api.Tests.Json;

public sealed class PatientGovernmentIdsContractTests : IAsyncLifetime
{
    private static readonly JsonSerializerOptions JsonOptions = ApiJson.Configure(new JsonSerializerOptions());
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync() => _host = await PatientApiTestHost.StartAsync();

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public void UpdatePatientGovernmentIdsRequest_DeserializesItemsPayloadWithPhilhealthAndSponsorFields()
    {
        const string json = """
        {
          "items": [
            {
              "idType": "PhilHealth",
              "idNumber": "12-345678901-2",
              "philhealthCategory": "DD",
              "sponsorPin": "12-111222333-4",
              "sponsorLastName": "Dela Cruz",
              "sponsorFirstName": "Juan",
              "sponsorMiddleName": "Santos",
              "sponsorSuffix": "Jr.",
              "sponsorDob": "1982-04-10",
              "sponsorRelationship": "S"
            },
            {
              "idType": "SSS",
              "idNumber": "34-1234567-8"
            }
          ]
        }
        """;

        var request = JsonSerializer.Deserialize<UpdatePatientGovernmentIdsRequest>(json, JsonOptions);

        request.Should().NotBeNull();
        request!.Items.Should().HaveCount(2);

        var phic = request.Items[0];
        phic.IdType.Should().Be("PhilHealth");
        phic.IdNumber.Should().Be("12-345678901-2");
        phic.PhilhealthCategory.Should().Be("DD");
        phic.SponsorPin.Should().Be("12-111222333-4");
        phic.SponsorLastName.Should().Be("Dela Cruz");
        phic.SponsorFirstName.Should().Be("Juan");
        phic.SponsorMiddleName.Should().Be("Santos");
        phic.SponsorSuffix.Should().Be("Jr.");
        phic.SponsorDob.Should().Be(new DateOnly(1982, 4, 10));
        phic.SponsorRelationship.Should().Be("S");

        request.Items[1].IdType.Should().Be("SSS");
        request.Items[1].IdNumber.Should().Be("34-1234567-8");
    }

    [Fact]
    public void PatientGovernmentIdDto_SerializesPhilhealthCategoryAndSponsorFieldsInCamelCase()
    {
        var dto = new PatientGovernmentIdDto(
            Id: Guid.NewGuid(),
            ClientId: Guid.NewGuid(),
            IdType: "PhilHealth",
            IdNumber: "12-345678901-2",
            IssuedAt: null,
            ExpiresAt: null,
            UpdatedAt: new DateTime(2026, 11, 20, 8, 0, 0, DateTimeKind.Utc),
            PhilhealthCategory: "DD",
            SponsorPin: "12-111222333-4",
            SponsorLastName: "Dela Cruz",
            SponsorFirstName: "Juan",
            SponsorMiddleName: "Santos",
            SponsorSuffix: "Jr.",
            SponsorDob: new DateOnly(1982, 4, 10),
            SponsorRelationship: "S");

        var json = JsonSerializer.Serialize(dto, JsonOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("idType").GetString().Should().Be("PhilHealth");
        root.GetProperty("idNumber").GetString().Should().Be("12-345678901-2");
        root.GetProperty("philhealthCategory").GetString().Should().Be("DD");
        root.GetProperty("sponsorPin").GetString().Should().Be("12-111222333-4");
        root.GetProperty("sponsorLastName").GetString().Should().Be("Dela Cruz");
        root.GetProperty("sponsorFirstName").GetString().Should().Be("Juan");
        root.GetProperty("sponsorMiddleName").GetString().Should().Be("Santos");
        root.GetProperty("sponsorSuffix").GetString().Should().Be("Jr.");
        root.GetProperty("sponsorDob").GetString().Should().Be("1982-04-10");
        root.GetProperty("sponsorRelationship").GetString().Should().Be("S");
    }

    [Fact]
    public async Task GetFullRecordEndpoint_PreservesPhilhealthCategoryAndSponsorFieldsInHttpJsonResponse()
    {
        var patientId = Guid.NewGuid();
        var phicId = Guid.NewGuid();
        var clientId = Guid.NewGuid();

        _host.Patients.IsOwnedByAsync(patientId, "clerk_owner", Arg.Any<CancellationToken>())
            .Returns(true);

        _host.Sender.Send(Arg.Is<GetPatientFullRecordQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(new PatientFullRecordDto(
                Demographics: new PatientSummaryDto(
                    patientId, "Marianne", null, "Dela Cruz", null,
                    "Female", new DateOnly(1990, 1, 1), null,
                    null, null, null, null, null, null, null,
                    null, null, null, null, null, true, "CE-152"),
                GovernmentIds:
                [
                    new PatientGovernmentIdDto(
                        phicId, clientId, "PhilHealth", "12-345678901-2",
                        null, null, DateTime.UtcNow,
                        PhilhealthCategory: "MM",
                        SponsorPin: null,
                        SponsorLastName: null,
                        SponsorFirstName: null,
                        SponsorMiddleName: null,
                        SponsorSuffix: null,
                        SponsorDob: null,
                        SponsorRelationship: null),
                ],
                Addresses: [],
                EmergencyContacts: [],
                HealthcareProviders: [],
                Allergies: [],
                Medications: [],
                SurgicalHistories: [],
                PastIllnesses: [],
                ChronicConditions: [],
                FamilyHistories: [],
                ImmunizationsSelf: [],
                Disabilities: [],
                TravelHistories: [],
                ContraceptiveHistories: [],
                Pregnancies: [],
                SocialHistory: null,
                Occupation: null,
                ObstetricProfile: null,
                MaleReproductive: null,
                DentalVision: null,
                MentalHealthProfile: null,
                NcdQuestionnaire: null));

        using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/patients/{patientId}/full-record");
        req.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");

        var resp = await _host.Client.SendAsync(req);

        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await resp.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var gov = doc.RootElement.GetProperty("data").GetProperty("governmentIds")[0];
        gov.GetProperty("idNumber").GetString().Should().Be("12-345678901-2");
        gov.GetProperty("philhealthCategory").GetString().Should().Be("MM");
    }
}
