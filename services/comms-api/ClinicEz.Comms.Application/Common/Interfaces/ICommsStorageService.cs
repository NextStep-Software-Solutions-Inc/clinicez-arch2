using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public interface ICommsStorageService
{
    Task<string> SaveEncryptedAttachmentAsync(string tenantId, string facilityId, Guid attachmentId, byte[] ciphertext, CancellationToken ct = default);
    Task<byte[]?> ReadEncryptedAttachmentAsync(string storagePath, CancellationToken ct = default);
    Task<bool> DeleteAttachmentAsync(string storagePath, CancellationToken ct = default);
}
