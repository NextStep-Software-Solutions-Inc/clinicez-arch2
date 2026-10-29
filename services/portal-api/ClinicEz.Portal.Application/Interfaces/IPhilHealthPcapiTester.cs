using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public sealed record PhilHealthTestConnectionResult(
    bool Success,
    string Message,
    string? Token = null,
    long LatencyMs = 0);

/// <summary>
/// Probes PhilHealth PCAPI v2.0 gateway connectivity and validates bearer authentication at /api/v1/auth/token.
/// </summary>
public interface IPhilHealthPcapiTester
{
    Task<PhilHealthTestConnectionResult> TestConnectionAsync(
        string accreditationNumber,
        string secretKey,
        string? softwareCertificateId = null,
        string? baseUrl = null,
        CancellationToken ct = default);
}
