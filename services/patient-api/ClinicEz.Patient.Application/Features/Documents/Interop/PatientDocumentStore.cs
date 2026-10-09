using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Patient.Application.Features.Documents.Interop;

/// <summary>
/// Order-independent access to the patient's documents: status messages can overtake the document they refer to,
/// so a missing row is created as a stub that the document itself completes later.
/// </summary>
internal static class PatientDocumentStore
{
    public static async Task<LabRequestSlip> GetOrCreateLabSlipAsync(
        IPatientDocumentRepository documents, Guid patientId, Guid requisitionId,
        string? orderingTenantId, string? orderingFacilityId, DateTime now, CancellationToken cancellationToken)
    {
        var slip = await documents.GetLabSlipAsync(patientId, requisitionId, cancellationToken);
        if (slip is not null)
            return slip;

        slip = new LabRequestSlip
        {
            PatientId = patientId,
            RequisitionId = requisitionId,
            OrderingTenantId = orderingTenantId ?? string.Empty,
            OrderingFacilityId = orderingFacilityId ?? string.Empty,
            IssuedAt = now
        };
        await documents.AddLabSlipAsync(slip, cancellationToken);
        return slip;
    }

    public static async Task<PrescriptionDocument> GetOrCreatePrescriptionAsync(
        IPatientDocumentRepository documents, Guid patientId, Guid prescriptionId,
        string? orderingTenantId, string? orderingFacilityId, DateTime now, CancellationToken cancellationToken)
    {
        var prescription = await documents.GetPrescriptionAsync(patientId, prescriptionId, cancellationToken);
        if (prescription is not null)
            return prescription;

        prescription = new PrescriptionDocument
        {
            PatientId = patientId,
            PrescriptionId = prescriptionId,
            OrderingTenantId = orderingTenantId ?? string.Empty,
            OrderingFacilityId = orderingFacilityId ?? string.Empty,
            IssuedAt = now
        };
        await documents.AddPrescriptionAsync(prescription, cancellationToken);
        return prescription;
    }

    /// <summary>A status message only applies when it is not older than the stage already recorded.</summary>
    public static bool IsCurrent(DateTime changedAtUtc, DateTime? recordedAt) =>
        recordedAt is null || changedAtUtc >= recordedAt;

    public static LabSlipStage ToDomain(LabOrderStage stage) => Enum.Parse<LabSlipStage>(stage.ToString());

    public static PrescriptionStage ToDomain(RxStage stage) => Enum.Parse<PrescriptionStage>(stage.ToString());

    public static ResultProvenance ToDomain(ResultSource source) => Enum.Parse<ResultProvenance>(source.ToString());

    public static ResultVerification ToDomain(VerificationState state) => Enum.Parse<ResultVerification>(state.ToString());

    /// <summary>Instants from the wire are treated as UTC so they can always be persisted.</summary>
    public static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
    };

    public static DateTime? Utc(DateTime? value) => value is null ? null : Utc(value.Value);
}
