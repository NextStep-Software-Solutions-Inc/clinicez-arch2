using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.V1Sync.Api.Models;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.V1Sync.Api.Services.Storage;

public sealed record UrlClassification(
    string Provider,
    bool IsMigratable,
    string? SkipStatus,
    string? ErrorCode,
    string? ErrorMessage
);

public sealed record BlobDownloadResult(
    bool Success,
    string Provider,
    byte[]? Bytes,
    string? ContentType,
    string? SourceSha256,
    long SourceSizeBytes,
    string? FailureStatus,
    string? ErrorCode,
    string? ErrorMessage
);

public sealed record BlobProbeResult(
    bool Reachable,
    string Provider,
    long ContentLength,
    string? Status,
    string? ErrorCode,
    string? ErrorMessage
);

/// <summary>
/// Strictly read-only Azure Blob #1 (clinicezstorage.blob.core.windows.net) downloader.
/// Does NOT implement a Google Drive download adapter; classifies Google Drive, Azure Blob #2,
/// and non-allowlisted URLs directly as SKIPPED_LEGACY_UNSUPPORTED without network I/O.
/// </summary>
public sealed class LegacyBlobSourceDownloader
{
    public const string HttpClientName = "Track3BlobDownloader";
    private const string AzureBlob1Host = "clinicezstorage.blob.core.windows.net";
    private const string AzureBlob2Host = "clinicez.blob.core.windows.net";

    private readonly IHttpClientFactory? _httpClientFactory;
    private readonly HttpClient? _directHttpClient;
    private readonly Track3StorageOptions _options;
    private readonly ILogger<LegacyBlobSourceDownloader> _logger;
    private readonly IHostEnvironment? _hostEnvironment;
    private readonly SyncRuntimeSettingsService? _runtimeSettings;

