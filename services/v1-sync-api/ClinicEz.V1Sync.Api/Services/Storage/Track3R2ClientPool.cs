using System;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.V1Sync.Api.Services.Storage;

public sealed class Track3R2ClientPool : IDisposable
{
    private readonly Track3StorageOptions _options;
    private readonly ILogger<Track3R2ClientPool> _logger;
    private readonly SyncRuntimeSettingsService? _runtimeSettings;
    private readonly Lazy<IAmazonS3?> _clinicClient;
    private readonly Lazy<IAmazonS3?> _patientClient;
    private readonly bool _hasClinicCredentials;
    private readonly bool _hasPatientCredentials;
    private readonly bool _clinicDisablePayloadSigning;
    private readonly bool _patientDisablePayloadSigning;
    private readonly string _clinicBucket;
    private readonly string _patientBucket;

    public Track3R2ClientPool(
        IOptions<Track3StorageOptions> options,
        ILogger<Track3R2ClientPool> logger,
        SyncRuntimeSettingsService? runtimeSettings = null)
    {
        _options = options.Value;
        _logger = logger;
        _runtimeSettings = runtimeSettings;
        _hasClinicCredentials = HasBucketCredentials(_options.ClinicR2);
        _hasPatientCredentials = HasBucketCredentials(_options.PatientR2);
        _clinicBucket = _options.ClinicR2.BucketName?.Trim() ?? string.Empty;
        _patientBucket = _options.PatientR2.BucketName?.Trim() ?? string.Empty;

        var clinicServiceUrl = _hasClinicCredentials ? ResolveServiceUrl(_options.ClinicR2) : null;
        var patientServiceUrl = _hasPatientCredentials ? ResolveServiceUrl(_options.PatientR2) : null;
        _clinicDisablePayloadSigning = IsHttpsEndpoint(clinicServiceUrl);
        _patientDisablePayloadSigning = IsHttpsEndpoint(patientServiceUrl);

        _clinicClient = new Lazy<IAmazonS3?>(() =>
            _hasClinicCredentials ? BuildClient(_options.ClinicR2, clinicServiceUrl!) : null);
        _patientClient = new Lazy<IAmazonS3?>(() =>
            _hasPatientCredentials ? BuildClient(_options.PatientR2, patientServiceUrl!) : null);
    }

    // Testability constructor allowing independent IAmazonS3 clients/mocks per plane
    public Track3R2ClientPool(
        IAmazonS3? clinicClient,
        string clinicBucket,
        IAmazonS3? patientClient,
        string patientBucket,
        ILogger<Track3R2ClientPool> logger)
    {
        _options = new Track3StorageOptions { Enabled = true };
        _logger = logger;
        _runtimeSettings = null;
        _clinicBucket = clinicBucket?.Trim() ?? string.Empty;
        _patientBucket = patientBucket?.Trim() ?? string.Empty;
        _hasClinicCredentials = clinicClient is not null && !string.IsNullOrWhiteSpace(_clinicBucket);
        _hasPatientCredentials = patientClient is not null && !string.IsNullOrWhiteSpace(_patientBucket);
        _clinicDisablePayloadSigning = ShouldDisablePayloadSigning(clinicClient);
        _patientDisablePayloadSigning = ShouldDisablePayloadSigning(patientClient);
        _clinicClient = new Lazy<IAmazonS3?>(() => clinicClient);
        _patientClient = new Lazy<IAmazonS3?>(() => patientClient);
    }

    private bool IsStorageEnabled => _runtimeSettings?.Current.StorageEnabled ?? _options.Enabled;

    public bool HasClinicCredentials => _hasClinicCredentials;
    public bool HasPatientCredentials => _hasPatientCredentials;
    public bool IsClinicConfigured => IsStorageEnabled && _hasClinicCredentials;
    public bool IsPatientConfigured => IsStorageEnabled && _hasPatientCredentials;
    public bool IsClinicPayloadSigningDisabled => _clinicDisablePayloadSigning;
    public bool IsPatientPayloadSigningDisabled => _patientDisablePayloadSigning;
    public string ClinicBucketName => _clinicBucket;
    public string PatientBucketName => _patientBucket;

