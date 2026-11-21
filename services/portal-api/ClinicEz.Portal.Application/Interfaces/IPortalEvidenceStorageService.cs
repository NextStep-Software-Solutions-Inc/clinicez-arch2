using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Interfaces;

public sealed record PortalEvidenceFile(
    byte[] Content,
    string ContentType,
    string FileName);

/// <summary>
/// Persists and reads DOH LTO and cached PRC verification proof artifacts in the portal control plane.
/// </summary>
public interface IPortalEvidenceStorageService
{
    Task<string> SaveLtoProofAsync(
        Guid tenantId,
        Guid facilityId,
        string contentType,
        byte[] content,
        CancellationToken ct = default);

    Task<PortalEvidenceFile?> ReadEvidenceAsync(
        string objectKey,
        CancellationToken ct = default);

    Task SaveCachedEvidenceAsync(
        Guid tenantId,
        Guid facilityId,
        string objectKey,
        string contentType,
        string? fileName,
        byte[] content,
        CancellationToken ct = default);
}
