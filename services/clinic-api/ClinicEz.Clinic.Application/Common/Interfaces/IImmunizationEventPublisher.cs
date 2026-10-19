using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IImmunizationEventPublisher
{
    Task<bool> PublishImmunizationAdministeredAsync(PatientImmunization immunization, CancellationToken cancellationToken = default);
}
