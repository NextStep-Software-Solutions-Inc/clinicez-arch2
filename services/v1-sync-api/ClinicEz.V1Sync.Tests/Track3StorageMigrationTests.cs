using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Amazon.S3;
using Amazon.S3.Model;
using ClinicEz.Clinic.Infrastructure.Services.Storage;
using ClinicEz.Patient.Infrastructure.Services.Encryption;
using ClinicEz.V1Sync.Api.Data;
using ClinicEz.V1Sync.Api.Models;
using ClinicEz.V1Sync.Api.Services;
using ClinicEz.V1Sync.Api.Services.Storage;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using Xunit;

namespace ClinicEz.V1Sync.Tests;

[Collection("Pg17Integration")]
public sealed class Track3StorageMigrationTests
{
    private const string ClinicSecret1 = "clinic-test-master-secret-32-chars-minimum-01!";
    private const string ClinicSecret2 = "clinic-rotated-master-secret-32-chars-min-02!";
    private const string PatientSecret1 = "patient-test-master-secret-32-chars-minimum-01!";
    private const string PatientSecret2 = "patient-rotated-master-secret-32-chars-min-02!";

    private const string ClinicFullSchemaExtraSql = """
        ALTER TABLE public."RecordAttachments" ADD COLUMN IF NOT EXISTS "EncryptionKeyId" VARCHAR(100);
        ALTER TABLE public."RecordAttachments" ADD COLUMN IF NOT EXISTS "EncryptionIvBase64" VARCHAR(100);
        ALTER TABLE public."RecordAttachments" ADD COLUMN IF NOT EXISTS "EncryptionTagBase64" VARCHAR(100);
        ALTER TABLE public."RecordAttachments" ADD COLUMN IF NOT EXISTS "EncryptedSizeBytes" BIGINT;
        ALTER TABLE public."RecordAttachments" ADD COLUMN IF NOT EXISTS "EncryptedHash" VARCHAR(100);
        ALTER TABLE public."RecordAttachments" ADD COLUMN IF NOT EXISTS "WrappedKeyJson" TEXT;
        """;

    private const string RecordAttachmentsTableSql = """
        CREATE TABLE IF NOT EXISTS public."RecordAttachments" (
            "Id" UUID PRIMARY KEY,
            "PatientId" UUID NOT NULL,
            "RecordType" VARCHAR(50) NOT NULL,
            "Title" VARCHAR(200) NOT NULL,
            "FileName" VARCHAR(255) NOT NULL,
            "ContentType" VARCHAR(100) NOT NULL,
            "FileSizeBytes" BIGINT NOT NULL,
            "StorageUri" VARCHAR(2000) NOT NULL,
            "DocumentDate" DATE NOT NULL,
            "VerificationStatus" VARCHAR(30) NOT NULL,
            "EncryptionAlgorithm" VARCHAR(30) NOT NULL,
            "EncryptionKeyId" VARCHAR(100),
            "EncryptionIvBase64" VARCHAR(100),
            "EncryptionTagBase64" VARCHAR(100),
            "EncryptedSizeBytes" BIGINT,
            "EncryptedHash" VARCHAR(100),
            "WrappedKeyJson" TEXT,
            "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "CreatedBy" TEXT,
            "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "UpdatedBy" TEXT,
            "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
            "TenantId" TEXT NOT NULL,
            "ClinicId" UUID NOT NULL
        );
        """;

    private const string FileRecordsTableSql = """
        CREATE TABLE IF NOT EXISTS public.document_types (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL
        );
        INSERT INTO public.document_types (id, name) VALUES
            ('11111111-1111-1111-1111-111111111111', 'X-Ray / Imaging'),
            ('22222222-2222-2222-2222-222222222222', 'Lab Result'),
            ('33333333-3333-3333-3333-333333333333', 'Medical Certificate'),
            ('44444444-4444-4444-4444-444444444444', 'Prescription'),
            ('55555555-5555-5555-5555-555555555555', 'Government ID'),
            ('66666666-6666-6666-6666-666666666666', 'Other')
        ON CONFLICT (id) DO NOTHING;

        CREATE TABLE IF NOT EXISTS public.clinics (
            id UUID PRIMARY KEY,
            name VARCHAR(200) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS public.file_records (
            id UUID PRIMARY KEY,
            client_id UUID NOT NULL,
            patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
            clinic_id UUID,
            file_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100),
            extension VARCHAR(20),
            size_bytes BIGINT NOT NULL,
            storage_key VARCHAR(500) NOT NULL,
            document_type_id UUID NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
            sync_status VARCHAR(20) NOT NULL,
            sync_error VARCHAR(500),
            uploaded_at TIMESTAMPTZ NOT NULL,
            encryption_algorithm VARCHAR(50),
            encryption_key_id VARCHAR(100),
            encryption_iv_base64 VARCHAR(100),
            encryption_tag_base64 VARCHAR(100),
            encrypted_size_bytes BIGINT,
            encrypted_hash VARCHAR(200),
            wrapped_key_json TEXT,
            document_date DATE,
            facility_name VARCHAR(200),
            notes VARCHAR(1000),
            title VARCHAR(200) NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by VARCHAR(128) NOT NULL,
            updated_at TIMESTAMPTZ,
            updated_by VARCHAR(128),
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE
        );

        CREATE TABLE IF NOT EXISTS public.clinic_memberships (
            id UUID PRIMARY KEY,
            client_id UUID NOT NULL,
            patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
            clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
            status VARCHAR(20) NOT NULL,
            consent_privacy_policy BOOLEAN NOT NULL,
            consent_terms_and_conditions BOOLEAN NOT NULL,
            consent_data_sharing BOOLEAN NOT NULL,
            consented_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by VARCHAR(128) NOT NULL,
            updated_at TIMESTAMPTZ,
            updated_by VARCHAR(128),
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE
        );
        """;

    [Fact]
    public async Task Track3EnvelopeEncryptor_BidirectionalParity_WithRealClinicAndPatientEncryptionServices()
    {
        var cfg = BuildEncryptionConfig(ClinicSecret1, PatientSecret1);
        var track3Encryptor = new Track3EnvelopeEncryptor(cfg);
        var realClinicService = new ClinicEncryptionService(ClinicEncryptionKeyRing.FromConfiguration(cfg));
        var realPatientService = new PatientEncryptionService(PatientEncryptionKeyRing.FromConfiguration(cfg));

        track3Encryptor.IsClinicConfigured.Should().BeTrue();
        track3Encryptor.IsPatientConfigured.Should().BeTrue();

        var tenantId = "tnt-parity-01";
        var clinicId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        var patientId = Guid.Parse("11111111-2222-3333-4444-555555555555");
        var payload = Encoding.UTF8.GetBytes("%PDF-1.7\nSynthetic clinic/patient binary parity payload 0123456789!");

        // 1. Clinic CMK: Track3 -> Real ClinicEncryptionService
        var cEnc = track3Encryptor.EncryptForClinic(payload, tenantId, clinicId);
        cEnc.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        cEnc.EncryptionKeyId.Should().Be("cmk-v1");
        cEnc.EncryptedSizeBytes.Should().Be(payload.Length);
        cEnc.EncryptedHash.Should().Be(Convert.ToHexString(SHA256.HashData(cEnc.Ciphertext)).ToLowerInvariant());

        // Verify PascalCase WrappedKeyModel JSON keys (case-sensitive requirement)
        using (var doc = JsonDocument.Parse(cEnc.WrappedKeyJson))
        {
            doc.RootElement.GetProperty("Alg").GetString().Should().Be("AES-256-GCM");
            doc.RootElement.GetProperty("Kid").GetString().Should().Be(ComputeExpectedKid(ClinicSecret1));
            doc.RootElement.TryGetProperty("Iv", out _).Should().BeTrue();
            doc.RootElement.TryGetProperty("Tag", out _).Should().BeTrue();
            doc.RootElement.TryGetProperty("CipherText", out _).Should().BeTrue();
        }

        var cDecByReal = await realClinicService.DecryptAsync(
            cEnc.Ciphertext, cEnc.IvBase64, cEnc.TagBase64, cEnc.WrappedKeyJson, tenantId, clinicId);
        cDecByReal.Should().Equal(payload);

        // Reverse: Real ClinicEncryptionService -> Track3
        var cRealEnc = await realClinicService.EncryptAsync(payload, tenantId, clinicId);
        var cDecByTrack3 = track3Encryptor.DecryptForClinic(
            cRealEnc.Ciphertext, cRealEnc.IvBase64, cRealEnc.TagBase64, cRealEnc.WrappedKeyJson, tenantId, clinicId);
        cDecByTrack3.Should().Equal(payload);

        // 2. Patient PMK: Track3 -> Real PatientEncryptionService
        var pEnc = track3Encryptor.EncryptForPatient(payload, patientId);
        pEnc.EncryptionAlgorithm.Should().Be("AES-256-GCM");
        pEnc.EncryptionKeyId.Should().Be("pmk-v1");
        pEnc.EncryptedSizeBytes.Should().Be(payload.Length);

        var pDecByReal = await realPatientService.DecryptAsync(
            pEnc.Ciphertext, pEnc.IvBase64, pEnc.TagBase64, pEnc.WrappedKeyJson, patientId);
        pDecByReal.Should().Equal(payload);

        // Reverse: Real PatientEncryptionService -> Track3
        var pRealEnc = await realPatientService.EncryptAsync(payload, patientId);
        var pDecByTrack3 = track3Encryptor.DecryptForPatient(
            pRealEnc.Ciphertext, pRealEnc.IvBase64, pRealEnc.TagBase64, pRealEnc.WrappedKeyJson, patientId);
        pDecByTrack3.Should().Equal(payload);
    }

    [Fact]
    public async Task Track3EnvelopeEncryptor_KeyRotationAndNegativeValidation()
    {
        var oldCfg = BuildEncryptionConfig(ClinicSecret1, PatientSecret1);
        var oldEncryptor = new Track3EnvelopeEncryptor(oldCfg);

        var tenantId = "tnt-rotate";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var payload = Encoding.UTF8.GetBytes("Secret rotation check payload");

        var oldClinicEnc = oldEncryptor.EncryptForClinic(payload, tenantId, clinicId);
        var oldPatientEnc = oldEncryptor.EncryptForPatient(payload, patientId);

        var rotatedCfg = BuildEncryptionConfig(ClinicSecret2, PatientSecret2, ClinicSecret1, PatientSecret1);
        var rotatedEncryptor = new Track3EnvelopeEncryptor(rotatedCfg);
        var realClinic = new ClinicEncryptionService(ClinicEncryptionKeyRing.FromConfiguration(rotatedCfg));
        var realPatient = new PatientEncryptionService(PatientEncryptionKeyRing.FromConfiguration(rotatedCfg));

        rotatedEncryptor.DecryptForClinic(oldClinicEnc.Ciphertext, oldClinicEnc.IvBase64, oldClinicEnc.TagBase64, oldClinicEnc.WrappedKeyJson, tenantId, clinicId)
            .Should().Equal(payload);
        (await realClinic.DecryptAsync(oldClinicEnc.Ciphertext, oldClinicEnc.IvBase64, oldClinicEnc.TagBase64, oldClinicEnc.WrappedKeyJson, tenantId, clinicId))
            .Should().Equal(payload);

        rotatedEncryptor.DecryptForPatient(oldPatientEnc.Ciphertext, oldPatientEnc.IvBase64, oldPatientEnc.TagBase64, oldPatientEnc.WrappedKeyJson, patientId)
            .Should().Equal(payload);
        (await realPatient.DecryptAsync(oldPatientEnc.Ciphertext, oldPatientEnc.IvBase64, oldPatientEnc.TagBase64, oldPatientEnc.WrappedKeyJson, patientId))
            .Should().Equal(payload);

        // Negative cases: wrong tenant/clinic/patient/tampered ciphertext
        Action wrongTenant = () => rotatedEncryptor.DecryptForClinic(
            oldClinicEnc.Ciphertext, oldClinicEnc.IvBase64, oldClinicEnc.TagBase64, oldClinicEnc.WrappedKeyJson, "wrong-tenant", clinicId);
        wrongTenant.Should().Throw<CryptographicException>();

        Action wrongClinic = () => rotatedEncryptor.DecryptForClinic(
            oldClinicEnc.Ciphertext, oldClinicEnc.IvBase64, oldClinicEnc.TagBase64, oldClinicEnc.WrappedKeyJson, tenantId, Guid.NewGuid());
        wrongClinic.Should().Throw<CryptographicException>();

        Action wrongPatient = () => rotatedEncryptor.DecryptForPatient(
            oldPatientEnc.Ciphertext, oldPatientEnc.IvBase64, oldPatientEnc.TagBase64, oldPatientEnc.WrappedKeyJson, Guid.NewGuid());
        wrongPatient.Should().Throw<CryptographicException>();

        var tampered = (byte[])oldClinicEnc.Ciphertext.Clone();
        tampered[0] ^= 0xFF;
        Action tamperedAction = () => rotatedEncryptor.DecryptForClinic(
            tampered, oldClinicEnc.IvBase64, oldClinicEnc.TagBase64, oldClinicEnc.WrappedKeyJson, tenantId, clinicId);
        tamperedAction.Should().Throw<CryptographicException>();

        // Short secrets (<32 chars) must NOT throw in constructor, must report unconfigured, and reject encryption
        var shortCfg = BuildEncryptionConfig("too-short", "too-short");
        var shortEnc = new Track3EnvelopeEncryptor(shortCfg);
        shortEnc.IsClinicConfigured.Should().BeFalse();
        shortEnc.IsPatientConfigured.Should().BeFalse();
        Action encShort = () => shortEnc.EncryptForClinic(payload, tenantId, clinicId);
        encShort.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public async Task SharedAzureBlob1Url_DownloadsOnce_EncryptsTwiceInIsolatedBuckets_AndClinicSurvivesPatientDelete()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-iso";
        var clinicId = Guid.NewGuid();
        var clinicPatientId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var sharedPatientFileId = Guid.NewGuid();
        var privatePatientFileId = Guid.NewGuid();

        const string sharedUrl = "https://clinicezstorage.blob.core.windows.net/prod/synthetic-shared.pdf";
        const string privateUrl = "https://clinicezstorage.blob.core.windows.net/prod/synthetic-private.png";

        var sharedBytes = Encoding.UTF8.GetBytes("%PDF-1.4\nShared clinical lab attachment bytes 987654321");
        var privateBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4 };

        await SeedClinicAttachmentAsync(fx, attachmentId, clinicPatientId, tenantId, clinicId, "application/octet-stream", 0, sharedUrl);
        await SeedPatientAndFileAsync(fx, patientId, sharedPatientFileId, clinicId, "application/octet-stream", 0, sharedUrl);
        await SeedPatientAndFileAsync(fx, patientId, privatePatientFileId, null, "image/png", privateBytes.Length, privateUrl);

