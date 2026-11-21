using System;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class YakapCredentialsTests
{
    private const string Tenant = "tenant-yakap";
    private readonly Guid _clinicId = Guid.NewGuid();

    private (IPhilHealthProxyClient Client, StubInteropRequestClient Hub) CreateClient(Func<PhilHealthRequestPayload, PhilHealthResponsePayload> reply)
    {
        var hub = new StubInteropRequestClient(call => reply((PhilHealthRequestPayload)call.Payload));
        var client = new PhilHealthProxyClient(hub, Phase3TestKit.Identity(_clinicId, Tenant), NullLogger<PhilHealthProxyClient>.Instance);
        return (client, hub);
    }

    private static PhilHealthResponsePayload Ok<T>(T data) =>
        new() { StatusCode = 200, Body = JsonSerializer.Serialize(ApiResponse<T>.Success(data)) };

    private static TenantConfigurationStatusResponse ProxyStatus(Guid tenantId) => new(
        TenantId: tenantId,
        BranchId: null,
        FacilityName: "St. Jude Clinic",
        AccreditationNumber: "H10000001",
        PmccNumber: "Z15445",
        SoftwareCertificateId: "CERT-ABCDE",
        HasSecretKey: true,
        HasCipherKey: true,
        BaseUrl: "https://pcapi.philhealth.gov.ph",
        IsActive: true,
        UpdatedAt: DateTimeOffset.UtcNow);

    [Fact]
    public async Task ConfigureTenantCredentialsAsync_SendsTheCredentialsToThePhilHealthService_FromThisClinic()
    {
        var tenantId = Guid.NewGuid();
        var (client, hub) = CreateClient(_ => Ok(ProxyStatus(tenantId)));
        var request = new ConfigurePhilHealthCredentialsProxyRequest(
            TenantId: tenantId,
            FacilityName: "St. Jude Clinic",
            AccreditationNumber: "H10000001",
            PmccNumber: "Z15445",
            SoftwareCertificateId: "CERT-ABCDE",
            SecretKey: "pcapi_secret_key",
            CipherKey: "secret_cipher_key",
            BaseUrl: "https://pcapi.philhealth.gov.ph");

        var response = await client.ConfigureTenantCredentialsAsync(request);

        response.Succeeded.Should().BeTrue();
        response.Data!.IsConfigured.Should().BeTrue();
        response.Data.AccreditationNumber.Should().Be("H10000001");
        var call = hub.Calls.Should().ContainSingle().Subject;
        call.RequestType.Should().Be(InteropTypes.PhilHealthRequest);
        call.ReplyType.Should().Be(InteropTypes.PhilHealthResponse);
        call.From.Should().Be(Party.ForFacility(Tenant, _clinicId.ToString(), FacilityType.Clinic));
        call.To.Should().Be(Party.PhilHealth);
        var payload = (PhilHealthRequestPayload)call.Payload;
        payload.Operation.Should().Be(PhilHealthOperations.TenantConfigure);
        payload.Argument.Should().BeNull();
        payload.Body.Should().Contain("pcapi_secret_key").And.Contain("H10000001");
    }

    [Fact]
    public async Task GetTenantConfigurationStatusAsync_ReturnsStatusFromTheService()
    {
        var (client, hub) = CreateClient(_ => Ok(ProxyStatus(Guid.NewGuid())));

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
        var (client, hub) = CreateClient(_ => Ok(new TestTenantConnectionResponse(
            Success: true,
            Message: "Authentication successful! PhilHealth gateway accepted facility credentials.",
            StatusCode: 200,
            LatencyMs: 45)));

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
            Body = JsonSerializer.Serialize(ApiResponse<TestTenantConnectionResponse>.Fail("Invalid facility accreditation code or expired certificate."))
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
        var (client, hub) = CreateClient(_ => Ok(ProxyStatus(Guid.NewGuid())));
        hub.Failure = new InteropRequestTimeoutException(InteropTypes.PhilHealthRequest, Guid.NewGuid(), TimeSpan.FromSeconds(60));

        var response = await client.TestTenantConnectionAsync();

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("did not answer in time");
    }

    [Fact]
    public async Task AnUnprovisionedClinic_CannotReachPhilHealthAndSendsNothing()
    {
        var hub = new StubInteropRequestClient(_ => Ok(ProxyStatus(Guid.NewGuid())));
        IPhilHealthProxyClient client = new PhilHealthProxyClient(
            hub, NSubstitute.Substitute.For<ClinicEz.Clinic.Application.Common.Interfaces.IClinicIdentityProvider>(), NullLogger<PhilHealthProxyClient>.Instance);

        var response = await client.GetTenantConfigurationStatusAsync();

        response.Succeeded.Should().BeFalse();
        response.Message.Should().Contain("not been connected");
        hub.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task MissingConnectionUrl_InFacilitySettings_EmitsClearErrorBeforeCallingHub()
    {
        var hub = new StubInteropRequestClient(_ => Ok(ProxyStatus(Guid.NewGuid())));
        var clinicCtx = Substitute.For<ClinicEz.Clinic.Domain.Interfaces.IClinicContext>();
        clinicCtx.ClinicId.Returns(_clinicId);
        clinicCtx.TenantId.Returns(Tenant);
        var (db, _, sieve) = TestDbHelper.CreateTestContext(clinicCtx);
        db.Settings.Add(new ClinicEz.Clinic.Domain.Entities.FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = Tenant,
            ClinicId = _clinicId,
            ClinicName = "No URL Clinic",
            AccreditationNumber = "P10038831",
            PhilHealthBaseUrl = null,
            BranchPhilHealthBaseUrl = null,
            IsPhilHealthConfigured = true
        });
        await db.SaveChangesAsync();
        var settingsRepo = TestDbHelper.CreateRepository<ClinicEz.Clinic.Domain.Entities.FacilitySettings>(db, sieve);

        var pcapi = new PhilHealthProxyClient(
            hub,
            Phase3TestKit.Identity(_clinicId, Tenant),
            NullLogger<PhilHealthProxyClient>.Instance,
            settingsRepo);

        var response = await pcapi.ValidateStandingAsync(new ClinicEz.Clinic.Application.Features.Yakap.DTOs.YakapValidateStandingRequest("123456789012", "2026"));

        response.Succeeded.Should().BeFalse();
        response.ErrorCode.Should().Be("PHILHEALTH_CONNECTION_URL_MISSING");
        response.Message.Should().Contain("PhilHealth Connection URL is not configured");
        hub.Calls.Should().BeEmpty();
    }
}
