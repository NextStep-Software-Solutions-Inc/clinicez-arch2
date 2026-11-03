using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Discovery.Queries.UnifiedSearch;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class UnifiedSearchEndpointTests : IAsyncLifetime
{
    private const string User = "test_user";
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task UnifiedSearch_Returns200WithStructuredResults()
    {
        var expected = new UnifiedSearchResultDto(
            new List<UnifiedDoctorDto>
            {
                new(Guid.NewGuid(), "Dr. Evelyn Reed, MD", "Cardiology Specialist", "Metro Cardiology Center", "1.2 km away", 4.9m, 128, "Tomorrow, 10:30 AM", new[] { "Accepts Insurance" })
            },
            new List<UnifiedClinicDto>
            {
                new(Guid.NewGuid(), "Metro Cardiology Center", "402 Medical Blvd", "1.2 km away", true, "Open Today", 4.8m, 94, new[] { "Walk-ins Welcome" })
            },
            new List<UnifiedServiceDto>
            {
                new(Guid.NewGuid(), "Comprehensive Cardiac Screening", "Description", 45, true, new[] { "Fully Covered" })
            }
        );

        _host.Sender.Send(Arg.Is<UnifiedSearchQuery>(q => q.Query == "cardio"), Arg.Any<CancellationToken>())
            .Returns(expected);

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/v1/discovery/search?q=cardio");
        req.Headers.Add(PatientApiTestHost.UserHeader, User);

        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await res.Content.ReadFromJsonAsync<ApiResponse<UnifiedSearchResultDto>>();
        payload.Should().NotBeNull();
        payload!.Succeeded.Should().BeTrue();
        payload.Data.Should().NotBeNull();
        payload.Data!.Doctors.Should().HaveCount(1);
        payload.Data.Doctors[0].FullName.Should().Be("Dr. Evelyn Reed, MD");
        payload.Data.Clinics.Should().HaveCount(1);
        payload.Data.Services.Should().HaveCount(1);
    }
}
