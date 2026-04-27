using PhilHealthProxy.Domain.Models;

namespace PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Abstraction over the PhilHealth Konsulta SOAP service.
/// Each method maps to one SOAP operation.
/// </summary>
public interface IPhilHealthSoapClient
{
    /// <summary>Maps to the SOAP <c>checkUploadStatus</c> operation.</summary>
    Task<SoapResult> CheckUploadStatusAsync(
        string? startDate,
        string? endDate,
        string? transmittalId,
        string? report,
        CancellationToken cancellationToken = default);
}
