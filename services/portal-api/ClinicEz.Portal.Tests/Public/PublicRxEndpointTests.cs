using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Public;

public class PublicRxEndpointTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly InteropPublisher _publisher;
    private readonly Tenant _tenant;
    private readonly Facility _clinic;
    private readonly string _validSecret = "112233445566778899aabbccddeeff00";
    private readonly string _validToken;
    private readonly string _tokenHash;

    public PublicRxEndpointTests()
    {
        _publisher = new InteropPublisher(_context);

        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "medical-center",
            Name = "Medical Center",
            OwnerId = "owner-rx",
            Email = "rx@medcenter.ph"
        };

        _clinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "rx-clinic",
            Name = "Medical Center Rx Clinic",
            StreetAddress = "789 Healthway",
            ContactNumber = "0917-123-4567",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_clinic);
        _context.SaveChanges();

        _validToken = $"{_clinic.Id:N}.{_validSecret}".ToLowerInvariant();
        using var sha = SHA256.Create();
        _tokenHash = Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(_validToken))).ToLowerInvariant();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetRxAttestationInfo_ValidToken_Returns200WithZeroPhi()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-20261025-0001",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            ClinicAddress = _clinic.StreetAddress,
            DoctorName = "Dr. Clara Reyes",
            DoctorPrcLicense = "PRC-1122334",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            Status = "VALID",
            IsAlreadyDispensed = false,
            ItemCount = 2
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(_validToken, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<RxAttestationInfo>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Equal("RX-20261025-0001", response.Data.PrescriptionNumber);
        Assert.Equal("Dr. Clara Reyes", response.Data.DoctorName);
        Assert.Equal("Synced", response.Data.SyncStatus);
        Assert.False(response.Data.IsOfflinePending);
        Assert.Equal("ACTIVE", response.Data.Status);
    }

    [Fact]
    public async Task GetRxAttestationInfo_OfflineEdgeCellFallback_Returns200PendingClinicSync()
    {
        // Token has valid clinic prefix in DB, but no DocumentAttestation exists yet
        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(_validToken, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<RxAttestationInfo>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.Equal("PendingClinicSync", response.Data.SyncStatus);
        Assert.True(response.Data.IsOfflinePending);
        Assert.Equal(_clinic.Name, response.Data.ClinicName);
        Assert.Equal("ACTIVE", response.Data.Status);
        Assert.True(response.Data.IsValid);
    }

    [Fact]
    public async Task GetRxAttestationInfo_UnknownTokenAndClinic_Returns404()
    {
        var randomToken = $"{Guid.NewGuid():N}.00112233445566778899aabbccddeeff";
        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(randomToken, _context);
        var notFound = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status404NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task GetRxAttestationInfo_AlreadyDispensed_ReturnsDispensedStatus()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-DISP-01",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            Status = "DISPENSED",
            IsAlreadyDispensed = true,
            DispenseStatus = "DispensedExternally",
            DispensedPharmacyName = "Mercury Drug"
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var result = await PublicRxEndpoints.GetRxAttestationInfoAsync(_validToken, _context);
        var okResult = Assert.IsAssignableFrom<IValueHttpResult>(result);
        var response = Assert.IsAssignableFrom<ApiResponse<RxAttestationInfo>>(okResult.Value);

        Assert.True(response.Succeeded);
        Assert.NotNull(response.Data);
        Assert.True(response.Data.IsAlreadyDispensed);
        Assert.Equal("DISPENSED", response.Data.Status);
        Assert.Equal("DispensedExternally", response.Data.DispenseStatus);
        Assert.Equal("Mercury Drug", response.Data.DispensedPharmacyName);
    }

    [Fact]
    public async Task SubmitDispense_ValidJsonRequest_EnqueuesRelayAndReturns202Accepted()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            SourceDocumentId = Guid.NewGuid(),
            DocumentKind = "prescription",
            DocumentNumber = "RX-RELAY-01",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            Status = "VALID",
            IsAlreadyDispensed = false
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var body = new SubmitRxDispenseBody(
            ExternalPharmacyName: "Watsons SM North",
            PharmacistName: "Juan Dela Cruz",
            PharmacistPrcLicense: "PRC-998877",
            OfficialReceiptNumber: "OR-123456"
        );

        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validToken, body, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var accepted = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);

        // Verify optimistic lock
        var stored = await _context.DocumentAttestations.AsNoTracking().FirstOrDefaultAsync(d => d.Id == attestation.Id);
        Assert.NotNull(stored);
        Assert.True(stored.IsAlreadyDispensed);
        Assert.Equal("DISPENSED", stored.Status);
        Assert.Equal("Watsons SM North", stored.DispensedPharmacyName);

        // Verify outbox message
        var outbox = await _context.InteropOutbox.AsNoTracking().ToListAsync();
        Assert.Contains(outbox, m => m.Type == InteropTypes.RxExternalDispensed);
    }

    [Fact]
    public async Task SubmitDispense_AlreadyDispensed_Returns409Conflict()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            SourceDocumentId = Guid.NewGuid(),
            DocumentKind = "prescription",
            DocumentNumber = "RX-LOCK-01",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            Status = "DISPENSED",
            IsAlreadyDispensed = true
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var body = new SubmitRxDispenseBody(ExternalPharmacyName: "Rose Pharmacy");
        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validToken, body, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var conflict = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
    }

    [Fact]
    public async Task SubmitDispense_ExpiredPrescription_Returns410Gone()
    {
        var attestation = new DocumentAttestation
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            FacilityId = _clinic.Id,
            SourceDocumentId = Guid.NewGuid(),
            DocumentKind = "prescription",
            DocumentNumber = "RX-EXP-01",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F",
            VerificationTokenHash = _tokenHash,
            ClinicName = _clinic.Name,
            IssuedAtUtc = DateTime.UtcNow.AddDays(-10),
            ExpiresAtUtc = DateTime.UtcNow.AddDays(-3),
            Status = "VALID",
            IsAlreadyDispensed = false
        };
        _context.DocumentAttestations.Add(attestation);
        await _context.SaveChangesAsync();

        var body = new SubmitRxDispenseBody(ExternalPharmacyName: "Rose Pharmacy");
        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validToken, body, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var gone = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status410Gone, gone.StatusCode);
    }

    [Fact]
    public async Task SubmitDispense_OfflineFallback_EnqueuesRelayAndReturns202Accepted()
    {
        // No DocumentAttestation in db, but token matches active clinic prefix
        var body = new SubmitRxDispenseBody(ExternalPharmacyName: "Generika Pharmacy");
        var result = await PublicRxEndpoints.SubmitDispenseJsonAsync(
            _validToken, body, _context, _publisher, NullLogger<PublicRxEndpoints>.Instance);

        var accepted = Assert.IsAssignableFrom<IStatusCodeHttpResult>(result);
        Assert.Equal(StatusCodes.Status202Accepted, accepted.StatusCode);

        var outbox = await _context.InteropOutbox.AsNoTracking().ToListAsync();
        Assert.Contains(outbox, m => m.Type == InteropTypes.RxExternalDispensed && m.EnvelopeJson.Contains(_clinic.Id.ToString()));
    }
}
