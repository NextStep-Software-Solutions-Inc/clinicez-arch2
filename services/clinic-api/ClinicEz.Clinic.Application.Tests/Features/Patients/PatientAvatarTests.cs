using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public sealed class PatientAvatarTests
{
    [Fact]
    public void Resolver_ReturnsStreamUrlWithVersionForEncryptedAvatar_AndDirectUrlForExternal()
    {
        var pid = Guid.NewGuid();
        PatientAvatarUrlResolver.Resolve(pid, "tenants/t1/clinics/c1/patients/p1/avatar.cez", "AES-256-GCM", "abcdef1234567890")
            .Should().Be($"/api/v1/patients/{pid:D}/avatar?v=abcdef123456");

        PatientAvatarUrlResolver.Resolve(pid, "https://images.clerk.dev/oauth_google/img_1", "NONE", null)
            .Should().Be("https://images.clerk.dev/oauth_google/img_1");

        PatientAvatarUrlResolver.Resolve(pid, "   ", "NONE", null)
            .Should().BeNull();
    }

    [Fact]
    public async Task DownloadPatientAvatar_DecryptsEncryptedR2Avatar_AndEnforcesClinicIsolation()
    {
        var clinicId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var expectedPlaintext = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 };

        var patient = new Patient
        {
            Id = patientId,
            TenantId = "tenant-1",
            ClinicId = clinicId,
            PatientCode = "V1-000101",
            FirstName = "Jane",
            LastName = "Doe",
            ContactNumber = "09170000001",
            AvatarUrl = $"tenants/tenant-1/clinics/{clinicId}/patients/{patientId}/avatar.cez",
            AvatarContentType = "image/jpeg",
            AvatarEncryptionAlgorithm = "AES-256-GCM",
            AvatarEncryptionIvBase64 = "iv-b64",
            AvatarEncryptionTagBase64 = "tag-b64",
            AvatarWrappedKeyJson = "{\"k\":\"v\"}",
            AvatarEncryptedHash = "hash1234567890ab"
        };

        var repo = Substitute.For<IRepository<Patient>>();
        repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>()).Returns(patient);

        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(clinicId);
        ctx.TenantId.Returns("tenant-1");

        var storage = Substitute.For<IClinicStorageService>();
        storage.FileExistsAsync(patient.AvatarUrl!, Arg.Any<CancellationToken>()).Returns(true);
        storage.ReadEncryptedFileAsync(patient.AvatarUrl!, Arg.Any<CancellationToken>())
            .Returns(new byte[] { 1, 2, 3 });

        var crypto = Substitute.For<IClinicEncryptionService>();
        crypto.DecryptAsync(Arg.Any<byte[]>(), "iv-b64", "tag-b64", "{\"k\":\"v\"}", "tenant-1", clinicId, Arg.Any<CancellationToken>())
            .Returns(expectedPlaintext);

        var handler = new DownloadPatientAvatarQueryHandler(repo, ctx, crypto, storage);
        var result = await handler.Handle(new DownloadPatientAvatarQuery(patientId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.FileBytes.Should().Equal(expectedPlaintext);
        result.ContentType.Should().Be("image/jpeg");
        result.ETag.Should().Be("hash1234567890ab");

        // Cross-clinic isolation check
        ctx.ClinicId.Returns(otherClinicId);
        var crossClinic = await handler.Handle(new DownloadPatientAvatarQuery(patientId), CancellationToken.None);
        crossClinic.Should().BeNull();
    }
}
