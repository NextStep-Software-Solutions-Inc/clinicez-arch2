using System;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class YakapCredentialsTests
{
    private const string Tenant = "tenant-yakap";
    private readonly Guid _clinicId = Guid.NewGuid();

    private (PhilHealthProxyClient Client, StubInteropRequestClient Hub) CreateClient(Func<PhilHealthRequestPayload, PhilHealthResponsePayload> reply)
    {
        var hub = new StubInteropRequestClient(call => reply((PhilHealthRequestPayload)call.Payload));
        var client = new PhilHealthProxyClient(hub, Phase3TestKit.Identity(_clinicId, Tenant), NullLogger<PhilHealthProxyClient>.Instance);
        return (client, hub);
    }

    private static PhilHealthResponsePayload Ok<T>(T data) =>
        new() { StatusCode = 200, Body = JsonSerializer.Serialize(ApiResponse<T>.Success(data)) };

    private static PhilHealthConfigStatusResponse Status(Guid tenantId) => new(
        TenantId: tenantId,
        FacilityName: "St. Jude Clinic",
        AccreditationNumber: "PHIC-99999",
        PmccNumber: "PMCC-12345",
        SoftwareCertificateId: "CERT-ABCDE",
        KonsultaEndpoint: "/soap/konsulta",
        IsConfigured: true,
        IsActive: true,
        UpdatedAt: DateTimeOffset.UtcNow);

    [Fact]
    public async Task ConfigureTenantCredentialsAsync_SendsTheCredentialsToThePhilHealthService_FromThisClinic()
    {
        var tenantId = Guid.NewGuid();
        var (client, hub) = CreateClient(_ => Ok(Status(tenantId)));
        var request = new ConfigurePhilHealthCredentialsProxyRequest(
            TenantId: tenantId,
            FacilityName: "St. Jude Clinic",
            AccreditationNumber: "PHIC-99999",
            PmccNumber: "PMCC-12345",
            SoftwareCertificateId: "CERT-ABCDE",
            Username: "phic_user",
            Password: "secret_password",
            CipherKey: "secret_cipher_key",
            KonsultaEndpoint: "/soap/konsulta");

        var response = await client.ConfigureTenantCredentialsAsync(request);

        response.Succeeded.Should().BeTrue();
        response.Data!.IsConfigured.Should().BeTrue();
        response.Data.AccreditationNumber.Should().Be("PHIC-99999");
        var call = hub.Calls.Should().ContainSingle().Subject;
        call.RequestType.Should().Be(InteropTypes.PhilHealthRequest);
        call.ReplyType.Should().Be(InteropTypes.PhilHealthResponse);
        call.From.Should().Be(Party.ForFacility(Tenant, _clinicId.ToString(), FacilityType.Clinic));
        call.To.Should().Be(Party.PhilHealth);
        var payload = (PhilHealthRequestPayload)call.Payload;
        payload.Operation.Should().Be(PhilHealthOperations.TenantConfigure);
        payload.Argument.Should().BeNull();
        payload.Body.Should().Contain("phic_user").And.Contain("PHIC-99999");
    }

    [Fact]
    public async Task GetTenantConfigurationStatusAsync_ReturnsStatusFromTheService()
    {
        var (client, hub) = CreateClient(_ => Ok(Status(Guid.NewGuid())));

        var response = await client.GetTenantConfigurationStatusAsync();

        response.Succeeded.Should().BeTrue();
        response.Data!.IsConfigured.Should().BeTrue();
        response.Data.FacilityName.Should().Be("St. Jude Clinic");
        var payload = (PhilHealthRequestPayload)hub.Calls.Single().Payload;
        payload.Operation.Should().Be(PhilHealthOperations.TenantStatus);
        payload.Body.Should().BeNull("the service reads the tenant from the signed sender, not from the request");
    }

    [Fact]
    public async Task TestTenantConnectionAsync_WhenGatewayAccepts_ReturnsSuccessMessage()
    {
        var (client, hub) = CreateClient(_ => Ok("Authentication successful! PhilHealth gateway accepted facility credentials."));

        var response = await client.TestTenantConnectionAsync();

        response.Succeeded.Should().BeTrue();
        response.Data.Should().Contain("Authentication successful");
        ((PhilHealthRequestPayload)hub.Calls.Single().Payload).Operation.Should().Be(PhilHealthOperations.TenantTestConnection);
    }

    [Fact]
    public async Task TestTenantConnectionAsync_WhenGatewayRejects_ReturnsFailure()
    {
        var (client, _) = CreateClient(_ => new PhilHealthResponsePayload
        {
            StatusCode = 400,
            Body = JsonSerializer.Serialize(ApiResponse<string>.Fail("Invalid facility accreditation code or expired certificate."))
        });

        var response = await client.TestTenantConnectionAsync();

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("Invalid facility accreditation code");
    }

    [Fact]
    public async Task AnEmptyReply_IsAFailureThatNamesTheHttpStatus()
    {
        var (client, _) = CreateClient(_ => new PhilHealthResponsePayload { StatusCode = 502, Body = null });

        var response = await client.GetTenantConfigurationStatusAsync();

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("502");
    }

    [Fact]
    public async Task AnUnreadableReply_IsAFailureNotAnException()
    {
        var (client, _) = CreateClient(_ => new PhilHealthResponsePayload { StatusCode = 500, Body = "<html>Server Error</html>" });

        var response = await client.GetTenantConfigurationStatusAsync();

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("could not be read");
    }

    [Fact]
    public async Task ASilentService_IsAClearTimeoutFailure()
    {
        var (client, hub) = CreateClient(_ => Ok(Status(Guid.NewGuid())));
        hub.Failure = new InteropRequestTimeoutException(InteropTypes.PhilHealthRequest, Guid.NewGuid(), TimeSpan.FromSeconds(60));

        var response = await client.TestTenantConnectionAsync();

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("did not answer in time");
    }

    [Fact]
    public async Task AnUnprovisionedClinic_CannotReachPhilHealthAndSendsNothing()
    {
        var hub = new StubInteropRequestClient(_ => Ok(Status(Guid.NewGuid())));
        var client = new PhilHealthProxyClient(
            hub, NSubstitute.Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IClinicIdentityProvider>(), NullLogger<PhilHealthProxyClient>.Instance);

        var response = await client.GetTenantConfigurationStatusAsync();

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("not been provisioned");
        hub.Calls.Should().BeEmpty();
    }
}
