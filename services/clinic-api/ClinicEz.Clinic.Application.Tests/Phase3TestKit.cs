using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Documents.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace ClinicEz.Clinic.Application.Tests;

/// <summary>Collaborators for the Phase 3 clinical flows (grants, claims, document sync, intake) on an in-memory database.</summary>
internal static class Phase3TestKit
{
    public const string PortalBaseUrl = "https://clinic.example.test";
    public static string UploadBaseUrl => $"{PortalBaseUrl}/upload/lab";
    public const string ClaimToken = "CLAIM-TOKEN-1234567890";

    public static IOptions<ClinicUploadOptions> UploadOptions(Action<ClinicUploadOptions>? configure = null)
    {
        var options = new ClinicUploadOptions { PortalBaseUrl = PortalBaseUrl };
        configure?.Invoke(options);
        return Options.Create(options);
    }

    public static UploadGrantService Grants(ApplicationDbContext db, IOptions<ClinicUploadOptions>? options = null) =>
        new(db, options ?? UploadOptions());

    public static PatientDocumentPublisher Documents(ApplicationDbContext db) =>
        new(MessagingTestKit.Addresses(db), new InteropPublisher(db));

    public static LabResultReviewedPublisher Reviewed(ApplicationDbContext db) =>
        new(MessagingTestKit.Addresses(db), new InteropPublisher(db));

    public static LabResultIntake Intake(ApplicationDbContext db, ILabResultFileStore? files = null, IOptions<ClinicUploadOptions>? options = null) =>
        new(db, files ?? new InMemoryFileStore(), Documents(db), options ?? UploadOptions());

    /// <summary>A hub whose claim endpoint always succeeds; records the envelopes it was asked to wrap.</summary>
    public static IHubClaimsClient Hub(List<ClaimSlipRequest>? requests = null)
    {
        var hub = Substitute.For<IHubClaimsClient>();
        hub.CreateAsync(Arg.Any<ClaimSlipRequest>(), Arg.Any<CancellationToken>()).Returns(call =>
        {
            requests?.Add(call.Arg<ClaimSlipRequest>());
            return Task.FromResult(new ClaimSlipResult(Guid.NewGuid(), ClaimToken, DateTime.UtcNow.AddDays(7)));
        });
        return hub;
    }

    public static ClaimSlipService Claims(IHubClaimsClient? hub = null) => new(hub ?? Hub());

    public static IClinicIdentityProvider Identity(Guid clinicId, string tenantId, string name = "Apex Clinic")
    {
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns(new ClinicIdentity(tenantId, clinicId, name));
        return identity;
    }

    public static IssueMedicalCertificateCommandHandler MedCert(
        IRepository<MedicalCertificate> repo, IUnitOfWork unitOfWork, IClinicContext clinicContext, ApplicationDbContext db,
        IClinicIdentityProvider? identity = null) =>
        new(repo, unitOfWork, clinicContext, identity ?? Substitute.For<IClinicIdentityProvider>(), Documents(db),
            new DocumentSecurityService(), new ConfigurationBuilder().Build());

    /// <summary>Keeps files in memory instead of encrypting them to disk.</summary>
    public sealed class InMemoryFileStore : ILabResultFileStore
    {
        private readonly Dictionary<Guid, byte[]> _files = new();

        public int Count => _files.Count;

        public Task StoreAsync(ClinicLabResult result, byte[] content, CancellationToken ct)
        {
            _files[result.Id] = content;
            result.StorageKey = $"memory/{result.Id:N}";
            result.FileSizeBytes = content.LongLength;
            result.EncryptionIvBase64 = "iv";
            result.EncryptionTagBase64 = "tag";
            result.WrappedKeyJson = "{}";
            result.EncryptedHash = "hash";
            return Task.CompletedTask;
        }

        public Task<byte[]?> ReadAsync(ClinicLabResult result, CancellationToken ct) =>
            Task.FromResult(_files.TryGetValue(result.Id, out var content) ? content : null);
    }

    public static ClinicPatient NewPatient(Guid clinicId, string tenantId, Guid? syncPatientId = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ClinicId = clinicId,
        PatientCode = $"PAT-{Guid.NewGuid().ToString("N")[..6]}",
        FirstName = "Maria",
        LastName = "Santos",
        ContactNumber = "0917-123-4567",
        DateOfBirth = new DateOnly(1984, 3, 12),
        Gender = "Female",
        SyncPatientId = syncPatientId
    };

    public static StaffMember NewDoctor(Guid clinicId, string tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ClinicId = clinicId,
        FirstName = "Ana",
        LastName = "Cruz",
        Title = "Dr.",
        Role = StaffRole.Doctor,
        PrcLicenseNumber = "0123456",
        Specialty = "Internal Medicine"
    };

    public static ClinicLabOrder NewLabOrder(Guid clinicId, string tenantId, Guid patientId, string orderNumber = "LAB-20261009-001") => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ClinicId = clinicId,
        OrderNumber = orderNumber,
        PatientId = patientId,
        PatientName = "Maria Santos",
        Items = new List<ClinicLabOrderItem> { new() { TestName = "CBC", Category = "Hematology" } }
    };
}
