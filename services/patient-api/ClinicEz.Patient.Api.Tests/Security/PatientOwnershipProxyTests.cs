using System;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using NSubstitute;
using Xunit;
using ClinicEz.Patient.Api.Tests.Infrastructure;

namespace ClinicEz.Patient.Api.Tests.Security;

/// <summary>
/// Verifies that PatientOwnershipMiddleware delegates to IPatientRepository.IsOwnedByAsync,
/// which authorizes authenticated parents over their managed dependent children.
/// </summary>
public sealed class PatientOwnershipProxyTests : IAsyncLifetime
{
    private const string ParentUser = "user_parent_clerk";
    private const string IntruderUser = "user_intruder_clerk";

    private readonly Guid _dependentId = Guid.NewGuid();
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();

        // Repository simulates proxy ownership: parent owns dependent, intruder does not
        _host.Patients
            .IsOwnedByAsync(_dependentId, ParentUser, Arg.Any<CancellationToken>())
            .Returns(true);

        _host.Patients
            .IsOwnedByAsync(_dependentId, IntruderUser, Arg.Any<CancellationToken>())
            .Returns(false);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private Task<HttpResponseMessage> GetAsync(string path, string? user)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (user is not null)
            request.Headers.Add(PatientApiTestHost.UserHeader, user);
        return _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task DependentFullRecord_WhenAccessedByParentProxy_IsAllowed()
    {
        var response = await GetAsync($"/api/v1/patients/{_dependentId}/full-record", ParentUser);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DependentFullRecord_WhenAccessedByIntruder_IsForbidden()
    {
        var response = await GetAsync($"/api/v1/patients/{_dependentId}/full-record", IntruderUser);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task DependentAddresses_WhenAccessedByParentProxy_IsAllowed()
    {
        var response = await GetAsync($"/api/v1/patients/{_dependentId}/addresses", ParentUser);

        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task DependentAddresses_WhenAccessedByIntruder_IsForbidden()
    {
        var response = await GetAsync($"/api/v1/patients/{_dependentId}/addresses", IntruderUser);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
