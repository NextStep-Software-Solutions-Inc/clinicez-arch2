using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Synchronizes clinic directory profiles and platform verification requests via the transactional Interop outbox.
/// </summary>
public interface IClinicDirectorySyncService
{
    Task EnqueueVerificationRequestAsync(
        FacilitySettings settings,
        string requestKind,
        string? submittedByClinicUserId = null,
        string? submittedByDisplayName = null,
        CancellationToken ct = default);

    Task EnqueueDirectoryUpdateAsync(
        FacilitySettings settings,
        CancellationToken ct = default);

    Task EnqueuePractitionerVerificationRequestAsync(
        StaffMember staff,
        string requestKind,
        string? submittedByClinicUserId = null,
        DateTime? submittedAtUtc = null,
        CancellationToken ct = default);
}
