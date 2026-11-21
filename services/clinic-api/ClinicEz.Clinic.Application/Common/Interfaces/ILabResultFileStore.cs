using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>Keeps the file behind a <see cref="LabResult"/> encrypted in clinic storage; rows only hold the key and the crypto metadata.</summary>
public interface ILabResultFileStore
{
    /// <summary>Encrypts and stores <paramref name="content"/> and fills the result's storage, size and encryption fields (size is the plaintext size).</summary>
    Task StoreAsync(LabResult result, byte[] content, CancellationToken ct);

    /// <summary>The decrypted file, or null when the result has no stored file.</summary>
    Task<byte[]?> ReadAsync(LabResult result, CancellationToken ct);
}
