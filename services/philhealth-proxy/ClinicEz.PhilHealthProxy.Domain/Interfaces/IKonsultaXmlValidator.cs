using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Pre-flight validator for PhilHealth XML payloads against official DTD and XSD schemas:
/// - KonsultaData_v1.14.dtd (PCB report transmittals, Tranche 1 and Tranche 2)
/// - KonsultaMasterlist_v1.5.xsd / KonsultaMasterlist_v1.4.dtd (Beneficiary registration lists)
/// </summary>
public interface IKonsultaXmlValidator
{
    /// <summary>
    /// Validates a Konsulta / Yakap XML report document against KonsultaData_v1.14.dtd.
    /// </summary>
    XmlValidationResult ValidateReportXml(string xmlContent);

    /// <summary>
    /// Validates an extracted registration masterlist XML document against KonsultaMasterlist_v1.5.xsd.
    /// </summary>
    XmlValidationResult ValidateMasterlistXml(string xmlContent);
}
