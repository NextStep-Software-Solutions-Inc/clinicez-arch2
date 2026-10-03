using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Parses and processes registration masterlist XML payloads returned by the
/// PhilHealth extractRegistrationList SOAP service method.
/// </summary>
public interface IKonsultaMasterlistParser
{
    /// <summary>
    /// Parses an extracted masterlist XML string conforming to KonsultaMasterlist_v1.5.xsd or v1.4.dtd.
    /// </summary>
    YakapMasterlistResult ParseMasterlistXml(string xmlContent);

    /// <summary>
    /// Validates whether a 12-digit PhilHealth Identification Number (PIN) satisfies format and Modulus-11 check digit constraints.
    /// </summary>
    bool ValidatePin(string pin);
}
