using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Boundary interface allowing HealthScreenings to trigger YAKAP FPE submission
/// without directly referencing Features.Yakap types (preserves Modular Monolith boundary).
/// </summary>
public interface IYakapScreeningDispatcher
{
    Task DispatchFpeSubmissionAsync(Guid healthScreeningId, CancellationToken ct = default);
}
