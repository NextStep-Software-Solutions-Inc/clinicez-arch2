using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public sealed record ConfigurePhilHealthCredentialsProxyRequest(
    System.Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string Username,
    string Password,
    string CipherKey,
    string? KonsultaEndpoint = null);

public sealed record PhilHealthConfigStatusResponse(
    System.Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string KonsultaEndpoint,
    bool IsConfigured,
    bool IsActive,
    System.DateTimeOffset? UpdatedAt);

public interface IPhilHealthProxyClient
{
    Task<ApiResponse<YakapValidationProxyResponse>> ValidateReportAsync(
        GenerateAndValidateReportProxyRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<YakapSubmissionProxyResponse>> SubmitReportAsync(
        GenerateAndSubmitReportProxyRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<YakapMasterlistProxyResponse>> ExtractMasterlistAsync(
        ExtractMasterlistProxyRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<bool>> ValidatePinAsync(
        string pin,
        CancellationToken ct = default);

    Task<ApiResponse<SoapSimulationReportDto>> RunSoapSimulationAsync(
        RunSoapSimulationProxyRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<SoapSandboxStatusDto>> GetSoapSandboxStatusAsync(
        CancellationToken ct = default);

    Task<ApiResponse<SoapSandboxStatusDto>> SetSoapSandboxScenarioAsync(
        SetSimulationScenarioRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<SoapSandboxStatusDto>> ResetSoapSandboxAsync(
        CancellationToken ct = default);

    Task<ApiResponse<PhilHealthConfigStatusResponse>> ConfigureTenantCredentialsAsync(
        ConfigurePhilHealthCredentialsProxyRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<PhilHealthConfigStatusResponse>> GetTenantConfigurationStatusAsync(
        CancellationToken ct = default);

    Task<ApiResponse<string>> TestTenantConnectionAsync(
        CancellationToken ct = default);
}

