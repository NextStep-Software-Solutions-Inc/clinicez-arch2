using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Helpers;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Patients.Queries.StreamPatientAvatar;
using ClinicEz.Patient.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;
using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;

namespace ClinicEz.Patient.Application.Tests.Features.Patients;

public sealed class PatientAvatarStreamTests
{
    [Fact]
    public void Resolver_ReturnsStreamUrlForEncrypted_AndPassthroughForExternal()
    {
        var pid = Guid.NewGuid();
        PatientAvatarUrlResolver.Resolve(pid, $"patients/{pid}/avatar/{pid}.cez", "AES-256-GCM", "0123456789abcdef")
            .Should().Be($"/api/v1/patients/{pid:D}/avatar?v=0123456789ab");

        PatientAvatarUrlResolver.Resolve(pid, "https://images.clerk.dev/uploaded/img_2", "NONE", null)
            .Should().Be("https://images.clerk.dev/uploaded/img_2");
    }

    [Fact]
    public async Task StreamPatientAvatar_DecryptsPmkR2Avatar()
    {
        var pid = Guid.NewGuid();
        var expectedBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47 };
        var patient = new PatientEntity
        {
            Id = pid,
            ClinicEzId = "CE-TEST-0001",
            FirstName = "Ana",
            LastName = "Reyes",
            AvatarUrl = $"patients/{pid}/avatar/{pid}.cez",
            AvatarContentType = "image/png",
            AvatarEncryptionAlgorithm = "AES-256-GCM",
            AvatarEncryptionIvBase64 = "iv-p",
            AvatarEncryptionTagBase64 = "tag-p",
            AvatarWrappedKeyJson = "{\"pmk\":1}",
            AvatarEncryptedHash = "fedcba9876543210"
        };

        var repo = Substitute.For<IPatientRepository>();
        repo.GetByIdAsync(pid, Arg.Any<CancellationToken>()).Returns(patient);

        var storage = Substitute.For<IStorageService>();
        storage.OpenReadStreamAsync(patient.AvatarUrl!, Arg.Any<CancellationToken>())
            .Returns(new MemoryStream(new byte[] { 9, 8, 7 }));

        var crypto = Substitute.For<IPatientEncryptionService>();
        crypto.DecryptToStreamAsync(Arg.Any<Stream>(), "iv-p", "tag-p", "{\"pmk\":1}", pid, Arg.Any<CancellationToken>())
            .Returns(new MemoryStream(expectedBytes));

        var handler = new StreamPatientAvatarQueryHandler(repo, crypto, storage);
        var result = await handler.Handle(new StreamPatientAvatarQuery(pid), CancellationToken.None);

        result.ContentType.Should().Be("image/png");
        result.ETag.Should().Be("fedcba9876543210");
        using var ms = new MemoryStream();
        await result.Stream.CopyToAsync(ms);
        ms.ToArray().Should().Equal(expectedBytes);
    }
}
