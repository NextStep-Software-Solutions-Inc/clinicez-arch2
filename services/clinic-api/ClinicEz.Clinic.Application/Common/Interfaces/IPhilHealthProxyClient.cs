using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public sealed record ConfigurePhilHealthCredentialsProxyRequest(
    Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string SecretKey,
    string CipherKey,
    string? BaseUrl = "https://pcapi.philhealth.gov.ph");

public sealed record PhilHealthConfigStatusResponse(
    Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string BaseUrl,
    bool IsConfigured,
    bool IsActive,
    DateTimeOffset? UpdatedAt);

public interface IPhilHealthProxyClient
{
    Task<ApiResponse<bool>> ValidatePinAsync(
        string pin,
        CancellationToken ct = default);

    Task<ApiResponse<PhilHealthConfigStatusResponse>> ConfigureTenantCredentialsAsync(
        ConfigurePhilHealthCredentialsProxyRequest request,
        CancellationToken ct = default);

    Task<ApiResponse<PhilHealthConfigStatusResponse>> GetTenantConfigurationStatusAsync(
        CancellationToken ct = default);

    Task<ApiResponse<string>> TestTenantConnectionAsync(
        CancellationToken ct = default);
}
