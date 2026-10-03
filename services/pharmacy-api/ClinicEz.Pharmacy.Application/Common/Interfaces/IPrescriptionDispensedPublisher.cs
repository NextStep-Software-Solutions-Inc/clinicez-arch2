using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Pharmacy.Application.Common.Interfaces;

public interface IPrescriptionDispensedPublisher
{
    Task PublishPrescriptionDispensedAsync(PrescriptionDispensedEvent dispensedEvent, CancellationToken cancellationToken = default);
}
