using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// A capability to upload a result for one lab order. Only the SHA-256 hash of the 128-bit random secret is stored; the
/// plaintext token (<c>{facilityId:N}.{random}</c>) is shown once when the grant is minted. A grant expires, can be used
/// a limited number of times and decides which <see cref="ResultSource"/> an upload gets.
/// </summary>
public sealed class UploadGrant : ClinicScopedEntity
{
    public Guid LabOrderId { get; set; }

    public required byte[] TokenHash { get; set; }

    public UploaderKind Kind { get; set; }
    public DateTime ExpiresAt { get; set; }
    public int MaxUploads { get; set; }
    public int Used { get; set; }
    public DateTime? RevokedAt { get; set; }
}
