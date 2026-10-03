using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface ILabRequisitionPublisher
{
    Task PublishRequisitionIssuedAsync(LabRequisitionIssuedEvent requisitionEvent, CancellationToken cancellationToken = default);
    Task PublishExternalResultUploadedAsync(ExternalLabResultUploadedEvent uploadedEvent, CancellationToken cancellationToken = default);
}
