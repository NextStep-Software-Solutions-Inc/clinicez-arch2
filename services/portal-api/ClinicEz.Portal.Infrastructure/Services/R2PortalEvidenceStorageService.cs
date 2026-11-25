using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security;
using System.Threading;
using System.Threading.Tasks;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Infrastructure.Services;

/// <summary>
/// Persists DOH LTO and write-through cached PRC verification evidence in Cloudflare R2
/// using the portal uploads bucket (default: clinicez-portal-uploads).
/// </summary>
public sealed class R2PortalEvidenceStorageService : IPortalEvidenceStorageService, IDisposable, IAsyncDisposable
{
    public const int MaxFileSizeBytes = 5 * 1024 * 1024;
    private const string FileNameMetadataKey = "file-name";

    private readonly IAmazonS3 _s3Client;
    private readonly bool _ownsClient;
    private readonly string _bucketName;
    private readonly ILogger<R2PortalEvidenceStorageService> _logger;
    private readonly IPortalEvidenceStorageService? _fallbackReadStorage;

    public R2PortalEvidenceStorageService(
        IOptions<R2Options> options,
        ILogger<R2PortalEvidenceStorageService> logger,
        IPortalEvidenceStorageService? fallbackReadStorage = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(logger);

        var opts = options.Value;
        if (!opts.IsConfigured())
        {
            throw new InvalidOperationException(
                "Cloudflare R2 credentials (R2:AccountId, R2:AccessKeyId, R2:SecretAccessKey) are required.");
        }

        var config = new AmazonS3Config
        {
            ServiceURL = $"https://{opts.AccountId.Trim()}.r2.cloudflarestorage.com",
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
            Timeout = TimeSpan.FromSeconds(30),
            MaxErrorRetry = 3,
        };

        _s3Client = new AmazonS3Client(
            new BasicAWSCredentials(opts.AccessKeyId.Trim(), opts.SecretAccessKey.Trim()),
            config);
        _ownsClient = true;
        _bucketName = opts.ResolveBucketName();
        _logger = logger;
        _fallbackReadStorage = fallbackReadStorage;
    }

    public R2PortalEvidenceStorageService(
        IAmazonS3 s3Client,
        string? bucketName,
        ILogger<R2PortalEvidenceStorageService> logger,
        IPortalEvidenceStorageService? fallbackReadStorage = null)
    {
        _s3Client = s3Client ?? throw new ArgumentNullException(nameof(s3Client));
        _ownsClient = false;
        _bucketName = string.IsNullOrWhiteSpace(bucketName)
            ? R2Options.DefaultBucketName
            : bucketName.Trim();
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _fallbackReadStorage = fallbackReadStorage;
    }

    public string BucketName => _bucketName;

    public async Task<string> SaveLtoProofAsync(
        Guid tenantId,
        Guid facilityId,
        string contentType,
        byte[] content,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (content.Length == 0)
            throw new ArgumentException("LTO proof content cannot be empty.", nameof(content));
        if (content.Length > MaxFileSizeBytes)
            throw new ArgumentException($"LTO proof exceeds the maximum size of {MaxFileSizeBytes} bytes.", nameof(content));

        var normalizedContentType = NormalizeSupportedContentType(contentType, out var ext);
        var objectKey = $"verification/lto/{tenantId:D}/{facilityId:D}/{Guid.NewGuid():N}{ext}";

        await PutEvidenceObjectAsync(
            objectKey,
            normalizedContentType,
            Path.GetFileName(objectKey),
            content,
            ct);

        _logger.LogInformation(
            "Stored LTO verification evidence ({Size} bytes) in R2 bucket {Bucket} at {ObjectKey}",
            content.Length,
            _bucketName,
            objectKey);

        return objectKey;
    }

