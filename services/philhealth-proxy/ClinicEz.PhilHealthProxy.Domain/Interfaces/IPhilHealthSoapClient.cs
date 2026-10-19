using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Abstraction over the PhilHealth Konsulta SOAP service.
/// Each method maps exactly to one WSDL operation.
/// Credentials (pUsername, pUserPassword, pHospitalCode, pSoftwareCertificationId)
/// are resolved per-tenant by the infrastructure implementation — callers never
/// pass credentials directly.
/// </summary>
public interface IPhilHealthSoapClient
{
    /// <summary>
    /// Obtains a session token from PhilHealth.
    /// SOAP: <c>getToken</c>
    /// </summary>
    Task<SoapResult> GetTokenAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks whether a PhilHealth member or dependent is registered under Konsulta.
    /// SOAP: <c>isMemberDependentRegistered</c>
    /// </summary>
    Task<SoapResult> IsMemberDependentRegisteredAsync(
        string pin,
        string type,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Validates an Authorization to Claim (ATC) code.
    /// SOAP: <c>isATCValid</c>
    /// </summary>
    Task<SoapResult> IsAtcValidAsync(
        string pin,
        string atc,
        string effectivityDate,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Extracts the list of registered patients within a date range.
    /// SOAP: <c>extractRegistrationList</c>
    /// </summary>
    Task<SoapResult> ExtractRegistrationListAsync(
        string startDate,
        string endDate,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Validates a Konsulta report before submission.
    /// SOAP: <c>validateReport</c>
    /// </summary>
    Task<SoapResult> ValidateReportAsync(
        string reportTagging,
        string report,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Submits a validated Konsulta report to PhilHealth.
    /// SOAP: <c>submitReport</c>
    /// </summary>
    Task<SoapResult> SubmitReportAsync(
        string transmittalId,
        string report,
        string reportTagging,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks the upload/transmittal status of a previously submitted report.
    /// SOAP: <c>checkUploadStatus</c>
    /// </summary>
    Task<SoapResult> CheckUploadStatusAsync(
        string? startDate,
        string? endDate,
        string? transmittalId,
        string? report,
        CancellationToken cancellationToken = default);
}
