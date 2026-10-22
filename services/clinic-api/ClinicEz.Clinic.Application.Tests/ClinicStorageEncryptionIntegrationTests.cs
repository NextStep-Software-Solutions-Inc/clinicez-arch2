using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicStorageEncryptionIntegrationTests
{
    private static ClinicEncryptionKeyRing CreateKeyRing(string secret = "dev-master-secret-at-least-32-characters-long-12345")
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [ClinicEncryptionKeyRing.MasterSecretKey] = secret
            })
            .Build();
        return ClinicEncryptionKeyRing.FromConfiguration(config);
    }

    [Fact]
    public async Task EndToEnd_Upload_CMKEncrypt_S3Put_S3Get_CMKDecrypt_RoundTrip_Succeeds()
    {
        // Arrange
        var originalPlaintext = Encoding.UTF8.GetBytes("CONFIDENTIAL MEDICAL ATTACHMENT: Normal ECG tracing, sinusal rhythm.");
        var tenantId = "tenant_st_jude";
        var clinicId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var storageKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";

        // 1. Setup real ClinicEncryptionKeyRing with a valid secret
        var keyRing = CreateKeyRing();
        var encryptionService = new ClinicEncryptionService(keyRing);

        // 2. Setup simulated in-memory S3/R2 bucket
        var inMemoryS3 = new ConcurrentDictionary<string, byte[]>();
        var mockS3 = Substitute.For<IAmazonS3>();

        mockS3.PutObjectAsync(Arg.Any<PutObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var req = call.Arg<PutObjectRequest>();
                using var ms = new MemoryStream();
                req.InputStream.CopyTo(ms);
                inMemoryS3[req.Key] = ms.ToArray();
                return new PutObjectResponse { HttpStatusCode = HttpStatusCode.OK };
            });

        mockS3.GetObjectAsync(Arg.Any<GetObjectRequest>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var req = call.Arg<GetObjectRequest>();
                if (!inMemoryS3.TryGetValue(req.Key, out var bytes))
                {
                    throw new AmazonS3Exception("NotFound") { StatusCode = HttpStatusCode.NotFound };
                }

                return new GetObjectResponse
                {
                    HttpStatusCode = HttpStatusCode.OK,
                    ResponseStream = new MemoryStream(bytes)
                };
            });

        // Use generalized S3ClinicStorageAdapter (works for MinIO, Ceph, AWS S3, Cloudflare R2)
        var s3Storage = new S3ClinicStorageAdapter(mockS3, "clinicez-clinic-records", NullLogger<S3ClinicStorageAdapter>.Instance);

        // Act - 1. Encrypt with Clinic Master Key (CMK)
        var encrypted = await encryptionService.EncryptAsync(originalPlaintext, tenantId, clinicId);

        // Act - 2. Save ciphertext to S3
        var savedKey = await s3Storage.SaveEncryptedFileAsync(storageKey, encrypted.Ciphertext);

        // Assert - Stored data in S3 is encrypted ciphertext, NOT plaintext
        savedKey.Should().Be(storageKey);
        inMemoryS3.Should().ContainKey(storageKey);
        inMemoryS3[storageKey].Should().NotEqual(originalPlaintext);
        inMemoryS3[storageKey].Length.Should().Be(encrypted.Ciphertext.Length);

        // Act - 3. Read ciphertext back from S3
        var retrievedCiphertext = await s3Storage.ReadEncryptedFileAsync(storageKey);

        // Act - 4. Decrypt with CMK
        var decryptedPlaintext = await encryptionService.DecryptAsync(
            retrievedCiphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            tenantId,
            clinicId);

        // Assert - Round-trip yields exact original plaintext bytes
        decryptedPlaintext.Should().Equal(originalPlaintext);
        Encoding.UTF8.GetString(decryptedPlaintext).Should().Be("CONFIDENTIAL MEDICAL ATTACHMENT: Normal ECG tracing, sinusal rhythm.");
    }

    [Fact]
    public async Task CrossTenant_TamperAttempt_FailsDecryptionDueToCryptographicIsolation()
    {
        // Arrange
        var plaintext = Encoding.UTF8.GetBytes("Tenant A patient consultation record.");
        var tenantA = "tenant_hospital_a";
        var tenantB = "tenant_hospital_b";
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();

        var keyRing = CreateKeyRing();
        var encryptionService = new ClinicEncryptionService(keyRing);

        // Encrypt under Tenant A and Clinic A
        var encrypted = await encryptionService.EncryptAsync(plaintext, tenantA, clinicA);

        // Act & Assert - Attempting to decrypt with Tenant B or Clinic B fails AEAD verification
        var actWrongTenant = () => encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            tenantB,
            clinicA);

        await actWrongTenant.Should().ThrowAsync<CryptographicException>();

        var actWrongClinic = () => encryptionService.DecryptAsync(
            encrypted.Ciphertext,
            encrypted.IvBase64,
            encrypted.TagBase64,
            encrypted.WrappedKeyJson,
            tenantA,
            clinicB);

        await actWrongClinic.Should().ThrowAsync<CryptographicException>();
    }
}
