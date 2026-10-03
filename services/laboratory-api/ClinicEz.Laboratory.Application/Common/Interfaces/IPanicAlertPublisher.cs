using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

public interface IPanicAlertPublisher
{
    Task PublishPanicAlertAsync(LabPanicResultAlertEvent alertEvent, CancellationToken cancellationToken = default);
}
