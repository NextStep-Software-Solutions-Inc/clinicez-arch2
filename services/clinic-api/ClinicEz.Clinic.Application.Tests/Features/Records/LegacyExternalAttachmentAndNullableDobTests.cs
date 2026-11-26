using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Records.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Records;

public sealed class LegacyExternalAttachmentAndNullableDobTests
{
    [Theory]
    [InlineData("https://clinicezstorage.blob.core.windows.net/records/abc.pdf")]
    [InlineData("https://clinicez.blob.core.windows.net/files/xray.png")]
    [InlineData("https://drive.google.com/uc?id=12345")]
    [InlineData("https://docs.google.com/document/d/abc")]
    [InlineData("https://lh3.googleusercontent.com/d/xyz")]
    public async Task DownloadAttachment_WhenLegacyNoneAndAllowlistedHttps_ReturnsExternalRedirectWithoutReadingStorage(string legacyUrl)
    {
        var clinicId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var attachment = new RecordAttachment
        {
            Id = attachmentId,
            ClinicId = clinicId,
            TenantId = "tenant-1",
            Title = "Legacy Record",
            FileName = "legacy.pdf",
            ContentType = "application/pdf",
            StorageUri = legacyUrl,
            EncryptionAlgorithm = "NONE"
        };

        var repo = Substitute.For<IRepository<RecordAttachment>>();
        repo.GetByIdAsync(attachmentId, Arg.Any<CancellationToken>()).Returns(attachment);

        var clinicCtx = Substitute.For<IClinicContext>();
        clinicCtx.ClinicId.Returns(clinicId);
        clinicCtx.TenantId.Returns("tenant-1");

        var encryption = Substitute.For<IClinicEncryptionService>();
        var storage = Substitute.For<IClinicStorageService>();

        var handler = new DownloadRecordAttachmentQueryHandler(repo, clinicCtx, encryption, storage);
        var result = await handler.Handle(new DownloadRecordAttachmentQuery(attachmentId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.ExternalRedirectUrl.Should().Be(legacyUrl);
        result.FileBytes.Should().BeEmpty();
        result.FileName.Should().Be("legacy.pdf");
        result.ContentType.Should().Be("application/pdf");
        await storage.DidNotReceiveWithAnyArgs().FileExistsAsync(default!, default);
    }

    [Theory]
    [InlineData("http://clinicezstorage.blob.core.windows.net/records/abc.pdf")]
    [InlineData("https://evil.example.com/phishing.pdf")]
    [InlineData("javascript:alert(1)")]
    [InlineData("file:///etc/passwd")]
    public async Task DownloadAttachment_WhenLegacyNoneAndDisallowedOrHttpUrl_DoesNotRedirect(string unsafeUrl)
    {
        var clinicId = Guid.NewGuid();
        var attachmentId = Guid.NewGuid();
        var attachment = new RecordAttachment
        {
            Id = attachmentId,
            ClinicId = clinicId,
            TenantId = "tenant-1",
            Title = "Unsafe Record",
            FileName = "bad.pdf",
            ContentType = "application/pdf",
            StorageUri = unsafeUrl,
            EncryptionAlgorithm = "NONE"
        };

        var repo = Substitute.For<IRepository<RecordAttachment>>();
        repo.GetByIdAsync(attachmentId, Arg.Any<CancellationToken>()).Returns(attachment);

        var clinicCtx = Substitute.For<IClinicContext>();
        clinicCtx.ClinicId.Returns(clinicId);

        var encryption = Substitute.For<IClinicEncryptionService>();
        var storage = Substitute.For<IClinicStorageService>();
        storage.FileExistsAsync(unsafeUrl, Arg.Any<CancellationToken>()).Returns(false);

        var handler = new DownloadRecordAttachmentQueryHandler(repo, clinicCtx, encryption, storage);
        var result = await handler.Handle(new DownloadRecordAttachmentQuery(attachmentId), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public void NullableDateOfBirth_MapsCleanlyWithoutFabricatedAgeOrSeniorFlag()
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = "ustp-cdo",
            ClinicId = Guid.NewGuid(),
            PatientCode = "USTP-0001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = null,
            Sex = BiologicalSex.Male,
            ContactNumber = "09171234567"
        };

        var dto = RegisterClinicPatientCommandHandler.MapToDto(patient, null, null);
        dto.DateOfBirth.Should().BeNull();
        dto.Age.Should().BeNull();

        var staticCtx = PatientStaticContext.FromPatient(patient);
        staticCtx.DateOfBirth.Should().BeNull();
        staticCtx.Age.Should().BeNull();

        PatientPriorityHelper.IsSeniorOrPwd(patient, new DateOnly(2026, 11, 25)).Should().BeFalse();

        patient.SeniorCitizenId = "OSCA-12345";
        PatientPriorityHelper.IsSeniorOrPwd(patient, new DateOnly(2026, 11, 25)).Should().BeTrue();
    }
}
