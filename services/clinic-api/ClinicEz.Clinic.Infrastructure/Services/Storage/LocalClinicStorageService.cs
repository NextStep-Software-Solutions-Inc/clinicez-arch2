using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services.Storage;

public sealed class LocalClinicStorageService : IClinicStorageService
{
    private readonly string _storageRoot;
    private readonly ILogger<LocalClinicStorageService> _logger;

    public LocalClinicStorageService(IConfiguration? configuration, ILogger<LocalClinicStorageService> logger)
    {
        _logger = logger;
        var configuredPath = configuration?["Storage:BasePath"];
        _storageRoot = !string.IsNullOrWhiteSpace(configuredPath)
            ? Path.GetFullPath(configuredPath)
            : Path.Combine(AppContext.BaseDirectory, "Storage", "Records");

        Directory.CreateDirectory(_storageRoot);
    }

    public async Task<string> SaveEncryptedFileAsync(
        string storageKey,
        byte[] ciphertext,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        ArgumentNullException.ThrowIfNull(ciphertext);

        var safeRelativePath = storageKey.Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.Combine(_storageRoot, safeRelativePath);
        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        await File.WriteAllBytesAsync(fullPath, ciphertext, cancellationToken);
        _logger.LogInformation("Saved encrypted record ({Size} bytes) to {Key}", ciphertext.Length, storageKey);
        return storageKey;
    }

    public async Task<string> SaveEncryptedStreamAsync(
        string storageKey,
        Stream ciphertextStream,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        ArgumentNullException.ThrowIfNull(ciphertextStream);

        var safeRelativePath = storageKey.Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.Combine(_storageRoot, safeRelativePath);
        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        await using var fileStream = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true);
        await ciphertextStream.CopyToAsync(fileStream, cancellationToken);
        _logger.LogInformation("Saved encrypted record stream to {Key}", storageKey);
        return storageKey;
    }

    public async Task<byte[]> ReadEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);

        var safeRelativePath = storageKey.Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.Combine(_storageRoot, safeRelativePath);
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"Encrypted record not found at storage key: {storageKey}", fullPath);
        }

        return await File.ReadAllBytesAsync(fullPath, cancellationToken);
    }

    public Task<Stream> OpenReadEncryptedStreamAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);

        var safeRelativePath = storageKey.Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.Combine(_storageRoot, safeRelativePath);
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"Encrypted record not found at storage key: {storageKey}", fullPath);
        }

        Stream stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        return Task.FromResult(stream);
    }

    public Task DeleteEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);

        var safeRelativePath = storageKey.Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.Combine(_storageRoot, safeRelativePath);
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
            _logger.LogInformation("Deleted encrypted record at {Key}", storageKey);
        }

        return Task.CompletedTask;
    }

    public Task<bool> FileExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);

        var safeRelativePath = storageKey.Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.Combine(_storageRoot, safeRelativePath);
        return Task.FromResult(File.Exists(fullPath));
    }
}
