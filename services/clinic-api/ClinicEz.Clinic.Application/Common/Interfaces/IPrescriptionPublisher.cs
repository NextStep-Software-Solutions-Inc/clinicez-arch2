using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Queues <c>rx.issued</c> in the interop outbox, addressed to the prescription's target pharmacy. Call it BEFORE the
/// caller's <c>SaveChanges</c> so the message commits atomically with the prescription. Failures throw.
/// </summary>
public interface IPrescriptionPublisher
{
    void PublishPrescriptionIssued(PrescriptionIssuedEvent prescriptionEvent);
}
