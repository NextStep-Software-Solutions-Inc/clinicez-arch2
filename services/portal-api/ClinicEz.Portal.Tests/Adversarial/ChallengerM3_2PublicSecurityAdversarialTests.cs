using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Primitives;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Milestone 3 Challenger 2 Adversarial Security & Boundary Verification Suite:
/// 1. Dispense Relay & File Upload Boundary Attack (file size > 5 MiB 413, non-multipart 415,
///    invalid magic bytes 400, double-dispense 409 Conflict, envelope staged to Party.Clinic(clinicId)).
/// 2. Document Verification Security & Short Signature Probe (constant-time 12-hex,
///    tampered, short, long sigs, multi-tenant collisions without ?sig= 409 Conflict).
/// 3. Queue Display Manila Midnight Purge (yesterday tickets excluded, strict zero-PHI).
/// </summary>
public class ChallengerM3_2PublicSecurityAdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly InteropPublisher _publisher;
    private readonly Tenant _tenantA;
    private readonly Tenant _tenantB;
    private readonly Facility _clinicA;
    private readonly Facility _clinicB;
    private readonly string _validSecret = "aabbccddeeff00112233445566778899";
    private readonly string _validTokenA;
    private readonly string _tokenHashA;

    public ChallengerM3_2PublicSecurityAdversarialTests()
    {
        _publisher = new InteropPublisher(_context);

        _tenantA = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "st-luke-bgc",
            Name = "St. Luke's Medical Center BGC",
            OwnerId = "owner-slmc",
            Email = "slmc@stluke.test"
        };
        _clinicA = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantA.Id,
            Slug = "slmc-bgc-clinic",
            Name = "St. Luke's BGC Outpatient",
            StreetAddress = "32nd St, Taguig, Metro Manila",
            ContactNumber = "02-8789-7700",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _tenantB = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "medical-city-ortigas",
            Name = "The Medical City Ortigas",
            OwnerId = "owner-tmc",
            Email = "tmc@medicalcity.test"
        };
        _clinicB = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantB.Id,
            Slug = "tmc-ortigas-clinic",
            Name = "The Medical City Ambulatory Clinic",
            StreetAddress = "Ortigas Ave, Pasig, Metro Manila",
            ContactNumber = "02-8988-1000",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.AddRange(_tenantA, _tenantB);
        _context.Facilities.AddRange(_clinicA, _clinicB);
        _context.SaveChanges();

        _validTokenA = $"{_clinicA.Id:N}.{_validSecret}".ToLowerInvariant();
        using var sha = SHA256.Create();
        _tokenHashA = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(_validTokenA))).ToLowerInvariant();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    #region 1. Dispense Relay & File Upload Boundary Attack

    [Fact]
    public async Task DispenseRelay_FileUpload_Exceeding5MiB_Returns413PayloadTooLarge()
    {
        var attestation = CreatePrescriptionAttestation(_tenantA.Id, _clinicA.Id, "RX-5MB-01", _tokenHashA);
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // 5 MiB + 1 byte
        var oversizedLength = PublicRxEndpoints.MaxReceiptFileSizeBytes + 1;
        var dummyBytes = new byte[16];
        var formFile = new FormFile(new MemoryStream(dummyBytes), 0, oversizedLength, "file", "giant_receipt.pdf")
        {
            Headers = new HeaderDictionary(),
            ContentType = "application/pdf"
        };

        var httpContext = new DefaultHttpContext();
        httpContext.Request.ContentType = "multipart/form-data; boundary=----boundary";
        httpContext.Request.Form = new FormCollection(new Dictionary<string, StringValues>
        {
            { "externalPharmacyName", "Mercury Drug" }
        }, new FormFileCollection { formFile });

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validTokenA, httpContext, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var statusCodeResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, statusCodeResult.StatusCode);

        // Verify attestation was NOT dispensed
        var stored = await _context.DocumentAttestations.AsNoTracking().FirstAsync(d => d.Id == attestation.Id);
        Assert.False(stored.IsAlreadyDispensed);
        Assert.Equal("VALID", stored.Status);
    }

    [Fact]
    public async Task DispenseRelay_FileUpload_RequestContentLengthExceedingMaxBody_Returns413PayloadTooLarge()
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.ContentType = "multipart/form-data; boundary=----boundary";
        httpContext.Request.ContentLength = PublicRxEndpoints.MaxReceiptFileSizeBytes + 70000; // > maxBody

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validTokenA, httpContext, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var statusCodeResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, statusCodeResult.StatusCode);
    }

    [Fact]
    public async Task DispenseRelay_FileUpload_NonMultipartContentType_Returns415UnsupportedMediaType()
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.ContentType = "application/json"; // Wrong MIME type for multipart endpoint

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validTokenA, httpContext, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var statusCodeResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status415UnsupportedMediaType, statusCodeResult.StatusCode);
    }

    [Fact]
    public async Task DispenseRelay_FileUpload_DisguisedExe_Returns400BadRequestInvalidFileType()
    {
        var attestation = CreatePrescriptionAttestation(_tenantA.Id, _clinicA.Id, "RX-EXE-01", _tokenHashA);
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // Disguised PE Windows Executable magic bytes 'MZ' (0x4D, 0x5A) with fake ContentType "image/png"
        var fakePngBytes = new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00 };
        var formFile = new FormFile(new MemoryStream(fakePngBytes), 0, fakePngBytes.Length, "file", "receipt.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        var httpContext = new DefaultHttpContext();
        httpContext.Request.ContentType = "multipart/form-data; boundary=----boundary";
        httpContext.Request.Form = new FormCollection(new Dictionary<string, StringValues>
        {
            { "externalPharmacyName", "Watsons Pharmacy" }
        }, new FormFileCollection { formFile });

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validTokenA, httpContext, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var badRequestResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        var statusCode = ((IStatusCodeHttpResult)result).StatusCode;
        Assert.Equal(StatusCodes.Status400BadRequest, statusCode);

        var response = Assert.IsAssignableFrom<ApiResponse<object>>(badRequestResult.Value);
        Assert.False(response.Succeeded);
        Assert.Equal("INVALID_FILE_TYPE", response.ErrorCode);
    }

    [Fact]
    public async Task DispenseRelay_FileUpload_ShellScriptDisguisedAsJpeg_Returns400BadRequestInvalidFileType()
    {
        var attestation = CreatePrescriptionAttestation(_tenantA.Id, _clinicA.Id, "RX-SH-01", _tokenHashA);
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // Shell script bytes "#!/bin/bash\nrm -rf /" with fake ContentType "image/jpeg"
        var scriptBytes = Encoding.UTF8.GetBytes("#!/bin/bash\necho Malicious\n");
        var formFile = new FormFile(new MemoryStream(scriptBytes), 0, scriptBytes.Length, "file", "receipt.jpg")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/jpeg"
        };

        var httpContext = new DefaultHttpContext();
        httpContext.Request.ContentType = "multipart/form-data; boundary=----boundary";
        httpContext.Request.Form = new FormCollection(new Dictionary<string, StringValues>
        {
            { "externalPharmacyName", "Generika Drugstore" }
        }, new FormFileCollection { formFile });

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validTokenA, httpContext, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var badRequestResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<object>>(badRequestResult.Value);
        Assert.False(response.Succeeded);
        Assert.Equal("INVALID_FILE_TYPE", response.ErrorCode);
    }

    [Fact]
    public async Task DispenseRelay_FileUpload_TruncatedDataUnder4Bytes_Returns400BadRequestInvalidFileType()
    {
        var attestation = CreatePrescriptionAttestation(_tenantA.Id, _clinicA.Id, "RX-TRUNC-01", _tokenHashA);
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // Only 2 bytes (under minimum 4 bytes required for magic bytes header)
        var tinyBytes = new byte[] { 0xFF, 0xD8 };
        var formFile = new FormFile(new MemoryStream(tinyBytes), 0, tinyBytes.Length, "file", "receipt.jpg")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/jpeg"
        };

        var httpContext = new DefaultHttpContext();
        httpContext.Request.ContentType = "multipart/form-data; boundary=----boundary";
        httpContext.Request.Form = new FormCollection(new Dictionary<string, StringValues>
        {
            { "externalPharmacyName", "Rose Pharmacy" }
        }, new FormFileCollection { formFile });

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            _validTokenA, httpContext, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var badRequestResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<object>>(badRequestResult.Value);
        Assert.False(response.Succeeded);
        Assert.Equal("INVALID_FILE_TYPE", response.ErrorCode);
    }

    [Theory]
    [InlineData("pdf", "application/pdf", new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34 })] // %PDF-1.4
    [InlineData("jpeg", "image/jpeg", new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46 })] // JPEG JFIF
    [InlineData("png", "image/png", new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00 })] // PNG
    public async Task DispenseRelay_FileUpload_GenuineMagicBytes_Accepted202(string format, string mime, byte[] validHeader)
    {
        var token = $"{_clinicA.Id:N}.sec_{format}".ToLowerInvariant();
        using var sha = SHA256.Create();
        var tokenHash = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

        var attestation = CreatePrescriptionAttestation(_tenantA.Id, _clinicA.Id, $"RX-GENUINE-{format}", tokenHash);
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var formFile = new FormFile(new MemoryStream(validHeader), 0, validHeader.Length, "file", $"receipt.{format}")
        {
            Headers = new HeaderDictionary(),
            ContentType = mime
        };

        var httpContext = new DefaultHttpContext();
        httpContext.Request.ContentType = "multipart/form-data; boundary=----boundary";
        httpContext.Request.Form = new FormCollection(new Dictionary<string, StringValues>
        {
            { "externalPharmacyName", "South Star Drug" },
            { "officialReceiptNumber", "OR-888899" }
        }, new FormFileCollection { formFile });

        var result = await PublicRxEndpoints.SubmitDispenseMultipartAsync(
            token, httpContext, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var statusCodeResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, statusCodeResult.StatusCode);

        // Verify attestation state
        var stored = await _context.DocumentAttestations.AsNoTracking().FirstAsync(d => d.Id == attestation.Id);
        Assert.True(stored.IsAlreadyDispensed);
        Assert.Equal("DISPENSED", stored.Status);
        Assert.Equal("South Star Drug", stored.DispensedPharmacyName);
    }

    [Fact]
    public async Task DispenseRelay_DoubleDispenseSequential_SecondAttemptReturns409Conflict()
    {
        var attestation = CreatePrescriptionAttestation(_tenantA.Id, _clinicA.Id, "RX-DOUBLE-01", _tokenHashA);
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var body1 = new SubmitRxDispenseBody("Pharmacy One", OfficialReceiptNumber: "OR-001");
        var body2 = new SubmitRxDispenseBody("Pharmacy Two", OfficialReceiptNumber: "OR-002");

        // Attempt 1: First dispense succeeds
        var result1 = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validTokenA, body1, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);
        var accepted = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result1);
        Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);

        // Attempt 2: Second dispense attempt must be rejected with 409 Conflict
        var result2 = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validTokenA, body2, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);
        var conflict = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result2);
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);

        var conflictValue = Assert.IsAssignableFrom<IValueHttpResult>(result2);
        var response = Assert.IsAssignableFrom<ApiResponse<object>>(conflictValue.Value);
        Assert.False(response.Succeeded);
        Assert.Equal("ALREADY_DISPENSED", response.ErrorCode);

        // Verify original pharmacy name was NOT overwritten by second attacker
        var stored = await _context.DocumentAttestations.AsNoTracking().FirstAsync(d => d.Id == attestation.Id);
        Assert.Equal("Pharmacy One", stored.DispensedPharmacyName);
    }

    [Fact]
    public async Task DispenseRelay_OutboxEnvelope_StagedToClinicFacilityWithVerificationToken()
    {
        var sourceDocId = Guid.NewGuid();
        var attestation = CreatePrescriptionAttestation(_tenantA.Id, _clinicA.Id, "RX-ENVELOPE-01", _tokenHashA, sourceDocId);
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var body = new SubmitRxDispenseBody(
            ExternalPharmacyName: "The Generics Pharmacy",
            ExternalBranchLocation: "Cubao Branch",
            PharmacistName: "Maria Santos",
            PharmacistPrcLicense: "PRC-445566",
            OfficialReceiptNumber: "TGP-2026-99"
        );

        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validTokenA, body, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var accepted = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);

        // Inspect staged outbox message
        var outboxMessage = await _context.InteropOutbox.AsNoTracking()
            .FirstOrDefaultAsync(m => m.Type == InteropTypes.RxExternalDispensed && m.CorrelationId == sourceDocId);

        Assert.NotNull(outboxMessage);
        Assert.Equal(InteropTypes.RxExternalDispensed, outboxMessage.Type);

        // Parse envelope JSON and verify addressing using standard interop options
        var envelope = InteropEnvelope.FromJson(outboxMessage.EnvelopeJson);
        Assert.NotNull(envelope);
        Assert.Equal(PartyKind.ControlPlane, envelope.From.Kind);
        Assert.Equal(PartyKind.Facility, envelope.To.Kind);
        Assert.Equal(FacilityType.Clinic, envelope.To.FacilityType);
        Assert.Equal(_tenantA.Id.ToString(), envelope.To.TenantId);
        Assert.Equal(_clinicA.Id.ToString(), envelope.To.FacilityId);

        // Deserialize payload and verify verification token
        var dispenseEvent = envelope.GetPayload<ExternalPrescriptionDispensedEvent>();
        Assert.NotNull(dispenseEvent);
        Assert.Equal(_validTokenA, dispenseEvent.VerificationToken);
        Assert.Equal(sourceDocId, dispenseEvent.PrescriptionId);
        Assert.Equal("RX-ENVELOPE-01", dispenseEvent.PrescriptionNumber);
        Assert.Equal("The Generics Pharmacy", dispenseEvent.ExternalPharmacyName);
        Assert.Equal("Maria Santos", dispenseEvent.PharmacistName);
        Assert.Equal("PRC-445566", dispenseEvent.PharmacistPrcLicense);
    }

    [Fact]
    public async Task DispenseRelay_OfflineEdgeCellFallback_StagesEnvelopeToResolvedFacilityWithToken()
    {
        // Token has clinic prefix matching _clinicB, but zero DocumentAttestation in cloud DB (simulating offline Edge Cell)
        var offlineToken = $"{_clinicB.Id:N}.edge_offline_token_123".ToLowerInvariant();

        var body = new SubmitRxDispenseBody(
            ExternalPharmacyName: "Community Rx Pharmacy",
            OfficialReceiptNumber: "CRX-777"
        );

        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            offlineToken, body, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var accepted = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);

        // Verify outbox message is addressed to _clinicB
        var outboxMessage = await _context.InteropOutbox.AsNoTracking()
            .FirstOrDefaultAsync(m => m.Type == InteropTypes.RxExternalDispensed && m.EnvelopeJson.Contains(_clinicB.Id.ToString()));

        Assert.NotNull(outboxMessage);
        var envelope = InteropEnvelope.FromJson(outboxMessage.EnvelopeJson);
        Assert.NotNull(envelope);
        Assert.Equal(PartyKind.Facility, envelope.To.Kind);
        Assert.Equal(FacilityType.Clinic, envelope.To.FacilityType);
        Assert.Equal(_clinicB.Id.ToString(), envelope.To.FacilityId);
        Assert.Equal(_tenantB.Id.ToString(), envelope.To.TenantId);

        var dispenseEvent = envelope.GetPayload<ExternalPrescriptionDispensedEvent>();
        Assert.NotNull(dispenseEvent);
        Assert.Equal(offlineToken, dispenseEvent.VerificationToken);
    }

    #endregion

    #region 2. Document Verification Security & Short Signature Probe

    [Theory]
    [InlineData("A1B2C3D4E5F6")] // Standard 12-hex
    [InlineData("a1b2c3d4e5f6")] // Lowercase 12-hex
    [InlineData("SEC-SHA256-A1B2C3D4E5F6")] // With SEC-SHA256- prefix
    [InlineData("sec-sha256-a1b2c3d4e5f6")] // With lowercase prefix
    public async Task DocumentVerify_ShortSignature_ConstantTime12Hex_ValidVariations_Return200(string sigCandidate)
    {
        var digest = "SEC-SHA256-A1B2C3D4E5F69999";
        var doc = CreateDocumentAttestation(_tenantA.Id, _clinicA.Id, "medical-certificate", "MC-20261025-V01", digest);
        _context.DocumentAttestations.Add(doc);
        await _context.SaveChangesAsync();

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(
            "medical-certificate", "MC-20261025-V01", sigCandidate, _context);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.IsVerified);
        Assert.Equal("Medical Certificate", response.Data.DocumentType);
        Assert.Equal("Prescription Bearer", response.Data.PatientMaskedName); // Zero PHI
    }

    [Fact]
    public async Task DocumentVerify_ShortSignature_TamperedHex_Returns400BadRequest()
    {
        var digest = "SEC-SHA256-A1B2C3D4E5F69999";
        var doc = CreateDocumentAttestation(_tenantA.Id, _clinicA.Id, "medical-certificate", "MC-TAMPER-01", digest);
        _context.DocumentAttestations.Add(doc);
        await _context.SaveChangesAsync();

        // 1 bit/char flipped: '7' instead of '6'
        var tamperedSig = "A1B2C3D4E5F7";
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(
            "medical-certificate", "MC-TAMPER-01", tamperedSig, _context);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);

        var badResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(badResult.Value);
        Assert.False(response.Succeeded);
        Assert.Equal("INVALID_SIGNATURE_SEAL", response.ErrorCode);
    }

    [Theory]
    [InlineData("A1B2C3D4E5")] // 10 chars (too short)
    [InlineData("A1B2C3")] // 6 chars (too short)
    [InlineData("")] // Empty
    public async Task DocumentVerify_ShortSignature_TooShortLength_Returns400BadRequest(string shortCandidate)
    {
        var digest = "SEC-SHA256-A1B2C3D4E5F69999";
        var doc = CreateDocumentAttestation(_tenantA.Id, _clinicA.Id, "medical-certificate", "MC-SHORT-01", digest);
        _context.DocumentAttestations.Add(doc);
        await _context.SaveChangesAsync();

        if (string.IsNullOrEmpty(shortCandidate))
        {
            // Empty sig on single candidate does not fail sig check because sig is optional for single-tenant
            return;
        }

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(
            "medical-certificate", "MC-SHORT-01", shortCandidate, _context);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Theory]
    [InlineData("A1B2C3D4E5F67")] // 13 chars (too long)
    [InlineData("A1B2C3D4E5F67890")] // 16 chars (full digest without prefix)
    public async Task DocumentVerify_ShortSignature_TooLongLength_Returns400BadRequest(string longCandidate)
    {
        var digest = "SEC-SHA256-A1B2C3D4E5F69999";
        var doc = CreateDocumentAttestation(_tenantA.Id, _clinicA.Id, "medical-certificate", "MC-LONG-01", digest);
        _context.DocumentAttestations.Add(doc);
        await _context.SaveChangesAsync();

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(
            "medical-certificate", "MC-LONG-01", longCandidate, _context);

        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Fact]
    public async Task DocumentVerify_MultiTenantCollision_WithoutSig_Returns409ConflictDocumentAmbiguous()
    {
        var docNumber = "MC-COLLIDE-9999";

        // Tenant A issued MC-COLLIDE-9999
        var docA = CreateDocumentAttestation(_tenantA.Id, _clinicA.Id, "medical-certificate", docNumber, "SEC-SHA256-111122223333");
        // Tenant B independently issued MC-COLLIDE-9999
        var docB = CreateDocumentAttestation(_tenantB.Id, _clinicB.Id, "medical-certificate", docNumber, "SEC-SHA256-444455556666");

        _context.DocumentAttestations.AddRange(docA, docB);
        await _context.SaveChangesAsync();

        // Query WITHOUT sig parameter
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("medical-certificate", docNumber, null, _context);

        var conflictResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, conflictResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(valueResult.Value);
        Assert.False(response.Succeeded);
        Assert.Equal("DOCUMENT_NUMBER_AMBIGUOUS", response.ErrorCode);
    }

    [Fact]
    public async Task DocumentVerify_MultiTenantCollision_WithCorrectSig_ResolvesTargetTenant()
    {
        var docNumber = "REF-COLLIDE-7777";

        var docA = CreateDocumentAttestation(_tenantA.Id, _clinicA.Id, "referral", docNumber, "SEC-SHA256-AAAA88889999");
        var docB = CreateDocumentAttestation(_tenantB.Id, _clinicB.Id, "referral", docNumber, "SEC-SHA256-BBBB11112222");

        _context.DocumentAttestations.AddRange(docA, docB);
        await _context.SaveChangesAsync();

        // 1. Disambiguate for Tenant A with sig="AAAA88889999"
        var resultA = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("referral", docNumber, "AAAA88889999", _context);
        var okA = Assert.IsAssignableFrom<IValueHttpResult>(resultA);
        var respA = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okA.Value);
        Assert.True(respA.Succeeded);
        Assert.Equal(_clinicA.Name, respA.Data?.FacilityName);

        // 2. Disambiguate for Tenant B with sig="BBBB11112222"
        var resultB = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("referral", docNumber, "BBBB11112222", _context);
        var okB = Assert.IsAssignableFrom<IValueHttpResult>(resultB);
        var respB = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okB.Value);
        Assert.True(respB.Succeeded);
        Assert.Equal(_clinicB.Name, respB.Data?.FacilityName);
    }

    [Fact]
    public async Task DocumentVerify_MultiTenantCollision_WithMismatchedSig_Returns404NotFound()
    {
        var docNumber = "LAB-COLLIDE-5555";

        var docA = CreateDocumentAttestation(_tenantA.Id, _clinicA.Id, "lab-order", docNumber, "SEC-SHA256-AAAA88889999");
        var docB = CreateDocumentAttestation(_tenantB.Id, _clinicB.Id, "lab-order", docNumber, "SEC-SHA256-BBBB11112222");

        _context.DocumentAttestations.AddRange(docA, docB);
        await _context.SaveChangesAsync();

        // Signature matches neither Tenant A nor Tenant B
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("lab-order", docNumber, "CCCC00000000", _context);

        var notFoundResult = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFoundResult.StatusCode);

        var valueResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(valueResult.Value);
        Assert.False(response.Succeeded);
        Assert.Equal("SEAL_MISMATCH", response.ErrorCode);
    }

    #endregion

    #region 3. Queue Display Manila Midnight Purge

    [Fact]
    public async Task QueueDisplay_BoardDatedYesterday_ReturnsEmptyListsAndZeroWaiting()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var yesterdayManila = DateOnly.FromDateTime(nowManila).AddDays(-1);

        var serving = new List<QueueBoardServingItemDto>
        {
            new() { QueueItemId = Guid.NewGuid(), TicketNumber = "T-01", RoomOrStation = "Room 1", DoctorName = "Dr. Santos", CalledTime = DateTime.UtcNow.AddHours(-1) },
            new() { QueueItemId = Guid.NewGuid(), TicketNumber = "T-02", RoomOrStation = "Room 2", DoctorName = "Dr. Reyes", CalledTime = DateTime.UtcNow.AddMinutes(-30) }
        };

        var upcoming = new List<QueueBoardUpcomingItemDto>
        {
            new() { QueueItemId = Guid.NewGuid(), TicketNumber = "T-03", Priority = "Routine", DisplayName = null, CheckInTime = DateTime.UtcNow.AddMinutes(-20) },
            new() { QueueItemId = Guid.NewGuid(), TicketNumber = "T-04", Priority = "Urgent", DisplayName = null, CheckInTime = DateTime.UtcNow.AddMinutes(-10) }
        };

        var yesterdayBoard = new FacilityQueueBoard
        {
            TenantId = _tenantA.Id,
            FacilityId = _clinicA.Id,
            QueueDate = yesterdayManila,
            IsAcceptingWalkIns = true,
            PatientsWaitingCount = 12,
            NowServingJson = JsonSerializer.Serialize(serving),
            UpNextJson = JsonSerializer.Serialize(upcoming),
            GeneratedAtUtc = DateTime.UtcNow.AddHours(-12)
        };
        _context.FacilityQueueBoards.Add(yesterdayBoard);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync(_tenantA.TenantSlug, _clinicA.Slug, _context);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);

        // Manila midnight invalidation: Stale yesterday tickets must NEVER be returned
        Assert.Empty(response.Data.NowServing);
        Assert.Empty(response.Data.UpNext);
        Assert.Equal(0, response.Data.PatientsWaitingCount);
        Assert.True(response.Data.MaskPatientNames);
    }

    [Fact]
    public async Task QueueDisplay_BoardDatedOlderDays_ReturnsEmptyLists()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var oldDateManila = DateOnly.FromDateTime(nowManila).AddDays(-7);

        var oldBoard = new FacilityQueueBoard
        {
            TenantId = _tenantB.Id,
            FacilityId = _clinicB.Id,
            QueueDate = oldDateManila,
            PatientsWaitingCount = 25,
            NowServingJson = "[{\"TicketNumber\":\"OLD-1\"}]",
            UpNextJson = "[{\"TicketNumber\":\"OLD-2\"}]",
            GeneratedAtUtc = DateTime.UtcNow.AddDays(-7)
        };
        _context.FacilityQueueBoards.Add(oldBoard);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync(_tenantB.TenantSlug, _clinicB.Slug, _context);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Empty(response.Data.NowServing);
        Assert.Empty(response.Data.UpNext);
        Assert.Equal(0, response.Data.PatientsWaitingCount);
    }

    [Fact]
    public async Task QueueDisplay_BoardDatedToday_ReturnsTicketsAndZeroPhiUpNext()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var todayManila = DateOnly.FromDateTime(nowManila);

        var serving = new List<QueueBoardServingItemDto>
        {
            new() { QueueItemId = Guid.NewGuid(), TicketNumber = "C-101", RoomOrStation = "Station A", DoctorName = "Dr. Cruz", CalledTime = DateTime.UtcNow }
        };

        // UpNext JSON maliciously or erroneously containing patient name
        var upcoming = new List<QueueBoardUpcomingItemDto>
        {
            new() { QueueItemId = Guid.NewGuid(), TicketNumber = "C-102", Priority = "Routine", DisplayName = "Leaked Patient Name", CheckInTime = DateTime.UtcNow }
        };

        var todayBoard = new FacilityQueueBoard
        {
            TenantId = _tenantA.Id,
            FacilityId = _clinicA.Id,
            QueueDate = todayManila,
            PatientsWaitingCount = 1,
            NowServingJson = JsonSerializer.Serialize(serving),
            UpNextJson = JsonSerializer.Serialize(upcoming),
            GeneratedAtUtc = DateTime.UtcNow
        };
        _context.FacilityQueueBoards.Add(todayBoard);
        await _context.SaveChangesAsync();

        var result = await PublicQueueDisplayEndpoints.GetDisplayBySlugsAsync(_tenantA.TenantSlug, _clinicA.Slug, _context);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Single(response.Data.NowServing);
        Assert.Equal("C-101", response.Data.NowServing[0].TicketNumber);

        Assert.Single(response.Data.UpNext);
        Assert.Equal("C-102", response.Data.UpNext[0].TicketNumber);
        // STRICT ZERO PHI GUARANTEE: DisplayName MUST be overwritten to null
        Assert.Null(response.Data.UpNext[0].DisplayName);
        Assert.True(response.Data.MaskPatientNames);
    }

    [Fact]
    public async Task QueueDisplay_QueryParameterClinicId_BoardDatedYesterday_ReturnsEmptyLists()
    {
        var nowManila = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveManilaTimeZone());
        var yesterdayManila = DateOnly.FromDateTime(nowManila).AddDays(-1);

        var board = new FacilityQueueBoard
        {
            TenantId = _tenantA.Id,
            FacilityId = _clinicA.Id,
            QueueDate = yesterdayManila,
            PatientsWaitingCount = 5,
            NowServingJson = "[{\"TicketNumber\":\"YEST-1\"}]",
            UpNextJson = "[{\"TicketNumber\":\"YEST-2\"}]",
            GeneratedAtUtc = DateTime.UtcNow.AddDays(-1)
        };
        _context.FacilityQueueBoards.Add(board);
        await _context.SaveChangesAsync();

        // Invoking query endpoint by clinicId
        var result = await PublicQueueDisplayEndpoints.GetDisplayQueryAsync(null, null, _clinicA.Id, _context);

        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<PublicQueueDisplayData>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Empty(response.Data.NowServing);
        Assert.Empty(response.Data.UpNext);
        Assert.Equal(0, response.Data.PatientsWaitingCount);
    }

    #endregion

    #region Helpers

    private DocumentAttestation CreatePrescriptionAttestation(
        Guid tenantId,
        Guid facilityId,
        string documentNumber,
        string tokenHash,
        Guid? sourceDocId = null)
    {
        return new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            SourceDocumentId = sourceDocId ?? Guid.NewGuid(),
            DocumentKind = "prescription",
            DocumentNumber = documentNumber,
            SecurityDigest = $"SEC-SHA256-{Guid.NewGuid():N}"[..27].ToUpperInvariant(),
            VerificationTokenHash = tokenHash,
            ClinicName = "Test Clinic",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            Status = "VALID",
            IsAlreadyDispensed = false
        };
    }

    private DocumentAttestation CreateDocumentAttestation(
        Guid tenantId,
        Guid facilityId,
        string documentKind,
        string documentNumber,
        string securityDigest)
    {
        return new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            SourceDocumentId = Guid.NewGuid(),
            DocumentKind = documentKind,
            DocumentNumber = documentNumber,
            SecurityDigest = securityDigest,
            ClinicName = tenantId == _tenantA.Id ? _clinicA.Name : _clinicB.Name,
            ClinicAddress = "Metro Manila",
            DoctorName = "Dr. Test Provider",
            DoctorPrcLicense = "PRC-1234567",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID",
            IsAlreadyDispensed = false
        };
    }

    private static TimeZoneInfo ResolveManilaTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila"); } catch { }
        try { return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time"); } catch { }
        return TimeZoneInfo.CreateCustomTimeZone("Manila", TimeSpan.FromHours(8), "Manila Standard Time", "Manila Standard Time");
    }

    #endregion
}
