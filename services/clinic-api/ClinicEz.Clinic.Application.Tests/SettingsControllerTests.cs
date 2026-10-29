using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class SettingsControllerTests
{
    private readonly ISender _sender = Substitute.For<ISender>();
    private readonly IClinicDocumentPdfService _pdfService = Substitute.For<IClinicDocumentPdfService>();
    private readonly ISampleDocumentGenerator _sampleGenerator = Substitute.For<ISampleDocumentGenerator>();

    [Fact]
    public async Task DownloadSampleDocumentPdf_WhenGeneratorAvailable_ReturnsFileResult()
    {
        var sampleBytes = Encoding.UTF8.GetBytes("%PDF-1.4 sample");
        _sampleGenerator.GenerateSamplePdf(
            Arg.Any<string>(),
            Arg.Any<bool>(),
            Arg.Any<string?>(),
            Arg.Any<FacilitySettings>())
            .Returns((sampleBytes, "Sample-MedicalCertificate.pdf"));

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.TenantId.Returns("test-tenant");
        clinicContext.ClinicId.Returns(Guid.NewGuid());

        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = new Repository<FacilitySettings>(context, sieve);

        var controller = new SettingsController(_sender, _pdfService, settingsRepo, _sampleGenerator);

        var result = await controller.DownloadSampleDocumentPdf("Medical Certificate", false, "Letter", CancellationToken.None);

        var fileResult = result.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().Be("Sample-MedicalCertificate.pdf");
        fileResult.FileContents.Should().Equal(sampleBytes);
    }

    [Fact]
    public async Task DownloadSampleDocumentPdf_WhenGeneratorMissing_Returns503()
    {
        var controller = new SettingsController(_sender, _pdfService, null, null);

        var result = await controller.DownloadSampleDocumentPdf("Medical Certificate", false, null, CancellationToken.None);

        var statusResult = result.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(503);
    }

    [Fact]
    public async Task DownloadReceptionPlacardPdf_WhenPdfServiceAvailable_ReturnsFileResult()
    {
        var placardBytes = Encoding.UTF8.GetBytes("%PDF-1.4 placard");
        _pdfService.GenerateReceptionPlacardPdf(
            Arg.Any<FacilitySettings>(),
            Arg.Any<string>(),
            Arg.Any<string?>(),
            Arg.Any<string?>())
            .Returns(placardBytes);

        var controller = new SettingsController(_sender, _pdfService, null, _sampleGenerator);

        var result = await controller.DownloadReceptionPlacardPdf("https://example.com/qr", "1234", "Tomorrow", CancellationToken.None);

        var fileResult = result.Should().BeOfType<FileContentResult>().Subject;
        fileResult.ContentType.Should().Be("application/pdf");
        fileResult.FileDownloadName.Should().Be("ReceptionPlacard.pdf");
        fileResult.FileContents.Should().Equal(placardBytes);
    }

    [Fact]
    public async Task DownloadReceptionPlacardPdf_WhenPdfServiceMissing_Returns503()
    {
        var controller = new SettingsController(_sender, null, null, _sampleGenerator);

        var result = await controller.DownloadReceptionPlacardPdf(null, null, null, CancellationToken.None);

        var statusResult = result.Should().BeOfType<ObjectResult>().Subject;
        statusResult.StatusCode.Should().Be(503);
    }
}
