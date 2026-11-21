namespace ClinicEz.Clinic.Infrastructure.Options;

public sealed class S3Options
{
    public const string SectionName = "S3";

    /// <summary>
    /// Custom S3 endpoint URL (e.g. "http://minio.local:9000", "https://s3.hospital.internal", or empty for AWS default).
    /// If empty and AccountId is supplied, derives Cloudflare R2 URL: https://{AccountId}.r2.cloudflarestorage.com
    /// </summary>
    public string? ServiceUrl { get; set; }

    /// <summary>Target bucket name (e.g. "clinicez-clinic-records").</summary>
    public string BucketName { get; set; } = string.Empty;

    /// <summary>Access Key ID / Username.</summary>
    public string AccessKeyId { get; set; } = string.Empty;

    /// <summary>Secret Access Key / Password.</summary>
    public string SecretAccessKey { get; set; } = string.Empty;

    /// <summary>S3 Region (defaults to "auto" or "us-east-1").</summary>
    public string Region { get; set; } = "auto";

    /// <summary>
    /// Whether to use path-style addressing (http://endpoint/bucket) rather than virtual-hosted (http://bucket.endpoint).
    /// Required for MinIO, Cloudflare R2, Ceph, and most private/on-premise S3 servers. Defaults to true.
    /// </summary>
    public bool ForcePathStyle { get; set; } = true;

    /// <summary>Cloudflare R2 Account ID (used to auto-construct ServiceUrl when ServiceUrl is not explicitly specified).</summary>
    public string? AccountId { get; set; }

    /// <summary>Optional public or CDN URL.</summary>
    public string? PublicUrl { get; set; }
}
