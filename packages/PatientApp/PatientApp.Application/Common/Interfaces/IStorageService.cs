namespace PatientApp.Application.Common.Interfaces;

public interface IStorageService
{
    /// <summary>Uploads a stream to Cloudflare R2 and returns the storage key.</summary>
    Task<string> UploadAsync(Stream stream, string key, string contentType, CancellationToken cancellationToken = default);

    /// <summary>Deletes an object from R2 by its storage key.</summary>
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>Returns the public CDN URL for a stored object.</summary>
    string GetPublicUrl(string key);
}
