using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>The current clinic as announced by the control plane (tenant, facility id and display name).</summary>
public sealed record ClinicIdentity(string TenantId, Guid ClinicId, string Name);

/// <summary>Resolves the profile of the clinic the current request operates in.</summary>
public interface IClinicIdentityProvider
{
    /// <summary>Null when the clinic has not been provisioned on this server yet.</summary>
    Task<ClinicIdentity?> GetAsync(CancellationToken cancellationToken = default);
}