    public async Task<PortalEvidenceFile?> ReadEvidenceAsync(
        string objectKey,
        CancellationToken ct = default)
    {
        string normalizedKey;
        try
        {
            normalizedKey = NormalizeSafeObjectKey(objectKey);
        }
        catch (Exception ex) when (ex is ArgumentException or SecurityException)
        {
            return null;
        }

        try
        {
            using var response = await _s3Client.GetObjectAsync(
                new GetObjectRequest
                {
                    BucketName = _bucketName,
                    Key = normalizedKey,
                },
                ct);

            await using var memoryStream = new MemoryStream();
            await response.ResponseStream.CopyToAsync(memoryStream, ct);
            var bytes = memoryStream.ToArray();
            if (bytes.Length == 0)
            {
                _logger.LogWarning(
                    "Cloudflare R2 returned an empty object in bucket {Bucket} at {ObjectKey}.",
                    _bucketName,
                    normalizedKey);
                return await ReadFromFallbackAsync(normalizedKey, ct);
            }

            var contentType = ResolveReadableContentType(response.Headers?.ContentType, normalizedKey);
            var rawMetaFileName = response.Metadata?[FileNameMetadataKey]
                ?? response.Metadata?[$"x-amz-meta-{FileNameMetadataKey}"];
            var fileName = SanitizeFileName(
                !string.IsNullOrWhiteSpace(rawMetaFileName)
                    ? rawMetaFileName
                    : Path.GetFileName(normalizedKey));

            return new PortalEvidenceFile(bytes, contentType, fileName);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            if (string.Equals(ex.ErrorCode, "NoSuchBucket", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogError(
                    ex,
                    "Cloudflare R2 bucket {Bucket} does not exist while reading {ObjectKey}. Verify PORTAL_R2_BUCKET_NAME / bucket provisioning.",
                    _bucketName,
                    normalizedKey);
            }

            return await ReadFromFallbackAsync(normalizedKey, ct);
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Cloudflare R2 read failed for bucket {Bucket} at {ObjectKey} (HTTP {StatusCode}, ErrorCode {ErrorCode}). Falling back to secondary storage.",
                _bucketName,
                normalizedKey,
                (int)ex.StatusCode,
                ex.ErrorCode ?? "Unknown");

            return await ReadFromFallbackAsync(normalizedKey, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is AmazonClientException or HttpRequestException or IOException or OperationCanceledException)
        {
            _logger.LogWarning(
                ex,
                "Cloudflare R2 transport/IO failure for bucket {Bucket} at {ObjectKey}. Falling back to secondary storage.",
                _bucketName,
                normalizedKey);

            return await ReadFromFallbackAsync(normalizedKey, ct);
        }
    }

    private async Task<PortalEvidenceFile?> ReadFromFallbackAsync(string normalizedKey, CancellationToken ct)
    {
        if (_fallbackReadStorage is null)
            return null;

        try
        {
            return await _fallbackReadStorage.ReadEvidenceAsync(normalizedKey, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Fallback portal evidence storage read failed at {ObjectKey}.",
                normalizedKey);
            return null;
        }
    }

    public async Task SaveCachedEvidenceAsync(
        Guid tenantId,
        Guid facilityId,
        string objectKey,
        string contentType,
        string? fileName,
        byte[] content,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (content.Length == 0)
            throw new ArgumentException("Verification evidence content cannot be empty.", nameof(content));
        if (content.Length > MaxFileSizeBytes)
            throw new ArgumentException($"Verification evidence exceeds the maximum size of {MaxFileSizeBytes} bytes.", nameof(content));

        var normalizedKey = NormalizeSafeObjectKey(objectKey);
        var resolvedContentType = ResolveWritableContentType(contentType, normalizedKey);
        var safeFileName = SanitizeFileName(
            !string.IsNullOrWhiteSpace(fileName) ? fileName : Path.GetFileName(normalizedKey));

        await PutEvidenceObjectAsync(normalizedKey, resolvedContentType, safeFileName, content, ct);

        _logger.LogInformation(
            "Cached verification evidence ({Size} bytes) in R2 bucket {Bucket} at {ObjectKey}",
            content.Length,
            _bucketName,
            normalizedKey);
    }

    private async Task PutEvidenceObjectAsync(
        string objectKey,
        string contentType,
        string fileName,
        byte[] content,
        CancellationToken ct)
    {
        using var stream = new MemoryStream(content, writable: false);
        var request = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = objectKey,
            InputStream = stream,
            ContentType = contentType,
            AutoCloseStream = false,
            // Required for Cloudflare R2 S3-compatible PutObject requests.
            DisablePayloadSigning = true,
            UseChunkEncoding = false,
            DisableDefaultChecksumValidation = true,
        };
        request.Metadata[FileNameMetadataKey] = SanitizeFileName(fileName);

        await _s3Client.PutObjectAsync(request, ct);
    }

