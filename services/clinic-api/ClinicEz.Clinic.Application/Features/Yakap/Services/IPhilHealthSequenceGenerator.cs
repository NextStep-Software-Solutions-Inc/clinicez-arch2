using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

public record PhilHealthPatientJourneyNumbers(
    string CaseNumber,
    string EnlistmentTransactionNumber,
    string ProfilingTransactionNumber,
    string? SoapTransactionNumber = null);

public interface IPhilHealthSequenceGenerator
{
    /// <summary>
    /// Generates an official, 20-character compliant PhilHealth Case Number (pHciCaseNo).
    /// Format: C + {AccreditationNo} + {Year} + {Sequence:D5} (e.g. C00921202600001)
    /// </summary>
    Task<string> GenerateCaseNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default);

    /// <summary>
    /// Generates an official, 20-character compliant PhilHealth Transaction Number (pHciTransNo).
    /// Format: Prefix (E/P/S/M) + {AccreditationNo} + {Year} + {Sequence:D5}
    /// </summary>
    Task<string> GenerateTransactionNumberAsync(
        string tenantId,
        Guid clinicId,
        PhilHealthSequenceType type,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default);

    /// <summary>
    /// Generates an official PhilHealth Transmittal Number (pHciTransmittalNumber).
    /// Format: R + {AccreditationNo} + {Year} + {Sequence:D5} (e.g. R00921202600001)
    /// </summary>
    Task<string> GenerateTransmittalNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default);

    /// <summary>
    /// Automatically generates or resolves the patient's annual CaseNo, EnlistmentNo,
    /// ProfilingNo, and (if encounter specified) SOAP TransNo, persisting them atomically
    /// onto the ClinicPatient and ConsultationEncounter records.
    /// </summary>
    Task<PhilHealthPatientJourneyNumbers> AssignPatientJourneyNumbersAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? encounterId,
        string accreditationNumber,
        string effectiveYear,
        DateTime? referenceDate = null,
        CancellationToken ct = default);

    Task<PhilHealthPatientJourneyNumbers> AssignPatientJourneyNumbersAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? encounterId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct);
}
