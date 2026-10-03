using ClinicEz.PhilHealthProxy.Domain.Models.Yakap;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Generates XML documents conforming to PhilHealth KonsultaData_v1.14.dtd:
/// - First Tranche (pReportTagging="1"): Enlistment + Profiling with required DTD placeholders
/// - Second Tranche (pReportTagging="2"): Full encounters (Enlistment, Profiling, SOAP, Diagnostics, Medicines)
/// </summary>
public interface IKonsultaXmlGenerator
{
    /// <summary>
    /// Generates First Tranche XML (ReportTagging="1") for First Patient Encounter (FPE) and Profiling.
    /// Emits valid placeholder SOAPS and MEDICINES elements required by the DTD grammar.
    /// </summary>
    string GenerateTranche1Xml(YakapReportDocument document);

    /// <summary>
    /// Generates Second Tranche XML (ReportTagging="2") for full clinical encounters.
    /// </summary>
    string GenerateTranche2Xml(YakapReportDocument document);
}
