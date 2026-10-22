using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public interface IClinicStorageService
{
    /// <summary>
    /// Persists encrypted ciphertext bytes to storage and returns the storage URI/key.
    /// </summary>
    Task<string> SaveEncryptedFileAsync(
        string storageKey,
        byte[] ciphertext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Persists encrypted ciphertext stream to storage and returns the storage URI/key.
    /// </summary>
    Task<string> SaveEncryptedStreamAsync(
        string storageKey,
        Stream ciphertextStream,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Reads encrypted ciphertext bytes from storage.
    /// </summary>
    Task<byte[]> ReadEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Opens a read-only stream to the encrypted ciphertext from storage.
    /// </summary>
    Task<Stream> OpenReadEncryptedStreamAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes an encrypted file from storage.
    /// </summary>
    Task DeleteEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks whether an encrypted file exists in storage.
    /// </summary>
    Task<bool> FileExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default);
}