        var downloadCounts = new ConcurrentDictionary<string, int>(StringComparer.Ordinal);
        var handler = new StubHttpMessageHandler(req =>
        {
            var url = req.RequestUri!.ToString();
            downloadCounts.AddOrUpdate(url, 1, (_, c) => c + 1);
            if (url == sharedUrl)
            {
                return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, sharedBytes, "application/pdf");
            }
            if (url == privateUrl)
            {
                return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, privateBytes, "image/png");
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (engine, coordinator, encCfg) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "Track3 Isolation Test",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped
        ), "test");

        var run = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        run.Status.Should().Be(SyncRunStatus.Completed);

        // Download-Once assertion for shared URL
        downloadCounts[sharedUrl].Should().Be(1);
        downloadCounts[privateUrl].Should().Be(1);

        var summary = JsonSerializer.Deserialize<SyncRunSummary>(run.Summary.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        summary.OverlapSavedDownloads.Should().Be(1);
        summary.ClinicCopiesMigrated.Should().Be(1);
        summary.PatientCopiesMigrated.Should().Be(2);

        // Verify distinct S3 keys, headers, ciphertexts, and wrapped keys across isolated buckets
        var expectedClinicKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";
        var expectedSharedPatientKey = $"patients/{patientId}/records/{sharedPatientFileId}.cez";
        var expectedPrivatePatientKey = $"patients/{patientId}/records/{privatePatientFileId}.cez";

        clinicS3.Contains("clinicez-clinic-test", expectedClinicKey).Should().BeTrue();
        clinicS3.Contains("clinicez-clinic-test", expectedPrivatePatientKey).Should().BeFalse();
        patientS3.Contains("clinicez-patient-test", expectedSharedPatientKey).Should().BeTrue();
        patientS3.Contains("clinicez-patient-test", expectedPrivatePatientKey).Should().BeTrue();

        var clinicObj = clinicS3.GetRaw("clinicez-clinic-test", expectedClinicKey);
        var patientSharedObj = patientS3.GetRaw("clinicez-patient-test", expectedSharedPatientKey);

        clinicObj.Metadata["x-amz-meta-encryption"].Should().Be("AES-256-GCM");
        clinicObj.Metadata["x-amz-meta-key-scheme"].Should().Be("cmk-v1");
        patientSharedObj.Metadata["x-amz-meta-encryption"].Should().Be("AES-256-GCM");
        patientSharedObj.Metadata["x-amz-meta-key-scheme"].Should().Be("pmk-v1");

        // Ciphertexts MUST differ because fresh DEK and IV are generated per plane
        clinicObj.Bytes.Should().NotEqual(patientSharedObj.Bytes);

        // Verify DB crypto metadata & distinct WrappedKeyJson
        var (clinicAlg, clinicIv, clinicTag, clinicWrapped, clinicStorageUri) = await ReadClinicCryptoRowAsync(fx, attachmentId);
        var (patientAlg, patientIv, patientTag, patientWrapped, patientStorageKey) = await ReadPatientCryptoRowAsync(fx, sharedPatientFileId);

        clinicAlg.Should().Be("AES-256-GCM");
        clinicStorageUri.Should().Be(expectedClinicKey);
        patientAlg.Should().Be("AES-256-GCM");
        patientStorageKey.Should().Be(expectedSharedPatientKey);
        clinicIv.Should().NotBe(patientIv);
        clinicWrapped.Should().NotBe(patientWrapped);

        // Delete Patient copy from Patient S3 & DB -> Clinic copy remains intact & decrypts via real ClinicEncryptionService
        await patientS3.Client.DeleteObjectAsync(new DeleteObjectRequest { BucketName = "clinicez-patient-test", Key = expectedSharedPatientKey });
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"DELETE FROM public.file_records WHERE id = '{sharedPatientFileId}'");

        patientS3.Contains("clinicez-patient-test", expectedSharedPatientKey).Should().BeFalse();
        clinicS3.Contains("clinicez-clinic-test", expectedClinicKey).Should().BeTrue();

        var realClinicService = new ClinicEncryptionService(ClinicEncryptionKeyRing.FromConfiguration(encCfg));
        var decryptedClinic = await realClinicService.DecryptAsync(
            clinicObj.Bytes, clinicIv, clinicTag, clinicWrapped, tenantId, clinicId);
        decryptedClinic.Should().Equal(sharedBytes);
    }

    [Fact]
    public async Task SkipPolicy_PreservesNonePointers_ZeroPhiInListing_AndRetryFailedRequeuesSelectively()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-skip";
        var clinicId = Guid.NewGuid();
        var clinicPatientId = Guid.NewGuid();

        var id404 = Guid.NewGuid();
        var id410 = Guid.NewGuid();
        var idEmpty = Guid.NewGuid();
        var id401 = Guid.NewGuid();
        var id403 = Guid.NewGuid();
        var idHtmlHeader = Guid.NewGuid();
        var idHtmlSniff = Guid.NewGuid();
        var idRetry503 = Guid.NewGuid();
        var idDrive = Guid.NewGuid();
        var idAzure2 = Guid.NewGuid();

        const string url404 = "https://clinicezstorage.blob.core.windows.net/prod/not-found.pdf";
        const string url410 = "https://clinicezstorage.blob.core.windows.net/prod/gone.pdf";
        const string urlEmpty = "https://clinicezstorage.blob.core.windows.net/prod/empty.pdf";
        const string url401 = "https://clinicezstorage.blob.core.windows.net/prod/unauth.pdf";
        const string url403 = "https://clinicezstorage.blob.core.windows.net/prod/forbidden.pdf";
        const string urlHtmlHeader = "https://clinicezstorage.blob.core.windows.net/prod/signin.pdf";
        const string urlHtmlSniff = "https://clinicezstorage.blob.core.windows.net/prod/signin-sniff.pdf";
        const string url503 = "https://clinicezstorage.blob.core.windows.net/prod/transient-503.pdf";
        const string urlDrive = "https://drive.google.com/file/d/synthetic-id-123/view";
        const string urlAzure2 = "https://clinicez.blob.core.windows.net/legacy/old-file.pdf";

        await SeedClinicAttachmentAsync(fx, id404, clinicPatientId, tenantId, clinicId, "application/pdf", 10, url404);
        await SeedClinicAttachmentAsync(fx, id410, clinicPatientId, tenantId, clinicId, "application/pdf", 10, url410);
        await SeedClinicAttachmentAsync(fx, idEmpty, clinicPatientId, tenantId, clinicId, "application/pdf", 10, urlEmpty);
        await SeedClinicAttachmentAsync(fx, id401, clinicPatientId, tenantId, clinicId, "application/pdf", 10, url401);
        await SeedClinicAttachmentAsync(fx, id403, clinicPatientId, tenantId, clinicId, "application/pdf", 10, url403);
        await SeedClinicAttachmentAsync(fx, idHtmlHeader, clinicPatientId, tenantId, clinicId, "application/pdf", 10, urlHtmlHeader);
        await SeedClinicAttachmentAsync(fx, idHtmlSniff, clinicPatientId, tenantId, clinicId, "application/pdf", 10, urlHtmlSniff);
        await SeedClinicAttachmentAsync(fx, idRetry503, clinicPatientId, tenantId, clinicId, "application/pdf", 10, url503);
        await SeedClinicAttachmentAsync(fx, idDrive, clinicPatientId, tenantId, clinicId, "application/pdf", 10, urlDrive);
        await SeedClinicAttachmentAsync(fx, idAzure2, clinicPatientId, tenantId, clinicId, "application/pdf", 10, urlAzure2);

        var recovered = false;
        var handler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            if (u == urlDrive || u == urlAzure2)
            {
                throw new InvalidOperationException("Non-migratable links must never hit HTTP network.");
            }
            if (u == url404) return new HttpResponseMessage(HttpStatusCode.NotFound);
            if (u == url410) return new HttpResponseMessage(HttpStatusCode.Gone);
            if (u == urlEmpty) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Array.Empty<byte>(), "application/pdf");
            if (u == url401) return new HttpResponseMessage(HttpStatusCode.Unauthorized);
            if (u == url403) return new HttpResponseMessage(HttpStatusCode.Forbidden);
            if (u == urlHtmlHeader) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Encoding.UTF8.GetBytes("Sign in required"), "text/html");
            if (u == urlHtmlSniff) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Encoding.UTF8.GetBytes("  <!DOCTYPE html><html><body>Login</body></html>"), "application/octet-stream");
            if (u == url503)
            {
                return recovered
                    ? StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Encoding.UTF8.GetBytes("recovered-binary-payload"), "application/pdf")
                    : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "Skip Policy Test",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped
        ), "test");

        var run = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        run.Status.Should().Be(SyncRunStatus.Completed);

        var states = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        states[(SyncStoragePlane.ClinicAttachment, id404)].Status.Should().Be(SyncStorageStatus.SkippedDeadLink);
        states[(SyncStoragePlane.ClinicAttachment, id410)].Status.Should().Be(SyncStorageStatus.SkippedDeadLink);
        states[(SyncStoragePlane.ClinicAttachment, idEmpty)].Status.Should().Be(SyncStorageStatus.SkippedEmptyBlob);
        states[(SyncStoragePlane.ClinicAttachment, id401)].Status.Should().Be(SyncStorageStatus.SkippedAuthRequired);
        states[(SyncStoragePlane.ClinicAttachment, id403)].Status.Should().Be(SyncStorageStatus.SkippedAuthRequired);
        states[(SyncStoragePlane.ClinicAttachment, idHtmlHeader)].Status.Should().Be(SyncStorageStatus.SkippedAuthRequired);
        states[(SyncStoragePlane.ClinicAttachment, idHtmlSniff)].Status.Should().Be(SyncStorageStatus.SkippedAuthRequired);
        states[(SyncStoragePlane.ClinicAttachment, idRetry503)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        states[(SyncStoragePlane.ClinicAttachment, idDrive)].Status.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);
        states[(SyncStoragePlane.ClinicAttachment, idAzure2)].Status.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);

        // Verify ALL DB rows remain EncryptionAlgorithm = 'NONE' and original StorageUri untouched
        foreach (var (id, origUrl) in new[] { (id404, url404), (id401, url401), (idDrive, urlDrive), (idAzure2, urlAzure2), (idRetry503, url503) })
        {
            var (alg, _, _, _, uri) = await ReadClinicCryptoRowAsync(fx, id);
            alg.Should().Be("NONE");
            uri.Should().Be(origUrl);
        }

        // Verify ATTENTION query and zero PHI in DTO serialization
        var attention = await fx.Ledger.ListStorageObjectsAsync(binding.Id, "ATTENTION", null, null, 50, 0);
        attention.TotalCount.Should().Be(10);
        var json = JsonSerializer.Serialize(attention);
        json.Should().NotContain("not-found.pdf");
        json.Should().NotContain("synthetic-id-123");
        json.Should().NotContain("clinicezstorage.blob.core.windows.net");

        // RetryFailed with includeAuthSkipped=false requeues ONLY FAILED_RETRYABLE
        var requeued = await fx.Ledger.RequeueFailedStorageObjectsAsync(binding.Id, includeAuthSkipped: false);
        requeued.Should().Be(1);

        recovered = true;
        var retryRun = await coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None,
            request: new RunSyncRequest(RetryFailedOnly: true));
        retryRun.Status.Should().Be(SyncRunStatus.Completed);

        var afterRetry = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        afterRetry[(SyncStoragePlane.ClinicAttachment, idRetry503)].Status.Should().BeOneOf(SyncStorageStatus.Migrated, SyncStorageStatus.Verified);
        afterRetry[(SyncStoragePlane.ClinicAttachment, id401)].Status.Should().Be(SyncStorageStatus.SkippedAuthRequired);

        // includeAuthSkipped=true requeues the 4 auth-skipped rows
        var requeuedAuth = await fx.Ledger.RequeueFailedStorageObjectsAsync(binding.Id, includeAuthSkipped: true);
        requeuedAuth.Should().Be(4);
    }

    [Fact]
    public async Task Track1AndTrack2_NonClobber_PreservesMigratedCezKeys_AcrossIncrementalBackfillAndForceV1()
    {
        await using var fx = new Pg17TestFixture();
        await fx.InitializeAsync();

        var tenantId = "tnt-nonclobber";
        var v2ClinicId = Guid.NewGuid();
        const int v1ClinicId = 301;
        const int v1UserId = 7001;
        const int v1FileId = 8001;
        const int v1ApptId = 8501;
        const int v1ApptAttId = 8601;

        const string fileUrl = "https://clinicezstorage.blob.core.windows.net/prod/synthetic-doc.pdf";
        const string apptAttUrl = "https://clinicezstorage.blob.core.windows.net/prod/synthetic-appt-att.pdf";
        var docBytes = Encoding.UTF8.GetBytes("%PDF-1.5\nNon-clobber document bytes 12345");
        var apptBytes = Encoding.UTF8.GetBytes("%PDF-1.5\nNon-clobber appointment attachment bytes 67890");

        // Install full Track 1 + Track 2 schemas + Clinic crypto columns
        await Track1ClinicSyncIntegrationTests.InstallExtendedTrack1SchemasAsync(fx);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            ALTER TABLE public."UserAddress" ADD COLUMN IF NOT EXISTS country TEXT;
            ALTER TABLE public."Folder" ADD COLUMN IF NOT EXISTS name TEXT;
            ALTER TABLE public."ClinicPatient" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicalHistory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."Disability" ADD COLUMN IF NOT EXISTS severity TEXT;
            ALTER TABLE public."UserDisability" ADD COLUMN IF NOT EXISTS severity TEXT, ADD COLUMN IF NOT EXISTS reason TEXT, ADD COLUMN IF NOT EXISTS notes TEXT;
            ALTER TABLE public."Vaccine" ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'OTHER';
            ALTER TABLE public."UserVaccination" ADD COLUMN IF NOT EXISTS "hpId" INT;
            ALTER TABLE public."ConsultationDiagnosis" ADD COLUMN IF NOT EXISTS "icd10Code" TEXT, ADD COLUMN IF NOT EXISTS description TEXT, ADD COLUMN IF NOT EXISTS type TEXT;
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, ClinicFullSchemaExtraSql);
        await Track2AndCdcIntegrationTests.ExtendPatientDbSchemaForTrack2Async(fx.PatientConnectionString);

        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            INSERT INTO public."Settings" ("Id", "TenantId", "ClinicId", "ClinicName", "IsDeleted")
            VALUES ('{Guid.NewGuid()}', '{tenantId}', '{v2ClinicId}', 'NonClobber Clinic', false);
            """);

        await using (var v1 = await fx.Connections.OpenV1SourceAsync())
        {
            const string seedV1 = """
                INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
                VALUES (@uid, 'Synth', 'NonClobber', 'MALE', '09170000099', true)
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId")
                VALUES (901, @cid, @uid) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."Folder" (id, "userId", name, "isActive")
                VALUES (9101, @uid, 'Lab Reports', true) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId")
                VALUES (9201, 9101, 'CLINIC', @cid) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."File" (id, "folderId", name, size, url, "mimeType", "isActive")
                VALUES (@fid, 9101, 'initial-lab-report.pdf', 0, @fileUrl, NULL, true);

                INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId")
                VALUES (9301, @fid, 'CLINIC', @cid);

                INSERT INTO public."Appointment" (id, "clinicId", subject)
                VALUES (@apptId, @cid, 'Follow-up');

                INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId")
                VALUES (9401, @apptId, @uid);

                INSERT INTO public."AppointmentAttachment" (id, "appointmentId", name, url)
                VALUES (@apptAttId, @apptId, 'initial-appt-doc.pdf', @apptAttUrl);
                """;
            await using var cmd = new NpgsqlCommand(seedV1, v1);
            cmd.Parameters.AddWithValue("uid", v1UserId);
            cmd.Parameters.AddWithValue("cid", v1ClinicId);
            cmd.Parameters.AddWithValue("fid", v1FileId);
            cmd.Parameters.AddWithValue("fileUrl", fileUrl);
            cmd.Parameters.AddWithValue("apptId", v1ApptId);
            cmd.Parameters.AddWithValue("apptAttId", v1ApptAttId);
            cmd.Parameters.AddWithValue("apptAttUrl", apptAttUrl);
            await cmd.ExecuteNonQueryAsync();
        }

        var t1Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track1Clinic, Name: "T1 NonClobber", V1ClinicId: v1ClinicId, V1OrgId: null, V2TenantId: tenantId, V2ClinicId: v2ClinicId), "test");
        var t2Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient, Name: "T2 NonClobber", V1ClinicId: null, V1OrgId: null, V2TenantId: null, V2ClinicId: null, PatientCohortMode: SyncCohortMode.Global), "test");
        var t3Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage, Name: "T3 NonClobber", V1ClinicId: v1ClinicId, V1OrgId: null, V2TenantId: tenantId, V2ClinicId: v2ClinicId, PatientCohortMode: SyncCohortMode.Global), "test");

        var handler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            if (u == fileUrl) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, docBytes, "application/pdf");
            if (u == apptAttUrl) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, apptBytes, "application/pdf");
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        // 1. Run Track 1 & Track 2 initial Backfill
        var t1Run1 = await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        t1Run1.Status.Should().Be(SyncRunStatus.Completed);
        var t2Run1 = await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        t2Run1.Status.Should().Be(SyncRunStatus.Completed);

        var clinicAttId = DeterministicUuid.ClinicAttachmentFromFileId(v2ClinicId, v1FileId);
        var clinicApptAttId = DeterministicUuid.ClinicAttachmentFromApptAttachmentId(v2ClinicId, v1ApptAttId);
        var patientFileId = DeterministicUuid.PatientFileRecordId(v1FileId);

        // 2. Run Track 3 Backfill -> migrates .cez keys, changes file_records.size_bytes (0 -> actual) & mime_type (NULL -> application/pdf)
        var t3Run = await coordinator.ExecuteAsync(t3Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        t3Run.Status.Should().Be(SyncRunStatus.Completed);

        var (_, _, _, _, clinicUriBefore) = await ReadClinicCryptoRowAsync(fx, clinicAttId);
        var (_, _, _, _, apptUriBefore) = await ReadClinicCryptoRowAsync(fx, clinicApptAttId);
        var (_, _, _, _, patientKeyBefore) = await ReadPatientCryptoRowAsync(fx, patientFileId);
        clinicUriBefore.Should().EndWith(".cez");
        apptUriBefore.Should().EndWith(".cez");
        patientKeyBefore.Should().EndWith(".cez");

        // 3. Mutate v1 metadata (File.name and AppointmentAttachment.name)
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, $"""
            UPDATE public."File" SET name = 'renamed-lab-report.pdf', "updatedAt" = now() WHERE id = {v1FileId};
            UPDATE public."AppointmentAttachment" SET name = 'renamed-appt-doc.pdf' WHERE id = {v1ApptAttId};
            """);

        // 4. Run Track 1 & Track 2 Incremental, Backfill, ForceV1, and Final Sweep
        var t1Inc = await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None);
        t1Inc.Status.Should().Be(SyncRunStatus.Completed);
        var t2Inc = await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None);
        t2Inc.Status.Should().Be(SyncRunStatus.Completed);

        // Zero open V2_MODIFIED conflicts!
        (await fx.Ledger.CountOpenConflictsAsync(t1Binding.Id)).Should().Be(0);
        (await fx.Ledger.CountOpenConflictsAsync(t2Binding.Id)).Should().Be(0);

        // Also verify Backfill & ForceV1 & FinalSweep preserve .cez and metadata updates
        await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        await fx.Track1.ForceSyncEntityAsync(t1Binding, "RecordAttachment", $"file:{v1FileId}", clinicAttId, "test", CancellationToken.None);
        await fx.Track2.ForceSyncEntityAsync(t2Binding, "FileRecord", v1FileId.ToString(), patientFileId, "test", CancellationToken.None);
        await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);

        (await fx.Ledger.CountOpenConflictsAsync(t1Binding.Id)).Should().Be(0);
        (await fx.Ledger.CountOpenConflictsAsync(t2Binding.Id)).Should().Be(0);

        // Verify .cez keys & AES-256-GCM preserved AND new filenames synced cleanly
        var (cAlgAfter, _, _, _, cUriAfter) = await ReadClinicCryptoRowAsync(fx, clinicAttId);
        var (aaAlgAfter, _, _, _, aaUriAfter) = await ReadClinicCryptoRowAsync(fx, clinicApptAttId);
        var (pAlgAfter, _, _, _, pKeyAfter) = await ReadPatientCryptoRowAsync(fx, patientFileId);

        cAlgAfter.Should().Be("AES-256-GCM");
        cUriAfter.Should().Be(clinicUriBefore);
        aaAlgAfter.Should().Be("AES-256-GCM");
        aaUriAfter.Should().Be(apptUriBefore);
        pAlgAfter.Should().Be("AES-256-GCM");
        pKeyAfter.Should().Be(patientKeyBefore);

        await using var cConn = await fx.Connections.OpenClinicDbAsync();
        await using (var cmd = new NpgsqlCommand($"SELECT \"FileName\" FROM public.\"RecordAttachments\" WHERE \"Id\" = '{clinicAttId}'", cConn))
        {
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("renamed-lab-report.pdf");
        }
        await using (var cmd = new NpgsqlCommand($"SELECT \"FileName\" FROM public.\"RecordAttachments\" WHERE \"Id\" = '{clinicApptAttId}'", cConn))
        {
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("renamed-appt-doc.pdf");
        }

        await using var pConn = await fx.Connections.OpenPatientDbAsync();
        await using (var cmd = new NpgsqlCommand($"SELECT file_name FROM public.file_records WHERE id = '{patientFileId}'", pConn))
        {
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("renamed-lab-report.pdf");
        }
    }

    [Fact]
    public async Task PrerequisiteGating_DryRunZeroWrites_FinalSweepVerification_AndAutoSyncWithoutV1Source()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-gate";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var attId = Guid.NewGuid();
        var skippedDriveId = Guid.NewGuid();

        const string validUrl = "https://clinicezstorage.blob.core.windows.net/prod/synthetic-gate.pdf";
        const string driveUrl = "https://drive.google.com/file/d/gate-drive/view";
        var payload = Encoding.UTF8.GetBytes("Gate and FinalSweep payload bytes");

        var handler = new StubHttpMessageHandler(req =>
        {
            if (req.RequestUri!.ToString() == validUrl)
            {
                return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf");
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client, verificationSampleRate: 0.01);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "Gate & Sweep Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped,
            AutoSyncEnabled: true,
            PollIntervalSeconds: 10
        ), "test");

        // 1. Empty Clinic & Patient tables -> ArgumentException (HTTP 400 gate) for BOTH Backfill AND DryRun
        Func<Task> gatedSync = () => coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        await gatedSync.Should().ThrowAsync<ArgumentException>();

        Func<Task> gatedAsync = () => coordinator.StartBackgroundImportAsync(binding.Id, SyncRunMode.Backfill, null, false, null, "test", CancellationToken.None);
        await gatedAsync.Should().ThrowAsync<ArgumentException>();

        Func<Task> gatedDrySync = () => coordinator.ExecuteAsync(binding.Id, SyncRunMode.DryRun, null, false, "test", CancellationToken.None);
        await gatedDrySync.Should().ThrowAsync<ArgumentException>();

        Func<Task> gatedDryAsync = () => coordinator.StartBackgroundImportAsync(binding.Id, SyncRunMode.DryRun, null, false, null, "test", CancellationToken.None);
        await gatedDryAsync.Should().ThrowAsync<ArgumentException>();

        // 2. Seed metadata
        await SeedClinicAttachmentAsync(fx, attId, patientId, tenantId, clinicId, "application/pdf", payload.Length, validUrl);
        await SeedClinicAttachmentAsync(fx, skippedDriveId, patientId, tenantId, clinicId, "application/pdf", 0, driveUrl);

        // 3. DRY_RUN -> zero R2 puts, zero sync_storage_objects writes, zero DB encryption updates
        var dryRun = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.DryRun, null, false, "test", CancellationToken.None);
        dryRun.Status.Should().Be(SyncRunStatus.Completed);
        clinicS3.CountObjects("clinicez-clinic-test").Should().Be(0);
        (await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id)).Should().BeEmpty();
        (await ReadClinicCryptoRowAsync(fx, attId)).Alg.Should().Be("NONE");

        // 4. Auto-sync poll WITHOUT V1Source configured
        var noV1Config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                ["V1Sync:MaxPoolSize"] = "2"
            })
            .Build();
        await using var noV1Connections = new SyncConnectionFactory(noV1Config, NullLogger<SyncConnectionFactory>.Instance);
        noV1Connections.HasV1Source.Should().BeFalse();
        var (noV1Engine, noV1Coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client, customConnections: noV1Connections);

        await noV1Coordinator.PollAutoSyncBindingsAsync(CancellationToken.None);
        var afterPoll = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        afterPoll.Should().ContainKey((SyncStoragePlane.ClinicAttachment, attId));
        afterPoll[(SyncStoragePlane.ClinicAttachment, attId)].Status.Should().BeOneOf(SyncStorageStatus.Migrated, SyncStorageStatus.Verified);
        afterPoll[(SyncStoragePlane.ClinicAttachment, skippedDriveId)].Status.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);

        // 5. Reset to MIGRATED and run FINAL_SWEEP -> verifies all and achieves ReadyToFreeze = true even with SKIPPED_LEGACY_UNSUPPORTED
        await Pg17TestFixture.ExecuteSqlAsync(fx.SyncConnectionString,
            $"UPDATE sync_storage_objects SET status = 'MIGRATED', verified_at = NULL WHERE binding_id = '{binding.Id}' AND target_entity_id = '{attId}'");
        var sweepRun = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        sweepRun.Status.Should().Be(SyncRunStatus.Completed);

        var afterSweep = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        afterSweep[(SyncStoragePlane.ClinicAttachment, attId)].Status.Should().Be(SyncStorageStatus.Verified);

        var parity = await noV1Engine.BuildParityReportAsync(binding);
        parity.ReadyToFreeze.Should().BeTrue();
        parity.Checks.Should().Contain(c => c.EntityType.Contains("Skipped") && c.IsMatched);
    }

    [Fact]
    public async Task WebApplicationFactory_DevelopmentBoot_And_Endpoints_Contract()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-waf";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var okAttId = Guid.NewGuid();
        var retryAttId = Guid.NewGuid();

        const string okUrl = "https://clinicezstorage.blob.core.windows.net/prod/waf-ok.pdf";
        const string retryUrl = "https://clinicezstorage.blob.core.windows.net/prod/waf-503.pdf";
        var okBytes = Encoding.UTF8.GetBytes("%PDF-1.7\nWAF boot test payload bytes");
        var retryBytes = Encoding.UTF8.GetBytes("%PDF-1.7\nWAF retry recovered bytes");
        var recovered = false;

        var httpHandler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            if (u == okUrl) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, okBytes, "application/pdf");
            if (u == retryUrl)
            {
                return recovered
                    ? StubHttpMessageHandler.Bytes(HttpStatusCode.OK, retryBytes, "application/pdf")
                    : new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, cfg) =>
            {
                cfg.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:V1Source"] = fx.V1ConnectionString,
                    ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                    ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                    ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                    ["V1Sync:EnableBackgroundWorker"] = "false",
                    ["V1Sync:AllowUnauthenticatedLocalDev"] = "false",
                    ["V1Sync:LocalAdminKey"] = "waf-test-admin-key",
                    ["ClinicEncryption:MasterSecret"] = ClinicSecret1,
                    ["PatientEncryption:MasterSecret"] = PatientSecret1,
                    ["Track3Storage:Enabled"] = "true",
                    ["Track3Storage:AzureBlob1Enabled"] = "true",
                    ["Track3Storage:AzureBlob1OriginOverride"] = ""
                });
            });
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IHttpClientFactory>();
                services.AddSingleton<IHttpClientFactory>(new StubHttpClientFactory(httpHandler));
                services.RemoveAll<Track3R2ClientPool>();
                services.AddSingleton(new Track3R2ClientPool(
                    clinicS3.Client, "clinicez-clinic-test",
                    patientS3.Client, "clinicez-patient-test",
                    NullLogger<Track3R2ClientPool>.Instance));
            });
        });

        // Verify DI activates LegacyBlobSourceDownloader cleanly without ambiguous constructor exception
        var resolvedDownloader = factory.Services.GetRequiredService<LegacyBlobSourceDownloader>();
        resolvedDownloader.Should().NotBeNull();

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-V1-Sync-Admin-Key", "waf-test-admin-key");

        // 1. GET /status camelCase contract
        var statusResp = await client.GetAsync("/api/v1/v1-sync/status");
        statusResp.StatusCode.Should().Be(HttpStatusCode.OK);
        using (var statusDoc = JsonDocument.Parse(await statusResp.Content.ReadAsStringAsync()))
        {
            var root = statusDoc.RootElement;
            root.GetProperty("clinicR2Connected").GetBoolean().Should().BeTrue();
            root.GetProperty("patientR2Connected").GetBoolean().Should().BeTrue();
            root.GetProperty("clinicEncryptionConfigured").GetBoolean().Should().BeTrue();
            root.GetProperty("patientEncryptionConfigured").GetBoolean().Should().BeTrue();
            root.GetProperty("azureBlob1Configured").GetBoolean().Should().BeTrue();
            root.TryGetProperty("clinicPendingStorageCount", out _).Should().BeTrue();
            root.TryGetProperty("patientPendingStorageCount", out _).Should().BeTrue();
            root.TryGetProperty("clinicTotalStorageCount", out _).Should().BeTrue();
            root.TryGetProperty("patientTotalStorageCount", out _).Should().BeTrue();
            root.TryGetProperty("clinicSkippedStorageCount", out _).Should().BeTrue();
            root.TryGetProperty("patientSkippedStorageCount", out _).Should().BeTrue();
        }

        // 2. POST /bindings for TRACK3_STORAGE
        var createResp = await client.PostAsJsonAsync("/api/v1/v1-sync/bindings", new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "WAF Track3 Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped));
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdBinding = await createResp.Content.ReadFromJsonAsync<SyncBinding>();
        createdBinding.Should().NotBeNull();

        // 3. Empty DB -> BOTH /dry-run and /backfill return 400 Bad Request
        var emptyDryResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{createdBinding!.Id}/dry-run", new { });
        emptyDryResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var emptyBackfillResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{createdBinding.Id}/backfill", new { });
        emptyBackfillResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // 4. Seed metadata -> /dry-run returns 200 OK (zero writes), /backfill returns 200 OK
        await SeedClinicAttachmentAsync(fx, okAttId, patientId, tenantId, clinicId, "application/pdf", okBytes.Length, okUrl);
        await SeedClinicAttachmentAsync(fx, retryAttId, patientId, tenantId, clinicId, "application/pdf", retryBytes.Length, retryUrl);

        var dryRunResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{createdBinding.Id}/dry-run", new { });
        dryRunResp.StatusCode.Should().Be(HttpStatusCode.OK);
        clinicS3.CountObjects("clinicez-clinic-test").Should().Be(0);

        var backfillResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{createdBinding.Id}/backfill", new { });
        backfillResp.StatusCode.Should().Be(HttpStatusCode.OK);
        clinicS3.CountObjects("clinicez-clinic-test").Should().Be(1);

        // 5. GET /storage-objects -> totalCount = 2 and zero PHI
        var listResp = await client.GetAsync($"/api/v1/v1-sync/bindings/{createdBinding.Id}/storage-objects");
        listResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var listJson = await listResp.Content.ReadAsStringAsync();
        listJson.Should().NotContain("waf-ok.pdf");
        listJson.Should().NotContain("waf-503.pdf");
        listJson.Should().NotContain("clinicezstorage.blob.core.windows.net");
        listJson.Should().NotContain(".cez");
        var listDto = JsonSerializer.Deserialize<StorageObjectsResponse>(listJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        listDto.TotalCount.Should().Be(2);

        // 6. POST /retry-failed?asyncMode=false -> 200 OK; ?asyncMode=true -> 202 Accepted; GET /parity -> readyToFreeze
        recovered = true;
        var retrySyncResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{createdBinding.Id}/retry-failed?asyncMode=false", new { });
        retrySyncResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var parityResp = await client.GetAsync($"/api/v1/v1-sync/bindings/{createdBinding.Id}/parity");
        parityResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var parityDto = await parityResp.Content.ReadFromJsonAsync<ParityReportResponse>();
        parityDto!.ReadyToFreeze.Should().BeTrue();

        var retryAsyncResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{createdBinding.Id}/retry-failed?asyncMode=true", new { });
        retryAsyncResp.StatusCode.Should().Be(HttpStatusCode.Accepted);
        await Task.Delay(250);
    }

    [Fact]
    public async Task ConcurrentDbFlipRace_V2ConcurrentlyEncryptsRow_DoesNotClobberOrCrashStage4()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-race";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var attId = Guid.NewGuid();
        var deletedPatientFileId = Guid.NewGuid();

        const string clinicUrl = "https://clinicezstorage.blob.core.windows.net/prod/race-clinic.pdf";
        const string patientUrl = "https://clinicezstorage.blob.core.windows.net/prod/race-patient.pdf";
        var clinicBytes = Encoding.UTF8.GetBytes("Clinic concurrent race bytes");
        var patientBytes = Encoding.UTF8.GetBytes("Patient concurrent delete bytes");

        await SeedClinicAttachmentAsync(fx, attId, patientId, tenantId, clinicId, "application/pdf", clinicBytes.Length, clinicUrl);
        await SeedPatientAndFileAsync(fx, patientId, deletedPatientFileId, clinicId, "application/pdf", patientBytes.Length, patientUrl);

        var handler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            if (u == clinicUrl) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, clinicBytes, "application/pdf");
            if (u == patientUrl) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, patientBytes, "application/pdf");
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();

        // Simulate concurrent v2 encryption right when PutObjectAsync completes
        clinicS3.OnPutObject = _ =>
        {
            Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $$"""
                UPDATE public."RecordAttachments"
                SET "EncryptionAlgorithm" = 'AES-256-GCM',
                    "EncryptionKeyId" = 'cmk-v1',
                    "StorageUri" = 'v2-concurrent-key.cez',
                    "EncryptionIvBase64" = 'AAAA',
                    "EncryptionTagBase64" = 'BBBB',
                    "WrappedKeyJson" = '{}'
                WHERE "Id" = '{{attId}}';
                """).GetAwaiter().GetResult();
        };

        // Simulate concurrent soft-delete in Patient DB right when PutObjectAsync completes
        patientS3.OnPutObject = _ =>
        {
            Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, $"""
                UPDATE public.file_records
                SET is_deleted = true
                WHERE id = '{deletedPatientFileId}';
                """).GetAwaiter().GetResult();
        };

        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client, verificationSampleRate: 1.0);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "Race Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Global
        ), "test");

        var run = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        run.Status.Should().Be(SyncRunStatus.Completed);

        var summary = JsonSerializer.Deserialize<SyncRunSummary>(run.Summary.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        summary.ClinicCopiesMigrated.Should().Be(0);
        summary.PatientCopiesMigrated.Should().Be(0);

        // v2 DB row MUST NOT be clobbered
        var (alg, _, _, _, uri) = await ReadClinicCryptoRowAsync(fx, attId);
        alg.Should().Be("AES-256-GCM");
        uri.Should().Be("v2-concurrent-key.cez");

        // Ledger MUST NOT mark either item as MIGRATED
        var states = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        states[(SyncStoragePlane.ClinicAttachment, attId)].Status.Should().Be(SyncStorageStatus.Verified);
        states.Should().NotContainKey((SyncStoragePlane.PatientFile, deletedPatientFileId));

        // Final sweep also runs cleanly without Stage 4 mismatch crash
        var sweep = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        sweep.Status.Should().Be(SyncRunStatus.Completed);
    }

    [Fact]
    public async Task SasToken_LogHygiene_And_NosigQueryBoundary()
    {
        const string secretSig = "TOP_SECRET_SAS_SIG_DO_NOT_LEAK_998877";
        var opts = Options.Create(new Track3StorageOptions
        {
            Enabled = true,
            AzureBlob1Enabled = true,
            AzureAccounts = new Dictionary<string, AzureAccountAuthOptions>(StringComparer.OrdinalIgnoreCase)
            {
                ["clinicezstorage"] = new AzureAccountAuthOptions { SasToken = $"?sv=2022-11-02&sig={secretSig}" }
            }
        });

        var capturedUris = new List<string>();
        var handler = new StubHttpMessageHandler(req =>
        {
            capturedUris.Add(req.RequestUri!.ToString());
            if (req.RequestUri.AbsolutePath.EndsWith("fail.pdf", StringComparison.Ordinal))
            {
                throw new HttpRequestException($"Connection failed for {req.RequestUri}");
            }
            return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Encoding.UTF8.GetBytes("ok-sas-bytes"), "application/pdf");
        });

        var logger = new CapturingLogger<LegacyBlobSourceDownloader>();
        var downloader = new LegacyBlobSourceDownloader(new HttpClient(handler), opts, logger);

        // 1. ?nosig=1 MUST still append configured SAS token
        var nosigResult = await downloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/ok.pdf?nosig=1", "application/pdf");
        nosigResult.Success.Should().BeTrue();
        capturedUris[0].Should().Contain("nosig=1");
        capturedUris[0].Should().Contain($"sig={secretSig}");

        // 2. Existing ?sig= parameter MUST NOT double-append configured SAS token
        var existingSigResult = await downloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/ok.pdf?sv=2022&sig=EXISTING_SIG", "application/pdf");
        existingSigResult.Success.Should().BeTrue();
        capturedUris[1].Should().Contain("sig=EXISTING_SIG");
        capturedUris[1].Should().NotContain(secretSig);

        // 3. HttpRequestException warning log MUST NEVER leak SAS secret or request URI
        var failResult = await downloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/fail.pdf?nosig=1", "application/pdf");
        failResult.Success.Should().BeFalse();
        failResult.FailureStatus.Should().Be(SyncStorageStatus.FailedRetryable);

        logger.Entries.Should().NotBeEmpty();
        foreach (var entry in logger.Entries)
        {
            entry.Message.Should().NotContain(secretSig);
            entry.Message.Should().NotContain("sv=2022-11-02");
            entry.Message.Should().NotContain("clinicezstorage.blob.core.windows.net");
            entry.Message.Should().Contain(nameof(HttpRequestException));
            entry.Exception.Should().BeNull();
        }
    }

    [Fact]
    public async Task TwoStep_Track1AndTrack2_NonClobber_ProtectedFieldMutationThenRename_ZeroFalseConflicts()
    {
        await using var fx = new Pg17TestFixture();
        await fx.InitializeAsync();

        var tenantId = "tnt-twostep";
        var v2ClinicId = Guid.NewGuid();
        const int v1ClinicId = 401;
        const int v1UserId = 8001;
        const int v1FileId = 9001;
        const int v1ApptId = 9501;
        const int v1ApptAttId = 9601;

        const string fileUrl1 = "https://clinicezstorage.blob.core.windows.net/prod/step0-doc.pdf";
        const string fileUrl2 = "https://clinicezstorage.blob.core.windows.net/prod/step1-doc.png";
        const string apptUrl1 = "https://clinicezstorage.blob.core.windows.net/prod/appt-step0.pdf";
        const string apptUrl2 = "https://clinicezstorage.blob.core.windows.net/prod/appt-step1.pdf";
        var docBytes = Encoding.UTF8.GetBytes("%PDF-1.5\nTwo-step non-clobber doc bytes");
        var apptBytes = Encoding.UTF8.GetBytes("%PDF-1.5\nTwo-step non-clobber appt bytes");

        await Track1ClinicSyncIntegrationTests.InstallExtendedTrack1SchemasAsync(fx);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            ALTER TABLE public."UserAddress" ADD COLUMN IF NOT EXISTS country TEXT;
            ALTER TABLE public."Folder" ADD COLUMN IF NOT EXISTS name TEXT;
            ALTER TABLE public."ClinicPatient" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicalHistory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."Disability" ADD COLUMN IF NOT EXISTS severity TEXT;
            ALTER TABLE public."UserDisability" ADD COLUMN IF NOT EXISTS severity TEXT, ADD COLUMN IF NOT EXISTS reason TEXT, ADD COLUMN IF NOT EXISTS notes TEXT;
            ALTER TABLE public."Vaccine" ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'OTHER';
            ALTER TABLE public."UserVaccination" ADD COLUMN IF NOT EXISTS "hpId" INT;
            ALTER TABLE public."ConsultationDiagnosis" ADD COLUMN IF NOT EXISTS "icd10Code" TEXT, ADD COLUMN IF NOT EXISTS description TEXT, ADD COLUMN IF NOT EXISTS type TEXT;
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, ClinicFullSchemaExtraSql);
        await Track2AndCdcIntegrationTests.ExtendPatientDbSchemaForTrack2Async(fx.PatientConnectionString);

        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            INSERT INTO public."Settings" ("Id", "TenantId", "ClinicId", "ClinicName", "IsDeleted")
            VALUES ('{Guid.NewGuid()}', '{tenantId}', '{v2ClinicId}', 'TwoStep Clinic', false);
            """);

        await using (var v1 = await fx.Connections.OpenV1SourceAsync())
        {
            const string seedV1 = """
                INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
                VALUES (@uid, 'Synth', 'TwoStep', 'MALE', '09170000123', true)
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId")
                VALUES (951, @cid, @uid) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."Folder" (id, "userId", name, "isActive")
                VALUES (9601, @uid, 'Lab Reports', true) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId")
                VALUES (9701, 9601, 'CLINIC', @cid) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."File" (id, "folderId", name, size, url, "mimeType", "isActive")
                VALUES (@fid, 9601, 'step0-report.pdf', 0, @fileUrl, NULL, true);

                INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId")
                VALUES (9801, @fid, 'CLINIC', @cid);

                INSERT INTO public."Appointment" (id, "clinicId", subject)
                VALUES (@apptId, @cid, 'Follow-up');

                INSERT INTO public."AppointmentRequester" (id, "appointmentId", "userId")
                VALUES (9901, @apptId, @uid);

                INSERT INTO public."AppointmentAttachment" (id, "appointmentId", name, url)
                VALUES (@apptAttId, @apptId, 'appt-step0.pdf', @apptUrl);
                """;
            await using var cmd = new NpgsqlCommand(seedV1, v1);
            cmd.Parameters.AddWithValue("uid", v1UserId);
            cmd.Parameters.AddWithValue("cid", v1ClinicId);
            cmd.Parameters.AddWithValue("fid", v1FileId);
            cmd.Parameters.AddWithValue("fileUrl", fileUrl1);
            cmd.Parameters.AddWithValue("apptId", v1ApptId);
            cmd.Parameters.AddWithValue("apptAttId", v1ApptAttId);
            cmd.Parameters.AddWithValue("apptUrl", apptUrl1);
            await cmd.ExecuteNonQueryAsync();
        }

        var t1Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track1Clinic, Name: "T1 TwoStep", V1ClinicId: v1ClinicId, V1OrgId: null, V2TenantId: tenantId, V2ClinicId: v2ClinicId), "test");
        var t2Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient, Name: "T2 TwoStep", V1ClinicId: null, V1OrgId: null, V2TenantId: null, V2ClinicId: null, PatientCohortMode: SyncCohortMode.Global), "test");
        var t3Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage, Name: "T3 TwoStep", V1ClinicId: v1ClinicId, V1OrgId: null, V2TenantId: tenantId, V2ClinicId: v2ClinicId, PatientCohortMode: SyncCohortMode.Global), "test");

        var handler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            if (u == fileUrl1) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, docBytes, "application/pdf");
            if (u == apptUrl1) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, apptBytes, "application/pdf");
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        // Initial Track 1 & 2 Backfill + Track 3 migration
        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t3Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);

        var clinicAttId = DeterministicUuid.ClinicAttachmentFromFileId(v2ClinicId, v1FileId);
        var clinicApptAttId = DeterministicUuid.ClinicAttachmentFromApptAttachmentId(v2ClinicId, v1ApptAttId);
        var patientFileId = DeterministicUuid.PatientFileRecordId(v1FileId);

        var (_, _, _, _, clinicUriBefore) = await ReadClinicCryptoRowAsync(fx, clinicAttId);
        var (_, _, _, _, apptUriBefore) = await ReadClinicCryptoRowAsync(fx, clinicApptAttId);
        var (_, _, _, _, patientKeyBefore) = await ReadPatientCryptoRowAsync(fx, patientFileId);

        // Step 1 v1 edit: mutate protected fields (mimeType, size, url) and run Track 1 & 2 Incremental
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, $"""
            UPDATE public."File" SET "mimeType" = 'image/png', size = 999, url = '{fileUrl2}', "updatedAt" = now() WHERE id = {v1FileId};
            UPDATE public."AppointmentAttachment" SET url = '{apptUrl2}' WHERE id = {v1ApptAttId};
            """);
        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);

        // Step 2 v1 edit: mutate File.name and AppointmentAttachment.name, then run Incremental + Backfill + FinalSweep
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, $"""
            UPDATE public."File" SET name = 'step2-renamed.pdf', "updatedAt" = now() WHERE id = {v1FileId};
            UPDATE public."AppointmentAttachment" SET name = 'appt-step2-renamed.pdf' WHERE id = {v1ApptAttId};
            """);
        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);

        // MUST have zero false V2_MODIFIED conflicts in BOTH Track 1 and Track 2!
        (await fx.Ledger.CountOpenConflictsAsync(t1Binding.Id)).Should().Be(0);
        (await fx.Ledger.CountOpenConflictsAsync(t2Binding.Id)).Should().Be(0);

        // .cez keys preserved & new filenames synced cleanly
        (await ReadClinicCryptoRowAsync(fx, clinicAttId)).Uri.Should().Be(clinicUriBefore);
        (await ReadClinicCryptoRowAsync(fx, clinicApptAttId)).Uri.Should().Be(apptUriBefore);
        (await ReadPatientCryptoRowAsync(fx, patientFileId)).Key.Should().Be(patientKeyBefore);

        // Genuine v2 modification to non-protected Title still raises a real V2_MODIFIED conflict
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            UPDATE public."RecordAttachments" SET "Title" = 'V2 Manual Title Edit' WHERE "Id" = '{clinicAttId}';
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, $"""
            UPDATE public."File" SET name = 'step3-conflict-check.pdf', "updatedAt" = now() WHERE id = {v1FileId};
            """);
        await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None);
        (await fx.Ledger.CountOpenConflictsAsync(t1Binding.Id)).Should().Be(1);
    }

    [Fact]
    public async Task AzureBlob1OriginOverride_DevelopmentOnly_RewritesOriginAndRespectsAllowlist()
    {
        var requestedUris = new List<string>();
        var payload = Encoding.UTF8.GetBytes("Mock AzureBlob1 override payload");
        var handler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            requestedUris.Add(u);
            if (u.Contains("/prod/redirect-source.pdf", StringComparison.Ordinal))
            {
                var resp = new HttpResponseMessage(HttpStatusCode.Found);
                resp.Headers.Location = new Uri("http://127.0.0.1:18080/prod/redirect-target.pdf");
                return resp;
            }
            if (u.Contains("/prod/unsafe-redirect.pdf", StringComparison.Ordinal))
            {
                var resp = new HttpResponseMessage(HttpStatusCode.Found);
                resp.Headers.Location = new Uri("https://login.microsoftonline.com/common/oauth2");
                return resp;
            }
            return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf");
        });

        var opts = Options.Create(new Track3StorageOptions
        {
            Enabled = true,
            AzureBlob1Enabled = true,
            AzureBlob1OriginOverride = "http://127.0.0.1:18080",
            AzureAccounts = new Dictionary<string, AzureAccountAuthOptions>(StringComparer.OrdinalIgnoreCase)
            {
                ["clinicezstorage"] = new AzureAccountAuthOptions { SasToken = "?sv=2022&sig=DEV_OVERRIDE_SAS" }
            }
        });

        // 1. Development environment -> rewrites origin for AzureBlob1 only
        var devEnv = new SimpleHostEnvironment(Environments.Development);
        var devDownloader = new LegacyBlobSourceDownloader(new HttpClient(handler), opts, NullLogger<LegacyBlobSourceDownloader>.Instance, devEnv);

        var devDl = await devDownloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/report.pdf?foo=1", "application/pdf");
        devDl.Success.Should().BeTrue();
        requestedUris.Last().Should().Be("http://127.0.0.1:18080/prod/report.pdf?foo=1&sv=2022&sig=DEV_OVERRIDE_SAS");

        var devProbe = await devDownloader.ProbeReachableAsync("https://clinicezstorage.blob.core.windows.net/prod/report.pdf");
        devProbe.Reachable.Should().BeTrue();
        requestedUris.Last().Should().Be("http://127.0.0.1:18080/prod/report.pdf?sv=2022&sig=DEV_OVERRIDE_SAS");

        // Same-override redirect allowed
        var redirectOk = await devDownloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/redirect-source.pdf", "application/pdf");
        redirectOk.Success.Should().BeTrue();
        requestedUris.Last().Should().Be("http://127.0.0.1:18080/prod/redirect-target.pdf");

        // Off-host auth redirect still blocked as SKIPPED_AUTH_REQUIRED
        var redirectBlocked = await devDownloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/unsafe-redirect.pdf", "application/pdf");
        redirectBlocked.Success.Should().BeFalse();
        redirectBlocked.FailureStatus.Should().Be(SyncStorageStatus.SkippedAuthRequired);

        // Non-AzureBlob1 links NEVER rewritten and produce 0 network calls
        var countBeforeSkipped = requestedUris.Count;
        var driveSkip = await devDownloader.DownloadAsync("https://drive.google.com/file/d/xyz/view", "application/pdf");
        driveSkip.FailureStatus.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);
        var azure2Skip = await devDownloader.DownloadAsync("https://clinicez.blob.core.windows.net/legacy/x.pdf", "application/pdf");
        azure2Skip.FailureStatus.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);
        var httpSkip = await devDownloader.DownloadAsync("http://clinicezstorage.blob.core.windows.net/prod/insecure.pdf", "application/pdf");
        httpSkip.FailureStatus.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);
        requestedUris.Count.Should().Be(countBeforeSkipped);

        // 2. Production environment -> NEVER rewrites origin even when AzureBlob1OriginOverride is set
        var prodEnv = new SimpleHostEnvironment(Environments.Production);
        var prodDownloader = new LegacyBlobSourceDownloader(new HttpClient(handler), opts, NullLogger<LegacyBlobSourceDownloader>.Instance, prodEnv);
        var prodDl = await prodDownloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/report.pdf", "application/pdf");
        prodDl.Success.Should().BeTrue();
        requestedUris.Last().Should().Be("https://clinicezstorage.blob.core.windows.net/prod/report.pdf?sv=2022&sig=DEV_OVERRIDE_SAS");

        // 3. Null IHostEnvironment -> NEVER rewrites origin
        var nullEnvDownloader = new LegacyBlobSourceDownloader(new HttpClient(handler), opts, NullLogger<LegacyBlobSourceDownloader>.Instance, hostEnvironment: null);
        var nullEnvDl = await nullEnvDownloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/report.pdf", "application/pdf");
        nullEnvDl.Success.Should().BeTrue();
        requestedUris.Last().Should().Be("https://clinicezstorage.blob.core.windows.net/prod/report.pdf?sv=2022&sig=DEV_OVERRIDE_SAS");

        // 4. WebApplicationFactory DI resolution in Development vs Production verifies IHostEnvironment injection
        await using var fx = await CreateTrack3TestFixtureAsync();
        using (var devFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment(Environments.Development);
            b.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                ["V1Sync:EnableBackgroundWorker"] = "false",
                ["Track3Storage:AzureBlob1OriginOverride"] = "http://127.0.0.1:18080"
            }));
            b.ConfigureServices(s =>
            {
                s.RemoveAll<IHttpClientFactory>();
                s.AddSingleton<IHttpClientFactory>(new StubHttpClientFactory(handler));
            });
        }))
        {
            var diDevDownloader = devFactory.Services.GetRequiredService<LegacyBlobSourceDownloader>();
            var r = await diDevDownloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/di-dev.pdf", "application/pdf");
            r.Success.Should().BeTrue();
            requestedUris.Last().Should().Be("http://127.0.0.1:18080/prod/di-dev.pdf");
        }

        using (var prodFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment(Environments.Production);
            b.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                ["V1Sync:EnableBackgroundWorker"] = "false",
                ["Track3Storage:AzureBlob1OriginOverride"] = "http://127.0.0.1:18080"
            }));
            b.ConfigureServices(s =>
            {
                s.RemoveAll<IHttpClientFactory>();
                s.AddSingleton<IHttpClientFactory>(new StubHttpClientFactory(handler));
            });
        }))
        {
            var diProdDownloader = prodFactory.Services.GetRequiredService<LegacyBlobSourceDownloader>();
            var r = await diProdDownloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/di-prod.pdf", "application/pdf");
            r.Success.Should().BeTrue();
            requestedUris.Last().Should().Be("https://clinicezstorage.blob.core.windows.net/prod/di-prod.pdf");
        }
    }

    [Fact]
    public async Task ConcurrentMultiBinding_SharedScopedPatient_DoesNotOverwriteCezOrCorruptCiphertext()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var fileId = Guid.NewGuid();
        const string sharedUrl = "https://clinicezstorage.blob.core.windows.net/prod/shared-scoped-patient.pdf";
        var payload = Encoding.UTF8.GetBytes("%PDF-1.7\nConcurrent multi-binding Probe2B regression payload 0123456789!");
        var expectedKey = $"patients/{patientId}/records/{fileId}.cez";

        await using (var pConn = await fx.Connections.OpenPatientDbAsync())
        {
            const string seedSql = """
                INSERT INTO public.clinics (id, name) VALUES (@ca, 'Clinic A'), (@cb, 'Clinic B');
                INSERT INTO public.patients (id, client_id, clinic_ez_id, first_name, last_name, created_by)
                VALUES (@pid, @pid, @cez, 'SynthFirst', 'SynthLast', 'test');
                INSERT INTO public.clinic_memberships (
                    id, client_id, patient_id, clinic_id, status,
                    consent_privacy_policy, consent_terms_and_conditions, consent_data_sharing,
                    consented_at, created_by, is_deleted
                ) VALUES
                    (@m1, @m1, @pid, @ca, 'Active', true, true, true, now(), 'test', false),
                    (@m2, @m2, @pid, @cb, 'Active', true, true, true, now(), 'test', false);
                INSERT INTO public.file_records (
                    id, client_id, patient_id, clinic_id, file_name, mime_type, extension,
                    size_bytes, storage_key, document_type_id, sync_status, uploaded_at,
                    encryption_algorithm, title, created_by, is_deleted
                ) VALUES (
                    @fid, @fid, @pid, NULL, 'shared-scoped.pdf', 'application/pdf', 'pdf',
                    @sz, @url, '66666666-6666-6666-6666-666666666666', 'Synced', now(),
                    'NONE', 'Shared Scoped File', 'test', false
                );
                """;
            await using var cmd = new NpgsqlCommand(seedSql, pConn);
            cmd.Parameters.AddWithValue("ca", clinicA);
            cmd.Parameters.AddWithValue("cb", clinicB);
            cmd.Parameters.AddWithValue("pid", patientId);
            cmd.Parameters.AddWithValue("cez", $"CEZ-{patientId.ToString("N")[..8]}");
            cmd.Parameters.AddWithValue("m1", Guid.NewGuid());
            cmd.Parameters.AddWithValue("m2", Guid.NewGuid());
            cmd.Parameters.AddWithValue("fid", fileId);
            cmd.Parameters.AddWithValue("sz", payload.LongLength);
            cmd.Parameters.AddWithValue("url", sharedUrl);
            await cmd.ExecuteNonQueryAsync();
        }

        var bindingA = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "ClinicA-Scoped",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: "tnt-a",
            V2ClinicId: clinicA,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        var bindingB = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "ClinicB-Scoped",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: "tnt-b",
            V2ClinicId: clinicB,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        // Synchronize Stage 3 downloads so BOTH bindings finish Stage 1 (reading encryption_algorithm = 'NONE'),
        // then Winner finishes upload + DB flip + Stage 4 GetObject before Follower proceeds from download.
        var downloadSeq = 0;
        var bothEnteredStage3 = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var winnerFinishedUploadAndDb = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var handler = new StubHttpMessageHandler(async (req, ct) =>
        {
            if (req.RequestUri!.ToString() != sharedUrl)
            {
                return new HttpResponseMessage(HttpStatusCode.NotFound);
            }

            var seq = Interlocked.Increment(ref downloadSeq);
            if (seq == 1)
            {
                await bothEnteredStage3.Task.WaitAsync(TimeSpan.FromSeconds(15), ct);
            }
            else if (seq == 2)
            {
                bothEnteredStage3.TrySetResult();
                await winnerFinishedUploadAndDb.Task.WaitAsync(TimeSpan.FromSeconds(15), ct);
            }

            return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf");
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        patientS3.OnGetObject = req =>
        {
            if (req.Key == expectedKey)
            {
                winnerFinishedUploadAndDb.TrySetResult();
            }
        };

        var (_, coordinator, encCfg) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client, verificationSampleRate: 1.0);

        var runATask = coordinator.ExecuteAsync(bindingA.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        var runBTask = coordinator.ExecuteAsync(bindingB.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);

        var runs = await Task.WhenAll(runATask, runBTask);
        var runA = runs[0];
        var runB = runs[1];

        runA.Status.Should().Be(SyncRunStatus.Completed);
        runB.Status.Should().Be(SyncRunStatus.Completed);

        // Deterministic .cez object MUST be written at most once (never overwritten by Binding B)
        patientS3.GetPutCount("clinicez-patient-test", expectedKey).Should().Be(1);
        patientS3.Contains("clinicez-patient-test", expectedKey).Should().BeTrue();
        var r2Obj = patientS3.GetRaw("clinicez-patient-test", expectedKey);

        var jsonOpts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var summaryA = JsonSerializer.Deserialize<SyncRunSummary>(runA.Summary.GetRawText(), jsonOpts)!;
        var summaryB = JsonSerializer.Deserialize<SyncRunSummary>(runB.Summary.GetRawText(), jsonOpts)!;

        (summaryA.PatientCopiesMigrated + summaryB.PatientCopiesMigrated).Should().Be(1);
        (summaryA.FailedCount + summaryB.FailedCount).Should().Be(0);
        (summaryA.BytesUploaded + summaryB.BytesUploaded).Should().Be(r2Obj.Bytes.LongLength);
        summaryA.ProcessedItems.Should().Be(1);
        summaryB.ProcessedItems.Should().Be(1);

        var statesA = await fx.Ledger.LoadStorageObjectStatesAsync(bindingA.Id);
        var statesB = await fx.Ledger.LoadStorageObjectStatesAsync(bindingB.Id);
        statesA[(SyncStoragePlane.PatientFile, fileId)].Status.Should().Be(SyncStorageStatus.Verified);
        statesB[(SyncStoragePlane.PatientFile, fileId)].Status.Should().Be(SyncStorageStatus.Verified);

        // Real PatientEncryptionService MUST decrypt the R2 object byte-for-byte with persisted file_records metadata
        var (alg, iv, tag, wrapped, key) = await ReadPatientCryptoRowAsync(fx, fileId);
        alg.Should().Be("AES-256-GCM");
        key.Should().Be(expectedKey);

        var realPatientService = new PatientEncryptionService(PatientEncryptionKeyRing.FromConfiguration(encCfg));
        var decrypted = await realPatientService.DecryptAsync(r2Obj.Bytes, iv, tag, wrapped, patientId);
        decrypted.Should().Equal(payload);
    }

    [Fact]
    public async Task PreCheckAlreadyEncryptedRow_VerifiesR2HeadSize_MarksFailedRetryableOnMismatchOrMissing()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-precheck";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var missingR2AttId = Guid.NewGuid();
        var mismatchR2AttId = Guid.NewGuid();
        var validR2AttId = Guid.NewGuid();

        const string urlMissing = "https://clinicezstorage.blob.core.windows.net/prod/precheck-missing.pdf";
        const string urlMismatch = "https://clinicezstorage.blob.core.windows.net/prod/precheck-mismatch.pdf";
        const string urlValid = "https://clinicezstorage.blob.core.windows.net/prod/precheck-valid.pdf";
        var payload = Encoding.UTF8.GetBytes("Precheck verification bytes");

        await SeedClinicAttachmentAsync(fx, missingR2AttId, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlMissing);
        await SeedClinicAttachmentAsync(fx, mismatchR2AttId, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlMismatch);
        await SeedClinicAttachmentAsync(fx, validR2AttId, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlValid);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "PreCheck Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();

        var mismatchKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{mismatchR2AttId}.cez";
        var validKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{validR2AttId}.cez";
        var missingKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{missingR2AttId}.cez";

        // Put objects for mismatchKey (wrong size) and validKey (exact size); leave missingKey absent
        await clinicS3.Client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = "clinicez-clinic-test",
            Key = mismatchKey,
            InputStream = new MemoryStream(new byte[] { 1, 2, 3 })
        });
        await clinicS3.Client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = "clinicez-clinic-test",
            Key = validKey,
            InputStream = new MemoryStream(new byte[27])
        });

        // Flip rows to AES-256-GCM AFTER DownloadAsync starts so Stage 1 planned them as NONE, forcing pre-check inside lock
        var flipped = 0;
        var handler = new StubHttpMessageHandler(async (req, ct) =>
        {
            if (Interlocked.CompareExchange(ref flipped, 1, 0) == 0)
            {
                await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
                    UPDATE public."RecordAttachments"
                    SET "EncryptionAlgorithm" = 'AES-256-GCM',
                        "EncryptionKeyId" = 'cmk-v1',
                        "StorageUri" = CASE "Id"
                            WHEN '{missingR2AttId}' THEN '{missingKey}'
                            WHEN '{mismatchR2AttId}' THEN '{mismatchKey}'
                            ELSE '{validKey}'
                        END,
                        "EncryptedSizeBytes" = 27
                    WHERE "Id" IN ('{missingR2AttId}', '{mismatchR2AttId}', '{validR2AttId}');
                    """);
            }
            return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf");
        });

        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);
        var run = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        run.Status.Should().Be(SyncRunStatus.Completed);

        // Pre-check MUST NEVER overwrite existing keys in R2
        clinicS3.GetPutCount("clinicez-clinic-test", missingKey).Should().Be(0);
        clinicS3.GetPutCount("clinicez-clinic-test", mismatchKey).Should().Be(1); // Only our initial test seed put
        clinicS3.GetPutCount("clinicez-clinic-test", validKey).Should().Be(1);    // Only our initial test seed put

        var states = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        states[(SyncStoragePlane.ClinicAttachment, missingR2AttId)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        states[(SyncStoragePlane.ClinicAttachment, mismatchR2AttId)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        states[(SyncStoragePlane.ClinicAttachment, validR2AttId)].Status.Should().Be(SyncStorageStatus.Verified);

        var listed = await fx.Ledger.ListStorageObjectsAsync(binding.Id, null, null, null, 50, 0);
        listed.Items.Single(i => i.TargetEntityId == missingR2AttId).LastErrorCode.Should().Be("R2ObjectMissing");
        listed.Items.Single(i => i.TargetEntityId == mismatchR2AttId).LastErrorCode.Should().Be("R2SizeMismatch");
    }

    [Fact]
    public async Task Track3R2ClientPool_GatesPayloadSigningByScheme_HttpLoopbackAndWireComparison()
    {
        var payload = Encoding.UTF8.GetBytes("Synthetic Track3 payload bytes 0123456789");
        var expectedSha256Hex = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();

        // 1. Live loopback TcpListener over plain http:// + IOptions endpoint scheme detection
        using var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;

        var rawCaptureTask = Task.Run(async () =>
        {
            using var tcpClient = await listener.AcceptTcpClientAsync();
            using var stream = tcpClient.GetStream();
            using var buffer = new MemoryStream();
            var chunk = new byte[4096];
            var headerEndIdx = -1;
            while (headerEndIdx < 0)
            {
                var read = await stream.ReadAsync(chunk);
                if (read == 0) break;
                buffer.Write(chunk, 0, read);
                var current = Encoding.ASCII.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
                headerEndIdx = current.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            }

            var headerText = Encoding.ASCII.GetString(buffer.GetBuffer(), 0, headerEndIdx);
            var contentLength = 0;
            foreach (var line in headerText.Split("\r\n"))
            {
                if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase) &&
                    int.TryParse(line.Split(':', 2)[1].Trim(), out var parsedLen))
                {
                    contentLength = parsedLen;
                }
            }

            var totalNeeded = headerEndIdx + 4 + contentLength;
            while (buffer.Length < totalNeeded)
            {
                var read = await stream.ReadAsync(chunk);
                if (read == 0) break;
                buffer.Write(chunk, 0, read);
            }

            var responseBytes = Encoding.ASCII.GetBytes(
                "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nETag: \"loopback-etag\"\r\nConnection: close\r\n\r\n");
            await stream.WriteAsync(responseBytes);
            await stream.FlushAsync();

            return Encoding.UTF8.GetString(buffer.ToArray());
        });

        using var optionsPool = new Track3R2ClientPool(
            Options.Create(new Track3StorageOptions
            {
                Enabled = true,
                ClinicR2 = new Track3BucketOptions
                {
                    ServiceUrl = $"http://127.0.0.1:{port}",
                    BucketName = "clinicez-clinic-local",
                    AccessKeyId = "minio-test-key",
                    SecretAccessKey = "minio-test-secret",
                    Region = "us-east-1",
                    ForcePathStyle = true
                },
                PatientR2 = new Track3BucketOptions
                {
                    AccountId = "cf-test-account",
                    BucketName = "clinicez-patient-prod",
                    AccessKeyId = "r2-test-key",
                    SecretAccessKey = "r2-test-secret",
                    Region = "auto",
                    ForcePathStyle = true
                }
            }),
            NullLogger<Track3R2ClientPool>.Instance);

        optionsPool.IsClinicPayloadSigningDisabled.Should().BeFalse();
        optionsPool.IsPatientPayloadSigningDisabled.Should().BeTrue();

        using var httpsServiceUrlPool = new Track3R2ClientPool(
            Options.Create(new Track3StorageOptions
            {
                Enabled = true,
                ClinicR2 = new Track3BucketOptions
                {
                    ServiceUrl = "https://minio.internal:9000",
                    BucketName = "clinicez-clinic-https",
                    AccessKeyId = "minio-test-key",
                    SecretAccessKey = "minio-test-secret",
                    Region = "us-east-1",
                    ForcePathStyle = true
                }
            }),
            NullLogger<Track3R2ClientPool>.Instance);
        httpsServiceUrlPool.IsClinicPayloadSigningDisabled.Should().BeTrue();

        var storedKey = await optionsPool.PutEncryptedAsync(
            isClinic: true,
            key: "tenants/t1/clinics/c1/records/a1.cez",
            ciphertext: payload,
            keyScheme: "cmk-v1");
        storedKey.Should().Be("tenants/t1/clinics/c1/records/a1.cez");

        var rawRequest = await rawCaptureTask.WaitAsync(TimeSpan.FromSeconds(10));
        rawRequest.Should().Contain($"X-Amz-Content-SHA256: {expectedSha256Hex}", Exactly.Once());
        rawRequest.Should().Contain("x-amz-meta-encryption: AES-256-GCM");
        rawRequest.Should().Contain("x-amz-meta-key-scheme: cmk-v1");
        rawRequest.Should().NotContain("UNSIGNED-PAYLOAD");
        rawRequest.Should().NotContain("STREAMING-AWS4-HMAC-SHA256-PAYLOAD-TRAILER");
        rawRequest.Should().NotContain("aws-chunked");
        rawRequest.Should().NotContain("x-amz-trailer");

        // 2. Real AmazonS3Client + HttpClientFactory wire-level comparison: http:// MinIO vs https:// R2
        var httpCaptured = new List<(Dictionary<string, string> Headers, byte[] Body)>();
        var httpsCaptured = new List<(Dictionary<string, string> Headers, byte[] Body)>();

        HttpMessageHandler BuildCaptureHandler(List<(Dictionary<string, string> Headers, byte[] Body)> target) =>
            new StubHttpMessageHandler(async (req, ct) =>
            {
                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var h in req.Headers)
                {
                    headers[h.Key] = string.Join(",", h.Value);
                }
                if (req.Content is not null)
                {
                    foreach (var h in req.Content.Headers)
                    {
                        headers[h.Key] = string.Join(",", h.Value);
                    }
                }
                var body = req.Content is not null
                    ? await req.Content.ReadAsByteArrayAsync(ct)
                    : Array.Empty<byte>();
                target.Add((headers, body));

                var resp = new HttpResponseMessage(HttpStatusCode.OK);
                resp.Headers.ETag = new EntityTagHeaderValue("\"wire-etag\"");
                return resp;
            });

        var creds = new Amazon.Runtime.BasicAWSCredentials("test-access-key", "test-secret-key");
        using var httpS3Client = new AmazonS3Client(creds, new AmazonS3Config
        {
            ServiceURL = "http://clinicez-local-minio:9000",
            ForcePathStyle = true,
            AuthenticationRegion = "us-east-1",
            HttpClientFactory = new CapturingAwsHttpClientFactory(BuildCaptureHandler(httpCaptured))
        });
        using var httpsS3Client = new AmazonS3Client(creds, new AmazonS3Config
        {
            ServiceURL = "https://acct.r2.cloudflarestorage.com",
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
            HttpClientFactory = new CapturingAwsHttpClientFactory(BuildCaptureHandler(httpsCaptured))
        });

        using var wirePool = new Track3R2ClientPool(
            httpS3Client, "clinicez-clinic-local",
            httpsS3Client, "clinicez-patient-prod",
            NullLogger<Track3R2ClientPool>.Instance);

        wirePool.IsClinicPayloadSigningDisabled.Should().BeFalse();
        wirePool.IsPatientPayloadSigningDisabled.Should().BeTrue();

        await wirePool.PutEncryptedAsync(isClinic: true, "tenants/t1/clinics/c1/records/a2.cez", payload, "cmk-v1");
        await wirePool.PutEncryptedAsync(isClinic: false, "patients/p1/records/f1.cez", payload, "pmk-v1");

        httpCaptured.Should().ContainSingle();
        var (httpHeaders, httpBody) = httpCaptured[0];
        httpHeaders["X-Amz-Content-SHA256"].Should().Be(expectedSha256Hex);
        httpHeaders["x-amz-meta-encryption"].Should().Be("AES-256-GCM");
        httpHeaders["x-amz-meta-key-scheme"].Should().Be("cmk-v1");
        httpHeaders.Should().NotContainKey("x-amz-trailer");
        httpHeaders.GetValueOrDefault("Content-Encoding", string.Empty).Should().NotContain("aws-chunked");
        httpBody.Should().Equal(payload);

        httpsCaptured.Should().ContainSingle();
        var (httpsHeaders, httpsBody) = httpsCaptured[0];
        httpsHeaders["X-Amz-Content-SHA256"].Should().Be("UNSIGNED-PAYLOAD");
        httpsHeaders["x-amz-meta-encryption"].Should().Be("AES-256-GCM");
        httpsHeaders["x-amz-meta-key-scheme"].Should().Be("pmk-v1");
        httpsHeaders.Should().NotContainKey("x-amz-trailer");
        httpsHeaders.GetValueOrDefault("Content-Encoding", string.Empty).Should().NotContain("aws-chunked");
        httpsBody.Should().Equal(payload);
    }

    [Fact]
    public async Task TruncatedHttpStream_TcpListener_RetriesAndMarksFailedRetryableWithoutCrashingRun()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-gap1";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var idAlwaysTruncated = Guid.NewGuid();
        var idTransientTruncated = Guid.NewGuid();
        var idHealthy = Guid.NewGuid();

        const string urlAlwaysTruncated = "https://clinicezstorage.blob.core.windows.net/prod/always-truncated.pdf";
        const string urlTransientTruncated = "https://clinicezstorage.blob.core.windows.net/prod/transient-truncated.pdf";
        const string urlHealthy = "https://clinicezstorage.blob.core.windows.net/prod/healthy-gap1.pdf";
        var healthyBytes = Encoding.UTF8.GetBytes("%PDF-1.7\nHealthy payload after stream check!");
        var recoveredBytes = Encoding.UTF8.GetBytes("%PDF-1.7\nRecovered after transient truncation!");

        await SeedClinicAttachmentAsync(fx, idAlwaysTruncated, patientId, tenantId, clinicId, "application/pdf", 1000, urlAlwaysTruncated);
        await SeedClinicAttachmentAsync(fx, idTransientTruncated, patientId, tenantId, clinicId, "application/pdf", recoveredBytes.Length, urlTransientTruncated);
        await SeedClinicAttachmentAsync(fx, idHealthy, patientId, tenantId, clinicId, "application/pdf", healthyBytes.Length, urlHealthy);

        using var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var transientAttempts = 0;

        using var serverCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var serverTask = Task.Run(async () =>
        {
            while (!serverCts.Token.IsCancellationRequested)
            {
                System.Net.Sockets.TcpClient tcp;
                try
                {
                    tcp = await listener.AcceptTcpClientAsync(serverCts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }

                _ = Task.Run(async () =>
                {
                    using (tcp)
                    await using (var stream = tcp.GetStream())
                    {
                        var buf = new byte[4096];
                        var total = 0;
                        while (total < buf.Length)
                        {
                            var read = await stream.ReadAsync(buf.AsMemory(total), serverCts.Token);
                            if (read == 0) break;
                            total += read;
                            if (Encoding.ASCII.GetString(buf, 0, total).Contains("\r\n\r\n", StringComparison.Ordinal))
                                break;
                        }
                        var reqLine = Encoding.ASCII.GetString(buf, 0, total).Split("\r\n")[0];
                        if (reqLine.Contains("/prod/always-truncated.pdf", StringComparison.Ordinal))
                        {
                            var hdr = Encoding.ASCII.GetBytes(
                                "HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n%PDF-");
                            await stream.WriteAsync(hdr, serverCts.Token);
                            await stream.FlushAsync(serverCts.Token);
                        }
                        else if (reqLine.Contains("/prod/transient-truncated.pdf", StringComparison.Ordinal))
                        {
                            var n = Interlocked.Increment(ref transientAttempts);
                            if (n == 1)
                            {
                                var hdr = Encoding.ASCII.GetBytes(
                                    "HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n%PDF-");
                                await stream.WriteAsync(hdr, serverCts.Token);
                            }
                            else
                            {
                                var hdr = Encoding.ASCII.GetBytes(
                                    $"HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\nContent-Length: {recoveredBytes.Length}\r\nConnection: close\r\n\r\n");
                                await stream.WriteAsync(hdr, serverCts.Token);
                                await stream.WriteAsync(recoveredBytes, serverCts.Token);
                            }
                            await stream.FlushAsync(serverCts.Token);
                        }
                        else
                        {
                            var hdr = Encoding.ASCII.GetBytes(
                                $"HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\nContent-Length: {healthyBytes.Length}\r\nConnection: close\r\n\r\n");
                            await stream.WriteAsync(hdr, serverCts.Token);
                            await stream.WriteAsync(healthyBytes, serverCts.Token);
                            await stream.FlushAsync(serverCts.Token);
                        }
                    }
                }, serverCts.Token);
            }
        });

        try
        {
            var encCfg = BuildEncryptionConfig(ClinicSecret1, PatientSecret1);
            var opts = Options.Create(new Track3StorageOptions
            {
                Enabled = true,
                MaxConcurrency = 2,
                MaxFileSizeBytes = 10 * 1024 * 1024,
                VerificationSampleRate = 1.0,
                AzureBlob1Enabled = true,
                AzureBlob1OriginOverride = $"http://127.0.0.1:{port}"
            });
            var encryptor = new Track3EnvelopeEncryptor(encCfg);
            var clinicS3 = new InMemoryAmazonS3();
            var patientS3 = new InMemoryAmazonS3();
            var r2Pool = new Track3R2ClientPool(
                clinicS3.Client, "clinicez-clinic-test",
                patientS3.Client, "clinicez-patient-test",
                NullLogger<Track3R2ClientPool>.Instance);
            using var realHttp = new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = false });
            var downloader = new LegacyBlobSourceDownloader(
                realHttp, opts, NullLogger<LegacyBlobSourceDownloader>.Instance, new SimpleHostEnvironment(Environments.Development));
            var engine = new Track3StorageSyncEngine(
                fx.Connections, fx.Ledger, encryptor, r2Pool, downloader, opts, NullLogger<Track3StorageSyncEngine>.Instance);
            var coordinator = new SyncCoordinator(
                fx.Ledger, fx.Track1, fx.Track2, NullLogger<SyncCoordinator>.Instance, engine, fx.Connections);

            var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
                Track: SyncTrack.Track3Storage,
                Name: "GAP1 Truncated Stream Binding",
                V1ClinicId: null,
                V1OrgId: null,
                V2TenantId: tenantId,
                V2ClinicId: clinicId,
                PatientCohortMode: SyncCohortMode.Scoped), "test");

            var run = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
            run.Status.Should().Be(SyncRunStatus.Completed);

            var states = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
            states[(SyncStoragePlane.ClinicAttachment, idAlwaysTruncated)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
            states[(SyncStoragePlane.ClinicAttachment, idTransientTruncated)].Status.Should().BeOneOf(SyncStorageStatus.Migrated, SyncStorageStatus.Verified);
            states[(SyncStoragePlane.ClinicAttachment, idHealthy)].Status.Should().BeOneOf(SyncStorageStatus.Migrated, SyncStorageStatus.Verified);
            transientAttempts.Should().BeGreaterThanOrEqualTo(2);

            // Defensive engine fallback: if downloader throws an unexpected non-cancellation exception, engine still marks FAILED_RETRYABLE
            var throwingHandler = new StubHttpMessageHandler(_ => throw new InvalidOperationException("Simulated unexpected downloader crash"));
            var (_, throwingCoord, _) = BuildTrack3Runtime(fx, throwingHandler, clinicS3.Client, patientS3.Client);
            var idThrows = Guid.NewGuid();
            await SeedClinicAttachmentAsync(fx, idThrows, patientId, tenantId, clinicId, "application/pdf", 10, "https://clinicezstorage.blob.core.windows.net/prod/unexpected-throw.pdf");
            var run2 = await throwingCoord.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
            run2.Status.Should().Be(SyncRunStatus.Completed);
            var states2 = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
            states2[(SyncStoragePlane.ClinicAttachment, idThrows)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        }
        finally
        {
            await serverCts.CancelAsync();
            listener.Stop();
            await serverTask;
        }
    }

    [Fact]
    public async Task Stage4Verification_MissingOrCorruptR2Object_MarksFailedRetryable_PersistsHealthyVerified_AndBlocksFreeze()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-gap2";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var idHealthy = Guid.NewGuid();
        var idCorrupt = Guid.NewGuid();
        var idMissing = Guid.NewGuid();

        const string urlHealthy = "https://clinicezstorage.blob.core.windows.net/prod/gap2-healthy.pdf";
        const string urlCorrupt = "https://clinicezstorage.blob.core.windows.net/prod/gap2-corrupt.pdf";
        const string urlMissing = "https://clinicezstorage.blob.core.windows.net/prod/gap2-missing.pdf";
        var payload = Encoding.UTF8.GetBytes("Stage 4 verification integrity payload 123456");

        await SeedClinicAttachmentAsync(fx, idHealthy, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlHealthy);
        await SeedClinicAttachmentAsync(fx, idCorrupt, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlCorrupt);
        await SeedClinicAttachmentAsync(fx, idMissing, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlMissing);

        var handler = new StubHttpMessageHandler(_ => StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf"));
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (engine, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client, verificationSampleRate: 0.01);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "GAP2 Stage4 Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        var backfill = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None);
        backfill.Status.Should().Be(SyncRunStatus.Completed);

        // Reset all 3 to MIGRATED so FinalSweep verifies all 3, then corrupt 1 and delete 1 in R2
        await Pg17TestFixture.ExecuteSqlAsync(fx.SyncConnectionString,
            $"UPDATE sync_storage_objects SET status = 'MIGRATED', verified_at = NULL WHERE binding_id = '{binding.Id}'");

        var corruptKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{idCorrupt}.cez";
        var missingKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{idMissing}.cez";
        clinicS3.GetRaw("clinicez-clinic-test", corruptKey).Bytes[0] ^= 0xFF;
        await clinicS3.Client.DeleteObjectAsync(new DeleteObjectRequest { BucketName = "clinicez-clinic-test", Key = missingKey });

        var sweep = await coordinator.ExecuteAsync(binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        sweep.Status.Should().Be(SyncRunStatus.Completed);
        var sweepSummary = JsonSerializer.Deserialize<SyncRunSummary>(sweep.Summary.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        sweepSummary.FailedCount.Should().Be(2);

        var states = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        states[(SyncStoragePlane.ClinicAttachment, idHealthy)].Status.Should().Be(SyncStorageStatus.Verified);
        states[(SyncStoragePlane.ClinicAttachment, idCorrupt)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        states[(SyncStoragePlane.ClinicAttachment, idMissing)].Status.Should().Be(SyncStorageStatus.FailedRetryable);

        var parity = await engine.BuildParityReportAsync(binding);
        parity.ReadyToFreeze.Should().BeFalse();
    }

    [Fact]
    public async Task Stage4Failure_RetryFailedViaHttp_ReverifiesAllBrokenObjects_BlocksFreezeUntilR2Repaired_AndRespectsFilters()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-finding1";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var idCorrupt = Guid.NewGuid();
        var idMissing = Guid.NewGuid();
        var idPatientMissing = Guid.NewGuid();

        const string urlCorrupt = "https://clinicezstorage.blob.core.windows.net/prod/f1-corrupt.pdf";
        const string urlMissing = "https://clinicezstorage.blob.core.windows.net/prod/f1-missing.pdf";
        const string urlPatientMissing = "https://clinicezstorage.blob.core.windows.net/prod/f1-patient-missing.pdf";
        var payload = Encoding.UTF8.GetBytes("%PDF-1.7\nFinding 1 regression payload bytes 0123456789!");

        await SeedClinicAttachmentAsync(fx, idCorrupt, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlCorrupt);
        await SeedClinicAttachmentAsync(fx, idMissing, patientId, tenantId, clinicId, "application/pdf", payload.Length, urlMissing);
        await SeedPatientAndFileAsync(fx, patientId, idPatientMissing, clinicId, "application/pdf", payload.Length, urlPatientMissing);

        var handler = new StubHttpMessageHandler(_ => StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf"));
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureAppConfiguration((_, cfg) =>
            {
                cfg.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:V1Source"] = fx.V1ConnectionString,
                    ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                    ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                    ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                    ["V1Sync:EnableBackgroundWorker"] = "false",
                    ["V1Sync:AllowUnauthenticatedLocalDev"] = "false",
                    ["V1Sync:LocalAdminKey"] = "finding1-admin-key",
                    ["ClinicEncryption:MasterSecret"] = ClinicSecret1,
                    ["PatientEncryption:MasterSecret"] = PatientSecret1,
                    ["Track3Storage:Enabled"] = "true",
                    ["Track3Storage:AzureBlob1Enabled"] = "true",
                    ["Track3Storage:VerificationSampleRate"] = "0.01"
                });
            });
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IHttpClientFactory>();
                services.AddSingleton<IHttpClientFactory>(new StubHttpClientFactory(handler));
                services.RemoveAll<Track3R2ClientPool>();
                services.AddSingleton(new Track3R2ClientPool(
                    clinicS3.Client, "clinicez-clinic-test",
                    patientS3.Client, "clinicez-patient-test",
                    NullLogger<Track3R2ClientPool>.Instance));
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-V1-Sync-Admin-Key", "finding1-admin-key");

        var createResp = await client.PostAsJsonAsync("/api/v1/v1-sync/bindings", new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "Finding1 Stage4 Retry Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped));
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var binding = (await createResp.Content.ReadFromJsonAsync<SyncBinding>())!;

        (await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/backfill", new { })).StatusCode.Should().Be(HttpStatusCode.OK);

        // Save intact encrypted R2 copies, then corrupt 1 Clinic object and delete 1 Clinic + 1 Patient object in R2
        var corruptKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{idCorrupt}.cez";
        var missingKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{idMissing}.cez";
        var patientMissingKey = $"patients/{patientId}/records/{idPatientMissing}.cez";

        var intactCorrupt = clinicS3.GetRaw("clinicez-clinic-test", corruptKey);
        var intactCorruptBytes = (byte[])intactCorrupt.Bytes.Clone();
        var intactCorruptMeta = new Dictionary<string, string>(intactCorrupt.Metadata, StringComparer.OrdinalIgnoreCase);

        var intactMissing = clinicS3.GetRaw("clinicez-clinic-test", missingKey);
        var intactMissingBytes = (byte[])intactMissing.Bytes.Clone();
        var intactMissingMeta = new Dictionary<string, string>(intactMissing.Metadata, StringComparer.OrdinalIgnoreCase);

        var intactPatient = patientS3.GetRaw("clinicez-patient-test", patientMissingKey);
        var intactPatientBytes = (byte[])intactPatient.Bytes.Clone();
        var intactPatientMeta = new Dictionary<string, string>(intactPatient.Metadata, StringComparer.OrdinalIgnoreCase);

        await Pg17TestFixture.ExecuteSqlAsync(fx.SyncConnectionString,
            $"UPDATE sync_storage_objects SET status = 'MIGRATED', verified_at = NULL WHERE binding_id = '{binding.Id}'");

        clinicS3.GetRaw("clinicez-clinic-test", corruptKey).Bytes[0] ^= 0xFF;
        await clinicS3.Client.DeleteObjectAsync(new DeleteObjectRequest { BucketName = "clinicez-clinic-test", Key = missingKey });
        await patientS3.Client.DeleteObjectAsync(new DeleteObjectRequest { BucketName = "clinicez-patient-test", Key = patientMissingKey });

        // 1. FinalSweep detects all 3 Stage 4 failures -> FAILED_RETRYABLE & ReadyToFreeze == false
        var sweepResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/final-sweep", new { });
        sweepResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var parityAfterSweep = await (await client.GetAsync($"/api/v1/v1-sync/bindings/{binding.Id}/parity")).Content.ReadFromJsonAsync<ParityReportResponse>();
        parityAfterSweep!.ReadyToFreeze.Should().BeFalse();

        // 2. Call POST /retry-failed while R2 objects are STILL broken -> ALL 3 must re-verify (even with SampleRate=0.01), fail back to FAILED_RETRYABLE, and keep ReadyToFreeze == false
        var retryBrokenResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/retry-failed?asyncMode=false", new { });
        retryBrokenResp.StatusCode.Should().Be(HttpStatusCode.OK);
        var retryBrokenRun = (await retryBrokenResp.Content.ReadFromJsonAsync<SyncRunRecord>())!;
        var retryBrokenSummary = JsonSerializer.Deserialize<SyncRunSummary>(retryBrokenRun.Summary.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        retryBrokenSummary.FailedCount.Should().Be(3);

        var statesAfterBrokenRetry = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        statesAfterBrokenRetry[(SyncStoragePlane.ClinicAttachment, idCorrupt)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        statesAfterBrokenRetry[(SyncStoragePlane.ClinicAttachment, idMissing)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        statesAfterBrokenRetry[(SyncStoragePlane.PatientFile, idPatientMissing)].Status.Should().Be(SyncStorageStatus.FailedRetryable);

        var parityAfterBrokenRetry = await (await client.GetAsync($"/api/v1/v1-sync/bindings/{binding.Id}/parity")).Content.ReadFromJsonAsync<ParityReportResponse>();
        parityAfterBrokenRetry!.ReadyToFreeze.Should().BeFalse();

        // 3. Freeze safety guard: a row stuck in PENDING with target_r2_key IS NOT NULL must also block ReadyToFreeze
        await Pg17TestFixture.ExecuteSqlAsync(fx.SyncConnectionString,
            $"UPDATE sync_storage_objects SET status = 'PENDING' WHERE binding_id = '{binding.Id}' AND target_entity_id = '{idCorrupt}'");
        var parityPendingWithKey = await (await client.GetAsync($"/api/v1/v1-sync/bindings/{binding.Id}/parity")).Content.ReadFromJsonAsync<ParityReportResponse>();
        parityPendingWithKey!.ReadyToFreeze.Should().BeFalse();
        await Pg17TestFixture.ExecuteSqlAsync(fx.SyncConnectionString,
            $"UPDATE sync_storage_objects SET status = 'FAILED_RETRYABLE' WHERE binding_id = '{binding.Id}' AND target_entity_id = '{idCorrupt}'");

        // 4. Repair ONLY Clinic R2 objects, call POST /retry-failed with targetPlaneFilter=CLINIC_ONLY -> Clinic rows become VERIFIED, Patient row stays FAILED_RETRYABLE, ReadyToFreeze == false
        await clinicS3.Client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = "clinicez-clinic-test",
            Key = corruptKey,
            InputStream = new MemoryStream(intactCorruptBytes),
            Metadata = { ["x-amz-meta-encryption"] = intactCorruptMeta["x-amz-meta-encryption"], ["x-amz-meta-key-scheme"] = intactCorruptMeta["x-amz-meta-key-scheme"] }
        });
        await clinicS3.Client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = "clinicez-clinic-test",
            Key = missingKey,
            InputStream = new MemoryStream(intactMissingBytes),
            Metadata = { ["x-amz-meta-encryption"] = intactMissingMeta["x-amz-meta-encryption"], ["x-amz-meta-key-scheme"] = intactMissingMeta["x-amz-meta-key-scheme"] }
        });

        var retryClinicOnlyResp = await client.PostAsJsonAsync(
            $"/api/v1/v1-sync/bindings/{binding.Id}/retry-failed?asyncMode=false",
            new RunSyncRequest(TargetPlaneFilter: "CLINIC_ONLY"));
        retryClinicOnlyResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var statesAfterClinicRepair = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        statesAfterClinicRepair[(SyncStoragePlane.ClinicAttachment, idCorrupt)].Status.Should().Be(SyncStorageStatus.Verified);
        statesAfterClinicRepair[(SyncStoragePlane.ClinicAttachment, idMissing)].Status.Should().Be(SyncStorageStatus.Verified);
        statesAfterClinicRepair[(SyncStoragePlane.PatientFile, idPatientMissing)].Status.Should().Be(SyncStorageStatus.FailedRetryable);

        var parityAfterClinicRepair = await (await client.GetAsync($"/api/v1/v1-sync/bindings/{binding.Id}/parity")).Content.ReadFromJsonAsync<ParityReportResponse>();
        parityAfterClinicRepair!.ReadyToFreeze.Should().BeFalse();

        // 5. Repair Patient R2 object, call POST /retry-failed -> Patient row transitions to VERIFIED & ReadyToFreeze == true
        await patientS3.Client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = "clinicez-patient-test",
            Key = patientMissingKey,
            InputStream = new MemoryStream(intactPatientBytes),
            Metadata = { ["x-amz-meta-encryption"] = intactPatientMeta["x-amz-meta-encryption"], ["x-amz-meta-key-scheme"] = intactPatientMeta["x-amz-meta-key-scheme"] }
        });

        var retryFinalResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/retry-failed?asyncMode=false", new { });
        retryFinalResp.StatusCode.Should().Be(HttpStatusCode.OK);

        var statesFinal = await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id);
        statesFinal[(SyncStoragePlane.ClinicAttachment, idCorrupt)].Status.Should().Be(SyncStorageStatus.Verified);
        statesFinal[(SyncStoragePlane.ClinicAttachment, idMissing)].Status.Should().Be(SyncStorageStatus.Verified);
        statesFinal[(SyncStoragePlane.PatientFile, idPatientMissing)].Status.Should().Be(SyncStorageStatus.Verified);

        var listedFinal = await (await client.GetAsync($"/api/v1/v1-sync/bindings/{binding.Id}/storage-objects")).Content.ReadFromJsonAsync<StorageObjectsResponse>();
        listedFinal!.FailedRetryableCount.Should().Be(0);

        var parityFinal = await (await client.GetAsync($"/api/v1/v1-sync/bindings/{binding.Id}/parity")).Content.ReadFromJsonAsync<ParityReportResponse>();
        parityFinal!.ReadyToFreeze.Should().BeTrue();
    }

    [Fact]
    public async Task HttpClient_Track3BlobDownloader_SuppressesInformationUrlLogs()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();
        var logEntries = new ConcurrentBag<(string Category, LogLevel Level, string Message)>();
        const string sensitivePath = "/prod/org-req/15625/xray_result/secret-filename-999.pdf";
        var payload = Encoding.UTF8.GetBytes("ok-pdf");

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                ["V1Sync:EnableBackgroundWorker"] = "false",
                ["Track3Storage:AzureBlob1OriginOverride"] = ""
            }));
            builder.ConfigureLogging(logging =>
            {
                logging.AddProvider(new CapturingCategoryLoggerProvider(logEntries));
            });
            builder.ConfigureServices(services =>
            {
                services.AddHttpClient(LegacyBlobSourceDownloader.HttpClientName)
                    .ConfigurePrimaryHttpMessageHandler(() => new StubHttpMessageHandler(_ =>
                        StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf")));
            });
        });

        var downloader = factory.Services.GetRequiredService<LegacyBlobSourceDownloader>();
        var res = await downloader.DownloadAsync($"https://clinicezstorage.blob.core.windows.net{sensitivePath}", "application/pdf");
        res.Success.Should().BeTrue();

        logEntries.Should().NotContain(e =>
            e.Category.Contains("Track3BlobDownloader", StringComparison.OrdinalIgnoreCase) &&
            e.Level <= LogLevel.Information);
        logEntries.Should().NotContain(e =>
            e.Message.Contains("secret-filename-999.pdf", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task RetryFailed_WhenBindingLocked_Returns409AndPreservesFailedRetryableDiagnostics()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-gap5";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var holdAttId = Guid.NewGuid();
        var retryAttId = Guid.NewGuid();

        const string holdUrl = "https://clinicezstorage.blob.core.windows.net/prod/hold-gap5.pdf";
        const string retryUrl = "https://clinicezstorage.blob.core.windows.net/prod/retry-gap5.pdf";
        var holdEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseHold = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var failRetryUrl = true;

        var handler = new StubHttpMessageHandler(async (req, ct) =>
        {
            var u = req.RequestUri!.ToString();
            if (u == holdUrl)
            {
                holdEntered.TrySetResult();
                await releaseHold.Task.WaitAsync(TimeSpan.FromSeconds(15), ct);
                return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Encoding.UTF8.GetBytes("hold-ok"), "application/pdf");
            }
            if (u == retryUrl)
            {
                return failRetryUrl
                    ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                    : StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Encoding.UTF8.GetBytes("retry-ok"), "application/pdf");
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:V1Source"] = fx.V1ConnectionString,
                ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                ["V1Sync:EnableBackgroundWorker"] = "false",
                ["V1Sync:AllowUnauthenticatedLocalDev"] = "false",
                ["V1Sync:LocalAdminKey"] = "gap5-admin-key",
                ["ClinicEncryption:MasterSecret"] = ClinicSecret1,
                ["PatientEncryption:MasterSecret"] = PatientSecret1,
                ["Track3Storage:Enabled"] = "true",
                ["Track3Storage:AzureBlob1Enabled"] = "true"
            }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IHttpClientFactory>();
                services.AddSingleton<IHttpClientFactory>(new StubHttpClientFactory(handler));
                services.RemoveAll<Track3R2ClientPool>();
                services.AddSingleton(new Track3R2ClientPool(
                    clinicS3.Client, "clinicez-clinic-test",
                    patientS3.Client, "clinicez-patient-test",
                    NullLogger<Track3R2ClientPool>.Instance));
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-V1-Sync-Admin-Key", "gap5-admin-key");

        var createResp = await client.PostAsJsonAsync("/api/v1/v1-sync/bindings", new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "GAP5 Lock Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped));
        createResp.StatusCode.Should().Be(HttpStatusCode.Created);
        var binding = (await createResp.Content.ReadFromJsonAsync<SyncBinding>())!;

        // 1. Seed retryAttId failing with 503 -> creates FAILED_RETRYABLE row with LastErrorCode = HTTP_5XX
        await SeedClinicAttachmentAsync(fx, retryAttId, patientId, tenantId, clinicId, "application/pdf", 10, retryUrl);
        (await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/backfill", new { })).StatusCode.Should().Be(HttpStatusCode.OK);

        var beforeHold = await fx.Ledger.ListStorageObjectsAsync(binding.Id, null, null, null, 50, 0);
        beforeHold.Items.Single(i => i.TargetEntityId == retryAttId).Status.Should().Be(SyncStorageStatus.FailedRetryable);
        beforeHold.Items.Single(i => i.TargetEntityId == retryAttId).LastErrorCode.Should().Be("HTTP_5XX");

        // 2. Seed holdAttId and start background run that holds binding lock
        await SeedClinicAttachmentAsync(fx, holdAttId, patientId, tenantId, clinicId, "application/pdf", 10, holdUrl);
        var bgResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/backfill?asyncMode=true", new { });
        bgResp.StatusCode.Should().Be(HttpStatusCode.Accepted);
        await holdEntered.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // 3. Call /retry-failed while locked -> MUST return 409 AND NOT wipe FAILED_RETRYABLE / HTTP_5XX
        var conflictResp = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/retry-failed?asyncMode=true", new { });
        conflictResp.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var duringHold = await fx.Ledger.ListStorageObjectsAsync(binding.Id, null, null, null, 50, 0);
        var preserved = duringHold.Items.Single(i => i.TargetEntityId == retryAttId);
        preserved.Status.Should().Be(SyncStorageStatus.FailedRetryable);
        preserved.LastErrorCode.Should().Be("HTTP_5XX");
        preserved.LastErrorMessage.Should().NotBeNullOrWhiteSpace();

        // 4. Release lock and confirm retry-failed now succeeds
        releaseHold.TrySetResult();
        for (var i = 0; i < 40; i++)
        {
            var runs = await fx.Ledger.ListRunsAsync(binding.Id, 5);
            if (runs.All(r => r.Status != SyncRunStatus.Running)) break;
            await Task.Delay(100);
        }

        failRetryUrl = false;
        var retryOk = await client.PostAsJsonAsync($"/api/v1/v1-sync/bindings/{binding.Id}/retry-failed?asyncMode=false", new { });
        retryOk.StatusCode.Should().Be(HttpStatusCode.OK);
        var afterRetry = await fx.Ledger.ListStorageObjectsAsync(binding.Id, null, null, null, 50, 0);
        afterRetry.Items.Single(i => i.TargetEntityId == retryAttId).Status.Should().BeOneOf(SyncStorageStatus.Migrated, SyncStorageStatus.Verified);
    }

    [Fact]
    public async Task SampleLimit_WhenBothPlanesHaveItems_BalancesAcrossClinicAndPatientWithSpillover()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-gap6";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var payload = Encoding.UTF8.GetBytes("Balanced sample payload");

        for (var i = 0; i < 30; i++)
        {
            await SeedClinicAttachmentAsync(fx, Guid.NewGuid(), patientId, tenantId, clinicId, "application/pdf", payload.Length,
                $"https://clinicezstorage.blob.core.windows.net/prod/gap6-c-{i}.pdf");
            await SeedPatientAndFileAsync(fx, patientId, Guid.NewGuid(), clinicId, "application/pdf", payload.Length,
                $"https://clinicezstorage.blob.core.windows.net/prod/gap6-p-{i}.pdf");
        }

        var handler = new StubHttpMessageHandler(_ => StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf"));
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        var binding1 = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "GAP6 Balanced 30+30",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        var run1 = await coordinator.ExecuteAsync(
            binding1.Id, SyncRunMode.Backfill, sampleLimit: 25, forceV1OnConflict: false, "test", CancellationToken.None,
            request: new RunSyncRequest(SampleLimit: 25, TargetPlaneFilter: "BOTH"));
        run1.Status.Should().Be(SyncRunStatus.Completed);
        var s1 = JsonSerializer.Deserialize<SyncRunSummary>(run1.Summary.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        s1.ClinicCopiesMigrated.Should().Be(13);
        s1.PatientCopiesMigrated.Should().Be(12);

        // Spillover test: 3 Clinic + 20 Patient remaining, SampleLimit = 25 -> 3 Clinic + 18 Patient (wait: 17 remaining Clinic, 18 remaining Patient -> seed fresh clinicId2 with 3 Clinic + 30 Patient)
        var clinicId2 = Guid.NewGuid();
        for (var i = 0; i < 3; i++)
        {
            await SeedClinicAttachmentAsync(fx, Guid.NewGuid(), patientId, tenantId, clinicId2, "application/pdf", payload.Length,
                $"https://clinicezstorage.blob.core.windows.net/prod/gap6-spill-c-{i}.pdf");
        }
        for (var i = 0; i < 30; i++)
        {
            await SeedPatientAndFileAsync(fx, patientId, Guid.NewGuid(), clinicId2, "application/pdf", payload.Length,
                $"https://clinicezstorage.blob.core.windows.net/prod/gap6-spill-p-{i}.pdf");
        }

        var binding2 = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "GAP6 Spillover 3+30",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId2,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        var run2 = await coordinator.ExecuteAsync(
            binding2.Id, SyncRunMode.Backfill, sampleLimit: 25, forceV1OnConflict: false, "test", CancellationToken.None,
            request: new RunSyncRequest(SampleLimit: 25, TargetPlaneFilter: "BOTH"));
        run2.Status.Should().Be(SyncRunStatus.Completed);
        var s2 = JsonSerializer.Deserialize<SyncRunSummary>(run2.Summary.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        s2.ClinicCopiesMigrated.Should().Be(3);
        s2.PatientCopiesMigrated.Should().Be(22);
    }

    [Fact]
    public async Task LegacyBlobSourceDownloader_RejectsUserInfoAndNonDefaultPort_PeeksChunked200Probe_AndDetectsCommentedHtml()
    {
        // 1. UserInfo and non-default port rejected by ClassifyUrl
        var userInfoCls = LegacyBlobSourceDownloader.ClassifyUrl("https://user:pass@clinicezstorage.blob.core.windows.net/prod/a.pdf");
        userInfoCls.IsMigratable.Should().BeFalse();
        userInfoCls.SkipStatus.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);

        var portCls = LegacyBlobSourceDownloader.ClassifyUrl("https://clinicezstorage.blob.core.windows.net:8443/prod/a.pdf");
        portCls.IsMigratable.Should().BeFalse();
        portCls.SkipStatus.Should().Be(SyncStorageStatus.SkippedLegacyUnsupported);

        // 2. Redirect to UserInfo or non-default port blocked as AUTH_REDIRECT
        var handler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            if (u.Contains("redir-userinfo.pdf", StringComparison.Ordinal))
            {
                var r = new HttpResponseMessage(HttpStatusCode.Found);
                r.Headers.Location = new Uri("https://user:pass@clinicezstorage.blob.core.windows.net/prod/target.pdf");
                return r;
            }
            if (u.Contains("redir-port.pdf", StringComparison.Ordinal))
            {
                var r = new HttpResponseMessage(HttpStatusCode.Found);
                r.Headers.Location = new Uri("https://clinicezstorage.blob.core.windows.net:8443/prod/target.pdf");
                return r;
            }
            if (u.Contains("chunked-nonempty.pdf", StringComparison.Ordinal))
            {
                if (req.Method == HttpMethod.Head) return new HttpResponseMessage(HttpStatusCode.MethodNotAllowed);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StreamContent(new MemoryStream(Encoding.UTF8.GetBytes("chunked-data")))
                };
            }
            if (u.Contains("chunked-empty.pdf", StringComparison.Ordinal))
            {
                if (req.Method == HttpMethod.Head) return new HttpResponseMessage(HttpStatusCode.MethodNotAllowed);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StreamContent(new MemoryStream(Array.Empty<byte>()))
                };
            }
            if (u.Contains("commented-html.pdf", StringComparison.Ordinal))
            {
                return StubHttpMessageHandler.Bytes(
                    HttpStatusCode.OK,
                    Encoding.UTF8.GetBytes("<!-- auth wall -->\n<!DOCTYPE html><html><body>Login</body></html>"),
                    "application/octet-stream");
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var opts = Options.Create(new Track3StorageOptions { Enabled = true, AzureBlob1Enabled = true });
        var downloader = new LegacyBlobSourceDownloader(new HttpClient(handler), opts, NullLogger<LegacyBlobSourceDownloader>.Instance);

        var r1 = await downloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/redir-userinfo.pdf", "application/pdf");
        r1.FailureStatus.Should().Be(SyncStorageStatus.SkippedAuthRequired);
        r1.ErrorCode.Should().Be("AUTH_REDIRECT");

        var r2 = await downloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/redir-port.pdf", "application/pdf");
        r2.FailureStatus.Should().Be(SyncStorageStatus.SkippedAuthRequired);
        r2.ErrorCode.Should().Be("AUTH_REDIRECT");

        // 3. 405 -> 200 chunked without Content-Length/Content-Range peeks 1 byte
        var probeOk = await downloader.ProbeReachableAsync("https://clinicezstorage.blob.core.windows.net/prod/chunked-nonempty.pdf");
        probeOk.Reachable.Should().BeTrue();

        var probeEmpty = await downloader.ProbeReachableAsync("https://clinicezstorage.blob.core.windows.net/prod/chunked-empty.pdf");
        probeEmpty.Reachable.Should().BeFalse();
        probeEmpty.Status.Should().Be(SyncStorageStatus.SkippedEmptyBlob);

        // 4. <!-- comment --><!DOCTYPE html> detected as HTML_INTERSTITIAL
        var htmlRes = await downloader.DownloadAsync("https://clinicezstorage.blob.core.windows.net/prod/commented-html.pdf", "application/pdf");
        htmlRes.Success.Should().BeFalse();
        htmlRes.FailureStatus.Should().Be(SyncStorageStatus.SkippedAuthRequired);
        htmlRes.ErrorCode.Should().Be("HTML_INTERSTITIAL");
    }

    [Fact]
    public void Track3EnvelopeEncryptor_RejectsUnsupportedAlg_AndNormalizesMalformedInputsToCryptographicException()
    {
        var cfg = BuildEncryptionConfig(ClinicSecret1, PatientSecret1);
        var encryptor = new Track3EnvelopeEncryptor(cfg);
        var tenantId = "tnt-gap10";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var payload = Encoding.UTF8.GetBytes("Gap10 envelope validation payload");

        var cEnc = encryptor.EncryptForClinic(payload, tenantId, clinicId);
        var pEnc = encryptor.EncryptForPatient(payload, patientId);

        // 1. Alg != AES-256-GCM rejected
        var badAlgClinic = cEnc.WrappedKeyJson.Replace("\"AES-256-GCM\"", "\"NONE\"", StringComparison.Ordinal);
        Action actBadAlgC = () => encryptor.DecryptForClinic(cEnc.Ciphertext, cEnc.IvBase64, cEnc.TagBase64, badAlgClinic, tenantId, clinicId);
        actBadAlgC.Should().Throw<CryptographicException>();

        var badAlgPatient = pEnc.WrappedKeyJson.Replace("\"AES-256-GCM\"", "\"XOR\"", StringComparison.Ordinal);
        Action actBadAlgP = () => encryptor.DecryptForPatient(pEnc.Ciphertext, pEnc.IvBase64, pEnc.TagBase64, badAlgPatient, patientId);
        actBadAlgP.Should().Throw<CryptographicException>();

        // 2. Malformed JSON / Base64 / IV / Tag lengths throw CryptographicException (never ArgumentException/FormatException/JsonException)
        var shortB64 = Convert.ToBase64String(new byte[8]);
        using var doc = JsonDocument.Parse(cEnc.WrappedKeyJson);
        var badWrapIvJson = JsonSerializer.Serialize(new
        {
            Alg = "AES-256-GCM",
            Kid = doc.RootElement.GetProperty("Kid").GetString(),
            Iv = shortB64,
            Tag = doc.RootElement.GetProperty("Tag").GetString(),
            CipherText = doc.RootElement.GetProperty("CipherText").GetString()
        });
        Action actWrapIv = () => encryptor.DecryptForClinic(cEnc.Ciphertext, cEnc.IvBase64, cEnc.TagBase64, badWrapIvJson, tenantId, clinicId);
        actWrapIv.Should().Throw<CryptographicException>();

        var badWrapTagJson = JsonSerializer.Serialize(new
        {
            Alg = "AES-256-GCM",
            Kid = doc.RootElement.GetProperty("Kid").GetString(),
            Iv = doc.RootElement.GetProperty("Iv").GetString(),
            Tag = shortB64,
            CipherText = doc.RootElement.GetProperty("CipherText").GetString()
        });
        Action actWrapTag = () => encryptor.DecryptForClinic(cEnc.Ciphertext, cEnc.IvBase64, cEnc.TagBase64, badWrapTagJson, tenantId, clinicId);
        actWrapTag.Should().Throw<CryptographicException>();

        Action actBadJson = () => encryptor.DecryptForClinic(cEnc.Ciphertext, cEnc.IvBase64, cEnc.TagBase64, "{not-json", tenantId, clinicId);
        actBadJson.Should().Throw<CryptographicException>();

        Action actBadBase64 = () => encryptor.DecryptForPatient(pEnc.Ciphertext, "!!!bad!!!", pEnc.TagBase64, pEnc.WrappedKeyJson, patientId);
        actBadBase64.Should().Throw<CryptographicException>();

        Action actShortFileIv = () => encryptor.DecryptForPatient(pEnc.Ciphertext, shortB64, pEnc.TagBase64, pEnc.WrappedKeyJson, patientId);
        actShortFileIv.Should().Throw<CryptographicException>();

        Action actShortFileTag = () => encryptor.DecryptForPatient(pEnc.Ciphertext, pEnc.IvBase64, shortB64, pEnc.WrappedKeyJson, patientId);
        actShortFileTag.Should().Throw<CryptographicException>();
    }

    [Fact]
    public async Task TrackingScriptsEndpoint_ReturnsEmbeddedInstallAndUninstallSql()
    {
        await using var fx = new Pg17TestFixture();
        await fx.InitializeAsync();
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, cfg) =>
            {
                cfg.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:V1Source"] = fx.V1ConnectionString,
                    ["ConnectionStrings:ClinicDb"] = fx.ClinicConnectionString,
                    ["ConnectionStrings:PatientDb"] = fx.PatientConnectionString,
                    ["ConnectionStrings:SyncLedgerDb"] = fx.SyncConnectionString,
                    ["V1Sync:EnableBackgroundWorker"] = "false",
                    ["V1Sync:AllowUnauthenticatedLocalDev"] = "true",
                    ["V1Sync:LocalAdminKey"] = "test-tracking-scripts-key"
                });
            });
        });

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-V1-Sync-Admin-Key", "test-tracking-scripts-key");

        var resp = await client.GetAsync("/api/v1/v1-sync/tracking-scripts");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await resp.Content.ReadFromJsonAsync<TrackingSqlScriptsResponse>();
        payload.Should().NotBeNull();
        payload!.Install.FileName.Should().Be("01_install_v1_sync_changelog.sql");
        payload.Install.Sql.Should().Contain("CREATE SCHEMA IF NOT EXISTS _v1_sync");
        payload.Install.Sql.Should().Contain("trg_v1_sync_capture");
        payload.Uninstall.FileName.Should().Be("02_uninstall_v1_sync_changelog.sql");
        payload.Uninstall.Sql.Should().Contain("DROP SCHEMA IF EXISTS _v1_sync CASCADE");
    }

    [Fact]
    public async Task ProbeStorageCountsAsync_ExcludesTerminallySkippedObjectsFromPendingCount()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tenant-skip-probe";
        var clinicId = Guid.NewGuid();
        var clinicPatientId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var okUrl = "https://clinicezstorage.blob.core.windows.net/prod/ok-probe.pdf";
        var emptyUrl = "https://clinicezstorage.blob.core.windows.net/prod/empty-probe.pdf";
        var gdriveUrl = "https://drive.google.com/file/d/1skipProbeExample/view";
        var okBytes = Encoding.UTF8.GetBytes("%PDF-1.4\nprobe-ok\n");

        var handler = new StubHttpMessageHandler(req =>
        {
            var url = req.RequestUri!.ToString();
            if (url == okUrl)
            {
                return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, okBytes, "application/pdf");
            }
            if (url == emptyUrl)
            {
                return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, Array.Empty<byte>(), "application/pdf");
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (engine, _, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "Skip Probe Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Global), "probe-test");

        await SeedClinicAttachmentAsync(fx, Guid.NewGuid(), clinicPatientId, tenantId, clinicId, "application/pdf", okBytes.Length, okUrl);
        await SeedClinicAttachmentAsync(fx, Guid.NewGuid(), clinicPatientId, tenantId, clinicId, "application/pdf", 0, emptyUrl);
        await SeedPatientAndFileAsync(fx, patientId, Guid.NewGuid(), clinicId, "application/pdf", 0, gdriveUrl);

        var before = await engine.ProbeStorageCountsAsync();
        before.ClinicTotal.Should().Be(2);
        before.ClinicPending.Should().Be(2);
        before.ClinicSkipped.Should().Be(0);
        before.PatientTotal.Should().Be(1);
        before.PatientPending.Should().Be(1);
        before.PatientSkipped.Should().Be(0);

        await engine.RunAsync(binding, SyncRunMode.Backfill, sampleLimit: null, triggeredBy: "probe-test", ct: CancellationToken.None);

        var after = await engine.ProbeStorageCountsAsync();
        after.ClinicTotal.Should().Be(2);
        after.ClinicPending.Should().Be(0);
        after.ClinicSkipped.Should().Be(1);
        after.PatientTotal.Should().Be(1);
        after.PatientPending.Should().Be(0);
        after.PatientSkipped.Should().Be(1);
    }

    [Fact]
    public async Task Track1AndTrack2_NonClobber_WhenMigratedObjectsAreFailedRetryable_ZeroFalseConflictsAndPreservesCezKeys()
    {
        await using var fx = new Pg17TestFixture();
        await fx.InitializeAsync();

        var tenantId = "tnt-nonclobber-failed";
        var v2ClinicId = Guid.NewGuid();
        const int v1ClinicId = 302;
        const int v1UserId = 7002;
        const int v1FileId = 8002;

        const string fileUrl = "https://clinicezstorage.blob.core.windows.net/prod/synthetic-failed-retryable.pdf";
        var docBytes = Encoding.UTF8.GetBytes("%PDF-1.7\nNon-clobber FAILED_RETRYABLE payload 98765");

        await Track1ClinicSyncIntegrationTests.InstallExtendedTrack1SchemasAsync(fx);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            ALTER TABLE public."UserAddress" ADD COLUMN IF NOT EXISTS country TEXT;
            ALTER TABLE public."Folder" ADD COLUMN IF NOT EXISTS name TEXT;
            ALTER TABLE public."ClinicPatient" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicalHistory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."Disability" ADD COLUMN IF NOT EXISTS severity TEXT;
            ALTER TABLE public."UserDisability" ADD COLUMN IF NOT EXISTS severity TEXT, ADD COLUMN IF NOT EXISTS reason TEXT, ADD COLUMN IF NOT EXISTS notes TEXT;
            ALTER TABLE public."Vaccine" ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'OTHER';
            ALTER TABLE public."UserVaccination" ADD COLUMN IF NOT EXISTS "hpId" INT;
            ALTER TABLE public."ConsultationDiagnosis" ADD COLUMN IF NOT EXISTS "icd10Code" TEXT, ADD COLUMN IF NOT EXISTS description TEXT, ADD COLUMN IF NOT EXISTS type TEXT;
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, ClinicFullSchemaExtraSql);
        await Track2AndCdcIntegrationTests.ExtendPatientDbSchemaForTrack2Async(fx.PatientConnectionString);

        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            INSERT INTO public."Settings" ("Id", "TenantId", "ClinicId", "ClinicName", "IsDeleted")
            VALUES ('{Guid.NewGuid()}', '{tenantId}', '{v2ClinicId}', 'NonClobber FailedRetryable Clinic', false);
            """);

        await using (var v1 = await fx.Connections.OpenV1SourceAsync())
        {
            const string seedV1 = """
                INSERT INTO public."User" (id, "firstName", "lastName", gender, mobile, "isActive")
                VALUES (@uid, 'Synth', 'FailedRetryable', 'MALE', '09170000100', true)
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId")
                VALUES (902, @cid, @uid) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."Folder" (id, "userId", name, "isActive")
                VALUES (9102, @uid, 'Lab Reports', true) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."FolderSetting" (id, "folderId", privacy, "scopeClinicId")
                VALUES (9202, 9102, 'CLINIC', @cid) ON CONFLICT (id) DO NOTHING;

                INSERT INTO public."File" (id, "folderId", name, size, url, "mimeType", "isActive")
                VALUES (@fid, 9102, 'initial-failed-retryable.pdf', 0, @fileUrl, NULL, true);

                INSERT INTO public."FileSetting" (id, "fileId", privacy, "scopeClinicId")
                VALUES (9302, @fid, 'CLINIC', @cid);
                """;
            await using var cmd = new NpgsqlCommand(seedV1, v1);
            cmd.Parameters.AddWithValue("uid", v1UserId);
            cmd.Parameters.AddWithValue("cid", v1ClinicId);
            cmd.Parameters.AddWithValue("fid", v1FileId);
            cmd.Parameters.AddWithValue("fileUrl", fileUrl);
            await cmd.ExecuteNonQueryAsync();
        }

        var t1Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track1Clinic, Name: "T1 FailedRetryable", V1ClinicId: v1ClinicId, V1OrgId: null, V2TenantId: tenantId, V2ClinicId: v2ClinicId), "test");
        var t2Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient, Name: "T2 FailedRetryable", V1ClinicId: null, V1OrgId: null, V2TenantId: null, V2ClinicId: null, PatientCohortMode: SyncCohortMode.Global), "test");
        var t3Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage, Name: "T3 FailedRetryable", V1ClinicId: v1ClinicId, V1OrgId: null, V2TenantId: tenantId, V2ClinicId: v2ClinicId, PatientCohortMode: SyncCohortMode.Global), "test");

        var handler = new StubHttpMessageHandler(req =>
        {
            var u = req.RequestUri!.ToString();
            if (u == fileUrl) return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, docBytes, "application/pdf");
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client, verificationSampleRate: 0.01);

        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t3Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);

        var clinicAttId = DeterministicUuid.ClinicAttachmentFromFileId(v2ClinicId, v1FileId);
        var patientFileId = DeterministicUuid.PatientFileRecordId(v1FileId);
        var (_, _, _, _, clinicUriBefore) = await ReadClinicCryptoRowAsync(fx, clinicAttId);
        var (_, _, _, _, patientKeyBefore) = await ReadPatientCryptoRowAsync(fx, patientFileId);
        clinicUriBefore.Should().EndWith(".cez");
        patientKeyBefore.Should().EndWith(".cez");

        // Trigger Stage 4 verification failure -> both rows transition to FAILED_RETRYABLE while target DB retains .cez + AES-256-GCM
        await Pg17TestFixture.ExecuteSqlAsync(fx.SyncConnectionString,
            $"UPDATE sync_storage_objects SET status = 'MIGRATED', verified_at = NULL WHERE binding_id = '{t3Binding.Id}'");
        clinicS3.GetRaw("clinicez-clinic-test", clinicUriBefore).Bytes[0] ^= 0xFF;
        patientS3.GetRaw("clinicez-patient-test", patientKeyBefore).Bytes[0] ^= 0xFF;

        var sweep = await coordinator.ExecuteAsync(t3Binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        sweep.Status.Should().Be(SyncRunStatus.Completed);

        var statesAfterSweep = await fx.Ledger.LoadStorageObjectStatesAsync(t3Binding.Id);
        statesAfterSweep[(SyncStoragePlane.ClinicAttachment, clinicAttId)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        statesAfterSweep[(SyncStoragePlane.ClinicAttachment, clinicAttId)].TargetR2Key.Should().Be(clinicUriBefore);
        statesAfterSweep[(SyncStoragePlane.PatientFile, patientFileId)].Status.Should().Be(SyncStorageStatus.FailedRetryable);
        statesAfterSweep[(SyncStoragePlane.PatientFile, patientFileId)].TargetR2Key.Should().Be(patientKeyBefore);

        // Mutate v1 File.name while both Track 3 ledger rows are FAILED_RETRYABLE
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString,
            $"UPDATE public.\"File\" SET name = 'renamed-while-failed-retryable.pdf', \"updatedAt\" = now() WHERE id = {v1FileId};");

        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None)).Status.Should().Be(SyncRunStatus.Completed);

        (await fx.Ledger.CountOpenConflictsAsync(t1Binding.Id)).Should().Be(0);
        (await fx.Ledger.CountOpenConflictsAsync(t2Binding.Id)).Should().Be(0);

        var (cAlgAfter, _, _, _, cUriAfter) = await ReadClinicCryptoRowAsync(fx, clinicAttId);
        var (pAlgAfter, _, _, _, pKeyAfter) = await ReadPatientCryptoRowAsync(fx, patientFileId);
        cAlgAfter.Should().Be("AES-256-GCM");
        cUriAfter.Should().Be(clinicUriBefore);
        pAlgAfter.Should().Be("AES-256-GCM");
        pKeyAfter.Should().Be(patientKeyBefore);

        await using var cConn = await fx.Connections.OpenClinicDbAsync();
        await using (var cmd = new NpgsqlCommand($"SELECT \"FileName\" FROM public.\"RecordAttachments\" WHERE \"Id\" = '{clinicAttId}'", cConn))
        {
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("renamed-while-failed-retryable.pdf");
        }

        await using var pConn = await fx.Connections.OpenPatientDbAsync();
        await using (var cmd = new NpgsqlCommand($"SELECT file_name FROM public.file_records WHERE id = '{patientFileId}'", pConn))
        {
            (await cmd.ExecuteScalarAsync())!.ToString().Should().Be("renamed-while-failed-retryable.pdf");
        }
    }

    [Fact]
    public async Task DryRun_WithSampleLimit_DoesNotStarveAzureBlob1Probes_WhenManyLegacyLinksPrecedeInUuidOrder()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-dryrun-starvation";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 30 Google Drive rows with smaller UUIDs than 5 Azure Blob #1 rows
        for (var i = 1; i <= 30; i++)
        {
            var id = new Guid($"00000000-0000-0000-0000-{i:x12}");
            await SeedClinicAttachmentAsync(
                fx, id, patientId, tenantId, clinicId, "application/pdf", 0,
                $"https://drive.google.com/file/d/drive-starve-{i}/view");
        }

        var probedUrls = new ConcurrentBag<string>();
        var payload = Encoding.UTF8.GetBytes("azure-blob-1-dryrun-probe-payload");
        for (var i = 1; i <= 5; i++)
        {
            var id = new Guid($"ffffffff-ffff-ffff-ffff-{i:x12}");
            await SeedClinicAttachmentAsync(
                fx, id, patientId, tenantId, clinicId, "application/pdf", payload.Length,
                $"https://clinicezstorage.blob.core.windows.net/prod/dryrun-probe-{i}.pdf");
        }

        var handler = new StubHttpMessageHandler(req =>
        {
            probedUrls.Add(req.RequestUri!.ToString());
            return StubHttpMessageHandler.Bytes(HttpStatusCode.OK, payload, "application/pdf");
        });
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (_, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "DryRun Starvation Regression",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        var dryRun = await coordinator.ExecuteAsync(
            binding.Id, SyncRunMode.DryRun, sampleLimit: 25, forceV1OnConflict: false, "test", CancellationToken.None,
            request: new RunSyncRequest(SampleLimit: 25, ProviderFilter: "ALL", TargetPlaneFilter: "BOTH"));
        dryRun.Status.Should().Be(SyncRunStatus.Completed);

        var summary = JsonSerializer.Deserialize<SyncRunSummary>(
            dryRun.Summary.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        summary.TotalItems.Should().BeLessThanOrEqualTo(25);
        summary.ProcessedItems.Should().BeLessThanOrEqualTo(25);
        summary.SkippedCount.Should().Be(20);
        summary.Notes.Should().Contain(n => n.Contains("Dry-run sampled 5 Azure Blob #1 URLs: 5 reachable, 0 unreachable/skipped", StringComparison.Ordinal));
        probedUrls.Distinct(StringComparer.Ordinal).Count().Should().Be(5);
        clinicS3.CountObjects("clinicez-clinic-test").Should().Be(0);
        (await fx.Ledger.LoadStorageObjectStatesAsync(binding.Id)).Should().BeEmpty();
    }

    [Fact]
    public async Task BuildParityReport_SkippedRowWithUpdatedAzureBlob1SourceUrl_CountsAsPendingBeforeNextRun()
    {
        await using var fx = await CreateTrack3TestFixtureAsync();

        var tenantId = "tnt-info-r2-1";
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var clinicAttId = Guid.NewGuid();
        var patientFileId = Guid.NewGuid();

        const string initialDriveUrl = "https://drive.google.com/file/d/replaced-later/view";
        const string updatedAzureUrl = "https://clinicezstorage.blob.core.windows.net/prod/now-valid.pdf";

        await SeedClinicAttachmentAsync(fx, clinicAttId, patientId, tenantId, clinicId, "application/pdf", 0, initialDriveUrl);
        await SeedPatientAndFileAsync(fx, patientId, patientFileId, clinicId, "application/pdf", 0, initialDriveUrl);

        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (engine, coordinator, _) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);

        var binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "INFO-R2-1 Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Scoped), "test");

        (await coordinator.ExecuteAsync(binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);

        var parityBeforeUpdate = await engine.BuildParityReportAsync(binding);
        parityBeforeUpdate.ReadyToFreeze.Should().BeTrue();

        // Update both SourceUrls to valid Azure Blob #1 URLs without running Track 3 again yet
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString,
            $"UPDATE public.\"RecordAttachments\" SET \"StorageUri\" = '{updatedAzureUrl}' WHERE \"Id\" = '{clinicAttId}'");
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString,
            $"UPDATE public.file_records SET storage_key = '{updatedAzureUrl}' WHERE id = '{patientFileId}'");

        var parityAfterUpdate = await engine.BuildParityReportAsync(binding);
        parityAfterUpdate.ReadyToFreeze.Should().BeFalse();
        parityAfterUpdate.Checks.Should().Contain(c => c.EntityType.Contains("Clinic") && !c.IsMatched);
        parityAfterUpdate.Checks.Should().Contain(c => c.EntityType.Contains("Patient") && !c.IsMatched);
    }

    [Fact]
    public async Task PatientAvatars_DownloadOnceEncryptTwice_ForAzureBlob1AndVercelBlob_AndReEncryptsOnV1AvatarChange()
    {
        await using var fx = new Pg17TestFixture();
        await fx.InitializeAsync();

        var tenantId = "tnt-avatar-r2";
        var clinicId = Guid.NewGuid();
        var clinicPatientId1 = DeterministicUuid.ClinicPatientId(clinicId, 9501);
        var clinicPatientId2 = DeterministicUuid.ClinicPatientId(clinicId, 9502);
        var clinicPatientId3 = DeterministicUuid.ClinicPatientId(clinicId, 9503);
        var patientAccountId1 = DeterministicUuid.PatientAccountId(9501);
        var patientAccountId2 = DeterministicUuid.PatientAccountId(9502);
        var patientAccountId3 = DeterministicUuid.PatientAccountId(9503);

        await Track1ClinicSyncIntegrationTests.InstallExtendedTrack1SchemasAsync(fx);
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            ALTER TABLE public."UserAddress" ADD COLUMN IF NOT EXISTS country TEXT;
            ALTER TABLE public."Folder" ADD COLUMN IF NOT EXISTS name TEXT;
            ALTER TABLE public."ClinicPatient" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."MedicalHistory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
            ALTER TABLE public."Disability" ADD COLUMN IF NOT EXISTS severity TEXT;
            ALTER TABLE public."UserDisability" ADD COLUMN IF NOT EXISTS severity TEXT, ADD COLUMN IF NOT EXISTS reason TEXT, ADD COLUMN IF NOT EXISTS notes TEXT;
            ALTER TABLE public."Vaccine" ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'OTHER';
            ALTER TABLE public."UserVaccination" ADD COLUMN IF NOT EXISTS "hpId" INT;
            ALTER TABLE public."ConsultationDiagnosis" ADD COLUMN IF NOT EXISTS "icd10Code" TEXT, ADD COLUMN IF NOT EXISTS description TEXT, ADD COLUMN IF NOT EXISTS type TEXT;
            """);
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, ClinicFullSchemaExtraSql);
        await Track2AndCdcIntegrationTests.ExtendPatientDbSchemaForTrack2Async(fx.PatientConnectionString);
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, $"""
            INSERT INTO public."Settings" ("Id", "TenantId", "ClinicId", "ClinicName", "IsDeleted")
            VALUES ('{Guid.NewGuid()}', '{tenantId}', '{clinicId}', 'Avatar Test Clinic', false);
            """);

        const string azureAvatarUrl = "https://clinicezstorage.blob.core.windows.net/prod/patient-avatar-9501.jpg";
        const string vercelAvatarUrl = "https://wkkzdib5fdabtkpz.public.blob.vercel-storage.com/patient-avatar-9502.png";
        const string clerkAvatarUrl = "https://images.clerk.dev/oauth_google/img_9503";
        const string updatedAzureAvatarUrl = "https://clinicezstorage.blob.core.windows.net/prod/patient-avatar-9501-v2.jpg";

        var avatarBytes1 = Encoding.UTF8.GetBytes("synthetic-jpeg-avatar-bytes-9501");
        var avatarBytes2 = Encoding.UTF8.GetBytes("synthetic-png-avatar-bytes-9502");
        var avatarBytes1Updated = Encoding.UTF8.GetBytes("synthetic-jpeg-avatar-bytes-9501-updated");

        var downloadCounts = new ConcurrentDictionary<string, int>(StringComparer.Ordinal);
        var handler = new StubHttpMessageHandler(req =>
        {
            var url = req.RequestUri!.ToString();
            if (req.Method == HttpMethod.Get)
            {
                downloadCounts.AddOrUpdate(url, 1, (_, c) => c + 1);
            }
            if (url == azureAvatarUrl)
            {
                var r = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(avatarBytes1) };
                r.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
                return r;
            }
            if (url == vercelAvatarUrl)
            {
                var r = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(avatarBytes2) };
                r.Content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
                return r;
            }
            if (url == updatedAzureAvatarUrl)
            {
                var r = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(avatarBytes1Updated) };
                r.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
                return r;
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, $"""
            INSERT INTO public."User" (id, "userId", email, picture, "firstName", "lastName", dob, gender, mobile, "isActive")
            VALUES
                (9501, 'auth0|av9501', 'av9501@example.test', '{azureAvatarUrl}', 'Avatar', 'AzureOne', '1991-05-01', 'FEMALE', '09170009501', true),
                (9502, 'auth0|av9502', 'av9502@example.test', '{vercelAvatarUrl}', 'Avatar', 'VercelTwo', '1992-06-02', 'MALE', '09170009502', true),
                (9503, 'auth0|av9503', 'av9503@example.test', '{clerkAvatarUrl}', 'Avatar', 'ClerkThree', '1993-07-03', 'FEMALE', '09170009503', true);
            INSERT INTO public."ClinicPatient" (id, "clinicId", "patientId") VALUES
                (9501, 101, 9501), (9502, 101, 9502), (9503, 101, 9503);
            """);

        var clinicS3 = new InMemoryAmazonS3();
        var patientS3 = new InMemoryAmazonS3();
        var (engine, coordinator, encCfg) = BuildTrack3Runtime(fx, handler, clinicS3.Client, patientS3.Client);
        var encryptor = new Track3EnvelopeEncryptor(encCfg);

        var t1Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track1Clinic,
            Name: "Track1 Avatar Binding",
            V1ClinicId: 101,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId), "test");
        var t2Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track2Patient,
            Name: "Track2 Avatar Binding",
            V1ClinicId: null,
            V1OrgId: null,
            V2TenantId: null,
            V2ClinicId: null,
            PatientCohortMode: SyncCohortMode.Global), "test");
        var t3Binding = await fx.Ledger.CreateBindingAsync(new CreateBindingRequest(
            Track: SyncTrack.Track3Storage,
            Name: "Track3 Avatar Binding",
            V1ClinicId: 101,
            V1OrgId: null,
            V2TenantId: tenantId,
            V2ClinicId: clinicId,
            PatientCohortMode: SyncCohortMode.Global), "test");

        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Backfill, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);

        var t3Run = await coordinator.ExecuteAsync(t3Binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None);
        t3Run.Status.Should().Be(SyncRunStatus.Completed);

        // Download-Once, Encrypt-Twice: both Azure Blob #1 and Vercel Blob downloaded strictly ONCE despite Clinic + Patient copies
        downloadCounts[azureAvatarUrl].Should().Be(1);
        downloadCounts[vercelAvatarUrl].Should().Be(1);

        // Verify Clinic DB + CMK R2 decryption for both Azure Blob #1 and Vercel Blob avatars
        await using (var clinicConn = new NpgsqlConnection(fx.ClinicConnectionString))
        {
            await clinicConn.OpenAsync();
            foreach (var (pid, expectedBytes, expectedMime) in new[]
            {
                (clinicPatientId1, avatarBytes1, "image/jpeg"),
                (clinicPatientId2, avatarBytes2, "image/png")
            })
            {
                await using var cmd = new NpgsqlCommand(
                    """
                    SELECT "AvatarUrl", "AvatarContentType", "AvatarEncryptionAlgorithm", "AvatarEncryptionKeyId",
                           "AvatarEncryptionIvBase64", "AvatarEncryptionTagBase64", "AvatarWrappedKeyJson"
                    FROM public."Patients" WHERE "Id" = @id
                    """, clinicConn);
                cmd.Parameters.AddWithValue("id", pid);
                await using var r = await cmd.ExecuteReaderAsync();
                (await r.ReadAsync()).Should().BeTrue();
                var key = r.GetString(0);
                key.Should().Be($"tenants/{tenantId}/clinics/{clinicId}/patients/{pid}/avatar.cez");
                r.GetString(1).Should().Be(expectedMime);
                r.GetString(2).Should().Be("AES-256-GCM");
                r.GetString(3).Should().Be("cmk-v1");
                var cipher = clinicS3.GetRaw("clinicez-clinic-test", key).Bytes;
                var decrypted = encryptor.DecryptForClinic(cipher, r.GetString(4), r.GetString(5), r.GetString(6), tenantId, clinicId);
                decrypted.Should().Equal(expectedBytes);
            }

            // Clerk CDN avatar remains untouched as live HTTPS URL
            await using var clerkCmd = new NpgsqlCommand(
                """SELECT "AvatarUrl", "AvatarEncryptionAlgorithm" FROM public."Patients" WHERE "Id" = @id""", clinicConn);
            clerkCmd.Parameters.AddWithValue("id", clinicPatientId3);
            await using var cr = await clerkCmd.ExecuteReaderAsync();
            (await cr.ReadAsync()).Should().BeTrue();
            cr.GetString(0).Should().Be(clerkAvatarUrl);
            cr.GetString(1).Should().Be("NONE");
        }

        // Verify Patient DB + PMK R2 decryption
        await using (var patConn = new NpgsqlConnection(fx.PatientConnectionString))
        {
            await patConn.OpenAsync();
            foreach (var (pid, expectedBytes, expectedMime) in new[]
            {
                (patientAccountId1, avatarBytes1, "image/jpeg"),
                (patientAccountId2, avatarBytes2, "image/png")
            })
            {
                await using var cmd = new NpgsqlCommand(
                    """
                    SELECT avatar_url, avatar_content_type, avatar_encryption_algorithm, avatar_encryption_key_id,
                           avatar_encryption_iv_base64, avatar_encryption_tag_base64, avatar_wrapped_key_json
                    FROM public.patients WHERE id = @id
                    """, patConn);
                cmd.Parameters.AddWithValue("id", pid);
                await using var r = await cmd.ExecuteReaderAsync();
                (await r.ReadAsync()).Should().BeTrue();
                var key = r.GetString(0);
                key.Should().Be($"patients/{pid}/avatar/{pid}.cez");
                r.GetString(1).Should().Be(expectedMime);
                r.GetString(2).Should().Be("AES-256-GCM");
                r.GetString(3).Should().Be("pmk-v1");
                var cipher = patientS3.GetRaw("clinicez-patient-test", key).Bytes;
                var decrypted = encryptor.DecryptForPatient(cipher, r.GetString(4), r.GetString(5), r.GetString(6), pid);
                decrypted.Should().Equal(expectedBytes);
            }
        }

        var parity = await engine.BuildParityReportAsync(t3Binding);
        parity.ReadyToFreeze.Should().BeTrue();
        parity.Checks.Should().Contain(c => c.EntityType == "Clinic Patient Avatars (AES-256-GCM)" && c.V2ActualCount == 2 && c.IsMatched);
        parity.Checks.Should().Contain(c => c.EntityType == "Patient Avatars (AES-256-GCM)" && c.V2ActualCount == 2 && c.IsMatched);

        // Live CDC non-clobber: changing patient name in V1 preserves encrypted R2 avatar key in both Clinic and Patient!
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, """
            UPDATE public."User" SET "firstName" = 'AvatarRenamed' WHERE id = 9501;
            """);
        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);

        await using (var clinicConn = new NpgsqlConnection(fx.ClinicConnectionString))
        {
            await clinicConn.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                """SELECT "FirstName", "AvatarUrl", "AvatarEncryptionAlgorithm" FROM public."Patients" WHERE "Id" = @id""", clinicConn);
            cmd.Parameters.AddWithValue("id", clinicPatientId1);
            await using var r = await cmd.ExecuteReaderAsync();
            (await r.ReadAsync()).Should().BeTrue();
            r.GetString(0).Should().Be("AvatarRenamed");
            r.GetString(1).Should().EndWith("/avatar.cez");
            r.GetString(2).Should().Be("AES-256-GCM");
        }

        // Real V1 avatar change: updating User.picture in V1 resets encryption to NONE so Track 3 re-encrypts the new photo!
        await Pg17TestFixture.ExecuteSqlAsync(fx.V1ConnectionString, $"""
            UPDATE public."User" SET picture = '{updatedAzureAvatarUrl}' WHERE id = 9501;
            """);
        (await coordinator.ExecuteAsync(t1Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t2Binding.Id, SyncRunMode.Incremental, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);
        (await coordinator.ExecuteAsync(t3Binding.Id, SyncRunMode.FinalSweep, null, false, "test", CancellationToken.None))
            .Status.Should().Be(SyncRunStatus.Completed);

        downloadCounts[updatedAzureAvatarUrl].Should().Be(1);
        await using (var patConn = new NpgsqlConnection(fx.PatientConnectionString))
        {
            await patConn.OpenAsync();
            await using var cmd = new NpgsqlCommand(
                """
                SELECT avatar_url, avatar_encryption_iv_base64, avatar_encryption_tag_base64, avatar_wrapped_key_json
                FROM public.patients WHERE id = @id
                """, patConn);
            cmd.Parameters.AddWithValue("id", patientAccountId1);
            await using var r = await cmd.ExecuteReaderAsync();
            (await r.ReadAsync()).Should().BeTrue();
            var cipher = patientS3.GetRaw("clinicez-patient-test", r.GetString(0)).Bytes;
            encryptor.DecryptForPatient(cipher, r.GetString(1), r.GetString(2), r.GetString(3), patientAccountId1)
                .Should().Equal(avatarBytes1Updated);
        }
    }

    private sealed class CapturingCategoryLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentBag<(string Category, LogLevel Level, string Message)> _entries;
        public CapturingCategoryLoggerProvider(ConcurrentBag<(string Category, LogLevel Level, string Message)> entries) => _entries = entries;
        public ILogger CreateLogger(string categoryName) => new CategoryLogger(categoryName, _entries);
        public void Dispose() { }

        private sealed class CategoryLogger : ILogger
        {
            private readonly string _category;
            private readonly ConcurrentBag<(string Category, LogLevel Level, string Message)> _entries;
            public CategoryLogger(string category, ConcurrentBag<(string Category, LogLevel Level, string Message)> entries)
            {
                _category = category;
                _entries = entries;
            }
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
                => _entries.Add((_category, logLevel, formatter(state, exception)));
        }
    }

    private sealed class CapturingAwsHttpClientFactory : Amazon.Runtime.HttpClientFactory
    {
        private readonly HttpMessageHandler _handler;
        public CapturingAwsHttpClientFactory(HttpMessageHandler handler) => _handler = handler;
        public override HttpClient CreateHttpClient(Amazon.Runtime.IClientConfig clientConfig) =>
            new(_handler, disposeHandler: false);
    }

    private sealed class StubHttpClientFactory : IHttpClientFactory
    {
        private readonly HttpMessageHandler _handler;
        public StubHttpClientFactory(HttpMessageHandler handler) => _handler = handler;
        public HttpClient CreateClient(string name) => new(_handler, disposeHandler: false);
    }

    private sealed class SimpleHostEnvironment : IHostEnvironment
    {
        public SimpleHostEnvironment(string environmentName) => EnvironmentName = environmentName;
        public string EnvironmentName { get; set; }
        public string ApplicationName { get; set; } = "ClinicEz.V1Sync.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed record CapturedLogEntry(LogLevel Level, string Message, Exception? Exception);

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<CapturedLogEntry> Entries { get; } = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add(new CapturedLogEntry(logLevel, formatter(state, exception), exception));
        }
    }

    private static async Task<Pg17TestFixture> CreateTrack3TestFixtureAsync()
    {
        var fx = new Pg17TestFixture();
        await fx.InitializeAsync();
        await Pg17TestFixture.ExecuteSqlAsync(fx.ClinicConnectionString, RecordAttachmentsTableSql + "\n" + ClinicFullSchemaExtraSql);
        await Pg17TestFixture.ExecuteSqlAsync(fx.PatientConnectionString, FileRecordsTableSql);
        return fx;
    }

    private static (Track3StorageSyncEngine Engine, SyncCoordinator Coordinator, IConfiguration EncConfig) BuildTrack3Runtime(
        Pg17TestFixture fx,
        HttpMessageHandler httpHandler,
        IAmazonS3 clinicS3,
        IAmazonS3 patientS3,
        double verificationSampleRate = 0.02,
        SyncConnectionFactory? customConnections = null)
    {
        var encCfg = BuildEncryptionConfig(ClinicSecret1, PatientSecret1);
        var opts = Options.Create(new Track3StorageOptions
        {
            Enabled = true,
            MaxConcurrency = 4,
            MaxFileSizeBytes = 10 * 1024 * 1024,
            VerificationSampleRate = verificationSampleRate,
            AzureBlob1Enabled = true
        });
        var encryptor = new Track3EnvelopeEncryptor(encCfg);
        var r2Pool = new Track3R2ClientPool(
            clinicS3, "clinicez-clinic-test",
            patientS3, "clinicez-patient-test",
            NullLogger<Track3R2ClientPool>.Instance);
        var downloader = new LegacyBlobSourceDownloader(
            new HttpClient(httpHandler), opts, NullLogger<LegacyBlobSourceDownloader>.Instance);
        var conns = customConnections ?? fx.Connections;
        var engine = new Track3StorageSyncEngine(
            conns, fx.Ledger, encryptor, r2Pool, downloader, opts, NullLogger<Track3StorageSyncEngine>.Instance);
        var coordinator = new SyncCoordinator(
            fx.Ledger, fx.Track1, fx.Track2, NullLogger<SyncCoordinator>.Instance, engine, conns);
        return (engine, coordinator, encCfg);
    }

    private static IConfiguration BuildEncryptionConfig(
        string clinicSecret,
        string patientSecret,
        string? prevClinic = null,
        string? prevPatient = null)
    {
        var dict = new Dictionary<string, string?>
        {
            [Track3EnvelopeEncryptor.ClinicMasterSecretKey] = clinicSecret,
            [Track3EnvelopeEncryptor.PatientMasterSecretKey] = patientSecret
        };
        if (prevClinic is not null) dict[$"{Track3EnvelopeEncryptor.ClinicPreviousMasterSecretsKey}:0"] = prevClinic;
        if (prevPatient is not null) dict[$"{Track3EnvelopeEncryptor.PatientPreviousMasterSecretsKey}:0"] = prevPatient;
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    private static string ComputeExpectedKid(string secret) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(secret)), 0, 4).ToLowerInvariant();

    private static async Task SeedClinicAttachmentAsync(
        Pg17TestFixture fx,
        Guid attachmentId,
        Guid patientId,
        string tenantId,
        Guid clinicId,
        string contentType,
        long sizeBytes,
        string storageUri)
    {
        await using var conn = await fx.Connections.OpenClinicDbAsync();
        const string sql = """
            INSERT INTO public."RecordAttachments" (
                "Id","PatientId","RecordType","Title","FileName","ContentType","FileSizeBytes",
                "StorageUri","DocumentDate","VerificationStatus","EncryptionAlgorithm",
                "CreatedAt","CreatedBy","UpdatedAt","UpdatedBy","IsDeleted","TenantId","ClinicId"
            ) VALUES (
                @id,@pid,'Other','Synthetic Attachment','synthetic.pdf',@ctype,@size,
                @uri,CURRENT_DATE,'Verified','NONE',
                now(),'test',now(),'test',false,@tid,@cid
            )
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", attachmentId);
        cmd.Parameters.AddWithValue("pid", patientId);
        cmd.Parameters.AddWithValue("ctype", contentType);
        cmd.Parameters.AddWithValue("size", sizeBytes);
        cmd.Parameters.AddWithValue("uri", storageUri);
        cmd.Parameters.AddWithValue("tid", tenantId);
        cmd.Parameters.AddWithValue("cid", clinicId);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedPatientAndFileAsync(
        Pg17TestFixture fx,
        Guid patientId,
        Guid fileId,
        Guid? clinicId,
        string? mimeType,
        long sizeBytes,
        string storageKey)
    {
        await using var conn = await fx.Connections.OpenPatientDbAsync();
        const string patientSql = """
            INSERT INTO public.patients (id, client_id, clinic_ez_id, first_name, last_name, created_by)
            VALUES (@pid, @pid, @cezId, 'SynthFirst', 'SynthLast', 'test')
            ON CONFLICT (id) DO NOTHING
            """;
        await using (var pCmd = new NpgsqlCommand(patientSql, conn))
        {
            pCmd.Parameters.AddWithValue("pid", patientId);
            pCmd.Parameters.AddWithValue("cezId", $"CEZ-{patientId.ToString("N")[..8]}");
            await pCmd.ExecuteNonQueryAsync();
        }

        const string fileSql = """
            INSERT INTO public.file_records (
                id, client_id, patient_id, clinic_id, file_name, mime_type, extension,
                size_bytes, storage_key, document_type_id, sync_status, uploaded_at,
                encryption_algorithm, title, created_by, is_deleted
            ) VALUES (
                @fid, @fid, @pid, @cid, 'synthetic-file.pdf', @mime, 'pdf',
                @size, @key, '66666666-6666-6666-6666-666666666666', 'Synced', now(),
                'NONE', 'Synthetic File', 'test', false
            )
            """;
        await using (var fCmd = new NpgsqlCommand(fileSql, conn))
        {
            fCmd.Parameters.AddWithValue("fid", fileId);
            fCmd.Parameters.AddWithValue("pid", patientId);
            fCmd.Parameters.AddWithValue("cid", (object?)clinicId ?? DBNull.Value);
            fCmd.Parameters.AddWithValue("mime", (object?)mimeType ?? DBNull.Value);
            fCmd.Parameters.AddWithValue("size", sizeBytes);
            fCmd.Parameters.AddWithValue("key", storageKey);
            await fCmd.ExecuteNonQueryAsync();
        }
    }

    private static async Task<(string Alg, string Iv, string Tag, string Wrapped, string Uri)> ReadClinicCryptoRowAsync(Pg17TestFixture fx, Guid id)
    {
        await using var conn = await fx.Connections.OpenClinicDbAsync();
        const string sql = """
            SELECT COALESCE("EncryptionAlgorithm", 'NONE'), COALESCE("EncryptionIvBase64", ''),
                   COALESCE("EncryptionTagBase64", ''), COALESCE("WrappedKeyJson", ''), "StorageUri"
            FROM public."RecordAttachments" WHERE "Id" = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync();
        (await r.ReadAsync()).Should().BeTrue();
        return (r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4));
    }

    private static async Task<(string Alg, string Iv, string Tag, string Wrapped, string Key)> ReadPatientCryptoRowAsync(Pg17TestFixture fx, Guid id)
    {
        await using var conn = await fx.Connections.OpenPatientDbAsync();
        const string sql = """
            SELECT COALESCE(encryption_algorithm, 'NONE'), COALESCE(encryption_iv_base64, ''),
                   COALESCE(encryption_tag_base64, ''), COALESCE(wrapped_key_json, ''), storage_key
            FROM public.file_records WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var r = await cmd.ExecuteReaderAsync();
        (await r.ReadAsync()).Should().BeTrue();
        return (r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4));
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _responder;

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            _responder = (req, _) => Task.FromResult(responder(req));
        }

        public StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> asyncResponder)
        {
            _responder = asyncResponder;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            _responder(request, cancellationToken);

        public static HttpResponseMessage Bytes(HttpStatusCode status, byte[] bytes, string mediaType)
        {
            var resp = new HttpResponseMessage(status)
            {
                Content = new ByteArrayContent(bytes)
            };
            resp.Content.Headers.ContentType = new MediaTypeHeaderValue(mediaType);
            resp.Content.Headers.ContentLength = bytes.LongLength;
            return resp;
        }
    }

    public sealed class InMemoryStoredObject
    {
        public byte[] Bytes { get; init; } = Array.Empty<byte>();
        public Dictionary<string, string> Metadata { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    }

    private sealed class InMemoryAmazonS3
    {
        private readonly ConcurrentDictionary<(string Bucket, string Key), InMemoryStoredObject> _objects = new();
        private readonly ConcurrentDictionary<(string Bucket, string Key), int> _putCounts = new();
        private readonly InMemoryS3Proxy _proxy;

        public InMemoryAmazonS3()
        {
            var proxy = DispatchProxy.Create<IAmazonS3, InMemoryS3Proxy>();
            _proxy = (InMemoryS3Proxy)(object)proxy;
            _proxy.Objects = _objects;
            _proxy.PutCounts = _putCounts;
            Client = proxy;
        }

        public Action<PutObjectRequest>? OnPutObject
        {
            get => _proxy.OnPutObject;
            set => _proxy.OnPutObject = value;
        }

        public Action<GetObjectRequest>? OnGetObject
        {
            get => _proxy.OnGetObject;
            set => _proxy.OnGetObject = value;
        }

        public IAmazonS3 Client { get; }
        public bool Contains(string bucket, string key) => _objects.ContainsKey((bucket, key));
        public int CountObjects(string bucket) => _objects.Keys.Count(k => k.Bucket == bucket);
        public int GetPutCount(string bucket, string key) => _putCounts.GetValueOrDefault((bucket, key));
        public InMemoryStoredObject GetRaw(string bucket, string key) => _objects[(bucket, key)];
    }

    public class InMemoryS3Proxy : DispatchProxy
    {
        internal ConcurrentDictionary<(string Bucket, string Key), InMemoryStoredObject> Objects { get; set; } = null!;
        internal ConcurrentDictionary<(string Bucket, string Key), int> PutCounts { get; set; } = null!;
        internal Action<PutObjectRequest>? OnPutObject { get; set; }
        internal Action<GetObjectRequest>? OnGetObject { get; set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            switch (targetMethod?.Name)
            {
                case nameof(IAmazonS3.PutObjectAsync):
                {
                    var req = (PutObjectRequest)args![0]!;
                    using var ms = new MemoryStream();
                    req.InputStream.CopyTo(ms);
                    var meta = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var k in req.Metadata.Keys)
                    {
                        meta[k] = req.Metadata[k];
                    }
                    Objects[(req.BucketName, req.Key)] = new InMemoryStoredObject
                    {
                        Bytes = ms.ToArray(),
                        Metadata = meta
                    };
                    PutCounts.AddOrUpdate((req.BucketName, req.Key), 1, (_, c) => c + 1);
                    OnPutObject?.Invoke(req);
                    return Task.FromResult(new PutObjectResponse { HttpStatusCode = HttpStatusCode.OK });
                }
                case nameof(IAmazonS3.GetObjectMetadataAsync):
                {
                    var req = (GetObjectMetadataRequest)args![0]!;
                    if (!Objects.TryGetValue((req.BucketName, req.Key), out var obj))
                    {
                        return Task.FromException<GetObjectMetadataResponse>(
                            new AmazonS3Exception("Not Found") { StatusCode = HttpStatusCode.NotFound });
                    }
                    var resp = new GetObjectMetadataResponse
                    {
                        HttpStatusCode = HttpStatusCode.OK,
                        ContentLength = obj.Bytes.LongLength
                    };
                    resp.Headers.ContentLength = obj.Bytes.LongLength;
                    return Task.FromResult(resp);
                }
                case nameof(IAmazonS3.GetObjectAsync):
                {
                    var req = (GetObjectRequest)args![0]!;
                    if (!Objects.TryGetValue((req.BucketName, req.Key), out var obj))
                    {
                        return Task.FromException<GetObjectResponse>(
                            new AmazonS3Exception("Not Found") { StatusCode = HttpStatusCode.NotFound });
                    }
                    OnGetObject?.Invoke(req);
                    return Task.FromResult(new GetObjectResponse
                    {
                        HttpStatusCode = HttpStatusCode.OK,
                        ResponseStream = new MemoryStream(obj.Bytes, writable: false)
                    });
                }
                case nameof(IAmazonS3.DeleteObjectAsync):
                {
                    var req = (DeleteObjectRequest)args![0]!;
                    Objects.TryRemove((req.BucketName, req.Key), out _);
                    return Task.FromResult(new DeleteObjectResponse { HttpStatusCode = HttpStatusCode.NoContent });
                }
                case nameof(IAmazonS3.ListObjectsV2Async):
                {
                    var req = (ListObjectsV2Request)args![0]!;
                    var objs = Objects
                        .Where(kv => kv.Key.Bucket == req.BucketName)
                        .Take(req.MaxKeys ?? 1000)
                        .Select(kv => new S3Object { BucketName = kv.Key.Bucket, Key = kv.Key.Key, Size = kv.Value.Bytes.LongLength })
                        .ToList();
                    return Task.FromResult(new ListObjectsV2Response { HttpStatusCode = HttpStatusCode.OK, S3Objects = objs });
                }
                case nameof(IDisposable.Dispose):
                    return null;
                default:
                    throw new NotImplementedException($"Method {targetMethod?.Name} is not implemented in InMemoryS3Proxy.");
            }
        }
    }
}
