using ClinicEz.PhilHealthProxy.Application.Features.Yakap.Commands.GenerateAndSubmitReport;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Domain.Models.Yakap;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Handlers;

public sealed class GenerateAndSubmitReportCommandHandlerTests
{
    private readonly ICurrentTenant _currentTenant = Substitute.For<ICurrentTenant>();
    private readonly ITenantRepository _tenantRepository = Substitute.For<ITenantRepository>();
    private readonly IDataProtectionProvider _dataProtectionProvider = Substitute.For<IDataProtectionProvider>();
    private readonly IDataProtector _protector = Substitute.For<IDataProtector>();
    private readonly IKonsultaXmlGenerator _xmlGenerator = Substitute.For<IKonsultaXmlGenerator>();
    private readonly IKonsultaXmlValidator _xmlValidator = Substitute.For<IKonsultaXmlValidator>();
    private readonly IPhilHealthPayloadEncryptor _encryptor = Substitute.For<IPhilHealthPayloadEncryptor>();
    private readonly IPhilHealthSoapClient _soapClient = Substitute.For<IPhilHealthSoapClient>();

    public GenerateAndSubmitReportCommandHandlerTests()
    {
        _dataProtectionProvider.CreateProtector(Arg.Any<string>()).Returns(_protector);
        _protector.Unprotect(Arg.Any<byte[]>()).Returns(System.Text.Encoding.UTF8.GetBytes("TEST-CIPHER-KEY"));
    }

    [Fact]
    public async Task Handle_ShouldGenerateValidateEncryptAndSubmitReport()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        _currentTenant.TenantId.Returns(tenantId);
        _tenantRepository.GetByTenantIdAsync(tenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = tenantId,
                EncryptedCipherKey = "MTIzNDU2NzgxMjM0NTY3OA"
            });

        var doc = new YakapReportDocument(
            Username: "H90000001",
            Password: "password",
            HciAccreNo: "H90000001",
            PmccNo: "P00001",
            CertificationId: "KON-CERT-1",
            HciTransmittalNumber: "RH9000000120261000001",
            Enlistments: Array.Empty<YakapEnlistment>(),
            Profiles: Array.Empty<YakapProfile>(),
            Soaps: Array.Empty<YakapSoap>(),
            DiagnosticResults: Array.Empty<YakapDiagnosticResult>(),
            Medicines: Array.Empty<YakapMedicine>());

        const string rawXml = "<PCB pHciTransmittalNumber=\"RH9000000120261000001\" />";
        _xmlGenerator.GenerateTranche2Xml(doc).Returns(rawXml);
        _xmlValidator.ValidateReportXml(rawXml).Returns(XmlValidationResult.Success());
        _encryptor.EncryptPayload(rawXml, Arg.Any<string>()).Returns("{\"doc\":\"encrypted\"}");
        _soapClient.SubmitReportAsync("RH9000000120261000001", "{\"doc\":\"encrypted\"}", "2", Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>TX-20261001-998877</return>", null, null));

        var handler = new GenerateAndSubmitReportCommandHandler(
            _currentTenant,
            _tenantRepository,
            _dataProtectionProvider,
            _xmlGenerator,
            _xmlValidator,
            _encryptor,
            _soapClient);

        // Act
        var result = await handler.Handle(
            new GenerateAndSubmitReportCommand { Document = doc, ReportTagging = "2" },
            CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data!.IsSuccess.Should().BeTrue();
        result.Data.TransmittalNumber.Should().Be("RH9000000120261000001");
        result.Data.TransactionNumber.Should().Be("TX-20261001-998877");
        result.Data.RawXml.Should().Be(rawXml);
    }
}
