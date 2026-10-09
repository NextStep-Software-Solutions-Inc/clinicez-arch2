using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Talks to the PhilHealth proxy through the interop hub (<c>philhealth.request</c>, answered with
/// <c>philhealth.response</c>); there is no direct HTTP call to it. The proxy acts for the facility named in the signed
/// envelope sender, so no tenant or facility id travels in the request. The proxy's endpoint result comes back as the
/// <see cref="ApiResponse{T}"/> document it would have returned over HTTP; an unreachable or silent proxy becomes a failed
/// response with a clear message.
/// </summary>
public sealed class PhilHealthProxyClient : IPhilHealthProxyClient
{
    /// <summary>SOAP calls to PhilHealth can be slow, so this is longer than the hub's default request timeout.</summary>
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(60);

    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    }.UseStrictStringEnums();

    private readonly IInteropRequestClient _requests;
    private readonly IClinicIdentityProvider _identity;
    private readonly ILogger<PhilHealthProxyClient> _logger;

    public PhilHealthProxyClient(
        IInteropRequestClient requests,
        IClinicIdentityProvider identity,
        ILogger<PhilHealthProxyClient> logger)
    {
        _requests = requests;
        _identity = identity;
        _logger = logger;
    }

    private async Task<ApiResponse<T>> SendAsync<T>(string operation, object? body, string? argument, CancellationToken ct)
    {
        var clinic = await _identity.GetAsync(ct);
        if (clinic is null)
        {
            return ApiResponse<T>.Fail("This clinic has not been provisioned on this server, so PhilHealth cannot be reached.");
        }

        var request = new PhilHealthRequestPayload
        {
            Operation = operation,
            Argument = argument,
            Body = body is null ? null : JsonSerializer.Serialize(body, JsonOptions)
        };

        try
        {
            var reply = await _requests.RequestAsync<PhilHealthRequestPayload, PhilHealthResponsePayload>(
                InteropTypes.PhilHealthRequest,
                InteropTypes.PhilHealthResponse,
                ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString()),
                Party.PhilHealth,
                request,
                Timeout,
                ct);

            return string.IsNullOrWhiteSpace(reply.Body)
                ? ApiResponse<T>.Fail($"Empty response from the PhilHealth service (HTTP {reply.StatusCode})")
                : JsonSerializer.Deserialize<ApiResponse<T>>(reply.Body, JsonOptions)
                  ?? ApiResponse<T>.Fail($"Empty response from the PhilHealth service (HTTP {reply.StatusCode})");
        }
        catch (InteropRequestTimeoutException ex)
        {
            _logger.LogWarning(ex, "[PhilHealthProxy] {Operation} timed out.", operation);
            return ApiResponse<T>.Fail("The PhilHealth service did not answer in time. Try again in a moment.");
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] {Operation} returned an unreadable response.", operation);
            return ApiResponse<T>.Fail("The PhilHealth service returned a response that could not be read.");
        }
    }

    public Task<ApiResponse<YakapValidationProxyResponse>> ValidateReportAsync(
        GenerateAndValidateReportProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<YakapValidationProxyResponse>(PhilHealthOperations.YakapReportValidate, request, null, ct);

    public Task<ApiResponse<YakapSubmissionProxyResponse>> SubmitReportAsync(
        GenerateAndSubmitReportProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<YakapSubmissionProxyResponse>(PhilHealthOperations.YakapReportSubmit, request, null, ct);

    public Task<ApiResponse<YakapMasterlistProxyResponse>> ExtractMasterlistAsync(
        ExtractMasterlistProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<YakapMasterlistProxyResponse>(PhilHealthOperations.YakapMasterlistExtract, request, null, ct);

    public Task<ApiResponse<bool>> ValidatePinAsync(
        string pin,
        CancellationToken ct = default) =>
        SendAsync<bool>(PhilHealthOperations.YakapPinValidate, null, pin, ct);

    public Task<ApiResponse<SoapSimulationReportDto>> RunSoapSimulationAsync(
        RunSoapSimulationProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<SoapSimulationReportDto>(PhilHealthOperations.SoapSandboxRun, request, null, ct);

    public Task<ApiResponse<SoapSandboxStatusDto>> GetSoapSandboxStatusAsync(
        CancellationToken ct = default) =>
        SendAsync<SoapSandboxStatusDto>(PhilHealthOperations.SoapSandboxStatus, null, null, ct);

    public Task<ApiResponse<SoapSandboxStatusDto>> SetSoapSandboxScenarioAsync(
        SetSimulationScenarioRequest request,
        CancellationToken ct = default) =>
        SendAsync<SoapSandboxStatusDto>(PhilHealthOperations.SoapSandboxScenario, request, null, ct);

    public Task<ApiResponse<SoapSandboxStatusDto>> ResetSoapSandboxAsync(
        CancellationToken ct = default) =>
        SendAsync<SoapSandboxStatusDto>(PhilHealthOperations.SoapSandboxReset, null, null, ct);

    public Task<ApiResponse<PhilHealthConfigStatusResponse>> ConfigureTenantCredentialsAsync(
        ConfigurePhilHealthCredentialsProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<PhilHealthConfigStatusResponse>(PhilHealthOperations.TenantConfigure, request, null, ct);

    public Task<ApiResponse<PhilHealthConfigStatusResponse>> GetTenantConfigurationStatusAsync(
        CancellationToken ct = default) =>
        SendAsync<PhilHealthConfigStatusResponse>(PhilHealthOperations.TenantStatus, null, null, ct);

    public Task<ApiResponse<string>> TestTenantConnectionAsync(
        CancellationToken ct = default) =>
        SendAsync<string>(PhilHealthOperations.TenantTestConnection, null, null, ct);
}
