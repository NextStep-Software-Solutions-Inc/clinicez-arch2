using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public sealed record PhilHealthTestConnectionResult(
    bool Success,
    string Message,
    string? Token = null);

/// <summary>
/// Probes PhilHealth Konsulta SOAP gateway connectivity and credentials validation.
/// </summary>
public interface IPhilHealthSoapTester
{
    Task<PhilHealthTestConnectionResult> TestConnectionAsync(
        string accreditationNumber,
        string username,
        string password,
        string? softwareCertificateId,
        string? endpoint,
        CancellationToken ct = default);
}
