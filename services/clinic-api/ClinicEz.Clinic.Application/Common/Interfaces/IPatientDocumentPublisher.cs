using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// One document issued to a ClinicEZ patient. <see cref="DocumentId"/> is the idempotency key, so publishing the same
/// document again (new status, a result arrived, a doctor reviewed it) updates the patient's copy instead of adding one.
/// </summary>
public sealed record PatientDocumentDraft(
    Guid ClinicId,
    Guid ClinicPatientId,
    Guid DocumentId,
    PatientDocumentKind Kind,
    string Title,
    DateTime IssuedAtUtc,
    string? Status = null,
    ResultSource? Source = null,
    VerificationState? Verification = null,
    string? VerificationToken = null,
    string? VerificationUrl = null,
    string? ClaimToken = null,
    object? Body = null);

/// <summary>
/// Queues <c>patient.document.issued</c> for the patient-app account behind a clinic patient (right of access: the
/// patient keeps a copy of everything issued to them). Must be called before the business <c>SaveChanges</c> so the message
/// commits with the business change. A walk-in patient with no patient-app account is skipped.
/// </summary>
public interface IPatientDocumentPublisher
{
    /// <returns>False when the patient has no patient-app account (nothing queued).</returns>
    Task<bool> PublishAsync(PatientDocumentDraft draft, CancellationToken ct);
}

/// <summary>
/// Creates the hub claim for a requisition or prescription the patient carries to a laboratory/pharmacy. The claim token
/// printed on the slip lets any ClinicEZ facility of that type take the order; the issuer is the clinic, the patient
/// is the consent broker.
/// </summary>
public interface IClaimSlipService
{
    Task<ClaimSlipResult> CreateLabClaimAsync(LabRequisitionIssuedEvent requisition, CancellationToken ct);

    Task<ClaimSlipResult> CreateRxClaimAsync(PrescriptionIssuedEvent prescription, CancellationToken ct);
}
