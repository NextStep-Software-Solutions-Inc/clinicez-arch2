namespace ClinicEz.Patient.Application.Common.Interfaces;

public interface IStorageService
{
    /// <summary>Uploads a stream to Cloudflare R2 and returns the storage key.</summary>
    Task<string> UploadAsync(Stream stream, string key, string contentType, CancellationToken cancellationToken = default);

    /// <summary>Persists encrypted ciphertext bytes directly to R2 with encryption metadata headers.</summary>
    Task<string> SaveEncryptedAsync(string key, byte[] ciphertext, CancellationToken cancellationToken = default);

    /// <summary>Persists an encrypted ciphertext stream directly to R2 with encryption metadata headers.</summary>
    Task<string> SaveEncryptedStreamAsync(string key, Stream ciphertextStream, CancellationToken cancellationToken = default);

    /// <summary>Reads raw bytes of an object from R2 by its key.</summary>
    Task<byte[]> DownloadAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>Opens a read-only stream to an object in R2 by its key.</summary>
    Task<Stream> OpenReadStreamAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>Deletes an object from R2 by its storage key.</summary>
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>Returns the public CDN URL for a stored object.</summary>
    string GetPublicUrl(string key);

    /// <summary>Generates a pre-signed URL for a client to upload a file directly to R2.</summary>
    Task<string> GeneratePresignedUploadUrlAsync(string key, string contentType, TimeSpan expiresIn, CancellationToken cancellationToken = default);

    /// <summary>Generates a pre-signed URL for a client to download a file securely from R2.</summary>
    Task<string> GeneratePresignedDownloadUrlAsync(string key, TimeSpan expiresIn, CancellationToken cancellationToken = default);

    /// <summary>Checks if an object exists in R2.</summary>
    Task<bool> ObjectExistsAsync(string key, CancellationToken cancellationToken = default);
}
