using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

public interface IPanicAlertPublisher
{
    /// <summary>
    /// Queues <c>lab.result.panic</c> to the ordering clinic in the transactional outbox. Call it BEFORE the
    /// business <c>SaveChanges</c> so the dispatch log and its message commit together. Throws when the
    /// requisition has no ordering party to reply to.
    /// </summary>
    void EnqueuePanicAlert(LabPanicResultAlertEvent alertEvent);
}
