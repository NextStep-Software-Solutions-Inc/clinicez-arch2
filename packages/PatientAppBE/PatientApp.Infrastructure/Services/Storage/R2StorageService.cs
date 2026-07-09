using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Infrastructure.Options;

namespace PatientApp.Infrastructure.Services.Storage;

public sealed class R2StorageService : IStorageService, IAsyncDisposable
{
    private readonly IAmazonS3 _s3Client;
    private readonly string _bucketName;
    private readonly string _publicUrl;

    public R2StorageService(IOptions<R2Options> options)
    {
        var opts = options.Value;
        _bucketName = opts.BucketName;
        _publicUrl = opts.PublicUrl.TrimEnd('/');

        var credentials = new BasicAWSCredentials(opts.AccessKeyId, opts.SecretAccessKey);
        var config = new AmazonS3Config
        {
            ServiceURL = $"https://{opts.AccountId}.r2.cloudflarestorage.com",
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
        };

        _s3Client = new AmazonS3Client(credentials, config);
    }

    public async Task<string> UploadAsync(
        Stream stream,
        string key,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var request = new PutObjectRequest
        {
            BucketName = _bucketName,
            Key = key,
            InputStream = stream,
            ContentType = contentType,
            AutoCloseStream = false,
        };

        await _s3Client.PutObjectAsync(request, cancellationToken);
        return key;
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        var request = new DeleteObjectRequest
        {
            BucketName = _bucketName,
            Key = key,
        };

        await _s3Client.DeleteObjectAsync(request, cancellationToken);
    }

    public string GetPublicUrl(string key) => $"{_publicUrl}/{key}";

    public Task<string> GeneratePresignedUploadUrlAsync(string key, string contentType, TimeSpan expiresIn, CancellationToken cancellationToken = default)
    {
        var request = new GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = key,
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.Add(expiresIn),
            ContentType = contentType
        };

        return Task.FromResult(_s3Client.GetPreSignedURL(request));
    }

    public Task<string> GeneratePresignedDownloadUrlAsync(string key, TimeSpan expiresIn, CancellationToken cancellationToken = default)
    {
        var request = new GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.Add(expiresIn)
        };

        return Task.FromResult(_s3Client.GetPreSignedURL(request));
    }

    public async Task<bool> ObjectExistsAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new GetObjectMetadataRequest
            {
                BucketName = _bucketName,
                Key = key
            };
            await _s3Client.GetObjectMetadataAsync(request, cancellationToken);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        _s3Client.Dispose();
        await ValueTask.CompletedTask;
    }
}
