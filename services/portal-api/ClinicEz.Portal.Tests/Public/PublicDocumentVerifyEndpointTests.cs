using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Public;

public class PublicDocumentVerifyEndpointTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant;
    private readonly Facility _clinic;

    public PublicDocumentVerifyEndpointTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "asian-hospital",
            Name = "Asian Hospital",
            OwnerId = "owner-doc",
            Email = "doc@asian.ph"
        };

        _clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "main-facility",
            Name = "Asian Hospital Main",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_clinic);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task VerifyDocument_FullSecurityDigest_Returns200Verified()
    {
        var digest = "SEC-SHA256-4A5B6C7D8E9F1011";
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "medical-certificate",
            DocumentNumber = "MC-20261025-0010",
            SecurityDigest = digest,
            ClinicName = "Asian Hospital Main",
            DoctorName = "Dr. Roberto Silva",
            DoctorPrcLicense = "PRC-8877665",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(null, digest, null, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.IsVerified);
        Assert.Equal("Medical Certificate", response.Data.DocumentType);
        Assert.Equal("MC-20261025-0010", response.Data.DocumentNumber);
        Assert.Equal("Dr. Roberto Silva", response.Data.DoctorName);
        Assert.Equal("Prescription Bearer", response.Data.PatientMaskedName);
    }

    [Fact]
    public async Task VerifyDocument_DocumentNumberWithValidSignatureSeal_Returns200Verified()
    {
        var digest = "SEC-SHA256-A1B2C3D4E5F67890";
        var shortSig = "A1B2C3D4E5F6";

        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "med-cert",
            DocumentNumber = "MC-20261025-0020",
            SecurityDigest = digest,
            ClinicName = "Asian Hospital",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("med-cert", "MC-20261025-0020", shortSig, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.IsVerified);
        Assert.Equal("MC-20261025-0020", response.Data.DocumentNumber);
    }

    [Fact]
    public async Task VerifyDocument_SignatureSealWithSecSha256Prefix_StripsPrefixAndVerifies()
    {
        var digest = "SEC-SHA256-A1B2C3D4E5F67890";
        var prefixedSig = "SEC-SHA256-A1B2C3D4E5F6";

        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "referral",
            DocumentNumber = "REF-20261025-0001",
            SecurityDigest = digest,
            ClinicName = "Asian Hospital",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("referral", "REF-20261025-0001", prefixedSig, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.IsVerified);
    }

    [Fact]
    public async Task VerifyDocument_MismatchedSignatureSeal_Returns400BadRequest()
    {
        var digest = "SEC-SHA256-A1B2C3D4E5F67890";
        var wrongSig = "FFFFFFFFFFFF";

        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "referral",
            DocumentNumber = "REF-20261025-0002",
            SecurityDigest = digest,
            ClinicName = "Asian Hospital",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("referral", "REF-20261025-0002", wrongSig, _context);
        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Fact]
    public async Task VerifyDocument_MultiTenantDocumentNumberWithoutSeal_Returns409ConflictPromptingSeal()
    {
        var otherTenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "cardinal-santos",
            Name = "Cardinal Santos",
            OwnerId = "owner-cs",
            Email = "cs@cardinal.ph"
        };
        _context.Tenants.Add(otherTenant);

        // Two identical document numbers across different tenants
        var doc1 = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "medical-certificate",
            DocumentNumber = "MC-COLLISION-01",
            SecurityDigest = "SEC-SHA256-AAAA1111BBBB",
            ClinicName = "Asian Hospital"
        };
        var doc2 = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = otherTenant.Id,
            FacilityId = Guid.NewGuid(),
            DocumentKind = "medical-certificate",
            DocumentNumber = "MC-COLLISION-01",
            SecurityDigest = "SEC-SHA256-CCCC2222DDDD",
            ClinicName = "Cardinal Santos"
        };
        _context.DocumentAttestations.AddRange(doc1, doc2);
        await _context.SaveChangesAsync();

        // Calling without sig parameter
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(null, "MC-COLLISION-01", null, _context);
        var conflict = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);

        // Calling with sig matching doc1 resolves cleanly
        var resolvedResult = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(null, "MC-COLLISION-01", "AAAA1111BBBB", _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(resolvedResult);
        var response = Assert.IsAssignableFrom<ApiResponse<DocumentVerificationResult>>(okResult.Value);
        Assert.True(response.Succeeded);
        Assert.Equal("Asian Hospital", response.Data?.FacilityName);
    }

    [Fact]
    public async Task VerifyDocument_UnknownToken_Returns404NotFound()
    {
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync(null, "UNKNOWN-DOC-000", null, _context);
        var notFound = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task VerifyDocument_UnrecognizedKind_Returns400BadRequest()
    {
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("invalid-category", "ANY-TOKEN", null, _context);
        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Fact]
    public async Task VerifyDocument_MismatchedKindByDocumentNumber_Returns400BadRequest()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-20261025-0999",
            SecurityDigest = "SEC-SHA256-RX9999999999",
            ClinicName = "Asian Hospital",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // Querying an Rx document under "med-cert" kind
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("med-cert", "RX-20261025-0999", null, _context);
        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Fact]
    public async Task VerifyDocument_MismatchedKindBySecurityDigest_Returns400BadRequest()
    {
        var digest = "SEC-SHA256-REF111122223";
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "referral",
            DocumentNumber = "REF-20261025-0088",
            SecurityDigest = digest,
            ClinicName = "Asian Hospital",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // Querying a referral digest under "receipt" kind
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("receipt", digest, null, _context);
        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }

    [Fact]
    public async Task VerifyDocument_MismatchedKindByVerificationTokenHash_Returns400BadRequest()
    {
        var rawRxToken = "test-rx-token-secret-12345";
        using var sha256 = SHA256.Create();
        var tokenHash = Convert.ToHexString(sha256.ComputeHash(Encoding.UTF8.GetBytes(rawRxToken.ToLowerInvariant()))).ToLowerInvariant();

        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-20261025-0777",
            SecurityDigest = "SEC-SHA256-RX7777777777",
            VerificationTokenHash = tokenHash,
            ClinicName = "Asian Hospital",
            IssuedAtUtc = DateTime.UtcNow,
            Status = "VALID"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        // Querying an Rx verification token under "med-cert" kind
        var result = await PublicDocumentVerifyEndpoints.VerifyDocumentAsync("med-cert", rawRxToken, null, _context);
        var badRequest = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    }
}
