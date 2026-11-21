using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using ClinicEz.Clinic.Infrastructure.Options;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class R2ClinicStorageServiceTests
{
    private readonly IAmazonS3 _mockS3;
    private readonly R2ClinicStorageService _storageService;
    private const string TestBucket = "test-records-bucket";

    public R2ClinicStorageServiceTests()
    {
        _mockS3 = Substitute.For<IAmazonS3>();
        _storageService = new R2ClinicStorageService(_mockS3, TestBucket, NullLogger<R2ClinicStorageService>.Instance);
    }

    [Fact]
    public async Task SaveEncryptedFileAsync_PutsObjectWithExpectedKeyBucketAndMetadata()
    {
        // Arrange
        var key = "tenants/tenant1/clinics/0192e21b-8714-722a-8212-08a8a101b001/records/att-1.cez";
        var ciphertext = Encoding.UTF8.GetBytes("ENCRYPTED_CIPHERTEXT_BYTES");

        _mockS3.PutObjectAsync(Arg.Any<PutObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(new PutObjectResponse { HttpStatusCode = HttpStatusCode.OK });

        // Act
        var result = await _storageService.SaveEncryptedFileAsync(key, ciphertext);

        // Assert
        result.Should().Be(key);
        await _mockS3.Received(1).PutObjectAsync(
            Arg.Is<PutObjectRequest>(req =>
                req.BucketName == TestBucket &&
                req.Key == key &&
                req.ContentType == "application/octet-stream" &&
                req.Metadata["x-amz-meta-encryption"] == "AES-256-GCM" &&
                req.Metadata["x-amz-meta-key-scheme"] == "cmk-v1"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ReadEncryptedFileAsync_WhenFound_ReturnsCiphertext()
    {
        // Arrange
        var key = "tenants/tenant1/clinics/0192e21b-8714-722a-8212-08a8a101b001/records/att-1.cez";
        var expectedBytes = new byte[] { 0x01, 0x02, 0x03, 0x04 };

        _mockS3.GetObjectAsync(Arg.Any<GetObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(new GetObjectResponse
            {
                HttpStatusCode = HttpStatusCode.OK,
                ResponseStream = new MemoryStream(expectedBytes)
            });

        // Act
        var result = await _storageService.ReadEncryptedFileAsync(key);

        // Assert
        result.Should().Equal(expectedBytes);
    }

    [Fact]
    public async Task ReadEncryptedFileAsync_WhenNotFound_ThrowsFileNotFoundException()
    {
        // Arrange
        var key = "tenants/tenant1/clinics/0192e21b-8714-722a-8212-08a8a101b001/records/missing.cez";

        var s3NotFound = new AmazonS3Exception("NotFound") { StatusCode = HttpStatusCode.NotFound };
        _mockS3.GetObjectAsync(Arg.Any<GetObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns<GetObjectResponse>(_ => throw s3NotFound);

        // Act & Assert
        var act = () => _storageService.ReadEncryptedFileAsync(key);
        await act.Should().ThrowAsync<FileNotFoundException>();
    }

    [Fact]
    public async Task FileExistsAsync_WhenObjectExists_ReturnsTrue()
    {
        // Arrange
        var key = "tenants/tenant1/clinics/c1/records/att.cez";
        _mockS3.GetObjectMetadataAsync(Arg.Any<GetObjectMetadataRequest>(), Arg.Any<CancellationToken>())
            .Returns(new GetObjectMetadataResponse { HttpStatusCode = HttpStatusCode.OK });

        // Act
        var exists = await _storageService.FileExistsAsync(key);

        // Assert
        exists.Should().BeTrue();
    }

    [Fact]
    public async Task FileExistsAsync_WhenNotFound_ReturnsFalse()
    {
        // Arrange
        var key = "tenants/tenant1/clinics/c1/records/att.cez";
        var s3NotFound = new AmazonS3Exception("NotFound") { StatusCode = HttpStatusCode.NotFound };
        _mockS3.GetObjectMetadataAsync(Arg.Any<GetObjectMetadataRequest>(), Arg.Any<CancellationToken>())
            .Returns<GetObjectMetadataResponse>(_ => throw s3NotFound);

        // Act
        var exists = await _storageService.FileExistsAsync(key);

        // Assert
        exists.Should().BeFalse();
    }

    [Fact]
    public async Task DeleteEncryptedFileAsync_IssuesDeleteObject()
    {
        // Arrange
        var key = "tenants/tenant1/clinics/c1/records/att.cez";

        // Act
        await _storageService.DeleteEncryptedFileAsync(key);

        // Assert
        await _mockS3.Received(1).DeleteObjectAsync(
            Arg.Is<DeleteObjectRequest>(req => req.BucketName == TestBucket && req.Key == key),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public void OnPremiseMinio_S3Adapter_CanBeConstructedWithCustomServiceUrl()
    {
        // Arrange: On-premise subscriber running MinIO
        var s3Options = Microsoft.Extensions.Options.Options.Create(new S3Options
        {
            ServiceUrl = "http://192.168.1.100:9000",
            BucketName = "onprem-clinic-records",
            AccessKeyId = "minioadmin",
            SecretAccessKey = "miniopassword123",
            ForcePathStyle = true
        });

        // Act
        var adapter = new S3ClinicStorageAdapter(s3Options, null, NullLogger<S3ClinicStorageAdapter>.Instance);

        // Assert
        adapter.BucketName.Should().Be("onprem-clinic-records");
    }
}
