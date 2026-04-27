using CLINICEZ.PhilHealth.Proxy.Models;

namespace CLINICEZ.PhilHealth.Proxy.Services;

/// <summary>
/// Contract for the PhilHealth Konsulta SOAP API client.
/// </summary>
public interface IPhilHealthSoapClient
{
    /// <summary>Retrieves PhilHealth member information by PhilHealth Identification Number (PIN).</summary>
    Task<SoapResponse<PhilHealthMemberInfo>> GetMemberInfoAsync(
        string philHealthNumber,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks whether a member is eligible for the Konsulta package
    /// at the registered facility on a specific consultation date.
    /// </summary>
    Task<SoapResponse<EligibilityResult>> CheckEligibilityAsync(
        string philHealthNumber,
        string facilityAccreditationNumber,
        string consultationDate,
        IReadOnlyList<string> diagnosisCodes,
        CancellationToken cancellationToken = default);

    /// <summary>Verifies that the PhilHealth PIN belongs to the supplied name.</summary>
    Task<SoapResponse<bool>> VerifyMemberAsync(
        string philHealthNumber,
        string lastName,
        string firstName,
        string? dateOfBirth,
        CancellationToken cancellationToken = default);
}
