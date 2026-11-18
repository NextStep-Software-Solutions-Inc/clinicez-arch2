using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

/// <summary>
/// Persists DOH LTO verification proof artifacts uploaded through the portal control plane and returns an opaque object key.
/// </summary>
public interface IPortalEvidenceStorageService
{
    Task<string> SaveLtoProofAsync(
        Guid tenantId,
        Guid facilityId,
        string contentType,
        byte[] content,
        CancellationToken ct = default);
}
