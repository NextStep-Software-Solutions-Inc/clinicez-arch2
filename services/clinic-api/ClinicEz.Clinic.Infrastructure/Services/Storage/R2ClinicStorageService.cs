using Amazon.S3;
using ClinicEz.Clinic.Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Clinic.Infrastructure.Services.Storage;

/// <summary>
/// Cloudflare R2 specialization of S3ClinicStorageAdapter.
/// </summary>
public sealed class R2ClinicStorageService : S3ClinicStorageAdapter
{
    public R2ClinicStorageService(
        IOptions<R2Options> options,
        ILogger<R2ClinicStorageService> logger)
        : base(
            Microsoft.Extensions.Options.Options.Create(new S3Options
            {
                AccountId = options?.Value.AccountId,
                BucketName = options?.Value.BucketName ?? string.Empty,
                AccessKeyId = options?.Value.AccessKeyId ?? string.Empty,
                SecretAccessKey = options?.Value.SecretAccessKey ?? string.Empty,
                PublicUrl = options?.Value.PublicUrl,
                ForcePathStyle = true
            }),
            options,
            logger)
    {
    }

    public R2ClinicStorageService(
        IAmazonS3 s3Client,
        string bucketName,
        ILogger<R2ClinicStorageService> logger)
        : base(s3Client, bucketName, logger)
    {
    }
}