    public void Dispose()
    {
        if (_ownsClient)
        {
            _s3Client.Dispose();
        }
    }

    public ValueTask DisposeAsync()
    {
        Dispose();
        return ValueTask.CompletedTask;
    }

    private static string NormalizeSupportedContentType(string? contentType, out string extension)
    {
        var baseType = (contentType ?? string.Empty).Split(';', 2)[0].Trim().ToLowerInvariant();
        if (baseType == "image/jpg")
            baseType = "image/jpeg";
        extension = baseType switch
        {
            "application/pdf" => ".pdf",
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            _ => throw new ArgumentException($"Unsupported LTO proof content type '{contentType}'.", nameof(contentType))
        };
        return baseType;
    }

    private static string NormalizeSafeObjectKey(string? objectKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(objectKey);

        var trimmed = objectKey.Trim();
        string unescaped;
        try
        {
            unescaped = Uri.UnescapeDataString(trimmed);
        }
        catch (UriFormatException)
        {
            throw new SecurityException($"Invalid verification evidence object key '{objectKey}'.");
        }

        if (trimmed.Contains("..", StringComparison.Ordinal) ||
            unescaped.Contains("..", StringComparison.Ordinal) ||
            trimmed.Contains("%2e", StringComparison.OrdinalIgnoreCase) ||
            unescaped.Contains("%2e", StringComparison.OrdinalIgnoreCase) ||
            trimmed.Contains("%00", StringComparison.OrdinalIgnoreCase) ||
            unescaped.Contains('\0'))
        {
            throw new SecurityException($"Storage path traversal attempt detected for key '{objectKey}'.");
        }

        var normalized = unescaped.Replace('\\', '/').Trim().TrimStart('/');
        if (string.IsNullOrWhiteSpace(normalized))
            throw new SecurityException($"Invalid verification evidence object key '{objectKey}'.");

        foreach (var segment in normalized.Split('/'))
        {
            if (segment is "." or "..")
                throw new SecurityException($"Storage path traversal attempt detected for key '{objectKey}'.");
        }

        return normalized;
    }

    private static string ResolveWritableContentType(string? contentType, string objectKey)
    {
        var normalized = (contentType ?? string.Empty).Split(';', 2)[0].Trim().ToLowerInvariant();
        if (normalized == "image/jpg")
            return "image/jpeg";
        if (normalized is "application/pdf" or "image/jpeg" or "image/png")
            return normalized;

        return !string.IsNullOrWhiteSpace(normalized)
            ? normalized
            : InferContentTypeFromKey(objectKey);
    }

    private static string ResolveReadableContentType(string? headerContentType, string objectKey)
        => VerificationEvidenceResolver.NormalizeContentType(headerContentType, objectKey);

    private static string InferContentTypeFromKey(string objectKey)
    {
        var ext = Path.GetExtension(objectKey).ToLowerInvariant();
        return ext switch
        {
            ".pdf" => "application/pdf",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            _ => "application/octet-stream"
        };
    }

    private static string SanitizeFileName(string? name)
        => VerificationEvidenceResolver.SanitizeFileName(name, null);
}