    public async Task<string> PutEncryptedAsync(
        bool isClinic,
        string key,
        byte[] ciphertext,
        string keyScheme,
        CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ArgumentNullException.ThrowIfNull(ciphertext);
        ArgumentException.ThrowIfNullOrWhiteSpace(keyScheme);

        var (client, bucket) = RequireClient(isClinic);
        var normalizedKey = NormalizeKey(key);
        var disablePayloadSigning = isClinic ? _clinicDisablePayloadSigning : _patientDisablePayloadSigning;

        using var ms = new MemoryStream(ciphertext, writable: false);
        var request = new PutObjectRequest
        {
            BucketName = bucket,
            Key = normalizedKey,
            InputStream = ms,
            ContentType = "application/octet-stream",
            AutoCloseStream = false,
            DisablePayloadSigning = disablePayloadSigning,
            UseChunkEncoding = false,
            DisableDefaultChecksumValidation = true
        };
        request.Metadata.Add("x-amz-meta-encryption", "AES-256-GCM");
        request.Metadata.Add("x-amz-meta-key-scheme", keyScheme);

        using var putCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        putCts.CancelAfter(TimeSpan.FromSeconds(20));
        try
        {
            await client.PutObjectAsync(request, putCts.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException("Cloud storage upload timed out.");
        }
        return normalizedKey;
    }

    public async Task<long?> HeadObjectLengthAsync(bool isClinic, string key, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        var (client, bucket) = RequireClient(isClinic);
        var normalizedKey = NormalizeKey(key);

        try
        {
            using var headCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            headCts.CancelAfter(TimeSpan.FromSeconds(15));
            var resp = await client.GetObjectMetadataAsync(new GetObjectMetadataRequest
            {
                BucketName = bucket,
                Key = normalizedKey
            }, headCts.Token);
            return resp.ContentLength;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException("Cloud storage metadata check timed out.");
        }
    }

    public async Task<byte[]> GetObjectBytesAsync(bool isClinic, string key, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        var (client, bucket) = RequireClient(isClinic);
        var normalizedKey = NormalizeKey(key);

        using var getCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        getCts.CancelAfter(TimeSpan.FromSeconds(20));
        try
        {
            using var resp = await client.GetObjectAsync(new GetObjectRequest
            {
                BucketName = bucket,
                Key = normalizedKey
            }, getCts.Token);

            using var ms = new MemoryStream();
            await resp.ResponseStream.CopyToAsync(ms, getCts.Token);
            return ms.ToArray();
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException("Cloud storage read timed out.");
        }
    }

    public async Task<(bool ClinicR2Ok, bool PatientR2Ok)> ProbeHealthAsync(CancellationToken ct = default)
    {
        var clinicOk = IsClinicConfigured && await ProbeBucketAsync(_clinicClient.Value, _clinicBucket, "ClinicR2", ct);
        var patientOk = IsPatientConfigured && await ProbeBucketAsync(_patientClient.Value, _patientBucket, "PatientR2", ct);
        return (clinicOk, patientOk);
    }

    private async Task<bool> ProbeBucketAsync(IAmazonS3? client, string bucket, string label, CancellationToken ct)
    {
        if (client is null || string.IsNullOrWhiteSpace(bucket)) return false;

        try
        {
            using var probeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            probeCts.CancelAfter(TimeSpan.FromSeconds(3));
            await client.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = bucket,
                MaxKeys = 1
            }, probeCts.Token);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "{Label} bucket health probe failed for bucket {Bucket}.", label, bucket);
            return false;
        }
    }

    private (IAmazonS3 Client, string Bucket) RequireClient(bool isClinic)
    {
        if (!IsStorageEnabled)
        {
            throw new InvalidOperationException("File storage migration is currently disabled in Migration Settings.");
        }
        var client = isClinic ? _clinicClient.Value : _patientClient.Value;
        var bucket = isClinic ? _clinicBucket : _patientBucket;
        if (client is null || string.IsNullOrWhiteSpace(bucket))
        {
            throw new InvalidOperationException(
                isClinic
                    ? "Track3Storage:ClinicR2 is not configured."
                    : "Track3Storage:PatientR2 is not configured.");
        }
        return (client, bucket);
    }

    private static bool HasBucketCredentials(Track3BucketOptions opts) =>
        !string.IsNullOrWhiteSpace(opts.BucketName) &&
        !string.IsNullOrWhiteSpace(opts.AccessKeyId) &&
        !string.IsNullOrWhiteSpace(opts.SecretAccessKey) &&
        (!string.IsNullOrWhiteSpace(opts.ServiceUrl) || !string.IsNullOrWhiteSpace(opts.AccountId));

    private static string ResolveServiceUrl(Track3BucketOptions opts) =>
        !string.IsNullOrWhiteSpace(opts.ServiceUrl)
            ? opts.ServiceUrl.Trim().TrimEnd('/')
            : $"https://{opts.AccountId!.Trim()}.r2.cloudflarestorage.com";

    private static bool IsHttpsEndpoint(string? serviceUrl) =>
        Uri.TryCreate(serviceUrl?.Trim(), UriKind.Absolute, out var uri) &&
        string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);

    private static bool ShouldDisablePayloadSigning(IAmazonS3? client)
    {
        if (client is AmazonS3Client s3Client)
        {
            if (!string.IsNullOrWhiteSpace(s3Client.Config.ServiceURL))
            {
                return IsHttpsEndpoint(s3Client.Config.ServiceURL);
            }

            return !s3Client.Config.UseHttp;
        }

        // Preserve mock/DispatchProxy behavior (e.g. InMemoryAmazonS3) without invoking unimplemented IAmazonS3.Config.
        return true;
    }

    private static IAmazonS3 BuildClient(Track3BucketOptions opts, string serviceUrl)
    {
        var region = string.IsNullOrWhiteSpace(opts.Region) ? "auto" : opts.Region.Trim();
        var cfg = new AmazonS3Config
        {
            ForcePathStyle = opts.ForcePathStyle,
            Timeout = TimeSpan.FromSeconds(15),
            MaxErrorRetry = 1,
            ServiceURL = serviceUrl,
            AuthenticationRegion = region
        };

        return new AmazonS3Client(new BasicAWSCredentials(opts.AccessKeyId, opts.SecretAccessKey), cfg);
    }

    private static string NormalizeKey(string key) => key.Replace('\\', '/').TrimStart('/');

    public void Dispose()
    {
        if (_clinicClient.IsValueCreated)
        {
            _clinicClient.Value?.Dispose();
        }
        if (_patientClient.IsValueCreated)
        {
            _patientClient.Value?.Dispose();
        }
    }
}
