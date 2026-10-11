using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Queues <c>clinic.record.verified</c> for the patient (addressed through the interop hub). Call it BEFORE the caller's
/// <c>SaveChanges</c> so both commit atomically. Returns false (nothing queued) when the clinic patient is not linked to
/// a patient-app account.
/// </summary>
public interface IClinicRecordEventPublisher
{
    Task<bool> PublishRecordVerifiedAsync(ClinicRecordVerifiedEvent recordEvent, CancellationToken cancellationToken = default);
}
