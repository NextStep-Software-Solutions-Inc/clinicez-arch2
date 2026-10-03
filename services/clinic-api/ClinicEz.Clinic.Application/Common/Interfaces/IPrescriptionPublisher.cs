using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IPrescriptionPublisher
{
    Task PublishPrescriptionIssuedAsync(PrescriptionIssuedEvent prescriptionEvent, CancellationToken cancellationToken = default);
}
