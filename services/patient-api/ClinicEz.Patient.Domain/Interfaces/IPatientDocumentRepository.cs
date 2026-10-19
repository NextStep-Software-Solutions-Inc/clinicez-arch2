using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

/// <summary>Everything changed for a patient since a cursor, for the app's incremental pull.</summary>
public sealed record PatientChangeSet(
    IReadOnlyList<LabRequestSlip> LabSlips,
    IReadOnlyList<PrescriptionDocument> Prescriptions,
    IReadOnlyList<LabResultReport> Reports,
    IReadOnlyList<MedicalCertificate> Certificates,
    IReadOnlyList<PatientAccessGrant> Grants,
    IReadOnlyList<Notification> Notifications,
    DateTime Cursor,
    bool HasMore);

/// <summary>The documents facilities issue to a patient (right of access): lab slips, prescriptions, lab reports and medical certificates.</summary>
public interface IPatientDocumentRepository
{
    Task<LabRequestSlip?> GetLabSlipAsync(Guid patientId, Guid requisitionId, CancellationToken cancellationToken = default);
    Task AddLabSlipAsync(LabRequestSlip slip, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<LabRequestSlip>> GetLabSlipsAsync(Guid patientId, CancellationToken cancellationToken = default);

    /// <summary>The prescription with its lines (tracked), or null.</summary>
    Task<PrescriptionDocument?> GetPrescriptionAsync(Guid patientId, Guid prescriptionId, CancellationToken cancellationToken = default);
    Task AddPrescriptionAsync(PrescriptionDocument prescription, CancellationToken cancellationToken = default);
    void RemovePrescriptionLines(IEnumerable<Prescription> lines);
    void AddPrescriptionLines(IEnumerable<Prescription> lines);
    Task<IReadOnlyList<PrescriptionDocument>> GetPrescriptionsAsync(Guid patientId, CancellationToken cancellationToken = default);

    /// <summary>The report with its analytes (tracked), looked up by its source id.</summary>
    Task<LabResultReport?> GetLabReportAsync(Guid patientId, Guid reportId, CancellationToken cancellationToken = default);

    /// <summary>The most recent report for the order (tracked), or null.</summary>
    Task<LabResultReport?> GetLabReportForRequisitionAsync(Guid patientId, Guid requisitionId, CancellationToken cancellationToken = default);
    Task AddLabReportAsync(LabResultReport report, CancellationToken cancellationToken = default);
    void RemoveLabObservations(IEnumerable<LabResult> observations);
    void AddLabObservations(IEnumerable<LabResult> observations);
    Task<IReadOnlyList<LabResultReport>> GetLabReportsAsync(Guid patientId, CancellationToken cancellationToken = default);

    Task<MedicalCertificate?> GetCertificateAsync(Guid patientId, Guid certificateId, CancellationToken cancellationToken = default);
    Task AddCertificateAsync(MedicalCertificate certificate, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<MedicalCertificate>> GetCertificatesAsync(Guid patientId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Rows created or updated after <paramref name="since"/> (null = everything), at most about <paramref name="take"/> per kind.
    /// The returned cursor is what the next call must pass; rows are upserts, so overlap is harmless.
    /// </summary>
    Task<PatientChangeSet> GetChangesAsync(Guid patientId, DateTime? since, int take, CancellationToken cancellationToken = default);
}