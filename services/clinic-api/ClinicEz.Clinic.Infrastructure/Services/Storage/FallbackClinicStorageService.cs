using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services.Storage;

public sealed class FallbackClinicStorageService : IClinicStorageService
{
    private readonly IClinicStorageService _primary;
    private readonly IClinicStorageService _fallback;
    private readonly ILogger<FallbackClinicStorageService> _logger;

    public FallbackClinicStorageService(
        IClinicStorageService primary,
        IClinicStorageService fallback,
        ILogger<FallbackClinicStorageService> logger)
    {
        _primary = primary ?? throw new ArgumentNullException(nameof(primary));
        _fallback = fallback ?? throw new ArgumentNullException(nameof(fallback));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task<string> SaveEncryptedFileAsync(
        string storageKey,
        byte[] ciphertext,
        CancellationToken cancellationToken = default)
    {
        // Writes ALWAYS go to primary (R2)
        return _primary.SaveEncryptedFileAsync(storageKey, ciphertext, cancellationToken);
    }

    public Task<string> SaveEncryptedStreamAsync(
        string storageKey,
        Stream ciphertextStream,
        CancellationToken cancellationToken = default)
    {
        // Writes ALWAYS go to primary (R2)
        return _primary.SaveEncryptedStreamAsync(storageKey, ciphertextStream, cancellationToken);
    }

    public async Task<byte[]> ReadEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await _primary.ReadEncryptedFileAsync(storageKey, cancellationToken);
        }
        catch (FileNotFoundException)
        {
            _logger.LogWarning("Record {Key} not found in primary storage; attempting fallback storage read.", storageKey);
            return await _fallback.ReadEncryptedFileAsync(storageKey, cancellationToken);
        }
    }

    public async Task<Stream> OpenReadEncryptedStreamAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await _primary.OpenReadEncryptedStreamAsync(storageKey, cancellationToken);
        }
        catch (FileNotFoundException)
        {
            _logger.LogWarning("Record stream {Key} not found in primary storage; attempting fallback storage read.", storageKey);
            return await _fallback.OpenReadEncryptedStreamAsync(storageKey, cancellationToken);
        }
    }

    public async Task DeleteEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        await _primary.DeleteEncryptedFileAsync(storageKey, cancellationToken);
        if (await _fallback.FileExistsAsync(storageKey, cancellationToken))
        {
            await _fallback.DeleteEncryptedFileAsync(storageKey, cancellationToken);
        }
    }

    public async Task<bool> FileExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        if (await _primary.FileExistsAsync(storageKey, cancellationToken))
        {
            return true;
        }

        return await _fallback.FileExistsAsync(storageKey, cancellationToken);
    }
}
