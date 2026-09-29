using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

public interface IDiagnosticReportPublisher
{
    Task PublishReportFinalizedAsync(DiagnosticReportFinalizedEvent reportEvent, CancellationToken cancellationToken = default);
}
