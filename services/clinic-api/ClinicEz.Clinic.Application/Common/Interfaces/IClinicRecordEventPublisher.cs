using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicRecordEventPublisher
{
    Task PublishRecordVerifiedAsync(ClinicRecordVerifiedEvent recordEvent, CancellationToken cancellationToken = default);
}
