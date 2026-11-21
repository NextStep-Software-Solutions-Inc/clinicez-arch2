using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Messaging;

public class DocumentAttestationPublishedHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _tenant;
    private readonly Facility _facility;

    public DocumentAttestationPublishedHandlerTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "st-luke",
            Name = "St. Luke Clinic",
            OwnerId = "owner-1",
            Email = "admin@stluke.ph"
        };

        _facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Slug = "main-clinic",
            Name = "St. Luke Main Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_facility);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Task HandleAsync(DocumentAttestationPublishedPayload payload, Party from)
    {
        var handler = new DocumentAttestationPublishedHandler(_context, NullLogger<DocumentAttestationPublishedHandler>.Instance);
        var envelope = InteropEnvelope.Create(InteropTypes.DocumentAttestationPublished, from, Party.Portal, Guid.NewGuid(), payload);
        return handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);
    }

    [Fact]
    public async Task HandleAsync_NewAttestation_InsertsRecord()
    {
        var docId = Guid.NewGuid();
        var payload = new DocumentAttestationPublishedPayload
        {
            SourceDocumentId = docId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-20261025-0042",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F1011",
            VerificationTokenHash = "abc123hash",
            ClinicName = "St. Luke Main Clinic",
            ClinicAddress = "E. Rodriguez Ave, QC",
            DoctorName = "Dr. Maria Santos",
            DoctorPrcLicense = "PRC-0098765",
            DoctorPtr = "PTR-1234567",
            DoctorS2License = "S2-887766",
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            Status = "VALID",
            IsAlreadyDispensed = false,
            ItemCount = 3,
            HasDangerousDrug = false
        };

        var from = Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic);
        await HandleAsync(payload, from);

        var stored = await _context.DocumentAttestations.AsNoTracking().FirstOrDefaultAsync(d => d.SourceDocumentId == docId);
        Assert.NotNull(stored);
        Assert.Equal("prescription", stored.DocumentKind);
        Assert.Equal("RX-20261025-0042", stored.DocumentNumber);
        Assert.Equal("SEC-SHA256-4A5B6C7D8E9F1011", stored.SecurityDigest);
        Assert.Equal("abc123hash", stored.VerificationTokenHash);
        Assert.Equal("Dr. Maria Santos", stored.DoctorName);
        Assert.Equal("PRC-0098765", stored.DoctorPrcLicense);
        Assert.Equal(3, stored.ItemCount);
        Assert.False(stored.IsAlreadyDispensed);
    }

    [Fact]
    public async Task HandleAsync_ExistingAttestation_IdempotentlyUpdates()
    {
        var docId = Guid.NewGuid();
        var from = Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic);

        var initialPayload = new DocumentAttestationPublishedPayload
        {
            SourceDocumentId = docId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-20261025-0042",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F1011",
            VerificationTokenHash = "abc123hash",
            ClinicName = "St. Luke Main Clinic",
            Status = "VALID",
            IsAlreadyDispensed = false,
            ItemCount = 2
        };
        await HandleAsync(initialPayload, from);

        var updatePayload = new DocumentAttestationPublishedPayload
        {
            SourceDocumentId = docId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            DocumentKind = "prescription",
            DocumentNumber = "RX-20261025-0042",
            SecurityDigest = "SEC-SHA256-4A5B6C7D8E9F1011",
            VerificationTokenHash = "abc123hash",
            ClinicName = "St. Luke Main Clinic",
            Status = "DISPENSED",
            IsAlreadyDispensed = true,
            DispenseStatus = "DispensedExternally",
            DispensedPharmacyName = "Mercury Drug - Aurora Blvd",
            DispensedAtUtc = DateTime.UtcNow,
            ItemCount = 2
        };
        await HandleAsync(updatePayload, from);

        var records = await _context.DocumentAttestations.AsNoTracking().Where(d => d.SourceDocumentId == docId).ToListAsync();
        Assert.Single(records);
        Assert.True(records[0].IsAlreadyDispensed);
        Assert.Equal("DISPENSED", records[0].Status);
        Assert.Equal("DispensedExternally", records[0].DispenseStatus);
        Assert.Equal("Mercury Drug - Aurora Blvd", records[0].DispensedPharmacyName);
    }

    [Fact]
    public async Task HandleAsync_MismatchedSender_DropsMessage()
    {
        var docId = Guid.NewGuid();
        var rogueFacilityId = Guid.NewGuid();
        var payload = new DocumentAttestationPublishedPayload
        {
            SourceDocumentId = docId,
            TenantId = _tenant.Id.ToString(),
            FacilityId = _facility.Id,
            DocumentKind = "medical-certificate",
            DocumentNumber = "MC-20261025-0001",
            SecurityDigest = "SEC-SHA256-1122334455667788",
            ClinicName = "St. Luke"
        };

        var from = Party.ForFacility(_tenant.Id.ToString(), rogueFacilityId.ToString(), FacilityType.Clinic);
        await HandleAsync(payload, from);

        var stored = await _context.DocumentAttestations.AsNoTracking().FirstOrDefaultAsync(d => d.SourceDocumentId == docId);
        Assert.Null(stored);
    }
}