    [ActivatorUtilitiesConstructor]
    public LegacyBlobSourceDownloader(
        IHttpClientFactory httpClientFactory,
        IOptions<Track3StorageOptions> options,
        ILogger<LegacyBlobSourceDownloader> logger,
        IHostEnvironment? hostEnvironment = null,
        SyncRuntimeSettingsService? runtimeSettings = null)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
        _hostEnvironment = hostEnvironment;
        _runtimeSettings = runtimeSettings;
    }

    // Testability constructor allowing direct mock HttpClient injection
    public LegacyBlobSourceDownloader(
        HttpClient httpClient,
        IOptions<Track3StorageOptions> options,
        ILogger<LegacyBlobSourceDownloader> logger,
        IHostEnvironment? hostEnvironment = null,
        SyncRuntimeSettingsService? runtimeSettings = null)
    {
        _directHttpClient = httpClient;
        _options = options.Value;
        _logger = logger;
        _hostEnvironment = hostEnvironment;
        _runtimeSettings = runtimeSettings;
    }

    private bool IsAzureBlob1Enabled => _runtimeSettings?.Current.AzureBlob1Enabled ?? _options.AzureBlob1Enabled;
    private long EffectiveMaxFileSizeBytes => _runtimeSettings?.Current.StorageMaxFileSizeBytes ?? _options.MaxFileSizeBytes;

    public static UrlClassification ClassifyUrl(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl) ||
            !Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out var uri) ||
            !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !uri.IsDefaultPort)
        {
            return new UrlClassification(
                SyncStorageProvider.Other,
                IsMigratable: false,
                SkipStatus: SyncStorageStatus.SkippedLegacyUnsupported,
                ErrorCode: "INVALID_URL",
                ErrorMessage: "Source URL is missing, not HTTPS, or uses non-standard port/credentials.");
        }

        var host = uri.Host.Trim().ToLowerInvariant();
        if (host == AzureBlob1Host)
        {
            return new UrlClassification(
                SyncStorageProvider.AzureBlob1,
                IsMigratable: true,
                SkipStatus: null,
                ErrorCode: null,
                ErrorMessage: null);
        }

        if (host == AzureBlob2Host)
        {
            return new UrlClassification(
                SyncStorageProvider.AzureBlob2,
                IsMigratable: false,
                SkipStatus: SyncStorageStatus.SkippedLegacyUnsupported,
                ErrorCode: "AZURE_BLOB_2_DECOMMISSIONED",
                ErrorMessage: "Decommissioned legacy storage account kept as-is.");
        }

        if (host is "drive.google.com" or "docs.google.com" or "lh3.googleusercontent.com")
        {
            return new UrlClassification(
                SyncStorageProvider.GoogleDrive,
                IsMigratable: false,
                SkipStatus: SyncStorageStatus.SkippedLegacyUnsupported,
                ErrorCode: "GOOGLE_DRIVE_UNSUPPORTED",
                ErrorMessage: "External Google Drive link kept as-is.");
        }

        return new UrlClassification(
            SyncStorageProvider.Other,
            IsMigratable: false,
            SkipStatus: SyncStorageStatus.SkippedLegacyUnsupported,
            ErrorCode: "UNSUPPORTED_HOST",
            ErrorMessage: "External host is not in the Azure Blob #1 allowlist.");
    }

    public async Task<BlobDownloadResult> DownloadAsync(
        string sourceUrl,
        string? fallbackContentType,
        CancellationToken ct = default)
    {
        var cls = ClassifyUrl(sourceUrl);
        if (!cls.IsMigratable)
        {
            return new BlobDownloadResult(
                Success: false,
                Provider: cls.Provider,
                Bytes: null,
                ContentType: null,
                SourceSha256: null,
                SourceSizeBytes: 0,
                FailureStatus: cls.SkipStatus,
                ErrorCode: cls.ErrorCode,
                ErrorMessage: cls.ErrorMessage);
        }

        if (!IsAzureBlob1Enabled)
        {
            return new BlobDownloadResult(
                Success: false,
                Provider: cls.Provider,
                Bytes: null,
                ContentType: null,
                SourceSha256: null,
                SourceSizeBytes: 0,
                FailureStatus: SyncStorageStatus.SkippedLegacyUnsupported,
                ErrorCode: "AZURE_BLOB_1_DISABLED",
                ErrorMessage: "Azure Blob #1 migration is disabled.");
        }

        var requestUri = BuildOutboundRequestUri(sourceUrl);
        var client = GetHttpClient();
        var maxBytes = Math.Max(1024L, EffectiveMaxFileSizeBytes);
        var retryDelays = new[] { TimeSpan.FromMilliseconds(250), TimeSpan.FromMilliseconds(1000) };

        for (var attempt = 0; attempt <= retryDelays.Length; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                using var response = await SendFollowingSafeRedirectsAsync(
                    client,
                    HttpMethod.Get,
                    requestUri,
                    addRangeZero: false,
                    ct);

                var status = response.StatusCode;
                if (IsRedirectStatus(status))
                {
                    return Fail(cls.Provider, SyncStorageStatus.SkippedAuthRequired, "AUTH_REDIRECT", "Source redirected to external or sign-in URL.");
                }

                if (status is HttpStatusCode.NotFound or HttpStatusCode.Gone)
                {
                    return Fail(cls.Provider, SyncStorageStatus.SkippedDeadLink, $"HTTP_{(int)status}", $"Source returned HTTP {(int)status}.");
                }

                if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                {
                    return Fail(cls.Provider, SyncStorageStatus.SkippedAuthRequired, $"HTTP_{(int)status}", $"Source requires authorization (HTTP {(int)status}).");
                }

                if (status == HttpStatusCode.TooManyRequests || (int)status >= 500)
                {
                    if (attempt < retryDelays.Length)
                    {
                        await Task.Delay(retryDelays[attempt], ct);
                        continue;
                    }
                    var code = status == HttpStatusCode.TooManyRequests ? "HTTP_429" : "HTTP_5XX";
                    return Fail(cls.Provider, SyncStorageStatus.FailedRetryable, code, $"Source returned transient HTTP {(int)status}.");
                }

                if (!response.IsSuccessStatusCode)
                {
                    return Fail(cls.Provider, SyncStorageStatus.FailedPermanent, $"HTTP_{(int)status}", $"Source returned non-retryable HTTP {(int)status}.");
                }

                var declaredLength = response.Content.Headers.ContentLength;
                if (declaredLength == 0)
                {
                    return Fail(cls.Provider, SyncStorageStatus.SkippedEmptyBlob, "EMPTY_BLOB", "Source object has zero bytes.");
                }

                if (declaredLength.HasValue && declaredLength.Value > maxBytes)
                {
                    return Fail(cls.Provider, SyncStorageStatus.FailedPermanent, "SIZE_EXCEEDED", $"Source object exceeds max allowed size ({maxBytes} bytes).");
                }

                var mediaType = response.Content.Headers.ContentType?.MediaType?.Trim();
                if (IsHtmlContentType(mediaType))
                {
                    return Fail(cls.Provider, SyncStorageStatus.SkippedAuthRequired, "HTML_INTERSTITIAL", "Source returned an HTML sign-in or error page.");
                }

                await using var stream = await response.Content.ReadAsStreamAsync(ct);
                var initialCapacity = declaredLength is > 0 && declaredLength.Value <= maxBytes
                    ? (int)declaredLength.Value
                    : 8192;
                using var ms = new MemoryStream(initialCapacity);
                var buffer = new byte[81920];
                long totalRead = 0;

                while (true)
                {
                    var read = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), ct);
                    if (read == 0) break;

                    totalRead += read;
                    if (totalRead > maxBytes)
                    {
                        return Fail(cls.Provider, SyncStorageStatus.FailedPermanent, "SIZE_EXCEEDED", $"Source stream exceeded max allowed size ({maxBytes} bytes).");
                    }

                    ms.Write(buffer, 0, read);
                }

                if (totalRead == 0)
                {
                    return Fail(cls.Provider, SyncStorageStatus.SkippedEmptyBlob, "EMPTY_BLOB", "Source stream returned zero bytes.");
                }

                var bytes = ms.TryGetBuffer(out var seg) &&
                            seg.Offset == 0 &&
                            seg.Array is not null &&
                            seg.Count == seg.Array.Length
                    ? seg.Array
                    : ms.ToArray();
                if (LooksLikeHtmlDocument(bytes))
                {
                    return Fail(cls.Provider, SyncStorageStatus.SkippedAuthRequired, "HTML_INTERSTITIAL", "Source payload is an HTML interstitial page.");
                }

                var sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
                var resolvedContentType = ResolveContentType(mediaType, fallbackContentType);

                return new BlobDownloadResult(
                    Success: true,
                    Provider: cls.Provider,
                    Bytes: bytes,
                    ContentType: resolvedContentType,
                    SourceSha256: sha256,
                    SourceSizeBytes: bytes.LongLength,
                    FailureStatus: null,
                    ErrorCode: null,
                    ErrorMessage: null);
            }
            catch (HttpRequestException ex) when (IsDnsHostNotFound(ex))
            {
                return Fail(cls.Provider, SyncStorageStatus.SkippedDeadLink, "DNS_NXDOMAIN", "Source host could not be resolved (NXDOMAIN).");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(
                    "Transient HTTP failure downloading Azure Blob #1 source (attempt {Attempt}, exception {ExceptionType}, status {StatusCode}).",
                    attempt + 1,
                    ex.GetType().Name,
                    ex.StatusCode.HasValue ? (int)ex.StatusCode.Value : 0);
                if (attempt < retryDelays.Length)
                {
                    await Task.Delay(retryDelays[attempt], ct);
                    continue;
                }
                return Fail(cls.Provider, SyncStorageStatus.FailedRetryable, "HTTP_REQUEST_ERROR", "Transient network error while downloading source object.");
            }
            catch (IOException ex)
            {
                _logger.LogWarning(
                    "Transient stream I/O failure downloading Azure Blob #1 source (attempt {Attempt}, exception {ExceptionType}).",
                    attempt + 1,
                    ex.GetType().Name);
                if (attempt < retryDelays.Length)
                {
                    await Task.Delay(retryDelays[attempt], ct);
                    continue;
                }
                return Fail(cls.Provider, SyncStorageStatus.FailedRetryable, "STREAM_READ_ERROR", "Transient stream read error while downloading source object.");
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                if (attempt < retryDelays.Length)
                {
                    await Task.Delay(retryDelays[attempt], ct);
                    continue;
                }
                return Fail(cls.Provider, SyncStorageStatus.FailedRetryable, "TIMEOUT", "Timed out waiting for source storage response.");
            }
        }

        return Fail(cls.Provider, SyncStorageStatus.FailedRetryable, "RETRY_EXHAUSTED", "Retries exhausted downloading source object.");
    }

    public async Task<BlobProbeResult> ProbeReachableAsync(string sourceUrl, CancellationToken ct = default)
    {
        var cls = ClassifyUrl(sourceUrl);
        if (!cls.IsMigratable)
        {
            return new BlobProbeResult(false, cls.Provider, 0, cls.SkipStatus, cls.ErrorCode, cls.ErrorMessage);
        }

        if (!IsAzureBlob1Enabled)
        {
            return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.SkippedLegacyUnsupported, "AZURE_BLOB_1_DISABLED", "Azure Blob #1 migration is disabled.");
        }

        var requestUri = BuildOutboundRequestUri(sourceUrl);
        var client = GetHttpClient();

        try
        {
            using var headResp = await SendFollowingSafeRedirectsAsync(client, HttpMethod.Head, requestUri, addRangeZero: false, ct);
            var response = headResp;
            HttpResponseMessage? rangeResp = null;

            try
            {
                if (headResp.StatusCode == HttpStatusCode.MethodNotAllowed)
                {
                    rangeResp = await SendFollowingSafeRedirectsAsync(client, HttpMethod.Get, requestUri, addRangeZero: true, ct);
                    response = rangeResp;
                }

                if (IsRedirectStatus(response.StatusCode))
                {
                    return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.SkippedAuthRequired, "AUTH_REDIRECT", "Source redirected to external or sign-in URL.");
                }

                if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
                {
                    return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.SkippedDeadLink, $"HTTP_{(int)response.StatusCode}", $"Source returned HTTP {(int)response.StatusCode}.");
                }

                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                {
                    return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.SkippedAuthRequired, $"HTTP_{(int)response.StatusCode}", $"Source requires authorization (HTTP {(int)response.StatusCode}).");
                }

                if (!response.IsSuccessStatusCode)
                {
                    var failStatus = (response.StatusCode == HttpStatusCode.TooManyRequests || (int)response.StatusCode >= 500)
                        ? SyncStorageStatus.FailedRetryable
                        : SyncStorageStatus.FailedPermanent;
                    return new BlobProbeResult(false, cls.Provider, 0, failStatus, $"HTTP_{(int)response.StatusCode}", $"Source returned HTTP {(int)response.StatusCode}.");
                }

                var mediaType = response.Content.Headers.ContentType?.MediaType?.Trim();
                if (IsHtmlContentType(mediaType))
                {
                    return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.SkippedAuthRequired, "HTML_INTERSTITIAL", "Source returned an HTML sign-in or error page.");
                }

                var knownLen = response.Content.Headers.ContentRange?.Length
                    ?? response.Content.Headers.ContentLength;
                long len;
                if (knownLen.HasValue)
                {
                    len = knownLen.Value;
                }
                else if (rangeResp is not null && response.StatusCode == HttpStatusCode.OK)
                {
                    await using var peekStream = await response.Content.ReadAsStreamAsync(ct);
                    var peekBuf = new byte[1];
                    var peekRead = await peekStream.ReadAsync(peekBuf.AsMemory(0, 1), ct);
                    len = peekRead > 0 ? peekRead : 0;
                }
                else
                {
                    len = 0;
                }

                if (len == 0)
                {
                    return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.SkippedEmptyBlob, "EMPTY_BLOB", "Source object has zero bytes.");
                }

                return new BlobProbeResult(true, cls.Provider, len, SyncStorageStatus.Pending, null, null);
            }
            finally
            {
                rangeResp?.Dispose();
            }
        }
        catch (HttpRequestException ex) when (IsDnsHostNotFound(ex))
        {
            return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.SkippedDeadLink, "DNS_NXDOMAIN", "Source host could not be resolved (NXDOMAIN).");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.FailedRetryable, "TIMEOUT", "Timed out probing source object.");
        }
        catch (HttpRequestException)
        {
            return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.FailedRetryable, "HTTP_REQUEST_ERROR", "Transient network error probing source object.");
        }
        catch (IOException)
        {
            return new BlobProbeResult(false, cls.Provider, 0, SyncStorageStatus.FailedRetryable, "STREAM_READ_ERROR", "Transient stream read error probing source object.");
        }
    }

    private async Task<HttpResponseMessage> SendFollowingSafeRedirectsAsync(
        HttpClient client,
        HttpMethod method,
        Uri initialUri,
        bool addRangeZero,
        CancellationToken ct)
    {
        var hasDevOverride = TryGetDevelopmentOriginOverride(out var overrideOrigin);
        var currentUri = initialUri;
        for (var hop = 0; hop < 3; hop++)
        {
            using var req = new HttpRequestMessage(method, currentUri);
            if (addRangeZero)
            {
                req.Headers.Range = new RangeHeaderValue(0, 0);
            }

            var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!IsRedirectStatus(resp.StatusCode) || hop == 2)
            {
                return resp;
            }

            var location = resp.Headers.Location;
            if (location is null)
            {
                return resp;
            }

            var nextUri = location.IsAbsoluteUri ? location : new Uri(currentUri, location);
            var isAllowedAzure1 =
                string.Equals(nextUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(nextUri.Host, AzureBlob1Host, StringComparison.OrdinalIgnoreCase) &&
                string.IsNullOrEmpty(nextUri.UserInfo) &&
                nextUri.IsDefaultPort;
            var isAllowedOverride =
                hasDevOverride &&
                string.Equals(nextUri.Scheme, overrideOrigin.Scheme, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(nextUri.Host, overrideOrigin.Host, StringComparison.OrdinalIgnoreCase) &&
                nextUri.Port == overrideOrigin.Port &&
                string.IsNullOrEmpty(nextUri.UserInfo);

            if (!isAllowedAzure1 && !isAllowedOverride)
            {
                // Unsafe / auth redirect — return 3xx response so caller classifies SKIPPED_AUTH_REQUIRED without following
                return resp;
            }

            resp.Dispose();
            currentUri = isAllowedAzure1 && hasDevOverride
                ? RewriteOrigin(nextUri, overrideOrigin)
                : nextUri;
        }

        throw new InvalidOperationException("Unreachable redirect loop termination.");
    }

    private Uri BuildOutboundRequestUri(string sourceUrl)
    {
        var originalUri = new Uri(sourceUrl.Trim(), UriKind.Absolute);
        var withSas = ApplyOptionalSasToken(originalUri);
        if (TryGetDevelopmentOriginOverride(out var overrideOrigin))
        {
            return RewriteOrigin(withSas, overrideOrigin);
        }
        return withSas;
    }

    private bool TryGetDevelopmentOriginOverride(out Uri overrideOrigin)
    {
        overrideOrigin = null!;
        if (!(_hostEnvironment?.IsDevelopment() ?? false))
        {
            return false;
        }

        var raw = _options.AzureBlob1OriginOverride?.Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        if (!Uri.TryCreate(raw, UriKind.Absolute, out var parsed))
        {
            return false;
        }

        if (!string.Equals(parsed.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(parsed.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        overrideOrigin = parsed;
        return true;
    }

    private static Uri RewriteOrigin(Uri uri, Uri overrideOrigin)
    {
        var ub = new UriBuilder(uri)
        {
            Scheme = overrideOrigin.Scheme,
            Host = overrideOrigin.Host,
            Port = overrideOrigin.IsDefaultPort ? -1 : overrideOrigin.Port
        };
        return ub.Uri;
    }

    private Uri ApplyOptionalSasToken(Uri uri)
    {
        if (!string.IsNullOrEmpty(uri.Query))
        {
            var queryParams = QueryHelpers.ParseQuery(uri.Query);
            if (queryParams.Keys.Any(k => string.Equals(k, "sig", StringComparison.OrdinalIgnoreCase)))
            {
                return uri;
            }
        }

        var sas = ResolveConfiguredSasToken(uri.Host);
        if (string.IsNullOrWhiteSpace(sas))
        {
            return uri;
        }

        var cleanSas = sas.Trim().TrimStart('?', '&');
        if (cleanSas.Length == 0)
        {
            return uri;
        }

        var ub = new UriBuilder(uri);
        ub.Query = string.IsNullOrEmpty(ub.Query)
            ? cleanSas
            : $"{ub.Query.TrimStart('?')}&{cleanSas}";
        return ub.Uri;
    }

    private string? ResolveConfiguredSasToken(string host)
    {
        if (_options.AzureAccounts.Count == 0) return null;

        var accountPrefix = host.Split('.')[0];
        if (_options.AzureAccounts.TryGetValue(accountPrefix, out var auth) ||
            _options.AzureAccounts.TryGetValue(host, out auth))
        {
            if (!string.IsNullOrWhiteSpace(auth.SasToken))
            {
                return auth.SasToken;
            }

            if (!string.IsNullOrWhiteSpace(auth.ConnectionString))
            {
                foreach (var part in auth.ConnectionString.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (part.StartsWith("SharedAccessSignature=", StringComparison.OrdinalIgnoreCase))
                    {
                        return part["SharedAccessSignature=".Length..];
                    }
                }
            }
        }

        return null;
    }

    private HttpClient GetHttpClient() =>
        _directHttpClient ?? _httpClientFactory!.CreateClient(HttpClientName);

    private static bool IsRedirectStatus(HttpStatusCode code) =>
        code is HttpStatusCode.MovedPermanently
            or HttpStatusCode.Found
            or HttpStatusCode.SeeOther
            or HttpStatusCode.TemporaryRedirect
            or HttpStatusCode.PermanentRedirect;

    private static bool IsDnsHostNotFound(HttpRequestException ex)
    {
        for (Exception? cur = ex; cur is not null; cur = cur.InnerException)
        {
            if (cur is SocketException sock && sock.SocketErrorCode == SocketError.HostNotFound)
            {
                return true;
            }
        }
        return false;
    }

    private static bool IsHtmlContentType(string? mediaType) =>
        !string.IsNullOrWhiteSpace(mediaType) &&
        (string.Equals(mediaType, "text/html", StringComparison.OrdinalIgnoreCase) ||
         string.Equals(mediaType, "application/xhtml+xml", StringComparison.OrdinalIgnoreCase));

    private static bool LooksLikeHtmlDocument(byte[] bytes)
    {
        var len = Math.Min(bytes.Length, 4096);
        if (len == 0) return false;

        var start = 0;
        if (len >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
        {
            start = 3;
        }

        var snippet = Encoding.UTF8.GetString(bytes, start, len - start).TrimStart();
        while (snippet.StartsWith("<!--", StringComparison.Ordinal))
        {
            var endComment = snippet.IndexOf("-->", 4, StringComparison.Ordinal);
            if (endComment < 0)
            {
                break;
            }
            snippet = snippet[(endComment + 3)..].TrimStart();
        }

        return snippet.StartsWith("<!DOCTYPE html", StringComparison.OrdinalIgnoreCase)
            || snippet.StartsWith("<html", StringComparison.OrdinalIgnoreCase)
            || snippet.StartsWith("<head", StringComparison.OrdinalIgnoreCase)
            || snippet.StartsWith("<script", StringComparison.OrdinalIgnoreCase)
            || snippet.StartsWith("<title>", StringComparison.OrdinalIgnoreCase);
    }

    private static string ResolveContentType(string? mediaType, string? fallbackContentType)
    {
        if (!string.IsNullOrWhiteSpace(mediaType) &&
            !string.Equals(mediaType, "application/octet-stream", StringComparison.OrdinalIgnoreCase))
        {
            var cleaned = mediaType.Trim();
            return cleaned.Length > 100 ? cleaned[..100] : cleaned;
        }

        if (!string.IsNullOrWhiteSpace(fallbackContentType))
        {
            var cleaned = fallbackContentType.Trim();
            return cleaned.Length > 100 ? cleaned[..100] : cleaned;
        }

        return "application/octet-stream";
    }

    private static BlobDownloadResult Fail(string provider, string status, string code, string message) =>
        new(
            Success: false,
            Provider: provider,
            Bytes: null,
            ContentType: null,
            SourceSha256: null,
            SourceSizeBytes: 0,
            FailureStatus: status,
            ErrorCode: code,
            ErrorMessage: message);
}
