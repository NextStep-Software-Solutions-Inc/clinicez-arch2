using System;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Clinic.Infrastructure.Services.Storage;

/// <summary>
/// Generalized S3 storage adapter supporting Cloudflare R2, AWS S3, and private/on-premise S3-compatible
/// object storage servers (e.g. MinIO, Ceph, Wasabi, Garage) for subscriber facilities.
/// </summary>
public class S3ClinicStorageAdapter : IClinicStorageService, IAsyncDisposable
{
    private readonly Lazy<IAmazonS3> _lazyS3Client;
    private readonly string _bucketName;
    private readonly ILogger<S3ClinicStorageAdapter> _logger;

    public S3ClinicStorageAdapter(
        IOptions<S3Options> s3Options,
        IOptions<R2Options>? r2Options,
        ILogger<S3ClinicStorageAdapter> logger)
    {
        _logger = logger;
        var s3 = s3Options?.Value ?? new S3Options();
        var r2 = r2Options?.Value;

        // If S3 options are not configured but legacy R2 options are, map R2 into S3
        var bucket = !string.IsNullOrWhiteSpace(s3.BucketName) ? s3.BucketName : r2?.BucketName ?? string.Empty;
        var accountId = !string.IsNullOrWhiteSpace(s3.AccountId) ? s3.AccountId : r2?.AccountId;
        var accessKeyId = !string.IsNullOrWhiteSpace(s3.AccessKeyId) ? s3.AccessKeyId : r2?.AccessKeyId ?? string.Empty;
        var secretAccessKey = !string.IsNullOrWhiteSpace(s3.SecretAccessKey) ? s3.SecretAccessKey : r2?.SecretAccessKey ?? string.Empty;
        var serviceUrl = s3.ServiceUrl;
        var region = string.IsNullOrWhiteSpace(s3.Region) ? "auto" : s3.Region;
        var forcePathStyle = s3.ForcePathStyle;

        _bucketName = bucket;

        _lazyS3Client = new Lazy<IAmazonS3>(() =>
        {
            var config = new AmazonS3Config
            {
                ForcePathStyle = forcePathStyle,
                Timeout = TimeSpan.FromSeconds(30),
                MaxErrorRetry = 3
            };

            if (!string.IsNullOrWhiteSpace(serviceUrl))
            {
                // Custom private on-premise S3 endpoint (e.g. MinIO: http://minio.local:9000 or https://s3.hospital.internal)
                config.ServiceURL = serviceUrl.TrimEnd('/');
                config.AuthenticationRegion = region;
            }
            else if (!string.IsNullOrWhiteSpace(accountId))
            {
                // Cloudflare R2 default endpoint derived from Account ID
                config.ServiceURL = $"https://{accountId}.r2.cloudflarestorage.com";
                config.AuthenticationRegion = "auto";
            }
            else if (!string.IsNullOrWhiteSpace(region) && !string.Equals(region, "auto", StringComparison.OrdinalIgnoreCase))
            {
                // Standard AWS S3 region endpoint
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(region);
            }
            else
            {
                throw new InvalidOperationException(
                    "S3 storage adapter requires either S3:ServiceUrl (for on-premise servers like MinIO), R2:AccountId (for Cloudflare R2), or S3:Region (for AWS S3).");
            }

            AWSCredentials credentials = (!string.IsNullOrWhiteSpace(accessKeyId) && !string.IsNullOrWhiteSpace(secretAccessKey))
                ? new BasicAWSCredentials(accessKeyId, secretAccessKey)
                : new AnonymousAWSCredentials();

            return new AmazonS3Client(credentials, config);
        });
    }

    /// <summary>
    /// Testing / mock injection constructor.
    /// </summary>
    public S3ClinicStorageAdapter(
        IAmazonS3 s3Client,
        string bucketName,
        ILogger<S3ClinicStorageAdapter> logger)
    {
        _logger = logger;
        _bucketName = bucketName ?? throw new ArgumentNullException(nameof(bucketName));
        _lazyS3Client = new Lazy<IAmazonS3>(() => s3Client);
    }

    protected IAmazonS3 S3Client => _lazyS3Client.Value;
    public string BucketName => _bucketName;

    public async Task<string> SaveEncryptedFileAsync(
        string storageKey,
        byte[] ciphertext,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        ArgumentNullException.ThrowIfNull(ciphertext);

        using var memoryStream = new MemoryStream(ciphertext, writable: false);
        return await SaveEncryptedStreamAsync(storageKey, memoryStream, cancellationToken);
    }

    public async Task<string> SaveEncryptedStreamAsync(
        string storageKey,
        Stream ciphertextStream,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        ArgumentNullException.ThrowIfNull(ciphertextStream);

        var normalizedKey = NormalizeKey(storageKey);
        var request = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = normalizedKey,
            InputStream = ciphertextStream,
            ContentType = "application/octet-stream",
            AutoCloseStream = false,
            // Cloudflare R2 & MinIO streaming compatibility: disable chunked trailer payload signing
            DisablePayloadSigning = true,
            UseChunkEncoding = false,
            DisableDefaultChecksumValidation = true
        };

        request.Metadata.Add("x-amz-meta-encryption", "AES-256-GCM");
        request.Metadata.Add("x-amz-meta-key-scheme", "cmk-v1");

        await S3Client.PutObjectAsync(request, cancellationToken);
        _logger.LogInformation("Saved encrypted object to S3-compatible storage: {Bucket}/{Key}", _bucketName, normalizedKey);
        return normalizedKey;
    }

    public async Task<byte[]> ReadEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        await using var stream = await OpenReadEncryptedStreamAsync(storageKey, cancellationToken);
        using var memoryStream = new MemoryStream();
        await stream.CopyToAsync(memoryStream, cancellationToken);
        return memoryStream.ToArray();
    }

    public async Task<Stream> OpenReadEncryptedStreamAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        var normalizedKey = NormalizeKey(storageKey);

        try
        {
            var request = new GetObjectRequest
            {
                BucketName = _bucketName,
                Key = normalizedKey
            };

            var response = await S3Client.GetObjectAsync(request, cancellationToken);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new FileNotFoundException($"Encrypted record not found in S3 bucket {_bucketName} at key: {normalizedKey}", normalizedKey, ex);
        }
    }

    public async Task DeleteEncryptedFileAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        var normalizedKey = NormalizeKey(storageKey);

        var request = new DeleteObjectRequest
        {
            BucketName = _bucketName,
            Key = normalizedKey
        };

        await S3Client.DeleteObjectAsync(request, cancellationToken);
        _logger.LogInformation("Deleted encrypted object from S3 storage: {Bucket}/{Key}", _bucketName, normalizedKey);
    }

    public async Task<bool> FileExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storageKey);
        var normalizedKey = NormalizeKey(storageKey);

        try
        {
            var request = new GetObjectMetadataRequest
            {
                BucketName = _bucketName,
                Key = normalizedKey
            };

            await S3Client.GetObjectMetadataAsync(request, cancellationToken);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public virtual ValueTask DisposeAsync()
    {
        if (_lazyS3Client.IsValueCreated)
        {
            _lazyS3Client.Value.Dispose();
        }
        return ValueTask.CompletedTask;
    }

    protected static string NormalizeKey(string key) =>
        key.Replace('\\', '/').TrimStart('/');
}
