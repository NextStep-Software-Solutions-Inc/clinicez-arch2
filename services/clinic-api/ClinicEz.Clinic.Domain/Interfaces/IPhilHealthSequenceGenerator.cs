using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Domain.Interfaces;

public record PhilHealthPatientJourneyNumbers(
    string CaseNumber,
    string ProfilingTransactionNumber,
    string? SoapTransactionNumber = null);

public interface IPhilHealthSequenceGenerator
{
    /// <summary>
    /// Generates an official 23-character PhilHealth PCAPI v2.0 Case Number (case_no).
    /// Format: C + {AccreditationNo9} + {yyyyMMdd} + {Sequence:D5}
    /// </summary>
    Task<string> GenerateCaseNumberAsync(
        string tenantId,
        Guid clinicId,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default);

    /// <summary>
    /// Generates an official 23-character PhilHealth PCAPI v2.0 Daily Transaction Number.
    /// Format: Prefix (C/P/S/D/L/M/R) + {AccreditationNo9} + {yyyyMMdd} + {Sequence:D5}
    /// </summary>
    Task<string> GenerateTransactionNumberAsync(
        string tenantId,
        Guid clinicId,
        PhilHealthSequenceType type,
        string accreditationNumber,
        string effectiveYear,
        CancellationToken ct = default);

    /// <summary>
    /// Automatically generates or resolves the patient's annual CaseNo (C...),
    /// ProfilingNo (P...), and (if encounter specified) Consultation TransNo (S...),
    /// persisting them atomically onto PatientYakapEnlistment and ConsultationEncounter.
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
